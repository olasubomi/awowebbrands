'use strict';
(() => {
  const $ = id => document.getElementById(id), manage = document.body.dataset.mode === 'organizer';
  const id = location.pathname.match(/\/(?:schedule|scheduling)\/([A-Za-z0-9_-]{43})$/)?.[1];
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let editing = null, entryZone = deviceZone;
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
    return instant(value.date + 'T' + time, key, entryZone);
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
  function instant(value, key, zone = deviceZone) {
    let d = new Date(value);
    if (zone !== deviceZone) {
      const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(value);
      if (!parts) { const e = Error('Enter complete dates and times.'); e.errors = { [key]: e.message }; throw e; }
      const values = parts.slice(1).map(Number), base = Date.UTC(values[0], values[1] - 1, values[2], values[3], values[4]);
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
      const civil = time => { const p = Object.fromEntries(formatter.formatToParts(new Date(time)).map(v => [v.type, v.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second); };
      const candidates = new Set();
      for (let h = -36; h <= 36; h += 6) { const probe = base + h * 3600000, candidate = base - (civil(probe) - probe); if (civil(candidate) === base) candidates.add(candidate); }
      if (!candidates.size || new Date(base).toISOString().slice(0, 16) !== value) { const e = Error('This date/time is invalid or falls in a daylight-saving gap in ' + zone + '.'); e.errors = { [key]: e.message }; throw e; }
      return new Date(Math.min(...candidates)).toISOString();
    }
    // Reject local times normalized across a DST gap instead of silently changing the time.
    const parts = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/);
    if (!parts || !Number.isFinite(+d) || d.getFullYear() !== +parts[1] || d.getMonth() + 1 !== +parts[2] || d.getDate() !== +parts[3] || d.getHours() !== +parts[4] || d.getMinutes() !== +parts[5]) {
      const e = Error('Enter valid dates and times in your device time zone. This time may fall in a daylight-saving gap.'); e.errors = { [key]: e.message }; throw e;
    }
    return d.toISOString();
  }
  function formatSlot(slot, formatter) {
    const start = new Date(slot.startsAt), end = new Date(slot.endsAt);
    return formatter.formatRange?.(start, end) || formatter.format(start) + ' – ' + formatter.format(end);
  }
  function render(d, keepDraft = false) {
    const draft = keepDraft && !$('response-form').hidden ? { name: $('participant-name').value, votes: [...$('response-options').querySelectorAll('fieldset')].map(f => f.querySelector(':checked')?.value) } : null;
    const decision = keepDraft ? { slot: $('final-slot').value, link: $('final-link').value } : null;
    poll = d.poll; $('detail').hidden = false; $('detail-title').textContent = poll.title; $('detail-description').textContent = poll.description;
    $('poll-status').textContent = poll.status === 'open' && !poll.acceptingResponses ? 'Responses closed · awaiting organizer decision' : poll.status;
    $('detail-deadline').textContent = poll.status === 'draft' ? 'Private draft. Only you and administrators can view it until you publish.' : 'Response deadline: ' + new Intl.DateTimeFormat(undefined, { timeZone: deviceZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(poll.deadline)) + ' (' + deviceZone + '). Options proposed in ' + poll.timezone + '.';
    const selectedZone = $('viewer-zone').value || deviceZone; $('viewer-zone').replaceChildren();
    const zones = [...new Set([deviceZone, poll.timezone, 'UTC'])];
    zones.forEach(z => { const option = node('option', z, $('viewer-zone')); option.value = z; });
    $('viewer-zone').value = zones.includes(selectedZone) ? selectedZone : deviceZone;
    const formatter = new Intl.DateTimeFormat(undefined, { timeZone: $('viewer-zone').value, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const labels = new Map(poll.slots.map(s => [s.id, formatSlot(s, formatter)]));
    $('share-panel').hidden = !manage || poll.status === 'draft'; if (manage && poll.status !== 'draft') $('share-url').value = d.shareUrl || location.origin + '/schedule/' + poll.id;
    $('privacy-notice').textContent = poll.status === 'draft' ? 'This draft is private. Participant visibility applies only after publishing.' : poll.responseCount + ' responses. ' + (poll.anonymous ? 'Anonymous mode: names and individual votes are visible only to the organizer and administrators.' : 'Names and individual availability are visible to everyone with this link.');
    $('availability-grid').replaceChildren();
    poll.slots.forEach(s => { const card = node('article', undefined, $('availability-grid')); node('h3', labels.get(s.id), card); node('p', 'Yes: ' + s.totals.yes + ' · Maybe: ' + s.totals.maybe + ' · No: ' + s.totals.no, card); if (s.id === poll.selectedSlotId) node('strong', 'Confirmed time', card); });
    $('confirmed-time').replaceChildren(); $('confirmed-time').hidden = !poll.selectedSlotId;
    if (poll.selectedSlotId) {
      node('h3', poll.status === 'cancelled' ? 'This meeting was cancelled' : poll.rescheduledAt ? 'The organizer changed the confirmed time' : 'The organizer confirmed a time', $('confirmed-time'));
      node('p', labels.get(poll.selectedSlotId), $('confirmed-time'));
      if (poll.meetingUrl && poll.status === 'finalized') { const link = node('a', 'Open meeting link', $('confirmed-time')); link.href = poll.meetingUrl; link.rel = 'noreferrer noopener'; link.target = '_blank'; }
      const dl = node('p', undefined, $('confirmed-time')), a = node('a', poll.status === 'cancelled' ? 'Download cancellation (.ics)' : 'Add confirmed time to calendar (.ics)', dl); a.href = '/api/scheduling/polls/' + poll.id + '/calendar.ics';
    }
    $('participant-results').replaceChildren();
    if (!poll.responses) node('p', 'Individual responses are hidden by an administrator.', $('participant-results'));
    else if (!poll.responses.length) node('p', 'No responses yet.', $('participant-results'));
    else poll.responses.forEach(r => { const row = node('div', undefined, $('participant-results')); row.className = 'participant-result'; node('strong', r.name, row); node('p', r.votes.map((v, i) => labels.get(poll.slots[i].id) + ': ' + v).join(' · '), row); });
    $('edit-poll').hidden = !manage || poll.status === 'cancelled'; $('edit-poll').textContent = poll.status === 'draft' ? 'Continue draft' : 'Edit poll';
    $('response-form').hidden = manage || !poll.acceptingResponses;
    $('response-options').replaceChildren(); $('participant-name').value = draft?.name ?? poll.myResponse?.name ?? '';
    if (!$('response-form').hidden) poll.slots.forEach((s, i) => {
      const fieldset = node('fieldset', undefined, $('response-options')); fieldset.className = 'response-option'; node('legend', labels.get(s.id), fieldset);
      ['yes', 'maybe', 'no'].forEach(c => { const label = node('label', undefined, fieldset), radio = node('input', undefined, label); radio.type = 'radio'; radio.name = 'availability-' + s.id; radio.value = c; radio.checked = (draft?.votes[i] ?? poll.myResponse?.votes[i]) === c; label.append(document.createTextNode(c[0].toUpperCase() + c.slice(1))); });
    });
    $('withdraw').hidden = !poll.myResponse; $('organizer-panel').hidden = !manage;
    if (manage) {
      const now = Date.now(), changing = poll.status === 'finalized';
      const future = poll.slots.filter(s => +new Date(s.startsAt) > now);
      const canChange = changing && future.some(s => s.id === poll.selectedSlotId) && future.some(s => s.id !== poll.selectedSlotId);
      $('decision-form').hidden = poll.status !== 'open' && !canChange; $('cancel-poll').hidden = ['draft', 'cancelled'].includes(poll.status);
      $('decision-submit').textContent = changing ? 'Change confirmed time' : 'Confirm selected time';
      $('final-slot').replaceChildren(); const placeholder = node('option', changing ? 'Choose another time' : 'Choose a time', $('final-slot')); placeholder.value = '';
      poll.slots.forEach(s => { const o = node('option', labels.get(s.id), $('final-slot')); o.value = s.id; o.disabled = +new Date(s.startsAt) <= now || (changing && s.id === poll.selectedSlotId); });
      $('final-slot').value = decision?.slot || '';
      $('final-link').value = decision?.link ?? poll.meetingUrl ?? '';
      $('privacy-controls').hidden = !privacyAdmin; $('anonymous').checked = poll.anonymous;
    }
    $('poll-notice').textContent = poll.status === 'draft' ? 'This draft is not published. Save it privately or publish it when complete.' : poll.status === 'cancelled' ? 'This poll is cancelled.' : poll.status === 'finalized' ? 'This meeting time is confirmed. Responses are closed; check this link for changes or cancellation.' : !poll.acceptingResponses && poll.status === 'open' ? 'Voting has closed. Return to this link for the final decision.' : manage ? 'To submit your own availability, open the participant link.' : 'Keep this link to see the final time. You can change your response in this browser while voting is open.';
  }
  async function load(keepDraft = false) { render(await request((manage ? '/api/workspace/scheduling/' : '/api/scheduling/polls/') + id), keepDraft); }
  async function list(after) {
    const d = await request('/api/workspace/scheduling' + (after ? '?after=' + encodeURIComponent(after) : ''));
    if (!after) $('poll-list').replaceChildren(); if (!d.polls.length && !after) node('p', 'Your first meeting poll starts here.', $('poll-list'));
    d.polls.forEach(p => { const card = node('article', undefined, $('poll-list')); node('h3', p.title, card); node('p', p.status, card); const a = node('a', 'Manage poll', card); a.href = '/workspace/scheduling/' + p.id; });
    next = d.next; $('more-polls').hidden = !next;
  }
  $('new-poll').addEventListener('click', () => openEditor(null));
  $('edit-poll').addEventListener('click', () => openEditor(poll));
  $('close-create').addEventListener('click', () => { $('create-form').hidden = true; }); $('add-slot').addEventListener('click', () => addSlot());
  function localFields(value, zone = deviceZone) {
    if (!value) return { date: '', time: '' };
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(v => [v.type, v.value]));
    return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
  }
  function openEditor(current) {
    editing = current ? structuredClone(current) : null;
    entryZone = current?.status === 'draft' ? current.draftInput.timezone : deviceZone;
    const draft = current?.status === 'draft' ? current.draftInput : current ? { title: current.title, description: current.description, deadline: localFields(current.deadline), slots: current.slots.map(s => ({ start: localFields(s.startsAt), end: localFields(s.endsAt) })) } : { title: '', description: '', deadline: { date: '', time: '' }, slots: [{ start: {}, end: {} }, { start: {}, end: {} }] };
    $('create-section').hidden = false; $('create-form').hidden = false;
    $('editor-title').textContent = !current ? 'Propose your meeting' : current.status === 'draft' ? 'Continue your draft' : 'Edit published poll';
    $('publish-poll').textContent = current && current.status !== 'draft' ? 'Save changes' : 'Publish poll';
    $('save-draft').hidden = !!current && current.status !== 'draft';
    $('poll-title').value = draft.title; $('poll-description').value = draft.description;
    $('entry-zone').textContent = 'Enter dates and times in ' + entryZone + '. For repeated DST times, use the first occurrence.';
    $('slot-inputs').replaceChildren(); $('deadline-inputs').replaceChildren();
    dateTimeFields($('deadline-inputs'), 'poll-deadline', 'Response deadline', draft.deadline);
    for (const values of draft.slots) { addSlot(); const row = $('slot-inputs').lastElementChild; for (const side of ['start', 'end']) for (const part of ['date', 'time']) row.querySelector('[data-kind=' + side + '] [data-part=' + part + ']').value = values[side][part] || ''; }
    if (!draft.slots.length) { addSlot(); addSlot(); }
    $('create-errors').hidden = true; $('poll-title').focus();
  }
  function draftInput() { return { title: $('poll-title').value, description: $('poll-description').value, timezone: entryZone, deadline: rawDateTime($('deadline-inputs')), slots: [...$('slot-inputs').children].map(row => ({ start: rawDateTime(row.querySelector('[data-kind=start]')), end: rawDateTime(row.querySelector('[data-kind=end]')) })) }; }
  const unchangedInput = (group, original) => { const raw = rawDateTime(group), prior = localFields(original); return raw.date === prior.date && timeText(raw.time) === prior.time; };
  $('save-draft').addEventListener('click', () => action(async () => {
    const body = { draftInput: draftInput(), ...(editing ? { version: editing.version } : {}) };
    const d = await request('/api/workspace/scheduling/' + (editing ? editing.id : 'drafts'), editing ? 'PATCH' : 'POST', body);
    if (!id) return location.assign('/workspace/scheduling/' + d.poll.id);
    render(d); openEditor(d.poll); notify('Draft saved privately. Publish when you are ready to share.');
  }, 'create'));
  $('create-form').addEventListener('submit', e => { e.preventDefault(); action(async () => {
    const slots = [...$('slot-inputs').children].map((row, i) => Object.fromEntries([['start', 'startsAt'], ['end', 'endsAt']].map(([side, field]) => {
      const group = row.querySelector('[data-kind=' + side + ']'), original = editing?.status !== 'draft' ? editing?.slots[i]?.[field] : null;
      return [field, original && unchangedInput(group, original) ? new Date(original).toISOString() : inputInstant(group, 'slots', side === 'start' ? 'Start time' : 'End time')];
    })));
    const deadline = editing?.status !== 'draft' && editing?.deadline && unchangedInput($('deadline-inputs'), editing.deadline) ? new Date(editing.deadline).toISOString() : inputInstant($('deadline-inputs'), 'deadline', 'Response deadline');
    const body = { title: $('poll-title').value, description: $('poll-description').value, timezone: entryZone, deadline, slots, ...(editing ? { version: editing.version } : {}) };
    if (editing && editing.status !== 'draft') {
      const changed = slots.length !== editing.slots.length || slots.some((s, i) => +new Date(s.startsAt) !== +new Date(editing.slots[i].startsAt) || +new Date(s.endsAt) !== +new Date(editing.slots[i].endsAt));
      if (changed && editing.responseCount) { if (!window.confirm('Changing these time options will clear all ' + editing.responseCount + ' saved responses. Participants must vote again. Continue?')) return; body.resetResponses = true; }
    }
    const path = '/api/workspace/scheduling' + (editing ? '/' + editing.id + (editing.status === 'draft' ? '/publish' : '') : '');
    const d = await request(path, editing && editing.status !== 'draft' ? 'PATCH' : 'POST', body);
    if (!id) return location.assign('/workspace/scheduling/' + d.poll.id);
    editing = null; $('create-form').hidden = true; render(d); notify(d.responsesReset ? 'Poll updated. Old availability was cleared; ask participants to respond again.' : 'Poll saved. Your sharing link stays the same.');
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
    const changing = poll.status === 'finalized';
    if (!$('final-slot').value) throw Error('Choose a proposed time first.');
    if (!window.confirm(changing ? 'Change the confirmed time? Votes will stay saved. Tell participants to check the shared link and update their calendars; no email will be sent.' : 'Confirm this time and close voting? Participants must check the shared link; no email will be sent.')) return;
    render(await request('/api/workspace/scheduling/' + id + '/decision', 'POST', { action: changing ? 'reschedule' : 'finalize', slotId: $('final-slot').value, meetingUrl: $('final-link').value, version: poll.version }));
    notify(changing ? 'Confirmed time changed. The same link shows the new time.' : 'Meeting time confirmed. The shared link now shows your decision.');
  }, 'decision'); });
  $('cancel-poll').addEventListener('click', () => action(async () => { if (!window.confirm('Cancel this poll and close responses?')) return; render(await request('/api/workspace/scheduling/' + id + '/decision', 'POST', { action: 'cancel', version: poll.version })); notify('Poll cancelled.'); }));
  $('save-privacy').addEventListener('click', () => action(async () => { if (!$('anonymous').checked && !window.confirm('Make names and individual availability visible to everyone with the link?')) return; render(await request('/api/workspace/scheduling/' + id + '/privacy', 'PATCH', { anonymous: $('anonymous').checked, version: poll.version })); notify('Privacy setting saved.'); }));
  $('more-polls').addEventListener('click', () => action(() => list(next)));
  action(async () => {
    if (manage) { $('new-poll').hidden = !!id; const me = await request('/api/workspace/me'); privacyAdmin = me.permissions.includes('scheduling:privacy'); }
    if (id) { await load(); if (manage && poll.status === 'draft') openEditor(poll); } else if (manage) { $('create-section').hidden = false; $('list-section').hidden = false; $('entry-zone').textContent = 'Enter times in your device time zone: ' + deviceZone + '. Participants can view them in their own zone. For repeated DST times, use the first occurrence.'; dateTimeFields($('deadline-inputs'), 'poll-deadline', 'Response deadline'); addSlot(); addSlot(); await list(); }
  });
})();
