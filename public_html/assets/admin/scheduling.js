'use strict';
(() => {
  const $ = id => document.getElementById(id), manage = document.body.dataset.mode === 'organizer';
  const id = location.pathname.match(/\/(?:schedule|scheduling)\/([A-Za-z0-9_-]{43})$/)?.[1];
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let poll, next, privacyAdmin = false, slotNumber = 0, toastTimer;
  function node(tag, text, parent) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; parent?.append(n); return n; }
  function notify(text) { $('poll-message').textContent = text; $('poll-toast').textContent = text; $('poll-toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('poll-toast').hidden = true; }, 12000); }
  async function request(path, method = 'GET', body) {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = Error(d.message || 'The request could not be completed. Please retry.'); e.errors = d.errors; throw e; }
    return d;
  }
  async function action(fn, form) {
    document.querySelectorAll('button').forEach(b => { b.disabled = true; });
    if (form) { $(form + '-errors').hidden = true; document.querySelectorAll('[aria-invalid]').forEach(n => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); }); document.querySelectorAll('.poll-field-error').forEach(n => n.remove()); }
    try { await fn(); } catch (e) {
      const text = Object.values(e.errors || {}).join(' ') || e.message; notify(text);
      if (form) {
        const message = $(form + '-errors'); message.textContent = text; message.hidden = false;
        const fields = { title: 'poll-title', description: 'poll-description', deadline: 'deadline-inputs', slots: 'slot-inputs', name: 'participant-name', votes: 'response-options' };
        let first;
        for (const [key, value] of Object.entries(e.errors || {})) {
          const input = $(fields[key]); if (!input) continue;
          input.setAttribute('aria-invalid', 'true');
          const hint = node('p', value); hint.className = 'poll-field-error'; hint.id = input.id + '-error'; input.setAttribute('aria-describedby', hint.id); input.after(hint);
          first ||= input.matches('input,select,textarea') ? input : input.querySelector('input,select');
        }
        first ||= form === 'decision' ? $('final-slot') : null;
        if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      }
    } finally { document.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }
  function timeText(value) {
    const raw = value.trim(), compact = /^(\d{1,4})$/.test(raw), colon = /^(\d{1,2}):(\d{2})$/.exec(raw);
    let hour, minute;
    if (colon) { hour = Number(colon[1]); minute = Number(colon[2]); }
    else if (compact) { hour = Number(raw.length <= 2 ? raw : raw.slice(0, -2)); minute = raw.length <= 2 ? 0 : Number(raw.slice(-2)); }
    else return null;
    if (hour > 23 || minute > 59) return null;
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }
  function dateTimeFields(parent, prefix, title, values = {}) {
    const group = node('div', undefined, parent); group.className = 'slot-boundary';
    for (const [kind, labelText] of [['date', title + ' date'], ['time', title + ' time (24-hour)']]) {
      const label = node('label', labelText, group), input = node('input', undefined, label);
      input.id = prefix + '-' + kind; input.dataset.part = kind; input.required = true; label.htmlFor = input.id; input.value = values[kind] || '';
      if (kind === 'date') input.type = 'date';
      else {
        input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 5; input.placeholder = '09:30'; input.autocomplete = 'off';
        input.title = '24-hour time: type 9, 930, or 09:30. Afternoon example: 1430.';
        let selectOnPointerUp = false;
        input.addEventListener('focus', () => { input.select(); selectOnPointerUp = true; });
        input.addEventListener('pointerup', () => { if (selectOnPointerUp) { input.select(); selectOnPointerUp = false; } });
        input.addEventListener('blur', () => { selectOnPointerUp = false; const normalized = timeText(input.value); if (normalized) input.value = normalized; });
      }
    }
    return group;
  }
  const rawDateTime = group => Object.fromEntries(['date', 'time'].map(part => [part, group.querySelector('[data-part=' + part + ']').value]));
  function inputInstant(group, key, title) {
    const value = rawDateTime(group), time = timeText(value.time);
    if (!time) { const e = Error(title + ': enter a valid 24-hour time, such as 9, 930, or 14:30.'); e.errors = { [key]: e.message }; throw e; }
    return instant(value.date + 'T' + time, key);
  }
  function addSlot(source) {
    if ($('slot-inputs').children.length >= 20) return notify('You can propose up to 20 times.');
    const n = ++slotNumber, row = node('div', undefined, $('slot-inputs')); row.className = 'slot-input-row';
    for (const [key, title] of [['start', 'Start'], ['end', 'End']]) {
      const previous = source?.querySelector('[data-kind=' + key + ']');
      const group = dateTimeFields(row, 'slot-' + n + '-' + key, title, previous ? rawDateTime(previous) : {}); group.dataset.kind = key;
    }
    const controls = node('div', undefined, row); controls.className = 'slot-actions';
    const duplicate = node('button', 'Duplicate option', controls); duplicate.type = 'button'; duplicate.className = 'secondary';
    duplicate.addEventListener('click', () => addSlot(row));
    const remove = node('button', 'Remove option', controls); remove.type = 'button'; remove.className = 'secondary';
    remove.addEventListener('click', () => { if ($('slot-inputs').children.length <= 2) notify('Keep at least two proposed times.'); else row.remove(); });
    const startDate = row.querySelector('[data-kind=start] [data-part=date]'), endDate = row.querySelector('[data-kind=end] [data-part=date]');
    startDate.addEventListener('change', () => { if (!endDate.value) endDate.value = startDate.value; });
    if (source) { source.after(row); startDate.focus(); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); notify('Time option duplicated. Adjust its date or time before saving.'); }
  }
  function instant(value, key) {
    const d = new Date(value);
    // Reject local times normalized across a DST gap instead of silently changing the time.
    const parts = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/);
    if (!parts || !Number.isFinite(+d) || d.getFullYear() !== +parts[1] || d.getMonth() + 1 !== +parts[2] || d.getDate() !== +parts[3] || d.getHours() !== +parts[4] || d.getMinutes() !== +parts[5]) {
      const e = Error('Enter valid dates and times in your device time zone. This time may fall in a daylight-saving gap.'); e.errors = { [key]: e.message }; throw e;
    }
    return d.toISOString();
  }
  function format(slot) {
    const zone = $('viewer-zone').value || deviceZone;
    return new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(slot.startsAt)) + ' – ' +
      new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(slot.endsAt));
  }
  function render(d, keepDraft = false) {
    const draft = keepDraft && !$('response-form').hidden ? { name: $('participant-name').value, votes: [...$('response-options').querySelectorAll('fieldset')].map(f => f.querySelector(':checked')?.value) } : null;
    const decision = keepDraft ? { slot: $('final-slot').value, link: $('final-link').value } : null;
    poll = d.poll; $('detail').hidden = false; $('detail-title').textContent = poll.title; $('detail-description').textContent = poll.description;
    $('poll-status').textContent = poll.status === 'open' && !poll.acceptingResponses ? 'Responses closed · awaiting organizer decision' : poll.status;
    $('detail-deadline').textContent = 'Response deadline: ' + new Intl.DateTimeFormat(undefined, { timeZone: deviceZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(poll.deadline)) + ' (' + deviceZone + '). Options proposed in ' + poll.timezone + '.';
    const selectedZone = $('viewer-zone').value || deviceZone; $('viewer-zone').replaceChildren();
    [...new Set([deviceZone, poll.timezone, 'UTC'])].forEach(z => { const option = node('option', z, $('viewer-zone')); option.value = z; }); $('viewer-zone').value = selectedZone;
    $('share-panel').hidden = !manage; if (manage) $('share-url').value = d.shareUrl || location.origin + '/schedule/' + poll.id;
    $('privacy-notice').textContent = poll.responseCount + ' responses. ' + (poll.anonymous ? 'Anonymous mode: names and individual votes are visible only to the organizer and administrators.' : 'Names and individual availability are visible to everyone with this link.');
    $('availability-grid').replaceChildren();
    poll.slots.forEach((s, i) => { const card = node('article', undefined, $('availability-grid')); node('h3', 'Option ' + (i + 1), card); node('p', format(s), card); node('p', 'Yes: ' + s.totals.yes + ' · Maybe: ' + s.totals.maybe + ' · No: ' + s.totals.no, card); if (s.id === poll.selectedSlotId) node('strong', 'Confirmed time', card); });
    $('confirmed-time').replaceChildren(); $('confirmed-time').hidden = !poll.selectedSlotId;
    if (poll.selectedSlotId) {
      node('h3', poll.status === 'cancelled' ? 'This meeting was cancelled' : 'The organizer confirmed a time', $('confirmed-time'));
      node('p', format(poll.slots.find(s => s.id === poll.selectedSlotId)), $('confirmed-time'));
      if (poll.meetingUrl && poll.status === 'finalized') { const link = node('a', 'Open meeting link', $('confirmed-time')); link.href = poll.meetingUrl; link.rel = 'noreferrer noopener'; link.target = '_blank'; }
      const dl = node('p', undefined, $('confirmed-time')), a = node('a', poll.status === 'cancelled' ? 'Download cancellation (.ics)' : 'Add confirmed time to calendar (.ics)', dl); a.href = '/api/scheduling/polls/' + poll.id + '/calendar.ics';
    }
    $('participant-results').replaceChildren();
    if (!poll.responses) node('p', 'Individual responses are hidden by an administrator.', $('participant-results'));
    else if (!poll.responses.length) node('p', 'No responses yet.', $('participant-results'));
    else poll.responses.forEach(r => { const row = node('div', undefined, $('participant-results')); row.className = 'participant-result'; node('strong', r.name, row); node('p', r.votes.map((v, i) => 'Option ' + (i + 1) + ': ' + v).join(' · '), row); });
    $('response-form').hidden = manage || !poll.acceptingResponses;
    $('response-options').replaceChildren(); $('participant-name').value = draft?.name ?? poll.myResponse?.name ?? '';
    if (!$('response-form').hidden) poll.slots.forEach((s, i) => {
      const fieldset = node('fieldset', undefined, $('response-options')); fieldset.className = 'response-option'; node('legend', 'Option ' + (i + 1) + ': ' + format(s), fieldset);
      ['yes', 'maybe', 'no'].forEach(c => { const label = node('label', undefined, fieldset), radio = node('input', undefined, label); radio.type = 'radio'; radio.name = 'availability-' + s.id; radio.value = c; radio.checked = (draft?.votes[i] ?? poll.myResponse?.votes[i]) === c; label.append(document.createTextNode(c[0].toUpperCase() + c.slice(1))); });
    });
    $('withdraw').hidden = !poll.myResponse; $('organizer-panel').hidden = !manage;
    if (manage) {
      $('decision-form').hidden = poll.status !== 'open'; $('cancel-poll').hidden = poll.status === 'cancelled';
      $('final-slot').replaceChildren(); const placeholder = node('option', 'Choose an option', $('final-slot')); placeholder.value = '';
      poll.slots.forEach((s, i) => { const o = node('option', 'Option ' + (i + 1) + ': ' + format(s), $('final-slot')); o.value = s.id; o.disabled = +new Date(s.startsAt) <= Date.now(); });
      if (decision) { $('final-slot').value = decision.slot; $('final-link').value = decision.link; }
      $('privacy-controls').hidden = !privacyAdmin; $('anonymous').checked = poll.anonymous;
    }
    $('poll-notice').textContent = poll.status === 'cancelled' ? 'This poll is cancelled.' : poll.status === 'finalized' ? 'This meeting time is confirmed. Responses are closed; check this link for any cancellation.' : !poll.acceptingResponses && poll.status === 'open' ? 'Voting has closed. Return to this link for the final decision.' : manage ? 'To submit your own availability, open the participant link.' : 'Keep this link to see the final time. You can change your response in this browser while voting is open.';
  }
  async function load(keepDraft = false) { render(await request((manage ? '/api/workspace/scheduling/' : '/api/scheduling/polls/') + id), keepDraft); }
  async function list(after) {
    const d = await request('/api/workspace/scheduling' + (after ? '?after=' + encodeURIComponent(after) : ''));
    if (!after) $('poll-list').replaceChildren(); if (!d.polls.length && !after) node('p', 'Your first meeting poll starts here.', $('poll-list'));
    d.polls.forEach(p => { const card = node('article', undefined, $('poll-list')); node('h3', p.title, card); node('p', p.status, card); const a = node('a', 'Manage poll', card); a.href = '/workspace/scheduling/' + p.id; });
    next = d.next; $('more-polls').hidden = !next;
  }
  $('new-poll').addEventListener('click', () => { $('create-form').hidden = false; $('poll-title').focus(); });
  $('close-create').addEventListener('click', () => { $('create-form').hidden = true; }); $('add-slot').addEventListener('click', () => addSlot());
  $('create-form').addEventListener('submit', e => { e.preventDefault(); action(async () => {
    const slots = [...$('slot-inputs').children].map(row => ({ startsAt: inputInstant(row.querySelector('[data-kind=start]'), 'slots', 'Start time'), endsAt: inputInstant(row.querySelector('[data-kind=end]'), 'slots', 'End time') }));
    const d = await request('/api/workspace/scheduling', 'POST', { title: $('poll-title').value, description: $('poll-description').value, timezone: deviceZone, deadline: inputInstant($('deadline-inputs'), 'deadline', 'Response deadline'), slots });
    location.assign('/workspace/scheduling/' + d.poll.id);
  }, 'create'); });
  $('refresh-poll').addEventListener('click', () => action(async () => { await load(true); notify('Results refreshed. Unsaved selections are retained.'); }));
  $('viewer-zone').addEventListener('change', () => render({ poll, shareUrl: $('share-url').value }, true));
  $('copy-link').addEventListener('click', () => action(async () => { try { await navigator.clipboard.writeText($('share-url').value); notify('Poll link copied.'); } catch (_) { $('share-url').focus(); $('share-url').select(); notify('Select and copy the poll link above.'); } }));
  $('response-form').addEventListener('submit', e => { e.preventDefault(); action(async () => {
    const votes = [...$('response-options').querySelectorAll('fieldset')].map(f => f.querySelector(':checked')?.value || '');
    render(await request('/api/scheduling/polls/' + id + '/response', 'POST', { name: $('participant-name').value, votes, version: poll.version }));
    notify('Your availability is saved. Return to this link for the final time.');
  }, 'response'); });
  $('withdraw').addEventListener('click', () => action(async () => { render(await request('/api/scheduling/polls/' + id + '/response', 'DELETE', { version: poll.version })); notify('Your response was withdrawn.'); }));
  $('decision-form').addEventListener('submit', e => { e.preventDefault(); action(async () => {
    if (!window.confirm('Confirm this time and close voting? Participants must check the shared link; no email will be sent.')) return;
    render(await request('/api/workspace/scheduling/' + id + '/decision', 'POST', { action: 'finalize', slotId: $('final-slot').value, meetingUrl: $('final-link').value, version: poll.version }));
    notify('Meeting time confirmed. The shared link now shows your decision.');
  }, 'decision'); });
  $('cancel-poll').addEventListener('click', () => action(async () => { if (!window.confirm('Cancel this poll and close responses?')) return; render(await request('/api/workspace/scheduling/' + id + '/decision', 'POST', { action: 'cancel', version: poll.version })); notify('Poll cancelled.'); }));
  $('save-privacy').addEventListener('click', () => action(async () => { if (!$('anonymous').checked && !window.confirm('Make names and individual availability visible to everyone with the link?')) return; render(await request('/api/workspace/scheduling/' + id + '/privacy', 'PATCH', { anonymous: $('anonymous').checked, version: poll.version })); notify('Privacy setting saved.'); }));
  $('more-polls').addEventListener('click', () => action(() => list(next)));
  action(async () => {
    if (manage) { const me = await request('/api/workspace/me'); privacyAdmin = me.permissions.includes('scheduling:privacy'); }
    if (id) await load(); else if (manage) { $('create-section').hidden = false; $('list-section').hidden = false; $('entry-zone').textContent = 'Enter times in your device time zone: ' + deviceZone + '. Participants can view them in their own zone. For repeated DST times, use the first occurrence.'; dateTimeFields($('deadline-inputs'), 'poll-deadline', 'Response deadline'); addSlot(); addSlot(); await list(); }
  });
})();
