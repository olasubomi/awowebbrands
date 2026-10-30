# Community events and attendance — first release

Preview implementation. This replaces the proposed appointment-booking and weekly personal check-in scope. No Google OAuth setup is required for this release. Existing Jira My Work remains available to staff and approved Developers; manager-wide Jira work stays backlogged.

## User flow and roles

Homepage footer → Community events (`/events`) → view public events → member sign-in → RSVP Going → meeting link → organizer confirms attendance after the meeting ends. Members can see their own three milestones: first meeting attended, participated this week, meetings attended this month.

Membership is approved by an administrator in Team & Access. There is no public self-registration yet. A visitor can request membership through the existing consultation/contact flow; administrators share the sign-in link after approving the email. Invitation approval sends no unsolicited emails. Email codes are sent only when requested through sign-in.

| Role | Access |
|---|---|
| Community Member | Public/community events, own RSVP, meeting links after Going, own attendance |
| Event Organizer | Create/edit events and confirm attendance within the audiences they can access |
| Administrator | All event audiences, organizers/membership management, existing administrative features |

Developer, Product Manager and Administrator remain separate assignable responsibilities. Event Organizer does not grant staff management, customer inquiries or Jira work access. Event Organizer is a global community-event management responsibility within accessible audiences, not an event-ownership role. Private per-project organizer scopes are not included.

`relationship: null` represents no Employee/Contractor relationship. New community invitations can use null and roles `["community-member"]`. Combine Developer if project work is appropriate. Records missing relationship still read as Employee for compatibility; explicit null remains null. Existing staff retain Jira access. Community-only members do not receive `work:read`, Jira controls or Jira API access.

## Audiences and privacy

- **Public**: everyone can see title, description, date/time and cancellation. Meeting links and participant lists are never public.
- **Members**: all approved active SWS members and staff can see the event. A member sees the meeting link after RSVP Going.
- **Staff**: only Employee/Contractor relationships or Administrators can see the event. Community-only organizers cannot create or manage this audience.

Do not put confidential meeting URLs or participant details in public event titles/descriptions. Visibility determines listing access; it cannot remove information someone previously downloaded or saw. Organizer history and participant email addresses are restricted to organizers with access to that event. Members can read only their own attendance milestones; no public leaderboard or cross-member attendance report is included.

## Attendance rules

RSVP states: `going`, `not-going` (absence of a record means no answer). Attendance states: `unconfirmed`, `attended`, `did-not-attend`.

An organizer confirms attendance only after the scheduled end. A cancelled event cannot receive RSVPs or confirmations and is excluded from all milestones. Corrections use the current attendance revision; concurrent stale edits return 409. A unique event/person record prevents double counting. Organizers may correct attendance back to Unconfirmed.

The first release requires a member to RSVP before an attendance row can be marked. People who joined outside the website without an RSVP cannot yet be added retrospectively. Creating attendee accounts on behalf of unknown people or importing meeting-provider attendance is out of scope.

Milestones use **organizer-confirmed attendance** and the event start date. Reporting weeks start Monday; months are calendar months. Reporting timezone defaults to `America/Los_Angeles`, with MongoDB `$dateTrunc` handling DST. Event display times use each event's timezone. Cancelling an event or correcting attendance recalculates the totals. These indicators show participation, not engineering quality or employee productivity.

Dates and audience cannot change after an event starts, preserving attendance context. Organizers can correct title/description/link and cancel an event. Events have explicit start/end timestamps; repeating weekly sessions are created as separate occurrences in this release. Automated recurrence, reminders, emails and meeting-provider attendance capture are not implemented.

## Calendar export

`/events/calendar.ics` downloads the first 100 upcoming public events. It excludes meeting links, private events and attendee data. UTC timestamps, stable UID, revision sequence, escaped text and UTF-8 line folding follow iCalendar formatting. Cancelled upcoming events are included with cancellation status. Historical events are not included in this bounded feed.

A download is a snapshot. A calendar app may subscribe to the URL when it is publicly reachable; refresh timing depends on that app and imports can duplicate entries if repeatedly performed manually. Vercel-protected Preview is not suitable as a Google subscription URL. No Google Calendar import/subscription has been verified. Production publication and calendar subscription checks remain separate steps. Private calendar feeds are not included.

## Setup

Keep existing Mongo, auth, staff and SMTP settings. Add **Preview only**:

- `SWS_COMMUNITY_ENABLED=true`
- Optional `SWS_COMMUNITY_TIMEZONE=America/Los_Angeles` (valid IANA zone)

