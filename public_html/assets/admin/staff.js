'use strict';
(() => {
  const message = document.getElementById('staff-message'), list = document.getElementById('team-list');
  let cursor = '', next = null, busy = false;
  const labels = { developer: 'Developer', 'product-manager': 'Product Manager', admin: 'Administrator' };
  function node(tag, text, parent) { const el = document.createElement(tag); if (text) el.textContent = text; if (parent) parent.append(el); return el; }
  function notify(text) { message.textContent = text; }
  async function request(path, method = 'GET', body) {
    const response = await fetch(path, { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 401) { location.assign('/login'); throw Error('Please sign in.'); }
    const data = await response.json(); if (!response.ok) throw Error(data.message || 'Unable to complete this request.'); return data;
  }
  async function action(fn) {
    if (busy) return; busy = true; document.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try { await fn(); } catch (error) { notify(error.message); }
    finally { busy = false; document.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }
  function render(member) {
    const section = node('section', '', list); section.className = 'auth-card';
    node('h3', member.email, section);
    node('p', 'Working relationship: ' + (member.relationship === 'contractor' ? 'Contractor' : 'Employee'), section);
    if (member.bootstrap) { node('p', 'Configured administrator · ' + member.roles.map(r => (labels[r] || r)).join(', '), section); node('p', 'Managed through private server configuration.', section); return; }
    const form = node('form', '', section), fields = node('fieldset', '', form); node('legend', 'Roles', fields);
    for (const role of Object.keys(labels)) {
      const label = node('label', '', fields), check = node('input', '', label);
      check.type = 'checkbox'; check.value = role; check.checked = member.roles.includes(role); label.append(document.createTextNode(' ' + labels[role]));
    }
    const relationshipLabel = node('label', 'Working relationship ', form), relationship = node('select', '', relationshipLabel);
    for (const value of ['employee', 'contractor']) { const option = node('option', value === 'employee' ? 'Employee' : 'Contractor', relationship); option.value = value; } relationship.value = member.relationship || 'employee';
    const statusLabel = node('label', 'Access status ', form), status = node('select', '', statusLabel);
    for (const value of ['invited', 'active', 'suspended']) { const option = node('option', value, status); option.value = value; } status.value = member.status;
    if (member.status === 'invited') node('p', 'Invitation expires: ' + new Date(member.invitationExpiresAt).toLocaleString(), form);
    const save = node('button', 'Save access', form); save.type = 'submit';
    form.addEventListener('submit', event => { event.preventDefault(); action(async () => {
      const selected = [...fields.querySelectorAll('input:checked')].map(i => i.value);
      if ((selected.includes('admin') && !member.roles.includes('admin')) || status.value === 'suspended') {
        if (!window.confirm(status.value === 'suspended' ? 'Suspend this person’s website access immediately?' : 'Grant administrator access, including customer inquiries and team management?')) return;
      }
      await request('/api/admin/team/' + encodeURIComponent(member.email), 'PATCH', { roles: selected, relationship: relationship.value, status: status.value, version: member.version }); await load(); notify('Access updated.');
    }); });
    const history = node('details', '', section); node('summary', 'Recent access changes', history);
    for (const entry of [...(member.history || [])].reverse()) node('p', new Date(entry.at).toLocaleString() + ' · ' + entry.action + (entry.roles ? ' · ' + entry.roles.map(r => (labels[r] || r)).join(', ') : '') + (entry.relationship ? ' · ' + entry.relationship : '') + (entry.status ? ' · ' + entry.status : ''), history);
  }
  async function load() {
    const data = await request('/api/admin/team' + (cursor ? '?after=' + encodeURIComponent(cursor) : ''));
    list.replaceChildren();
    if (!cursor) data.bootstrapMembers.forEach(render);
    data.members.filter(m => !data.bootstrapMembers.some(b => b.email === m.email)).forEach(render);
    next = data.next; document.getElementById('next-page').hidden = !next;
  }
  document.getElementById('sign-out').addEventListener('click', () => action(async () => { await request('/api/admin-auth/sign-out', 'POST', {}); location.assign('/login'); }));
  if (!list) return;
  document.getElementById('next-page').addEventListener('click', () => action(async () => { cursor = next; await load(); }));
  document.getElementById('invite-form').addEventListener('submit', event => { event.preventDefault(); action(async () => {
    const selected = [...document.querySelectorAll('[name="invite-role"]:checked')].map(i => i.value);
    if (selected.includes('admin') && !window.confirm('Grant administrator access, including customer inquiries and team management?')) return;
    const data = await request('/api/admin/team', 'POST', { email: document.getElementById('invite-email').value.trim(), roles: selected, relationship: document.getElementById('invite-relationship').value });
    cursor = ''; await load(); event.target.reset(); notify('Invitation approved. Share this sign-in link: ' + data.signInUrl);
  }); });
  action(load);
})();
