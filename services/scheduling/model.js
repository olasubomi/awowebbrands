'use strict';
const { randomBytes, createHash } = require('node:crypto');
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const token = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('hex');
const choices = ['yes', 'maybe', 'no'];
const owns = (member, userId, poll) => member.permissions.includes('scheduling:manage:any') || (member.permissions.includes('scheduling:manage:own') && poll.ownerId === userId);
const canCreate = member => member.permissions.some(p => ['scheduling:manage:own', 'scheduling:manage:any'].includes(p));
const text = (s, max) => typeof s === 'string' && s.trim().length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s);
function date(value) { return typeof value === 'string' && /T\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value) : null; }
function checkPoll(body, now = Date.now(), existing = null) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['title', 'description', 'timezone', 'slots', 'deadline'].includes(k))) return { errors: { _form: 'Provide the poll details only.' } };
  if (!text(body.title, 160) || !body.title.trim()) errors.title = 'Enter a title of 1–160 characters.';
  if (!text(body.description ?? '', 2000)) errors.description = 'Keep the description within 2,000 characters.';
  try { if (typeof body.timezone !== 'string' || body.timezone.length > 80) throw Error(); new Intl.DateTimeFormat('en', { timeZone: body.timezone }); } catch (_) { errors.timezone = 'Choose a recognized time zone.'; }
  let slots = [];
  if (!Array.isArray(body.slots) || body.slots.length < 2 || body.slots.length > 20) errors.slots = 'Propose between 2 and 20 meeting times.';
  else {
    slots = body.slots.map((s, i) => {
      const start = date(s?.startsAt), end = date(s?.endsAt);
      if (!s || Object.keys(s).some(k => !['startsAt', 'endsAt'].includes(k)) || !start || !end || (+start <= now && !(existing?.slots[i] && +start === +new Date(existing.slots[i].startsAt) && +end === +new Date(existing.slots[i].endsAt))) || +end <= +start || +end - +start > 86400000) errors.slots = 'Each option needs a future start and a later end, no more than 24 hours apart. Include the UTC offset.';
      return { id: String(i + 1), startsAt: start, endsAt: end };
    });
    if (!errors.slots && new Set(slots.map(s => +s.startsAt + ':' + +s.endsAt)).size !== slots.length) errors.slots = 'Remove duplicate time options.';
  }
  const deadline = date(body.deadline);
  if (!deadline || (+deadline <= now && +deadline !== +new Date(existing?.deadline)) || (!errors.slots && +deadline > Math.min(...slots.map(s => +s.startsAt)))) errors.deadline = 'Set a future response deadline no later than the first proposed time.';
  return Object.keys(errors).length ? { errors } : { value: { title: body.title.trim(), description: (body.description || '').trim(), timezone: body.timezone, slots, deadline } };
}
function checkBallot(body, poll) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['name', 'votes', 'version'].includes(k))) return { errors: { _form: 'Provide your name, availability and the current poll revision.' } };
  if (!text(body.name, 80) || !body.name.trim()) errors.name = 'Enter a display name of 1–80 characters.';
  if (!Array.isArray(body.votes) || body.votes.length !== poll.slots.length || body.votes.some(v => !choices.includes(v))) errors.votes = 'Choose Yes, Maybe or No for every proposed time.';
  if (!Number.isSafeInteger(body.version) || body.version < 0) errors._form = 'Refresh the poll before responding.';
  return Object.keys(errors).length ? { errors } : { value: { name: body.name.trim(), votes: body.votes } };
}
function pollView(poll, guestHash, organizer = false) {
  const responses = poll.responses || [], own = responses.find(r => r.guestHash === guestHash);
  return { id: poll._id, title: poll.title, description: poll.description, timezone: poll.timezone, deadline: poll.deadline, anonymous: !!poll.anonymous, status: poll.status, version: poll.version, acceptingResponses: poll.status === 'open' && +poll.deadline > Date.now(), responseCount: responses.length,
    slots: poll.slots.map((s, i) => ({ ...s, totals: Object.fromEntries(choices.map(v => [v, responses.filter(r => r.votes[i] === v).length])) })), selectedSlotId: poll.selectedSlotId || null, meetingUrl: poll.status === 'finalized' ? poll.meetingUrl || '' : '',
    myResponse: own ? { name: own.name, votes: own.votes } : null,
    ...((organizer || !poll.anonymous) ? { responses: responses.map(r => ({ name: r.name, votes: r.votes, updatedAt: r.updatedAt })), ...(organizer ? { ...(poll.status === 'draft' ? { draftInput: poll.draftInput } : {}), createdAt: poll.createdAt, updatedAt: poll.updatedAt } : {}) } : {}) };
}
function calendar(poll) {
  const slot = poll.slots.find(s => s.id === poll.selectedSlotId);
  if (!slot || !['finalized', 'cancelled'].includes(poll.status)) return null;
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const stamp = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Soft Web Services//Scheduling//EN', 'BEGIN:VEVENT', 'UID:' + digest(poll._id) + '@schedule.softwebs.io', 'DTSTAMP:' + stamp(poll.updatedAt), 'SEQUENCE:' + poll.version, 'DTSTART:' + stamp(slot.startsAt), 'DTEND:' + stamp(slot.endsAt), 'SUMMARY:' + esc(poll.title), 'DESCRIPTION:' + esc(poll.description), 'STATUS:' + (poll.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'), ...(poll.meetingUrl && poll.status === 'finalized' ? ['URL:' + esc(poll.meetingUrl)] : []), 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(line => { let out = '', part = ''; for (const c of line) { if (Buffer.byteLength(part + c) > 75) { out += part + '\r\n'; part = ' '; } part += c; } return out + part; }).join('\r\n') + '\r\n';
}
function checkDraft(input) {
  const fail = message => ({ errors: { _form: message } });
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['title', 'description', 'timezone', 'slots', 'deadline'].includes(k))) return fail('Provide valid draft fields only.');
  if (!text(input.title, 160) || !text(input.description, 2000) || !text(input.timezone, 80)) return fail('Keep the title within 160 characters and description within 2,000 characters.');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch (_) { return fail('Choose a recognized time zone.'); }
  const raw = v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 2 && Object.keys(v).every(k => ['date', 'time'].includes(k)) && text(v.date, 10) && text(v.time, 5);
  if (!raw(input.deadline) || !Array.isArray(input.slots) || input.slots.length > 20 || input.slots.some(s => !s || Object.keys(s).length !== 2 || Object.keys(s).some(k => !['start', 'end'].includes(k)) || !raw(s.start) || !raw(s.end))) return fail('A draft can contain up to 20 time options with short date/time entries.');
  return { value: { title: input.title.trim() || 'Untitled meeting', description: input.description.trim(), timezone: input.timezone, slots: [], deadline: null, draftInput: input } };
}
const sameSlots = (a, b) => a.length === b.length && a.every((s, i) => +new Date(s.startsAt) === +new Date(b[i].startsAt) && +new Date(s.endsAt) === +new Date(b[i].endsAt));
module.exports = { checkDraft, sameSlots, tokenPattern, token, digest, owns, canCreate, checkPoll, checkBallot, pollView, calendar };
