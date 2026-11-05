# Scheduling polls: first release

SWS members can propose meeting times, share a link, collect named Yes/Maybe/No responses, and confirm a final meeting time. Guests do not need an SWS account. The organizer decides explicitly; a selected option does not assert unanimous agreement or attendance.

## Architecture and release boundary

The CommonJS JavaScript service lives in `services/scheduling/` with its own model, store, routes, and page shell. Its public API is independent of community events and Google Calendar. The browser client is `public_html/assets/admin/scheduling.js`.

This first release shares the existing Express process, Vercel project, verified login middleware, and MongoDB connection pool. It is **not yet an independently deployed microservice**. Keeping a clear module and collection boundary avoids introducing a second identity system or CORS setup. A separate deployment/repository would require a documented server-verified identity contract, scoped service credentials, shared-domain routing and an independent deployment pipeline. Never trust a caller-supplied owner ID when extracting it.

`SWS_SCHEDULING_ENABLED=true` and `SWS_STAFF_ENABLED=true` enable the feature. Configure Preview first. Production remains disabled until the new flow is reviewed and real MongoDB persistence is confirmed. Existing data is not migrated or rewritten.

A Vercel-protected Preview still requires Vercel access, including for guests. The application itself does not require participant login. Do not bypass deployment protection; public guest testing needs an appropriately published environment.

## Roles and profile

| Actor | Access |
| --- | --- |
| Guest participant | Open the shared capability link, see results allowed by privacy mode, submit a name and availability, update/withdraw their browser's response while voting is open |
| Approved signed-in member / Scheduling Organizer | Create polls; list, inspect, confirm and cancel only their own polls |
| Administrator | Manage all polls, change anonymity, assign account roles through Team & Access |

Every approved active account receives `scheduling:manage:own` while scheduling is enabled, so creating a poll needs login rather than employee status or a second approval. The assignable `scheduling-organizer` responsibility is also available for explicit role records. Its permission is limited to own polls; it grants no inquiry, team, Jira, Google or community-event administration. Admin receives `scheduling:manage:any` and `scheduling:privacy`.

`/workspace/profile` shows the signed-in account's email, relationship, stored roles and included scheduling responsibility. `/admin/team` is the existing admin-only role assignment UI. This does not implement a custom permission-definition editor, public signup, or public member profiles. The current email-code login remains restricted to approved SWS accounts; guests can request an account through the existing contact flow.

## Main flow

1. Homepage member sign-in → workspace/profile → Create and manage meeting polls.
2. Organizer supplies a title, optional description, 2–20 start/end options, and response deadline. Times are entered in the browser's device time zone and stored as UTC instants with an IANA display zone.
Time entry supports separate date and directly editable 24-hour time fields, including the response deadline. Type `9`, `930`, `0930`, or `09:30`; valid values normalize to `HH:MM` on blur. Focusing a time field selects its contents for replacement. Each option has **Duplicate option**, which copies both dates/times into a new independent row immediately below it, and **Remove option**. A missing end date initially follows the chosen start date; it can be changed for overnight meetings. Duplicates count toward the 20-option limit and must be adjusted before saving because exact duplicate options remain invalid.

3. Save → copy `/schedule/{pollId}`. Anyone with this unguessable 256-bit capability link can view and participate. No public poll directory exists.
4. Participant enters a display name and Yes/Maybe/No for every option. No email or account is required. The UI clearly discloses current visibility before submission.
5. Organizer reviews availability and explicitly confirms one future option, optionally with an HTTPS meeting link. Voting closes; the same link shows the confirmed time and an ICS download.
6. Organizer can cancel; the shared result and ICS cancellation reflect that decision. Downloaded calendar files are snapshots, not automatic subscriptions or live calendar updates.

