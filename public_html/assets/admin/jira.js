'use strict';
(() => {
  const status = document.getElementById('jira-state'), tasks = document.getElementById('jira-tasks');
  if (!status) return;
  const connect = document.getElementById('jira-connect'), refresh = document.getElementById('jira-refresh'), disconnect = document.getElementById('jira-disconnect'), more = document.getElementById('jira-next');
  let next = null, busy = false;
  async function request(path = '', method = 'GET') {
    const r = await fetch('/api/workspace/jira' + path, { method, credentials: 'same-origin', ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined } : {}) });
    if (r.status === 401) { location.assign('/login'); throw Error('Please sign in.'); }
    const d = await r.json(); if (!r.ok) throw Error(d.message || 'Jira is unavailable.'); return d;
  }
  async function action(fn) { if (busy) return; busy = true; [connect, refresh, disconnect, more].forEach(b => b.disabled = true); try { await fn(); } catch (e) { status.textContent = e.message; } finally { busy = false; [connect, refresh, disconnect, more].forEach(b => b.disabled = false); } }
  function item(tag, text, parent) { const el = document.createElement(tag); el.textContent = text; parent.append(el); return el; }
  async function load(cursor) {
    const d = await request('/tasks' + (cursor ? '?nextPageToken=' + encodeURIComponent(cursor) : ''));
    if (!cursor) tasks.replaceChildren();
    for (const task of d.tasks) {
      const card = item('article', '', tasks); card.className = 'detail-card';
      const title = item('h3', '', card), link = item('a', task.key + ': ' + task.summary, title);
      // The server generates URLs; validate here as a second boundary.
      const url = new URL(task.url); if (url.protocol === 'https:' && /^[a-z0-9-]+\.atlassian\.net$/.test(url.hostname)) { link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      item('p', task.status + (task.priority ? ' · ' + task.priority : ''), card); item('p', task.dueDate ? 'Due: ' + task.dueDate : 'No due date set in Jira', card);
    }
    next = d.nextPageToken; more.hidden = !next;
    status.textContent = (tasks.childElementCount ? 'Your assigned ' + d.project + ' tasks. ' : 'No assigned tasks found on this page. ') + 'Last checked: ' + new Date(d.fetchedAt).toLocaleTimeString();
  }
  async function init() {
    const d = await request(); tasks.replaceChildren(); more.hidden = true;
    connect.hidden = !d.configured; refresh.hidden = disconnect.hidden = !d.connected;
    connect.textContent = d.connected ? 'Reconnect Jira' : 'Connect Jira';
    if (!d.configured) { status.textContent = 'Jira is awaiting administrator setup.'; return; }
    if (!d.connected) { status.textContent = 'Connect your Jira account to view your assigned SWS tasks.'; return; }
    await load();
  }
  connect.addEventListener('click', () => action(async () => { const d = await request('/connect', 'POST'), url = new URL(d.url); if (url.origin !== 'https://auth.atlassian.com') throw Error('Invalid connection address.'); location.assign(url.href); }));
  refresh.addEventListener('click', () => action(() => load())); more.addEventListener('click', () => action(() => load(next)));
  disconnect.addEventListener('click', () => action(async () => { if (!window.confirm('Disconnect this website from your Jira account?')) return; await request('', 'DELETE'); await init(); }));
  const result = new URLSearchParams(location.search).get('jira');
  if (result) { history.replaceState(null, '', '/workspace'); if (result === 'failed') status.textContent = 'Jira connection was not completed. Try connecting again.'; }
  action(async () => { await init(); if (result === 'failed') status.textContent = 'Jira connection was not completed. Try connecting again.'; });
})();
