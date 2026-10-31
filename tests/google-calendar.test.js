'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { googleCalendarConfig, createGoogleCalendarService } = require('../lib/google-calendar-service');
function fixture(overrides = {}) {
  const config = googleCalendarConfig({ SWS_GOOGLE_CALENDAR_ENABLED: 'true', SWS_GOOGLE_CALENDAR_CLIENT_ID: 'client', SWS_GOOGLE_CALENDAR_CLIENT_SECRET: 'private-secret', SWS_GOOGLE_CALENDAR_ENCRYPTION_KEY: randomBytes(32).toString('base64') }, 'https://sws.example.com');
  const states = new Map(), connections = new Map(), held = new Set(), remote = new Map(), calls = [];
  let meetPending = false, uncertain = false;
  const store = {
    async putState(s) { states.set(s._id, s); },
    async consumeState(id, userId, sessionId) { const s = states.get(id); if (!s || s.userId !== userId || s.sessionId !== sessionId || s.expiresAt <= new Date()) return null; states.delete(id); return s; },
    async getConnection(id) { return connections.get(id); },
    async lock(id) { if (held.has(id)) return null; held.add(id); let record = connections.get(id) || {}; return { record, async save(data) { record = { ...record, ...data }; connections.set(id, record); }, async disconnect() { await this.save({ encrypted: null }); }, async release() { held.delete(id); } }; }
  };
  const request = async (url, options) => {
    calls.push({ url, ...options });
    if (overrides.request) { const response = await overrides.request(url, options); if (response) return response; }
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 3600 }));
    if (url.includes('/userinfo')) return new Response(JSON.stringify({ sub: 'google-owner', email: 'organizer@example.com', email_verified: true }));
    if (url.endsWith('/calendars') && options.method === 'POST') { if (uncertain) throw Error('timeout'); return new Response(JSON.stringify({ id: 'sws-calendar', conferenceProperties: { allowedConferenceSolutionTypes: ['hangoutsMeet'] } })); }
    if (url.endsWith('/calendars/sws-calendar')) return new Response(JSON.stringify({ id: 'sws-calendar', conferenceProperties: { allowedConferenceSolutionTypes: ['hangoutsMeet'] } }));
    const id = url.includes('/events/') ? url.split('/events/')[1].split('?')[0] : JSON.parse(options.body || '{}').id;
    if (options.method === 'GET') return remote.has(id) ? new Response(JSON.stringify(remote.get(id))) : new Response('{}', { status: 404 });
    const body = JSON.parse(options.body), value = { ...(remote.get(id) || {}), ...body, id, htmlLink: 'https://calendar.google.com/calendar/event?eid=test', ...(body.conferenceData ? (meetPending ? { conferenceData: { createRequest: { status: { statusCode: 'pending' } } } } : { hangoutLink: 'https://meet.google.com/abc-defg-hij', conferenceData: { createRequest: { status: { statusCode: 'success' } } } }) : {}) };
    remote.set(id, value); return new Response(JSON.stringify(value));
  };
  const service = createGoogleCalendarService(config, store, request);
  async function connect() { const { url } = await service.start('u', 's'); await service.callback('u', 's', new URL(url).searchParams.get('state'), 'code'); }
  const event = { _id: randomUUID(), title: 'Engineering session', description: 'Community', startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 7200000), timezone: 'America/Los_Angeles', status: 'scheduled', meetingUrl: '', version: 0 };
  const data = { async get() { return event; }, async update(id, fields, version) { if (version !== event.version) return null; Object.assign(event, fields, { version: version + 1 }); return event; } };
  return { config, service, store, states, connections, held, remote, calls, connect, data, event, setPending: v => { meetPending = v; }, setUncertain: v => { uncertain = v; } };
}
test('Google config fails closed; OAuth is scoped to app-created calendars with single-use session-bound state and PKCE', async () => {
  assert.equal(googleCalendarConfig({}, 'https://sws.example.com'), null); assert.throws(() => googleCalendarConfig({ SWS_GOOGLE_CALENDAR_ENABLED: 'true' }, 'https://sws.example.com'));
  const f = fixture(), url = new URL((await f.service.start('u', 's')).url), state = url.searchParams.get('state');
  assert.equal(url.origin, 'https://accounts.google.com'); assert.match(url.searchParams.get('scope'), /calendar.app.created/); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(!JSON.stringify([...f.states.values()]).includes(state));
  await assert.rejects(f.service.callback('other', 's', state, 'code'), { code: 'GOOGLE_STATE' }); await assert.rejects(f.service.callback('u', 'other', state, 'code'), { code: 'GOOGLE_STATE' });
  await f.service.callback('u', 's', state, 'code'); await assert.rejects(f.service.callback('u', 's', state, 'code'), { code: 'GOOGLE_STATE' });
  assert.ok(!JSON.stringify(f.connections.get('u')).includes('private-access')); assert.ok(!JSON.stringify(await f.service.status('u')).includes('private-refresh'));
  const tokenCall = f.calls.find(c => c.url.endsWith('/token')); assert.ok(new URLSearchParams(tokenCall.body).get('code_verifier'));
});
test('business calendar creation is explicit and not repeated; ambiguous failures stop duplicate calendar creation', async () => {
  const f = fixture(); await f.connect(); assert.equal(f.calls.filter(c => c.url.endsWith('/calendars')).length, 0);
  await f.service.createCalendar('u'); await f.service.createCalendar('u'); assert.equal(f.calls.filter(c => c.url.endsWith('/calendars')).length, 1);
  const uncertain = fixture(); await uncertain.connect(); uncertain.setUncertain(true); await assert.rejects(uncertain.service.createCalendar('u'), { code: 'GOOGLE_UNAVAILABLE' });
  assert.equal((await uncertain.service.status('u')).calendarCreationUnknown, true); await assert.rejects(uncertain.service.createCalendar('u'), { code: 'GOOGLE_CALENDAR_UNKNOWN' }); assert.equal(uncertain.calls.filter(c => c.url.endsWith('/calendars')).length, 1);
});
test('Calendar/Meet sync uses stable event ID, creates no attendees, updates SWS link, and does not duplicate on retry', async () => {
  const f = fixture(); await f.connect(); await f.service.createCalendar('u');
  const first = await f.service.sync('u', f.data, f.event._id, 0, true); assert.equal(first.meetStatus, 'success'); assert.equal(f.event.meetingUrl, 'https://meet.google.com/abc-defg-hij'); assert.equal(f.event.googleCalendar.ownerId, 'u'); assert.equal(f.event.googleCalendar.swsVersion, f.event.version);
  const create = f.calls.find(c => c.url.includes('/events?')); const body = JSON.parse(create.body); assert.equal(body.id, 'c' + f.event._id.replace(/-/g, '')); assert.equal(body.attendees, undefined); assert.ok(create.url.includes('conferenceDataVersion=1')); assert.ok(body.conferenceData.createRequest.requestId);
  await f.service.sync('u', f.data, f.event._id, 1, true); assert.equal(f.calls.filter(c => c.url.includes('/events?')).length, 1); assert.equal(f.remote.size, 1);
  const patch = f.calls.find(c => c.method === 'PATCH'); assert.equal(JSON.parse(patch.body).conferenceData, undefined);
  await assert.rejects(f.service.sync('other-user', f.data, f.event._id, f.event.version, true), { code: 'GOOGLE_OWNER' });
  await assert.rejects(f.service.sync('u', f.data, f.event._id, 0, true), { code: 'GOOGLE_EVENT_CHANGED' });
});
test('pending Meet request is reused instead of creating another conference; disconnect keeps remote events', async () => {
  const f = fixture(); await f.connect(); await f.service.createCalendar('u'); f.setPending(true);
  assert.equal((await f.service.sync('u', f.data, f.event._id, 0, true)).meetStatus, 'pending');
  await f.service.sync('u', f.data, f.event._id, f.event.version, true); const patches = f.calls.filter(c => c.method === 'PATCH'); assert.equal(JSON.parse(patches.at(-1).body).conferenceData, undefined);
  await f.service.disconnect('u'); assert.equal((await f.service.status('u')).connected, false); assert.equal(f.remote.size, 1);
  await assert.rejects(f.service.sync('u', f.data, f.event._id, f.event.version, true), { code: 'GOOGLE_RECONNECT' });
});
test('event conflict after Google save preserves remote event and retry reuses it', async () => {
  const f = fixture(); await f.connect(); await f.service.createCalendar('u'); const update = f.data.update; f.data.update = async () => null;
  await assert.rejects(f.service.sync('u', f.data, f.event._id, 0, true), { code: 'GOOGLE_EVENT_CHANGED' }); assert.equal(f.remote.size, 1);
  f.data.update = update; await f.service.sync('u', f.data, f.event._id, 0, true); assert.equal(f.remote.size, 1); assert.equal(f.calls.filter(c => c.url.includes('/events?')).length, 1);
});