Deadlines close voting but still let the organizer confirm a future proposed option. Options cannot be edited after creation in this first release. Create a replacement poll if the proposed times need to change. Creation validation rejects empty titles, unknown zones, invalid or past dates, duplicate options, options longer than 24 hours and a deadline after the earliest start. UTC offsets are required in API timestamps. The UI rejects local DST-gap times; repeated fall-back times use the browser's first occurrence and are disclosed in the form.

## Participant privacy and response ownership

Named mode is the default: participants see each other's display names and individual votes. **Only admins** can switch anonymity on or off. In anonymous mode only aggregate totals and the current browser's own response are returned publicly; organizers/admins still see all names and votes. No guest token hashes, owner account identifiers, role data or management history are returned to participants. Previously visible data cannot be recalled; small-group totals can allow inferences, so this is hidden participant detail rather than a guarantee of mathematical anonymity.

An HttpOnly, SameSite=Strict, host-only cookie stores a random browser capability scoped to `/api/scheduling`. It is Secure on HTTPS, expires after 180 days and is never exposed to page JavaScript. Each poll stores only a SHA-256 hash of the poll ID plus that capability. Responses are unverified self-reported identities. Clearing cookies, changing browsers/devices or deliberately creating a new capability can create another entry; no unique-person or attendance guarantee is made. Duplicate names are permitted. Cross-device identity, verified email and account-linked ballots are future work.

The poll ID itself is a sharing capability stored server-side. Treat the link as confidential to the intended group, do not include it in analytics or external referrers, and do not log request query strings or bodies in application diagnostics. Response pages set no-store, noindex, no-referrer, CSP and frame restrictions. Public URLs may still appear in platform access logs. All mutation endpoints enforce exact trusted Origin and JSON Content-Type; all management endpoints derive owner identity from the verified SWS session and fresh roles.

## Schema reference

Collection: `sws_scheduling_preview_polls` or `sws_scheduling_prod_polls`. Each bounded document is one poll with embedded responses. Native MongoDB, shared existing pool; majority writes.

| Field | Type / meaning |
| --- | --- |
| `_id` | 32 random bytes encoded base64url; share capability, not a user ID |
| `ownerId` | Verified SWS auth user ID |
| `title`, `description` | Trimmed text; 160 / 2,000 characters |
| `timezone` | IANA display zone |
| `slots[]` | 2–20 immutable `{id, startsAt: Date, endsAt: Date}` options |
| `deadline` | Date; voting closes at this instant |
| `status` | open, finalized, cancelled |
| `anonymous` | Boolean, false by default; admin-controlled |
| `responses[]` | At most 100 `{guestHash, name, votes[], updatedAt}` rows; votes ordered by immutable slots |
| `selectedSlotId`, `meetingUrl`, `finalizedAt` | Set only by organizer/admin confirmation |
| `version` | Integer incremented by every vote, decision and privacy change |
| `createdAt`, `updatedAt`, `history[]` | Timestamps and at most 50 management/response action records; no raw guest capabilities |

Index: `{ownerId:1, _id:1}` plus MongoDB's unique `_id` index. Random-ID cursor pagination returns 20 polls per page; it is stable pagination, not chronological sorting. Optimistic compare-and-swap on the entire poll prevents concurrent votes, decisions and privacy edits from overwriting each other. Voting additionally checks open status and the current deadline inside the atomic write. A conflict returns 409; Refresh results preserves unsaved inputs and lets the user retry.

The 100-response/20-option limits intentionally bound document size and request cost. At larger scale, extract ballots to a separate collection with a transaction or other explicit decision/vote consistency model. Do not silently drop the concurrency condition during extraction.

## API reference

