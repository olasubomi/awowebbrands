# Service inquiry API — first increment

Same-origin JSON API. This is a public intake, with no account or client-project access. Staff authorization and durable inquiry records are future work.

## GET /api/services

Returns `categories`, `services`, and `generalService`. Each service includes its ID, description and question definitions. `lib/services.js` is the authoritative service schema; do not duplicate question options in clients. No prices are published.

## POST /api/inquiries

Headers: `Content-Type: application/json`, `Idempotency-Key: <UUID v4>`. Browsers must use the configured public origin. Generate one key per payload and reuse it for retries of that payload.

Example (replace the request key with a fresh UUID):

```json
{
  "serviceId": "not-sure",
  "fullName": "Example Visitor",
  "businessName": "Example Business",
  "email": "visitor@example.com",
  "phone": "",
  "contactPreference": "email",
  "goal": "I want to discuss a website for my business.",
  "availableDays": ["Monday", "Wednesday"],
  "availableTimes": "Afternoons after 2 pm",
  "timezone": "America/New_York",
  "answers": {},
  "faxNumber": ""
}
```

| Field | Rules |
|---|---|
| serviceId | One catalog ID, or `not-sure` |
| fullName | Required text, maximum 120 characters |
| businessName | Optional text, maximum 160 |
| email | Required email address, maximum 254 |
| phone | Optional for email contact; required for phone/either; maximum 40 |
| contactPreference | `email`, `phone`, or `either` |
| goal | Required text, maximum 3,000; do not include sensitive data |
| availableDays | Array of unique full English weekday names; may be empty |
| availableTimes | Optional preference text, maximum 300 |
| timezone | Required recognized timezone, maximum 80 |
| answers | Object containing only the selected service's question IDs; values are strings, maximum 500 each; required/options/URL/date rules come from the catalog |
| faxNumber | Honeypot: leave empty |

Unknown top-level fields are rejected. Body limit is 20 KB. Recipient, subject and email content fields are never accepted from clients.

201 returns `{reference, saved: true, notificationStatus, acknowledgmentSent, message}` after the database has accepted the inquiry. Email is attempted afterward. `notificationStatus` is `pending`, `processing`, `sent`, or `failed`. A saved inquiry remains successful even if SMTP is missing or fails. `acknowledgmentSent: false` means the requester email is unconfirmed; it does not indicate that the database save failed. Do not resubmit a saved inquiry just to trigger email.

Repeating the same key and normalized payload returns the same reference across instances/restarts. Notification fields may reflect a newer delivery state; no second email attempt is started. Availability does not reserve a time. See `mongodb-setup.md` for stored fields and recovery limitations.

| Status | Meaning/action |
|---|---|
| 400 | Invalid fields/JSON/key; correct errors (`errors` may identify fields) |
| 403 | Browser origin rejected |
| 409 | Key reused with changed payload; generate a new key |
| 413 / 415 | Body too large / unsupported content type |
| 429 | Rate limited; honor `Retry-After` |
| 503 | Database/configuration failure before acceptance; preserve entries and retry with the same key |

POST `/api/nodeEmails` returns 410. No caller-controlled email relay remains.

## API tools

Postman and Thunder Client can call these endpoints using the same JSON and headers. Start with the isolated automated tests using simulated storage and delivery; do not run delivery tests against production without owner approval. Keep environment secrets out of exported collections. The automated Node tests provide executable request/response examples without sending mail or connecting to Atlas.

This increment supplies this reference and executable tests, not a generated Swagger interface. A later OpenAPI document can drive Swagger UI and Postman imports once the API expands; maintain one contract rather than independently edited copies. Codex can assist with implementation and contract checks, but is not an API runtime, authorization layer or source of truth.

## Importable Postman collection

Import `docs/Soft-Web-Services.postman_collection.json` in Postman. It includes the catalog request, six inquiry examples (each service plus help choosing), and saved sample responses. Saved responses are illustrative; they do not indicate that an inquiry was sent.

1. Import the JSON file and open the collection documentation or a request's saved examples.
2. To execute requests locally, run `npm ci` then `npm run preview` from the repository. The collection defaults to `http://localhost:5000`; this server is on the machine running the application, not an already deployed website.
3. Send the catalog GET request first. Inquiry POST requests can send actual emails when SMTP is configured. Without MongoDB they return 503. With MongoDB but no SMTP they save the inquiry and return 201 with notificationStatus failed. Existing automated tests use mocked delivery; the normal preview server does not fake success.
4. Inquiry requests generate a UUID and reuse it for unchanged payload retries. A changed payload generates a new UUID. Clear the collection variable `inquiryKey` to intentionally submit another identical inquiry.
5. Do not store SMTP credentials or real customer data in shared collection exports. `baseUrl` can later point to a verified staging deployment.

The collection is a checked-in developer artifact, not a published Postman workspace. Update its examples whenever the API or catalog changes. A shared OpenAPI contract and Swagger viewer remain a later documentation increment.
