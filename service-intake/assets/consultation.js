'use strict';

(async function consultation() {
  const form = document.getElementById('inquiry-form');
  const serviceSelect = document.getElementById('serviceId');
  const questions = document.getElementById('questions');
  const errorSummary = document.getElementById('error-summary');
  const submit = document.getElementById('submit-button');
  const status = document.getElementById('submit-status');
  let catalog;
  let services;
  let key;
  let lastPayload;
  const id = name => document.getElementById(name);
  function newKey() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function option(value, label) {
    const node = document.createElement('option'); node.value = value; node.textContent = label; return node;
  }
  function resetErrors() {
    errorSummary.replaceChildren(); errorSummary.hidden = true;
    form.querySelectorAll('[aria-invalid]').forEach(node => node.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field-error').forEach(node => node.remove());
  }
  function showErrors(message, errors = {}) {
    resetErrors();
    const heading = document.createElement('p'); heading.textContent = message; errorSummary.appendChild(heading);
    const list = document.createElement('ul');
    for (const [name, detail] of Object.entries(errors)) {
      const input = id(name.startsWith('answers.') ? `answer-${name.slice(8)}` : name);
      const item = document.createElement('li');
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        const link = document.createElement('a'); link.href = `#${input.id}`;
        const label = form.querySelector(`label[for="${input.id}"]`);
        link.textContent = `${label ? label.textContent : 'Field'}: ${detail}`;
        item.appendChild(link);
      } else item.textContent = detail;
      list.appendChild(item);
    }
    errorSummary.appendChild(list); errorSummary.hidden = false; errorSummary.focus();
  }
  function renderQuestions() {
    resetErrors(); questions.replaceChildren();
    const service = services.find(item => item.id === serviceSelect.value);
    id('service-summary').textContent = service.summary;
    id('service-details').hidden = !service.questions.length;
    for (const question of service.questions) {
      const wrapper = document.createElement('div'); wrapper.className = 'field';
      const label = document.createElement('label'); label.htmlFor = `answer-${question.id}`; label.textContent = question.label;
      const input = document.createElement(question.type === 'select' ? 'select' : 'input');
      input.id = `answer-${question.id}`; input.name = question.id; input.required = question.required;
      if (question.type === 'select') {
        input.appendChild(option('', 'Choose an option'));
        question.options.forEach(value => input.appendChild(option(value, value)));
      } else { input.type = question.type; input.maxLength = 500; }
      wrapper.append(label, input); questions.appendChild(wrapper);
    }
  }
  function updatePhoneRequirement() {
    const required = id('contactPreference').value !== 'email';
    id('phone').required = required;
    id('phone-optional').textContent = required ? '(needed for your contact preference)' : '(optional)';
  }
  try {
    const response = await fetch('/api/services');
    if (!response.ok) throw new Error('catalog');
    catalog = await response.json(); services = [...catalog.services, catalog.generalService];
    for (const service of services) serviceSelect.appendChild(option(service.id, service.id === 'not-sure' ? 'Help me choose' : service.name));
    const requested = new URLSearchParams(location.search).get('service');
    serviceSelect.value = services.some(service => service.id === requested) ? requested : 'not-sure';
    id('timezone').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    renderQuestions(); updatePhoneRequirement();
    id('form-loading').hidden = true; form.hidden = false;
  } catch (_) {
    id('form-loading').textContent = 'We could not load the form. Please refresh or use the contact details on our home page.';
    return;
  }
  serviceSelect.addEventListener('change', renderQuestions);
  id('contactPreference').addEventListener('change', updatePhoneRequirement);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity() || submit.disabled) return;
    resetErrors();
    const data = new FormData(form);
    const service = services.find(item => item.id === serviceSelect.value);
    const payload = {};
    for (const name of ['fullName', 'businessName', 'email', 'phone', 'contactPreference', 'goal', 'availableTimes', 'timezone', 'faxNumber']) payload[name] = data.get(name) || '';
    payload.serviceId = service.id;
    payload.availableDays = data.getAll('availableDays');
    payload.answers = {};
    service.questions.forEach(question => { payload.answers[question.id] = id(`answer-${question.id}`).value; });
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPayload || !key) { key = newKey(); lastPayload = serialized; }
    submit.disabled = true; submit.textContent = 'Sending…'; status.textContent = 'Sending your inquiry. Please keep this page open.';
    try {
      const response = await fetch('/api/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: serialized });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) key = null; showErrors(result.message || 'We could not send your request.', result.errors); return; }
      form.hidden = true; id('receipt').hidden = false;
      id('receipt-message').textContent = result.message;
      id('receipt-reference').textContent = `Your reference: ${result.reference}`;
      id('receipt-email').textContent = result.acknowledgmentSent ? 'An acknowledgment email has also been sent. Check your spam folder if needed.' : 'Your inquiry is saved, but an acknowledgment email has not been confirmed. Please keep this reference; you do not need to resubmit.';
      id('receipt').focus();
    } catch (_) {
      showErrors('We could not confirm that your inquiry was saved. Your entries are still here. Check your connection and retry; keep this page open to reuse the same request.');
    } finally {
      submit.disabled = false; submit.textContent = 'Send consultation request'; status.textContent = '';
    }
  });
}());
