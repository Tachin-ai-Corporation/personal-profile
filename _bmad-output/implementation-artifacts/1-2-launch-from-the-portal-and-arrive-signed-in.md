---
title: 'Story 1.2: Launch from the portal and arrive signed in'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4de30f145ed403dad0109cfc43c90b1088eb142c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After Story 1.1 the app has no way in — the legacy browser-token launch/auth was deleted and `app/page.tsx` is an unguarded placeholder. The 1health portal must open Personal Profile already signed in on Contacts, with the launch link single-use and tokens never reaching the browser.

**Approach:** Build a one-shot **server** launch at `/launch` that decrypts the encrypted launch payload, exchanges the one-time code exactly once, gates on tenant, derives ids from `/myself`, seals one iron-session cookie, and redirects through `/launch/verify` to `/?tab=`. Every failure lands on an explanatory `/launch-error` screen (never blank/raw). No API data fetch, proxy forwarding, token refresh, idle logoff, or per-tab binding here (Stories 1.3–1.6).

## Boundaries & Constraints

**Always:**
- **Entry.** `proxy.ts` 307-redirects any `/` request carrying `lpl` to `/launch` with the full query string preserved; `app/page.tsx` never reads `lpl`. `app/launch/route.ts` exports `dynamic = "force-dynamic"`.
- **Clear-first.** Before anything else the launch route schedules clearing of any existing `__Host-pp_s`, so a failed launch never leaves the previous user's session.
- **Crypto lives in `lib/server/launch.ts`** (`import "server-only"`), byte-identical to the platform: replace every `' '` with `'+'` in `lpl`, base64-decode, require ≥ 28 bytes; AES-256-GCM with IV = first 12 bytes, tag = last 16 bytes; AES key = HKDF-SHA256(IKM = `ONEHEALTH_SECRET_KEY` utf8, salt = 32 zero bytes, info = empty, 32-byte output). Payload requires `required.apiKey.name`, `required.tenant.id`, `required.user.id`, `required.oneTimeCode.value`, `required.oneTimeCode.issuedAt`.
- **App-id gate.** If `required.apiKey.name !== APP_ID`: no upstream call, 303 `/launch-error?reason=invalid`.
- **Single exchange.** `POST <API_ORIGIN>/api/v2/public/external-application/auth/oauth2/user/token` exactly once with `{ signature, securityCode }` (signature = base64 HMAC-SHA256 of `oneTimeCode.value` keyed by the **raw, un-derived** `ONEHEALTH_SECRET_KEY` utf8; securityCode = `oneTimeCode.value`), `cache:"no-store"`, `redirect:"manual"`, 25 s timeout, **no retry**. Upstream "already consumed" → `used`, "expired" → `expired`, any other 4xx/5xx/3xx/timeout/network → `invalid`; the mapping lives in `lib/server/launch.ts` and is unit-tested against recorded upstream bodies.
- **Tenant gate (AD-6).** Read only the plaintext `tenantId` claim of the access token (never decode other, encrypted claims). If the claim is **missing or unparseable** (no readable numeric `tenantId`): no cookie, no further upstream, 303 `/launch-error?reason=invalid` (a malformed token is an invalid launch, not a wrong account). If the claim is a **real tenant value other than** `DEFAULT_TENANT_ID` (`1`): no cookie, no further upstream, 303 `/launch-error?reason=tenant`.
- **Id derivation (AD-1).** `GET <API_ORIGIN>/api/v2/user/myself` once with the new Bearer; take `userId` from the response `id` and `personId` from its `personId` (never from the JWT or payload alone). If the call fails or `id !== payload required.user.id`: no cookie, 303 `/launch-error?reason=invalid`.
- **Session (`lib/server/session.ts`).** Seal ONE cookie `__Host-pp_s` with iron-session (password map: `SESSION_SECRET` current + `SESSION_SECRET_PREVIOUS` accepted for **unseal only**) holding access token, refresh token, access expiry, `userId`, `personId`, `tenantId`, a new random `sid` (≥ 128 bits), `gen = 0`, `iat = now`, `lastSeen = now`. Cookie attributes exactly `HttpOnly; Secure; SameSite=None; Partitioned; Path=/` — no `Domain`, no `Max-Age`, no `Expires`. Never store `id_token`, the environment, or the API origin. Export `requireSession()` here.
- **Redirect chain.** Launch answers 303 to a relative, fragment-free `Location: /launch/verify?tab=<tab>` (`tab` ∈ `contacts|insurance|medical`, anything else/absent → `contacts`). `GET /launch/verify` unseals the cookie → 303 `/?tab=<tab>`, or 303 `/launch-error?reason=cookies` if the cookie is missing or fails to unseal. No `/launch` or `/launch/verify` body contains a token.
- **Headers.** `/launch`, `/launch/verify`, `/launch-error`, and the guarded `/` responses carry `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie` (from `lib/server/cache-headers.ts`), plus the Story 1.1 AD-21 set from `proxy.ts`.
- **Config/kill reasons.** `config` when `ONEHEALTH_SECRET_KEY` cannot form a valid AES key at request time; `disabled` when `PP_DISABLED` is set — both checked at `/launch` and the `/` guard, answering 303 `/launch-error?reason=config|disabled`.
- **Home guard.** `/` with no valid session and no `lpl`: `app/page.tsx` (`dynamic="force-dynamic"`) calls `requireSession()` → redirect `/launch-error?reason=expired`. No login page, no `/auth`.
- **Error screen.** `/launch-error?reason=<r>` renders a full-page centered `rounded-lg` card (icon, title, one paragraph, one primary action). `expired|used|invalid` → title "This link has expired", body "Open Personal Profile again from 1health.", action "Return to 1health" → `PORTAL_URL`; `tenant` → body "Personal Profile is available in your personal account. Switch to it in 1health and open the app again."; `cookies` → action "Open in a new tab" linking `PORTAL_URL` with `target="_blank" rel="noopener noreferrer"`; `config|disabled` → title "Personal Profile is unavailable right now", body "Use your profile in 1health for now.". Any other/missing value renders exactly the `invalid` variant; the raw `reason` is never rendered or logged; no retry/resubmit. All strings live in `lib/shared/messages.ts`; strings not locked in EXPERIENCE.md (tenant title, cookies title/body, config/disabled copy) are marked `// DRAFT COPY` for PM review.
- **Framed exit.** When framed (`window.self !== window.top`), "Return to 1health" opens `PORTAL_URL` in a new tab (`target="_blank" rel="noopener noreferrer"`), since the sandboxed frame cannot navigate the top window.
- **Logging.** Each launch log line holds only request id, route template `/launch`, outcome reason, and duration.
- **Dev launch.** `app/launch/dev/page.tsx` renders only when `APP_ENV=dev` (a labelled "Launch payload (lpl)" textarea + a `contacts|insurance|medical` select, submitted with a GET form to `/launch`); it never logs, stores, or echoes the payload. With `APP_ENV` `demo`/`prod` the route calls `notFound()` (404).

