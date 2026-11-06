'use strict';
const express = require('express');
const { tokenPattern, token, digest, owns, canCreate, checkPoll, checkDraft, sameSlots, checkBallot, pollView, calendar } = require('./model');
const { schedulingPage } = require('./pages');
function registerScheduling(app, { env, store, origin, sameOrigin, privateHeaders }) {
  const enabled = env.SWS_SCHEDULING_ENABLED === 'true' && env.SWS_STAFF_ENABLED === 'true' && !!origin;
  const available = (req, res, next) => enabled ? next() : res.status(503).json({ message: 'Scheduling polls are not enabled yet.' });
  const data = store.scheduling;
  const safe = fn => async (req, res) => { try { await fn(req, res); } catch (_) { const incident = token().slice(0, 12); console.error(JSON.stringify({ event: 'scheduling_request_failed', incident })); if (!res.headersSent) res.status(503).json({ message: 'We could not complete this scheduling request. Please retry.', incident }); } };
  const limited = (kind, max) => async (req, res, next) => { try { const r = await store.adminLimit('scheduling:' + kind + ':' + (req.admin?.id || req.ip), max, 60, Date.now()); if (!r.allowed) return res.status(429).set('Retry-After', String(r.retryAfter)).json({ message: 'Please wait a minute before another scheduling request.' }); next(); } catch (_) { res.status(503).json({ message: 'Scheduling is temporarily unavailable.' }); } };
  const parse = express.json({ limit: '12kb' });
  const manage = (req, res, next) => canCreate(req.staff) ? next() : res.status(403).json({ message: 'Scheduling Organizer access is required.' });
  app.use(['/schedule', '/api/scheduling'], privateHeaders, (req, res, next) => { res.set('Referrer-Policy', 'no-referrer'); next(); });
  app.use(['/schedule', '/api/scheduling', '/workspace/scheduling', '/api/workspace/scheduling'], available);
  app.get(['/schedule/:id', '/workspace/scheduling', '/workspace/scheduling/:id'], (req, res) => res.send(schedulingPage(req.path.startsWith('/workspace'))));
  app.use('/api/workspace/scheduling', manage);
  app.get('/api/workspace/scheduling', limited('list', 60), safe(async (req, res) => {
    if (Object.keys(req.query).some(k => k !== 'after') || (req.query.after !== undefined && (typeof req.query.after !== 'string' || !tokenPattern.test(req.query.after)))) return res.status(400).json({ message: 'Invalid poll page.' });
    res.json(await data.list(req.staff.permissions.includes('scheduling:manage:any') ? null : req.admin.id, req.query.after));
  }));
  app.post('/api/workspace/scheduling', sameOrigin, parse, limited('create', 10), safe(async (req, res) => {
    const checked = checkPoll(req.body); if (checked.errors) return res.status(400).json({ message: 'Check the highlighted poll fields.', errors: checked.errors });
    const p = await data.create(checked.value, req.admin.id); res.status(201).json({ poll: pollView(p, null, true), shareUrl: origin + '/schedule/' + p._id });
  }));
  app.post('/api/workspace/scheduling/drafts', sameOrigin, parse, limited('create', 10), safe(async (req, res) => {
    if (!req.body || Object.keys(req.body).some(k => k !== 'draftInput')) return res.status(400).json({ message: 'Provide the draft input only.' });
    const checked = checkDraft(req.body.draftInput);
    if (checked.errors) return res.status(400).json({ message: 'Check your draft.', errors: checked.errors });
    const p = await data.create(checked.value, req.admin.id, 'draft');
    res.status(201).json({ poll: pollView(p, null, true) });
  }));
  async function load(req, res, organizer) {
    if (!tokenPattern.test(req.params.id)) { res.status(404).json({ message: 'Poll not found.' }); return null; }
    const p = await data.get(req.params.id);
    if (!p || (!organizer && p.status === 'draft') || (organizer && !owns(req.staff, req.admin.id, p))) { res.status(404).json({ message: 'Poll not found.' }); return null; }
    return p;
  }
  app.get('/api/workspace/scheduling/:id', limited('read', 90), safe(async (req, res) => { const p = await load(req, res, true); if (p) res.json({ poll: pollView(p, null, true), ...(p.status === 'draft' ? {} : { shareUrl: origin + '/schedule/' + p._id }) }); }));
  const conflict = res => res.status(409).json({ message: 'This poll changed. Refresh the results and reopen the editor before saving.' });
  app.patch('/api/workspace/scheduling/:id', sameOrigin, parse, limited('edit', 20), safe(async (req, res) => {
    const p = await load(req, res, true); if (!p) return;
    const b = req.body;
    if (!b || !Number.isSafeInteger(b.version) || b.version < 0 || p.status === 'cancelled') return res.status(400).json({ message: 'Use a current poll revision. Cancelled polls cannot be edited.' });
    if (p.version !== b.version) return conflict(res);
    if (p.status === 'draft') {
      if (Object.keys(b).some(k => !['version', 'draftInput'].includes(k))) return res.status(400).json({ message: 'Save the draft input before publishing.' });
      const checked = checkDraft(b.draftInput); if (checked.errors) return res.status(400).json({ message: 'Check your draft.', errors: checked.errors });
      const saved = await data.change(p._id, b.version, checked.value, 'draft-saved', req.admin.id);
      if (!saved) return conflict(res); return res.json({ poll: pollView(saved, null, true) });
    }
    const { version, resetResponses, ...input } = b;
    if (resetResponses !== undefined && typeof resetResponses !== 'boolean') return res.status(400).json({ message: 'Confirm response reset using true or false.' });
    const checked = checkPoll(input, Date.now(), p);
    if (checked.errors) return res.status(400).json({ message: 'Check the highlighted poll fields.', errors: checked.errors });
    const changed = !sameSlots(p.slots, checked.value.slots);
    if (changed && p.status === 'finalized') return res.status(409).json({ message: 'This meeting time is confirmed. Create a replacement poll to propose different times.' });
    if (changed && p.responses.length && !resetResponses) return res.status(409).json({ message: 'Changing time options clears existing availability. Confirm the reset and ask participants to respond again.', code: 'POLL_RESPONSES_REQUIRE_RESET' });
    const saved = await data.change(p._id, b.version, { ...checked.value, ...(changed ? { responses: [] } : {}) }, changed ? 'times-edited-responses-reset' : 'details-edited', req.admin.id);
    if (!saved) return conflict(res);
    res.json({ poll: pollView(saved, null, true), responsesReset: changed && p.responses.length > 0 });
  }));
  app.post('/api/workspace/scheduling/:id/publish', sameOrigin, parse, limited('publish', 10), safe(async (req, res) => {
    const p = await load(req, res, true); if (!p) return;
    const { version, ...input } = req.body || {};
    if (p.status !== 'draft' || !Number.isSafeInteger(version) || version < 0 || p.version !== version) return conflict(res);
    const checked = checkPoll(input); if (checked.errors) return res.status(400).json({ message: 'Complete the highlighted fields before publishing.', errors: checked.errors });
    const saved = await data.change(p._id, version, { ...checked.value, status: 'open', draftInput: null, publishedAt: new Date() }, 'published', req.admin.id);
    if (!saved) return conflict(res);
    res.json({ poll: pollView(saved, null, true), shareUrl: origin + '/schedule/' + p._id });
  }));
  app.patch('/api/workspace/scheduling/:id/privacy', sameOrigin, parse, limited('privacy', 20), safe(async (req, res) => {
    if (!req.staff.permissions.includes('scheduling:privacy')) return res.status(403).json({ message: 'Only an administrator can change poll anonymity.' });
    const p = await load(req, res, true); if (!p) return;
    const b = req.body;
    if (!b || Object.keys(b).some(k => !['anonymous', 'version'].includes(k)) || typeof b.anonymous !== 'boolean' || !Number.isSafeInteger(b.version) || b.version < 0) return res.status(400).json({ message: 'Choose a privacy setting using the current poll revision.' });
    const saved = await data.change(p._id, b.version, { anonymous: b.anonymous }, 'privacy-changed', req.admin.id);
    if (!saved) return res.status(409).json({ message: 'This poll changed. Refresh before saving its privacy setting.' });
    res.json({ poll: pollView(saved, null, true) });
  }));
  app.post('/api/workspace/scheduling/:id/decision', sameOrigin, parse, limited('decision', 20), safe(async (req, res) => {
    const p = await load(req, res, true); if (!p) return;
    const b = req.body;
    if (!b || Object.keys(b).some(k => !['action', 'slotId', 'meetingUrl', 'version'].includes(k)) || !['finalize', 'cancel'].includes(b.action) || !Number.isSafeInteger(b.version) || b.version < 0) return res.status(400).json({ message: 'Choose a final time or cancel the poll using its current revision.' });
    if (p.status === 'draft' || p.status === 'cancelled' || (b.action === 'finalize' && p.status !== 'open')) return res.status(409).json({ message: 'This poll is already closed. Refresh to see the result.' });
    const fields = { status: b.action === 'finalize' ? 'finalized' : 'cancelled' };
    if (b.action === 'finalize') {
      const slot = p.slots.find(s => s.id === b.slotId); if (!slot || +slot.startsAt <= Date.now()) return res.status(400).json({ message: 'Choose one of the future proposed times.' });
      let link = typeof b.meetingUrl === 'string' ? b.meetingUrl.trim() : b.meetingUrl === undefined ? '' : null;
      try { if (link === null || link.length > 2048) throw Error(); if (link) { const u = new URL(link); if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password || u.port) throw Error(); } } catch (_) { return res.status(400).json({ message: 'Leave the meeting link empty or enter a full HTTPS URL.' }); }
      Object.assign(fields, { selectedSlotId: slot.id, meetingUrl: link, finalizedAt: new Date() });
    }
    const saved = await data.change(p._id, b.version, fields, b.action, req.admin.id);
    if (!saved) return res.status(409).json({ message: 'This poll changed. Refresh before confirming a decision.' });
    res.json({ poll: pollView(saved, null, true) });
  }));
  // Guests receive a browser-bound, HttpOnly response capability. It grants no staff access.
  const identity = (req, res, next) => {
    const raw = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('sws_poll_guest='))?.slice('sws_poll_guest='.length);
    if (tokenPattern.test(raw || '')) req.guest = raw;
    else if (req.method === 'GET') { req.guest = token(); res.cookie('sws_poll_guest', req.guest, { httpOnly: true, secure: origin.startsWith('https://'), sameSite: 'strict', path: '/api/scheduling', maxAge: 180 * 86400000 }); }
    else return res.status(403).json({ message: 'Open the poll in this browser before responding. Cookies must be enabled.' });
    next();
  };
  app.use('/api/scheduling', limited('public', 90));
  app.get('/api/scheduling/polls/:id', identity, safe(async (req, res) => { const p = await load(req, res, false); if (p) res.json({ poll: pollView(p, digest(p._id + ':' + req.guest)) }); }));
  app.get('/api/scheduling/polls/:id/calendar.ics', safe(async (req, res) => {
    const p = await load(req, res, false); if (!p) return; const body = calendar(p);
    if (!body) return res.status(409).json({ message: 'The organizer has not confirmed a time yet.' });
    res.type('text/calendar; charset=utf-8').set('Content-Disposition', 'attachment; filename="sws-meeting.ics"').send(body);
  }));
  app.post('/api/scheduling/polls/:id/response', sameOrigin, parse, identity, limited('vote', 20), safe(async (req, res) => {
    const p = await load(req, res, false); if (!p) return;
    if (p.status !== 'open' || +p.deadline <= Date.now()) return res.status(409).json({ message: 'Responses are closed. The organizer will confirm the final time here.' });
    const checked = checkBallot(req.body, p); if (checked.errors) return res.status(400).json({ message: 'Check your response.', errors: checked.errors });
    const guestHash = digest(p._id + ':' + req.guest), existing = p.responses.find(r => r.guestHash === guestHash);
    if (!existing && p.responses.length >= 100) return res.status(409).json({ message: 'This poll has reached its 100-response limit. Please contact the organizer.' });
    const responses = [...p.responses.filter(r => r.guestHash !== guestHash), { guestHash, ...checked.value, updatedAt: new Date() }];
    const saved = await data.change(p._id, req.body.version, { responses }, existing ? 'response-updated' : 'response-added', 'participant', true);
    if (!saved) return res.status(409).json({ message: 'The poll changed while you responded. Refresh the results, then save your response again.' });
    res.json({ poll: pollView(saved, guestHash) });
  }));
  app.delete('/api/scheduling/polls/:id/response', sameOrigin, parse, identity, limited('vote', 20), safe(async (req, res) => {
    const p = await load(req, res, false); if (!p) return;
    if (!req.body || Object.keys(req.body).some(k => k !== 'version') || !Number.isSafeInteger(req.body.version) || req.body.version < 0) return res.status(400).json({ message: 'Refresh the poll before withdrawing your response.' });
    const guestHash = digest(p._id + ':' + req.guest);
    const saved = await data.change(p._id, req.body.version, { responses: p.responses.filter(r => r.guestHash !== guestHash) }, 'response-withdrawn', 'participant', true);
    if (!saved) return res.status(409).json({ message: 'Responses are closed or this poll changed. Refresh the poll.' });
    res.json({ poll: pollView(saved, guestHash) });
  }));
}
module.exports = { registerScheduling };
