'use strict';
(() => {
  const main = document.getElementById('main');
  const message = document.getElementById('auth-message');
  const emailForm = document.getElementById('email-form'), codeForm = document.getElementById('code-form');
  const emailInput = document.getElementById('email'), codeInput = document.getElementById('code');
  let email = '', busy = false;
  function notify(text, error = false) { message.textContent = text; message.classList.toggle('error', error); }
  async function post(path, body) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw Error(data.message || 'Unable to sign in. Please retry.');
    return data;
  }
  function lock(value) { busy = value; document.querySelectorAll('form button').forEach(b => { b.disabled = value; }); }
  if (main.dataset.origin && main.dataset.origin !== location.origin) {
    document.getElementById('canonical-link').hidden = false;
    emailForm.hidden = true; codeForm.hidden = true; notify('Use the secure sign-in address below.'); return;
  }
  emailForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    email = emailInput.value.trim().toLowerCase(); lock(true); notify('Requesting your code…');
    try { const data = await post('/api/admin-auth/request-code', { email }); notify(data.message); emailForm.hidden = true; codeForm.hidden = false; codeInput.value = ''; codeInput.focus(); }
    catch (error) { notify(error.message, true); } finally { lock(false); }
  });
  codeForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; lock(true); notify('Checking your code…');
    try { await post('/api/admin-auth/verify-code', { email, code: codeInput.value.trim() }); location.assign('/workspace'); }
    catch (error) { notify(error.message, true); codeInput.focus(); } finally { lock(false); }
  });
  document.getElementById('change-email').addEventListener('click', () => { codeForm.hidden = true; emailForm.hidden = false; notify('Enter your approved email address. Wait at least a minute before requesting another code.'); emailInput.focus(); });
})();