**Never:**
- No token, refresh token, or id in any response body or client-readable cookie; no `document.cookie` or `access_token` in client code; never log a secret, token, `lpl`, code, user id, or upstream body.
- No retry of the code exchange and no second exchange on reload; no manual environment chooser or `document.referrer` detection; no `/auth` route or login page.
- No `/api/1h` proxy forwarding, `callApi` data fetch, token refresh, idle logoff, or per-tab session binding in this story. No decoding of encrypted token claims beyond the plaintext `tenantId`.
- Don't alter Story 1.1's security-header behavior, `callApi` signature, `components/ui/**`, or the design tokens.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Old-style launch URL | GET `/?lpl=<p>&tab=<t>` | 307 → `/launch` with full query preserved; AD-21 headers | N/A |
| Valid launch | `/launch?lpl=<valid>&tab=contacts#signature` | code exchanged once, tenant=1, ids from `/myself`, cookie sealed, 303 → `/launch/verify?tab=contacts` → 303 `/?tab=contacts` (fragment kept by browser) | N/A |
| Malformed payload | missing / not base64 / < 28 bytes / GCM auth fail / cleartext JSON / not JSON / missing required field | no upstream call, no cookie, 303 `/launch-error?reason=invalid` | invalid |
| Wrong app id | `apiKey.name !== APP_ID` | no upstream call, no cookie, 303 `reason=invalid` | invalid |
| Consumed code | upstream says already-consumed | no cookie, 303 `reason=used` | used |
| Expired code | upstream says expired | no cookie, 303 `reason=expired` | expired |
| Other exchange failure | other 4xx / 5xx / 3xx / timeout / network | no cookie, 303 `reason=invalid` | invalid |
| Wrong tenant | token `tenantId` is a real value ≠ 1 | no cookie, no further upstream, 303 `reason=tenant` | tenant |
| No/unparseable tenant claim | token has no readable numeric `tenantId` | no cookie, no further upstream, 303 `reason=invalid` | invalid |
| myself fail / id mismatch | `/myself` fails or its `id` ≠ payload `required.user.id` | no cookie, 303 `reason=invalid` | invalid |
| Bad key | `ONEHEALTH_SECRET_KEY` cannot form an AES key | 303 `reason=config` | config |
| Kill switch | `PP_DISABLED=1` | 303 `reason=disabled` (at `/launch` and `/` guard) | disabled |
| Cookie didn't stick | `/launch/verify` cookie missing/unsealable | 303 `reason=cookies` | cookies |
| No session at `/` | GET `/` no cookie, no `lpl` | `requireSession()` → redirect `reason=expired` | expired |
| Secret rotation | cookie sealed under the previous secret | unsealed while `SESSION_SECRET_PREVIOUS` set; new cookies sealed with `SESSION_SECRET`; old cookie rejected (no session) once the var is removed | N/A |
| Cookie size | seal with largest fixtures (≥ 1,224-byte access token) | serialized `Set-Cookie` ≤ 3,800 bytes | N/A |
| Reload after launch | second GET to the final URL | no second exchange (mock exchange endpoint called exactly once); `lpl` not in final URL or history | N/A |
| Unknown error reason | `/launch-error?reason=whatever` | renders exactly the `invalid` variant; raw reason never shown/logged | N/A |
| Dev page by env | `/launch/dev` with `APP_ENV` demo/prod | `notFound()` → 404 | N/A |

