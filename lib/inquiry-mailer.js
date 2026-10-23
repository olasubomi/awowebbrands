'use strict';

const nodemailer = require('nodemailer');

function createInquiryMailer(env = process.env, transport) {
  const configured = !!(env.SMTP_HOST && env.MAIL_FROM && env.INQUIRY_TO);
  const mail = transport || (configured ? nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true
  }) : null);

  return async function sendInquiry(inquiry, service, reference) {
    if (!mail || !env.MAIL_FROM || !/^[^\s<>@,;:]+@[^\s<>@,;:]+\.[^\s<>@,;:]+$/.test(env.INQUIRY_TO || '')) throw new Error('MAIL_NOT_CONFIGURED');
    const details = service.questions.map(question => `${question.label}: ${inquiry.answers[question.id] || 'Not provided'}`);
    const result = await mail.sendMail({
      from: env.MAIL_FROM, to: env.INQUIRY_TO, replyTo: inquiry.email,
      subject: `Service inquiry: ${service.name} [${reference}]`,
      text: [
        `Reference: ${reference}`, `Service: ${service.name}`, `Name: ${inquiry.fullName}`,
        `Business/preferred name: ${inquiry.businessName || 'Not provided'}`, `Email: ${inquiry.email}`,
        `Phone: ${inquiry.phone || 'Not provided'}`, `Contact preference: ${inquiry.contactPreference}`,
        `Available days: ${inquiry.availableDays.join(', ') || 'Not specified'}`,
        `Available times: ${inquiry.availableTimes || 'Not specified'}`, `Timezone: ${inquiry.timezone}`,
        ...details, '', 'Requested outcome:', inquiry.goal,
        '', 'This is an inquiry, not a confirmed appointment.'
      ].join('\n')
    });
    if (!result.accepted || !result.accepted.length || (result.rejected && result.rejected.length)) throw new Error('STAFF_DELIVERY_FAILED');
    let acknowledgmentSent = false;
    try {
      const acknowledgment = await mail.sendMail({
        from: env.MAIL_FROM, to: inquiry.email,
        subject: `We received your Soft Web Services inquiry [${reference}]`,
        text: `Hello ${inquiry.fullName},\n\nThank you for contacting Soft Web Services about ${service.name}. Your inquiry has been sent to our team. We will follow up using your contact preferences.\n\nReference: ${reference}\n\nYour availability is a preference; an appointment has not been confirmed.\n\nSoft Web Services`
      });
      acknowledgmentSent = !!(acknowledgment.accepted && acknowledgment.accepted.length);
    } catch (_) { /* Staff has the inquiry: do not prompt duplicate submission. */ }
    return { acknowledgmentSent };
  };
}

module.exports = { createInquiryMailer };
