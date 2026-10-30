'use strict';
const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const hash = s => createHash('sha256').update(s).digest('hex');
class JiraError extends Error { constructor(code, status = 503) { super(code); this.code = code; this.status = status; } }
function jiraConfig(env, origin) {
  if (env.SWS_JIRA_ENABLED !== 'true') return null;
  const key = Buffer.from(env.SWS_JIRA_ENCRYPTION_KEY || '', 'base64');
  const site = env.SWS_JIRA_SITE_ORIGIN || 'https://awowebops.atlassian.net';
  const cloudId = env.SWS_JIRA_CLOUD_ID || '056109ea-b80b-4779-a40c-4a029af5f0dc', project = env.SWS_JIRA_PROJECT_KEY || 'SWS';
  if (!origin?.startsWith('https://') || !env.SWS_JIRA_CLIENT_ID || !env.SWS_JIRA_CLIENT_SECRET || key.length !== 32 || key.toString('base64') !== env.SWS_JIRA_ENCRYPTION_KEY || !/^https:\/\/[a-z0-9-]+\.atlassian\.net$/.test(site) || !/^[a-f0-9-]{36}$/.test(cloudId) || !/^[A-Z][A-Z0-9_]{1,30}$/.test(project)) throw new JiraError('SETUP_REQUIRED');
  return { key, site, cloudId, project, clientId: env.SWS_JIRA_CLIENT_ID, clientSecret: env.SWS_JIRA_CLIENT_SECRET, callback: origin + '/api/workspace/jira/callback' };
}
function seal(key, userId, data) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join('.');
}
function unseal(key, userId, value) {
  const [iv, tag, encrypted] = value.split('.').map(s => Buffer.from(s, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(userId)); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8'));
}
function createJiraService(config, store, request = fetch) {
  async function call(url, options = {}) {
    let response;
    try { response = await request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) }); } catch (_) { throw new JiraError('JIRA_UNAVAILABLE'); }
    if (!response.ok) throw new JiraError(response.status === 429 ? 'JIRA_RATE_LIMIT' : (response.status === 401 || (url === 'https://auth.atlassian.com/oauth/token' && response.status === 400)) ? 'RECONNECT_REQUIRED' : response.status === 403 ? 'JIRA_PERMISSION' : 'JIRA_UNAVAILABLE', response.status === 429 ? 429 : (response.status === 401 || (url === 'https://auth.atlassian.com/oauth/token' && response.status === 400)) ? 409 : response.status === 403 ? 403 : 503);
    const text = await response.text(); if (text.length > 2e6) throw new JiraError('JIRA_UNAVAILABLE');
    try { return JSON.parse(text); } catch (_) { throw new JiraError('JIRA_UNAVAILABLE'); }
  }
  const api = (token, path, body) => call(`https://api.atlassian.com/ex/jira/${config.cloudId}${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function exchange(body) {
    const token = await call('https://auth.atlassian.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, ...body }) });
    if (typeof token.access_token !== 'string' || !token.access_token || typeof token.refresh_token !== 'string' || !token.refresh_token || !Number.isFinite(token.expires_in) || token.expires_in < 60 || token.expires_in > 86400) throw new JiraError('RECONNECT_REQUIRED', 409);
    return { access: token.access_token, refresh: token.refresh_token, expiresAt: new Date(Date.now() + token.expires_in * 1000) };
  }
  async function locked(userId, fn) {
    const lease = await store.lock(userId); if (!lease) throw new JiraError('JIRA_BUSY', 409);
    try { return await fn(lease); } finally { await lease.release(); }
  }
  return {
    async status(userId) { const c = await store.getConnection(userId); return { configured: true, connected: !!c?.encrypted, displayName: c?.encrypted ? c.displayName : null, project: config.project }; },
    async start(userId, sessionId) {
      const state = randomBytes(32).toString('base64url');
      await store.putState({ _id: hash(state), userId, sessionId: hash(sessionId), expiresAt: new Date(Date.now() + 600000) });
      const url = new URL('https://auth.atlassian.com/authorize');
      url.search = new URLSearchParams({ audience: 'api.atlassian.com', client_id: config.clientId, scope: 'read:jira-work read:jira-user offline_access', redirect_uri: config.callback, state, response_type: 'code', prompt: 'consent' }).toString();
      return { url: url.toString() };
    },
    async callback(userId, sessionId, state, code) {
      if (!await store.consumeState(hash(state), userId, hash(sessionId))) throw new JiraError('INVALID_STATE', 400);
      return locked(userId, async lease => {
        const token = await exchange({ grant_type: 'authorization_code', code, redirect_uri: config.callback });
        const sites = await call('https://api.atlassian.com/oauth/token/accessible-resources', { headers: { Authorization: `Bearer ${token.access}` } });
        const site = Array.isArray(sites) && sites.find(s => s.id === config.cloudId && s.url === config.site && ['read:jira-work', 'read:jira-user'].every(scope => s.scopes?.includes(scope)));
        if (!site) throw new JiraError('JIRA_PERMISSION', 403);
        const me = await api(token.access, '/rest/api/3/myself');
        if (typeof me.accountId !== 'string' || !me.accountId || me.active === false) throw new JiraError('JIRA_PERMISSION', 403);
        await lease.save({ encrypted: seal(config.key, userId, token), expiresAt: token.expiresAt, accountId: me.accountId, displayName: String(me.displayName || 'Jira user').slice(0, 200) });
      });
    },
    async disconnect(userId) { await locked(userId, lease => lease.disconnect()); },
    async tasks(userId, nextPageToken) {
      return locked(userId, async lease => {
        if (!lease.record.encrypted) throw new JiraError('RECONNECT_REQUIRED', 409);
        let token;
        try { token = unseal(config.key, userId, lease.record.encrypted); } catch (_) { throw new JiraError('RECONNECT_REQUIRED', 409); }
        if (!(new Date(token.expiresAt).getTime() > Date.now() + 60000)) {
          try { token = await exchange({ grant_type: 'refresh_token', refresh_token: token.refresh }); }
          catch (e) { if (e.status === 403 || e.code === 'RECONNECT_REQUIRED') { await lease.disconnect(); throw new JiraError('RECONNECT_REQUIRED', 409); } throw e; }
          // Persist the rotating refresh token before making any further API calls.
          await lease.save({ encrypted: seal(config.key, userId, token), expiresAt: token.expiresAt });
        }
        const result = await api(token.access, '/rest/api/3/search/jql', { jql: `project = "${config.project}" AND assignee = currentUser() ORDER BY updated DESC, key ASC`, maxResults: 20, fields: ['summary', 'status', 'priority', 'duedate', 'updated', 'project', 'assignee'], ...(nextPageToken ? { nextPageToken } : {}) });
        if (!Array.isArray(result.issues)) throw new JiraError('JIRA_UNAVAILABLE');
        // Defense in depth even if the provider returns an unexpected search result.
        const tasks = result.issues.filter(i => i.fields?.project?.key === config.project && i.fields?.assignee?.accountId === lease.record.accountId && new RegExp(`^${config.project}-[0-9]+$`).test(i.key)).slice(0, 20).map(i => ({ key: i.key, summary: String(i.fields.summary || '').slice(0, 500), status: String(i.fields.status?.name || ''), priority: String(i.fields.priority?.name || ''), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(i.fields.duedate) ? i.fields.duedate : null, updatedAt: i.fields.updated, url: config.site + '/browse/' + i.key }));
        return { tasks, nextPageToken: typeof result.nextPageToken === 'string' && result.nextPageToken.length <= 4096 ? result.nextPageToken : null, project: config.project, fetchedAt: new Date().toISOString() };
      });
    }
  };
}
module.exports = { jiraConfig, createJiraService, JiraError, seal, unseal };
