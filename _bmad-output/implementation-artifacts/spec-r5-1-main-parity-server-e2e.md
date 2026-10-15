---
title: 'R5-1 Main parity recovery: server and e2e'
type: 'bugfix'
created: '2026-10-14'
status: 'done'
baseline_commit: '3d485ab'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/FOUNDATION.md (§1 T1–T8, R1–R11)'
  - '{project-root}/docs/AUTH-ARCHITECTURE.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md (D1–D13, ~L626–680)'
  - 'origin/main (b005536): test/e2e-upstream-mock.ts, instrumentation.ts, e2e/{launch,session-dialogs,headers,shell}.spec.ts, e2e/fixtures.ts, lib/server/{env,refresh,token,launch,logout,proxy}.test.ts'
  - '../1h-ng-bo-core-be/bo-core/src/main/java/com/sirma/bocore/common/Messages.java (EXTERNAL_APPLICATION_SECURITY_CODE_*, INVALID_SIGNATURE)'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `origin/main` (b005536) holds the other team's Epic 1 (Stories 1.1–1.8). Our branch was rebuilt on main keeping our BFF implementation; a parity audit found behaviours and tests of main that were lost: the server-side e2e upstream mock (so no e2e drives a real launch, the real proxy or a real logout), the real exchange-error texts, numeric-string `expires_in` and the narrower "session ends" rule of the refresh grant, two boot checks on the secret keys, the broad `_DEMO`/`_PROD` name gate, fail-closed `/api/token`, the opaque-redirect proxy answer, and a set of unit and e2e assertions.

**Approach:** Restore each lost behaviour on our architecture (no CSRF/binding, D5; sealed session; `lib/server/env.ts` as the only env reader), with tests, and re-add the e2e launch suite against a server-side upstream mock behind `PP_E2E_MOCK=1`. Pre-approved by the human (2026-10-14): write the spec, then implement.

**Human decisions (2026-10-14):**
- (a) A replayed request that hits `TOKEN_EXPIRED` again ends the session (no forced refresh): keep HEAD.
- (b) `/api/token` clears the session cookie on every failure, including 405, 415 and `SERVICE_DISABLED`: keep HEAD.
- (c) Refresh: only an IdP 401 or a 400 with `error: "invalid_grant"` ends the session (401 `SESSION_EXPIRED`, cookie cleared). An IdP 403, any other 400 and a non-JSON 400 are 503 `REFRESH_UNAVAILABLE` with the cookie kept: restore main.

## Boundaries & Constraints

