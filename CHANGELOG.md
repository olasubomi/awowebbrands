# Change log

## Unreleased — combined service catalog and consultation intake

- Combined web, marketing, tutoring/exam preparation and interview offerings under Soft Web Services.
- Added responsive catalog, tailored inquiry questions, contact preferences and availability.
- Added validated structured intake, server-owned emails, receipt references and retry protection.
- Replaced the old email relay; removed credentials from the retired handler and entrypoint.
- Removed unused solar form components; replaced the homepage iframe and unapproved historic prices with catalog/consultation links.
- Added mocked delivery/API tests, setup instructions and schema/API documentation.
- Deferred accounts/RBAC, client portals, database persistence, pricing and booking confirmation.

### Validation

Nine automated tests pass on Node 24.19.0, using local HTTP and mocked SMTP only. Browser visual checks remain pending: the environment lacked Chromium and its download failed. No production mail was sent and no deployment was performed.

## Unreleased — API documentation access

Added an importable Postman collection with the catalog, six service inquiry requests, illustrative responses, and payload-aware retry keys. Documented local setup and the distinction between saved examples and actual delivery.

## Unreleased — MongoDB-backed inquiry foundation

- Added Mongoose connection reuse, strict inquiry schema and separate Soft Web Services database selection.
- Save inquiries before email; email failures no longer discard submissions or require visitors to retry.
- Persist request keys and use atomic notification claims across server instances. Store hourly rate limits in MongoDB.
- Updated API contract, Postman examples and receipt wording to distinguish saved records from email delivery.
- Export Express for Vercel, use the current Node builder, declare Node 22, and disable legacy SMS by default.
- Atlas live verification and a Vercel Preview are pending Preview-scoped MONGODB_URI; the variable was observed only in Production. No domain changes or live emails were made.

Validation: 15 tests pass on Node 22 and Node 24 using simulated storage/delivery plus offline Mongoose schema validation. Live Atlas and browser verification remain pending.
