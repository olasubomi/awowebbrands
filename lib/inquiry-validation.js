'use strict';

const { findService } = require('./services');
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const allowed = ['serviceId', 'fullName', 'businessName', 'email', 'phone', 'contactPreference', 'goal', 'availableDays', 'availableTimes', 'timezone', 'answers', 'faxNumber'];

function validateInquiry(input) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: { form: 'Send a valid request.' } };
  if (Object.keys(input).some(key => !allowed.includes(key))) errors.form = 'The request contains unsupported fields.';
  const clean = {};
  function text(key, max, required = false) {
    const value = input[key] === undefined ? '' : input[key];
    if (typeof value !== 'string') { errors[key] = 'Enter text for this field.'; return ''; }
    const trimmed = value.trim();
    if ((required && !trimmed) || trimmed.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trimmed)) errors[key] = required && !trimmed ? 'This field is required.' : `Use no more than ${max} characters.`;
    clean[key] = trimmed;
    return trimmed;
  }
  const serviceId = text('serviceId', 64, true);
  const service = findService(serviceId);
  if (!service) errors.serviceId = 'Choose one of our services or select “Help me choose”.';
  text('fullName', 120, true);
  text('businessName', 160);
  const email = text('email', 254, true);
  if (!/^[^\s<>@,;:]+@[^\s<>@,;:]+\.[^\s<>@,;:]+$/.test(email)) errors.email = 'Enter a valid email address.';
  const phone = text('phone', 40);
  const preference = text('contactPreference', 16, true);
  if (!['email', 'phone', 'either'].includes(preference)) errors.contactPreference = 'Choose a contact preference.';
  if (phone && !/^[+\d\s().-]{7,40}$/.test(phone)) errors.phone = 'Enter a valid phone number.';
  if (['phone', 'either'].includes(preference) && !phone) errors.phone = 'Add a phone number or choose email contact.';
  text('goal', 3000, true);
  text('availableTimes', 300);
  const timezone = text('timezone', 80, true);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch (_) { errors.timezone = 'Enter a valid timezone, such as America/Los_Angeles.'; }
  if (!Array.isArray(input.availableDays) || input.availableDays.length > 7 || input.availableDays.some(day => !days.includes(day)) || new Set(input.availableDays).size !== input.availableDays.length) errors.availableDays = 'Choose valid availability days.';
  clean.availableDays = Array.isArray(input.availableDays) ? input.availableDays.filter(day => days.includes(day)) : [];
  if (text('faxNumber', 200)) errors.form = 'We could not accept this request. Please contact us directly.';
  const answers = input.answers === undefined ? {} : input.answers;
  clean.answers = {};
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) errors.answers = 'Check the service details.';
  else if (service) {
    if (Object.keys(answers).some(key => !service.questions.some(question => question.id === key))) errors.answers = 'The service details do not match the selected service.';
    for (const question of service.questions) {
      const raw = answers[question.id] === undefined ? '' : answers[question.id];
      const key = `answers.${question.id}`;
      if (typeof raw !== 'string' || raw.length > 500 || /[\r\n\u0000]/.test(raw)) { errors[key] = 'Enter a single line of no more than 500 characters.'; continue; }
      const value = raw.trim();
      clean.answers[question.id] = value;
      if (question.required && !value) errors[key] = 'This field is required.';
      if (value && question.type === 'select' && !question.options.includes(value)) errors[key] = 'Choose one of the available options.';
      if (value && question.type === 'url') {
        try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('url'); } catch (_) { errors[key] = 'Enter a full http:// or https:// URL without login details.'; }
      }
      if (value && question.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) errors[key] = 'Enter a valid date.';
    }
  }
  delete clean.faxNumber;
  return Object.keys(errors).length ? { errors } : { value: clean, service };
}

module.exports = { validateInquiry, days };