Team & Access also requires existing `SWS_STAFF_ENABLED=true`. Bootstrap administrators already have event-management permission; grant Event Organizer through Team & Access as needed. New deployment required after configuration. No new dependencies, TypeScript or module-format migration.

## Data model

Separate environment collections `sws_community_preview_events` and `sws_community_preview_responses`; production uses `sws_community_prod_...`.

| Collection | Main fields |
|---|---|
| Events | UUID `_id`, title, description, startsAt, endsAt, timezone, visibility, meetingUrl, status, version, createdBy, createdAt, updatedAt, last 50 management actions |
| Responses | `_id` combines event UUID and authenticated SWS user ID; eventId, userId, email, rsvp, attendance, version, confirmedBy, confirmedAt, timestamps, last 50 attendance corrections |

Indexes support audience/date listing, event rosters, and per-user confirmed attendance. Existing identity, inquiries, Jira connections and role history remain separate. No migration of existing records is needed. Event/membership mutations retain majority write concern. Audit arrays are operational history, not permanent compliance archives.

There is no hard delete feature. Deleting users or events and retention policies need a later explicit workflow. Attendance and cancellation updates across collections are not a multi-document transaction; aggregates join current event status so cancelled meetings are excluded even if a concurrent confirmation completes. An already-authorized in-flight request can finish during a membership change.

## API reference

| Method | Path | Access / purpose |
|---|---|---|
| GET | `/api/community/events?past=false&after=cursor` | Public-safe list, 20/page; past=true for completed events |
| GET | `/api/community/events/:id` | Public-safe detail; private event IDs return 404 |
| GET | `/events/calendar.ics` | Public calendar download |
| GET | `/api/workspace/events` | Authenticated list filtered by member's audience |
| GET | `/api/workspace/events/:id` | Authenticated detail and own RSVP/attendance |
| POST | `/api/workspace/events` | Organizer creates a future event |
| PATCH | `/api/workspace/events/:id` | Organizer replaces event fields with revision |
| POST | `/api/workspace/events/:id/rsvp` | Own RSVP only: `{ "rsvp": "going" }` |
| GET | `/api/workspace/events/:id/participants?after=cursor` | Organizer roster, 50/page |
| PATCH | `/api/workspace/events/:id/attendance` | Organizer confirms/corrects existing participant |
| GET | `/api/workspace/attendance` | Own computed milestones; user-ID filters rejected |

Event create body:

```json
{
  "title": "Weekly engineering session",
  "description": "Discuss and practise together.",
  "startsAt": "2026-11-06T18:00:00Z",
  "endsAt": "2026-11-06T19:00:00Z",
  "timezone": "America/Los_Angeles",
  "visibility": "public",
  "meetingUrl": "https://meet.google.com/example",
  "status": "scheduled"
}
```

Use actual future dates and a real meeting URL. PATCH requires the same fields plus integer `version`. Attendance body: `{ "userId": "id-from-roster", "attendance": "attended", "version": 0 }`. Clients cannot assign attendance through RSVP or provide another person's ID for their own RSVP/milestones.

Mutations require JSON, exact configured Origin and a verified active membership. Public API/calendar requests share a 120/minute IP bucket; member writes share a 60/minute account bucket. Data responses are no-store. Errors: 400 validation, 401 sign-in required, 403 permission/Origin, 404 inaccessible event/unknown participant, 409 stale update or closed RSVP/attendance, 429 rate limited, 503 disabled/database unavailable. No credentials, raw database errors or participant information are logged on failures.

## Verification

Automated HTTP tests use actual Better Auth with memory adapter and simulated storage: public/private/staff boundaries, community role isolation, RSVP versus attendance, organizer-only confirmation after end, stale writes, suspension, CSRF and safe calendar output including Unicode/escaping. Optional real-Mongo test (`SWS_TEST_MONGODB_URI`) uses a disposable database for RSVP uniqueness, concurrent confirmations, cancellation exclusion, reporting week/month and DST boundaries. Do not run it against production data.

Before production, verify a real member invitation/sign-in, event creation, RSVP, meeting-link visibility, attendance correction and milestone recalculation against Atlas. Browser layout review and actual Google calendar import remain pending. No real events, RSVP records, invitations, or notification emails are created by automated tests. SWS-22's cross-account Jira check remains backlogged; this release does not mark it complete.

Current local results: 51 tests passed, one optional real-Mongo test skipped, on Node 24. JavaScript syntax checks and HTML form-label/unique-ID checks passed. Vercel Preview builds target Node 22. Browser layout, calendar import and live Atlas RSVP/attendance validation remain pending; no claims of those checks passing are made.
