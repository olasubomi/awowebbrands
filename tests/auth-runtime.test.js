'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

async function fixture() {
  const { buildAuth, wrapAuth } = await import('../lib/admin-auth.mjs');
  const { memoryAdapter } = await import('better-auth/adapters/memory');
  const db = { test_auth_users: [], test_auth_sessions: [], test_auth_accounts: [], test_auth_verifications: [] };
  const config = { origin: 'http://localhost:4000', secret: randomBytes(32).toString('hex'), emails: new Set(['admin@example.com']), prefix: 'test_auth_' };
  const sent = [];
  const auth = buildAuth({ database: memoryAdapter(db), config, sendCode: async (email, code) => { sent.push({ email, code }); } });
  return { auth, runtime: wrapAuth(auth), config, db, sent, request: { headers: { origin: config.origin, host: 'localhost:4000' } } };
}
const cookieOf = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');

test('CommonJS loads isolated ESM auth: email code, HttpOnly session and sign-out', async () => {
  const f = await fixture();
  await f.runtime.requestCode('admin@example.com', f.request);
  assert.equal(f.sent.length, 1);
  const response = await f.runtime.verifyCode('admin@example.com', f.sent[0].code, f.request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
  const req = { headers: { ...f.request.headers, cookie: cookieOf(response) } };
  const session = await f.runtime.session(req);
  assert.equal(session.user.email, 'admin@example.com');
  assert.equal(session.user.emailVerified, true);
  await f.runtime.signOut(req);
  assert.equal(await f.runtime.session(req), null);
});

test('codes are hashed, wrong/reused codes fail, and concurrent redemption succeeds once', async () => {
  const f = await fixture();
  await f.runtime.requestCode('admin@example.com', f.request);
  const code = f.sent[0].code;
  assert.ok(!JSON.stringify(f.db).includes(code));
  assert.equal((await f.runtime.verifyCode('admin@example.com', 'not-a-code', f.request)).ok, false);
  const results = await Promise.allSettled([f.runtime.verifyCode('admin@example.com', code, f.request), f.runtime.verifyCode('admin@example.com', code, f.request)]);
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.ok).length, 1);
  assert.equal((await f.runtime.verifyCode('admin@example.com', code, f.request)).ok, false);
});

test('the library rejects non-allowlisted account creation', async () => {
  const f = await fixture();
  await f.runtime.requestCode('visitor@example.com', f.request);
  assert.equal(f.db.test_auth_users.length, 0);
  assert.equal(f.sent.length, 0);
});
module.exports = { fixture, cookieOf };

test('expired codes and sessions are rejected; three wrong attempts lock out the code', async () => {
  let f = await fixture();
  await f.runtime.requestCode('admin@example.com', f.request);
  f.db.test_auth_verifications.forEach(v => { v.expiresAt = new Date(Date.now() - 60000); });
  assert.equal((await f.runtime.verifyCode('admin@example.com', f.sent[0].code, f.request)).ok, false);
  f = await fixture();
  await f.runtime.requestCode('admin@example.com', f.request);
  let wrong = f.sent[0].code === '999999' ? '888888' : '999999';
  for (let i = 0; i < 3; i++) assert.equal((await f.runtime.verifyCode('admin@example.com', wrong, f.request)).ok, false);
  assert.equal((await f.runtime.verifyCode('admin@example.com', f.sent[0].code, f.request)).ok, false);
  f = await fixture(); await f.runtime.requestCode('admin@example.com', f.request);
  const response = await f.runtime.verifyCode('admin@example.com', f.sent[0].code, f.request);
  f.db.test_auth_sessions.forEach(s => { s.expiresAt = new Date(Date.now() - 60000); });
  assert.equal(await f.runtime.session({ headers: { ...f.request.headers, cookie: cookieOf(response) } }), null);
});
