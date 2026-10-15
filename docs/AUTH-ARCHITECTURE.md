# Auth architecture (Backend-for-Frontend)

The Next.js server is the only thing that holds 1health tokens and talks to
1health. The browser talks only to this app's own origin, and only through
`callApi` (`lib/api/client.ts`). Spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`;
decisions D1–D13 in `_bmad-output/planning-artifacts/epics.md` (they override
the architecture spine where they differ). The module-by-module catalog is
[FOUNDATION.md](FOUNDATION.md) (§3.1 server/BFF, §3.2 API client).

## Environments

`lib/shared/environments.ts` is the only place that names a 1health origin.
Per environment (`demo`, `prod`): `apiRoot` (`https://1health.demo.1health.io`,
`https://1health.app.1health.io`), `apiBase` = `<apiRoot>/api`, `portalUrl` =
the root, and `publicFilesOrigin`, the only origin an organization logo may come
from (`https://bocore-public-files-demo.s3.us-west-1.amazonaws.com`,
`https://bocore-public-files-prod.s3.us-west-1.amazonaws.com`). Those two values
are still unconfirmed against a live `tenantLogo.publicUrl` on demo and prod
(deferred item "Confirm publicFilesOrigin" in
`_bmad-output/implementation-artifacts/deferred-work.md`); a mismatch only
makes the logo route answer 404 and the card show initials. The server picks
the environment per request from the session; a request never carries one.

## Launch (`/auth`)

1. The portal opens `/auth?lpl=<encrypted launch payload>`.
2. `app/auth/page.tsx` (server, `force-dynamic`) reads only the
   `onehealth_environment` cookie and renders `features/shell/auth-screen.tsx`.
3. The screen removes `lpl` from the address bar (`history.replaceState`),
   then runs the launch flow (`features/shell/launch-flow.ts`): up to 5
   attempts of `POST /api/token { lpl }`, 1.5 s apart; a body with
   `retryable: false` stops at once. Attempt 2 onward shows "Confirming your login...".
4. `/api/token` (`lib/server/launch/token-handler.ts` → `launch.ts`):
   - answers 503 `SERVICE_DISABLED` when `PP_DISABLED=1`;
   - requires `Content-Type: application/json` (else 415) and reads only `lpl`;
   - decrypts it with `ONEHEALTH_SECRET_KEY_PROD`, then `_DEMO`, each as
     stored and then trimmed (a trimmed-only match logs a warning naming the
     variable); the key that decrypts decides `environment` (D2); no key
     configured at all is 503 `LAUNCH_CONFIG`;
   - checks the payload's app id equals `APP_ID_<ENV>`;
   - exchanges the one-time code exactly once, signed with that key;
   - checks the token's plaintext `tenantId` is `1` (else 403 `WRONG_TENANT`);
   - calls `GET /v2/user/myself` and requires its id to equal the payload user
     (an unreadable tenant id or a `myself` failure revokes the just-issued
     tokens, best effort, before answering);
   - seals tokens, ids, a new `sid` and `environment` into `__Host-pp_s`, sets
     `onehealth_environment` (30 days) and answers `{ ok: true, environment }`.
5. On success the screen shows "Success!" and after 1.2 s calls
   `location.assign(consumeLoginIntent("/"))` (`lib/shared/login-intent.ts`).

Failures answer `{ ok: false, errorCode, source: "proxy", message, retryable? }`
with a user-safe `message` from `lib/shared/messages/launch.ts` and clear any previous
session. Decode, app-id and tenant failures, a missing `lpl`, a 415,
`LAUNCH_CONFIG` (including a session too large for the cookie, after revoking
the tokens) and `SERVICE_DISABLED` carry `retryable: false`; exchange and
`myself` failures stay retryable. The exchange's 400 text decides the code:
"…has already been redeemed." → `LAUNCH_USED`, "…has expired." →
`LAUNCH_EXPIRED`, anything else → `LAUNCH_INVALID`. An unexpected throw fails
closed: 502 `LAUNCH_INVALID`, retryable, cookie cleared. Without `lpl` the screen shows manual entry (environment known
from the referrer or the cookie, display only) or "Choose Environment".

## The session

- One cookie, `__Host-pp_s`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no
  `Max-Age`, no `Domain`, sealed with iron-session (`SESSION_SECRET`;
  `SESSION_SECRET_PREVIOUS` is accepted for unseal only during a rotation).
- Payload (`lib/server/session/types.ts`): access and refresh tokens, access
  expiry (epoch ms), `userId`, `personId`, `tenantId`, `sid`, `gen`, `iat`,
  `lastSeen`, `environment`.
