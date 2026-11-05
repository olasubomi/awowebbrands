# Jira My Work — read-only first release

Implemented behind `SWS_JIRA_ENABLED`. Live Jira authorization is not configured yet. The ChatGPT Atlassian connection is independent and cannot be used as the website's credential. No API tokens are collected from staff.

## Setup in Atlassian

Create one company-owned OAuth 2.0 integration named **Soft Web Services Staff** in the [Atlassian developer console](https://developer.atlassian.com/console/myapps/). Enable OAuth 2.0 authorization and register this exact Preview callback:

```
https://soft-web-services-git-feat-5602c7-olasubomis-projects-078efd3e.vercel.app/api/workspace/jira/callback
```

Add Jira API classic read scopes `read:jira-work` and `read:jira-user`. The authorization request also asks for `offline_access` for rotating refresh tokens. Configure distribution/sharing so approved staff other than the app owner can consent. Where available, choose a resource-level grant for the Awowebops site. This website also independently restricts the returned resource to the configured site/cloud ID.

Under the app's Settings, copy its Client ID and Secret directly into Vercel project **soft-web-services**, Preview environment only:

| Variable | Value |
|---|---|
| `SWS_JIRA_CLIENT_ID` | Client ID from the SWS Atlassian integration |
| `SWS_JIRA_CLIENT_SECRET` | Secret from that integration; sensitive |
| `SWS_JIRA_ENCRYPTION_KEY` | Separate randomly generated 32-byte key in standard base64; sensitive |
| `SWS_JIRA_ENABLED` | `true` after the other values are saved |

The Preview encryption key has been generated and saved privately in Vercel. For a separate future environment, generate its encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` in a private local terminal, or let the implementer configure it privately. Do not paste credentials into chat, Git, Postman, browser JavaScript or documentation. Keep the encryption key stable; changing it requires staff to reconnect. A managed key-rotation procedure is not included in this increment.

Defaults already restrict the integration to `https://awowebops.atlassian.net`, cloud ID `056109ea-b80b-4779-a40c-4a029af5f0dc`, project `SWS`. Override only through trusted server variables `SWS_JIRA_SITE_ORIGIN`, `SWS_JIRA_CLOUD_ID`, `SWS_JIRA_PROJECT_KEY`. No client-supplied project, assignee, account ID or JQL is accepted.

Redeploy Preview after configuration. Keep production disabled until real consent and task checks pass. Production needs its own registered callback using the production `SWS_AUTH_ORIGIN`; use a separate app and encryption key for Preview/provider isolation. Changing callback configuration must be coordinated with the app owner.

## Staff flow

Staff sign in normally → My workspace → Connect Jira → Atlassian consent for their own account → return to My Work → assigned SWS tasks. Each staff member needs access to the Jira site/project and any applicable issue security permissions. The app never changes Jira licenses or project membership. A Developer, Contractor or Product Manager role does not automatically grant Jira permissions.

My Work displays task key, summary, status, priority, due date and a link to edit the task in Jira. It fetches 20 tasks at a time, most recently updated first, with More tasks and manual Refresh. It includes completed tasks. No page-level list counts or milestone totals are inferred from partial pages. Missing due dates are stated explicitly. Recent Jira updates may take time to appear in search.

This release does not update tasks, infer work hours, show online presence, create milestones, schedule meetings, send follow-up messages or provide a manager-wide team view. Those are later increments requiring their own authorization and business rules.

## API

All endpoints require an active, email-verified SWS staff session. Suspended members and sessions invalidated by access edits are rejected before any Jira request. JSON mutations require the exact SWS Origin. The callback is session-bound and protected by a single-use random state with a ten-minute expiry.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/workspace/jira` | Configured/connected status and Jira display name, never credentials |
| POST | `/api/workspace/jira/connect` | Return Atlassian consent URL; browser must follow it |
| GET | `/api/workspace/jira/callback` | Consume state, exchange code, verify site and identity, store connection, redirect to workspace |
| GET | `/api/workspace/jira/tasks?nextPageToken=...` | Current staff member's assigned SWS tasks and opaque next cursor |
| DELETE | `/api/workspace/jira` | Remove this website's stored credentials for current staff member |

Success 200; invalid cursor/state 400; missing session 401; staff/Jira permission 403; reconnect or concurrent request 409; provider rate limit 429 with Retry-After; disabled/missing setup or unavailable provider/database 503. Callback errors redirect with a generic flag and never include token/provider diagnostics. Configuration failures do not disable SWS sign-in. Private responses are no-store/noindex.

Queries use Jira enhanced search `/rest/api/3/search/jql`, fixed to the configured project and `assignee = currentUser()`. Results are additionally filtered by project and the account ID obtained from Jira's own profile endpoint. Only selected task fields are returned. Task text is rendered using textContent.

## Storage and security

Separate Preview and Production collections: `sws_jira_preview_states`, `sws_jira_preview_connections`, and matching `sws_jira_prod_...` names. Existing users and inquiries are unchanged.

State documents: SHA-256 state digest as `_id`, authenticated user ID, hashed session ID, expiresAt. Mongo TTL cleans expired state; atomic consumption checks expiry and both identities, independent of TTL timing.

Connection documents: authenticated SWS user ID as `_id`, verified Jira account ID/display name, encrypted access/refresh token pair, expiry, created/updated timestamps and a short lease. AES-256-GCM uses a random nonce and authenticates the staff user ID; one user's ciphertext cannot be reused for another user. Provider tokens are never returned to the browser. Mongo backups containing these records must remain private.

A Mongo-backed 60-second lease serializes refresh, reconnection and disconnection per staff member across application instances. Rotated refresh credentials are saved before further Jira calls. Provider requests have ten-second timeouts and redirects are rejected. Staff-triggered consent/callback/tasks/disconnect actions share a 60/minute rate bucket. Requests blocked by another lease are retried manually, without automatic loops.

Disconnect deletes stored credentials locally. To revoke Atlassian's grant as well, the person must remove the app through their Atlassian connected-app settings. SWS suspension blocks use but does not revoke that external grant. No raw OAuth state, code, token, secret or provider diagnostics are explicitly logged by this code. Review platform access-log retention/redaction before production because OAuth callbacks conventionally carry authorization codes in their query string.

## Validation and release gate

Tests use simulated provider responses and real Better Auth tests elsewhere in the suite. Coverage includes cross-user/session/replayed/expired state, encrypted token ownership, other users/projects excluded, refresh replacement, lease contention, disconnection, provider errors, CSRF, invalid filters and suspended staff denial. Optional real-Mongo tests exercise state consumption and leases in a disposable database. Live Atlassian consent, real token refresh and real Jira tasks require the credentials above and remain unverified.

Before enabling production, test two distinct staff/Jira accounts, an account without SWS access, denial/cancelled consent, sign-out during consent, refresh, disconnect and SWS suspension. Confirm one person's tasks never appear for another. Current browser verification of the new Jira controls is pending. No real task modifications, consent grants, invitations or emails are made by automated tests.

Sources: [Atlassian OAuth](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/), [enhanced issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/), [current Jira user](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-myself/).

Current local validation: 46 tests passed, one optional real-Mongo test skipped, on Node 24. The Vercel Preview build verifies the Node 22 bundle. No new dependencies or module-format conversions were introduced.
