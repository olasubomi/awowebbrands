'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createApp } = require('../app');
const { buildFixture } = require('./helpers/auth-fixture');
const { createStaffAccess } = require('../lib/staff-access');
const { audiences, validateEvent, eventView, calendar } = require('../lib/community-model');
function input(extra = {}) { return { title: 'Weekly engineering session', description: 'Learn together', startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString(), timezone: 'America/Los_Angeles', visibility: 'public', meetingUrl: 'https://meet.google.com/abc-defg-hij', status: 'scheduled', ...extra }; }
async function fixture(t, options = {}) {
  const members = new Map([
    ['member@example.com', { email: 'member@example.com', relationship: null, roles: ['community-member'], status: 'active' }],
    ['organizer@example.com', { email: 'organizer@example.com', relationship: null, roles: ['community-member', 'event-organizer'], status: 'active' }],
    ['staff@example.com', { email: 'staff@example.com', relationship: 'contractor', roles: ['developer'], status: 'active' }]
  ]), events = new Map(), responses = new Map();
  const community = {
    async create(data, actor) { const event = { _id: randomUUID(), ...data, version: 0, createdBy: actor, updatedAt: new Date() }; events.set(event._id, event); return event; },
    async get(id) { return events.get(id); },
    async list({ audience, past }) { return { events: [...events.values()].filter(e => audience.includes(e.visibility) && (past ? +e.endsAt <= Date.now() : +e.endsAt > Date.now())), next: null }; },
    async response(event, user) { return responses.get(event + ':' + user); },
    async update(id, data, version) { const e = events.get(id); if (!e || e.version !== version) return null; Object.assign(e, data, { version: version + 1 }); return e; },
    async rsvp(eventId, userId, email, rsvp) { const id = eventId + ':' + userId, row = responses.get(id) || { _id: id, eventId, userId, email, attendance: 'unconfirmed', version: 0 }; row.rsvp = rsvp; responses.set(id, row); return row; },
    async roster(eventId) { return { responses: [...responses.values()].filter(r => r.eventId === eventId), next: null }; },
    async attendance(event, user, email, attendance, version) { const row = responses.get(event + ':' + user); if (!row || row.version !== version) return null; row.attendance = attendance; row.version++; return row; },
    async milestones(userId) { const rows = [...responses.values()].filter(r => r.userId === userId && r.attendance === 'attended' && events.get(r.eventId)?.status !== 'cancelled'); return { total: rows.length, firstAttendedAt: rows.length ? new Date() : null, participatedThisWeek: !!rows.length, thisMonth: rows.length, timezone: 'America/Los_Angeles' }; }
  };
  const store = { community, googleCalendar: options.googleStore, getStaff: async email => members.get(email), activateStaff: async email => members.get(email), adminLimit: async () => ({ allowed: true }) };
  const config = { origin: options.origin || 'http://localhost:4000', secret: randomBytes(32).toString('hex'), emails: new Set(['admin@example.com']), prefix: 'community_auth_' };
  const access = createStaffAccess(config, store, true); config.allowEmail = email => access.allowed(email);
  const f = await buildFixture(config);
  const env = { SWS_ADMIN_ENABLED: 'true', SWS_STAFF_ENABLED: 'true', SWS_COMMUNITY_ENABLED: 'true', SWS_AUTH_ORIGIN: config.origin, SWS_AUTH_SECRET: config.secret, SWS_ADMIN_EMAILS: 'admin@example.com', ...(options.env || {}) };
  const app = createApp({ env, store, authRuntime: f.runtime, enablePhoneVerification: false });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const request = (path, cookie, method = 'GET', body, origin = config.origin) => fetch('http://127.0.0.1:' + server.address().port + path, { method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function login(email) { await request('/api/admin-auth/request-code', '', 'POST', { email }); const r = await request('/api/admin-auth/verify-code', '', 'POST', { email, code: f.sent.at(-1).code }); assert.equal(r.status, 200); return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '); }
  return { ...f, store, community, members, events, responses, request, login };
}
test('public browsing hides member/staff events, meeting links and rosters; approved community members have no project or staff privileges', async t => {
  const f = await fixture(t);
  const publicEvent = await f.community.create(validateEvent(input()), 'actor');
  const privateEvent = await f.community.create(validateEvent(input({ visibility: 'members' })), 'actor');
  const staffEvent = await f.community.create(validateEvent(input({ visibility: 'staff' })), 'actor');
  const publicResponse = await f.request('/api/community/events'); const text = await publicResponse.text(); assert.equal(JSON.parse(text).events.length, 1); assert.ok(!text.includes('meet.google.com')); assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
  assert.equal((await f.request('/api/community/events/' + privateEvent._id)).status, 404);
  assert.equal((await f.request('/api/workspace/events/' + publicEvent._id + '/participants')).status, 401);
  const cookie = await f.login('member@example.com');
  const me = await (await f.request('/api/workspace/me', cookie)).json(); assert.equal(me.relationship, null); assert.deepEqual(me.roles, ['community-member']);
  assert.equal((await (await f.request('/api/workspace/events', cookie)).json()).events.length, 2);
  assert.equal((await f.request('/api/workspace/events/' + staffEvent._id, cookie)).status, 404);
  for (const path of ['/api/admin/team', '/api/admin/inquiries', '/api/workspace/jira', '/api/workspace/google-calendar', '/api/workspace/events/' + publicEvent._id + '/participants']) assert.equal((await f.request(path, cookie)).status, 403);
  assert.equal((await f.request('/api/workspace/events', cookie, 'POST', input())).status, 403);
  assert.equal((await f.request('/api/workspace/attendance?userId=other', cookie)).status, 400);
});
test('RSVP does not count attendance; meeting link requires Going; only organizer can confirm after event ends; stale writes fail', async t => {
  const f = await fixture(t), member = await f.login('member@example.com'), organizer = await f.login('organizer@example.com');
  const event = await f.community.create(validateEvent(input()), 'actor'), path = '/api/workspace/events/' + event._id;
  let r = await f.request(path + '/rsvp', member, 'POST', { rsvp: 'going', attendance: 'attended' }); assert.equal(r.status, 400);
  r = await f.request(path + '/rsvp', member, 'POST', { rsvp: 'going' }); assert.equal(r.status, 200); assert.match((await r.json()).event.meetingUrl, /^https:/);
  assert.equal((await (await f.request('/api/workspace/attendance', member)).json()).total, 0);
  const rows = await (await f.request(path + '/participants', organizer)).json(), userId = rows.responses[0].userId;
  const body = { userId, attendance: 'attended', version: 0 };
  assert.equal((await f.request(path + '/attendance', member, 'PATCH', body)).status, 403);
  assert.equal((await f.request(path + '/attendance', organizer, 'PATCH', body)).status, 409);
  event.startsAt = new Date(Date.now() - 7200000); event.endsAt = new Date(Date.now() - 3600000);
  assert.equal((await f.request(path + '/attendance', organizer, 'PATCH', body, 'https://evil.example')).status, 403);
  assert.equal((await f.request(path + '/attendance', organizer, 'PATCH', body)).status, 200);
  assert.equal((await f.request(path + '/attendance', organizer, 'PATCH', body)).status, 409);
  assert.equal((await (await f.request('/api/workspace/attendance', member)).json()).total, 1);
  event.status = 'cancelled'; assert.equal((await (await f.request('/api/workspace/attendance', member)).json()).total, 0);
  assert.equal((await f.request(path + '/rsvp', member, 'POST', { rsvp: 'going' })).status, 409);
});
test('organizer can manage public/community events but cannot create staff-only meetings or change roles', async t => {
  const f = await fixture(t), organizer = await f.login('organizer@example.com');
  assert.equal((await f.request('/api/workspace/events', organizer, 'POST', input({ visibility: 'staff' }))).status, 403);
  assert.equal((await f.request('/api/admin/team', organizer)).status, 403);
  const r = await f.request('/api/workspace/events', organizer, 'POST', input()); assert.equal(r.status, 201); const event = (await r.json()).event;
  assert.equal((await f.request('/api/workspace/events/' + event.id, organizer, 'PATCH', { ...input(), version: 100 })).status, 409);
  assert.equal((await f.request('/api/workspace/events?after=bad', organizer)).status, 400);
  f.members.get('organizer@example.com').status = 'suspended'; assert.equal((await f.request('/api/workspace/events', organizer)).status, 403);
});
test('event validation protects timestamps, time zones, URLs and historical attendance context', () => {
  const now = Date.now();
  for (const bad of [{ meetingUrl: 'javascript:alert(1)' }, { meetingUrl: 'https://user:pass@example.com' }, { timezone: 'bad/timezone' }, { visibility: 'everyone' }, { attendance: 'attended' }, { startsAt: '2026-10-30T10:00' }, { endsAt: new Date(now - 1).toISOString() }]) assert.equal(validateEvent(input(bad)), null);
  const old = { ...validateEvent(input()), startsAt: new Date(now - 7200000), endsAt: new Date(now - 3600000) };
  assert.equal(validateEvent(input(), now, old), null);
  const corrected = input({ startsAt: old.startsAt.toISOString(), endsAt: old.endsAt.toISOString(), title: 'Corrected title' }); assert.ok(validateEvent(corrected, now, old));
  assert.deepEqual(audiences({ roles: ['community-member'], relationship: null }), ['public', 'members']);
});
test('calendar export excludes private events and meeting URLs; Unicode folding and text escaping prevent new properties', async t => {
  const f = await fixture(t), e = await f.community.create(validateEvent(input({ title: 'Engineering 🥑'.repeat(10), description: 'Hello\nBEGIN:VEVENT;with,comma' })), 'actor');
  await f.community.create(validateEvent(input({ visibility: 'members', title: 'PRIVATE EVENT' })), 'actor');
  const r = await f.request('/events/calendar.ics'); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/calendar/);
  const text = await r.text(); assert.ok(!text.includes('PRIVATE EVENT')); assert.ok(!text.includes('meet.google.com')); assert.match(text, /DESCRIPTION:Hello\\nBEGIN:VEVENT\\;with\\,comma/);
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal((text.match(/\r\nBEGIN:VEVENT\r\n/g) || []).length, 1);
  assert.equal(eventView(e, null).meetingUrl, undefined);
});

test('event errors identify individual fields; optional empty or omitted meeting link does not block saving', async t => {
  const f = await fixture(t), organizer = await f.login('organizer@example.com');
  for (const meetingUrl of ['', '   ', undefined]) {
    const r = await f.request('/api/workspace/events', organizer, 'POST', input({ meetingUrl })); assert.equal(r.status, 201); assert.equal((await r.json()).event.meetingUrl, '');
  }
  const invalid = await f.request('/api/workspace/events', organizer, 'POST', input({ title: '', startsAt: new Date(Date.now() - 60000).toISOString(), timezone: 'not-a-zone', meetingUrl: 'http://www' }));
  assert.equal(invalid.status, 400); const errors = (await invalid.json()).errors;
  assert.match(errors.title, /title/); assert.match(errors.startsAt, /past/); assert.match(errors.timezone, /not recognized/); assert.match(errors.meetingUrl, /https:\/\//);
  const end = await f.request('/api/workspace/events', organizer, 'POST', input({ endsAt: new Date(Date.now() + 1000).toISOString() }));
  assert.match((await end.json()).errors.endsAt, /later than/);
});

test('Google consent route requires organizer, exact Origin, and server-derived user/session identity', async t => {
  const states = [];
  const f = await fixture(t, { origin: 'https://sws.example.com', env: { SWS_GOOGLE_CALENDAR_ENABLED: 'true', SWS_GOOGLE_CALENDAR_CLIENT_ID: 'client', SWS_GOOGLE_CALENDAR_CLIENT_SECRET: 'secret', SWS_GOOGLE_CALENDAR_ENCRYPTION_KEY: randomBytes(32).toString('base64') }, googleStore: { putState: async s => states.push(s), getConnection: async () => null } });
  const organizer = await f.login('organizer@example.com'), member = await f.login('member@example.com');
  assert.equal((await f.request('/api/workspace/google-calendar/connect', member, 'POST', {})).status, 403);
  assert.equal((await f.request('/api/workspace/google-calendar/connect', organizer, 'POST', {}, 'https://evil.example')).status, 403);
  const result = await f.request('/api/workspace/google-calendar/connect', organizer, 'POST', { userId: 'forged' }); assert.equal(result.status, 200);
  const data = await result.json(); assert.match(data.url, /^https:\/\/accounts.google.com\//); assert.equal(states.length, 1); assert.notEqual(states[0].userId, 'forged');
  assert.equal(states[0].userId, (await (await f.request('/api/workspace/me', organizer)).json()).id);
  assert.equal((await f.request('/api/workspace/google-calendar/callback?state=bad&code=bad', organizer)).headers.get('location'), '/workspace/events?google=failed');
});