- A session is aged (treated as absent) after 15 min without activity
  (`IDLE_TIMEOUT_MS`, from `lastSeen`) or 8 h after launch
  (`ABSOLUTE_TIMEOUT_MS`, from `iat`). See [Idle logoff](#idle-logoff).
- Pages call `requirePageSession()` (`lib/server/page-session.ts`): no session
  redirects to `/auth`; otherwise it returns `{ portalUrl, idle }`. The page
  passes `portalUrl` to `PortalUrlProvider`, which registers it with
  `callApi`'s module, and `idle` (four numbers) to the idle warning.
- There is no CSRF check and no session binding (D5): cross-site write
  protection relies on `SameSite=Lax`. JSON routes still require
  `application/json` (415).

## The proxy

All 1health traffic goes through `/api/1h/<path relative to the upstream /api>`
(`lib/server/proxy/*`). In order: kill switch (`PP_DISABLED=1` → 503
`SERVICE_DISABLED`), method (HEAD, OPTIONS, TRACE → 405), path normalization
(400 `BAD_PATH`), deny list and allowlist (403 `NOT_ALLOWED`, 405), the
Profile kill switch (`ACCOUNT_DISABLED=1` → 503 for `profile: true` entries),
session (401 `SESSION_EXPIRED`), query validation (400 `BAD_QUERY`), body
validation (400/413/415, see [Uploads](#uploads)), token expiry (401
`TOKEN_EXPIRED` within 30 s), owner substitution and a second deny-list check
on the upstream path, then the upstream call (25 s to headers, 10 s idle per
body chunk, `redirect: "manual"`). Owner ids are the literal `me`; the proxy
fills them from the session.

Each endpoint is one entry in its area file
`lib/server/proxy/allowlist/<area>.ts` (aggregated by `allowlist/index.ts`);
the deny list (`deny-list.ts`) blocks `auth/**`, `v2/admin/**`, `graphql/**`,
external-application, tenant-switch, password, MFA enable/disable,
`v2/tenant/sys-config` and every file delete (`DELETE v2/file/**`: the
backend checks only the tenant, so deletes go through the named op
`DELETE /api/pp/file/{fileId}`) whatever the allowlist says. JSON bodies are read
through the byte-capped reader (64 KB default, `maxBytes` per entry),
validated with the entry's zod schema and re-serialised; an entry without a
schema accepts no body.

Only `Content-Type`, `Accept` and `Accept-Language` go upstream, plus the
Bearer and `X-Request-Id`. Only `Content-Type` and `X-Request-Id` come back,
with `nosniff` and no-store. Upstream 401 → 401 `TOKEN_EXPIRED`, 3xx → 502
`UPSTREAM_REDIRECT`, 5xx → 502 `UPSTREAM_ERROR`, timeout → 504
`UPSTREAM_TIMEOUT`; upstream 4xx bodies pass through. Logs carry only
`{ requestId, method, routeTemplate, status, durationMs }`; bodies are never
logged on the server (D6).

### Uploads

Upload entries (`upload: { part, types }` with a required `maxBytes`, AD-13)
are read by `lib/server/proxy/upload.ts#readUpload`: `multipart/form-data`
(else 415 `UNSUPPORTED_MEDIA`) with a boundary (else 400 `BAD_BODY`), the
request capped at `maxBytes + 16 KiB` by `Content-Length` and while
streaming (413 `TOO_LARGE`), a parsable body with exactly one entry, a file
named `part` (`file` or `fileNewVersion`) (else 400 `BAD_BODY`), the file at
most `maxBytes` (413) and its leading bytes one of `types` (`png`, `jpeg`,
`bmp`; else 415).
The server rebuilds the form with that one part only: a Blob typed from the
sniffed bytes and a sanitized file name (`sanitizeFileName`). Upload entries
force their query server-side (`fixedQuery`, e.g. `isPublic`). Shipped: the
Profile Picture (`core`, 4 MB), Signature and its new version (`personal`,
PNG only) and insurance card front/back (`insurance`, 4 MB).

### Image downloads

An `asImage` entry (`GET v2/file/{fileId}/download`, and
`GET v2/user/profile-picture/preview` with only `v` = the picture's file id as
a cache-buster) forces `preview=true` upstream. Upstream declares `image/jpeg` for every preview, so only the
leading bytes count (`lib/server/http/image-sniff.ts`, `peekStream` reads the
head without buffering the body): PNG, JPEG or BMP → `inline` with the type of
the bytes; anything else (SVG, HTML, GIF…) → `application/octet-stream` with
`Content-Disposition: attachment; filename="file"`.

## Named operations

Server work the allowlisted proxy cannot express lives in named operations
under `/api/pp/*` and `/api/places/*`: one `route.ts` each, built with
`createNamedOp` (`lib/server/named-op.ts`), the program in
`lib/server/named-ops/<op>.ts`. They never go through the allowlist or deny
list; their upstream ids come only from the session. Fixed order: kill switch
(503) → method (405; every method is exported so Next never auto-implements
HEAD/OPTIONS) → session (401) → query (none by default) → route params → JSON
body (415/413/400 `BAD_BODY`, 16 KiB cap) → token freshness for 1health ops
(401 `TOKEN_EXPIRED`) → `handle`. Upstream JSON answers are capped at 2 MB;
upstream 4xx can be relayed as `{ message?, code? }` (`relayClientError`).
Every response is no-store + `nosniff`, logged as one template-only line
(optionally with a PHI-free `outcome` code); a thrown error is 500
`INTERNAL_ERROR`.

| Route | Switch | What it does |
|---|---|---|
| `GET /api/pp/profile-picture-id` | `pp` | The one GraphQL document (server constant, session `userId`) → `{ fileId }` |
| `POST /api/pp/mfa/validate` `{ code }` | `account` | Moves the code into the upstream query, answers its boolean |
| `GET /api/pp/practice-support` | `account` | Practice tenant's support contact, or 404 `NO_PRACTICE` |
| `GET /api/pp/org-logo/[tenantId]` | `account` | See [Organization logos](#organization-logos) |
| `POST /api/places/autocomplete`, `/details` | `pp` | Google Places (New), server-side only |
| `DELETE /api/pp/file/[fileId]` | `pp` | Checks with the session's token that the id is the caller's Signature, profile picture or one of their insurance cards, then hard-deletes it (204). Not owned or a malformed id → 404 `NO_FILE`; a failed ownership lookup fails closed (401 `TOKEN_EXPIRED`, 502, 504) and deletes nothing |

Places (`lib/server/named-ops/places.ts`) is on only with `PLACES_ENABLED=1`
(then `GOOGLE_PLACES_KEY` is required at boot); off, both routes answer 200
`{ enabled: false, … }`. The Google key, script and URL never reach the
browser; the Places session token is an HMAC of the session's `sid` and the
client's per-lookup UUID; typed text and addresses are never logged.

### Organization logos

`GET /api/pp/org-logo/<tenantId>` (AD-24, for `<img src>`) pages through the
user's organizations (`v2/user/organization/portal`, size 50, at most 5
pages), takes that tenant's `tenantLogo.publicUrl` only if its origin is
exactly the environment's `publicFilesOrigin`, fetches it with no
credentials, no redirects, a 5 s deadline and a 512 KB cap, and serves it only
when its leading bytes are PNG, JPEG or WebP (`Content-Disposition: inline`).
Every other outcome, including a bad id, a stale token, not a member, a host
mismatch or SVG bytes, is 404 `NO_LOGO`; only a missing session (401) and the
kill switch (503) differ.

## Token refresh

The proxy never refreshes. On a proxy `401 TOKEN_EXPIRED`, `callApi` runs one
`POST /api/session/refresh` (single-flight in the tab, `navigator.locks`
across tabs), then replays each waiting call once. A non-GET is replayed only
after a proxy `TOKEN_EXPIRED`. The refresh route answers 200 without calling
the IdP when the token is still fresh, clears the cookie on an IdP rejection
(only a 401 or a 400 `invalid_grant`: 401 `SESSION_EXPIRED`) and keeps it
otherwise (403, any other 400, 5xx, 3xx, timeout, unreadable answer: 503
`REFRESH_UNAVAILABLE`; human decision 2026-10-14, spec R5-1). `expires_in` may
be a number or a numeric string; a missing or unusable one means 300 s.

`session-expired` is published once per page on `lib/api/session-events.ts`
(by `callApi` and by the idle warning); the shell's session dialog
(`features/shell/session-dialog.tsx`) subscribes.

## Idle logoff

The server ages a session by `lastSeen` (15 min) and `iat` (8 h). `lastSeen`
moves only on user activity (Story 1.6, AD-16):

- `callApi` sends `X-PP-Activity: user` on every non-GET call and on reads
  marked `userInitiated: true`; the proxy then re-seals `lastSeen` and echoes
  `X-PP-Activity-At` (the header is never forwarded upstream).
- `POST /api/session/ping` (`recordUserActivity()`: "Stay signed in", Retry,
  app-bar page/tab moves) re-seals `lastSeen` only and answers 204 with
  `X-PP-Activity-At`. No session → 401 `SESSION_EXPIRED`; `PP_DISABLED` → 503.
- A top-level navigation to `/` or `/account` re-seals in root `proxy.ts`
  (an aged or unsealable session is cleared with a 307 to `/auth`). Prefetch
  and RSC requests are not activity.
- Race guard: within 55 s of token expiry (30 s skew + 25 s upstream
  timeout) nothing re-seals; the ping answers 401 `TOKEN_EXPIRED` so the
  client refreshes first and replays it.

On the client, `lib/api/activity.ts` keeps the latest echoed time and shares
it across tabs over `BroadcastChannel("pp-activity")` (payload `{ t }` only).
`features/shell/idle-warning.tsx`, mounted once by `PageFrame`, runs on the
page's `idle` timing in server time, 30 s ahead of the server: 60 s before
the idle deadline it opens a non-dismissable dialog with "Stay signed in"
(the ping, at most 10 s); at the idle or absolute deadline it publishes
`session-expired`.

## Logout

`POST` or `GET /api/session/logout`: with a session, first a best-effort
`POST <apiRoot>/auth/user/logout/all-devices` with the session Bearer (5 s,
no-store; failures are logged without the token), then always 204 clearing
`__Host-pp_s`. The age check is skipped, so an idle- or absolute-expired
session's tokens are revoked too. HEAD and OPTIONS are explicit 405s (so a
HEAD never runs a logout). Logout is never switched off.

## Client logging

`callApi` logs each call through `logApiCall` (`lib/api/log-api-call.ts`)
only under `next dev` (`lib/shared/app-env.ts#isLocalDev()`), redacting
SSN-shaped values, MFA `code`, `qrCode`, `lpl`, `authorization`, token- and
JWT-shaped values.

## Kill switches

Root `proxy.ts` (the Next 16 request interceptor; there is no
`middleware.ts`) checks the kill switches before anything else, so every
route added later under these paths inherits them
(`lib/server/kill-switch.ts`, AD-20, Stories 1.16 and 7.2). Paths are matched
by segment prefix after decoding and collapsing slashes:

- `"account"` — `/account`, `/handoff`, `/api/pp/mfa`, `/api/pp/org-logo`,
  `/api/pp/practice-support`: off with `ACCOUNT_DISABLED=1` or `PP_DISABLED=1`.
- `"pp"` — `/` (exact), `/auth`, `/api/1h`, `/api/pp`, `/api/places`,
  `/api/session/refresh`, `/api/session/ping`: off with `PP_DISABLED=1`.
- Never switched here: `/api/session/logout` (users can always sign out) and
  `/api/token` (it answers `SERVICE_DISABLED` in its own launch envelope).

A switched-off `/api/**` path answers 503 `{ errorCode: "SERVICE_DISABLED",
source: "proxy" }`. A switched-off page (navigation, RSC or prefetch, any
method) is rewritten to `/disabled`, a route handler
(`app/disabled/route.ts` → `lib/server/disabled-screen.ts`), because a
rewritten page would render 200 in Next 16 and the screen must answer 503.
It serves static HTML (no script; inline light/dark token values kept equal
to `app/globals.css` by a test) with a "Go to 1health" link to the portal of
the session's environment, else the `onehealth_environment` cookie, else the
referrer when the page was `/auth`, else prod. With no switch on, `/disabled`
is 404. Every kill-switch 503 is no-store with `Retry-After: 300`. Route
handlers keep their own check as a second layer (the proxy's `PP_DISABLED`
and `profile`-entry checks, each named op's `killSwitch`).

## Security headers

`proxy.ts` sets the AD-21 headers on every response (pages, 404s, `/api/**`,
static assets), with a fresh CSP nonce per request
(`lib/server/security/headers.ts`): a strict CSP (`script-src 'self'
'nonce-…' 'strict-dynamic'`, `connect-src 'self'`, `img-src 'self' blob:
data:`, `frame-ancestors 'none'`; `'unsafe-eval'` only under `next dev`),
`X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy: no-referrer`,
`Permissions-Policy` and `Cross-Origin-Opener-Policy: same-origin`. Every page
renders dynamically so Next stamps that nonce on its scripts. Route handlers
are wrapped in `guardRoute` (named ops catch inside `createNamedOp`): an
unhandled error is a PHI-free 500 `INTERNAL_ERROR`.
