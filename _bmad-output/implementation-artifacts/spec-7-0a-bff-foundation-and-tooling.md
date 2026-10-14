---
title: '7.0a BFF foundation and tooling (Epic 1 subset for Epic 7)'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: 'd7d3ff4c181d2d927735b70e75eea599ef13e3e6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 7 (`/account`) needs the Backend-for-Frontend foundation of Epic 1, which does not exist: the template keeps 1health tokens in JS-readable cookies and calls 1health from the browser, which the architecture (AD-1, AD-2, AD-19) forbids.

**Approach:** Build the minimal Epic 1 subset — Stories 1.1 (env, headers, tooling, CI, legacy removal), 1.2 (launch → sealed session), 1.3 (allowlisted proxy), 1.4 (`callApi` + SWR + `useMyself`), 1.5 (token refresh) and the logout route of 1.7 — exactly as their ACs in `epics.md` (lines 701–1160: Stories 1.1–1.5, and from 1.7 only logout + login intent) and the spine specify, in a SOLID, feature-sliced layout. Where the spine and `epics.md` lines 157–177 disagree, the spine wins, except where epics.md D1–D13 or A1–A10 below override it.

**Decision (human, 2026-10-14) — keep the template's launch entry as-is:** the existing env vars stay (`ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`), plus one new required `SESSION_SECRET` (≥32 chars) and optional `SESSION_SECRET_PREVIOUS`, `PP_DISABLED`, `ACCOUNT_DISABLED`. The 1health portal keeps opening `/auth?lpl=…`; `/auth` keeps its Demo/Prod detection (referrer, or user pick) and POSTs `{lpl, environment}` to `/api/token`, which keeps the same HKDF/AES-GCM decrypt and HMAC code exchange. Only the token storage changes: `/api/token` seals tokens + `environment` into the `__Host-pp_s` session (no JS-readable cookies, no tokens in the response body) and `/auth` then navigates to `/`. The upstream base URL (`https://demo.1health.io` | `https://app.1health.io`) and the portal URL are derived per request from the session's `environment`, never from env vars. This replaces the spine's `/launch`, `/launch/verify`, `/launch/dev`, the `proxy.ts` `?lpl` 307, and the `APP_ENV`/`API_ORIGIN`/`APP_ORIGIN`/`PORTAL_URL`/`APP_ID`/`ONEHEALTH_SECRET_KEY` env vars. [Superseded 2026-10-14 by A1 (request body is only `{ lpl }`) and A4 (roots `https://1health.demo.1health.io` / `https://1health.app.1health.io`).]

