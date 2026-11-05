'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createApp } = require('../app');
const { createStaffAccess } = require('../lib/staff-access');
const { buildFixture } = require('./helpers/auth-fixture');
const { checkPoll, checkBallot, pollView, calendar, token, digest } = require('../services/scheduling/model');
const { createSchedulingStore } = require('../services/scheduling/store');
const input = () => ({ title: 'Engineering conversation', description: 'Agree on a time', timezone: 'America/Los_Angeles', deadline: new Date(Date.now() + 3600000).toISOString(), slots: [2, 4].map(n => ({ startsAt: new Date(Date.now() + n * 3600000).toISOString(), endsAt: new Date(Date.now() + (n + 1) * 3600000).toISOString() })) });
function memoryScheduling() {
  const polls = new Map();
  return { polls,
    async create(data, ownerId) { const now = new Date(), p = { _id: token(), ownerId, ...data, anonymous: false, responses: [], status: 'open', version: 0, createdAt: now, updatedAt: now }; polls.set(p._id, structuredClone(p)); return p; },
    async get(id) { return structuredClone(polls.get(id)); },
    async list(ownerId) { return { polls: [...polls.values()].filter(p => !ownerId || p.ownerId === ownerId).map(p => ({ id: p._id, title: p.title, status: p.status })), next: null }; },
    async change(id, version, fields, action, actor, voting) { const p = polls.get(id); if (!p || p.version !== version || (voting && (p.status !== 'open' || +p.deadline <= Date.now()))) return null; Object.assign(p, structuredClone(fields), { version: p.version + 1, updatedAt: new Date() }); return structuredClone(p); }
  };
}
async function fixture(t, enabled = true) {
  const members = new Map(['alice', 'bob'].map(n => [n + '@example.com', { email: n + '@example.com', relationship: null, roles: ['community-member'], status: 'active' }]));
  const scheduling = memoryScheduling(), limits = [];
  const store = { scheduling, getStaff: async email => members.get(email), activateStaff: async email => members.get(email), adminLimit: async (...args) => { limits.push(args); return { allowed: true }; } };
  const config = { origin: 'http://localhost:4000', secret: randomBytes(32).toString('hex'), emails: new Set(['admin@example.com']), prefix: 'schedule_test_' };
  const access = createStaffAccess(config, store, true); config.allowEmail = email => access.allowed(email);
  const f = await buildFixture(config);
  const env = { SWS_ADMIN_ENABLED: 'true', SWS_STAFF_ENABLED: 'true', SWS_SCHEDULING_ENABLED: String(enabled), SWS_AUTH_ORIGIN: config.origin, SWS_AUTH_SECRET: config.secret, SWS_ADMIN_EMAILS: 'admin@example.com' };
  const app = createApp({ env, store, authRuntime: f.runtime, enablePhoneVerification: false }), server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const request = (path, cookie, method = 'GET', body, origin = config.origin) => fetch('http://127.0.0.1:' + server.address().port + path, { method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  async function login(email) { await request('/api/admin-auth/request-code', '', 'POST', { email }); const r = await request('/api/admin-auth/verify-code', '', 'POST', { email, code: f.sent.at(-1).code }); assert.equal(r.status, 200); return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '); }
  return { request, login, scheduling, members, limits };
}
async function created(f, cookie) { const r = await f.request('/api/workspace/scheduling', cookie, 'POST', input()); assert.equal(r.status, 201); return (await r.json()).poll; }
async function guest(f, id) { const r = await f.request('/api/scheduling/polls/' + id); assert.equal(r.status, 200); const c = r.headers.getSetCookie()[0]; assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/); return c.split(';')[0]; }
test('poll creation validates future times, deadline, duplicates, timezone and rejects privilege injection', () => {
  assert.ok(checkPoll(input()).value);
  for (const body of [null, [], { ...input(), ownerId: 'forged' }, { ...input(), anonymous: true }, { ...input(), timezone: 'Not/AZone' }, { ...input(), deadline: new Date(Date.now() - 1000).toISOString() }, { ...input(), slots: [] }]) assert.ok(checkPoll(body).errors);
  const body = input(); body.slots[1] = body.slots[0]; assert.match(checkPoll(body).errors.slots, /duplicate/);
  const p = { ...checkPoll(input()).value, version: 0 };
  assert.ok(checkBallot({ name: '', votes: ['yes', 'no'], version: 0 }, p).errors.name);
  assert.ok(checkBallot({ name: 'A', votes: ['yes'], version: 0 }, p).errors.votes);
});
test('signed-in members organize own polls; other organizers cannot read or decide them; admins see all', async t => {
  const f = await fixture(t), alice = await f.login('alice@example.com'), bob = await f.login('bob@example.com'), admin = await f.login('admin@example.com');
  assert.equal((await f.request('/api/workspace/scheduling', '', 'POST', input())).status, 401);
  const p = await created(f, alice), path = '/api/workspace/scheduling/' + p.id;
  assert.equal((await f.request(path, bob)).status, 404);
  assert.equal((await f.request(path + '/decision', bob, 'POST', { action: 'cancel', version: 0 })).status, 404);
  assert.equal((await f.request(path, admin)).status, 200);
  assert.equal((await (await f.request('/api/workspace/scheduling', bob)).json()).polls.length, 0);
  assert.equal((await f.request('/api/admin/team', alice)).status, 403);
  const profile = await f.request('/workspace/profile', alice); assert.equal(profile.status, 200); assert.match(await profile.text(), /My profile/);
  const page = await f.request('/workspace', alice); assert.match(await page.text(), /Create and manage meeting polls/);
  const me = await (await f.request('/api/workspace/me', alice)).json(); assert.ok(me.permissions.includes('scheduling:manage:own')); assert.ok(!me.permissions.includes('scheduling:privacy'));
  assert.equal((await f.request('/api/workspace/scheduling', alice, 'POST', input(), 'https://evil.example')).status, 403);
});
test('guests respond without login, revise only their own ballot, and public defaults show names/votes without capabilities', async t => {
  const f = await fixture(t), alice = await f.login('alice@example.com'), p = await created(f, alice), path = '/api/scheduling/polls/' + p.id;
  const a = await guest(f, p.id), b = await guest(f, p.id);
  assert.equal((await f.request(path + '/response', '', 'POST', { name: 'A', votes: ['yes', 'no'], version: 0 })).status, 403);
  assert.equal((await f.request(path + '/response', a, 'POST', { name: 'A', votes: ['yes', 'no'], version: 0 }, 'https://evil.example')).status, 403);
  let r = await f.request(path + '/response', a, 'POST', { name: 'A', votes: ['yes', 'maybe'], version: 0 }); assert.equal(r.status, 200);
  r = await f.request(path + '/response', b, 'POST', { name: 'B', votes: ['no', 'yes'], version: 1 }); assert.equal(r.status, 200);
  let result = (await r.json()).poll; assert.equal(result.responseCount, 2); assert.equal(result.myResponse.name, 'B'); assert.equal(result.responses[0].name, 'A');
  assert.ok(!JSON.stringify(result).includes('guestHash')); assert.ok(!JSON.stringify(result).includes('ownerId')); assert.ok(!JSON.stringify(result).includes(a.split('=')[1]));
  r = await f.request(path + '/response', a, 'POST', { name: 'A corrected', votes: ['yes', 'yes'], version: 2 }); assert.equal(r.status, 200); result = (await r.json()).poll;
  assert.equal(result.responseCount, 2); assert.equal(result.slots[1].totals.yes, 2);
  r = await f.request(path + '/response', b, 'DELETE', { version: 3 }); assert.equal(r.status, 200); assert.equal((await r.json()).poll.responseCount, 1);
});
test('only admins toggle anonymity; hidden results preserve totals and own response, never leak other names', async t => {
  const f = await fixture(t), alice = await f.login('alice@example.com'), admin = await f.login('admin@example.com'), p = await created(f, alice), path = '/api/scheduling/polls/' + p.id;
  const a = await guest(f, p.id), b = await guest(f, p.id);
  await f.request(path + '/response', a, 'POST', { name: 'Private A', votes: ['yes', 'no'], version: 0 });
  assert.equal((await f.request('/api/workspace/scheduling/' + p.id + '/privacy', alice, 'PATCH', { anonymous: true, version: 1 })).status, 403);
  assert.equal((await f.request('/api/workspace/scheduling/' + p.id + '/privacy', admin, 'PATCH', { anonymous: true, version: 1 })).status, 200);
  const publicText = await (await f.request(path, b)).text(); assert.ok(!publicText.includes('Private A')); const publicView = JSON.parse(publicText).poll; assert.equal(publicView.responseCount, 1); assert.equal(publicView.slots[0].totals.yes, 1); assert.equal(publicView.responses, undefined);
  assert.equal((await (await f.request(path, a)).json()).poll.myResponse.name, 'Private A');
  assert.equal((await (await f.request('/api/workspace/scheduling/' + p.id, alice)).json()).poll.responses[0].name, 'Private A');
});
test('simultaneous votes and decisions cannot silently overwrite each other; closed polls reject new votes', async t => {
  const f = await fixture(t), alice = await f.login('alice@example.com'), p = await created(f, alice), path = '/api/scheduling/polls/' + p.id;
  const a = await guest(f, p.id), b = await guest(f, p.id);
  const results = await Promise.all([f.request(path + '/response', a, 'POST', { name: 'A', votes: ['yes', 'no'], version: 0 }), f.request(path + '/response', b, 'POST', { name: 'B', votes: ['no', 'yes'], version: 0 })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const decision = '/api/workspace/scheduling/' + p.id + '/decision';
  assert.equal((await f.request(decision, alice, 'POST', { action: 'finalize', slotId: '1', meetingUrl: 'http://www', version: 1 })).status, 400);
  assert.equal((await f.request(decision, alice, 'POST', { action: 'finalize', slotId: '1', meetingUrl: '', version: 0 })).status, 409);
  assert.equal((await f.request(decision, alice, 'POST', { action: 'finalize', slotId: '1', meetingUrl: '', version: 1 })).status, 200);
  assert.equal((await f.request(path + '/response', a, 'POST', { name: 'A', votes: ['yes', 'yes'], version: 2 })).status, 409);
  const ics = await (await f.request(path + '/calendar.ics')).text(); assert.match(ics, /STATUS:CONFIRMED/); assert.ok(!ics.includes('ATTENDEE'));
  assert.equal((await f.request(decision, alice, 'POST', { action: 'cancel', version: 2 })).status, 200);
  assert.match(await (await f.request(path + '/calendar.ics')).text(), /STATUS:CANCELLED/);
});
test('deadline, response cap, disabled flag, and unknown poll references are enforced', async t => {
  const f = await fixture(t), alice = await f.login('alice@example.com'), p = await created(f, alice), path = '/api/scheduling/polls/' + p.id, a = await guest(f, p.id);
  const stored = f.scheduling.polls.get(p.id); stored.deadline = new Date(Date.now() - 1);
  assert.equal((await f.request(path + '/response', a, 'POST', { name: 'A', votes: ['yes', 'no'], version: 0 })).status, 409);
  stored.deadline = new Date(Date.now() + 100000); stored.responses = Array.from({ length: 100 }, (_, i) => ({ guestHash: String(i), name: 'Existing', votes: ['yes', 'no'] }));
  assert.equal((await f.request(path + '/response', a, 'POST', { name: 'A', votes: ['yes', 'no'], version: 0 })).status, 409);
  assert.equal((await f.request('/api/scheduling/polls/' + token())).status, 404);
  const disabled = await fixture(t, false); assert.equal((await disabled.request('/schedule/' + token())).status, 503);
});
test('Mongo store enforces revision and open deadline in the atomic write; data stays in separate bounded documents', async () => {
  let query, update, options;
  const collection = { createIndex: async () => {}, findOneAndUpdate: async (q, u, o) => { query = q; update = u; options = o; return null; } };
  const store = createSchedulingStore(async () => collection);
  await store.change(token(), 3, { responses: [] }, 'response-added', 'participant', true);
  assert.equal(query.version, 3); assert.equal(query.status, 'open'); assert.ok(query.deadline.$gt instanceof Date);
  assert.equal(update.$inc.version, 1); assert.equal(update.$push.history.$slice, -50); assert.equal(options.writeConcern.w, 'majority');
});
test('calendar export uses stable UID and escapes/folds user content; hidden poll projection omits credentials', () => {
  const p = { _id: token(), ...checkPoll(input()).value, status: 'finalized', selectedSlotId: '1', title: 'A\nATTENDEE:injected', description: 'é'.repeat(150), version: 4, updatedAt: new Date(), anonymous: true, ownerId: 'private-owner', responses: [{ guestHash: digest('private'), name: 'Hidden', votes: ['yes', 'no'] }] };
  const body = calendar(p); assert.ok(!body.includes('\r\nATTENDEE:')); body.split('\r\n').forEach(l => assert.ok(Buffer.byteLength(l) <= 75));
  assert.equal(pollView(p, null).responses, undefined); assert.equal(pollView(p, null).ownerId, undefined);
});