**Always:**
- **E2E upstream mock** `test/e2e-upstream-mock.ts`: patches the server's global `fetch` and answers only the 1health launch exchange (single-use codes: a second exchange of a code → 400 with the recorded "…has already been redeemed." body), `GET /api/v2/user/myself` (`{ id: 42, personId: 4242, firstName: "Ann", lastName: "Lee", username: "ann.lee" }`, the frozen e2e `ANN`) and `POST /auth/user/logout/all-devices` (200). Every exchange issues a distinct access token whose plaintext payload carries `tenantId: 1`; a revoked access token's `myself` answers 401, so e2e can prove the logout revoke reached the platform. Anything else goes to the real `fetch`. Installed from `instrumentation.ts` only when `serverEnv().PP_E2E_MOCK` (exactly `"1"`, read only through `lib/server/env.ts`); `installUpstreamMock()` itself refuses (throws) without the flag. `e2e/server-env.ts` `TEST_SERVER_ENV` sets it. Never set in a deployment.
- **E2E launch fixtures** in `e2e/fixtures/core.ts` (foundation): `makeLpl(code, env)`, `freshCode()`, `launch(page, env)`, with keys and app ids taken from `e2e/server-env.ts` (`E2E_LAUNCH`), so the `_DEMO`/`_PROD` names stay in the allowed files.
- **`e2e/launch.spec.ts`** (fail-fast `test` where the page reads data): demo launch end to end (real `Set-Cookie` attributes, `onehealth_environment=demo`, no `lpl` in URL or history, a reload makes no second exchange, back → stripped `/auth` "Connected to Demo environment. No launch payload detected."), prod launch, an unencoded `+` arriving as a space, a replayed code (5 POSTs, then the error, and the session cleared), manual entry, one unmocked `/api/1h/v2/user/myself` read through the real proxy, logout with a real session (`Max-Age=0` and the revoke proven).
- **Exchange errors** (`classifyExchangeError`): the upstream `message` (JSON `{ message }`, else the raw text) with the quoted code removed: "has already been redeemed." → `used`; "has expired." → `expired`; anything else ("Could not find external application security code: …", "Invalid signature provided.", "…could not be redeemed.") → `rejected`.
- **Refresh** (`refreshSession`): `expires_in` may be a number or a finite numeric string; missing, 0, negative or non-numeric → 300 s; a valid `access_token` is never dropped for a bad `expires_in`; a rotated `refresh_token` is always kept. Decision (c) for the status mapping.
- **Boot** (`parseServerEnv`): a whitespace-only `ONEHEALTH_SECRET_KEY_DEMO`/`_PROD` fails naming the variable; the two keys equal after trim fail naming both variables; values never printed. Whitespace around a non-blank key stays allowed.
- **`check-forbidden.sh`:** the `_DEMO`/`_PROD` rule matches every `[A-Z][A-Z0-9_]*_(DEMO|PROD)` name (so `APP_ID_*` again), outside `lib/server/env.ts`, its test, `test/env-fixture.ts`, `.env.example`, `playwright.config.ts`, `e2e/server-env.ts`, `.github/workflows/ci.yml`; fixture tests.
- **`/api/token` fails closed:** an unexpected throw in the launch or the seal → 502 `LAUNCH_INVALID`, retryable, cookie cleared (decision b), logged without the error text.
- **Proxy:** an opaque redirect (`type: "opaqueredirect"` or status 0) → 502 `UPSTREAM_REDIRECT`; `fetchWithTimeout` returns it instead of throwing.

**Ask First:** none (pre-approved).