**Amendment (human, 2026-10-14, after implementation — modeled on `patient-vault-official`; supersedes the matching parts above):**
- **A1 Key-based environment detection:** `/auth` sends only `{ lpl }`. `/api/token` decrypts with `ONEHEALTH_SECRET_KEY_PROD`, then `_DEMO` (each also `.trim()`-ed, warning logged without the value); the key that decrypts sets `environment`; neither → invalid launch. Response `{ ok: true, environment }`. Referrer (`demo.1health`/`app.1health`) then the `onehealth_environment` cookie only choose what the no-LPL manual-entry screen shows.
- **A2 Logout revocation:** `POST /api/session/logout` first calls best-effort `POST <apiRoot>/auth/user/logout/all-devices` with the session Bearer (`no-store`, 5 s timeout, failures swallowed and logged without token), then always 204 clearing `__Host-pp_s`.
- **A3 Remembered environment:** `/api/token` also sets `onehealth_environment` (`demo|prod`; `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=30d`). Session-less routes resolve environment from the session, else this cookie, else `prod`; never from a URL parameter.
- **A4 Environment map:** `lib/shared/environments.ts` API root `https://1health.demo.1health.io` / `https://1health.app.1health.io` (upstream `<root>/api`); portal URL = the same root. The `…/login?openApp=<name>` deep link waits on the registered app name (open item).
- **A5 No CSRF or session binding (epics D5):** remove the `Sec-Fetch-Site`/`Origin` check, the `X-PP-Session` header and its HMAC binding (`lib/server/security/{csrf,session-binding}.ts`, `sessionBinding` embedded by pages), the 403 `CSRF` code, and the 409 `SESSION_CHANGED` code with its `session-changed` event (`session-expired` stays). The 415 check on JSON entries stays. `/api/session/logout` also accepts GET. Cookie unchanged (`__Host-pp_s`, `HttpOnly; Secure; SameSite=Lax; Path=/`). Accepted knowingly: cross-site write protection relies only on `SameSite=Lax`.
- **A6 Logging (epics D6):** `callApi` gets a `logApiCall` console logger (`console.groupCollapsed` with method, path, status, duration, request and response body), active only when `process.env.NODE_ENV === "development"` read through the shared app-env helper `lib/shared/app-env.ts` (the one lint exception), redacting SSN-shaped values, MFA `code`, `qrCode` and token-like fields. No in-app API Inspector. Server logs never contain bodies, also under `next dev`.
- **A7 Public files (epics D7):** the public-files origin is `publicFilesOrigin` per environment in `lib/shared/environments.ts`; CSP stays `img-src 'self' blob: data:`.
- **A8 No blocked-cookie detection (epics D8):** no `cookies` reason, no verify route.
- **A9 `/auth` launch UX as patient-vault (epics D9):** up to `MAX_AUTH_ATTEMPTS = 5` attempts with a fixed `AUTH_RETRY_DELAY_MS = 1500`. The client retries on non-OK unless the body has `retryable: false`, on OK without success, and on network errors. `/api/token` sets `retryable: false` for missing lpl, bad base64, too-short payload, both keys failing, non-JSON payload, missing fields, APP_ID mismatch and tenant mismatch, and calls the exchange once per request. Attempt 2 onward shows "Confirming your login...". Manual LPL entry is available in all environments: with no `lpl` and a known environment, and from the error screen. On success it shows "Success!", waits 1200 ms, then runs `window.location.assign(consumeLoginIntent("/"))` (sessionStorage `pp:login-intent`; a same-origin relative path that doesn't start with `/auth` or `/api`). Errors show in a destructive Alert with "Enter LPL Manually", "Switch Environment" and "Go to 1health ({env})". Error bodies carry only a user-safe `message`, never upstream details. Full copy is in `epics.md` D9 and Story 1.2.
- **A10 Ownership (2026-10-14):** this spec (Story 1.3 subset) owns the full deny list, the `profile: true` entry tag and the proxy-level `ACCOUNT_DISABLED=1` rule (503 `SERVICE_DISABLED` before upstream for tagged entries, fixture-entry test). Story 7.2 only adds the page/route-level kill switch and Profile-template test rows.
- **A11 Review decisions (human, 2026-10-14):** (1) GET logout keeps the platform `logout/all-devices` revoke, as in patient-vault — accepted risk: a cross-site link can end the user's 1health sessions on every device. (2) `LAUNCH_USED`/`LAUNCH_EXPIRED` and post-exchange failures stay retryable, as in patient-vault — accepted: up to ~6 s of useless retries before the error shows. (3) When a launch fails after a successful exchange (`myself` failure or id mismatch, unreadable tenant claim, cookie over budget), `/api/token` best-effort revokes the just-issued tokens with `POST <apiRoot>/auth/user/logout/all-devices` (Bearer, no-store, 5 s, failures swallowed and logged without token) before answering; the wrong-tenant path makes no extra call (Story 1.2).

## Boundaries & Constraints

**Always:**
- Layering per spine: `lib/server` (server-only) · `lib/api` (client, same-origin `/api/*` only) · `lib/shared` (pure, isomorphic) · `features/<id>` · `components/ui`. Enforce with ESLint `no-restricted-imports`/`no-restricted-syntax` (shared never imports features/server; features never import other features except `features/shell`; `process.env` only in `lib/server/env.ts` and `NODE_ENV` in `lib/shared/app-env.ts` (A6); `fetch(` only in `lib/api/client.ts` and `lib/server/**`).
- One responsibility per module; small pure helpers (crypto, path normalization, query/body validation, header building, error bodies) unit-tested in isolation. No duplicated logic: one `jsonError(status, errorCode)` builder, one `withNoStore()` header helper, one `fetchWithTimeout()`, one JSON content-type (415) check reused by every JSON route (no CSRF check, A5).
- Explicit types/interfaces for every exported function, session payload, allowlist entry, `ApiResponse`, and BFF `ErrorCode` (string-literal union). zod for env, LPL payload and allowlist query/body schemas. No `any`, no `as` casts to silence errors.
- Exact versions pinned (iron-session 9.0.1, vitest 5.0.4, @testing-library/react 16.3.3, msw 3.0.3, @playwright/test 1.64.0, server-only). Tests colocated `*.test.ts(x)`; 100% coverage on new `lib/server` and `lib/api` code.
- Proxy entries shipped now: `GET v2/user/myself`, `GET v2/user/contact-point/list` (`type` ∈ `Email|Mobile|Landline`), `PUT v2/user/edit` (body schema without `email`, `phoneNumber`, `phoneNumberRegion`, `locale`). Entry type carries an optional `profile: true` flag; `ACCOUNT_DISABLED=1` returns 503 for tagged entries (A10).
- Every response: CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`; `__Host-pp_s` has no `Partitioned`, `Domain` or `Max-Age`; no framed-mode detection (D10).

**Never:**
- No token, `lpl`, code, id or body in any response body, URL, or log line (server logs never carry bodies; only the client dev-only `logApiCall` does, redacted (SSN-shaped values, MFA `code`, `qrCode`, `lpl` and any token-like field), A6).
- No `new URL(input, base)` for upstream URLs, no proxy-side refresh.
- Out of scope: app bar/tabs/`navigate()`/leave guard/session dialogs/the upstream→`errorCode` derivation in `lib/api/errors.ts` and all non-launch messages (7.0b; 7.0a creates `lib/shared/messages.ts` with only the launch and disabled strings, marked draft copy, and sets only `upstreamCode`/`error` from upstream bodies), idle logoff (1.6), Save all, drafts, profile picture, `/account` page, Places, `/api/pp/*` routes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error handling |
|---|---|---|---|
| Launch OK | `/auth?lpl=<valid>` (any referrer; environment set by the decrypting key, A1) | `POST /api/token` seals `__Host-pp_s` (tokens + environment), returns `{ok:true, environment}` only; `/auth` shows "Success!", then after 1200 ms `location.assign(consumeLoginIntent("/"))` (A9) | transient failure → client retries, at most 5 attempts 1500 ms apart (A9) |
| Launch bad | bad base64 / GCM fail / missing fields / exchange fails / myself id ≠ payload | `/api/token` 4xx/5xx `{errorCode, source:"proxy", message}`, plus `retryable:false` for missing lpl, bad base64, too-short payload, both keys failing, non-JSON payload, missing fields, APP_ID mismatch and tenant mismatch (exchange failures stay retryable); no cookie; `/auth` shows the error Alert after the last attempt (A9) | no upstream call for decode failures; `retryable:false` stops client retries at once |
| No session | `/` or `/account` without valid cookie | redirect `/auth` (template behavior) | — |
| Proxy traversal | `/api/1h/v2/..%2Fx`, `;x`, `%252F` | 400 `BAD_PATH` | — |
| Proxy denied | not allowlisted / deny list | 403 `NOT_ALLOWED` | — |
| Non-GET content type | JSON entry with a non-JSON `Content-Type` | 415 `UNSUPPORTED_MEDIA`; no CSRF or `X-PP-Session` check (A5) | — |
| Token near expiry | access exp < 30 s or upstream 401 | 401 `TOKEN_EXPIRED` | client refreshes once, replays once |
| Refresh concurrency | 10 parallel calls hit `TOKEN_EXPIRED` | exactly 1 `/api/session/refresh` | 401 → `session-expired` once; 503 → `REFRESH_UNAVAILABLE`, no publish |
| Non-GET 5xx | `PUT` → 502/504 | returned once, never replayed | — |
| Upstream 4xx | `{message, code}` | passed through; `callApi` sets `upstreamCode` | upstream 409 publishes nothing |
| Logout | POST or GET /api/session/logout | best-effort upstream logout/all-devices (5 s, no-store), always 204 clearing __Host-pp_s | upstream failure/401 swallowed, logged without token |
| No LPL | /auth without lpl, environment known | manual-entry card | unknown environment → "Choose Environment" |

</frozen-after-approval>

## Code Map

- `app/api/token/route.tsx:85-136,182-245` -- EXTRACT HKDF key derivation, AES-256-GCM decrypt, HMAC signature + code exchange into `lib/server/launch/*`; the route becomes a thin `.ts` handler that seals the session.
- `lib/auth-client.ts:227-325` -- PORT refresh request (`POST <root>/auth/oauth2/token` (root from `lib/shared/environments.ts` for the session's environment), form `grant_type=refresh_token&refresh_token=…&client_id=public-client`) to `lib/server/session/refresh.ts`, then DELETE.
- `lib/api/client.ts:25-96` -- KEEP `callApi(context, path, init)` signature; rewrite as same-origin fetch; drop `callApiRaw` if unused.
- `lib/api/user.ts` -- rewrite `fetchMyself()` on `callApi('/api/1h/v2/user/myself')` with a clean `Myself` domain type.
- DELETE: `lib/api/{workflow-provisioning,workflow-template,campaign,journey,journey-step,grid,attachments,comments,custom-data,partnerships,query,schema,step-config,tenant}.ts`, `components/{workflow/,settings-page.tsx,home-page-client.tsx,auth-exit-dialog.tsx}`, `contexts/`, `hooks/use-session-expired.ts`; fix `lib/api/{index,config}.ts`. Update `CLAUDE.md`/`docs/` references to removed modules.
- REWRITE: `app/auth/page.tsx` to the patient-vault launch UX (A9); referrer/cookie detection only picks displayed labels/links; `/api/token` request contract is `{ lpl }` (A1).
- KEEP untouched: `components/ui/*`, `hooks/use-toast.ts`, `app/globals.css`.
- `next.config.mjs` -- remove `typescript.ignoreBuildErrors`. `eslint.config.mjs` -- add the boundary/ban rules. `package.json` -- pins, `engines`, scripts `test`, `test:e2e`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/env.ts` (+test) -- zod-validated, server-only env (existing `_DEMO`/`_PROD` vars + `SESSION_SECRET`; booleans only on `"1"`; error names var never value); `lib/shared/environments.ts` holds the `demo|prod` → base/portal URL map; `instrumentation.ts` imports env. **A4/A7 rework:** roots `https://1health.demo.1health.io` / `https://1health.app.1health.io` (upstream `<root>/api`, portal = root), add `publicFilesOrigin`.
- [x] `lib/server/http/{responses,cache-headers,fetch-with-timeout}.ts` (+tests) -- `seeOther`, `jsonError`, no-store headers, timeout fetch.
- [x] `lib/server/security/{headers,csrf,session-binding}.ts` + `proxy.ts` (+tests) -- nonce CSP + AD-21 headers on every path (frame-ancestors 'none', X-Frame-Options: DENY, COOP same-origin); CSRF + HMAC binding checks. **A5 rework:** delete `csrf.ts` and `session-binding.ts` and their checks; keep headers and the 415 check.
- [x] `lib/server/session/{types,session,refresh}.ts` (+tests) -- iron-session `__Host-pp_s` (`HttpOnly; Secure; SameSite=Lax; Path=/`) with secret rotation, payload incl. `environment`; `requireSession()` (pages → redirect `/auth`) and `getSession()` (routes → `null`); cookie ≤ 3800 B.
- [x] `lib/server/launch/{lpl-crypto,exchange,launch}.ts` + `app/api/token/route.ts` (+tests) -- ported decrypt/exchange (same algorithm, verified by a fixture round-trip), `myself` id check, seal session; response `{ ok: true, environment }` or `{ errorCode, source, message, retryable? }`. **A1/A3/A5/A9 rework:** try _PROD then _DEMO key (each also trimmed); set `onehealth_environment` cookie; drop the CSRF check; add `retryable:false` on the listed failures and a user-safe message.
- [x] `app/auth/page.tsx` -- rewrite to the patient-vault launch UX (A9: 5 attempts at 1500 ms, manual entry, error Alert); send only `{ lpl }`; referrer → `onehealth_environment` cookie only pick displayed labels/links; no `setCookie`/`document.cookie`; on success `location.assign(consumeLoginIntent("/"))` after 1200 ms.
- [x] `lib/server/proxy/{types,normalize,deny-list,allowlist,match,forward,handler}.ts` + `app/api/1h/[...path]/route.ts` (+table tests) -- Story 1.3 factory proxy with `me` owner substitution and logging via `lib/server/log.ts`. **A5/A6 rework:** remove CSRF/binding checks and any server body logging. **A10:** proxy-level `ACCOUNT_DISABLED` 503 for `profile: true` entries.
- [x] `app/api/session/{refresh,logout}/route.ts` (+tests) -- Story 1.5 refresh, 204 logout. **A2/A5 rework:** no CSRF or binding check; accepts POST and GET; first best-effort `POST <root>/auth/user/logout/all-devices` (Bearer, no-store, 5 s), failures swallowed and logged without token.
- [x] `lib/api/{types,errors-codes,client,session-events,keys,fetcher,refresh-coordinator,user,index}.ts` (+tests) -- Story 1.4/1.5 client (never throws; single-flight + `navigator.locks`). **A5/A6 rework:** stop sending `X-PP-Session`, drop `SESSION_CHANGED`/`session-changed`; add `logApiCall` + `lib/shared/app-env.ts`.
- [x] `features/shell/portal-url-provider.tsx` (renamed from session-binding-provider.tsx; passes only `portalUrl`), `features/shell/use-myself.ts` + `app/layout.tsx` + `app/page.tsx` -- one root `SWRConfig`; page `requireSession` + placeholder showing first/last name. **A5 rework:** the provider passes only `portalUrl` (no `sessionBinding`).
- [x] `vitest.config.ts`, `test/setup.ts` (MSW), `playwright.config.ts`, `e2e/{headers,auth}.spec.ts`, `.github/workflows/ci.yml`, `scripts/check-forbidden.sh`, `.env.example` -- tooling and CI.

**Acceptance Criteria:**
- Given any path incl. 404 and static assets, when requested, then all AD-21 headers are present (incl. `frame-ancestors 'none'`, `X-Frame-Options: DENY` and COOP `same-origin`) and two requests get different nonces.
- Given the repo, when `scripts/check-forbidden.sh` runs, then no `document.cookie`, `access_token` outside `lib/server`, `NEXT_PUBLIC_*SECRET*`, `X-PP-Session`, `sessionBinding`, `SESSION_CHANGED`, `Sec-Fetch-Site`, `/launch` routes, `APP_ENV`/`API_ORIGIN`/`APP_ORIGIN`/`PORTAL_URL` env reads, `SameSite=None`, `Partitioned` or `bg-black/50` exist, and `_DEMO`/`_PROD` secret names appear only in the allowed files (Implementation Notes).
- Given a `me` proxy call, when logged, then the log line contains the template, never the `personId`.
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then all pass with no `ignoreBuildErrors`.

### Review Findings

Code review 2 (2026-10-14; Blind Hunter, Edge Case Hunter, Verification Gap, Acceptance Auditor, agents.md/backend contract check).

- [x] [Review][Decision] Lost launch response clears the new session — resolved 2026-10-14: human kept current behaviour (accepted risk; Story 1.2 clear-on-failure stands) Detail: if the first `/api/token` succeeds but its response is lost, the client retry gets `LAUNCH_USED` and the failure path clears the `__Host-pp_s` it just set, so a successful login ends on an error screen. Story 1.2 requires every failed launch to clear the previous session; patient-vault never clears on failure.
- [x] [Review][Patch] Fractional `expires_in` makes the sealed session unreadable (`accessExpiresAt` must be an int) [lib/server/launch/launch.ts:169, lib/server/session/refresh.ts:78]
- [x] [Review][Patch] Refresh maps 4xx other than 401/`invalid_grant` (e.g. 403) to `REFRESH_UNAVAILABLE` forever; treat them as rejected [lib/server/session/refresh.ts:61]
- [x] [Review][Patch] Launch whose cookie exceeds the budget keeps the previous session and answers a bare 500 without `ok:false`/`retryable:false` [lib/server/launch/token-handler.ts:87]
- [x] [Review][Patch] Next auto-methods: HEAD on logout runs the full logout + all-devices revoke; OPTIONS answers 204 on `/api/token` and session routes; non-POST on `/api/token` gets a bare 405 without no-store/envelope [app/api/session/logout/route.ts, app/api/session/refresh/route.ts, app/api/token/route.ts]
- [x] [Review][Patch] `PUT v2/user/edit` schema looser than the backend: first/middle/last names 1–24, `birthDate` is a `LocalDate` (no `"n/a"`), SSN `^(\d{3}-\d{2}-\d{4}|\d{9}|n/a)$` [lib/server/proxy/allowlist.ts:11]
- [x] [Review][Patch] `myself.personId` is nullable per agents.md/`OneHealthUserDTO`, but the client schema requires it [lib/api/user.ts:22]
- [x] [Review][Patch] No test that a seal older than 8 h unseals to no session [lib/server/session/session.test.ts]
- [x] [Review][Patch] No test that route modules export their methods (proxy GET/POST/PUT/PATCH/DELETE, refresh POST, logout GET/POST, token POST) [app/api/**/route.test.ts]
- [x] [Review][Patch] ESLint lifts the `fetch(` ban for all of `app/api/**`, wider than the spec boundary [eslint.config.mjs]
- [x] [Review][Patch] Request log lines use `template` while stories and `logError` use `routeTemplate` [lib/server/log.ts]
- [x] [Review][Patch] `docs/api/*.md` "Code:" links still point at deleted modules [docs/api/QUERY.md, CUSTOM-DATA.md, PROVISIONING.md, WORKFLOWS.md, SCHEMA-DISCOVERY.md, DYNAMIC-STEPS.md]
- [x] [Review][Defer] Upstream 401 on a token still fresh by the clock ends the session instead of refreshing [lib/server/session/session-routes.ts:46] — deferred: behaviour required by Story 1.5 (L1050, L1067); revisit with a force-refresh flag when 1.6/7.0b touch refresh.
- [x] [Review][Defer] `/api/token` and proxy buffer chunked bodies without Content-Length before the size cap [lib/server/launch/token-handler.ts:22, lib/server/proxy/handler.ts:27] — deferred: bounded by Next/Vercel body limits; streaming reader with the AD-13 upload stories.
- [x] [Review][Defer] 25 s timer now covers body streaming, so future large `asImage` downloads could be cut [lib/server/http/fetch-with-timeout.ts] — deferred: no `asImage` entry ships yet; switch to an idle timeout when one does.
- [x] [Review][Defer] Deny check runs before owner-id substitution, so a future `{userId}`/`{personId}` entry could reach a `<n>`-denied template [lib/server/proxy/handler.ts:85] — deferred: no such entry exists; re-check denies on upstream segments when one is added.
- [x] [Review][Defer] A relaunch over an existing session drops the previous tokens without revoking them [lib/server/launch/token-handler.ts] — deferred: not required by Story 1.2; best-effort revoke can reuse `revokeAllDevices`.
- [x] [Review][Defer] CSP lacks Google Maps hosts needed once `PLACES_ENABLED=1` [lib/server/security/headers.ts] — deferred: Places is a later epic (AD-14 routes Places through `/api/places`, so the browser may never need them).

