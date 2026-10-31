'use strict';
const express = require('express');
const { randomBytes } = require('node:crypto');
const { googleCalendarConfig, createGoogleCalendarService } = require('./google-calendar-service');
const { uuid, audiences, eventView } = require('./community-model');
function registerGoogleCalendar(app, { env, origin, store, sameOrigin }) {
  const manage = (req, res, next) => req.staff.permissions.includes('events:manage') ? next() : res.status(403).json({ message: 'Event Organizer access is required.' });
  app.use('/api/workspace/google-calendar', manage);
  let service; try { const config = googleCalendarConfig(env, origin); if (config) service = createGoogleCalendarService(config, store.googleCalendar); } catch (_) { /* Feature fails closed; event creation remains independent. */ }
  const ready = (req, res, next) => service ? next() : res.status(503).json({ message: 'Google Calendar is awaiting administrator setup.' });
  const messages = {
    GOOGLE_RECONNECT: 'Connect your Google account again.', GOOGLE_PERMISSION: 'Google did not allow this action. Check the account, Calendar API and consent permissions.', GOOGLE_STATE: 'This Google connection request expired or belongs to another sign-in. Start again.', GOOGLE_BUSY: 'Another calendar request is in progress. Please retry.', GOOGLE_RATE_LIMIT: 'Google is busy. Wait a minute before trying again.', GOOGLE_OWNER: 'This event is linked through another Google connection. Use its original organizer account.', GOOGLE_CALENDAR_REQUIRED: 'Create your SWS business calendar using the button above first.', GOOGLE_CALENDAR_UNKNOWN: 'Google may have created the calendar, but we could not confirm its ID. Contact an administrator before trying to create another calendar.', GOOGLE_MEET_UNAVAILABLE: 'This Google account/calendar does not support Google Meet creation. You can create the calendar event without Meet or use another eligible account.', GOOGLE_EVENT_CHANGED: 'This event changed. Refresh it and retry. If Google already saved it, retrying will reuse the same calendar event.', GOOGLE_CANCELLED_UNLINKED: 'This cancelled event has no linked Google event to update.'
  };
  function callbackFailure(res, code, stage = 'consent') {
    const codes = new Set(['GOOGLE_DENIED', 'GOOGLE_CALLBACK', 'GOOGLE_CLIENT', 'GOOGLE_GRANT', 'GOOGLE_REDIRECT', 'GOOGLE_TOKEN_RESPONSE', 'GOOGLE_RECONNECT', 'GOOGLE_PERMISSION', 'GOOGLE_STATE', 'GOOGLE_BUSY', 'GOOGLE_RATE_LIMIT', 'GOOGLE_UNAVAILABLE']);
    const reason = codes.has(code) ? code : 'GOOGLE_UNAVAILABLE';
    const reference = randomBytes(6).toString('hex');
    const stages = new Set(['consent', 'state', 'connection', 'verifier', 'token', 'profile', 'save', 'release']);
    // Log only controlled classifications and a random reference, never req.url,
    // query strings, provider responses or the original error object.
    console.warn(JSON.stringify({ event: 'sws_google_callback_failed', code: reason, stage: stages.has(stage) ? stage : 'unknown', reference }));
    return res.redirect(303, '/workspace/events?' + new URLSearchParams({ google: 'failed', reason, reference }));
  }
  const safe = fn => async (req, res) => { try { await fn(req, res); } catch (e) {
    if (req.path.endsWith('/callback')) return callbackFailure(res, e.code, e.stage);
    if (e.code === 'GOOGLE_RATE_LIMIT') res.set('Retry-After', '60');
    res.status(messages[e.code] ? e.status : 503).json({ message: messages[e.code] || 'Google Calendar is unavailable. Your SWS event is still saved. Please retry.', code: messages[e.code] ? e.code : 'GOOGLE_UNAVAILABLE' });
  } };
  const rate = async (req, res, next) => { try { const r = await store.adminLimit('google-calendar:' + req.admin.id, 30, 60, Date.now()); if (!r.allowed) { res.set('Retry-After', String(r.retryAfter)); return res.status(429).json({ message: 'Please wait before another Google Calendar request.' }); } next(); } catch (_) { res.status(503).json({ message: 'Calendar requests are temporarily unavailable.' }); } };
  const parse = express.json({ limit: '4kb' });
  app.get('/api/workspace/google-calendar', safe(async (req, res) => res.json(service ? await service.status(req.admin.id) : { configured: false, connected: false, calendarReady: false })));
  app.post('/api/workspace/google-calendar/connect', ready, sameOrigin, parse, rate, safe(async (req, res) => res.json(await service.start(req.admin.id, req.staffSessionId))));
  app.get('/api/workspace/google-calendar/callback', ready, rate, safe(async (req, res) => {
    const { code, state } = req.query;
    if (req.query.error) return callbackFailure(res, req.query.error === 'access_denied' ? 'GOOGLE_DENIED' : 'GOOGLE_PERMISSION');
    if (typeof code !== 'string' || !code || code.length > 8192 || typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)) return callbackFailure(res, 'GOOGLE_CALLBACK');
    await service.callback(req.admin.id, req.staffSessionId, state, code); res.redirect(303, '/workspace/events?google=connected');
  }));
  app.post('/api/workspace/google-calendar/calendar', ready, sameOrigin, parse, rate, safe(async (req, res) => {
    if (!req.body || Object.keys(req.body).some(k => k !== 'calendarId') || (req.body.calendarId !== undefined && (typeof req.body.calendarId !== 'string' || !req.body.calendarId || req.body.calendarId.length > 1024))) return res.status(400).json({ message: 'Provide a valid calendar ID or an empty JSON object to create a calendar.' });
    res.json(req.body.calendarId ? await service.recoverCalendar(req.admin.id, req.body.calendarId) : await service.createCalendar(req.admin.id));
  }));
  app.delete('/api/workspace/google-calendar', ready, sameOrigin, rate, safe(async (req, res) => { await service.disconnect(req.admin.id); res.json({ success: true }); }));
  app.post('/api/workspace/google-calendar/events/:id', ready, sameOrigin, parse, rate, safe(async (req, res) => {
    if (!uuid.test(req.params.id) || !req.body || Object.keys(req.body).some(k => !['version', 'withMeet'].includes(k)) || !Number.isSafeInteger(req.body.version) || req.body.version < 0 || typeof req.body.withMeet !== 'boolean') return res.status(400).json({ message: 'Refresh the event and choose whether to create a Google Meet room.' });
    const event = await store.community.get(req.params.id);
    if (!event || !audiences(req.staff).includes(event.visibility)) return res.status(404).json({ message: 'Event not found.' });
    const result = await service.sync(req.admin.id, store.community, event._id, req.body.version, req.body.withMeet);
    res.json({ event: eventView(result.event, req.staff), meetStatus: result.meetStatus, message: result.meetStatus === 'pending' ? 'Google Calendar saved. Meet is still being prepared; use Refresh Google link shortly.' : result.meetStatus === 'failure' ? 'Google Calendar saved, but Meet could not be created. You can retry or enter a meeting link manually.' : 'Google Calendar saved. No attendee list or invitations were added by this website.' });
  }));
}
module.exports = { registerGoogleCalendar };
