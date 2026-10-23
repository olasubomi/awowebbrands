# Soft Web Services

Public website for Soft Web Services, including former Awo STEM Coaching offerings. Awokorp is the umbrella company; ChopChow remains independent. WellDurham and client project access are outside this release.

## Setup

Use Node 22 (the Vercel project runtime) and run `npm ci`, `npm test`, then `npm run preview`. Open http://localhost:5000/services. Copy `.env.example` to `.env` for local settings; never commit real credentials. All 15 automated tests pass on Node 22 and Node 24.19.0. A Vercel build and live Atlas check remain required.

The catalog loads without database access. Submitting an inquiry requires `MONGODB_URI`; no email-only or in-memory production fallback exists. Set `MONGODB_DB=softwebservices_dev` for local/Preview. With no explicit database name, production uses `softwebservices`, other environments use `softwebservices_dev`. This explicit database selection overrides the URI database path so the app cannot accidentally use ChopChow collections. Credentials must be restricted to the intended database.

The startup entrypoint exports Express for Vercel and listens only when run directly. `vercel.json` packages the server and required static files. Legacy phone verification is disabled unless `ENABLE_LEGACY_PHONE_VERIFICATION=true`; the new form never uses it.

## Inquiry flow

Visitors choose one of five services (or help choosing), answer relevant questions, provide contact preferences and optional availability, and submit. The server validates, applies a shared MongoDB rate limit, saves the inquiry with majority write concern, then claims one notification attempt. A receipt means the inquiry was saved, not that an appointment was confirmed or email arrived.

If SMTP fails or is unconfigured, the inquiry remains saved and the response remains 201 with notification status. Retrying the same key does not resend mail. Failed or interrupted notifications need staff follow-up; a dashboard and notification recovery process are future increments. No customer inquiry listing endpoint exists until authentication and authorization are implemented.

The homepage links to the catalog and consultation page. `/awo_form/` remains a bookmark alias. Historic conflicting prices were removed pending owner approval.

## Code and documentation

| Location | Purpose |
|---|---|
| `lib/services.js` | Canonical catalog and service questions |
| `lib/inquiry-validation.js` | Server input validation |
| `lib/inquiry-store.js` | Reusable MongoDB pool, Mongoose schemas, durable keys, shared rate limiting |
| `lib/submit-inquiry.js` | Save-first and notification orchestration |
| `lib/inquiry-mailer.js` | Server-owned email destinations and templates |
| `app.js`, `index.js` | Express routes and local/Vercel startup |
| `service-intake/` | Responsive plain JavaScript frontend |
| `docs/intake-api.md` | API contract and Postman instructions |
| `docs/mongodb-setup.md` | Atlas/Vercel setup and stored schema |
| `tests/` | HTTP, validation, schema and simulated persistence/delivery tests |

## Email configuration

Provide `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optional `SMTP_USER`/`SMTP_PASS`, `MAIL_FROM` and `INQUIRY_TO`. Use one team mailbox/distribution address for `INQUIRY_TO`. Verify the sender with your provider. No real emails are sent by automated tests.

For a fixed public deployment set `PUBLIC_ORIGIN` to the exact origin without a trailing slash. Preview can infer the origin from the request. Vercel uses one trusted proxy hop by default; other hosting leaves proxy trust disabled. Override `TRUST_PROXY_HOPS` only for a known proxy chain. Confirm actual client IP behavior before release.

## Security and operations

Intake is public; account/role management is a later increment. Unknown fields, invalid service answers, oversized bodies and foreign browser origins are rejected. POST `/api/nodeEmails` returns 410. SMTP recipients and templates are owned by the server.

MongoDB stores inquiries until an owner-approved retention policy is implemented. Only short-lived rate buckets expire automatically. Idempotency keys are retained with inquiries, across restarts and instances. Rate limits are 20 validated attempts per IP per UTC hour, stored with hashed IP/hour identifiers. Hashing is pseudonymization, not anonymization. Staff should access Atlas records only through approved database permissions until the staff interface exists.

A process interruption during SMTP can leave `notificationStatus=processing`; SMTP cannot guarantee exactly-once delivery. Do not blindly retry notifications. Review uncertain attempts before resending. No scheduled retry worker is included.

Previously hardcoded credentials were removed from the retired email handler and entrypoint, but remain in git history; revoke/rotate any still-valid credentials before release. Legacy dependencies/integrations require a separate review.

## Release checklist

Run `npm test` and review contract changes in `docs/intake-api.md`. Update the Postman collection and `CHANGELOG.md` together. Configure Preview Atlas access and secrets, build on Node 22, verify a synthetic inquiry is persisted, then test owner-approved SMTP delivery and desktop/mobile flows. Keep Production and Preview credentials/databases separate. Bring `softwebs.io` online before redirecting old domains; no domain routing changes are part of this code change.