Rejected:
- GET logout cross-site revoke — accepted by the human (A11-1).
- `LAUNCH_USED`/`LAUNCH_EXPIRED` retryable — accepted by the human (A11-2).
- Substring classification of exchange errors — already deferred (review 1, #25).
- Large tenantId precision — false: only tenant `1` is accepted.
- 8 h cap / `lastSeen` not enforced — false for 7.0a: Story 1.6 scope.
- Nonce/CSP on static assets — false: required by the Story 1.1 header spec.
- `x-nonce` has no consumer — false: Next applies the request CSP nonce; e2e asserts every script carries it.
- Deny list case-sensitive — low: allowlist is exact-case, so no differently-cased path can reach upstream.
- Concurrent refresh without Web Locks — Story 1.5 accepts the in-tab fallback.
- `refreshSession` branch mapping untested — low: lines are covered; the 4xx patch adds explicit mapping tests.
- Response bodies not discarded on early returns — low: the abort timer releases them.
- Auth screen resolves after unmount — low: only an extra navigation from a dead screen.
- No `session-expired` subscriber after deleting `use-session-expired` — out of 7.0a scope (session dialogs are 7.0b).
- Parsed but unused `tenant.id`/`issuedAt` — low: tenant is enforced from the token claim; freshness is enforced upstream.
- `personId` null blocks launch with retries — low: portal users always have a person record.
- Gender/race enums, `preferredLanguage` format — low: the backend validates and returns 400.

## Alignment with epics.md (2026-10-14)

The Epic 1 ACs in `epics.md` (Stories 1.1–1.5, 1.7 logout/login intent, D1–D13) are the authoritative detail for every item below; this list names what the rework must add or change beyond the Tasks above. Each item ships with tests.

- **Contradictions resolved:** wrong tenant = 403 `WRONG_TENANT`, `retryable:false`, module-neutral copy (L841; not `LAUNCH_TENANT`). `pnpm dev` = `next dev --experimental-https` (L771). `access_token` is forbidden everywhere outside `lib/server/` (no `app/api/` exemption; `logApiCall` matches token keys by `/token/i`). The `contact-point/list` and `PUT v2/user/edit` entries ship early (deviation from L924; 7.5–7.6 decide their `profile: true` tag). L737's "no environment chooser" means no request-affecting chooser; the D9 display-only "Choose Environment" card is allowed in `app/auth/**` and `features/shell/auth-screen.tsx`. `PP_DISABLED=1`: `/api/token` answers 503 `SERVICE_DISABLED` with `retryable:false` and no upstream call; `/auth` shows the disabled copy.
- **1.1:** `env.ts` also exports `IS_LOCAL_DEV`, `DEFAULT_TENANT_ID=1`, `getSecretKey(env)`, `getAppId(env)` and validates `PLACES_ENABLED`/`GOOGLE_PLACES_KEY` (L715); whitespace around a secret is not a boot error (L727). `environments.ts` has `apiRoot`, `apiBase`, `portalUrl`, `publicFilesOrigin` with a Vitest on the values; no other module hard-codes a 1health origin (L721–722). Lint also bans `dangerouslySetInnerHTML`, `NextResponse.redirect` in `app/handoff/**`, `next/link`/raw `<a href>` to `/`, `/account`, `/handoff/**` or a `portalUrl` outside `features/shell` and `/auth`, and `document.referrer` outside `app/auth/**` + `features/shell/auth-screen.tsx` (L734–737). `next.config.mjs`: no `eslint.ignoreDuringBuilds`, no `cacheComponents`, no `s-maxage` (L752). `package.json`: `engines` node 24.x, `packageManager` pnpm 12.x, scripts `dev`/`build`/`lint`/`typecheck`/`test`/`test:e2e` (L770–771). Header e2e covers `/`, `/auth`, `/account`, `/handoff/portal`, a 404, a static asset and `GET /api/1h/v2/user/myself` with the exact L741 CSP and every AD-21 header (L778, L984). `check-forbidden.sh` adds `X-PP-Session`, `sessionBinding`, `SESSION_CHANGED`, `Sec-Fetch-Site`, `PORTAL_ORIGIN`, `PUBLIC_FILES_ORIGIN`, `window.top` (L784).
- **1.2:** `app/auth/page.tsx` is a `force-dynamic` server wrapper that reads only `onehealth_environment` and renders `features/shell/auth-screen.tsx` (L802); `lpl` is removed from the address bar with `history.replaceState` before any request (L803); fake-timer retry tests per L811; component tests for the manual-entry card, Choose Environment, error Alert buttons, Submit disabled while empty, `trim()` + space→`+`, LPL never stored or logged, strings from `lib/shared/messages.ts` (L881–893). `/api/token`: POST only (else 405); clears any existing `__Host-pp_s` first; ignores every body field but `lpl`, including `environment` (L814–817); rejects payloads under 28 bytes and cleartext JSON; error body `{ ok:false, errorCode, source, message, retryable? }` (L825–827); HMAC uses the key variant that decrypted; exchange `redirect:"manual"`, 25 s, no-store, once (L835); `LAUNCH_USED`/`LAUNCH_EXPIRED` 400, other exchange failures `LAUNCH_INVALID` (502 for 5xx/timeout/network), 503 `LAUNCH_CONFIG` (L836, L870); session payload `userId, personId, tenantId, environment, sid (≥128 bit), gen=0, iat, lastSeen`, no `id_token`/apiRoot, no `Expires` (L850–852); `onehealth_environment` set only on success, unchanged on failure (L859); no-store/Pragma/`Vary: Cookie` (L860); log line `requestId, /api/token, outcome, environment, durationMs` (L874). Playwright asserts final URL `/` and no `lpl` in history with a mocked `/api/token` (L866; the real exchange stays unit-tested). Delete the old `app/api/token/route.tsx`.
- **1.3:** upstream URL origin re-asserted against `apiRoot` and re-matched to the template; no-store, `redirect:"manual"`, 25 s (L929). Deny list exactly L935 with the L936 table; 405 for a wrong method and HEAD/OPTIONS/TRACE; `X-HTTP-Method-Override` dropped; `_method` → `BAD_QUERY` (L938–939). Full `BAD_PATH` table incl. `%2e%2e`, `//host`, trailing `/`, `V2/User/Myself` (L944). A numeric own id in an owner position → 403; ids `^\d{1,19}$` (L949–950). `BAD_QUERY`, server-fixed params, `asImage` forces `preview=true` (L954–956). No/bad cookie → 401 `SESSION_EXPIRED`; `UPSTREAM_REDIRECT`/`UPSTREAM_ERROR` 502, `UPSTREAM_TIMEOUT` 504, `PP_DISABLED` 503 (L965, L974–975). Proxy-level `ACCOUNT_DISABLED` fixture test (A10, L977). Request/response header allowlists; `Cookie` never forwarded; no-store/`Vary: Cookie`/nosniff on errors too (L981–984).
- **1.4:** portal URL via one shared server helper (`lib/server/page-session.ts`) feeding the client provider (L1008). Non-`/api/` path → `BAD_PATH` with no network call; empty 2xx → `success:true`; network failure → `NETWORK_ERROR` (L1013–1017). `lib/api/log-api-call.ts`: silent unless `isLocalDev()`; redacts SSN-shaped values, `code`, `qrCode`, `lpl`, `/token/i` keys and `authorization` (L1018–1019). `lib/shared/app-env.ts` exports `isLocalDev()` and is the only `NODE_ENV` read (L732). Inline SWR array keys fail a lint rule or test (L1031).
- **1.5:** token valid > 30 s → 200, no IdP call, cookie unchanged (L1050); `gen++`, same `sid`; `invalid_grant`/401 → cookie cleared + 401; 5xx/timeout → 503 `REFRESH_UNAVAILABLE`, cookie kept; `PP_DISABLED` → 503 (L1057–1061). Only a `source:"proxy"` `TOKEN_EXPIRED` triggers refresh; a replay that hits `TOKEN_EXPIRED` again → `SESSION_EXPIRED` (L1067–1068). Two-tab mocked `navigator.locks` test (L1075).
- **1.7 (subset):** logout with no session makes no upstream call; cookie cleared with `Max-Age=0`; GET identical to POST; log `{requestId, routeTemplate, status|errorName}` (L1153–1158). `lib/shared/login-intent.ts`: `saveLoginIntent(pathname+search)` / `consumeLoginIntent(fallback)` on sessionStorage `pp:login-intent`, rejecting `//`, `/auth*`, `/api*`, read-and-remove (L1151, L804); its callers on session expiry land in 7.0b.

## Design Notes

Decisions the docs left open (recorded here, low user visibility): session expiry in epoch ms; the portal URL reaches the client via a small client provider fed by the server page (no `sessionBinding`, A5); no `proxy.ts` no-session redirect (pages call `requireSession`); session-level `environment` drives upstream origin per request; deny prefixes `* v2/admin/**` and `* graphql/**`; launch-exchange errors map by message substring (`used`/`expired`) with `invalid` fallback until real bodies are recorded; logout revokes best-effort via `POST <root>/auth/user/logout/all-devices` (A2).

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: no errors
- `corepack pnpm vitest run --coverage` -- expected: green, 100% on new `lib/server` + `lib/api`
- `corepack pnpm test:e2e` -- expected: headers + launch specs green on desktop and 360 px
- `corepack pnpm build` -- expected: success
- `bash scripts/check-forbidden.sh` -- expected: exit 0

## Implementation Notes

- **Extra modules** (same layering, one responsibility each): `lib/shared/bff-contract.ts` (BFF `ErrorCode` union, header and path names shared by both sides), `lib/server/http/guard-route.ts` (global 500 wrapper, AD-15), `lib/server/session/session-routes.ts` (refresh/logout handler factories), `lib/server/session/page-session.ts` (`requirePageSession()`, the one helper pages use), `lib/api/session.ts` (`startSession`/`endSession`, so `/auth` goes through `callApi`), `features/shell/{swr-provider,profile-placeholder,index}.tsx` — after A6, `logApiCall` must redact the `lpl` request field.
- **Forbidden-pattern scope:** first pass; superseded by the rework note below.
- **Launch checks beyond the template** (Story 1.2 / AD-6): the payload's `apiKey.name` must equal `APP_ID_<ENV>`, and the access token's plaintext `tenantId` claim must be `1` (403 `WRONG_TENANT` after the rework). Neither was checked by the template; both need confirming against a real demo launch.
- **Root layout is `force-dynamic`:** a prerendered page (`/auth`, `/_not-found`) would carry no CSP nonce and its scripts would be blocked by `'strict-dynamic'`.
- **`Vary`:** Next appends its RSC values, so responses carry `Vary: rsc, …, Cookie`; tests assert `Cookie` is present.
- **Coverage command:** under pnpm 12, `pnpm test -- --coverage` forwards the literal `--` and Vitest ignores `--coverage`; use `pnpm vitest run --coverage` (what CI runs). Coverage gate: 100% on `lib/server`, `lib/api`, `lib/shared`.
- **MSW 3** renamed `onUnhandledRequest` to `onUnhandledFrame`; "no upstream call" rows use `trackAllRequests()` to assert zero calls explicitly.
- **Cookie budget:** with a 1,224-byte access token the sealed cookie fits 3,800 bytes for refresh tokens up to about 1,100 bytes (tested with 800).
- **E2E limits:** the server-side exchange cannot be mocked from Playwright, so a successful launch is asserted at the `/api/token` contract (mocked) and by route unit tests; the bad-LPL path runs against the real route.
- `pnpm dev` stayed `next dev` in the first pass; the rework switches it to `next dev --experimental-https` (Alignment section, L771).
- **Rework for A1–A10 and the epics.md alignment (2026-10-14, second pass):**
  - *Environment and env (A4, A7, 1.1):* `lib/shared/environments.ts` now holds `apiRoot`/`apiBase`/`portalUrl`/`publicFilesOrigin` (`null` until the values are known) for `https://1health.demo.1health.io` / `https://1health.app.1health.io`, with a values test. `lib/server/env.ts` exports the named vars, `IS_LOCAL_DEV`, `DEFAULT_TENANT_ID`, `getSecretKey`/`getAppId`, validates `PLACES_ENABLED`/`GOOGLE_PLACES_KEY`, and does not fail on whitespace around a key. New `lib/shared/{app-env,login-intent,messages}.ts`.
  - *Launch (A1, A3, A9, 1.2):* `/api/token` (logic in `lib/server/launch/token-handler.ts`) is POST-only, requires JSON (415), reads only `lpl`, tries `_PROD` then `_DEMO` (as stored, then trimmed, with a warning naming the variable via `secretKeyVariable()`), signs the exchange with the matching key variant, sets `onehealth_environment` on success only, and answers `{ ok: true, environment }` or `{ ok: false, errorCode, source, message, retryable? }`. Status mapping per Story 1.2: decode/app-id → 400 `retryable:false`; `LAUNCH_USED`/`LAUNCH_EXPIRED`/other upstream rejection → 400; 5xx/timeout/network/bad answer → 502; unreadable tenant claim → 502 (retryable; my choice, not in the ACs); wrong tenant → 403 `WRONG_TENANT` `retryable:false`; no usable key (blank after trim) → 503 `LAUNCH_CONFIG`. `app/auth/page.tsx` is a `force-dynamic` wrapper over `features/shell/auth-screen.tsx` + `launch-flow.ts` (5 attempts at 1500 ms, `history.replaceState` before the first request, manual entry, Choose Environment, error Alert, `location.assign(consumeLoginIntent("/"))` after 1200 ms).
  - *D5 removal:* `lib/server/security/{csrf,session-binding}.ts`, `X-PP-Session`, the `CSRF`/`SESSION_CHANGED` codes and the `session-changed` event are gone. The shared 415 check lives in `lib/server/http/content-type.ts`. `SessionBindingProvider` became `PortalUrlProvider` (portal URL only, registered with `configureApiClient`/`getPortalUrl`). `requirePageSession()` moved to `lib/server/page-session.ts`.
  - *Logout (A2, 1.7):* POST and GET, best-effort `POST <apiRoot>/auth/user/logout/all-devices` with the session Bearer (5 s, no-store), failures logged as `{requestId, routeTemplate, status|errorName}`; no session → no upstream call; always 204 clearing the cookie.
  - *Logging (A6):* server-side dev body logging removed; `lib/api/log-api-call.ts` (dev-only, redacted, incl. `lpl`) is called by `callApi`. `ApiResponse` gained optional `retryable` and `userMessage` (the BFF's user-safe launch message), used only by `startSession()`.
  - *Lint (1.1):* added bans on `document.referrer` (outside `app/auth/**` and `auth-screen.tsx`), `next/link`, and `href` to `/`, `/account`, `/handoff/**`, a 1health origin or a `portalUrl` identifier (outside `features/shell/**` and `app/auth/**`); `lib/shared/app-env.ts` is the one other `process.env` exception.
  - *`check-forbidden.sh`:* `access_token` is now banned in every file outside `lib/server/` (no `app/api/` exemption; the route test moved to `lib/server/launch/token-handler.test.ts`; wire-shape fixtures live in `test/upstream-fixture.ts` and `test/redaction-fixture.ts`). It also bans the removed concepts (D1/D5/D10 names, `/launch` routes) in non-test app code, and hard-coded 1health origins outside `environments.ts`. Allowed `_DEMO`/`_PROD` files: `lib/server/env.ts`, `lib/server/env.test.ts`, `test/env-fixture.ts`, `.env.example`, `playwright.config.ts`, `e2e/server-env.ts`, `.github/workflows/ci.yml`.
  - *Deviation, `bg-black/50`:* it remains in `components/ui/dialog.tsx`, which this spec keeps untouched (as is `app/globals.css`, where the D13 `scrim` token would go). The script exempts `components/ui/` for that one pattern until the D13 token story replaces it.
  - *E2E:* the launch spec mocks `/api/token` (fulfilled with the same `Set-Cookie` the real route sends, sealed with the e2e `SESSION_SECRET`) and `/api/1h/v2/user/myself`; it asserts the body is `{ lpl }` only, the final URL `/` shows the user's name, `lpl` is absent after back/forward, and a reload makes no second exchange. The bad-LPL path still runs against the real route (one POST, `retryable:false`). `/api/token` GET → 405 is asserted with headers.
  - `pnpm dev` is now `next dev --experimental-https` (not exercised here: it may prompt to install a local certificate on first run).

- **Review fixes (2026-10-14, third pass):** the proxy never forwards upstream `Content-Length` (fetch decompresses gzip/br); `fetchWithTimeout` keeps its abort timer armed until the body is fully read, errors or is cancelled (stalled bodies time out); deny-before-allowlist wiring has a fixture test; `login-intent` parses with `new URL(path, base)`, rejects control characters, other origins and `..`-resolved `/auth*`/`/api*`, and stores the parsed `pathname + search`; query lookups use `Object.hasOwn` (`?constructor=x` → 400); `decryptLpl` strips `\r\n\t` (spaces still → `+`); `/api/token` rejects a declared `Content-Length` over 16 KB before reading and measures the body in bytes; a refresh whose cookie would exceed the budget answers 401 `SESSION_EXPIRED` and clears the cookie; the per-seal TTL comment no longer claims the absolute cap (Story 1.6); a throwing session-event listener is logged and the others still run; the SWR fetcher table is a `Map`; `receiveNotifications` left the `user/edit` body schema; the `/auth` success timer is cleared on unmount; `requirePageSession()` reads `environmentConfig(session.environment)` directly; HEAD/OPTIONS and `instrumentation.register()` have tests; `check-forbidden.sh` skips missing files with `|| continue`, passes NUL-delimited lists to `xargs -0`, and aborts on a grep error (exit ≥ 2) instead of masking it; DATA-MODEL and GOTCHAS got the reference-only banner; CI builds once (Build before e2e; Playwright's web server only `start`s under `CI`, and still builds first locally).
- **A11 (revocation after a post-exchange failure):** `lib/server/session/revoke.ts#revokeAllDevices()` (best effort, no-store, 5 s, logged as `{requestId, routeTemplate, status|errorName}` without the token) is shared by logout and launch. `launch()` revokes the new access token before answering on an unreadable tenant claim and on a `myself` failure or id mismatch; the token handler revokes before rethrowing when the sealed cookie exceeds its budget (still the route's 500). `WRONG_TENANT`, exchange failures and pre-exchange failures make no revocation call. Responses and `retryable` flags are unchanged.

- **Review 2 fixes (on top of d35a162):** `accessExpiresAt` uses `Math.floor(expires_in * 1000)` at launch and refresh (a fractional value made every unseal fail); the refresh grant maps every 4xx to `rejected` (session ends) and 5xx/3xx/timeout/network/unreadable 2xx to `unavailable`; an over-budget launch cookie now answers 500 `{ ok:false, errorCode:"LAUNCH_CONFIG", source, message, retryable:false }`, clearing `__Host-pp_s`, after the best-effort revoke; every route exports explicit 405 handlers for the methods it does not serve (shared `methodNotAllowed()`; `/api/token` uses its launch envelope via `tokenMethodNotAllowed()`), so Next never auto-runs logout for HEAD; `user/edit` names are 1–24 chars, `birthDate` is `YYYY-MM-DD` only, SSN matches `^(\d{3}-\d{2}-\d{4}|\d{9}|n/a)$`; `Myself.personId` is `number | null` (the launch still requires a `personId` for the session); tests for the 8 h per-seal TTL and for every route module export (`app/api/**/route.test.ts`; the proxy's POST/PATCH/DELETE are asserted through a 405 envelope because no shipped entry serves them); `fetch(` is allowed only in `lib/api/client.ts` and `lib/server/**`; request log lines use `routeTemplate`; `docs/api` "Code:" links to deleted modules were replaced with "removed in spec 7.0a; see git history before d35a162."

## Spec Change Log

- 2026-10-14 -- Code reworked to A1–A10 and the Alignment section; all gates green (see Implementation Notes, second pass).
- 2026-10-14 -- The human amended the intent after implementation with A1–A10 (key-based environment, logout revocation, remembered environment, environment map, no CSRF/session binding, dev-only logApiCall, public-files origin, no blocked-cookie detection, patient-vault /auth UX, deny-list ownership; epics.md D1–D13). Boundaries, I/O matrix and the affected Tasks were realigned and reopened. The code is not yet updated.

## Review Triage Log

Review pass 1 (2026-10-14; Blind Hunter, Edge Case Hunter, Verification Gap; findings deduplicated by location + claim).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Upstream Content-Length forwarded after Node fetch decompresses gzip/br | high | `forward.ts` copied it; reproduced 5,008 B body with `content-length: 50` | patch (fixed: never forwarded, gzip test) |
| 2 | 25 s timer cleared at headers; stalled body uncapped | medium | `fetch-with-timeout.ts` cleared in `finally` | patch (fixed) |
| 3 | Deny-before-allowlist wiring untested | medium | deleting `isDenied` kept 109 proxy tests green | patch (test added) |
| 4 | Login intent `/\t/evil.com` resolves off-origin; `/x/../auth` passes | medium | node: `new URL('/\t/evil.com', o)` → `https://evil.com/` | patch (parsed-URL validation) |
| 5 | Prototype-named query keys dropped instead of 400 | low | `key in fixed` true for `constructor` | patch (`Object.hasOwn`) |
| 6 | Wrapped pasted LPL (\r\n\t) rejected | low | base64 regex rejected whitespace | patch (stripped) |
| 7 | `/api/token` reads body before size check, compares chars | low | `token-handler.ts` used `text.length` | patch (Content-Length pre-check + byteLength) |
| 8 | Refresh over cookie budget → 500, old cookie kept | low | `buildSessionSetCookie` throw in refresh route | patch (401 + clear) |
| 9 | Misleading "absolute cap" comment on per-seal TTL | low | refresh re-seals with fresh TTL; cap is Story 1.6 | patch (comment) |
| 10 | Throwing session listener stops others / makes callApi reject | low | `session-events.ts` loop without guard | patch (try/catch) |
| 11 | Fetcher resolves prototype names | low | plain-object lookup | patch (`Map`) |
| 12 | `receiveNotifications` not in backend DTO | low | `PersonalInformationDTO` lacks it | patch (removed) |
| 13 | Success timer not cleared on unmount | low | `auth-screen.tsx` | patch |
| 14 | Dead `resolveEnvironment(..., undefined)` | low | `page-session.ts` | patch |
| 15 | HEAD/OPTIONS route exports untested | low | no route-level test | patch (test) |
| 16 | `register()` boot wiring untested | low | no test imported `instrumentation.ts` | patch (test) |
| 17 | `check-forbidden.sh` silent exit / space-split paths / masked grep errors | low | reproduced under `set -euo pipefail` | patch |
| 18 | DATA-MODEL.md, GOTCHAS.md lack reference-only banner | low | point at removed exports | patch |
| 19 | CI builds twice | low | webServer build + ci.yml build | patch |
| 20 | Tokens from a launch that fails after exchange never revoked | medium | `launch.ts` post-exchange failures | intent_gap → human chose revoke (A11), fixed |
| 21 | GET logout + all-devices revoke = cross-site logout everywhere | low | D3 + D5 | intent_gap → human kept patient-vault behavior (A11), accepted |
| 22 | Used/expired code and post-exchange failures retryable | low | Story 1.2 / D9 | intent_gap → human kept patient-vault behavior (A11), accepted |
| 23 | Proxy body buffered without Content-Length | low | bounded by Next/Vercel limits; no upload entries yet | defer |
| 24 | `user/edit` schema lacks prefix/suffix/otherNames/titles/cityOfBirth; `birthDate:"n/a"` vs LocalDate | low | backend partial update, no wipe | defer (Personal card story) |
| 25 | Exchange errors classified by substring | low | spec Design Notes chose substring until real bodies recorded | defer |
| 26 | guardRoute requestId not correlatable | low | new id in `guard-route.ts` | defer |
| 27 | Client refresh has no timeout under a held Web Lock | maybe-false | server bounded; locks release on tab close | defer (unverified, medium) |
| 28 | `expires_in` ≤ 30 s loops to session end | maybe-false | real lifetimes are minutes | defer (unverified, medium) |
| 29 | 8 h cap / `lastSeen` not enforced | false | Story 1.6 scope (out of 7.0a) | reject |
| 30 | Upstream 401 with fresh token → session-expired | false | required by L1050/L1067–1068 | reject |
| 31 | Concurrent refresh rotation without Web Locks | false | Story 1.5 accepts in-tab single-flight fallback | reject |
| 32 | tenantId > 2^53 precision | false | only `1` is accepted | reject |
| 33 | `PUT user/edit` not tagged `profile: true` | false | Alignment: 7.5–7.6 decide | reject |
| 34 | Headers on static assets overhead | false | required by Story 1.1 header spec | reject |
| 35 | Replay with stream body | false | all callers pass strings; errors map to NETWORK_ERROR | reject |
| 36 | `/authx`, `/apix` accepted | false | Story 1.7 L1151 blocks exact or under-path, as patient-vault | reject |
| 37 | Coverage gate excludes features/proxy.ts | false | spec scopes 100% to lib/** | reject |
| 38 | `bg-black/50` exemption | false | recorded deviation; components/ui untouched; D13 token story | reject |
| 39 | Late subscriber misses event | maybe-false | `hasPublished()` exists; at-most-once documented | reject (low) |
| 40 | Numeric SSN printed in dev console | maybe-false | redaction by key covers `ssn`/`code`; dev-only | reject (low) |
| 41 | Query rule with g/y flag | maybe-false | no shipped rule has them | reject (low) |
| 42 | Empty name renders empty heading | low | temporary placeholder replaced in 7.0b | reject (low, placeholder) |

