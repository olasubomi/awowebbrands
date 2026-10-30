'use strict';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const isStaff = member => member && (member.relationship === 'employee' || member.relationship === 'contractor' || member.roles.includes('admin'));
const audiences = member => member ? ['public', 'members', ...(isStaff(member) ? ['staff'] : [])] : ['public'];
function checkEvent(body, now = Date.now(), existing) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { errors: { _form: 'Send event details as a JSON object.' } };
  if (Object.keys(body).some(k => !['title', 'description', 'startsAt', 'endsAt', 'timezone', 'visibility', 'meetingUrl', 'status', 'version'].includes(k))) errors._form = 'The event includes an unsupported field. Refresh the page and retry.';
  if (typeof body.title !== 'string' || !body.title.trim()) errors.title = 'Enter an event title.';
  else if (body.title.length > 160) errors.title = 'Keep the title to 160 characters or fewer.';
  const description = body.description === undefined ? '' : body.description;
  if (typeof description !== 'string' || description.length > 3000) errors.description = 'Keep the description to 3,000 characters or fewer.';
  if (!['public', 'members', 'staff'].includes(body.visibility)) errors.visibility = 'Choose Public, Community members, or Employees and contractors.';
  if (!['scheduled', 'cancelled'].includes(body.status)) errors.status = 'Choose Scheduled or Cancelled.';
  if (typeof body.timezone !== 'string' || !body.timezone.trim() || body.timezone.length > 80) errors.timezone = 'Choose a valid time zone, such as America/Los_Angeles.';
  else { try { new Intl.DateTimeFormat('en', { timeZone: body.timezone.trim() }); } catch (_) { errors.timezone = 'This time zone is not recognized. Use a name such as America/Los_Angeles.'; } }
  const dates = {};
  for (const [key, label] of [['startsAt', 'start'], ['endsAt', 'end']]) {
    const value = body[key];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) errors[key] = 'Choose a valid ' + label + ' date and time.';
    else dates[key] = new Date(value);
  }
  const start = dates.startsAt, end = dates.endsAt;
  if (start && ((!existing && +start <= now) || (existing && +existing.startsAt > now && +start <= now))) errors.startsAt = 'The start time is in the past. Choose a future date and time; the fields use your device’s local time.';
  if (start && end && +end <= +start) errors.endsAt = 'The end time must be later than the start time.';
  else if (start && end && +end - +start > 7 * 86400000) errors.endsAt = 'An event can last at most 7 days.';
  if (existing && +existing.startsAt <= now) {
    if (start && +start !== +existing.startsAt) errors.startsAt = 'This event has started; its start time cannot change.';
    if (end && +end !== +existing.endsAt) errors.endsAt = 'This event has started; its end time cannot change.';
    if (body.visibility !== existing.visibility) errors.visibility = 'This event has started; its audience cannot change.';
  }
  const meetingUrl = body.meetingUrl === undefined ? '' : typeof body.meetingUrl === 'string' ? body.meetingUrl.trim() : body.meetingUrl;
  if (typeof meetingUrl !== 'string' || meetingUrl.length > 2048) errors.meetingUrl = 'Use a meeting link of 2,048 characters or fewer, or leave it blank.';
  else if (meetingUrl) {
    try { const u = new URL(meetingUrl);
      if (u.protocol !== 'https:') errors.meetingUrl = 'The meeting link must start with https://, or you can leave it blank.';
      else if (u.username || u.password || (u.port && u.port !== '443') || !u.hostname.includes('.')) errors.meetingUrl = 'Enter a complete HTTPS meeting link without embedded credentials or a custom port, or leave it blank.';
    } catch (_) { errors.meetingUrl = 'Enter a complete meeting link such as https://meet.google.com/abc-defg-hij, or leave it blank.'; }
  }
  if (Object.keys(errors).length) return { errors };
  return { value: { title: body.title.trim(), description, startsAt: start, endsAt: end, timezone: body.timezone.trim(), visibility: body.visibility, meetingUrl, status: body.status } };
}
function validateEvent(body, now, existing) { return checkEvent(body, now, existing).value || null; }
function eventView(event, member, response) {
  const manage = !!member?.permissions.includes('events:manage');
  return { id: event._id, title: event.title, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, timezone: event.timezone, visibility: event.visibility, status: event.status, version: event.version, ...(manage || (member && response?.rsvp === 'going' && event.status === 'scheduled') ? { meetingUrl: event.meetingUrl } : {}), ...(response ? { rsvp: response.rsvp, attendance: response.attendance } : {}), ...(manage ? { history: event.history, ...(event.googleCalendar ? { googleCalendar: event.googleCalendar } : {}) } : {}) };
}
function calendar(events, origin) {
  const date = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\r?\n|\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Soft Web Services//Community Events//EN', 'CALSCALE:GREGORIAN', ...events.flatMap(e => ['BEGIN:VEVENT', 'UID:' + e._id + '@softwebs.io', 'DTSTAMP:' + date(e.updatedAt), 'DTSTART:' + date(e.startsAt), 'DTEND:' + date(e.endsAt), 'SEQUENCE:' + e.version, 'SUMMARY:' + esc(e.title), 'DESCRIPTION:' + esc(e.description), 'URL:' + origin + '/events/' + e._id, 'STATUS:' + (e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'), 'END:VEVENT']), 'END:VCALENDAR'];
  // RFC 5545 folding counts UTF-8 octets, not JavaScript characters.
  return lines.map(line => { let result = '', count = 0; for (const ch of line) { const n = Buffer.byteLength(ch); if (count + n > 75) { result += '\r\n '; count = 1; } result += ch; count += n; } return result; }).join('\r\n') + '\r\n';
}
module.exports = { uuid, isStaff, audiences, checkEvent, validateEvent, eventView, calendar };
