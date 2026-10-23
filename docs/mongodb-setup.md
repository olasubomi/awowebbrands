# Atlas connection and inquiry persistence

## Target

Vercel project: `soft-web-services` (`prj_5ItGCPrZPG9VcOf7schdyNCPp2Gg`). Soft Web Services uses its own database and database credentials. Reusing an Atlas cluster does not share application users, sessions, or role grants with ChopChow.

| Environment | Database | Secret |
|---|---|---|
| Local / Preview | `softwebservices_dev` | Dedicated development database user |
| Production | `softwebservices` | Separate production database user |

## Atlas and Vercel

1. Restrict the database user to read/write access on the intended database. An Atlas account login is distinct from this application database user.
2. Allow the application's outbound network connection in Atlas. Confirm Vercel egress/network options before selecting an allowlist strategy; do not assume your laptop's IP authorizes Vercel. Do not broaden network access without reviewing the choice.
3. Set `MONGODB_URI` as a Secret/Sensitive variable for Preview in Vercel. Do not expose it in browser-prefixed variables. Set `MONGODB_DB=softwebservices_dev` as Preview configuration if explicitly selecting the database; this is also the non-production default.
4. Verify database connectivity in a new Preview deployment, then submit a synthetic inquiry. Check that one document exists, with no duplicate on a same-key retry. No real customer data is required.
5. Configure SMTP and run a separately approved delivery check. Inquiries save even without SMTP.
6. Add separate Production credentials when ready. Changing an environment variable requires a new deployment before runtime receives it.

Current connection verification: the Vercel metadata check found `MONGODB_URI` as sensitive but scoped only to Production. Its value was not retrieved. Live Atlas authentication, permissions and network connectivity remain unverified.

## Stored documents

Collection `inquiries` has a Mongoose strict schema. Standard MongoDB `_id` uniqueness enforces one document per request key; no separate migration or unique-index initialization is required for that key.

| Fields | Meaning |
|---|---|
| `_id` | Lowercase UUID v4 idempotency key from the API |
| `digest` | SHA-256 of validated, normalized request data; rejects changed-key reuse |
| `reference` | Server-generated public receipt reference |
| `serviceId`, `serviceName` | Selected catalog service and name at submission |
| `fullName`, `businessName`, `email`, `phone` | Contact details |
| `contactPreference` | email / phone / either |
| `goal`, `answers` | Requested outcome and selected service's answers |
| `availableDays`, `availableTimes`, `timezone` | Contact availability preferences; no reservation |
| `status` | new / in-progress / closed; initially new |
| `notificationStatus` | pending / processing / sent / failed |
| `notificationAttemptedAt` | Time a notification attempt was claimed |
| `acknowledgmentSent` | Whether the requester acknowledgment was SMTP-accepted |
| `createdAt`, `updatedAt` | Record creation and most recent update timestamps |

`sent` means SMTP accepted the team message; it does not guarantee inbox delivery. `processing` may indicate an in-flight attempt or an interrupted/uncertain attempt. Staff follow-up and controlled retry tooling are not yet implemented.

Collection `intake_rate_buckets` stores hashed IP/hour identifiers, counters and expiry times. A TTL index removes expired buckets asynchronously. Inquiry records never use that TTL index. The configured read/write database user must be able to create the rate collection/index.

## Failure behavior

- Database unavailable before save: 503, no email attempt, entries retained in the browser.
- Save succeeds but email fails: 201, inquiry retained, notificationStatus failed.
- Concurrent requests: a single atomic pending-to-processing transition claims the notification.
- Same key and matching payload across instances/restarts: same inquiry reference, no new email attempt.
- Same key with changed payload: 409.
- Save succeeds but claim/status update fails: return saved receipt; notification may remain pending/processing for review.

No public read/update endpoint is provided for submitted inquiries. Add authenticated staff APIs and roles before exposing those records.

## Diagnosing a failed save

A 503 response includes a fixed `supportCode` and random `incident` reference; the form displays them for support. Runtime logs contain only these references and the operation stage. Driver messages, URIs, credentials and customer fields are never logged or returned.

| Support code | Check |
|---|---|
| SWS-CONFIG | Deployment has MONGODB_URI; connection string is valid and all placeholders are replaced |
| SWS-AUTH | Atlas database username/password, URL-encoded password characters, and authentication settings |
| SWS-ACCESS | Database user has readWrite on softwebservices_dev, including rate-bucket index creation |
| SWS-CONNECTION | Cluster availability, DNS, TLS, and Atlas network access for Vercel egress |
| SWS-SCHEMA | Application record validation; report the incident for a code fix |
| SWS-SAVE | Unclassified persistence failure; investigate the incident without exposing raw driver errors |

These codes narrow the investigation; they do not by themselves prove a particular Atlas setting is wrong. No network allowlist or database privilege is automatically broadened.

Atlas can report database authentication/authorization failures with code 8000; the application maps known fixed phrases to SWS-AUTH or SWS-ACCESS. Unrecognized numeric server errors return SWS-SAVE followed by the numeric code, without the original message. The isolated MongoDB integration attempt in the workspace was blocked by the runtime (mongod could not start: open operation not permitted); it did not verify or modify Atlas.
