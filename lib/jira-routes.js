'use strict';
const express = require('express');
const { jiraConfig, createJiraService } = require('./jira-service');
function registerJira(app, { env, origin, store, sameOrigin, service }) {
  app.use('/api/workspace/jira', (req, res, next) => req.staff.permissions.includes('work:read') ? next() : res.status(403).json({ message: 'Project work access is required.' }));
  let jira;
  try { const config = jiraConfig(env, origin); if (config) jira = service || createJiraService(config, store.jira); } catch (_) { /* Fail closed without affecting staff login. */ }
  const run = fn => async (req, res) => {
    try { await fn(req, res); } catch (error) {
      const messages = { RECONNECT_REQUIRED: 'Connect your Jira account again.', JIRA_PERMISSION: 'Your Jira account does not have the required site or project access.', JIRA_RATE_LIMIT: 'Jira is busy. Please wait a minute and retry.', JIRA_BUSY: 'Another Jira request is in progress. Please retry.', INVALID_STATE: 'This connection request expired or belongs to another sign-in. Start again.' };
      const code = Object.hasOwn(messages, error.code) ? error.code : 'JIRA_UNAVAILABLE';
      if (req.path.endsWith('/callback')) return res.redirect(303, '/workspace?jira=failed');
      if (code === 'JIRA_RATE_LIMIT') res.set('Retry-After', '60');
      res.status(messages[code] ? error.status : 503).json({ code, message: messages[code] || 'Jira is unavailable. Please retry.' });
    }
  };
  const configured = (req, res, next) => jira ? next() : res.status(503).json({ code: 'SETUP_REQUIRED', message: 'Jira connection is awaiting administrator setup.' });
  const limits = run(async (req, res) => {
    const limit = await store.adminLimit('jira:' + req.admin.id, 60, 60, Date.now());
    if (!limit.allowed) { res.set('Retry-After', String(limit.retryAfter)); return res.status(429).json({ message: 'Please wait before making another Jira request.' }); }
    res.locals.jiraAllowed = true;
  });
  const rate = async (req, res, next) => { await limits(req, res); if (res.locals.jiraAllowed) next(); };
  const parse = express.json({ limit: '4kb', strict: true });
  app.get('/api/workspace/jira', run(async (req, res) => res.json(jira ? await jira.status(req.admin.id) : { configured: false, connected: false })));
  app.post('/api/workspace/jira/connect', configured, sameOrigin, parse, rate, run(async (req, res) => res.json(await jira.start(req.admin.id, req.staffSessionId))));
  app.get('/api/workspace/jira/callback', configured, rate, run(async (req, res) => {
    const { code, state } = req.query;
    if (req.query.error || typeof code !== 'string' || code.length < 1 || code.length > 8192 || typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)) return res.redirect(303, '/workspace?jira=failed');
    await jira.callback(req.admin.id, req.staffSessionId, state, code); res.redirect(303, '/workspace?jira=connected');
  }));
  app.delete('/api/workspace/jira', configured, sameOrigin, rate, run(async (req, res) => { await jira.disconnect(req.admin.id); res.json({ success: true }); }));
  app.get('/api/workspace/jira/tasks', configured, rate, run(async (req, res) => {
    const cursor = req.query.nextPageToken;
    if (Object.keys(req.query).some(k => k !== 'nextPageToken') || (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 4096))) return res.status(400).json({ message: 'Invalid task page.' });
    res.json(await jira.tasks(req.admin.id, cursor));
  }));
}
module.exports = { registerJira };
