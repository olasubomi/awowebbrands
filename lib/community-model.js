'use strict';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const isStaff = member => member && (member.relationship === 'employee' || member.relationship === 'contractor' || member.roles.includes('admin'));
const audiences = member => member ? ['public', 'members', ...(isStaff(member) ? ['staff'] : [])] : ['public'];
function validateEvent(body, now = Date.now(), existing) {
  if (!body || Array.isArray(body) || Object.keys(body).some(k => !['title', 'description', 'startsAt', 'endsAt', 'timezone', 'visibility', 'meetingUrl', 'status', 'version'].includes(k))) return null;
  const text = (s, max, required) => typeof s === 'string' && s.length <= max && (!required || s.trim().length > 0);
  if (!text(body.title, 160, true) || !text(body.description, 3000, false) || !['public', 'members', 'staff'].includes(body.visibility) || !['scheduled', 'cancelled'].includes(body.status) || typeof body.timezone !== 'string' || body.timezone.length > 80) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: body.timezone }); } catch (_) { return null; }
  if (![body.startsAt, body.endsAt].every(s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s))) return null;
  const start = new Date(body.startsAt), end = new Date(body.endsAt);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || +end <= +start || +end - +start > 7 * 86400000) return null;
  if (!existing && +start <= now) return null;
  // Once a meeting starts its dates/audience are immutable: preserve attendance context.
  if (existing && +existing.startsAt <= now && (+start !== +existing.startsAt || +end !== +existing.endsAt || body.visibility !== existing.visibility)) return null;
  if (existing && +existing.startsAt > now && +start <= now) return null;
  if (typeof body.meetingUrl !== 'string' || body.meetingUrl.length > 2048) return null;
  if (body.meetingUrl) { try { const u = new URL(body.meetingUrl); if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null; } catch (_) { return null; } }
  return { title: body.title.trim(), description: body.description, startsAt: start, endsAt: end, timezone: body.timezone, visibility: body.visibility, meetingUrl: body.meetingUrl, status: body.status };
}
function eventView(event, member, response) {
  const manage = !!member?.permissions.includes('events:manage');
  return { id: event._id, title: event.title, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, timezone: event.timezone, visibility: event.visibility, status: event.status, version: event.version, ...(manage || (member && response?.rsvp === 'going' && event.status === 'scheduled') ? { meetingUrl: event.meetingUrl } : {}), ...(response ? { rsvp: response.rsvp, attendance: response.attendance } : {}), ...(manage ? { history: event.history } : {}) };
}
function calendar(events, origin) {
  const date = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\r?\n|\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Soft Web Services//Community Events//EN', 'CALSCALE:GREGORIAN', ...events.flatMap(e => ['BEGIN:VEVENT', 'UID:' + e._id + '@softwebs.io', 'DTSTAMP:' + date(e.updatedAt), 'DTSTART:' + date(e.startsAt), 'DTEND:' + date(e.endsAt), 'SEQUENCE:' + e.version, 'SUMMARY:' + esc(e.title), 'DESCRIPTION:' + esc(e.description), 'URL:' + origin + '/events/' + e._id, 'STATUS:' + (e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'), 'END:VEVENT']), 'END:VCALENDAR'];
  // RFC 5545 folding counts UTF-8 octets, not JavaScript characters.
  return lines.map(line => { let result = '', count = 0; for (const ch of line) { const n = Buffer.byteLength(ch); if (count + n > 75) { result += '\r\n '; count = 1; } result += ch; count += n; } return result; }).join('\r\n') + '\r\n';
}
module.exports = { uuid, isStaff, audiences, validateEvent, eventView, calendar };