test('OAuth failures distinguish client credentials, rejected codes and missing tokens without exposing provider details', async () => {
  for (const [oauth, code] of [['invalid_client', 'GOOGLE_CLIENT'], ['invalid_grant', 'GOOGLE_GRANT'], ['redirect_uri_mismatch', 'GOOGLE_REDIRECT'], ['__proto__', 'GOOGLE_RECONNECT'], ['unknown', 'GOOGLE_RECONNECT']]) {
    const f = fixture({ request: async url => url.endsWith('/token') ? new Response(JSON.stringify({ error: oauth, error_description: 'private-secret private-code private-token' }), { status: 400 }) : null });
    await assert.rejects(f.connect(), e => { assert.equal(e.code, code); assert.equal(e.stage, 'token'); assert.ok(!JSON.stringify(e).includes('private-')); return true; });
    assert.equal((await f.service.status('u')).connected, false);
    assert.equal(f.held.size, 0);
  }
  const missing = fixture({ request: async url => url.endsWith('/token') ? new Response(JSON.stringify({ access_token: 'private-access', expires_in: 3600 })) : null });
  await assert.rejects(missing.connect(), { code: 'GOOGLE_TOKEN_RESPONSE', stage: 'token' });
});
test('callback errors identify profile and database stages; unexpected exception details stay private', async () => {
  const profile = fixture({ request: async url => url.includes('/userinfo') ? new Response(JSON.stringify({ sub: 'owner', email: 'owner@example.com', email_verified: false })) : null });
  await assert.rejects(profile.connect(), { code: 'GOOGLE_PERMISSION', stage: 'profile' });
  const database = fixture(); database.store.consumeState = async () => { throw Error('private database credentials'); };
  await assert.rejects(database.connect(), e => { assert.equal(e.code, 'GOOGLE_UNAVAILABLE'); assert.equal(e.stage, 'state'); assert.ok(!JSON.stringify(e).includes('credentials')); return true; });
});
