# Admin login and inquiry dashboard — first increment

Status: Preview implementation, 26 October 2026. The auth module, protected APIs and staff interface are implemented. Production remains unchanged. See [admin-api.md](admin-api.md) for the implemented contract, configuration, schema and verification limits.

## Goal and user stories

The owner can securely sign in, review saved service inquiries, and track their progress without browsing MongoDB manually.

- As the owner, I can sign in with a short-lived code sent to my approved email address.
- As an admin, I can browse inquiries with pagination and filter by service and status.
- As an admin, I can open an inquiry to see its reference, service, contact preferences, request, answers, availability, submission time, and email delivery state.
- As an admin, I can change an inquiry between New, In progress, and Closed.
- As the owner, I can sign out and have the session invalidated.
- As a visitor, I can keep submitting a consultation without an account.

## Current backend

Reviewed main commit c282154cc814eb01d8bf279f2f89bf7e06d5e980: Node.js 22, Express 4, CommonJS JavaScript, Mongoose, MongoDB Atlas, and Nodemailer. Authentication is not installed.

The existing inquiry schema in lib/inquiry-store.js already supports status values new, in-progress, and closed, plus createdAt/updatedAt. Keep the existing inquiry IDs, references, idempotency behavior, notification fields, and public submission API. No bulk rewrite of existing inquiries is planned.

## Sign-in proposal

Use a maintained authentication library for sessions and verification. Better Auth with its MongoDB adapter and email OTP plugin is the candidate, subject to a compatibility spike and tests.

The existing backend is CommonJS, while the current Better Auth Express integration requires ESM. Prove an isolated ESM integration first; do not convert the whole application or introduce TypeScript solely for this feature. Pin mutually compatible library/adapter versions and verify the Node/Vercel bundle before implementing the UI.

Reuse the established SMTP transport configuration for sign-in mail, with a separate template and purpose. Only approved admin addresses may request an admin sign-in. Disable public sign-up for this increment and explicitly bootstrap the first approved identity. Use generic public responses, short-lived single-use hashed codes, bounded verification attempts, resend limits, and durable database-backed rate limiting.

The owner has confirmed two initial admin email addresses. Keep their actual values in private configuration, not repository documentation or PR descriptions. Normalize casing, require verified ownership through the sign-in flow, and explicitly bootstrap these accounts only. No accounts have been activated by this document change. No password or secret should be supplied in chat.

## Simple access model

Authentication proves identity; a separate server-side check grants SWS permissions.

| Identity | Access |
| --- | --- |
| Visitor | Public website and existing consultation submission |
| Authenticated identity without active SWS admin permission | No inquiry listing, details, or status updates |
| Active SWS admin | Inquiry list, detail view, status update, and sign-out |

Identity/session records are separate from inquiries. Keep SWS access records local to this application: auth user ID, admin role, and active status. Do not accept a role or admin flag from browser input. Check current access on every protected request so revocation takes effect without waiting for a session to expire.

ChopChow and WellDurham roles and records remain independent. Shared base identity schema conventions may be extracted later; no cross-app user migration, tenant system, group hierarchy, or client portal is part of this increment.

## Pages and API outline

- /login: request a code, enter it, and show safe retry/expiry feedback.
- /admin/inquiries: paginated list and service/status filters.
- /admin/inquiries/:id: detail view and status control.
- Auth library routes under /api/auth; register its handler before request-body parsers.
- GET /api/admin/inquiries: bounded pagination and allowlisted filters.
- GET /api/admin/inquiries/:id: approved inquiry fields only.
- PATCH /api/admin/inquiries/:id/status: allowlisted status and optimistic concurrency check.

Protect both HTML pages and APIs on the server. Use 401/403 responses appropriately; no inquiry content in an unauthenticated response. Private responses use no-store and noindex, and private routes stay out of the sitemap. Escape inquiry content, validate identifiers, and never pass arbitrary request filters to MongoDB.

Status updates should atomically record the actor, previous status, new status, and time in a small history collection. This answers who changed the status and when. Do not expose digests, rate buckets, auth secrets, or raw database errors.

Use secure HttpOnly session cookies, appropriate SameSite settings, trusted origin checks, and CSRF protections for mutations. No tokens in localStorage. Explicitly configure trusted Preview and Production origins; do not trust all Vercel subdomains.

## Configuration and rollout

The owner has confirmed both initial admin emails. Document the required auth secret, canonical auth URL, approved admin bootstrap configuration, collection/index setup, and a controlled bootstrap/revocation procedure. Configure secrets privately in Vercel. Separate Preview auth/test data from Production before testing account creation.

Prepare a Preview first. Test with mocked mail for automated checks; arrange a real owner sign-in as a separate review step. A new production release requires a tested, reviewed implementation.

## Acceptance and handover

Tests must cover unapproved addresses, wrong/expired/reused codes, resend and guessing limits across instances, sign-out, expired/revoked sessions, non-admin access, CSRF/origin rejection, escaped inquiry content, bounded pagination, invalid status changes, concurrent edits, and safe database/mail failures. Retain the public inquiry tests and add mobile/keyboard checks.

Update the human API guide, Postman collection, schema reference, configuration guide, and release notes alongside code. No implementation tests have run for this plan: the coding environment was unavailable when it was prepared.

Official integration references reviewed:
- https://better-auth.com/docs/integrations/express
- https://better-auth.com/docs/plugins/email-otp
- https://better-auth.com/docs/adapters/mongo


## Backend compatibility checkpoint

Pinned Better Auth and its Mongo adapter to 1.7.13, with the direct MongoDB driver pinned to 6.21.0. Removed the unused pg dependency: no repository code imports it, and its legacy v7 peer conflicts with the auth package. The application remains CommonJS JavaScript. Only lib/admin-auth.mjs is ESM, loaded through dynamic import.

Node 22.23.4 passes the auth/session tests and existing intake tests. The deployment dependency trace includes the ESM entry, Better Auth minimal build and Mongo adapter. Trace warnings concern optional MongoDB authentication/compression/telemetry integrations that this deployment does not use; an actual Vercel build is required next.

The first release uses a private SWS_ADMIN_EMAILS allowlist as the server-side source of admin access. Approved identities are created only after successful email-code verification; generic library signup/account-edit endpoints are not exposed. Every protected request checks both the session and current allowlist. A separate group/role administration UI is deferred.

Status history is embedded atomically with each inquiry update, retaining the latest 100 changes, rather than using a second collection/transaction. Existing records use version 0 until their first admin status update; existing inquiry IDs and content are not rewritten.


## Interface checkpoint

Added responsive staff sign-in and inquiry list/detail screens, pagination, service/status filters, atomic status revision handling, sign-out, and a Staff sign-in footer entry. No decorative arrows or client portal are added. Full real-library browser flows pass with mocked mail at four viewport widths; see the Admin API guide for the real-Atlas verification gap and Preview handoff.
