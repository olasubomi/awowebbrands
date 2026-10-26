'use strict';
const nodemailer = require('nodemailer');
const emailPattern = /^[^\s<>@,;:]+@[^\s<>@,;:]+\.[^\s<>@,;:]+$/;
function adminConfig(env) {
  if (env.SWS_ADMIN_ENABLED !== 'true') return null;
  const url = new URL(env.SWS_AUTH_ORIGIN || '');
  if (url.origin !== env.SWS_AUTH_ORIGIN || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw Error('ADMIN_CONFIG');
  const emails = new Set((env.SWS_ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  if (!emails.size || emails.size > 20 || [...emails].some(x => x.length > 254 || !emailPattern.test(x)) || (env.SWS_AUTH_SECRET || '').length < 32) throw Error('ADMIN_CONFIG');
  return { origin: url.origin, emails, secret: env.SWS_AUTH_SECRET, prefix: env.VERCEL_ENV === 'production' ? 'sws_auth_prod_' : 'sws_auth_preview_' };
}
function codeMailer(env, transport) {
  const mail = transport || nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true',
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, disableFileAccess: true, disableUrlAccess: true
  });
  return async (email, code) => {
    if (!env.SMTP_HOST || !env.MAIL_FROM) throw Error('MAIL_NOT_CONFIGURED');
    let result;
    try { result = await mail.sendMail({ from: env.MAIL_FROM, to: email, subject: 'Your Soft Web Services sign-in code', text: `Your Soft Web Services admin sign-in code is ${code}.\n\nIt expires in 5 minutes and can be used once. Do not share this code. If you did not request it, ignore this email.\n\nSoft Web Services` });
      if (!result.accepted?.length || result.rejected?.length) throw Error('MAIL_FAILED');
    } catch (_) { console.error(JSON.stringify({ event: 'admin_code_delivery_failed' })); throw Error('MAIL_FAILED'); }
  };
}
function lazyRuntime(env, config, sendCode) {
  let pending;
  return () => pending ||= import('./admin-auth.mjs').then(module => module.createRuntime(env, config, sendCode)).catch(error => { pending = undefined; throw error; });
}
module.exports = { adminConfig, codeMailer, lazyRuntime, emailPattern };
