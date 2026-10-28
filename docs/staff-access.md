# Staff access — first increment

Status: implemented for Preview review; production release remains separate. Jira and Google Calendar connections in ChatGPT are not website integrations. This increment does not display live tasks, schedule meetings, or track presence.

## Sign-in flow

Homepage footer → Staff sign-in (`/login`) → email code → My workspace (`/workspace`). An administrator follows Team & Access (`/admin/team`) to approve staff, edit roles or suspend access. Only administrators can view inquiries. No public registration is exposed.

An invitation approves an email for 7 days. The administrator shares the site's sign-in link; this action sends no invitation email. A successful email-code sign-in activates membership. Expired invitations can be renewed by saving status Invited. Suspension blocks existing sessions on their next request. Every access update invalidates older sessions, including after reactivation; staff must sign in again. In-flight requests already authorized may finish.

## Roles

| Role | Access |
|---|---|
| Employee | Own workspace |
| Product Manager | Own workspace; reserved work-management permission for the next increment |
| Administrator | Workspace, customer inquiries, Team & Access |

All staff include Employee and may have multiple roles. Product Manager does not grant inquiry access or permission to assign roles. Permissions are evaluated on the server per request, not accepted from the browser. An administrator cannot remove their own administrator access. The configured bootstrap administrators cannot be suspended or edited through the website; private environment configuration remains the recovery mechanism.

## Configuration

Keep the existing admin/SMTP/Mongo configuration. Add `SWS_STAFF_ENABLED=true` to Preview to enable membership management. Without it, existing configured administrators can still sign in; membership management is disabled.

Optional sensitive `SWS_PRODUCT_MANAGER_EMAILS` is a comma-separated subset of `SWS_ADMIN_EMAILS` to give a bootstrap administrator the additional Product Manager role. Store real addresses only in private configuration. Non-bootstrap Product Managers are assigned through Team & Access.

CommonJS, Express, Node 22 and the isolated Better Auth ESM module are retained. No dependency versions changed. Production and Preview use separate membership collections.

## Data model

Collection `sws_staff_preview` or `sws_staff_prod`:

| Field | Meaning |
|---|---|
| `_id` | Normalized verified email, unique primary key |
| `roles` | Employee plus optional Product Manager and Administrator |
| `status` | invited, active, suspended |
| `version` | Revision counter; stale edits receive 409 |
| `invitationExpiresAt` | Last date an unaccepted invitation permits sign-in |
| `sessionValidAfter` | Older sessions cannot authorize requests after access changes |
| `createdAt`, `updatedAt` | Creation and last access-management change |
| `history` | Latest 50 invite, acceptance and role/status changes; actor ID, time and resulting roles/status |

Identity/passwordless sessions stay in the existing Better Auth collections. No rewriting existing users or inquiry documents. Status/email ordered listing has an index; pagination returns at most 50 people and a cursor. History is a bounded operational record, not a permanent compliance archive. Email changes require a new approved membership; there is no account-merging feature.

## HTTP API

All private responses are no-store and noindex. Mutations require the exact configured Origin, JSON, a verified session and server-side administrator permission. Generic sign-in responses do not disclose approved addresses. Existing shared OTP abuse limits continue to apply.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/workspace/me` | Signed-in staff email, roles and effective permissions |
| GET | `/api/admin/team?after=email` | Members, next cursor, configured admins, assignable roles |
| POST | `/api/admin/team` | Approve invitation: `{ "email": "employee@example.com", "roles": ["employee"] }` |
| PATCH | `/api/admin/team/:email` | Replace access: `{ "roles": ["employee", "product-manager"], "status": "active", "version": 1 }` |

Success: 200 (201 invitation); invalid input 400; missing session 401; insufficient/revoked access or wrong Origin 403; duplicate/stale/protected edit 409; unavailable database/configuration 503. Unknown roles, extra fields and duplicate roles are rejected. Administrator grants and suspensions receive a UI confirmation. The endpoint permissions remain authoritative if the UI is bypassed.

Use the existing Postman collection's cookie jar and sign-in requests, then the Staff team folder. Supply the approved email privately, enter its real sign-in code and use the matching baseUrl/Origin. Do not run email-code requests unattended.

## Verification and next increment

Automated tests cover actual Better Auth with its memory adapter plus HTTP authorization, invitation expiry, suspension, old-session denial after reactivation, role restrictions, invalid inputs, CSRF and stale updates. The optional `SWS_TEST_MONGODB_URI` test creates/drops a disposable test database and additionally exercises real MongoDB membership creation, activation and concurrent updates. Never point that test at the production database.

Before release, verify a real Atlas/SMTP Preview sign-in and a complete employee invite → sign-in → role update → sign-in again → suspend flow. Browser layout review and the Vercel Node 22 build are also required. No real staff emails/invitations are sent by automated tests.

Next: authorize Jira separately for the website, map staff to verified Jira account IDs, and load only approved SWS project tasks. Then add work requests, weekly/monthly milestones and Calendar free/busy scheduling. Presence, meeting requirements, reminder cadence and office hours still need implementation; no monitoring is implied by login.

Verified locally: Node 22 suite: 36 passed, 1 skipped (real MongoDB test requires a test URI). Browser with real Better Auth memory adapter and mocked delivery: sign-in, workspace, invitation form and sign-out passed; widths 1440, 834, 375 and 320 showed no page overflow. Mobile layout visually inspected. No real staff accounts were invited by these checks.
