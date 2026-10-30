# Google Calendar and Meet for community events

Implemented behind a separate feature flag. Live Google OAuth/calendar/Meet verification is pending owner setup. The ChatGPT Calendar connection cannot serve as the website's credentials.

## Flow

1. An Event Organizer saves the SWS event. A blank meeting link is valid. SWS storage does not depend on Google availability.
2. Under Manage events → Google Calendar & Meet, connect the intended company Google account.
3. Select Create SWS Google calendar. This explicitly creates a separate secondary calendar named SWS Community Events, owned by the connected Google account.
4. On an SWS event card, select Create Google Calendar event + Meet, or the option without Meet.
5. Google creates/updates the linked event. If its Meet room is still pending, use Refresh Google link shortly afterward. The website saves the confirmed Meet URL as the protected SWS meeting link.

SWS remains the source of truth for title, time, description and cancellation. Changes made in SWS are not silently pushed to Google: use Sync on the event card. Changes made directly in Google are not imported. Attendee lists, RSVPs, invitations, reminders and attendance are not synchronized. Attendance still requires organizer confirmation after the meeting ends. Members do not need Google OAuth merely to RSVP or join.

Only the original linking SWS organizer can update that Google connection/event. Other authorized organizers can still manage SWS event details. Prefer a durable company-owned Google account for business events. Switching to another Google account/calendar is not an automatic event migration.

## Google Cloud setup

Create/use an SWS-owned project in [Google Cloud Console](https://console.cloud.google.com/), enable Google Calendar API, and configure Google Auth Platform branding, audience, data access and test users. Create an OAuth client with application type **Web application**.

Register this exact authorized redirect URI for Preview:

```
https://soft-web-services-git-feat-5602c7-olasubomis-projects-078efd3e.vercel.app/api/workspace/google-calendar/callback
```

Requested scopes: `openid`, `email`, and `https://www.googleapis.com/auth/calendar.app.created`. The app creates/manages its own secondary calendars; it does not request all-calendar access, personal event reads, free/busy, Gmail, or calendar sharing permissions. Calendar owner permissions and Google account capabilities still determine whether Meet rooms can be created. The service checks `allowedConferenceSolutionTypes` before requesting Meet.

Use an Internal audience only if all connecting organizers are in the eligible Google Workspace organization. Use External for personal Gmail/outside organizers and add intended accounts as test users while testing. Follow Google's publishing/verification requirements before production; test-mode authorizations can have limited lifetimes. The production callback must use the owned production domain; configure and verify required app domains before publishing.

Add to Vercel project soft-web-services, **Preview only**:

| Key | Value |
|---|---|
| `SWS_GOOGLE_CALENDAR_CLIENT_ID` | Google Web application client ID |
| `SWS_GOOGLE_CALENDAR_CLIENT_SECRET` | Its client secret, sensitive |
| `SWS_GOOGLE_CALENDAR_ENABLED` | `true` after configuration |
| `SWS_GOOGLE_CALENDAR_ENCRYPTION_KEY` | Already generated and privately saved for Preview; do not replace |

Redeploy Preview after saving the three owner-supplied settings. Do not put credentials in Git, chat or Postman. Separate production and preview OAuth clients/keys are recommended. No Google calls are made when the flag/configuration is absent; SWS event creation remains available.

## API and ownership

Every endpoint requires an active verified SWS Event Organizer or Administrator session. Mutations also require the exact configured Origin and JSON. No browser-supplied owner ID or arbitrary provider URL is accepted. Google sync first verifies SWS event audience access and revision.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/workspace/google-calendar` | Safe connection/setup status |
| POST | `/api/workspace/google-calendar/connect` | Start organizer consent |
| GET | `/api/workspace/google-calendar/callback` | Consume session-bound state, exchange code and verify account |
| POST | `/api/workspace/google-calendar/calendar` | With `{}` create the business calendar; returns existing one if already known |
| POST | `/api/workspace/google-calendar/calendar` | Recovery only: `{ "calendarId": "id-from-google-settings" }`, verified against Google's API with app-created-calendar scope |
| POST | `/api/workspace/google-calendar/events/:id` | `{ "version": 1, "withMeet": true }` to link/sync the authorized SWS event |
| DELETE | `/api/workspace/google-calendar` | Remove stored credentials; Google calendars/events remain |

A calendar-creation timeout may mean Google succeeded without returning an ID. The website records an ambiguous/pending state and refuses to create another blindly. An administrator should inspect the connected Google account, obtain the calendar's ID in Calendar settings and recover it using the recovery request. If no calendar exists, investigate before resetting the record. Do not keep clicking Create or generate a new calendar to bypass that protection.

Local disconnect removes credentials but retains private account/calendar metadata for reconnection to the same account. To revoke Google's app grant, the owner must also remove the app from their Google Account's third-party connections. Reconnecting to a different Google account clears the current calendar selection; existing events remain with their original calendar and require an explicit migration/recovery plan.

## Reliability, privacy and data

Google connections/states use separate environment collections `sws_google_calendar_preview_connections` and `sws_google_calendar_preview_states`, with corresponding production names. The tested Jira OAuth state/lease store is reused as a storage utility; provider data and encryption keys are separate.

OAuth state is random, hashed, expires after ten minutes and is atomically consumed with authenticated SWS user and session binding. PKCE uses an encrypted verifier. Access/refresh tokens are AES-256-GCM encrypted with provider/user-bound associated data. Google identity comes from the authenticated Google userinfo endpoint, not a browser-provided email. Refresh occurs server-side under a per-user lease; credentials are never returned to the browser.

Each Google event ID is deterministically derived from the SWS event UUID. A per-event lease serializes links, and private Google extended properties verify the original SWS event/owner before updating. Retrying after a network/database conflict reuses the existing Google event instead of creating another. A pending conference request is not replaced with a new room. New Meet requests use fresh request IDs. Sync saves SWS metadata under optimistic revision checks; if a conflict occurs after Google saves, refresh and retry.

The event record adds organizer-only `googleCalendar` metadata: ownerId, calendarId, eventId, Google URL, Meet status, synced SWS version and timestamp. Meeting URLs continue to follow existing SWS audience/RSVP rules. Public listings and calendar downloads never include Google metadata or protected Meet links. A Google calendar has its own separate sharing settings; this code does not publish or share it automatically.

Provider requests reject redirects, have ten-second timeouts, return safe errors and share a 30/minute organizer rate bucket. No raw provider diagnostics, secrets, tokens, codes or OAuth state are explicitly logged. Review platform access-log redaction for callback query strings before production.

## Verification

Tests simulate Google responses and cover consent state/PKCE, encrypted credentials, business calendar creation, ambiguous creation failure, stable event IDs, no attendee injection, pending Meet handling, disconnect, owner/revision conflicts and retry after Google success/SWS conflict. They do not contact Google or create real meetings.

Before production: complete real consent, business-calendar creation, Calendar/Meet sync, refresh, cancellation sync, failure/retry and disconnect using the intended account. Verify Google account eligibility for Meet. Browser layout and real Google/Atlas integration remain pending. No automatic invitations are sent by the test suite.

References: [Web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar creation](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert), [event/conference creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

Local verification checkpoint: 58 tests passed and one optional real-Mongo test skipped, on Node 24. Field-specific HTTP validation includes blank/omitted meeting links, past starts, end-before-start, invalid zones and HTTP links. JavaScript syntax and generated HTML ID/label checks passed. Vercel Preview remains the Node 22 bundle check. Browser visual verification and live Google/Atlas checks are pending.