| Method | Route | Access / request |
| --- | --- | --- |
| GET | `/api/workspace/scheduling?after={id}` | Session; own polls, admins all |
| POST | `/api/workspace/scheduling` | Session; `{title,description,timezone,deadline,slots:[{startsAt,endsAt}]}` |
| GET | `/api/workspace/scheduling/:id` | Owner or admin; full permitted results + shareUrl |
| POST | `/api/workspace/scheduling/:id/decision` | Owner/admin; `{action:"finalize",slotId,meetingUrl:"",version}` or `{action:"cancel",version}` |
| PATCH | `/api/workspace/scheduling/:id/privacy` | Admin only; `{anonymous:boolean,version}` |
| GET | `/api/scheduling/polls/:id` | Shared link; sets guest cookie if absent; public-safe poll view |
| POST | `/api/scheduling/polls/:id/response` | Guest cookie; `{name,votes:["yes","maybe","no"],version}` |
| DELETE | `/api/scheduling/polls/:id/response` | Guest cookie; `{version}`; only this browser's response |
| GET | `/api/scheduling/polls/:id/calendar.ics` | Shared link; only after finalization, includes cancellation if later cancelled |

Unknown/unauthorized poll IDs are 404. Invalid fields 400; missing session 401; CSRF or role denial 403; stale revision, closed voting or capacity 409; shared rate limits 429 with Retry-After; safe correlated failures 503. Public reads use 90 requests/minute/IP, responses 20/minute/IP, creation 10/minute/account, and decisions/privacy 20/minute/account. Management reads use 60–90/minute/account. Limits are stored in shared MongoDB rate buckets.

## Convenience roadmap inspired by Doodle

Comparison checked against Doodle's official help pages on November 5, 2026. These are capabilities to implement in SWS, not a connection to or purchase of Doodle.

| Capability | Delivery plan |
| --- | --- |
| Named voting, guest participation, explicit final decision | First release |
| Deadlines, admin anonymity, branded ad-free UI | First release |
| Profile/roles and own-poll/admin authorization | First release |
| Calendar file export | First release; no OAuth required |
| Email invitations, final confirmations and opt-in reminders | Next increment; optional email/invite identity, consent, recipient binding, delivery retry/idempotency and opt-out |
| Calendar conflict checking and automatic booking/Meet | After SWS-24; least-privilege separate consent for reading availability, since current calendar.app.created does not read personal free/busy |
| Reusable templates and duplicated polls | Subsequent increment; fresh IDs, deadlines and no copied ballots |
| Admin participant removal and audit | Subsequent increment; do not silently impersonate or alter participants' votes |
| Per-slot capacity / sign-up sheets | Separate mode; atomic capacity enforcement and clear booking semantics |
| Booking pages, 1:1s, buffers, lead times, multiple hosts | After reliable calendar availability and race-safe booking |
| Zapier/webhooks, other meeting providers, payments | Later, driven by user stories; signed events, outbox/retries, scoped credentials |

Doodle's current paid comparison lists reminders/deadlines, hidden details, participant management, branding, larger poll/booking capacity, Microsoft Teams/Webex and Zapier. Google Calendar, Google Meet, basic calendar sync and Stripe are not exclusively paid features in its comparison. Sources: https://help.doodle.com/en/articles/10448913-doodle-free-and-doodle-professional-differences-at-a-glance and https://help.doodle.com/en/articles/9457369-what-is-doodle-professional.

Name-only link sharing cannot identify people who never responded. Automatic non-responder reminders require an invitation roster and email addresses, not just names. Email addresses would remain private to participants/organizers and be omitted from public results. Reuse Nodemailer for transactional scheduling mail; Mailchimp campaigns remain a separate concern. Do not create reminders or send invitations without an explicit participant/organizer action and the relevant consent.

## Validation and limits

Local HTTP tests exercise actual SWS email-code auth with isolated test storage: guest voting, owner/admin separation, exact Origin, anonymous redaction, deadlines/capacity, revision conflicts, cancellation, ICS and profile access. Google OAuth remains unresolved/high-priority backlog SWS-24; no calendar configuration or provider calls are changed by this feature. Real Atlas persistence and external guest access through the final hosting configuration must be checked before production. Local visual fixtures verified guest voting, field-specific errors, admin anonymity and final-time rendering in the browser. They are not evidence of live authentication or MongoDB behavior. Full local suite: 68 passed, one disposable-MongoDB test skipped.
