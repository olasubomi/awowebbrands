'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { categories, services, generalService } = require('./lib/services');
const { validateInquiry } = require('./lib/inquiry-validation');
const { createInquiryMailer } = require('./lib/inquiry-mailer');
const { createMongoStore } = require('./lib/inquiry-store');
const { registerAdmin } = require('./lib/admin-routes');
const { createSubmitInquiry } = require('./lib/submit-inquiry');
const { inquiryFailureCode } = require('./lib/inquiry-errors');
const { catalogPage, servicePage, aboutPage, notFoundPage, sitemap } = require('./lib/site-pages');

function createApp(options = {}) {
  const env = options.env || process.env;
  const app = express();
  app.disable('x-powered-by');
  if (env.VERCEL === '1') app.set('trust proxy', 1);
  if (env.TRUST_PROXY_HOPS && /^\d+$/.test(env.TRUST_PROXY_HOPS)) app.set('trust proxy', Number(env.TRUST_PROXY_HOPS));
  const sendInquiry = options.sendInquiry || createInquiryMailer(env);
  const store = options.store || createMongoStore(env);
  const submitInquiry = createSubmitInquiry(store, sendInquiry);
  const now = options.now || Date.now;
  const maxAttempts = options.maxAttempts || 20;

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (env.VERCEL_ENV === 'preview') res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  registerAdmin(app, { env, store, authRuntime: options.authRuntime, sendAdminCode: options.sendAdminCode, jiraService: options.jiraService });
  app.get('/api/services', (req, res) => res.json({ categories, services, generalService }));

  app.post('/api/inquiries', express.json({ limit: '20kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.is('application/json')) return res.status(415).json({ message: 'Send this request as JSON.' });
    const expectedOrigin = env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if (req.get('origin') && req.get('origin') !== expectedOrigin) return res.status(403).json({ message: 'Submit your inquiry from this website.' });
    const time = now();
    const rawKey = req.get('Idempotency-Key');
    const key = rawKey && rawKey.toLowerCase();
    if (!key || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key)) return res.status(400).json({ message: 'Refresh the page and try again.' });
    const checked = validateInquiry(req.body);
    if (checked.errors) return res.status(400).json({ message: 'Check the highlighted fields.', errors: checked.errors });
    const digest = crypto.createHash('sha256').update(JSON.stringify(checked.value)).digest('hex');
    let stage = 'rate_limit';
    try {
      const rate = await store.allowRequest(req.ip, maxAttempts, time);
      if (!rate.allowed) {
        res.set('Retry-After', String(rate.retryAfter));
        return res.status(429).json({ message: 'Too many requests. Please try again later.' });
      }
      stage = 'save';
      const result = await submitInquiry(key, digest, checked.value, checked.service);
      return res.status(result.status).json(result.body);
    } catch (error) {
      const supportCode = inquiryFailureCode(error);
      const incident = crypto.randomBytes(6).toString('hex');
      console.error(JSON.stringify({ event: 'inquiry_save_failed', stage, supportCode, incident }));
      return res.status(503).json({ message: 'We could not confirm that your inquiry was saved. Your entries are still here. Please retry using this page.', supportCode, incident });
    }
  });

  // Retire the browser-controlled email relay. The replacement accepts structured data only.
  app.post('/api/nodeEmails', (req, res) => res.status(410).json({ message: 'Please use the current consultation form at /consultation.' }));

  const web = path.join(__dirname, 'service-intake');
  const pageHeaders = (req, res, next) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Cache-Control', 'no-cache');
    next();
  };
  app.use('/intake-assets', express.static(path.join(web, 'assets'), { maxAge: 0 }));
  app.get(['/services', '/services/'], pageHeaders, (req, res) => res.send(catalogPage()));
  app.get('/services/:serviceId', pageHeaders, (req, res) => {
    const html = servicePage(req.params.serviceId);
    return html ? res.send(html) : res.status(404).send(notFoundPage());
  });
  app.get(['/about', '/about/'], pageHeaders, (req, res) => res.send(aboutPage()));
  // Verified earlier About-page URL, preserving query parameters for old bookmarks.
  app.get(['/about-us.html', '/about-us', '/about-us/'], (req, res) => {
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(308, `/about${query}`);
  });
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(sitemap()));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(env.VERCEL_ENV === 'preview'
    ? 'User-agent: *\nDisallow: /\n'
    : 'User-agent: *\nAllow: /\nSitemap: https://www.softwebs.io/sitemap.xml\n'));
  app.get(['/consultation', '/consultation/', '/awo_form', '/awo_form/'], pageHeaders, (req, res) => res.sendFile(path.join(web, 'consultation.html')));

  if (options.enablePhoneVerification !== false) {
    // Compatibility only: the new intake does not request SMS or invoke these endpoints.
    const cors = require('cors');
    app.use('/api/vonage', cors(), express.json({ limit: '20kb' }));
    app.post('/api/vonage/request', require('./api/vonage/request').request);
    app.post('/api/vonage/verify', require('./api/vonage/verify').verify);
    app.post('/api/vonage/cancel', require('./api/vonage/cancel').cancel);
  }
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.static(path.join(__dirname, 'public_html')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ message: status === 413 ? 'The request is too large.' : status === 400 ? 'Send a valid JSON request.' : 'We could not process this request.' });
  });
  return app;
}

module.exports = { createApp };
