'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { createApp } = require('../app');
const { buildFixture } = require('./helpers/auth-fixture');

async function server(t, { state, ...overrides } = {}) {
  const config = { origin: 'http://localhost:4000', secret: randomBytes(32).toString('hex'), emails: new Set(['admin@example.com']), prefix: 'test_auth_' };
  const f = await buildFixture(config);
  const counters = state || new Map();
  const documents = new Map([[randomUUID(), { reference: 'SWS-TEST', fullName: '<script>alert(1)</script>', email: 'client@example.com', status: 'new', version: 0 }]]);
  const store = {
    async adminLimit(key, max, seconds, time) { const k = `${key}:${Math.floor(time / (seconds * 1000))}`; const count = (counters.get(k) || 0) + 1; counters.set(k, count); return { allowed: count <= max, retryAfter: seconds }; },
    async listInquiries({ page }) { return { inquiries: [...documents].map(([id, d]) => ({ id, ...d })), page, hasMore: false }; },
    async getInquiry(id) { const d = documents.get(id); return d ? { id, ...d } : null; },
    async changeInquiryStatus(id, status, version, actor) { const d = documents.get(id); if (!d || d.version !== version) return null; d.status = status; d.version++; d.changedBy = actor; return { id, ...d }; },
    ...overrides.store
  };
  const env = { SWS_ADMIN_ENABLED: 'true', SWS_AUTH_ORIGIN: config.origin, SWS_AUTH_SECRET: config.secret, SWS_ADMIN_EMAILS: 'admin@example.com' };
  const app = createApp({ env, enablePhoneVerification: false, store, authRuntime: f.runtime, ...overrides, store });
  const listener = app.listen(0, '127.0.0.1'); await new Promise(r => listener.once('listening', r));
  t.after(() => new Promise(r => listener.close(r)));
  const base = `http://127.0.0.1:${listener.address().port}`;
  const request = (p, { method = 'GET', body, cookie, origin = config.origin, headers = {}, ...options } = {}) => fetch(base + p, { method, redirect: 'manual', headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), ...options });
  async function login() {
    assert.equal((await request('/api/admin-auth/request-code', { method: 'POST', body: { email: 'ADMIN@example.com' } })).status, 200);
    const response = await request('/api/admin-auth/verify-code', { method: 'POST', body: { email: 'admin@example.com', code: f.sent.at(-1).code } });
    assert.equal(response.status, 200);
    const data = await response.json(); assert.deepEqual(data, { success: true });
    return response.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  }
  return { ...f, request, login, documents, config };
}

test('private pages/APIs deny anonymous access and cannot be cached or indexed', async t => {
  const s = await server(t);
  for (const p of ['/api/admin/inquiries', '/api/admin/me', '/api/admin/inquiries/' + [...s.documents.keys()][0]]) {
    const r = await s.request(p); assert.equal(r.status, 401); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.match(r.headers.get('x-robots-tag'), /noindex/); assert.doesNotMatch(await r.text(), /client@example/);
  }
  const r = await s.request('/admin/inquiries'); assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/login');
  assert.equal((await s.request('/api/auth/sign-up/email', { method: 'POST', body: {} })).status, 404);
});

test('approved sign-in can read inquiries, update status, detect conflicts and sign out', async t => {
  const s = await server(t), cookie = await s.login(), id = [...s.documents.keys()][0];
  assert.equal((await s.request('/admin/inquiries', { cookie })).status, 200);
  const list = await (await s.request('/api/admin/inquiries', { cookie })).json(); assert.equal(list.inquiries.length, 1);
  const updated = await s.request('/api/admin/inquiries/' + id + '/status', { method: 'PATCH', cookie, body: { status: 'in-progress', version: 0 } }); assert.equal(updated.status, 200);
  assert.equal((await updated.json()).inquiry.status, 'in-progress');
  assert.equal((await s.request('/api/admin/inquiries/' + id + '/status', { method: 'PATCH', cookie, body: { status: 'closed', version: 0 } })).status, 409);
  assert.equal((await s.request('/api/admin-auth/sign-out', { method: 'POST', cookie })).status, 200);
  assert.equal((await s.request('/api/admin/inquiries', { cookie })).status, 401);
});

