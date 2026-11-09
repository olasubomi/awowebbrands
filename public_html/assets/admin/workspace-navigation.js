'use strict';
(() => {
  const button = document.getElementById('sign-out'), status = document.getElementById('sign-out-status');
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.hidden = true;
    try {
      const response = await fetch('/api/admin-auth/sign-out', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw Error('Sign-out failed');
      location.assign('/login');
    } catch (_) {
      status.textContent = 'Could not sign out. Please try again.';
      status.hidden = false;
      button.disabled = false;
    }
  });
})();
