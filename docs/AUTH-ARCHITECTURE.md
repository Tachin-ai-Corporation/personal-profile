# Auth architecture (Backend-for-Frontend)

The Next.js server is the only thing that holds 1health tokens and talks to
1health. The browser talks only to this app's own origin, and only through
`callApi` (`lib/api/client.ts`). Spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`;
decisions D1–D13 in `_bmad-output/planning-artifacts/epics.md` (they override
the architecture spine where they differ).

## Environments

`lib/shared/environments.ts` is the only place that names a 1health origin.
Per environment (`demo`, `prod`): `apiRoot` (`https://1health.demo.1health.io`,
`https://1health.app.1health.io`), `apiBase` = `<apiRoot>/api`, `portalUrl` =
the root, and `publicFilesOrigin` (open, `null` for now). The server picks the
environment per request from the session; a request never carries one.

## Launch (`/auth`)

1. The portal opens `/auth?lpl=<encrypted launch payload>`.
2. `app/auth/page.tsx` (server, `force-dynamic`) reads only the
   `onehealth_environment` cookie and renders `features/shell/auth-screen.tsx`.
3. The screen removes `lpl` from the address bar (`history.replaceState`),
   then runs the launch flow (`features/shell/launch-flow.ts`): up to 5
   attempts of `POST /api/token { lpl }`, 1.5 s apart; a body with
   `retryable: false` stops at once. Attempt 2 onward shows "Confirming your login...".
4. `/api/token` (`lib/server/launch/token-handler.ts` → `launch.ts`):
   - requires `Content-Type: application/json` (else 415) and reads only `lpl`;
   - decrypts it with `ONEHEALTH_SECRET_KEY_PROD`, then `_DEMO`, each as
     stored and then trimmed (a trimmed-only match logs a warning naming the
     variable); the key that decrypts decides `environment` (D2);
   - checks the payload's app id equals `APP_ID_<ENV>`;
   - exchanges the one-time code exactly once, signed with that key;
   - checks the token's plaintext `tenantId` is `1` (else 403 `WRONG_TENANT`);
   - calls `GET /v2/user/myself` and requires its id to equal the payload user;
   - seals tokens, ids, a new `sid` and `environment` into `__Host-pp_s`, sets
     `onehealth_environment` (30 days) and answers `{ ok: true, environment }`.
5. On success the screen shows "Success!" and after 1.2 s calls
   `location.assign(consumeLoginIntent("/"))` (`lib/shared/login-intent.ts`).

Failures answer `{ ok: false, errorCode, source: "proxy", message, retryable? }`
with a user-safe `message` from `lib/shared/messages/launch.ts` and clear any previous
session. Decode, app-id and tenant failures, a missing `lpl` and
`SERVICE_DISABLED` carry `retryable: false`; exchange and `myself` failures
stay retryable. Without `lpl` the screen shows manual entry (environment known
from the referrer or the cookie, display only) or "Choose Environment".

## The session

- One cookie, `__Host-pp_s`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no
  `Max-Age`, no `Domain`, sealed with iron-session (`SESSION_SECRET`;
  `SESSION_SECRET_PREVIOUS` is accepted for unseal only during a rotation).
- Payload (`lib/server/session/types.ts`): access and refresh tokens, access
  expiry (epoch ms), `userId`, `personId`, `tenantId`, `sid`, `gen`, `iat`,
  `lastSeen`, `environment`.
- Pages call `requirePageSession()` (`lib/server/page-session.ts`): no session
  redirects to `/auth`; otherwise the page passes the session's `portalUrl` to
  `PortalUrlProvider`, which registers it with `callApi`'s module.
- There is no CSRF check and no session binding (D5): cross-site write
  protection relies on `SameSite=Lax`. JSON routes still require
  `application/json` (415).

## The proxy

All 1health traffic goes through `/api/1h/<path relative to the upstream /api>`
(`lib/server/proxy/*`). In order: kill switch, method, path normalization
(400 `BAD_PATH`), deny list and allowlist (403 `NOT_ALLOWED`, 405), the
Profile kill switch (`ACCOUNT_DISABLED=1` → 503 for `profile: true` entries),
session (401 `SESSION_EXPIRED`), query and body validation (400/413/415),
token expiry (401 `TOKEN_EXPIRED` within 30 s), then the upstream call with a
25 s timeout and `redirect: "manual"`. Owner ids are the literal `me`; the
proxy fills them from the session. Every response is no-store. Logs carry only
`{ requestId, method, routeTemplate, status, durationMs }`; bodies are never logged
on the server (D6).

## Token refresh

The proxy never refreshes. On a proxy `401 TOKEN_EXPIRED`, `callApi` runs one
`POST /api/session/refresh` (single-flight in the tab, `navigator.locks`
across tabs), then replays each waiting call once. A non-GET is replayed only
after a proxy `TOKEN_EXPIRED`. The refresh route answers 200 without calling
the IdP when the token is still fresh, clears the cookie on an IdP rejection
(401 `SESSION_EXPIRED`) and keeps it otherwise (503 `REFRESH_UNAVAILABLE`).

`session-expired` is published once per page on `lib/api/session-events.ts`;
the shell (Story 7.0b) subscribes.

## Logout

`POST` or `GET /api/session/logout`: with a session, first a best-effort
`POST <apiRoot>/auth/user/logout/all-devices` with the session Bearer (5 s,
no-store; failures are logged without the token), then always 204 clearing
`__Host-pp_s`.

## Client logging

`callApi` logs each call through `logApiCall` (`lib/api/log-api-call.ts`)
only under `next dev` (`lib/shared/app-env.ts#isLocalDev()`), redacting
SSN-shaped values, MFA `code`, `qrCode`, `lpl` and token-like fields.

## Security headers

`proxy.ts` sets the AD-21 headers on every response, with a fresh CSP nonce per
request. Every page renders dynamically so Next stamps that nonce on its
scripts.
