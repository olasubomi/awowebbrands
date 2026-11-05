'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { jiraConfig, createJiraService, seal, unseal } = require('../lib/jira-service');
const { createApp } = require('../app');
function fixture() {
  const config = jiraConfig({ SWS_JIRA_ENABLED: 'true', SWS_JIRA_CLIENT_ID: 'client', SWS_JIRA_CLIENT_SECRET: 'secret', SWS_JIRA_ENCRYPTION_KEY: randomBytes(32).toString('base64') }, 'https://staff.example.com');
  const states = new Map(), connections = new Map(), calls = [], held = new Set();
  const store = {
    async putState(s) { states.set(s._id, s); },
    async consumeState(id, userId, sessionId) { const s = states.get(id); if (!s || s.userId !== userId || s.sessionId !== sessionId || s.expiresAt <= new Date()) return null; states.delete(id); return s; },
    async getConnection(id) { return connections.get(id); },
    async lock(id) { if (held.has(id)) return null; held.add(id); let record = connections.get(id) || {}; return { record, async save(data) { record = { ...record, ...data }; connections.set(id, record); }, async disconnect() { await this.save({ encrypted: null }); }, async release() { held.delete(id); } }; }
  };
  let error = null, expires = 3600;
  const issue = (key, accountId = 'jira-u', project = 'SWS') => ({ key, fields: { summary: '<script>unsafe</script>', status: { name: 'In progress' }, priority: { name: 'High' }, duedate: '2026-11-01', project: { key: project }, assignee: { accountId }, description: 'PRIVATE' } });
  const request = async (url, options) => {
    calls.push({ url, ...options });
    if (error) return new Response('private provider diagnostics', { status: error });
    let data;
    if (url.endsWith('/oauth/token')) data = { access_token: 'private-access', refresh_token: 'private-refresh-' + calls.length, expires_in: expires };
    else if (url.endsWith('accessible-resources')) data = [{ id: config.cloudId, url: config.site, scopes: ['read:jira-work', 'read:jira-user'] }];
    else if (url.endsWith('/myself')) data = { accountId: 'jira-u', displayName: 'Jira User', active: true };
    else data = { issues: [issue('SWS-1'), issue('SWS-2', 'other'), issue('CCD-1', 'jira-u', 'CCD')], nextPageToken: 'cursor' };
    return new Response(JSON.stringify(data));
  };
  const service = createJiraService(config, store, request);
  async function connect(user = 'staff-u', session = 'session-u') { const { url } = await service.start(user, session); const state = new URL(url).searchParams.get('state'); await service.callback(user, session, state, 'code'); return state; }
  return { config, service, store, connections, states, calls, held, connect, setError: value => { error = value; }, setExpiry: value => { expires = value; } };
}
test('Jira setup fails closed and token ciphertext is bound to the staff identity', () => {
  assert.equal(jiraConfig({}, 'https://staff.example.com'), null);
  assert.throws(() => jiraConfig({ SWS_JIRA_ENABLED: 'true' }, 'http://localhost:4000'));
  const key = randomBytes(32), encrypted = seal(key, 'one', { access: 'secret' });
  assert.ok(!encrypted.includes('secret')); assert.equal(unseal(key, 'one', encrypted).access, 'secret');
  assert.throws(() => unseal(key, 'two', encrypted)); assert.throws(() => unseal(randomBytes(32), 'one', encrypted));
});
test('OAuth state is single use, expires, and is bound to both staff user and sign-in session', async () => {
  const f = fixture(), { url } = await f.service.start('u', 's'), state = new URL(url).searchParams.get('state');
  assert.match(url, /^https:\/\/auth.atlassian.com\/authorize/); assert.ok(!JSON.stringify([...f.states.values()]).includes(state));
  for (const [u, s] of [['other', 's'], ['u', 'other']]) await assert.rejects(f.service.callback(u, s, state, 'code'), { code: 'INVALID_STATE' });
  await f.service.callback('u', 's', state, 'code'); await assert.rejects(f.service.callback('u', 's', state, 'code'), { code: 'INVALID_STATE' });
  const expired = new URL((await f.service.start('u', 's')).url).searchParams.get('state'); for (const s of f.states.values()) s.expiresAt = new Date(0);
  await assert.rejects(f.service.callback('u', 's', expired, 'code'), { code: 'INVALID_STATE' });
});
test('assigned SWS tasks only; search cannot be supplied by client and token/private fields stay server-side', async () => {
  const f = fixture(); await f.connect();
  assert.ok(f.connections.get('staff-u').encrypted); assert.ok(!JSON.stringify(f.connections.get('staff-u')).includes('private-access'));
  const result = await f.service.tasks('staff-u', 'opaque'); assert.equal(result.tasks.length, 1); assert.equal(result.tasks[0].key, 'SWS-1');
  assert.equal(result.tasks[0].url, 'https://awowebops.atlassian.net/browse/SWS-1'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  const body = JSON.parse(f.calls.at(-1).body); assert.match(body.jql, /project = "SWS" AND assignee = currentUser\(\)/); assert.equal(body.maxResults, 20); assert.equal(body.nextPageToken, 'opaque');
  assert.ok(!JSON.stringify(await f.service.status('staff-u')).includes('private-access')); await assert.rejects(f.service.tasks('other-user'), { code: 'RECONNECT_REQUIRED' });
});
test('refresh rotates and persists credentials before search; concurrent work is rejected and disconnect removes credentials', async () => {
  const f = fixture(); await f.connect();
  const c = f.connections.get('staff-u'), old = unseal(f.config.key, 'staff-u', c.encrypted); old.expiresAt = new Date(0); c.encrypted = seal(f.config.key, 'staff-u', old);
  await f.service.tasks('staff-u'); const changed = unseal(f.config.key, 'staff-u', f.connections.get('staff-u').encrypted); assert.notEqual(changed.refresh, old.refresh);
  f.held.add('staff-u'); await assert.rejects(f.service.tasks('staff-u'), { code: 'JIRA_BUSY' }); f.held.clear();
  await f.service.disconnect('staff-u'); assert.equal((await f.service.status('staff-u')).connected, false); await assert.rejects(f.service.tasks('staff-u'), { code: 'RECONNECT_REQUIRED' });
});
test('provider failures expose safe codes and release connection locks', async () => {
  const f = fixture(); await f.connect();
  for (const [status, code] of [[429, 'JIRA_RATE_LIMIT'], [401, 'RECONNECT_REQUIRED'], [403, 'JIRA_PERMISSION'], [500, 'JIRA_UNAVAILABLE']]) {
    f.setError(status); await assert.rejects(f.service.tasks('staff-u'), error => error.code === code && !error.message.includes('private')); assert.equal(f.held.size, 0);
  }
});
test('Jira HTTP routes require active staff, CSRF protection and server identity; disabled setup is explicit', async t => {
  const calls = [], env = { SWS_ADMIN_ENABLED: 'true', SWS_AUTH_ORIGIN: 'https://staff.example.com', SWS_AUTH_SECRET: randomBytes(32).toString('hex'), SWS_ADMIN_EMAILS: 'admin@example.com', SWS_JIRA_ENABLED: 'true', SWS_JIRA_CLIENT_ID: 'client', SWS_JIRA_CLIENT_SECRET: 'secret', SWS_JIRA_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
  const authRuntime = { session: async req => req.headers.cookie ? { user: { id: 'server-user', email: 'admin@example.com', emailVerified: true }, session: { id: 'server-session', createdAt: new Date() } } : null };
  const jiraService = { status: async id => ({ configured: true, connected: true, id }), start: async (...args) => { calls.push(args); return { url: 'https://auth.atlassian.com/authorize' }; }, tasks: async (...args) => { calls.push(args); return { tasks: [] }; } };
  const app = createApp({ env, authRuntime, jiraService, store: { adminLimit: async () => ({ allowed: true }) }, enablePhoneVerification: false });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (p, cookie = 'valid') => fetch(base + p, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal((await get('/api/workspace/jira/tasks', '')).status, 401);
  const r = await get('/api/workspace/jira/tasks'); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.deepEqual(calls.pop(), ['server-user', undefined]);
  assert.equal((await get('/api/workspace/jira/tasks?assignee=other')).status, 400);
  const post = origin => fetch(base + '/api/workspace/jira/connect', { method: 'POST', headers: { Cookie: 'valid', Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'forged' }) });
  assert.equal((await post('https://evil.example')).status, 403); assert.equal((await post(env.SWS_AUTH_ORIGIN)).status, 200); assert.deepEqual(calls.pop(), ['server-user', 'server-session']);
  assert.equal((await get('/api/workspace/jira/callback?state=bad&code=bad')).headers.get('location'), '/workspace?jira=failed');
});

test('wrong Atlassian site is rejected before identity or credential storage', async () => {
  const f = fixture();
  const request = async url => new Response(JSON.stringify(url.endsWith('/oauth/token') ? { access_token: 'a', refresh_token: 'r', expires_in: 3600 } : [{ id: 'other-site', url: f.config.site, scopes: ['read:jira-work', 'read:jira-user'] }]));
  const service = createJiraService(f.config, f.store, request);
  const state = new URL((await service.start('u', 's')).url).searchParams.get('state');
  await assert.rejects(service.callback('u', 's', state, 'code'), { code: 'JIRA_PERMISSION' });
  assert.equal((await f.store.getConnection('u'))?.encrypted, undefined); assert.equal(f.held.size, 0);
});

test('missing Jira configuration preserves workspace login and reports setup required', async t => {
  const app = createApp({ env: { SWS_ADMIN_ENABLED: 'true', SWS_AUTH_ORIGIN: 'https://staff.example.com', SWS_AUTH_SECRET: randomBytes(32).toString('hex'), SWS_ADMIN_EMAILS: 'admin@example.com' }, authRuntime: { session: async () => ({ user: { id: 'u', email: 'admin@example.com', emailVerified: true }, session: { id: 's' } }) }, store: {}, enablePhoneVerification: false });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.deepEqual(await (await fetch(base + '/api/workspace/jira')).json(), { configured: false, connected: false });
  assert.equal((await fetch(base + '/api/workspace/jira/tasks')).status, 503); assert.equal((await fetch(base + '/workspace')).status, 200);
});