test('non-admin addresses get generic responses, no code, and no inquiry access', async t => {
  const s = await server(t);
  const r = await s.request('/api/admin-auth/request-code', { method: 'POST', body: { email: 'visitor@example.com', role: 'admin' } }); assert.equal(r.status, 200); assert.equal(s.sent.length, 0); assert.match((await r.json()).message, /If this address/);
  assert.equal((await s.request('/api/admin-auth/verify-code', { method: 'POST', body: { email: 'visitor@example.com', code: '123456' } })).status, 400);
  const cookie = await s.login();
  s.config.emails.clear(); // Auth provider no longer permits this identity; server config below is independent.
  // Return a valid authenticated identity without the configured SWS admin permission.
  s.runtime.session = async () => ({ user: { id: 'visitor', email: 'visitor@example.com', emailVerified: true }, session: {} });
  assert.equal((await s.request('/api/admin/inquiries', { cookie })).status, 403);
});

test('CSRF, unknown filters, invalid IDs and arbitrary status fields are rejected', async t => {
  const s = await server(t), cookie = await s.login(), id = [...s.documents.keys()][0];
  for (const origin of ['https://foreign.example', 'null']) assert.equal((await s.request('/api/admin-auth/request-code', { method: 'POST', origin, body: { email: 'admin@example.com' } })).status, 403);
  assert.equal((await s.request('/api/admin-auth/sign-out', { method: 'POST', cookie, origin: '' })).status, 403);
  for (const p of ['/api/admin/inquiries?status[$ne]=closed', '/api/admin/inquiries?page[]=1', '/api/admin/inquiries?page=1001', '/api/admin/inquiries?sort=goal', '/api/admin/inquiries/invalid']) assert.equal((await s.request(p, { cookie })).status, 400, p);
  assert.equal((await s.request('/api/admin/inquiries/' + id + '/status', { method: 'PATCH', cookie, origin: 'https://evil.example', body: { status: 'closed', version: 0 } })).status, 403);
  for (const body of [{ status: 'delete', version: 0 }, { status: 'closed', version: 0, role: 'admin' }, { status: 'closed', version: -1 }]) assert.equal((await s.request('/api/admin/inquiries/' + id + '/status', { method: 'PATCH', cookie, body })).status, 400);
});

test('durable resend limits apply across separate application instances', async t => {
  const state = new Map(), a = await server(t, { state }), b = await server(t, { state });
  const body = { email: 'admin@example.com' };
  assert.equal((await a.request('/api/admin-auth/request-code', { method: 'POST', body })).status, 200);
  const r = await b.request('/api/admin-auth/request-code', { method: 'POST', body }); assert.equal(r.status, 429); assert.ok(r.headers.get('retry-after'));
});

test('missing configuration and database failures fail closed without leaking data', async t => {
  const disabled = await server(t, { env: {} }); assert.equal((await disabled.request('/api/admin/inquiries')).status, 503);
  const failed = await server(t, { store: { listInquiries: async () => { throw Error('secret database details'); } } }); const cookie = await failed.login();
  const r = await failed.request('/api/admin/inquiries', { cookie }); assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /secret database/);
});

test('forged session cookies do not grant access', async t => {
  const s = await server(t);
  assert.equal((await s.request('/api/admin/inquiries', { cookie: 'test_auth_.session_token=forged.admin.value' })).status, 401);
});

test('configuration rejects untrusted origins and mail delivery failures are explicit to the sender', async () => {
  const { adminConfig, codeMailer } = require('../lib/admin-config');
  const base = { SWS_ADMIN_ENABLED: 'true', SWS_AUTH_SECRET: randomBytes(32).toString('hex'), SWS_ADMIN_EMAILS: ' ADMIN@example.com,admin@example.com ' };
  assert.equal(adminConfig({ ...base, SWS_AUTH_ORIGIN: 'http://localhost:4000' }).emails.size, 1);
  for (const origin of ['http://foreign.example', 'https://trusted.example/path', 'https://trusted.example/', 'https://user:password@trusted.example']) assert.throws(() => adminConfig({ ...base, SWS_AUTH_ORIGIN: origin }));
  assert.equal(adminConfig({}), null);
  await assert.rejects(codeMailer({ SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'site@example.com' }, { sendMail: async () => ({ accepted: [], rejected: ['admin@example.com'] }) })('admin@example.com', '123456'), /MAIL_FAILED/);
});