</frozen-after-approval>

## Code Map

- `proxy.ts` — **modify.** Ahead of the Story 1.1 header logic, 307-redirect any request to `/` (path `/`) that has an `lpl` query param to `/launch` with the query string preserved. Keep every existing nonce/CSP/AD-21 behavior and the matcher unchanged. Do not add `/api/1h` or other proxy forwarding.
- `lib/server/env.ts` — **reuse, no change.** Source of `ONEHEALTH_SECRET_KEY`, `SESSION_SECRET`, `SESSION_SECRET_PREVIOUS`, `API_ORIGIN`, `APP_ID`, `DEFAULT_TENANT_ID`, `PORTAL_URL`, `PP_DISABLED`, `APP_ENV`.
- `lib/server/launch.ts` — **create** (`import "server-only"`). `deriveAesKey(secret)` (HKDF-SHA256, 32-zero salt, empty info, 32 bytes), `decryptLaunchPayload(lpl)` (space→plus, base64, ≥28-byte guard, AES-256-GCM IV=12/tag=16, JSON parse + required-field validation; throws a typed `LaunchError('config'|'invalid')`), `buildSignature(code)` (HMAC-SHA256 base64, raw secret), `exchangeCode(payload)` (single POST, timeout, `mapUpstreamError → 'used'|'expired'|'invalid'`), `readTokenTenantId(accessToken)` (decode only the plaintext JWT payload `tenantId`), `fetchIds(accessToken)` (`GET /myself` → `{ userId: id, personId }`). Pure/injectable enough to unit-test; upstream error map tested against recorded bodies.
- `lib/server/session.ts` — **create** (`import "server-only"`). `SessionData` type; `sealSession(data) → Set-Cookie`, `getSession()`, `requireSession()` (redirect to `/launch-error?reason=expired` when absent/unsealable), `clearSessionCookie()`. Cookie name `__Host-pp_s`, the exact attributes, and the iron-session password map `{ 2: SESSION_SECRET, 1: SESSION_SECRET_PREVIOUS? }` (highest id seals; all accepted for unseal).
- `lib/server/cache-headers.ts` — **create.** `applyNoStore(headers)` / `NO_STORE_HEADERS` setting `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie`.
- `app/launch/route.ts` — **create** (`export const dynamic = "force-dynamic"`). GET handler orchestrating clear-first → decrypt → app-id → exchange → tenant → ids → seal → 303 `/launch/verify?tab=`; each failure → 303 `/launch-error?reason=`; `PP_DISABLED`/`config` guards; no-store headers; PHI-free logging.
- `app/launch/verify/route.ts` — **create.** GET: unseal cookie → 303 `/?tab=` or 303 `/launch-error?reason=cookies`; no-store headers.
- `app/launch/dev/page.tsx` — **create.** Dev-only payload form; `notFound()` unless `APP_ENV==="dev"`.
- `app/launch-error/page.tsx` — **create.** Server component mapping `reason` → the message-catalog entry, rendering the full-page card; delegates the framed-aware action to a small client component.
- `app/launch-error/return-action.tsx` — **create** (`"use client"`). Framed detection (`window.self !== window.top`) choosing new-tab vs same-tab navigation for "Return to 1health"; always new-tab for `cookies`.
- `lib/shared/messages.ts` — **create.** The launch-error copy catalog keyed by reason, with `// DRAFT COPY` markers on the non-locked strings.
- `app/page.tsx` — **modify.** Add a `requireSession()` guard (redirect `reason=expired` when no session); keep `dynamic="force-dynamic"` and the placeholder body for a valid session.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/launch.ts` — implement the crypto, payload validation, single-exchange, upstream-error map, tenant-claim read, and `/myself` id derivation per Boundaries.
- [x] `lib/server/launch.test.ts` — Vitest (node) covering the matrix decrypt/validation rows (malformed, wrong app id), the upstream-error map against recorded `used`/`expired`/other bodies, tenant-claim read, and id mismatch.
- [x] `lib/server/session.ts` — implement the sealed-cookie session + `requireSession()` + rotation password map and exact cookie attributes.
- [x] `lib/server/session.test.ts` — Vitest (node) asserting serialized `Set-Cookie` ≤ 3,800 bytes with the largest fixtures; rotation (unseal under previous secret, always seal under current, reject old once the previous var is removed); attribute string exactness.
- [x] `lib/server/cache-headers.ts` — implement the no-store header helper.
- [x] `app/launch/route.ts` + `app/launch/verify/route.ts` — implement the GET orchestration and verify step with no-store headers and PHI-free logging.
- [x] `app/launch-error/page.tsx` + `app/launch-error/return-action.tsx` + `lib/shared/messages.ts` — implement the reason→copy screen and framed-aware action; unknown/missing reason → `invalid` variant.
- [x] `app/launch/dev/page.tsx` — implement the dev-only form; `notFound()` unless `APP_ENV==="dev"`.
- [x] `app/launch/dev/page.test.tsx` (or route test) — Vitest asserting 404 for `APP_ENV` `demo` and `prod`.
- [x] `proxy.ts` — add the `/`-with-`lpl` → 307 `/launch` redirect without disturbing the Story 1.1 header behavior.
- [x] `app/page.tsx` — add the `requireSession()` guard.
- [x] `e2e/launch.spec.ts` — Playwright (mocked upstream) asserting the full redirect chain lands on `/?tab=contacts#signature` with the fragment intact, `lpl` absent from the final URL and history, and the exchange endpoint called exactly once across an initial load + reload.
- [x] `e2e/headers.spec.ts` — extend to assert the AD-21 header set on `/launch-error`.

