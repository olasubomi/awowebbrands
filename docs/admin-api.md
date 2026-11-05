# Staff access extension

See [staff-access.md](staff-access.md) for employee roles, invitations and the new workspace. When enabled, private membership permissions extend the bootstrap allowlist described below.

# Staff sign-in and inquiry administration

Preview implementation. Express remains the web/API framework. Better Auth 1.7.13 provides verification and sessions from one isolated ESM module; the rest of the application remains CommonJS JavaScript. No TypeScript or framework migration is required.

## Using the interface

Open `/login` from the **Staff sign-in** footer link. Enter an approved email address, enter the emailed six-digit code within five minutes, and continue to `/admin/inquiries`. Browse pages of 20, filter by service/status, and open an inquiry. Save New, In progress, or Closed status. A status change sends no email and makes no appointment. Sign out from the header.

Only explicitly approved email addresses can use the staff workspace. New identities are created after successful code verification; visitors cannot sign up or assign themselves a role. Public inquiry submission remains available without a login.

## API requests

All responses on private routes use `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. Authentication uses a secure HttpOnly, SameSite=Lax cookie on HTTPS, not a token in localStorage. Sessions expire after eight hours. Current server configuration must approve the verified email on every protected request.

Unsafe requests require JSON content type and an Origin header equal to the exact configured sign-in origin. Browser fetch supplies the Origin automatically. In Postman, set `baseUrl` to that origin, send `Origin: {{baseUrl}}`, and let the cookie jar retain the session. Do not copy codes, cookies or credentials into shared collections.

| Method and path | Input / response |
| --- | --- |
| POST `/api/admin-auth/request-code` | `{ "email": "admin@example.com" }`. Generic 200 response for syntactically valid addresses; only approved addresses receive mail. |
| POST `/api/admin-auth/verify-code` | `{ "email": "admin@example.com", "code": "123456" }`. Success sets the session cookie and returns `{ "success": true }`; no session token is returned in JSON. |
| POST `/api/admin-auth/sign-out` | Revokes the current session and clears its cookie. |
| GET `/api/admin/me` | Returns the authenticated admin email and role. |
| GET `/api/admin/inquiries?page=1&status=new&serviceId=web-development` | Optional allowlisted filters; page 1–1000, 20 records per page, `hasMore` for navigation. |
| GET `/api/admin/inquiries/:id` | UUID inquiry ID; returns `{ "inquiry": ... }` with approved fields only. |
| PATCH `/api/admin/inquiries/:id/status` | `{ "status": "in-progress", "version": 0 }`. Returns updated inquiry. Version conflict/unavailable record returns 409; reload before retrying. |

Unauthenticated private APIs return 401; authenticated identities without SWS admin access return 403. Invalid input returns 400, missing detail returns 404, throttling returns 429 with Retry-After, and unavailable configuration/database operations return a safe 503. Private HTML pages redirect an unauthenticated visitor to `/login`.

Generic `/api/auth` endpoints are deliberately not mounted publicly: no public signup, account editing, or user/role-management API is exposed in this increment. There is no password to reset.

Codes are stored hashed, valid for five minutes, single-use, and limited to three wrong attempts by the auth library. The app also uses shared MongoDB rate buckets: send requests 10/IP and 3/email per ten-minute window plus one/email per minute; verify requests 30/IP and 8/email per ten-minute window. These are fixed windows, not sliding-window promises. Generic mail responses do not confirm inbox delivery. Backend SMTP failures must be diagnosed privately, without logging codes or credentials.

## Minimal schema reference

Common identity data uses the auth library's standard user fields (ID, name, email, verified email flag, optional image and timestamps). Application access is kept out of the shared identity shape: this increment uses the private SWS allowlist as the source of admin privileges. Independent applications do not inherit SWS admin access.

Auth collections use `sws_auth_preview_` or `sws_auth_prod_` prefixes for users, sessions, accounts and verifications. Sessions and verifications have expiry cleanup indexes; expiry checks still apply before cleanup. Auth and intake reuse the configured Atlas cluster, with bounded independent connection pools.

Existing inquiry records retain their UUID, reference, digest and submitted content. Admin detail responses exclude digests. Additive fields:

| Field | Meaning |
| --- | --- |
| `managementVersion` | Integer revision for concurrent admin status updates. Existing records without it behave as revision 0. Exposed to the admin API as `version`. |
| `statusHistory` | Latest 100 status changes: previous status, new status, auth user ID (`changedBy`) and timestamp. Written atomically with the status update. |

No bulk data migration is required. The proposed second history collection was replaced with an embedded bounded history to make status/audit writes atomic without a second operation. The auth MongoDB adapter still uses transactions for its own identity/session operations on Atlas.

## Environment and handover

Configure these privately in Vercel; no real admin addresses or secrets belong in repository examples:

| Variable | Purpose |
| --- | --- |
| `SWS_ADMIN_ENABLED` | Must equal `true`; otherwise admin access fails closed. |
| `SWS_AUTH_ORIGIN` | Exact HTTPS origin, no trailing slash, path or query. Local HTTP is permitted only for localhost/127.0.0.1. |
| `SWS_AUTH_SECRET` | Independently generated secret of at least 32 characters. Use different Preview/Production values. |
| `SWS_ADMIN_EMAILS` | Comma-separated owner-approved admin addresses; normalized to lower case. |
| `MONGODB_URI`, `MONGODB_DB` | Existing private database configuration. |
| `INQUIRY_COLLECTION` | Optional inquiry collection override; Preview is configured to `inquiries_preview`, leaving live `inquiries` untouched. |
| Existing `SMTP_*`, `MAIL_FROM` | Reused SMTP transport settings with a separate sign-in message. |

Preview auth uses a fixed feature-branch origin. Open that exact Preview URL for sign-in; other deployment URLs direct users to it. Branch-scoped variable creation was rejected by Vercel's Git metadata validation, so the five new variables are Preview-scoped. Previously built deployments keep their original configuration. Production has not been enabled or changed.

To add or revoke an admin, update the private allowlist and redeploy the current environment. Session access checks use the deployed allowlist; do not describe an unsaved environment edit as immediate revocation. Do not reactivate old deployments with superseded access settings. Rotate the auth secret if session compromise is suspected. More advanced role/group administration is a later increment.

## Verification and limits

- Node 22.23.4: 33 tests pass; one optional MongoDB integration test is skipped without `SWS_TEST_MONGODB_URI`.
- Auth tests use the real library with its in-memory test adapter: sign-in, HttpOnly cookies, sign-out, expiry, wrong/reused/concurrent codes and access checks. Mock mail only.
- Browser checks cover login, list/detail, pagination/filtering, status save, safe text rendering, sign-out, anonymous redirects and widths 1440/834/375/320px. Desktop/mobile screenshots inspected.
- Dependency tracing includes the ESM auth module, minimal auth library and Mongo adapter. The backend-only Vercel build is READY.
- The optional test in `tests/admin-mongo.test.js` exercises the real Mongo adapter, legacy inquiry reads, atomic status writes and shared limits against a disposable replica set. A local MongoDB process cannot start in this workspace (`open: Operation not permitted`); real Mongo/Atlas integration is therefore not yet verified here. Never point this destructive disposable-database test at a production database or shared server.
- Owner sign-in through the Preview must verify real Atlas and SMTP operation before production release. No real code or inquiry email has been sent by the automated checks.

References: [Express integration](https://better-auth.com/docs/integrations/express), [Email OTP](https://better-auth.com/docs/plugins/email-otp), [MongoDB adapter](https://better-auth.com/docs/adapters/mongo).
