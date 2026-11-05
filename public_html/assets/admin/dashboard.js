'use strict';
(() => {
  const el = id => document.getElementById(id), message = el('dashboard-message');
  const statusNames = { new: 'New', 'in-progress': 'In progress', closed: 'Closed' };
  const date = value => value ? new Date(value).toLocaleString() : 'Not provided';
  let page = 1, current, loading = false;
  function notify(text, error = false) { message.textContent = text; message.classList.toggle('error', error); }
  function node(tag, text, className) { const item = document.createElement(tag); if (text !== undefined) item.textContent = String(text); if (className) item.className = className; return item; }
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    if (response.status === 401) { location.assign('/login'); throw Error('Please sign in again.'); }
    const data = await response.json(); if (!response.ok) throw Error(data.message || 'Unable to load inquiries.'); return data;
  }
  async function loadList() {
    if (loading) return; loading = true; notify(''); el('list-state').textContent = 'Loading inquiries…';
    el('previous').disabled = el('next').disabled = true;
    try {
      const params = new URLSearchParams({ page, status: el('status-filter').value, serviceId: el('service-filter').value });
      const data = await api('/api/admin/inquiries?' + params);
      el('inquiry-rows').replaceChildren();
      for (const inquiry of data.inquiries) {
        const row = node('tr'), person = node('td'); person.append(node('strong', inquiry.reference), node('span', inquiry.fullName, 'muted'));
        const service = node('td', inquiry.serviceName), status = node('td'); status.append(node('span', statusNames[inquiry.status] || inquiry.status, 'badge'));
        const action = node('td'), link = node('a', 'View inquiry'); link.href = '/admin/inquiries/' + encodeURIComponent(inquiry.id); action.append(link);
        row.append(person, service, status, node('td', date(inquiry.createdAt)), action); el('inquiry-rows').append(row);
      }
      el('list-state').textContent = data.inquiries.length ? `${data.inquiries.length} inquiries on this page.` : 'No inquiries match these filters.';
      el('page-label').textContent = `Page ${page}`; el('previous').disabled = page === 1; el('next').disabled = !data.hasMore;
    } catch (error) { el('list-state').textContent = 'Inquiries could not be loaded.'; notify(error.message, true); }
    finally { loading = false; }
  }
  function card(title, pairs) {
    const section = node('section', undefined, 'detail-card'), dl = node('dl'); section.append(node('h2', title));
    for (const [label, value] of pairs) { dl.append(node('dt', label), node('dd', value === undefined || value === '' ? 'Not provided' : value)); }
    section.append(dl); return section;
  }
  const id = location.pathname.split('/')[3];
  async function loadDetail() {
    if (loading) return; loading = true; notify('Loading inquiry…'); el('status-form').querySelector('button').disabled = true;
    try {
      const [detail, catalog] = await Promise.all([api('/api/admin/inquiries/' + encodeURIComponent(id)), api('/api/services')]);
      current = detail.inquiry;
      const questions = ([...catalog.services, catalog.generalService].find(s => s.id === current.serviceId)?.questions || []);
      const labels = Object.fromEntries(questions.map(q => [q.id, q.label]));
      el('page-title').textContent = current.reference; el('page-description').textContent = current.serviceName;
      const grid = node('div', undefined, 'detail-grid');
      grid.append(card('Contact', [['Name', current.fullName], ['Business / preferred name', current.businessName], ['Email', current.email], ['Phone', current.phone], ['Contact preference', current.contactPreference]]));
      grid.append(card('Availability', [['Days', (current.availableDays || []).join(', ')], ['Times', current.availableTimes], ['Timezone', current.timezone], ['Submitted', date(current.createdAt)], ['Last updated', date(current.updatedAt)]]));
      const request = node('section', undefined, 'detail-card wide'); request.append(node('h2', 'Requested outcome'), node('p', current.goal, 'request-text'));
      const answerPairs = Object.entries(current.answers || {}).map(([key, value]) => [labels[key] || key.replace(/([A-Z])/g, ' $1'), value]); if (answerPairs.length) request.append(card('Service details', answerPairs)); grid.append(request);
      grid.append(card('Email delivery', [['Team notification', current.notificationStatus], ['Acknowledgment email', current.acknowledgmentSent ? 'Confirmed sent' : 'Not confirmed']]));
      const history = node('section', undefined, 'detail-card'); history.append(node('h2', 'Status history'));
      for (const change of [...(current.statusHistory || [])].reverse()) history.append(node('p', `${statusNames[change.previousStatus] || change.previousStatus} to ${statusNames[change.status] || change.status} · ${date(change.changedAt)} · Admin ${change.changedBy}`));
      if (!current.statusHistory?.length) history.append(node('p', 'No status changes recorded yet.')); grid.append(history);
      el('detail-content').replaceChildren(grid); el('inquiry-status').value = current.status; notify('');
    } catch (error) { current = null; notify(error.message, true); }
    finally { loading = false; el('status-form').querySelector('button').disabled = !current; }
  }
  el('status-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!current || loading) return; loading = true; const button = event.submitter; button.disabled = true;
    try { await api('/api/admin/inquiries/' + encodeURIComponent(id) + '/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: el('inquiry-status').value, version: current.version }) }); loading = false; await loadDetail(); notify('Status saved. No email was sent.'); }
    catch (error) { notify(error.message, true); } finally { loading = false; button.disabled = false; }
  });
  el('sign-out').addEventListener('click', async event => { event.currentTarget.disabled = true; try { await api('/api/admin-auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); location.assign('/login'); } catch (error) { notify(error.message, true); event.currentTarget.disabled = false; } });
  if (id) { el('list-view').hidden = true; el('detail-view').hidden = false; el('reload').addEventListener('click', loadDetail); loadDetail(); }
  else {
    el('filters').addEventListener('submit', event => { event.preventDefault(); page = 1; loadList(); });
    el('previous').addEventListener('click', () => { page = Math.max(1, page - 1); loadList(); }); el('next').addEventListener('click', () => { page++; loadList(); }); el('reload').addEventListener('click', loadList);
    api('/api/services').then(data => { for (const service of [...data.services, data.generalService]) { const option = node('option', service.name); option.value = service.id; el('service-filter').append(option); } }).catch(error => notify(error.message, true));
    loadList();
  }
})();