**Never:**
- Edit `eslint.config.mjs`, `scripts/check-tokens.sh`, `vitest.config.ts`, `lib/api/**`, `features/**`, `components/**`, `app/globals*`, `CLAUDE.md`, the `package.json` name, `deferred-work.md` (spec R5-2 runs in parallel), or any `_bmad-output` file other than this spec and one Spec Change Log line in spec 7.0a.
- Re-add CSRF, session binding or `SESSION_CHANGED` (D5), or a forced refresh (decision a).
- Let any e2e reach real 1health.
- Lower coverage (100 % on `lib/server`, `lib/api`, `lib/shared`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Code redeemed | upstream 400 `{ message: "External application security code: 'X' has already been redeemed." }` | `used` → 400 `LAUNCH_USED` | — |
| Code expired | `"…: 'X' has expired."` | `expired` → 400 `LAUNCH_EXPIRED` | — |
| Unknown code / bad signature | `"Could not find external application security code: 'X'"`, `"Invalid signature provided."` | `rejected` → 400 `LAUNCH_INVALID` | a code value containing "expired" does not change the result |
| Refresh `expires_in` | `"3600"` / missing / 0 / -5 / `"soon"` | 3600 s / 300 s / 300 s / 300 s / 300 s | — |
| Refresh IdP answer | 401; 400 `invalid_grant` | 401 `SESSION_EXPIRED`, cookie cleared | — |
| Refresh IdP answer | 403; 400 other; 400 non-JSON; 5xx; 3xx; timeout | 503 `REFRESH_UNAVAILABLE`, cookie kept | — |
| Boot keys | DEMO `"   "`; DEMO `" k "` + PROD `"k"` | `ServerEnvError` naming the variable(s), no value | — |
| `/api/token` throw | launch or seal throws | 502 `LAUNCH_INVALID`, retryable, cookie cleared | logged by name only |
| Proxy opaque redirect | upstream `type: "opaqueredirect"`, status 0 | 502 `UPSTREAM_REDIRECT`, no-store | — |
| Mock without flag | `installUpstreamMock()` with `PP_E2E_MOCK` unset | throws; `register()` leaves `fetch` untouched | — |

</frozen-after-approval>

## Code Map

- `test/e2e-upstream-mock.ts` (+ test) -- server-side upstream mock.
- `instrumentation.ts` (+ test), `lib/server/env.ts` (+ test) -- `PP_E2E_MOCK` flag, key boot checks.
- `e2e/server-env.ts`, `e2e/fixtures/core.ts`, `e2e/launch.spec.ts`, `e2e/headers.spec.ts`, `e2e/shell.spec.ts`, `e2e/auth.spec.ts` -- e2e.
- `lib/server/launch/{exchange,token-handler}.ts` (+ tests, `launch.test.ts`) -- exchange texts, fail-closed launch.
- `lib/server/session/refresh.ts` (+ tests, `session-routes.test.ts`) -- refresh mapping and `expires_in`.
- `lib/server/http/fetch-with-timeout.ts`, `lib/server/proxy/forward.ts` (+ tests) -- opaque redirect.
- `scripts/check-forbidden.sh` (+ test) -- `_DEMO`/`_PROD` name gate.
- `instrumentation-client.ts` -- `z.config({ jitless: true })` (see Implementation Notes).
- `docs/AUTH-ARCHITECTURE.md`, `.env.example` -- refresh mapping, exchange texts, fail-closed launch, `PP_E2E_MOCK`.
- `app/auth/page.test.tsx`, `app/api/**/route.test.ts` -- `force-dynamic` rows.

## Tasks & Acceptance

**Execution:**
- [x] Upstream mock + flag + instrumentation + guard tests; `PP_E2E_MOCK` in `TEST_SERVER_ENV`.
- [x] `makeLpl`/`freshCode`/`launch` in `e2e/fixtures/core.ts`; `e2e/launch.spec.ts`.
- [x] `classifyExchangeError` on the real texts, exact-string tests.
- [x] Refresh `expires_in` + decision (c), main's rows ported.
- [x] Boot key checks + tests; broad `_DEMO`/`_PROD` gate + tests.
- [x] `/api/token` fail-closed catch + injected-throw test.
- [x] Proxy opaque redirect + test.
- [x] Unit gaps: `force-dynamic` on token/refresh/logout/1h/auth; `app/auth/page.test.tsx`; non-string `lpl` and JSON array rows; no warning when the padded key itself decrypts; 5xx activity re-seal row; unsealable-cookie rows for logout and refresh.
- [x] E2E gaps: 360 px 16 px gutters and 44 px widths; CSP violation + `pageerror` listener on signed-in `/`; AD-21 + no-store on `POST /api/token` 400 and 415; Pragma on proxy errors; Choose Environment → Production; `/auth` Cache-Control; `headers.spec.ts` signed-in tests under the fail-fast `test` with `mockProfileDefaults`.
- [x] One Spec Change Log line in spec 7.0a correcting "the server-side exchange cannot be mocked".

**Acceptance Criteria:**
- Given the e2e server, when any e2e runs, then no request reaches real 1health (the mock answers the launch, `myself` and revoke; the browser fail-fast guard answers the rest).
- Given a production build without `PP_E2E_MOCK=1`, when the server boots, then `fetch` is not patched.
- Given every gate (install, lint, typecheck, `vitest run --coverage`, `PP_E2E_PORT=3250 test:e2e` twice, build, `check-forbidden.sh`), when run, then all pass.

## Verification

**Commands:**
- `corepack pnpm install && corepack pnpm lint && corepack pnpm typecheck` -- expected: clean.
- `corepack pnpm vitest run --coverage` -- expected: all pass, 100 % on the covered trees.
- `PP_E2E_PORT=3250 corepack pnpm test:e2e` (twice) -- expected: all pass both times.
- `corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: OK.

## Spec Change Log

- 2026-10-14 -- Implementation: the e2e upstream mock fails closed instead of delegating "anything else" to the real `fetch` for the two 1health roots (599 `E2E_UNMOCKED`, logged to stderr); other hosts still pass through. This enforces "no e2e ever reaches real 1health" at the server too. No e2e run logged an unmocked call.
- 2026-10-14 -- Implementation: added `instrumentation-client.ts` (`z.config({ jitless: true })`); the new runtime CSP assertion on signed-in `/` found zod 4's `new Function("")` probe reported as a `script-src (eval)` violation.

- 2026-10-14 -- Review: deferred to `deferred-work.md` (Foundation): throws after the exchange/seal answer 502 but do not revoke the issued tokens (the matrix row "launch or seal throws" reads as covering a revoke; it does not, only the over-budget seal revokes); mock root matching by origin; status-0 breadth of `isOpaqueRedirect`; uncapped refresh 400 body read; per-bearer mock revoke (intentional for parallel runs); local `reuseExistingServer`; structural selectors in the 360 px shell test.

## Implementation Notes

- **Review fixes (2026-10-14).**
  1. Mock boot guard: with `PP_E2E_MOCK=1`, `parseServerEnv` fails when any of `ONEHEALTH_SECRET_KEY_DEMO/_PROD`, `APP_ID_DEMO/_PROD` lacks the `e2e-` prefix (one issue per variable, name only); `installUpstreamMock(env = serverEnv())` re-checks and throws naming the variables. `E2E_MOCK_ENV` in `test/env-fixture.ts`; tests in `env.test.ts`, `instrumentation.test.ts`, `e2e-upstream-mock.test.ts`.
  2. `expires_in`: one helper, `lib/server/session/expires-in.ts` (`parseExpiresIn`, `expiresInSchema`; `EXPIRY_SKEW_MS` moved there and re-exported by `refresh.ts`), used by the refresh `tokenResponseSchema` and the exchange `tokenSchema`: a finite number or a plain decimal string in (30, 86 400] s, else 300 s; tokens never dropped (an exchange with a bad `expires_in` now launches instead of failing 502). Rows: `"1e13"`, `1e308`, `10`, `30`, `"0x10"`, `86401` → 300 s; `"3600"`, `" 3600 "`, `31`, `86400`, `"86400"` honoured; the exchange table in `launch.test.ts`.
  3. `/api/token`: the whole handler body (env read, PP_DISABLED, content type, `readLpl`, launch, seal) runs inside the fail-closed try → any throw is 502 `LAUNCH_INVALID`, retryable, cookie cleared (D15). Rows: throwing env getter, throwing body getter.
  4. `secretKey()`: `min(1, { abort: true })`, so an empty key reports only "is required" (one message, one variable). Row added.
  5. `e2e/launch.spec.ts`: CSP violations are reported through an exposed binding (survives navigations, records the path), asserted before the reload (covering `/auth`, the launch and the hand-off), after the reload and after Back; page errors likewise; the reporter's wiring is asserted.

- **Mock (task 1).** `test/e2e-upstream-mock.ts` patches `fetch` from `instrumentation.ts` only when `serverEnv().PP_E2E_MOCK` (exact `"1"`); `installUpstreamMock()` itself throws without the flag; `uninstallUpstreamMock()` is the test hook. Single-use codes (replay → the backend's "has already been redeemed." 400), a distinct tenant-1 access token per exchange, `myself` = frozen `ANN` (42/4242 Ann Lee), revoke records the Bearer and a revoked token's `myself` answers 401 (how the logout e2e proves the revoke: a replayed old cookie then gets 401 `TOKEN_EXPIRED` through the real proxy). Unit tests: `test/e2e-upstream-mock.test.ts`, `instrumentation.test.ts` (flag `"0"`/`"true"`/`""` leave `fetch` untouched).
- **E2E fixtures.** `makeLpl`/`freshCode`/`launch` live in `e2e/fixtures/core.ts`; the keys and app ids come from `E2E_LAUNCH` in `e2e/server-env.ts`, so no `_DEMO`/`_PROD` name leaves the allowed files. `e2e/launch.spec.ts` (fail-fast `test` + `mockProfileDefaults` for every case): demo end to end (exact `Set-Cookie` strings of both cookies, cookie attributes, no `lpl`, reload = no second POST, CSP violations and page errors, back → stripped `/auth` "Connected to Demo…"), prod, raw `+`, replayed code (5 POSTs → error → cookie gone → `/` redirects), manual entry (padded paste), the real proxy `myself` via `page.request`, real logout (`Max-Age=0`, no-store, revoke proven).
- **Exchange texts (task 2).** `classifyExchangeError` reads `message` from a JSON body (else the raw text), drops the quoted code and matches the ending: "has already been redeemed." → used, "has expired." → expired, else rejected. Rows use the exact `Messages.java` strings.
- **Refresh (task 3, decision c).** `expires_in`: number or finite numeric string, positive, else `FALLBACK_EXPIRES_IN_S` (300); the tokens are always kept. Only 401 and 400 `invalid_grant` are `rejected`; 403, other 400s, non-JSON 400s, other 4xx → `unavailable` (503, cookie kept). Route rows for both sides plus an unsealable cookie.
- **Boot (task 4).** Whitespace-only `ONEHEALTH_SECRET_KEY_*` → "`<NAME>` must not be blank"; keys equal after trim → one message naming both variables, `variables` lists both (duplicate messages are de-duplicated). `check-forbidden.sh` rule 3 now matches every `[A-Z][A-Z0-9_]*_(DEMO|PROD)` name; `launch.test.ts` reads the prod app id through `getAppId("prod")`; the gate's own test builds the names at runtime.
- **Fail-closed `/api/token` (task 5).** `createTokenHandler({ launch })` seam; any throw from the launch or the success path → 502 `LAUNCH_INVALID`, retryable, cleared cookie, `logError` with the error name only. The over-budget seal keeps its 500 `LAUNCH_CONFIG` + revoke path (a classified failure, review-2 of 7.0a).
- **Opaque redirect (task 6).** `isOpaqueRedirect()` in `fetch-with-timeout.ts`; `fetchWithTimeout` returns such a response unwrapped (a status-0 Response can't be re-wrapped) and `forward` maps it to 502 `UPSTREAM_REDIRECT`.
- **Test gaps (task 7).** `dynamic` rows in the token/refresh/logout/1h route tests; `app/auth/page.test.tsx`; non-string `lpl`, JSON array and `null` rows; padded key that decrypts as stored → no warning; flagged 5xx re-seal row; unsealable-cookie rows for refresh and logout.
- **E2E gaps (task 8).** `shell.spec.ts`: 44 px widths on the per-tab targets and a 360 px test (16 px left/right padding on app bar, tabs, Sections, Jump to; avatar at x = 16; Jump to 44 × 44). `headers.spec.ts`: fail-fast `test` + `mockProfileDefaults` for the signed-in cases, `/auth` no-store, runtime CSP/pageerror on signed-in `/`, `POST /api/token` 400/415 with AD-21 + no-store + cleared cookie, Pragma/nosniff/AD-21 on the proxy error. `auth.spec.ts`: fail-fast `test`, `mockProfileDefaults` instead of a lone `myself` mock, Choose Environment → Production.
- **Gates (2026-10-14/15).** install, lint, typecheck, `vitest run --coverage` (3194 tests, no missing coverage), `PP_E2E_PORT=3250 test:e2e` twice (297 passed, 3 skipped, both runs; no unmocked 1health call logged), build, `check-forbidden.sh`: all green.

## Review Triage Log

| # | Finding | Decision | Where |
|---|---|---|---|
| 1 | The mock could boot next to real launch credentials | Fixed: boot guard on the four credentials + install-time re-check | `lib/server/env.ts`, `test/e2e-upstream-mock.ts` |
| 2 | `expires_in` unbounded (`"1e13"`, `1e308`, below the skew, hex) and the exchange still dropped tokens on a bad value | Fixed: shared `parseExpiresIn` in (skew, 1 day], 300 s fallback | `lib/server/session/expires-in.ts` |
| 3 | `/api/token` throws before the launch (env, content type, body read) reached `guardRoute`'s 500 without clearing the cookie | Fixed: whole body in the fail-closed try | `lib/server/launch/token-handler.ts` |
| 4 | Empty secret key reported twice ("required" + "blank") | Fixed: `abort: true` | `lib/server/env.ts` |
| 5 | CSP/pageerror asserted only after the reload | Fixed: binding-based recording, asserted before and after | `e2e/launch.spec.ts` |
| 6 | Throws after exchange/seal don't revoke issued tokens; matrix wording | Deferred (change log + deferred-work) | — |
| 7 | Mock root matching by prefix, not origin | Deferred | — |
| 8 | `isOpaqueRedirect` treats every status 0 as a redirect | Deferred | — |
| 9 | Refresh 400 body read without a byte cap | Deferred | — |
| 10 | Mock revoke is per Bearer, not all devices | Deferred (intentional for parallel runs) | — |
| 11 | `reuseExistingServer` locally | Deferred | — |
| 12 | Structural selectors in the 360 px shell test | Deferred | — |
