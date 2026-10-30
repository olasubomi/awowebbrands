'use strict';
(() => {
  const message = document.getElementById('events-message'), list = document.getElementById('event-list'), form = document.getElementById('event-form');
  let me = null, next = null, busy = false, editing = null, rosterEvent = null, rosterNext = null;
  const detailId = location.pathname.match(/\/events\/([a-f0-9-]{36})$/i)?.[1];
  const prefix = () => me ? '/api/workspace/events' : '/api/community/events';
  function el(tag, text, parent) { const n = document.createElement(tag); if (text) n.textContent = text; if (parent) parent.append(n); return n; }
  function button(text, parent, fn) { const b = el('button', text, parent); b.type = 'button'; b.addEventListener('click', () => action(fn)); return b; }
  function notify(text) { message.textContent = text; }
  async function request(path, method = 'GET', body) {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (r.status === 401 && me) { location.assign('/login'); throw Error('Please sign in again.'); }
    const d = await r.json(); if (!r.ok) throw Error(d.message || 'Unable to complete this events request.'); return d;
  }
  async function action(fn) { if (busy) return; busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true); try { await fn(); } catch (e) { notify(e.message); } finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = b.dataset.locked === 'true'); } }
  const managing = () => me?.permissions.includes('events:manage');
  const staff = () => me && (me.relationship !== null || me.roles.includes('admin'));
  const when = e => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: e.timezone }).format(new Date(e.startsAt)) + ' – ' + new Intl.DateTimeFormat(undefined, { timeStyle: 'short', timeZone: e.timezone }).format(new Date(e.endsAt)) + ' (' + e.timezone + ')';
  function render(event) {
    const card = el('article', '', list); card.className = 'detail-card';
    const title = el('h2', '', card), link = el('a', event.title, title); link.href = '/events/' + event.id;
    el('p', when(event), card); el('p', event.description, card).className = 'request-text';
    el('p', event.status === 'cancelled' ? 'Cancelled' : event.visibility === 'staff' ? 'Employees and contractors' : event.visibility === 'members' ? 'Community members' : 'Public event', card);
    if (me) {
      el('p', 'RSVP: ' + (event.rsvp || 'Not answered') + ' · Attendance: ' + (event.attendance || 'unconfirmed'), card);
      if (event.status !== 'cancelled' && new Date(event.endsAt) > new Date()) {
        button('Going', card, async () => { await request(prefix() + '/' + event.id + '/rsvp', 'POST', { rsvp: 'going' }); await load(); notify('RSVP saved. Your attendance will be confirmed after the event.'); });
        button('Not going', card, async () => { await request(prefix() + '/' + event.id + '/rsvp', 'POST', { rsvp: 'not-going' }); await load(); notify('RSVP updated.'); });
      }
      if (event.meetingUrl && event.status !== 'cancelled') {
        const u = new URL(event.meetingUrl);
        if (u.protocol === 'https:' && !u.username && !u.password) { const join = el('a', 'Join meeting', card); join.href = u.href; join.target = '_blank'; join.rel = 'noopener noreferrer'; join.className = 'meeting-link'; }
      }
      if (managing()) { button('Edit event', card, () => edit(event)); button('RSVP and attendance', card, () => roster(event)); }
    } else el('p', 'Sign in with an approved membership to RSVP and join.', card);
  }
  async function summary() {
    if (!me) return;
    const d = await request('/api/workspace/attendance');
    document.getElementById('attendance-summary').hidden = false;
    const target = document.getElementById('attendance-text'); target.replaceChildren();
    for (const [title, value] of [['First meeting attended', d.firstAttendedAt ? new Date(d.firstAttendedAt).toLocaleDateString(undefined, { timeZone: d.timezone }) : 'Not yet'], ['Participated this week', d.participatedThisWeek ? 'Yes' : 'Not yet'], ['Meetings this month', String(d.thisMonth)]]) { const card = el('div', '', target); el('h3', title, card); el('p', value, card); }
    document.getElementById('attendance-period').textContent = 'Weeks start Monday · ' + d.timezone;
  }
  async function load(cursor) {
    let d;
    if (detailId) d = { events: [(await request(prefix() + '/' + detailId)).event], next: null };
    else { const q = new URLSearchParams({ past: String(document.getElementById('event-period').value === 'past') }); if (cursor) q.set('after', cursor); d = await request(prefix() + '?' + q); }
    if (!cursor || detailId) list.replaceChildren(); d.events.forEach(render); next = d.next; document.getElementById('events-next').hidden = !next;
    if (!list.childElementCount) el('p', 'No events to show yet.', list);
  }
  function localDate(value) { const d = new Date(value); return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function edit(event) {
    editing = event || null; form.reset(); form.hidden = false; document.getElementById('event-form-title').textContent = event ? 'Edit event' : 'Create event';
    for (const [id, value] of Object.entries({ title: event?.title || '', description: event?.description || '', start: event ? localDate(event.startsAt) : '', end: event ? localDate(event.endsAt) : '', timezone: event?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, visibility: event?.visibility || 'public', link: event?.meetingUrl || '', status: event?.status || 'scheduled' })) document.getElementById('event-' + id).value = value;
    document.getElementById('event-visibility').querySelector('[value="staff"]').hidden = !staff();
    form.scrollIntoView({ behavior: 'smooth' });
  }
  async function roster(event, cursor) {
    rosterEvent = event; const d = await request('/api/workspace/events/' + event.id + '/participants' + (cursor ? '?after=' + encodeURIComponent(cursor) : ''));
    const container = document.getElementById('roster-list'); if (!cursor) container.replaceChildren();
    document.getElementById('event-roster').hidden = false; document.getElementById('roster-title').textContent = event.title;
    for (const row of d.responses) {
      const card = el('article', '', container); card.className = 'detail-card'; el('h3', row.email, card); el('p', 'RSVP: ' + row.rsvp, card);
      const label = el('label', 'Attendance ', card), select = el('select', '', label);
      for (const [value, text] of [['unconfirmed', 'Unconfirmed'], ['attended', 'Attended'], ['did-not-attend', 'Did not attend']]) { const option = el('option', text, select); option.value = value; } select.value = row.attendance;
      const save = button('Save attendance', card, async () => { await request('/api/workspace/events/' + event.id + '/attendance', 'PATCH', { userId: row.userId, attendance: select.value, version: row.version }); await roster(event); await summary(); notify('Attendance saved.'); });
      save.dataset.locked = String(event.status === 'cancelled' || new Date(event.endsAt) > new Date()); save.disabled = save.dataset.locked === 'true'; select.disabled = save.disabled;
    }
    if (!container.childElementCount) el('p', 'No RSVPs yet.', container);
    rosterNext = d.next; document.getElementById('roster-next').hidden = !rosterNext;
  }
  form.addEventListener('submit', event => { event.preventDefault(); action(async () => {
    const value = id => document.getElementById('event-' + id).value;
    const body = { title: value('title'), description: value('description'), startsAt: new Date(value('start')).toISOString(), endsAt: new Date(value('end')).toISOString(), timezone: value('timezone'), visibility: value('visibility'), meetingUrl: value('link'), status: value('status'), ...(editing ? { version: editing.version } : {}) };
    if (body.status === 'cancelled' && !window.confirm('Cancel this event? It will be excluded from attendance totals.')) return;
    await request('/api/workspace/events' + (editing ? '/' + editing.id : ''), editing ? 'PATCH' : 'POST', body); form.hidden = true; await load(); notify('Event saved. No invitation emails were sent.');
  }); });
  document.getElementById('new-event').addEventListener('click', () => edit(null)); document.getElementById('cancel-edit').addEventListener('click', () => { form.hidden = true; });
  document.getElementById('event-filters').addEventListener('submit', e => { e.preventDefault(); action(() => load()); });
  document.getElementById('events-next').addEventListener('click', () => action(() => load(next)));
  document.getElementById('roster-next').addEventListener('click', () => action(() => roster(rosterEvent, rosterNext)));
  document.getElementById('roster-close').addEventListener('click', () => { document.getElementById('event-roster').hidden = true; });
  action(async () => {
    const response = await fetch('/api/workspace/me', { credentials: 'same-origin' });
    if (response.ok) me = await response.json();
    document.getElementById('organizer').hidden = !managing();
    if (me) document.getElementById('member-login').textContent = me.email;
    await load(); await summary();
  });
})();
