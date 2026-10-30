'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createApp } = require('../app');
const { createStaffAccess } = require('../lib/staff-access');
const { buildFixture } = require('./helpers/auth-fixture');
async function fixture(t) {
  const members = new Map(), origin = 'http://localhost:4000';
  const store = {
    async adminLimit() { return { allowed: true }; },
    async getStaff(email) { return members.get(email) || null; },
    async listStaff() { return { members: [...members.values()], next: null }; },
    async inviteStaff(email, roles, actor, relationship = 'employee') { if (members.has(email)) return null; const m = { email, roles, relationship, status: 'invited', version: 0, invitationExpiresAt: new Date(Date.now() + 86400000) }; members.set(email, m); return m; },
    async activateStaff(email) { const m = members.get(email); if (!m || m.status === 'suspended' || new Date(m.invitationExpiresAt) <= new Date()) return null; if (m.status === 'invited') { m.status = 'active'; m.version++; } return m; },
    async updateStaff(email, roles, status, version, actor, relationship = 'employee') { const m = members.get(email); if (!m || m.version !== version) return null; Object.assign(m, { roles, relationship, status, version: version + 1, sessionValidAfter: new Date() }); return m; }
  };
  const config = { origin, secret: randomBytes(32).toString('hex'), emails: new Set(['admin@example.com']), prefix: 'staff_test_' };
  const access = createStaffAccess(config, store, true); config.allowEmail = email => access.allowed(email);
  const f = await buildFixture(config);
  const env = { SWS_ADMIN_ENABLED: 'true', SWS_STAFF_ENABLED: 'true', SWS_AUTH_ORIGIN: origin, SWS_AUTH_SECRET: config.secret, SWS_ADMIN_EMAILS: 'admin@example.com', SWS_PRODUCT_MANAGER_EMAILS: 'admin@example.com' };
  const app = createApp({ env, store, authRuntime: f.runtime, enablePhoneVerification: false });
  const listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r)); t.after(() => new Promise(r => listener.close(r)));
  const request = (path, cookie, method = 'GET', body, requestOrigin = origin) => fetch(`http://127.0.0.1:${listener.address().port}` + path, { method, redirect: 'manual', headers: { Cookie: cookie || '', ...(method === 'GET' ? {} : { Origin: requestOrigin, 'Content-Type': 'application/json' }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function login(email) {
    const count = f.sent.length;
    assert.equal((await request('/api/admin-auth/request-code', '', 'POST', { email })).status, 200);
    assert.equal(f.sent.length, count + 1);
    const r = await request('/api/admin-auth/verify-code', '', 'POST', { email, code: f.sent.at(-1).code }); assert.equal(r.status, 200);
    return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  }
  return { ...f, request, login, members };
}
test('staff invitation requires admin; verified employee has workspace but no inquiry/team access; suspension applies to existing session', async t => {
  const s = await fixture(t), admin = await s.login('admin@example.com');
  assert.equal((await s.request('/api/admin/team')).status, 401);
  let r = await s.request('/api/admin/team', admin, 'POST', { email: 'Staff@example.com', relationship: 'employee', roles: ['developer'] }); assert.equal(r.status, 201);
  const cookie = await s.login('staff@example.com'); assert.equal(s.members.get('staff@example.com').status, 'active');
  assert.equal((await s.request('/workspace', cookie)).status, 200);
  assert.deepEqual((await (await s.request('/api/workspace/me', cookie)).json()).roles, ['developer']);
  for (const path of ['/api/admin/team', '/admin/team', '/api/admin/inquiries']) assert.equal((await s.request(path, cookie)).status, 403);
  assert.equal((await s.request('/api/admin/team', cookie, 'POST', { email: 'evil@example.com', relationship: 'employee', roles: ['developer', 'admin'] })).status, 403);
  r = await s.request('/api/admin/team/staff%40example.com', admin, 'PATCH', { relationship: 'employee', roles: ['developer'], status: 'suspended', version: 1 }); assert.equal(r.status, 200);
  assert.equal((await s.request('/api/workspace/me', cookie)).status, 403);
  assert.equal((await s.request('/api/workspace/jira/tasks', cookie)).status, 403);
  const before = s.sent.length; await s.request('/api/admin-auth/request-code', '', 'POST', { email: 'staff@example.com' }); assert.equal(s.sent.length, before);
  await s.request('/api/admin/team/staff%40example.com', admin, 'PATCH', { relationship: 'employee', roles: ['developer'], status: 'active', version: 2 });
  assert.equal((await s.request('/api/workspace/me', cookie)).status, 403);
  assert.equal((await s.request('/api/workspace/jira/tasks', cookie)).status, 403);
  assert.equal((await s.request('/api/workspace/me', await s.login('staff@example.com'))).status, 200);
});
test('product-manager has work permission, cannot manage access or customer inquiries; stale writes and bootstrap changes are rejected', async t => {
  const s = await fixture(t), admin = await s.login('admin@example.com');
  await s.request('/api/admin/team', admin, 'POST', { email: 'pm@example.com', relationship: 'employee', roles: ['developer', 'product-manager'] });
  const pm = await s.login('pm@example.com');
  const me = await (await s.request('/api/workspace/me', pm)).json(); assert.ok(me.permissions.includes('work:manage')); assert.ok(!me.permissions.includes('inquiries:manage'));
  assert.equal((await s.request('/admin/team', pm)).status, 403);
  assert.equal((await s.request('/api/admin/team/pm%40example.com', admin, 'PATCH', { relationship: 'employee', roles: ['developer'], status: 'active', version: 0 })).status, 409);
  assert.equal((await s.request('/api/admin/team/admin%40example.com', admin, 'PATCH', { relationship: 'employee', roles: ['developer'], status: 'suspended', version: 0 })).status, 409);
  for (const roles of [['owner'], ['employee'], ['developer', 'developer']]) assert.equal((await s.request('/api/admin/team', admin, 'POST', { email: 'bad@example.com', relationship: 'employee', roles })).status, 400);
  assert.equal((await s.request('/api/admin/team', admin, 'POST', { email: 'bad@example.com', relationship: 'employee', roles: ['developer'], permissions: ['team:manage'] })).status, 400);
  assert.equal((await s.request('/api/admin/team', admin, 'POST', { email: 'bad@example.com', relationship: 'employee', roles: ['developer'] }, 'https://evil.example')).status, 403);
  const configured = await (await s.request('/api/workspace/me', admin)).json(); assert.ok(configured.roles.includes('product-manager'));
});
test('expired and revoked invitations cannot request or redeem codes', async t => {
  const s = await fixture(t), admin = await s.login('admin@example.com');
  await s.request('/api/admin/team', admin, 'POST', { email: 'late@example.com', relationship: 'employee', roles: ['developer'] });
  await s.request('/api/admin-auth/request-code', '', 'POST', { email: 'late@example.com' }); const code = s.sent.at(-1).code;
  s.members.get('late@example.com').invitationExpiresAt = new Date(0);
  assert.equal((await s.request('/api/admin-auth/verify-code', '', 'POST', { email: 'late@example.com', code })).status, 400);
  const before = s.sent.length; await s.request('/api/admin-auth/request-code', '', 'POST', { email: 'late@example.com' }); assert.equal(s.sent.length, before);
});

test('contractor Developer can sign in but cannot assign roles or access inquiries; relationship grants no permissions', async t => {
  const s = await fixture(t), admin = await s.login('admin@example.com');
  const invitation = await s.request('/api/admin/team', admin, 'POST', { email: 'contractor@example.com', relationship: 'contractor', roles: ['developer'] });
  assert.equal(invitation.status, 201); assert.equal((await invitation.json()).member.relationship, 'contractor');
  const cookie = await s.login('contractor@example.com');
  const me = await (await s.request('/api/workspace/me', cookie)).json();
  assert.equal(me.relationship, 'contractor'); assert.deepEqual(me.roles, ['developer']); assert.deepEqual(me.permissions, ['workspace:read', 'work:read']);
  for (const path of ['/api/admin/team', '/api/admin/inquiries']) assert.equal((await s.request(path, cookie)).status, 403);
  for (const relationship of ['admin', '', undefined]) assert.equal((await s.request('/api/admin/team', admin, 'POST', { email: 'bad@example.com', relationship, roles: ['developer'] })).status, 400);
  const base = await s.request('/api/admin/team', admin, 'POST', { email: 'base@example.com', relationship: 'contractor', roles: [] }); assert.equal(base.status, 201);
  assert.deepEqual((await (await s.request('/api/workspace/me', await s.login('base@example.com'))).json()).permissions, ['workspace:read', 'work:read']);
});
test('legacy Employee role retains workspace access without inventing a Developer role or changing stored data', async () => {
  const record = { email: 'legacy@example.com', status: 'active', roles: ['employee', 'product-manager'] };
  const access = createStaffAccess({ emails: new Set() }, { getStaff: async () => record }, true);
  const member = await access.current(record.email);
  assert.equal(member.relationship, 'employee'); assert.deepEqual(member.roles, ['product-manager']); assert.ok(member.permissions.includes('workspace:read')); assert.deepEqual(record.roles, ['employee', 'product-manager']);
});
