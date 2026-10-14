---
title: 'Story 1.5: Client-coordinated token refresh'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '0e5e153b56c0576342696ffe9c548f46ade2325e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The access token sealed at launch expires, after which the proxy answers `401 TOKEN_EXPIRED` and nothing recovers: every read and save fails until the user relaunches, so work is lost to a silent logout. Several tabs refreshing at once would also race on the same refresh token.

**Approach:** Add `POST /api/session/refresh`, which refreshes the sealed cookie's tokens with the IdP only when the access token is expired or nearly so. Make `callApi` handle `401 TOKEN_EXPIRED` by running one refresh, single-flighted within the tab (shared promise) and across tabs (`navigator.locks`), then replaying each failed call once; if the upstream still rejects the token, run one forced refresh and replay once more before ending the session. No idle logoff (Story 1.6), no dialogs (Story 1.7).

## Boundaries & Constraints

**Always:**
- **Route** `app/api/session/refresh/route.ts` exports only `POST` and `dynamic = "force-dynamic"`; logic lives in `lib/server/refresh.ts` (`handleRefresh(request)`), unit-tested with `fetch` mocked. Pipeline, first match wins: `PP_DISABLED` → 503 `SERVICE_DISABLED` · `checkCsrf(request, { requireBinding: true })` fails → 403 `CSRF` · no or unsealable cookie → 401 `SESSION_EXPIRED` · `verifyBinding(X-PP-Session, sid)` fails → 409 `SESSION_CHANGED` · not forced and `accessTokenExpiresAt - now > 30 s` → 200, no IdP call, no `Set-Cookie` · otherwise call the IdP. **Forced** = the request URL has the query `force=1` exactly (any other value or param is ignored); forcing skips only the still-valid check, never the earlier guards. **Forced-refresh guard (human decision):** a forced request whose session has `refreshedAt` within the last 10 s (`now - refreshedAt < 10_000`) answers 200 with no IdP call and no `Set-Cookie`, exactly like the still-valid path. So concurrent forced refreshes across tabs collapse to one, and a looping client reaches the IdP at most once per 10 s per session.
- **IdP call:** `POST ${API_ORIGIN}/auth/oauth2/token`, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=refresh_token&refresh_token=<stored>&client_id=public-client`, `Accept: application/json`, `cache: "no-store"`, `redirect: "manual"`, 25 s timeout. Exactly one call per refresh.
- **IdP outcomes:**
  - 2xx with a string `access_token` → store the new access token, the new `refresh_token` if it is a string (else keep the old one), and `accessTokenExpiresAt = now + expires_in·1000`; increment `gen`; set `refreshedAt = now` (new optional `SessionData` field, epoch ms; absent until the first refresh); keep `sid`, ids, `iat` and `lastSeen`; re-seal `__Host-pp_s` with `sealSession`; answer 200.
  - 401, or 400 whose JSON `error` is `"invalid_grant"` → `Set-Cookie: clearSessionCookie()`, answer 401 `SESSION_EXPIRED`.
  - Network error, timeout, 3xx, 5xx, any other 4xx, or a 2xx without a string `access_token` → cookie unchanged, answer 503 `REFRESH_UNAVAILABLE`.
- **Responses:** every response carries `NO_STORE_HEADERS` plus `X-Content-Type-Options: nosniff`, with JSON body `{}` on 200 or `{ "code": "<CODE>" }` otherwise. A body never contains a token. An unhandled throw → 500 `{}`, logged with `logError`.
- **Log:** one line per request via a new `logRoute({ requestId, routeTemplate: "/api/session/refresh", status, durationMs })` in `lib/server/log.ts`; never tokens or bodies.
- **Shared skew:** export `ACCESS_TOKEN_SKEW_MS = 30_000` from `lib/server/session.ts`; the proxy and the refresh route both use it.
- **`callApi` on `401 TOKEN_EXPIRED`:**
  - Await `refreshSession()`, one shared in-tab promise (cleared when it settles). Inside, take `navigator.locks.request("pp-refresh", …)` when `navigator.locks` exists, else run directly.
  - It sends `POST /api/session/refresh` with `credentials: "same-origin"` and the registered `X-PP-Session`. The refresh never goes through `callApi`'s own `TOKEN_EXPIRED` handling.
  - Refresh 200 → replay the original request once with the same `path`/`init`. Any replay result other than `TOKEN_EXPIRED` is returned as is, after the usual 1.4 handling.
  - **Upstream-rejected token (decision, review iteration 1):** if that replay returns `TOKEN_EXPIRED` again, run one **forced** refresh (`POST /api/session/refresh?force=1`), single-flighted in its own in-tab slot and taken under the same `pp-refresh` lock. On 200, replay a second and last time. If the second replay is `TOKEN_EXPIRED` → `publish("session-expired")` and resolve `{ success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" }`. A forced-refresh failure is handled exactly like a normal refresh failure (rows below). So a call is replayed at most twice, and the second replay only happens on this path.
  - Refresh `401 SESSION_EXPIRED` → `publish("session-expired")` once; every waiting call resolves that error.
  - Refresh `409 SESSION_CHANGED` → `publish("session-changed")`; every waiting call resolves that error.
  - Refresh `503 REFRESH_UNAVAILABLE` → each waiting call resolves `{ success: false, statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" }` with no event. The next `TOKEN_EXPIRED` starts a new refresh.
  - Any other refresh failure (network error, `CSRF`, `SERVICE_DISABLED`, non-JSON) → waiting calls resolve that error (`NETWORK_ERROR` for a network failure) with no event.
- `callApi` keeps its signature and never throws. Story 1.4 behaviour is otherwise unchanged.

**Never:**
- No token, refresh token or IdP body in any response, log, or client-visible value. The client never learns expiry times.
- No refresh inside the proxy, no proactive or timer-driven refresh, no idle/8 h logoff or `lastSeen` updates (Story 1.6), no dialogs (Story 1.7).
- No refresh from the server component render path. No `fetch` outside `lib/api/client.ts` on the client.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Still valid | token expires in > 30 s | 200 `{}`, no IdP call, no `Set-Cookie` | N/A |
| Refresh ok | token expired / ≤ 30 s; IdP 200 with new tokens | one IdP call (form body, no-store); new cookie with `gen+1`, same `sid`; 200 `{}` with no token in the body | N/A |
| Refresh ok, no new refresh token | IdP 200 without `refresh_token` | old refresh token kept | N/A |
| IdP rejects | IdP 401, or 400 `{error:"invalid_grant"}` | cookie cleared; 401 `SESSION_EXPIRED` | SESSION_EXPIRED |
| IdP down | network error / timeout / 5xx / 3xx / other 4xx / 2xx without `access_token` | cookie unchanged; 503 `REFRESH_UNAVAILABLE` | REFRESH_UNAVAILABLE |
| Kill switch | `PP_DISABLED=1` | 503 `SERVICE_DISABLED`, no IdP call | SERVICE_DISABLED |
| CSRF | cross-site, or no `X-PP-Session` | 403 `CSRF`, no IdP call | CSRF |
| No session | no or bad cookie | 401 `SESSION_EXPIRED`, no IdP call | SESSION_EXPIRED |
| Wrong binding | `X-PP-Session` ≠ HMAC(sid) | 409 `SESSION_CHANGED`, no IdP call | SESSION_CHANGED |
| Headers | any response | no-store trio + `nosniff`; log has only `{requestId, routeTemplate, status, durationMs}` | N/A |
| 10 concurrent | 10 `callApi` calls all hit `TOKEN_EXPIRED` | exactly 1 refresh request; all 10 replay once and succeed | N/A |
| Two tabs | two client instances sharing a mocked `navigator.locks` | exactly 1 upstream refresh (the second sees a valid token) | N/A |
| No locks | `navigator.locks` undefined | in-tab single-flight still gives 1 refresh | N/A |
| Upstream rejects a valid-looking token | replay → `TOKEN_EXPIRED`; forced refresh 200; second replay succeeds | one normal + one forced refresh request; IdP called on the forced one even though the cookie token looks valid; call succeeds, no event | N/A |
| Forced route call | `force=1`, token valid > 30 s, `refreshedAt` absent or ≥ 10 s ago | IdP called once; re-sealed cookie (`gen+1`, new `refreshedAt`) | per IdP outcome |
| Forced within guard | `force=1`, `refreshedAt` < 10 s ago | 200 `{}`, no IdP call, no `Set-Cookie` | N/A |
| Two tabs, forced path | two client instances sharing the mocked `navigator.locks` both get replay → `TOKEN_EXPIRED` at once | exactly 1 upstream (IdP) forced refresh; the second tab's forced request hits the 10 s guard; both calls succeed on the second replay | N/A |
| Replay expires again twice | replay → `TOKEN_EXPIRED`, forced refresh 200, second replay → `TOKEN_EXPIRED` | `session-expired` published once; `SESSION_EXPIRED` returned; no third replay | event |
| Forced refresh fails | forced refresh → `SESSION_EXPIRED` / `REFRESH_UNAVAILABLE` | same handling as a normal refresh failure | per row below |
| Refresh 401 | refresh → `SESSION_EXPIRED` | event once; all waiting calls get the 401 error | event |
| Refresh 503 | refresh → `REFRESH_UNAVAILABLE` | waiting calls get the 503 error, no event; next `TOKEN_EXPIRED` refreshes again | returned |

</frozen-after-approval>

## Code Map

- **KEEP (review iteration 1):** the reverted first implementation is saved at `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/e395d311-9512-401e-9a07-5c196c823228/scratchpad/story-1-5-iter1-keep.patch` (`git apply` from the repo root). It passed every pre-amendment matrix row; reuse it and add only the forced-refresh behaviour. Keep: internal `send()` + single `signal()` publisher in `client.ts`, the lock-failure fallback in `runRefresh`, the FIFO fake-locks two-tab test, and unsealing the `Set-Cookie` in route tests.
- `lib/server/refresh.ts` -- **create**. `handleRefresh(request: Request): Promise<Response>` implementing the pipeline; internal `callIdp(refreshToken)` → `{ kind: "ok", accessToken, refreshToken?, expiresIn? } | { kind: "rejected" } | { kind: "unavailable" }`. Reuse `checkCsrf` (`lib/server/csrf.ts`), `verifyBinding` (`lib/server/session-binding.ts`), `getSession`/`sealSession`/`clearSessionCookie` (`lib/server/session.ts`), `NO_STORE_HEADERS`/`applyNoStore` (`lib/server/cache-headers.ts`), `API_ORIGIN`/`PP_DISABLED` (`lib/server/env.ts`), and `randomUUID` for `requestId`. Mirror the timeout/abort pattern of `fetchIds` in `lib/server/launch.ts`.
- `app/api/session/refresh/route.ts` -- **create**. `export const dynamic = "force-dynamic"`; `export const POST = (req) => handleRefresh(req)`.
- `lib/server/session.ts` -- **edit**: export `ACCESS_TOKEN_SKEW_MS = 30_000`. `lib/server/proxy.ts` -- **edit**: replace the local `TOKEN_SKEW_MS` with the import (no behaviour change).
- `lib/server/log.ts` -- **edit**: add `logRoute`.
- `lib/server/session.ts` -- **edit**: add optional `refreshedAt?: number` to `SessionData` (launch leaves it unset).
- `lib/api/client.ts` -- **edit**: add the internal `refreshSession()` (module-level `inflight: Promise<ApiResponse<never> | { success: true }> | null`; `navigator.locks` guarded by `typeof navigator !== "undefined" && navigator.locks`) and the replay branch in `callApi`. Refactor the existing send/parse body into an internal `send(context, path, init)` so the first attempt, the replay and the refresh share header, credential and error parsing. Keep event publishing in one place so a replayed `SESSION_EXPIRED`/`SESSION_CHANGED` still publishes at most once. Export `__resetClientForTests()` (clears `inflight`) only if tests need it.
- `e2e/headers.spec.ts` -- **extend**: `POST /api/session/refresh` with no CSRF headers → 403 carrying no-store + `nosniff`.
- Tests:
  - `lib/server/refresh.test.ts` (node env; mock `@/lib/server/env`, `next/headers` cookies or `getSession`, and `fetch`) covering every route row of the matrix, incl. the form body, `cache:"no-store"`, `redirect:"manual"`, timeout → 503, `gen+1`/same `sid` in the re-sealed data (unseal the `Set-Cookie`), and no token in any body or log line.
  - `lib/api/client.refresh.test.ts` (jsdom + MSW) for the client rows: 10 concurrent calls, two tabs (`vi.resetModules()` to load two `client` module instances; a fake `navigator.locks` with a shared FIFO mutex; an MSW refresh handler that refreshes only when "expired" and counts upstream refreshes), no locks, replay-expires-again, refresh 401/409/503 and a network failure.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/session.ts`, `lib/server/proxy.ts`, `lib/server/log.ts` -- shared skew constant, `logRoute`.
- [x] `lib/server/refresh.ts` + `app/api/session/refresh/route.ts` -- the refresh pipeline and IdP call.
- [x] `lib/api/client.ts` -- internal `send`, `refreshSession()` single-flight + locks, replay-once on `TOKEN_EXPIRED`.
- [x] `lib/server/refresh.test.ts`, `lib/api/client.refresh.test.ts` -- every matrix row.
- [x] `e2e/headers.spec.ts` -- refresh route header assertion.

**Acceptance Criteria:**
- Given the AD-16 concurrency requirement, when the Vitest + MSW suite fires 10 concurrent `callApi` calls across a simulated expiry, then exactly 1 refresh happens and all 10 succeed on replay; and with two simulated tabs sharing a mocked `navigator.locks`, exactly 1 upstream refresh happens.
- Given the story is done, when CI runs, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass, the forbidden-pattern gate stays clean, and `/api/session/refresh` is dynamic.

## Implementation Notes

- *Iteration 1 notes below describe the reverted first implementation (kept in the saved patch).*

- `callApi` now has an internal `send()` (no event publishing) and a single `signal()` that publishes `session-expired`/`session-changed`; first attempt, replay and refresh all go through `send()`. A refresh failure is copied per waiting caller (`error` text uses the caller's context).
- `runRefresh()` falls back to an unlocked refresh if `navigator.locks.request` itself rejects before running the callback.
- Refresh 2xx is treated as success regardless of body; `expires_in` that is missing, non-numeric, non-finite or ≤ 0 falls back to 300 s.
- Existing Story 1.4 tests updated for the new behaviour: `lib/api/client.test.ts` ("401 TOKEN_EXPIRED is returned unchanged" → now refresh 503 → `REFRESH_UNAVAILABLE`) and `features/shell/use-myself.test.tsx` (revalidation failure now mocks the refresh route). `lib/server/proxy.test.ts`'s session mock now also exports `ACCESS_TOKEN_SKEW_MS`.
- Skew boundary: the proxy treats `expiresAt - now < 30 s` as expired, the refresh route refreshes when `expiresAt - now <= 30 s` (spec: valid only when `> 30 s`). At exactly 30 s the route refreshes; harmless.

## Spec Change Log

- **Iteration 1 follow-up (human decision, before re-approval):** the forced path alone let two tabs each force an IdP call (the lock serializes but does not dedupe), and `force=1` had no rate limit. Amended the frozen block: sealed `refreshedAt`, set on every successful refresh; a forced request within 10 s of it answers 200 with no IdP call. Added matrix rows for the guard (within / after 10 s) and the two-tab forced path (exactly 1 upstream refresh). Avoids duplicate IdP calls and refresh hammering. KEEP: unchanged.

- **Iteration 1 (intent_gap, human decision):** reviewers verified that an upstream 401 on a locally valid token ended the session without trying the refresh token (proxy maps it to `TOKEN_EXPIRED`; route short-circuits as "still valid"; replay → `SESSION_EXPIRED`). The human chose "forced refresh, then log out": the frozen block now adds the `force=1` route flag and a second, forced-refresh replay. Avoids logging out a user whose refresh token is still good. KEEP: see the Code Map's KEEP entry.

## Review Triage Log

### Iteration 1 — three layers (blind-hunter, edge-case, verification-gap)

**INTENT_GAP (loopback to human):**
- **Upstream 401 on a locally-valid token logs the user out** (blind-hunter + verification-gap) — `high`. Verified: `lib/server/proxy.ts` `mapUpstream` turns any upstream 401 into `401 TOKEN_EXPIRED`; `lib/server/refresh.ts` step 5 then answers 200 without the IdP because `accessTokenExpiresAt` is > 30 s away (frozen rule); the replay gets `TOKEN_EXPIRED` again and `callApi` converts it to `SESSION_EXPIRED` + `session-expired`. An early-revoked/rotated access token therefore ends a session whose refresh token is still good. Root cause is inside `<frozen-after-approval>` (and the epic AC), so the human must choose the behaviour.

**PATCH (held until the intent gap is resolved):**
- **Skew boundary differs between proxy (`< 30 s` = expired) and route (`> 30 s` = valid)** (blind-hunter + edge-case) — `low`, direct correction: route treats `>= ACCESS_TOKEN_SKEW_MS` as valid.
- **Numeric-string `expires_in` (`"3600"`) silently falls back to 300 s** (blind-hunter + edge-case) — `low`, direct correction: accept a finite numeric string.
- **Lock-failure fallback in `runRefresh` untested** (verification-gap) — gap, `patch`: two cases (reject before / after the callback).
- **`__resetClientForTests` exported but unused** (blind-hunter) — `low`, direct deletion.

**DEFER:**
- **`client_id=public-client` unverified against the IdP** (blind-hunter) — `maybe-false`, `high` if wrong (every refresh → `SESSION_EXPIRED`). Settle by one real refresh on demo.
- **Concurrent refreshes without `navigator.locks`, or a launch landing mid-refresh, can let a stale `Set-Cookie` (clear or re-seal) overwrite a newer cookie** (blind-hunter + edge-case) — `maybe-false`, `medium` if true; needs IdP rotation/reuse-detection behaviour and a non-Locks browser to matter.
- **`CLAUDE.md` still says "Token refresh is not built yet"** (blind-hunter) — `low`; agent-context file.

**REJECTED:**
- **`lastSeen` not updated on refresh** — `false`: the frozen block keeps `lastSeen`; Story 1.6 owns it.
- **Replay of `ReadableStream` bodies / already-aborted signals** — `low`: Design Notes declare stream bodies unsupported; no caller passes either.
- **No timeout on the cross-tab lock or the client refresh fetch** — `maybe-false`/`low`: the route itself bounds the IdP call at 25 s and browsers release locks of discarded documents; adding timeouts adds branches.
- **Refresh route lacks `X-Request-Id`; refresh failure drops `details`; `expires_in` ≤ 30 s or overflow; missing tests for no-cookie log lines, post-settle second refresh, a non-401 4xx replay, and an e2e happy path** — `low`, not reachable in practice or covered by adjacent tests; fixes add surface.

### Iteration 2 — three layers (blind-hunter, edge-case, verification-gap)

Edge-case and verification-gap hit sandbox `EPERM` on some reads (the spec for edge-case's claims step); the orchestrator had already checked the diff against the spec in step 3, and every finding below was verified against the code directly.

**PATCH:**
- **Skew boundary still disagrees: proxy `< 30 s` = expired, route `> 30 s` = valid** (blind-hunter + edge-case, carried from iteration 1) — `low`. At exactly 30 s the proxy passes the token while the route refreshes it. Fix on the proxy side (the route's `> 30 s` is frozen): proxy treats `<= ACCESS_TOKEN_SKEW_MS` as expired; add a boundary test on both sides.
- **Lock rejecting after its callback ran discards a successful refresh** (blind-hunter + edge-case) — `low`. `runRefresh` returns `NETWORK_ERROR` even when `postRefresh` already succeeded and set the cookie. Direct correction: keep the callback's result and return it when present.
- **Session events from a replay result are unpinned** (verification-gap) — gap, `patch`. No test has a replay return `409 SESSION_CHANGED` / `401 SESSION_EXPIRED`; dropping `signal()` on either replay path passes the suite.

**DEFER:**
- **Proxy tests mock `ACCESS_TOKEN_SKEW_MS`, so proxy/route agreement on the constant is unverified** (verification-gap + blind-hunter) — `low`/`medium`-if-drifted; close when proxy tests next change by importing the real constant.
- carried: `client_id=public-client` unverified; now also noted that an IdP `401 invalid_client` from a wrong client id would be treated as a rejection and clear every cookie (spec-mandated mapping) — settle with one real refresh on demo.
- carried: stale `Set-Cookie` races without `navigator.locks` / relaunch mid-refresh (now also via overlapping normal + forced slots without locks).
- carried: `CLAUDE.md` says refresh is not built yet.

**REJECTED:**
- **Forced refresh skipped within 10 s of a normal IdP refresh → `SESSION_EXPIRED`** (blind-hunter + edge-case) — `false` as a defect: the frozen guard keys on `refreshedAt` set by every successful refresh, by human decision; a token rejected seconds after issue is not fixed by another IdP call.
- **Client publishes `SESSION_EXPIRED` while the cookie still lives** (blind-hunter + edge-case) — `false`: frozen rule (second replay `TOKEN_EXPIRED` → `SESSION_EXPIRED`), epic AC; Story 1.7 owns the dialog/relaunch.
- **IdP 401 treated as rejection** (blind-hunter) — `false`: frozen IdP-outcome mapping; risk folded into the `client_id` defer.
- **`refreshedAt` in the future under instance clock skew** (edge-case) — `low`: NTP-synced instances; worst case the guard lasts a few seconds longer.
- **Missing `refreshToken` in the cookie** (edge-case) — `false`: launch only seals sessions with a string refresh token.
- **`ACCESS_TOKEN_SKEW_MS` living in `session.ts` is fragile under module mocks** (blind-hunter) — `false` as a change request: its location is frozen.
- **In-tab slot cleared on settle → occasional extra no-op refresh POST; no default MSW refresh handler** (blind-hunter) — `low`: the route short-circuits (Design Notes); unmocked requests already fail loudly via `onUnhandledFrame: "error"`.
- carried: no client timeouts, non-replayable bodies/aborted signals, refresh error codes and `details` copied to callers, `expires_in` overflow, missing no-cookie log assertions and e2e happy path.

## Design Notes

- **IdP request shape:** the endpoint, the form encoding and `client_id=public-client` come from the pre-Story-1.1 client `refreshToken()` (`git show 4de30f1^:lib/auth-client.ts`), which refreshed launch-issued tokens against `<origin>/auth/oauth2/token`. This is the best evidence available. If the IdP rejects that client id, the symptom is `SESSION_EXPIRED` on the first refresh.
- **Missing or non-positive `expires_in` on a refresh (deferred from Story 1.2):** the new tokens are still stored, because the IdP may have rotated the refresh token and discarding the response could strand the session. Expiry falls back to `now + 300 s`. A launch that sealed `expires_in = 0` now self-heals: the first call gets `TOKEN_EXPIRED` → refresh.
- **Why "still valid → 200 without the IdP":** with locks, tab B waits while tab A refreshes. B's request then carries A's new cookie, sees a valid token and skips the IdP. That is what makes the two-tab test produce exactly 1 upstream refresh.
- **Replay bodies:** `init` is reused verbatim. Callers send string, `FormData` or `Blob` bodies, which can be resent; a `ReadableStream` body cannot be replayed and is not supported by `callApi`.

## Verification

**Commands:**
- `pnpm lint` -- expected: passes; forbidden-pattern gate clean.
- `pnpm typecheck` -- expected: zero errors.
- `pnpm test` -- expected: all suites pass incl. `refresh.test.ts` and `client.refresh.test.ts`.
- `CI=1 pnpm test:e2e` -- expected: all pass incl. the refresh header assertion.
- `APP_ENV=dev APP_ORIGIN=https://localhost:3100 APP_ID=dummy-app-id ONEHEALTH_SECRET_KEY=dummy-onehealth-secret SESSION_SECRET=dummy-session-secret-0123456789abcdef pnpm build` -- expected: succeeds; `/api/session/refresh` is `ƒ`.
