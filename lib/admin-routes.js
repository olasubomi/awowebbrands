'use strict';
const express = require('express');
const path = require('path');
const { randomBytes } = require('crypto');
const { adminConfig, codeMailer, lazyRuntime, emailPattern } = require('./admin-config');
const { adminPage } = require('./admin-pages');
const { staffPage } = require('./staff-pages');
const { registerJira } = require('./jira-routes');
const { registerCommunity } = require('./community-routes');
const { registerGoogleCalendar } = require('./google-calendar-routes');
const { createStaffAccess, normalizeEmail, validEmail, validRoles, validRelationship, roles } = require('./staff-access');
const { services, generalService } = require('./services');
const statuses = ['new', 'in-progress', 'closed'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function registerAdmin(app, { env, store, authRuntime, sendAdminCode, jiraService }) {
  let config, configError;
  try { config = adminConfig(env); } catch (_) { configError = true; }
  const staffEnabled = env.SWS_STAFF_ENABLED === 'true';
  const access = config ? createStaffAccess(config, store, staffEnabled) : null;
  if (config) config.allowEmail = email => access.allowed(email);
  const getRuntime = authRuntime ? async () => authRuntime : config ? lazyRuntime(env, config, sendAdminCode || codeMailer(env)) : null;
  const privateHeaders = (req, res, next) => {
    res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('X-Frame-Options', 'DENY');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"); next();
  };
  const ready = (req, res, next) => config && !configError ? next() : res.status(503).json({ message: 'Admin sign-in is not available yet.' });
  const safe = handler => async (req, res, next) => {
    try { await handler(req, res, next); } catch (_) {
      const incident = randomBytes(6).toString('hex'); console.error(JSON.stringify({ event: 'admin_request_failed', incident }));
      if (!res.headersSent) res.status(503).json({ message: 'We could not complete this admin request. Please retry.', incident });
    }
  };
  const sameOrigin = (req, res, next) => {
    if (req.get('origin') !== config.origin || !req.is('application/json')) return res.status(403).json({ message: 'Use the sign-in website to make this request.' });
    next();
  };
  const parse = express.json({ limit: '4kb', strict: true });
  const emailOf = body => typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  async function limited(req, res, kind, email) {
    const sending = kind === 'send';
    const checks = [ [`${kind}:ip:${req.ip}`, sending ? 10 : 30, 600], [`${kind}:email:${email}`, sending ? 3 : 8, 600] ];
    if (sending) checks.push([`cooldown:${email}`, 1, 60]);
    for (const [key, limit, seconds] of checks) {
      const result = await store.adminLimit(key, limit, seconds, Date.now());
      if (!result.allowed) { res.set('Retry-After', String(result.retryAfter)); res.status(429).json({ message: 'Please wait before trying again.' }); return true; }
    }
    return false;
  }
  const requireStaff = safe(async (req, res, next) => {
    const session = await (await getRuntime()).session(req);
    if (!session) return req.originalUrl.startsWith('/api/') ? res.status(401).json({ message: 'Please sign in.' }) : res.redirect(303, '/login');
    if (!session.user?.emailVerified || typeof session.user.email !== 'string') return res.status(403).json({ message: 'Staff access is required.' });
    const member = await access.current(session.user.email.toLowerCase());
    if (!member || (member.sessionValidAfter && !(new Date(session.session?.createdAt).getTime() >= new Date(member.sessionValidAfter).getTime()))) return res.status(403).json({ message: 'Staff access is required.' });
    req.staffSessionId = session.session.id; req.staff = member; req.admin = { id: session.user.id, email: session.user.email }; next();
  });
  const requireAdmin = (req, res, next) => req.staff.permissions.includes('team:manage') ? next() : res.status(403).json({ message: 'Admin access is required.' });
  app.use(['/login', '/admin', '/workspace', '/api/workspace', '/api/admin-auth', '/api/admin'], privateHeaders);
  app.use('/admin-assets', express.static(path.join(__dirname, '../public_html/assets/admin'), { maxAge: 0 }));
  app.get(['/login', '/login/'], (req, res) => res.status(config ? 200 : 503).send(adminPage('login', !!config, config?.origin)));
  app.post('/api/admin-auth/request-code', ready, sameOrigin, parse, safe(async (req, res) => {
    const email = emailOf(req.body);
    if (!emailPattern.test(email) || email.length > 254) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (await limited(req, res, 'send', email)) return;
    if (await access.allowed(email)) await (await getRuntime()).requestCode(email, req);
    res.json({ message: 'If this address has approved access, a sign-in code has been sent. It expires in 5 minutes.' });
  }));
  app.post('/api/admin-auth/verify-code', ready, sameOrigin, parse, safe(async (req, res) => {
    const email = emailOf(req.body), code = req.body?.code;
    if (!emailPattern.test(email) || email.length > 254 || typeof code !== 'string' || !/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Enter your email and six-digit code.' });
    if (await limited(req, res, 'verify', email)) return;
    if (!await access.allowed(email)) return res.status(400).json({ message: 'The code is invalid or expired. Request a new code.' });
    let result;
    try { result = await (await getRuntime()).verifyCode(email, code, req); }
    catch (error) { if (error.statusCode >= 500 || !error.statusCode) throw error; return res.status(400).json({ message: 'The code is invalid or expired. Request a new code.' }); }
    if (!result.ok) { if (result.status >= 500) throw Error('AUTH_FAILED'); return res.status(400).json({ message: 'The code is invalid or expired. Request a new code.' }); }
    if (!await access.activate(email)) return res.status(403).json({ message: 'Staff access is no longer available.' });
    const cookies = result.headers.getSetCookie(); if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.json({ success: true });
  }));
  app.post('/api/admin-auth/sign-out', ready, sameOrigin, safe(async (req, res) => {
    const result = await (await getRuntime()).signOut(req);
    if (!result.ok) throw Error('SIGN_OUT_FAILED');
    const cookies = result.headers.getSetCookie(); if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.json({ success: true });
  }));
  // Do not expose the library's generic signup, account-editing or admin endpoints.
  app.use('/api/auth', privateHeaders, (req, res) => res.status(404).json({ message: 'Not found.' }));
  app.use(['/workspace', '/api/workspace'], ready, requireStaff);
  registerCommunity(app, { env, store, origin: config?.origin, sameOrigin, privateHeaders, requireStaff, ready, enabled: env.SWS_COMMUNITY_ENABLED === 'true' && staffEnabled });
  registerGoogleCalendar(app, { env, origin: config?.origin, store, sameOrigin });
  registerJira(app, { env, origin: config?.origin, store, sameOrigin, service: jiraService });
  app.get('/workspace', (req, res) => res.send(staffPage('workspace', req.staff, env.SWS_COMMUNITY_ENABLED === 'true' && staffEnabled)));
  app.get('/api/workspace/me', (req, res) => res.json({ id: req.admin.id, email: req.staff.email, roles: req.staff.roles, relationship: req.staff.relationship, permissions: req.staff.permissions }));
  app.use(['/admin', '/api/admin'], ready, requireStaff, requireAdmin);
  const staffReady = (req, res, next) => staffEnabled ? next() : res.status(503).json({ message: 'Team management is not enabled yet.' });
  app.get('/admin/team', staffReady, (req, res) => res.send(staffPage('team', req.staff)));
  app.get('/api/admin/team', staffReady, safe(async (req, res) => {
    const after = req.query.after || '';
    if (Object.keys(req.query).some(k => k !== 'after') || typeof after !== 'string' || (after && !validEmail(after))) return res.status(400).json({ message: 'Invalid team page.' });
    const result = await store.listStaff(after);
    res.json({ ...result, bootstrapMembers: await Promise.all([...config.emails].map(email => access.member(email))), availableRoles: roles });
  }));
  app.post('/api/admin/team', staffReady, sameOrigin, parse, safe(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email) || !validRoles(req.body?.roles) || !validRelationship(req.body?.relationship) || Object.keys(req.body).some(k => !['email', 'roles', 'relationship'].includes(k))) return res.status(400).json({ message: 'Provide an email, working relationship and valid staff roles.' });
    if (config.emails.has(email)) return res.status(409).json({ message: 'This administrator is managed through private configuration.' });
    const member = await store.inviteStaff(email, req.body.roles, req.admin.id, req.body.relationship);
    if (!member) return res.status(409).json({ message: 'This person is already listed. Update their existing access.' });
    res.status(201).json({ member, signInUrl: config.origin + '/login' });
  }));
  app.patch('/api/admin/team/:email', staffReady, sameOrigin, parse, safe(async (req, res) => {
    const email = normalizeEmail(req.params.email), body = req.body;
    if (!validEmail(email) || !validRoles(body?.roles) || !validRelationship(body?.relationship) || !['invited', 'active', 'suspended'].includes(body?.status) || !Number.isSafeInteger(body?.version) || body.version < 0 || Object.keys(body).some(k => !['roles', 'relationship', 'status', 'version'].includes(k))) return res.status(400).json({ message: 'Provide valid roles, status and version.' });
    if (config.emails.has(email) || (email === req.staff.email && (body.status !== 'active' || !body.roles.includes('admin')))) return res.status(409).json({ message: 'You cannot remove your own administrator access or change a configured administrator.' });
    const member = await store.updateStaff(email, body.roles, body.status, body.version, req.admin.id, body.relationship);
    if (!member) return res.status(409).json({ message: 'This person changed or is unavailable. Refresh before updating.' });
    res.json({ member });
  }));
  app.get(['/admin', '/admin/', '/admin/inquiries', '/admin/inquiries/:id'], (req, res) => res.send(adminPage('dashboard', true)));
  app.get('/api/admin/me', (req, res) => res.json({ email: req.admin.email, role: 'admin' }));
  app.get('/api/admin/inquiries', safe(async (req, res) => {
    const keys = Object.keys(req.query);
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const status = req.query.status || '', serviceId = req.query.serviceId || '';
    if (keys.some(k => !['page', 'status', 'serviceId'].includes(k)) || (req.query.page !== undefined && typeof req.query.page !== 'string') || !Number.isInteger(page) || page < 1 || page > 1000 || typeof status !== 'string' || typeof serviceId !== 'string' || (status && !statuses.includes(status)) || (serviceId && ![...services, generalService].some(s => s.id === serviceId))) return res.status(400).json({ message: 'Invalid inquiry filters.' });
    res.json(await store.listInquiries({ page, status, serviceId }));
  }));
  app.get('/api/admin/inquiries/:id', safe(async (req, res) => {
    if (!uuid.test(req.params.id)) return res.status(400).json({ message: 'Invalid inquiry reference.' });
    const inquiry = await store.getInquiry(req.params.id);
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found.' });
    res.json({ inquiry });
  }));
  app.patch('/api/admin/inquiries/:id/status', sameOrigin, parse, safe(async (req, res) => {
    if (!uuid.test(req.params.id) || !req.body || Object.keys(req.body).some(k => !['status', 'version'].includes(k)) || !statuses.includes(req.body.status) || !Number.isSafeInteger(req.body.version) || req.body.version < 0) return res.status(400).json({ message: 'Choose a valid status and refresh the inquiry.' });
    const result = await store.changeInquiryStatus(req.params.id, req.body.status, req.body.version, req.admin.id);
    if (!result) return res.status(409).json({ message: 'This inquiry changed or is unavailable. Reload it before updating.' });
    res.json({ inquiry: result });
  }));
}
module.exports = { registerAdmin };
