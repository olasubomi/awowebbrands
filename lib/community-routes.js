'use strict';
const express = require('express');
const { randomBytes } = require('node:crypto');
const { audiences, isStaff, uuid, checkEvent, eventView, calendar } = require('./community-model');
const { eventsPage } = require('./community-pages');
function registerCommunity(app, { env, store, origin, sameOrigin, enabled }) {
  const data = store.community;
  const available = (req, res, next) => enabled ? next() : res.status(503).json({ message: 'Community events are not enabled yet.' });
  const safe = fn => async (req, res) => { try { await fn(req, res); } catch (_) { const incident = randomBytes(6).toString('hex'); console.error(JSON.stringify({ event: 'community_request_failed', incident })); if (!res.headersSent) res.status(503).json({ message: 'We could not complete this events request. Please retry.', incident }); } };
  const manage = (req, res, next) => req.staff.permissions.includes('events:manage') ? next() : res.status(403).json({ message: 'Event Organizer access is required.' });
  const parse = express.json({ limit: '12kb' });
  const rate = async (req, res, next) => { try { const r = await store.adminLimit('community:' + req.admin.id, 60, 60, Date.now()); if (!r.allowed) { res.set('Retry-After', String(r.retryAfter)); return res.status(429).json({ message: 'Please wait before another events request.' }); } next(); } catch (_) { res.status(503).json({ message: 'Events are temporarily unavailable.' }); } };
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  app.use(['/events', '/api/community', '/workspace/events', '/api/workspace/events', '/api/workspace/attendance'], noStore);
  app.use(['/api/community', '/events/calendar.ics'], available, async (req, res, next) => {
    try { const r = await store.adminLimit('community-public:' + req.ip, 120, 60, Date.now()); if (!r.allowed) { res.set('Retry-After', String(r.retryAfter)); return res.status(429).json({ message: 'Please wait before loading more events.' }); } next(); } catch (_) { res.status(503).json({ message: 'Events are temporarily unavailable.' }); }
  });
  const page = (req, res) => res.send(eventsPage());
  app.get(['/events', '/events/:id', '/workspace/events', '/workspace/events/:id'], available, (req, res, next) => {
    if (req.params.id === 'calendar.ics') return next();
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"); page(req, res);
  });
  app.get('/events/calendar.ics', available, safe(async (req, res) => {
    const result = await data.list({ audience: ['public'], past: false, limit: 100 });
    res.type('text/calendar; charset=utf-8').set('Content-Disposition', 'attachment; filename="sws-community-events.ics"').send(calendar(result.events, origin || 'https://www.softwebs.io'));
  }));
  function cursor(raw) {
    if (raw === undefined) return null;
    if (typeof raw !== 'string' || raw.length > 512) throw Error('CURSOR');
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString());
    if (!c || !uuid.test(c.id) || typeof c.time !== 'string' || !Number.isFinite(Date.parse(c.time))) throw Error('CURSOR');
    return c;
  }
  const list = memberMode => safe(async (req, res) => {
    let after; try { after = cursor(req.query.after); } catch (_) { return res.status(400).json({ message: 'Invalid event page.' }); }
    if (Object.keys(req.query).some(k => !['after', 'past'].includes(k)) || (req.query.past !== undefined && !['true', 'false'].includes(req.query.past))) return res.status(400).json({ message: 'Invalid event filters.' });
    const member = memberMode ? req.staff : null;
    const result = await data.list({ after, audience: audiences(member), past: req.query.past === 'true' });
    const events = await Promise.all(result.events.map(async e => eventView(e, member, member ? await data.response(e._id, req.admin.id) : null)));
    res.json({ events, next: result.next ? Buffer.from(JSON.stringify(result.next)).toString('base64url') : null });
  });
  const getEvent = async (req, res, member) => {
    if (!uuid.test(req.params.id)) { res.status(400).json({ message: 'Invalid event reference.' }); return null; }
    const event = await data.get(req.params.id);
    if (!event || !audiences(member).includes(event.visibility)) { res.status(404).json({ message: 'Event not found.' }); return null; }
    return event;
  };
  app.get('/api/community/events', available, list(false));
  app.get('/api/community/events/:id', available, safe(async (req, res) => { const event = await getEvent(req, res, null); if (event) res.json({ event: eventView(event, null) }); }));
  app.get('/api/workspace/events', available, list(true));
  app.get('/api/workspace/events/:id', available, safe(async (req, res) => { const event = await getEvent(req, res, req.staff); if (event) res.json({ event: eventView(event, req.staff, await data.response(event._id, req.admin.id)) }); }));
  app.get('/api/workspace/attendance', available, safe(async (req, res) => {
    if (Object.keys(req.query).length) return res.status(400).json({ message: 'Attendance is available for your own account only.' });
    res.json(await data.milestones(req.admin.id));
  }));
  app.post('/api/workspace/events', available, manage, sameOrigin, parse, rate, safe(async (req, res) => {
    const checked = checkEvent(req.body);
    if (req.body?.version !== undefined) checked.errors = { ...checked.errors, _form: 'A new event cannot include an existing revision. Refresh the page and retry.' };
    if (checked.errors) return res.status(400).json({ message: 'Check the highlighted event fields.', errors: checked.errors });
    const input = checked.value;
    if (input.visibility === 'staff' && !isStaff(req.staff)) return res.status(403).json({ message: 'Staff-only events require staff access.' });
    res.status(201).json({ event: eventView(await data.create(input, req.admin.id), req.staff) });
  }));
  app.patch('/api/workspace/events/:id', available, manage, sameOrigin, parse, rate, safe(async (req, res) => {
    const event = await getEvent(req, res, req.staff); if (!event) return;
    const checked = checkEvent(req.body, Date.now(), event), version = req.body?.version;
    if (!Number.isSafeInteger(version) || version < 0) checked.errors = { ...checked.errors, _form: 'Refresh this event before saving; its revision is missing or invalid.' };
    if (checked.errors) return res.status(400).json({ message: 'Check the highlighted event fields.', errors: checked.errors });
    const input = checked.value;
    if (input.visibility === 'staff' && !isStaff(req.staff)) return res.status(403).json({ message: 'Staff-only events require staff access.' });
    const result = await data.update(event._id, input, version, req.admin.id);
    if (!result) return res.status(409).json({ message: 'This event changed. Refresh before saving.' });
    res.json({ event: eventView(result, req.staff) });
  }));
  app.post('/api/workspace/events/:id/rsvp', available, sameOrigin, parse, rate, safe(async (req, res) => {
    if (!req.body || Object.keys(req.body).some(k => k !== 'rsvp') || !['going', 'not-going'].includes(req.body.rsvp)) return res.status(400).json({ message: 'Choose Going or Not going.' });
    const event = await getEvent(req, res, req.staff); if (!event) return;
    if (event.status === 'cancelled' || +event.endsAt <= Date.now()) return res.status(409).json({ message: 'RSVP is closed for this event.' });
    const response = await data.rsvp(event._id, req.admin.id, req.staff.email, req.body.rsvp);
    res.json({ event: eventView(event, req.staff, response) });
  }));
  app.get('/api/workspace/events/:id/participants', available, manage, safe(async (req, res) => {
    const event = await getEvent(req, res, req.staff); if (!event) return;
    const after = req.query.after;
    if (Object.keys(req.query).some(k => k !== 'after') || (after !== undefined && (typeof after !== 'string' || after.length > 300 || !after.startsWith(event._id + ':')))) return res.status(400).json({ message: 'Invalid participant page.' });
    const result = await data.roster(event._id, after);
    res.json({ responses: result.responses.map(r => ({ userId: r.userId, email: r.email, rsvp: r.rsvp, attendance: r.attendance, version: r.version })), next: result.next });
  }));
  app.patch('/api/workspace/events/:id/attendance', available, manage, sameOrigin, parse, rate, safe(async (req, res) => {
    const event = await getEvent(req, res, req.staff); if (!event) return;
    const body = req.body;
    if (!body || Object.keys(body).some(k => !['userId', 'attendance', 'version'].includes(k)) || typeof body.userId !== 'string' || body.userId.length > 128 || !body.userId || !['attended', 'did-not-attend', 'unconfirmed'].includes(body.attendance) || !Number.isSafeInteger(body.version) || body.version < 0) return res.status(400).json({ message: 'Choose a valid participant and attendance state.' });
    if (event.status === 'cancelled' || +event.endsAt > Date.now()) return res.status(409).json({ message: 'Confirm attendance after the scheduled event ends.' });
    const existing = await data.response(event._id, body.userId);
    if (!existing) return res.status(404).json({ message: 'Participant not found. Members must RSVP before attendance can be recorded.' });
    const result = await data.attendance(event._id, body.userId, existing.email, body.attendance, body.version, req.admin.id);
    if (!result) return res.status(409).json({ message: 'Attendance changed. Refresh before saving.' });
    res.json({ success: true, attendance: result.attendance, version: result.version });
  }));
}
module.exports = { registerCommunity };
