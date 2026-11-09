'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('crypto');
const { MongoClient } = require('mongodb');
const { createMongoStore } = require('../lib/inquiry-store');

test('MongoDB adapter signs in and atomically consumes codes; inquiry updates preserve legacy records', { skip: !process.env.SWS_TEST_MONGODB_URI }, async t => {
  const uri = process.env.SWS_TEST_MONGODB_URI;
  const database = 'sws_auth_test_' + randomBytes(6).toString('hex');
  const client = await new MongoClient(uri).connect(), db = client.db(database);
  t.after(async () => { await db.dropDatabase(); await client.close(); });
  const { createRuntime } = await import('../lib/admin-auth.mjs');
  const config = { origin: 'http://localhost:4000', secret: randomBytes(32).toString('hex'), emails: new Set(['admin@example.com']), prefix: 'test_auth_' };
  const env = { MONGODB_URI: uri, MONGODB_DB: database };
  const sent = [];
  const runtime = await createRuntime(env, config, async (email, code) => sent.push({ email, code }));
  t.after(() => runtime.close());
  const req = { headers: { origin: config.origin, host: 'localhost:4000' } };
  await runtime.requestCode('admin@example.com', req);
  const response = await runtime.verifyCode('admin@example.com', sent[0].code, req);
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  assert.equal((await runtime.session({ headers: { ...req.headers, cookie } })).user.emailVerified, true);
  assert.equal((await runtime.verifyCode('admin@example.com', sent[0].code, req)).ok, false);
  const id = randomUUID();
  // Represents a pre-dashboard record: no managementVersion or statusHistory.
  await db.collection('inquiries').insertOne({ _id: id, reference: 'SWS-TEST', fullName: 'Legacy inquiry', email: 'person@example.com', status: 'new', serviceId: 'not-sure', serviceName: 'Help choosing a service', digest: 'private', notificationStatus: 'sent', acknowledgmentSent: true, createdAt: new Date(), updatedAt: new Date() });
  const store = createMongoStore(env);
  const detail = await store.getInquiry(id); assert.equal(detail.version, 0); assert.equal(detail.digest, undefined);
  const outcomes = await Promise.all([store.changeInquiryStatus(id, 'in-progress', 0, 'actor'), store.changeInquiryStatus(id, 'closed', 0, 'actor')]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  const changed = await store.getInquiry(id); assert.equal(changed.version, 1); assert.equal(changed.statusHistory.length, 1); assert.equal(changed.statusHistory[0].changedBy, 'actor');
  const raw = await db.collection('inquiries').findOne({ _id: id }); assert.equal(raw.digest, 'private'); assert.equal(raw.acknowledgmentSent, true);
  const list = await store.listInquiries({ page: 1, status: '', serviceId: '' }); assert.equal(list.inquiries[0].id, id);
  assert.ok(await store.inviteStaff('staff@example.com', ['developer'], 'actor', 'contractor'));
  assert.equal(await store.inviteStaff('staff@example.com', ['developer'], 'actor', 'contractor'), null);
  assert.equal((await store.activateStaff('staff@example.com')).status, 'active');
  const staffUpdates = await Promise.all([
    store.updateStaff('staff@example.com', ['developer'], 'suspended', 1, 'actor', 'contractor'),
    store.updateStaff('staff@example.com', ['developer', 'product-manager'], 'active', 1, 'actor', 'contractor')
  ]);
  assert.equal(staffUpdates.filter(Boolean).length, 1);
  const member = await store.getStaff('staff@example.com'); assert.equal(member.relationship, 'contractor'); assert.equal(member.version, 2); assert.ok(member.sessionValidAfter); assert.equal(member.history.length, 3);
  assert.equal((await store.listStaff('')).members.length, 1);
  await db.collection('sws_staff_preview').insertOne({ _id: 'expired@example.com', status: 'invited', roles: ['employee'], version: 0, invitationExpiresAt: new Date(0) });
  assert.equal(await store.activateStaff('expired@example.com'), null);
  const state = { _id: 'hashed-state', userId: 'one', sessionId: 'hashed-session', expiresAt: new Date(Date.now() + 60000) };
  await store.jira.putState(state);
  assert.equal(await store.jira.consumeState(state._id, 'other', state.sessionId), null);
  assert.ok(await store.jira.consumeState(state._id, state.userId, state.sessionId));
  assert.equal(await store.jira.consumeState(state._id, state.userId, state.sessionId), null);
  const lease = await store.jira.lock('one'); assert.ok(lease); assert.equal(await store.jira.lock('one'), null);
  await lease.save({ encrypted: 'test-ciphertext', accountId: 'jira-id' }); await lease.release();
  assert.equal((await store.jira.getConnection('one')).encrypted, 'test-ciphertext');
  const disconnectLease = await store.jira.lock('one'); await disconnectLease.disconnect(); await disconnectLease.release();
  assert.equal((await store.jira.getConnection('one')).encrypted, null);
  const community = store.community;
  const eventInput = { title: 'Test meeting', description: 'Test only', startsAt: new Date('2026-11-01T16:00:00Z'), endsAt: new Date('2026-11-01T17:00:00Z'), timezone: 'America/Los_Angeles', visibility: 'public', status: 'scheduled', meetingUrl: '' };
  const event = await community.create(eventInput, 'organizer');
  await community.rsvp(event._id, 'member', 'member@example.com', 'going');
  assert.equal((await community.milestones('member', new Date('2026-11-02T06:00:00Z'))).total, 0);
  const attendanceRace = await Promise.all([
    community.attendance(event._id, 'member', 'member@example.com', 'attended', 0, 'organizer'),
    community.attendance(event._id, 'member', 'member@example.com', 'did-not-attend', 0, 'organizer')
  ]);
  assert.equal(attendanceRace.filter(Boolean).length, 1);
  const attendanceRow = await community.response(event._id, 'member');
  await community.attendance(event._id, 'member', 'member@example.com', 'attended', attendanceRow.version, 'organizer');
  const milestones = await community.milestones('member', new Date('2026-11-02T06:00:00Z'));
  assert.equal(milestones.thisMonth, 1); assert.equal(milestones.participatedThisWeek, true); assert.equal(milestones.total, 1);
  // Midnight Monday after the DST change starts a new reporting week.
  assert.equal((await community.milestones('member', new Date('2026-11-02T08:00:00Z'))).participatedThisWeek, false);
  assert.equal((await community.milestones('other-member', new Date('2026-11-02T08:00:00Z'))).total, 0);
  await community.update(event._id, { ...eventInput, status: 'cancelled' }, 0, 'organizer');
  assert.equal((await community.milestones('member', new Date('2026-11-02T08:00:00Z'))).total, 0);
  const other = createMongoStore(env);
  t.after(async () => { await store.close(); await other.close(); });
  const a = await store.adminLimit('same-address', 1, 600, Date.now());
  const b = await other.adminLimit('same-address', 1, 600, Date.now());
  assert.equal(a.allowed, true); assert.equal(b.allowed, false);
});