**Acceptance Criteria:**
- Given the portal opens `/?lpl=<p>&tab=<t>`, when `proxy.ts` handles it, then it answers 307 to `/launch` with the query preserved and AD-21 headers, and `app/page.tsx` never reads `lpl`.
- Given a valid payload for tenant 1, when `/launch` runs, then it exchanges the code exactly once, derives ids from `/myself` (verifying `id` equals the payload user id), seals `__Host-pp_s` with the exact attributes and fields, and redirects 303 → `/launch/verify?tab=` → 303 `/?tab=`; reloading performs no second exchange.
- Given any decrypt/validation/app-id/exchange/tenant/id failure, when `/launch` runs, then no session cookie is set, no further upstream call is made past the failing step, and the user is sent 303 to the matching `/launch-error?reason=` (`invalid`/`used`/`expired`/`tenant`), with `config` on bad-key and `disabled` on `PP_DISABLED`.
- Given the session cookie, when the chain completes, then no `/launch` or `/launch/verify` body contains a token, all four launch responses carry the no-store trio + AD-21 headers, and a cookie that fails to stick yields `/launch-error?reason=cookies`.
- Given `/` with no session and no `lpl`, when `app/page.tsx` renders, then `requireSession()` redirects to `/launch-error?reason=expired`; there is no `/auth` route or login page.
- Given `/launch-error?reason=<r>`, when it renders, then it shows the full-page card with the reason's copy (unknown/missing → `invalid`), never renders or logs the raw reason, offers no retry, and when framed opens `PORTAL_URL` in a new tab; all copy comes from `lib/shared/messages.ts`.
- Given secret rotation, when a cookie sealed under `SESSION_SECRET_PREVIOUS` is read, then it unseals while that var is set and is rejected once it is removed, and new cookies always seal under `SESSION_SECRET`.
- Given the story is done, when CI runs, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass and the forbidden-pattern step stays green.

