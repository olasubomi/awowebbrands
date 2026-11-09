'use strict';
const { randomBytes, createHash, randomUUID } = require('node:crypto');
const { seal, unseal } = require('./jira-service');
const digest = s => createHash('sha256').update(s).digest('hex');
class GoogleCalendarError extends Error { constructor(code, status = 503, uncertain = false) { super(code); this.code = code; this.status = status; this.uncertain = uncertain; } }
function googleCalendarConfig(env, origin) {
  if (env.SWS_GOOGLE_CALENDAR_ENABLED !== 'true') return null;
  const key = Buffer.from(env.SWS_GOOGLE_CALENDAR_ENCRYPTION_KEY || '', 'base64');
  if (!origin?.startsWith('https://') || !env.SWS_GOOGLE_CALENDAR_CLIENT_ID || !env.SWS_GOOGLE_CALENDAR_CLIENT_SECRET || key.length !== 32 || key.toString('base64') !== env.SWS_GOOGLE_CALENDAR_ENCRYPTION_KEY) throw new GoogleCalendarError('SETUP_REQUIRED');
  return { key, clientId: env.SWS_GOOGLE_CALENDAR_CLIENT_ID, clientSecret: env.SWS_GOOGLE_CALENDAR_CLIENT_SECRET, callback: origin + '/api/workspace/google-calendar/callback' };
}
function createGoogleCalendarService(config, store, request = fetch) {
  const aad = user => 'google-calendar:' + user;
  async function call(url, options = {}) {
    let r; try { r = await request(url, { ...options, signal: AbortSignal.timeout(10000), redirect: 'error' }); } catch (_) { throw new GoogleCalendarError('GOOGLE_UNAVAILABLE', 503, true); }
    if (!r.ok) {
      // Classify only documented OAuth error names. Never surface provider bodies,
      // authorization codes, tokens, credentials or error_description values.
      if (url === 'https://oauth2.googleapis.com/token' && [400, 401].includes(r.status)) {
        let oauth; try { const body = await r.text(); if (body.length <= 16384) oauth = JSON.parse(body).error; } catch (_) {}
        const codes = { invalid_client: 'GOOGLE_CLIENT', unauthorized_client: 'GOOGLE_CLIENT', invalid_grant: 'GOOGLE_GRANT', redirect_uri_mismatch: 'GOOGLE_REDIRECT' };
        throw new GoogleCalendarError(Object.hasOwn(codes, oauth) ? codes[oauth] : 'GOOGLE_RECONNECT', 409);
      }
      const code = r.status === 401 || (url.endsWith('/token') && r.status === 400) ? 'GOOGLE_RECONNECT' : r.status === 403 ? 'GOOGLE_PERMISSION' : r.status === 404 ? 'GOOGLE_NOT_FOUND' : r.status === 409 ? 'GOOGLE_CONFLICT' : r.status === 429 ? 'GOOGLE_RATE_LIMIT' : 'GOOGLE_UNAVAILABLE';
      throw new GoogleCalendarError(code, code === 'GOOGLE_RECONNECT' || code === 'GOOGLE_CONFLICT' ? 409 : r.status === 403 || r.status === 404 || r.status === 429 ? r.status : 503, r.status >= 500);
    }
    if (r.status === 204) return {};
    let text; try { text = await r.text(); } catch (_) { throw new GoogleCalendarError('GOOGLE_UNAVAILABLE', 503, true); }
    if (text.length > 2e6) throw new GoogleCalendarError('GOOGLE_UNAVAILABLE');
    try { return JSON.parse(text); } catch (_) { throw new GoogleCalendarError('GOOGLE_UNAVAILABLE', 503, true); }
  }
  async function exchange(body, previousRefresh) {
    const t = await call('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...body }).toString() });
    if (typeof t.access_token !== 'string' || !t.access_token || typeof (t.refresh_token || previousRefresh) !== 'string' || !Number.isFinite(t.expires_in) || t.expires_in < 60 || t.expires_in > 86400) throw new GoogleCalendarError('GOOGLE_TOKEN_RESPONSE', 409);
    return { access: t.access_token, refresh: t.refresh_token || previousRefresh, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  }
  async function locked(key, fn) { const lease = await store.lock(key); if (!lease) throw new GoogleCalendarError('GOOGLE_BUSY', 409); try { return await fn(lease); } finally { await lease.release(); } }
  async function withConnection(user, fn) {
    return locked(user, async lease => {
      let token; try { token = unseal(config.key, aad(user), lease.record.encrypted); } catch (_) { throw new GoogleCalendarError('GOOGLE_RECONNECT', 409); }
      if (!(new Date(token.expiresAt).getTime() > Date.now() + 60000)) {
        token = await exchange({ grant_type: 'refresh_token', refresh_token: token.refresh }, token.refresh);
        await lease.save({ encrypted: seal(config.key, aad(user), token), expiresAt: token.expiresAt });
      }
      const api = (path, method = 'GET', body) => call('https://www.googleapis.com/calendar/v3' + path, { method, headers: { Authorization: 'Bearer ' + token.access, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return fn(api, lease);
    });
  }
  return {
    async status(user) { const c = await store.getConnection(user); return { configured: true, connected: !!c?.encrypted, email: c?.encrypted ? c.googleEmail : null, calendarReady: !!c?.encrypted && !!c.calendarId, supportsMeet: !!c?.supportsMeet, calendarCreationUnknown: c?.calendarCreation === 'unknown' || c?.calendarCreation === 'pending' }; },
    async start(user, session) {
      const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
      await store.putState({ _id: digest(state), userId: user, sessionId: digest(session), verifier: seal(config.key, aad(user), { verifier }), expiresAt: new Date(Date.now() + 600000) });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback, response_type: 'code', scope: 'openid email https://www.googleapis.com/auth/calendar.app.created', access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      return { url: url.toString() };
    },
    async callback(user, session, state, code) {
      let stage = 'state';
      try {
        const record = await store.consumeState(digest(state), user, digest(session)); if (!record) throw new GoogleCalendarError('GOOGLE_STATE', 400);
        stage = 'connection';
        return await locked(user, async lease => {
          stage = 'verifier';
          const { verifier } = unseal(config.key, aad(user), record.verifier);
          stage = 'token';
          const token = await exchange({ grant_type: 'authorization_code', code, redirect_uri: config.callback, code_verifier: verifier });
          stage = 'profile';
          const profile = await call('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + token.access } });
          if (typeof profile.sub !== 'string' || !profile.sub || typeof profile.email !== 'string' || profile.email_verified !== true) throw new GoogleCalendarError('GOOGLE_PERMISSION', 403);
          const sameAccount = lease.record.googleSubject === profile.sub;
          stage = 'save';
          await lease.save({ encrypted: seal(config.key, aad(user), token), expiresAt: token.expiresAt, googleSubject: profile.sub, googleEmail: profile.email, ...(!sameAccount ? { calendarId: null, supportsMeet: false, calendarCreation: null } : {}) });
          stage = 'release';
        });
      } catch (e) {
        const safe = e instanceof GoogleCalendarError ? e : new GoogleCalendarError('GOOGLE_UNAVAILABLE');
        safe.stage = stage;
        throw safe;
      }
    },
    async disconnect(user) { await locked(user, async lease => { await lease.disconnect(); }); },
    async recoverCalendar(user, calendarId) {
      return withConnection(user, async (api, lease) => {
        if (lease.record.calendarId && lease.record.calendarId !== calendarId) throw new GoogleCalendarError('GOOGLE_OWNER', 403);
        const result = await api('/calendars/' + encodeURIComponent(calendarId));
        if (result.id !== calendarId) throw new GoogleCalendarError('GOOGLE_PERMISSION', 403);
        await lease.save({ calendarId, calendarCreation: 'complete', supportsMeet: result.conferenceProperties?.allowedConferenceSolutionTypes?.includes('hangoutsMeet') || false });
        return { calendarReady: true };
      });
    },
    async createCalendar(user) {
      return withConnection(user, async (api, lease) => {
        if (lease.record.calendarId) return { calendarReady: true };
        if (['unknown', 'pending'].includes(lease.record.calendarCreation)) throw new GoogleCalendarError('GOOGLE_CALENDAR_UNKNOWN', 409);
        await lease.save({ calendarCreation: 'pending' });
        let result;
        try { result = await api('/calendars', 'POST', { summary: 'SWS Community Events', description: 'Events created through Soft Web Services.' }); }
        catch (e) { await lease.save({ calendarCreation: e.uncertain ? 'unknown' : null }); throw e; }
        if (typeof result.id !== 'string' || !result.id) { await lease.save({ calendarCreation: 'unknown' }); throw new GoogleCalendarError('GOOGLE_CALENDAR_UNKNOWN', 409); }
        await lease.save({ calendarId: result.id, calendarCreation: 'complete', supportsMeet: result.conferenceProperties?.allowedConferenceSolutionTypes?.includes('hangoutsMeet') || false });
        return { calendarReady: true };
      });
    },
    async sync(user, data, id, version, withMeet) {
      return locked('event:' + id, async () => {
        const event = await data.get(id);
        if (!event || event.version !== version) throw new GoogleCalendarError('GOOGLE_EVENT_CHANGED', 409);
        if (event.googleCalendar?.ownerId && event.googleCalendar.ownerId !== user) throw new GoogleCalendarError('GOOGLE_OWNER', 403);
        return withConnection(user, async (api, lease) => {
          const calendarId = lease.record.calendarId; if (!calendarId) throw new GoogleCalendarError('GOOGLE_CALENDAR_REQUIRED', 409);
          if (event.googleCalendar && event.googleCalendar.calendarId !== calendarId) throw new GoogleCalendarError('GOOGLE_OWNER', 403);
          const calendarData = await api('/calendars/' + encodeURIComponent(calendarId));
          const supportsMeet = calendarData.conferenceProperties?.allowedConferenceSolutionTypes?.includes('hangoutsMeet') || false;
          await lease.save({ supportsMeet });
          if (withMeet && !supportsMeet && event.status !== 'cancelled') throw new GoogleCalendarError('GOOGLE_MEET_UNAVAILABLE', 422);
          const googleId = 'c' + id.replace(/-/g, ''), path = '/calendars/' + encodeURIComponent(calendarId) + '/events/' + googleId;
          let previous;
          try { previous = await api(path); } catch (e) { if (e.code !== 'GOOGLE_NOT_FOUND') throw e; }
          if (previous && (previous.extendedProperties?.private?.swsEventId !== id || previous.extendedProperties?.private?.swsOwnerId !== user)) throw new GoogleCalendarError('GOOGLE_OWNER', 403);
          if (!previous && event.status === 'cancelled') throw new GoogleCalendarError('GOOGLE_CANCELLED_UNLINKED', 409);
          const oldMeet = previous?.conferenceData?.createRequest?.status?.statusCode;
          const pending = oldMeet === 'pending';
          const hasMeet = previous?.hangoutLink || previous?.conferenceData?.entryPoints?.some(e => e.entryPointType === 'video');
          const body = { summary: event.title, description: event.description, start: { dateTime: new Date(event.startsAt).toISOString(), timeZone: event.timezone }, end: { dateTime: new Date(event.endsAt).toISOString(), timeZone: event.timezone }, status: event.status === 'cancelled' ? 'cancelled' : 'confirmed', extendedProperties: { private: { swsEventId: id, swsOwnerId: user } }, ...(withMeet && !pending && !hasMeet && event.status !== 'cancelled' ? { conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}) };
          let remote;
          try { remote = await api(previous ? path + '?conferenceDataVersion=1&sendUpdates=none' : '/calendars/' + encodeURIComponent(calendarId) + '/events?conferenceDataVersion=1&sendUpdates=none', previous ? 'PATCH' : 'POST', { ...body, ...(!previous ? { id: googleId } : {}) }); }
          catch (e) {
            if (e.code !== 'GOOGLE_CONFLICT') throw e;
            remote = await api(path);
            if (remote.extendedProperties?.private?.swsEventId !== id || remote.extendedProperties?.private?.swsOwnerId !== user) throw new GoogleCalendarError('GOOGLE_OWNER', 403);
            const { conferenceData, ...currentFields } = body;
            remote = await api(path + '?conferenceDataVersion=1&sendUpdates=none', 'PATCH', currentFields);
          }
          const meetCandidate = remote.hangoutLink || remote.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri;
          let meetingUrl = event.meetingUrl, calendarUrl = null;
          if (typeof meetCandidate === 'string') { try { const u = new URL(meetCandidate); if (u.protocol === 'https:' && u.hostname === 'meet.google.com' && !u.username && !u.password) meetingUrl = u.href; } catch (_) {} }
          if (typeof remote.htmlLink === 'string') { try { const u = new URL(remote.htmlLink); if (u.protocol === 'https:' && ['calendar.google.com', 'www.google.com'].includes(u.hostname) && !u.username && !u.password) calendarUrl = u.href; } catch (_) {} }
          const meetStatus = remote.conferenceData?.createRequest?.status?.statusCode || (remote.hangoutLink ? 'success' : 'none');
          const result = await data.update(id, { meetingUrl, googleCalendar: { ownerId: user, calendarId, eventId: googleId, url: calendarUrl, meetStatus, swsVersion: version + 1, syncedAt: new Date() } }, version, user);
          if (!result) throw new GoogleCalendarError('GOOGLE_EVENT_CHANGED', 409);
          return { event: result, meetStatus };
        });
      });
    }
  };
}
module.exports = { googleCalendarConfig, createGoogleCalendarService, GoogleCalendarError };
