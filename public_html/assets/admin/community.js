'use strict';
(() => {
  const message = document.getElementById('events-message'), list = document.getElementById('event-list'), form = document.getElementById('event-form');
  let me = null, next = null, busy = false, editing = null, rosterEvent = null, rosterNext = null, google = null;
  const detailId = location.pathname.match(/\/events\/([a-f0-9-]{36})$/i)?.[1];
  const prefix = () => me ? '/api/workspace/events' : '/api/community/events';
  function el(tag, text, parent) { const n = document.createElement(tag); if (text) n.textContent = text; if (parent) parent.append(n); return n; }
  function button(text, parent, fn) { const b = el('button', text, parent); b.type = 'button'; b.addEventListener('click', () => action(fn)); return b; }
  const toast = document.getElementById('events-toast'), formMessage = document.getElementById('event-form-message');
  const fields = { title: 'title', description: 'description', startsAt: 'start', endsAt: 'end', timezone: 'timezone', visibility: 'visibility', meetingUrl: 'link', status: 'status' };
  const originalDescriptions = Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, document.getElementById('event-' + id).getAttribute('aria-describedby')]));
  let toastTimer;
  function notify(text) { message.textContent = text; toast.textContent = text; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 10000); }
  function clearErrors() {
    formMessage.hidden = true; formMessage.replaceChildren();
    for (const [key, id] of Object.entries(fields)) { const input = document.getElementById('event-' + id); input.removeAttribute('aria-invalid'); if (originalDescriptions[key]) input.setAttribute('aria-describedby', originalDescriptions[key]); else input.removeAttribute('aria-describedby'); document.getElementById('event-' + key + '-error')?.remove(); }
  }
  function showErrors(errors, fallback) {
    clearErrors(); formMessage.hidden = false;
    const texts = Object.values(errors || {}); formMessage.textContent = texts.length ? texts.join(' ') : fallback;
    for (const [key, text] of Object.entries(errors || {})) {
      const id = fields[key]; if (!id) continue;
      const input = document.getElementById('event-' + id), hint = document.createElement('p'); hint.id = 'event-' + key + '-error'; hint.className = 'field-error'; hint.textContent = text;
      input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', hint.id); input.after(hint);
    }
    notify(texts.length ? texts.join(' ') : fallback);
    const first = form.querySelector('[aria-invalid="true"]');
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); } else formMessage.focus({ preventScroll: true });
  }
  async function request(path, method = 'GET', body) {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (r.status === 401 && me) { location.assign('/login'); throw Error('Please sign in again.'); }
    const d = await r.json(); if (!r.ok) { const error = Error(d.message || 'Unable to complete this events request.'); error.errors = d.errors; throw error; } return d;
  }
  async function action(fn, eventForm = false) { if (busy) return; busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true); try { await fn(); } catch (e) { if (eventForm) showErrors(e.errors, e.message); else notify(e.message); } finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = b.dataset.locked === 'true'); } }
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
      if (managing() && google?.calendarReady) {
        const owner = !event.googleCalendar?.ownerId || event.googleCalendar.ownerId === me.id;
        if (owner) {
          button(event.googleCalendar ? 'Refresh Google link / sync event' : 'Create Google Calendar event + Meet', card, async () => {
            if (!event.googleCalendar && event.meetingUrl && !event.meetingUrl.startsWith('https://meet.google.com/') && !window.confirm('Create a Google Meet room and replace the current meeting link?')) return;
            const d = await request('/api/workspace/google-calendar/events/' + event.id, 'POST', { version: event.version, withMeet: true }); await load(); notify(d.message);
          });
          button('Sync Google Calendar without creating Meet', card, async () => { const d = await request('/api/workspace/google-calendar/events/' + event.id, 'POST', { version: event.version, withMeet: false }); await load(); notify(d.message); });
        } else el('p', 'Google sync is managed by the organizer who linked this event.', card);
        if (event.googleCalendar?.url) { const u = new URL(event.googleCalendar.url); if (u.protocol === 'https:' && ['www.google.com', 'calendar.google.com'].includes(u.hostname)) { const a = el('a', 'Open in Google Calendar', card); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; } }
        if (event.googleCalendar?.meetStatus === 'pending') el('p', 'Google Meet is being prepared. Refresh the Google link shortly.', card);
        if (event.googleCalendar && event.googleCalendar.swsVersion !== event.version) el('p', 'This event changed in SWS. Sync it to update Google Calendar.', card);
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
    editing = event || null; form.reset(); clearErrors(); form.hidden = false; document.getElementById('event-form-title').textContent = event ? 'Edit event' : 'Create event';
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
  form.noValidate = true;
  form.addEventListener('submit', event => { event.preventDefault(); action(async () => {
    clearErrors();
    const value = id => document.getElementById('event-' + id).value;
    const errors = {};
    if (!value('title').trim()) errors.title = 'Enter an event title.';
    for (const [key, id] of [['startsAt', 'start'], ['endsAt', 'end']]) if (!value(id) || !Number.isFinite(new Date(value(id)).getTime())) errors[key] = 'Choose a valid ' + id + ' date and time.';
    if (Object.keys(errors).length) { showErrors(errors); return; }
    const body = { title: value('title'), description: value('description'), startsAt: new Date(value('start')).toISOString(), endsAt: new Date(value('end')).toISOString(), timezone: value('timezone').trim(), visibility: value('visibility'), meetingUrl: value('link').trim(), status: value('status'), ...(editing ? { version: editing.version } : {}) };
    if (body.status === 'cancelled' && !window.confirm('Cancel this event? It will be excluded from attendance totals.')) return;
    await request('/api/workspace/events' + (editing ? '/' + editing.id : ''), editing ? 'PATCH' : 'POST', body); form.hidden = true; await load(); notify('Event saved. No invitation emails were sent.');
  }, true); });
  document.getElementById('new-event').addEventListener('click', () => edit(null)); document.getElementById('cancel-edit').addEventListener('click', () => { form.hidden = true; });
  document.getElementById('event-filters').addEventListener('submit', e => { e.preventDefault(); action(() => load()); });
  document.getElementById('events-next').addEventListener('click', () => action(() => load(next)));
  document.getElementById('roster-next').addEventListener('click', () => action(() => roster(rosterEvent, rosterNext)));
  document.getElementById('roster-close').addEventListener('click', () => { document.getElementById('event-roster').hidden = true; });
  async function googleStatus() {
    if (!managing()) return;
    google = await request('/api/workspace/google-calendar');
    document.getElementById('google-calendar-state').textContent = !google.configured ? 'Google Calendar is awaiting administrator setup. You can save SWS events without a meeting link.' : !google.connected ? 'Connect your Google account to create a separate SWS business calendar.' : !google.calendarReady ? (google.calendarCreationUnknown ? 'Calendar creation could not be confirmed. Contact an administrator before creating another.' : 'Connected as ' + google.email + '. Create your SWS business calendar next.') : 'Connected as ' + google.email + '. Ready to link events and request Google Meet rooms.';
    document.getElementById('google-connect').hidden = !google.configured;
    document.getElementById('google-connect').textContent = google.connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar';
    document.getElementById('google-create-calendar').hidden = !google.connected || google.calendarReady || google.calendarCreationUnknown;
    document.getElementById('google-disconnect').hidden = !google.connected;
  }
  document.getElementById('google-connect').addEventListener('click', () => action(async () => { const d = await request('/api/workspace/google-calendar/connect', 'POST', {}), u = new URL(d.url); if (u.origin !== 'https://accounts.google.com') throw Error('Invalid Google connection address.'); location.assign(u.href); }));
  document.getElementById('google-create-calendar').addEventListener('click', () => action(async () => { await request('/api/workspace/google-calendar/calendar', 'POST', {}); await googleStatus(); await load(); notify('Your SWS Google calendar is ready. Link an event using its Google Calendar button.'); }));
  document.getElementById('google-disconnect').addEventListener('click', () => action(async () => { if (!window.confirm('Disconnect this website from your Google account? Existing Google events will remain.')) return; await request('/api/workspace/google-calendar', 'DELETE', {}); await googleStatus(); await load(); notify('Google connection removed from this website.'); }));
  const googleResult = new URLSearchParams(location.search).get('google');
  if (googleResult) history.replaceState(null, '', location.pathname);
  action(async () => {
    const response = await fetch('/api/workspace/me', { credentials: 'same-origin' });
    if (response.ok) me = await response.json();
    document.getElementById('organizer').hidden = !managing();
    if (me) document.getElementById('member-login').textContent = me.email;
    try { await googleStatus(); } catch (e) { notify(e.message); }
    await load(); await summary();
    if (googleResult) notify(googleResult === 'connected' ? 'Google account connected. Create your SWS business calendar next if needed.' : 'Google connection was not completed. Try connecting again.');
  });
})();