## Implementation Notes

- **Crypto verified against the platform source.** `deriveAesKey`/wire-format/`buildSignature`/payload shape confirmed byte-identical to `1h-ng-bo-core-be` (`KeyDerivationUtil`, `JwtFieldEncryptor`, `HmacSha256Util`, `ExternalAppLaunchPayloadBuilder`). Payload fields: `required.apiKey.name`, `required.tenant.id`, `required.user.id`, `required.oneTimeCode.{value,issuedAt}`.
- **Recorded upstream bodies.** The exchange error map keys off the real platform `ErrorMessageDTO` bodies (`{ message, code }`): "…has already been redeemed." → `used`, "…has expired." → `expired`, not-found / invalid-signature / other → `invalid`. The token response is OAuth2 snake_case (`access_token`, `refresh_token`, `expires_in`); `/myself` is `{ id, personId }`.
- **No-store on page surfaces.** Route handlers (`/launch`, `/launch/verify`) set the no-store trio on their own responses from `lib/server/cache-headers.ts`. The page surfaces (`/`, `/launch-error`) cannot set response headers from a server component, so `proxy.ts` applies the same `NO_STORE_HEADERS` (imported from the helper) to an explicit path set — static assets stay cacheable. This is a small addition beyond the Code Map's "redirect only" note for `proxy.ts`, required by the frozen Boundaries "Headers" line.
- **Relative 303s.** `NextResponse.redirect` emits an absolute `Location`; to keep redirects relative + fragment-free (so `#signature` survives), the launch/verify handlers build a plain `Response(null, { status: 303 })` with a relative `Location`.
- **E2E upstream mock.** The exchange + `/myself` are server-side, so Playwright can't intercept them. `instrumentation.ts` installs `test/e2e-upstream-mock.ts` (a global-`fetch` patch over the two 1health endpoints) only when `PP_E2E_MOCK=1` (set in `playwright.config.ts`, never in dev/demo/prod). The mock models the single-use code (second exchange → `used`), which the spec proves via re-launch rather than a cross-process call counter.
- **DRAFT copy.** `tenant` title, `cookies` title/body, and `config`/`disabled` copy are marked `// DRAFT COPY` in `lib/shared/messages.ts` (not locked in EXPERIENCE.md). `invalid`/`expired`/`used` and the `tenant` body are the locked strings.
- **Matrix Test Audit (build verification).** Added orchestration-branch tests (`app/launch/route.test.ts`, `app/launch/verify/route.test.ts`, `lib/shared/messages.test.ts`) covering the matrix rows that the helper unit tests didn't exercise: wrong app-id/tenant/id-mismatch/kill-switch/bad-key/cookie-didn't-stick redirects and the unknown-reason→invalid normalizer. Writing the normalizer test surfaced a **real bug**: `normalizeLaunchErrorReason` used `reason in LAUNCH_ERROR_COPY`, so `?reason=__proto__` (or `constructor`) passed the guard and resolved to `Object.prototype` → a blank error screen instead of the `invalid` fallback. Fixed to `Object.prototype.hasOwnProperty.call(...)` and asserted (`__proto__`/`constructor`/`hasOwnProperty` → `invalid`). Full suite 78 tests green.

## Spec Change Log

- **Human-renegotiated frozen amendment (post-review).** Triggered by the review's null-tenant finding (originally deferred as a spec-refinement question). The user decided: a missing/unparseable token `tenantId` claim maps to `reason=invalid` (a malformed token is an invalid launch, not a wrong account); only a real tenant value other than `1` maps to `reason=tenant`. Amended the frozen Tenant-gate boundary and the I/O matrix (added the "No/unparseable tenant claim → invalid" row), updated `app/launch/route.ts` (`tenantId === null → fail("invalid")` before the `!== 1 → tenant` check), and added route tests for both cases. KEEP: the fail-closed behavior (no cookie, no further upstream on any tenant-gate failure) must survive.

## Review Triage Log

### Iteration 1 — three layers (blind-hunter, edge-case, verification-gap)

**PATCH (auto-fix this iteration):**
- **Proxy `/?lpl=` 307 redirect is not no-store** (edge-case) — `medium`. Verified: the `/`-with-`lpl` branch in `proxy.ts` early-returns `applySecurityHeaders(redirect)` before the `NO_STORE_PATHS` block, so this `/` response (whose `Location` carries the single-use `lpl`) lacks the no-store trio — a direct violation of the frozen "Headers" boundary (`/` responses carry no-store). Mitigated by the lpl being single-use, but still a spec deviation. Fix: apply `NO_STORE_HEADERS` to the redirect. (Code matches the spec → patch, not bad_spec.)
- **Home-page kill-switch / bad-key guards untested** (verification-gap) — `medium`-if-regressed. Verified: `app/page.tsx` guards `PP_DISABLED`→`disabled` and bad-key→`config`, but `app/page.test.tsx` only runs with `PP_DISABLED:false` and a non-throwing `deriveAesKey`; deleting either guard keeps all tests green. Fix: add the two page cases.
- **Launch route null-`/myself` handling untested** (verification-gap) — `medium`-if-regressed. Verified: `fetchIds` can return `null` (unit-tested), but `route.test.ts` only stubs it to an object; if the `!ids` guard regressed, a `/myself` outage would `null.userId`→500 instead of `reason=invalid`. Fix: add a `fetchIds→null → reason=invalid` route case.
- **Route branch coverage: missing-`lpl` and `expired` exchange reason untested** (blind-hunter) — `low`. Verified: `route.test.ts` covers `used` but not the `!lpl→invalid` branch or `ExchangeError(expired)→expired`. (The finding's "config from exchangeCode" is N/A — `exchangeCode` never throws `config`.) Fix: add those two route cases.
- **`ReturnAction` framing/new-tab logic untested** (verification-gap) — `medium`-if-regressed. Verified: no test renders `return-action.tsx`; inverting `newTab = action==="new-tab" || framed` would strand a framed user on a same-tab link. Fix: add a Testing Library render test asserting the anchor `target` for framed/new-tab vs top-level.
- **Nonce-reaches-scripts coverage on `/` lost** (edge-case, low) — `low`. Verified: the headers e2e nonce test moved from `/` to `/launch-error` (since `/` now guards/redirects). The launch e2e already lands on a signed-in `/`; fix: assert the nonce reaches scripts there to restore the real-surface coverage.

**DEFER (future-scoped / not this story's problem):**
- **Home guard accepts an expired access token** (blind-hunter) + **`expires_in` omitted → `expiresIn 0` seals an already-expired token** (blind-hunter + edge-case) — `low` in 1.2 (expiry is never consulted here; refresh is explicitly Story 1.5 per the frozen Boundaries). Defer: Story 1.5 must consult `accessTokenExpiresAt` and reject/replace a non-positive `expires_in`.
- **Sequential 25s + 25s upstream timeouts (~50s worst case)** (blind-hunter) — `low`/`maybe-false`, `medium`-if-true. Could exceed the serverless function limit and never render the error screen, but only if both upstreams hang near their timeout (rare). Settle against the deployed function's `maxDuration`; consider a shared deadline. Defer.

**REJECTED (verified low / spec-mandated / no real harm):**
- **Null/unreadable token tenant → `reason=tenant`** (blind-hunter + edge-case) — `low`. Real but rare (our own TLS exchange returns a valid JWT), and both `tenant` and `invalid` screens dead-end the user back to the portal. The frozen Boundaries + matrix specify `tenantId !== 1 → tenant` (and `null !== 1`), so reclassifying `null`→`invalid` would edit this build's spec → rejected here; surfaced to the user as a possible spec refinement.
- **`mapUpstreamError` brittle English-substring match, ignores status** (blind-hunter) — `low`. `used`/`expired`/`invalid` all render identical copy ("This link has expired"), so a miscategorization has no user-facing effect; only log granularity. Spec required "unit-tested against recorded bodies" (satisfied). Note: key off `ErrorMessageDTO.code` later.
- **`TABS` duplicated in three files** (blind-hunter) — `low`/cosmetic. Three small sets; drift would only re-normalize an unknown tab to `contacts`. Reject.
- **Decrypted `payload.tenantId` validated but unused** (blind-hunter) — `low`. Presence validation is spec-required; the token tenant is authoritative. Reject.
- **Dev page submits `lpl` via GET (in dev history)** (blind-hunter) — `low`. Spec-mandated (`app/launch/dev` uses a GET form); dev-only (404 in demo/prod). Reject.
- **`exchangeCode` uses a status-range check, `fetchIds` uses `res.ok`** (blind-hunter) — `low`/cosmetic. Equivalent. Reject.
- **No-JS / sandboxed-frame `ReturnAction` degradation** (blind-hunter) — `low`. The app requires JS; framing is only knowable client-side. Reject.
- **Launch-error icon/`role="alert"` for non-error variants** (blind-hunter) — `low`. A full-page navigation announces the `<h1>` normally and the icon is `aria-hidden`; `role="alert"` is for dynamic injection. Reject; revisit icon semantics with UX.
- **Launch-error page has no dedicated render test** (verification-gap, noted) — `low`. The reason→copy mapping is covered by `messages.test.ts` + e2e, and the new `ReturnAction` test renders the action. Reject.

## Design Notes

- **Key derivation + signature** (verified byte-identical to the platform `KeyDerivationUtil` / `HmacSha256Util` in `1h-ng-bo-core-be`):
  ```ts
  // AES key: HKDF-SHA256, empty (32-zero) salt, empty info, 32 bytes, IKM = raw secret (utf8)
  const key = hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(32, 0), Buffer.alloc(0), 32)
  // wire = IV(12) ++ ciphertext ++ GCM tag(16)
  const iv = buf.subarray(0, 12), tag = buf.subarray(buf.length - 16), ct = buf.subarray(12, buf.length - 16)
  // exchange signature: base64 HMAC-SHA256 of the code keyed by the RAW (un-derived) secret
  const signature = createHmac("sha256", Buffer.from(secret, "utf8")).update(code, "utf8").digest("base64")
  ```
- **Token endpoint & body:** `POST <API_ORIGIN>/api/v2/public/external-application/auth/oauth2/user/token`, JSON `{ signature, securityCode }`. `/myself` is `GET <API_ORIGIN>/api/v2/user/myself` returning `OneHealthUserDTO` (`id` = userId, `personId` = personId).
- **Tenant claim:** the access token is a JWT whose other identity claims are encrypted; decode only the base64url payload segment and read the plaintext `tenantId` (no signature verification needed — the token came straight from the TLS exchange).
- **Fragment survival:** all redirects are relative and fragment-free; the browser re-applies the original `#signature` to a redirect target that has none, so the fragment survives the chain (asserted in the Playwright spec).
- **`config` vs `invalid`:** a bad/unusable `ONEHEALTH_SECRET_KEY` at request time is `config`; a payload that decodes but fails GCM/validation is `invalid`.
- **External (not this story, owner Daniel Garcia):** per-environment External Application registration pointing at `<APP_ORIGIN>/launch`, real secrets, and `isAllowedForPatients`.

## Verification

**Commands:**
- `corepack pnpm lint` — expected: passes, forbidden-pattern gate clean (no `document.cookie`/`access_token`/secret leakage in client source).
- `corepack pnpm typecheck` — expected: zero errors.
- `corepack pnpm test` — expected: launch + session Vitest suites pass, including the upstream-error map, rotation, and ≤ 3,800-byte cookie assertions; MSW errors on unhandled requests.
- `corepack pnpm build` — expected: production build succeeds.
- `corepack pnpm test:e2e` — expected: the launch redirect-chain spec passes (final `/?tab=contacts#signature`, `lpl` stripped, single exchange) and `/launch-error` carries the AD-21 headers.
