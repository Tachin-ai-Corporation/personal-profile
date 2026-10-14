---
title: 'Story 1.4: callApi transport, SWR keys and useMyself'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '034f3670f27c69d0cc1d2bff0b89be514183942a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Story 1.3 proxy requires `X-PP-Session` on every non-image request, but `callApi` is still a bare `fetch` that sends no binding, never parses error codes, and publishes no session signal. Nothing reads data through SWR, so a real in-app `/api/1h/v2/user/myself` call answers `CSRF` and a session that ended or changed would go unnoticed.

**Approach:** Turn `callApi` (signature kept) into the single browser transport: it guards the path, sends `credentials: "same-origin"` plus the page-embedded `X-PP-Session`, parses error bodies once into `errorCode`/`details`, never throws, and publishes `session-expired`/`session-changed` once per page lifetime on a new `lib/api/session-events.ts`. Add `lib/api/keys.ts`, a shared SWR fetcher, `fetchMyself()` and `useMyself()`, and have the placeholder page show the user's first and last name. No refresh (Story 1.5), no dialogs (Story 1.7).

## Boundaries & Constraints

**Always:**
- `app/page.tsx` (still `force-dynamic`, guards unchanged) computes `computeBinding(session.sid)` and passes it plus `PORTAL_URL` to a client component that registers both with `lib/api/client.ts` (`configureClient`) **before** any child can call `callApi` (synchronously during render, not in an effect). `getPortalUrl()` exposes the URL for later stories.
- `callApi(context, path, init)` resolves `ApiResponse<T> = { success, data?, error?, errorCode?, details?, statusCode? }` and never throws or rejects. It forces `credentials: "same-origin"`, sets `X-PP-Session` to the registered binding (removing any caller-supplied value; omitted when no binding is registered), and defaults `Accept: application/json`.
- Path guard: a `path` that is not a string starting with `/api/` (absolute URLs, `//host`, relative paths) → `{ success: false, errorCode: "BAD_PATH" }`, no network call.
- Non-2xx: read the body once. JSON object → `errorCode` = its string `code`, else its string `errorCode`; `details` = its `details` when present. Non-JSON or empty → `errorCode: undefined`, generic `error`. `statusCode` always set. Empty 2xx → `success: true, data: undefined`; non-JSON 2xx text keeps today's bare-string behaviour.
- Network failure (fetch rejects) → `{ success: false, errorCode: "NETWORK_ERROR" }`, no `statusCode`.
- `401 SESSION_EXPIRED` / `409 SESSION_CHANGED` → `publish("session-expired" | "session-changed")`, then return the error response. `401 TOKEN_EXPIRED` is returned unchanged with no event.
- `lib/api/session-events.ts`: `publish(event)` notifies subscribers only the first time per event per page lifetime; `subscribe(event, cb)` returns an unsubscribe function; a throwing subscriber does not break `callApi` or other subscribers. A test-only reset is allowed.
- `lib/api/keys.ts`: `keys.myself()` = `["pp","myself"]` (readonly tuple). Every SWR key is built here with shape `["pp", resource, ...params]`.
- `lib/api/fetcher.ts`: given a key, runs the matching `lib/api` function; on `success: false` it throws an `ApiError` (an `Error` carrying the `ApiResponse`, incl. `errorCode`/`statusCode`) so SWR surfaces it via `error`/`onError`; it never calls `publish`.
- `lib/api/user.ts`: `fetchMyself()` → `callApi<Myself>("user/fetchMyself", "/api/1h/v2/user/myself")`, mapping the wire body to `Myself = { id, personId, firstName, lastName }` (missing names → `""`). `features/shell/use-myself.ts`: `useMyself()` = `useSWR(keys.myself(), fetcher)` returning typed `{ data, error, isLoading }`; duplicate mounts share one request.
- The placeholder page keeps the "Personal Profile" `h1` and renders `"{firstName} {lastName}"` from `useMyself()` (nothing while loading; a neutral "We couldn't load your name." line on error).
- Lint: `fetch` (bare, `window.`, `globalThis.`, `self.`) is banned in `features/`, `components/`, `lib/api/` except `lib/api/client.ts` and test files; inline array/string/template-literal first arguments to `useSWR`/`useSWRImmutable`/`mutate`/`preload` (incl. `x.mutate(...)`) are banned everywhere. Existing `process.env` and `dangerouslySetInnerHTML` rules stay in force.
- `callApi` never logs response bodies (it may log `context` + status only).

**Never:**
- No token refresh/replay (Story 1.5), no session dialogs or subscribers in the shell (Story 1.7), no error-message mapping (`lib/api/errors.ts`, Story 1.12), no new allowlist entries.
- No module other than `callApi` sets `X-PP-Session`; the fetcher never publishes events. Keep `callApi`'s signature, the Story 1.3 proxy, and Story 1.1/1.2 behaviour unchanged.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | `GET /api/1h/v2/user/myself`, binding registered, 200 JSON | `success: true`, typed data, `statusCode: 200`; request had `X-PP-Session` + same-origin credentials | N/A |
| Empty 2xx | 204 / 200 empty body | `success: true, data: undefined` | N/A |
| Bad path | `https://evil/x`, `//evil/x`, `api/x`, `/foo` | `BAD_PATH`, fetch never called | BAD_PATH |
| Proxy error | 502 `{ code: "UPSTREAM_ERROR" }` | `success: false, statusCode: 502, errorCode: "UPSTREAM_ERROR"`; no event | returned |
| Backend error | 400 `{ errorCode: "INVALID_ENUM_VALUE", details: [...] }` | `errorCode` + `details` set | returned |
| Non-JSON error | 500 `text/html` or empty | `errorCode: undefined`, generic `error` | returned |
| Network failure | fetch rejects | `errorCode: "NETWORK_ERROR"`, no `statusCode`, no throw | returned |
| Session expired | 401 `SESSION_EXPIRED` twice | `session-expired` published once; both calls return the error | event once |
| Session changed | 409 `SESSION_CHANGED` twice | `session-changed` published once | event once |
| Token expired | 401 `TOKEN_EXPIRED` | returned unchanged, no event | returned |
| Caller header | init sets `X-PP-Session: forged` | replaced by the registered binding | N/A |
| SWR failure | `useMyself` gets 502 | hook `error` is `ApiError` with `errorCode: "UPSTREAM_ERROR"`; no extra publish | SWR error |
| SWR dedupe | two components mount `useMyself` | one network request | N/A |

</frozen-after-approval>

## Code Map

- `lib/api/client.ts` -- **rewrite** `callApi` per above; add `configureClient({ sessionBinding, portalUrl })`, `getPortalUrl()`, `ApiError`; extend `ApiResponse` with `errorCode?`/`details?`; keep `ok`/`err` helpers (`err` gains `errorCode`). **Delete `callApiRaw`** (unused; a second transport that bypasses the binding would violate AD-19) and drop it from `lib/api/index.ts`.
- `lib/api/session-events.ts` -- **create**. `SessionEvent = "session-expired" | "session-changed"`, `publish`, `subscribe`, `__resetSessionEventsForTests`.
- `lib/api/keys.ts`, `lib/api/fetcher.ts`, `lib/api/user.ts` -- **create**; re-export from `lib/api/index.ts`. Fetcher dispatches on `key[1]` (`"myself"` → `fetchMyself`); unknown key → throws `ApiError` with `errorCode: "UNKNOWN_KEY"`.
- `features/shell/use-myself.ts` -- **create** (`"use client"`).
- `features/shell/client-config.tsx` -- **create**. `"use client"` component `ClientConfig({ sessionBinding, portalUrl, children })` calling `configureClient` during render, then rendering children.
- `features/shell/myself-name.tsx` -- **create**. Client component rendering the name/error line from `useMyself()`.
- `app/page.tsx` -- **edit**: `const session = await requireSession()`; wrap content in `<ClientConfig sessionBinding={computeBinding(session.sid)} portalUrl={PORTAL_URL}>` and render `<MyselfName />` under the `h1`. `lib/server/session-binding.ts` and `lib/server/env.ts` are reused unchanged.
- `eslint.config.mjs` -- **edit**: add the fetch ban (files block for `features/**`, `components/**`, `lib/api/**`, ignoring `lib/api/client.ts` and `**/*.test.*`) and the SWR-key selectors. Because a later block replaces a rule's options, re-include the `process.env` property restriction wherever `no-restricted-properties` is redefined, and add the SWR selectors to the existing global `no-restricted-syntax` array.
- `test/e2e-upstream-mock.ts` -- **edit**: `/myself` mock also returns `firstName: "Test"`, `lastName: "User"`.
- `e2e/launch.spec.ts` -- **extend** the valid-launch test to expect the text "Test User" (proves the binding round-trips through the real proxy).
- Tests: `lib/api/client.test.ts` (rewrite over the matrix with MSW at `http://localhost:3000`), `lib/api/session-events.test.ts`, `lib/api/keys.test.ts` (shape + an ESLint `Linter`/`ESLint` API check that inline keys and `fetch` in `features/` are reported), `features/shell/use-myself.test.tsx` (Testing Library + MSW: success renders name, 502 `UPSTREAM_ERROR` surfaces `errorCode`, 409 publishes `session-changed` once across a retry, dedupe), `app/page.test.tsx` (still passes; mock `computeBinding` + `PORTAL_URL`).

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/session-events.ts` -- create the once-per-lifetime pub/sub.
- [x] `lib/api/client.ts` + `lib/api/index.ts` -- new `callApi`, `configureClient`, `getPortalUrl`, `ApiError`; remove `callApiRaw`.
- [x] `lib/api/keys.ts`, `lib/api/user.ts`, `lib/api/fetcher.ts` -- keys, `fetchMyself`, shared fetcher.
- [x] `features/shell/client-config.tsx`, `features/shell/use-myself.ts`, `features/shell/myself-name.tsx` -- registration, hook, name line.
- [x] `app/page.tsx` -- embed binding + portal URL, render the name.
- [x] `eslint.config.mjs` -- fetch ban + SWR inline-key ban.
- [x] `test/e2e-upstream-mock.ts`, `e2e/launch.spec.ts` -- names in the mock; assert "Test User".
- [x] Unit tests listed in the Code Map covering every matrix row.

**Acceptance Criteria:**
- Given a valid session, when `/` renders, then the HTML embeds the binding for that cookie's `sid` and the page shows the user's first and last name fetched through the real proxy (e2e).
- Given the lint config, when `fetch(` appears in `features/`, `components/` or `lib/api/` outside `client.ts`, or an inline array key is passed to `useSWR`/`mutate`, then `pnpm lint` fails (asserted by a test using the ESLint API).
- Given the story is done, when CI runs, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass and the forbidden-pattern gate stays clean.

## Implementation Notes

## Spec Change Log

## Review Triage Log

### Iteration 1 — three layers (blind-hunter, edge-case, verification-gap)

**PATCH:**
- **Path guard lets dot segments through** (edge-case + blind-hunter) — `medium`. `isApiPath` only checks `startsWith("/api/")`; `/api/../launch` or `/api/%2e%2e/x` pass and fetch normalizes them to a non-`/api` same-origin route that still receives `X-PP-Session`, defeating the guard's intent. Fix: resolve against a fixed base and require same origin + normalized pathname under `/api/`.
- **`ClientConfig` writes the binding into server module state during SSR** (all three layers) — `low`. `"use client"` components render on the server too, so each request's binding persists in the shared Node module. Harmless today (no SSR `callApi`) but a cross-user footgun; fix is a one-line `typeof window` guard.
- **Failed revalidation replaces a loaded name with the error line** (blind-hunter) — `medium`. SWR keeps `data` alongside `error`; `MyselfName` checks `error` first, so a focus revalidation failing with `TOKEN_EXPIRED` (likely until Story 1.5) hides a good name. Fix: render `data` when present.
- **SWR retries terminal session/4xx errors for the page lifetime** (edge-case + blind-hunter) — `medium`. Default `onErrorRetry` backs off indefinitely on 409 `SESSION_CHANGED`/401 `SESSION_EXPIRED`/403 `CSRF`, hammering the proxy after the session is gone. Fix: `shouldRetryOnError` (SWR 2.5 accepts a function) returns false for 4xx `ApiError`s and statusless `BAD_PATH`/`UNKNOWN_KEY`.
- **Inline-key lint misses `useSWRMutation`/`useSWRSubscription`** (edge-case + blind-hunter) — `low`, direct correction: extend the function list. (Variable-held keys are not statically catchable — not pursued.)
- **Stale `callApiRaw` references in `docs/api/*` and the "(a later story)" note in `lib/server/session-binding.ts`** (all three) — `low`, direct deletion/correction.
- **No deterministic test that `ClientConfig` registers before the first child fetch** (verification-gap) — gap, `patch`. Add `features/shell/client-config.test.tsx` rendering `ClientConfig` around `MyselfName` with no prior `configureClient`.
- **"No trailing space" test can't see a trailing space; both-names-empty branch untested** (verification-gap) — gap, `patch`. Assert exact `textContent`; add an empty-names case.

**DEFER:**
- **`CLAUDE.md` still mentions `callApiRaw`/`authFetch`** (all three) — `low`; agent-context file, defer.
- **An event published before any subscriber is lost forever** (edge-case) — `maybe-false`, `medium` if true. Today a response always arrives after commit, so Story 1.7's effect-time subscription precedes it; settle in Story 1.7 by deciding whether `subscribe` should replay an already-published event.

**REJECTED:**
- **Non-JSON 2xx returned as success** (edge-case) — `false`: spec keeps bare-string 2xx behaviour; the proxy never follows redirects (manual + 502).
- **NaN ids when `/myself` omits them** (edge-case + blind-hunter) — `low`: the upstream always returns ids (launch already requires them) and owner ids go over the wire as `me`; fix adds a new failure branch.
- **Empty names render nothing** (edge-case) — `false`: spec-mandated.
- **401/409 without a code publishes nothing** (edge-case) — `false`: spec pins exact codes; the proxy always sends `{ code }`.
- **Aborts reported as `NETWORK_ERROR`; `no-cors` caller mode** (edge-case + blind-hunter) — `low`: no caller passes a signal or mode; fix adds branches.
- **Binding not cleared when `ClientConfig` unmounts** (edge-case) — `false`: it wraps the whole page and never unmounts before navigation.
- **Fetch ban doesn't cover `app/`, `hooks/`, `contexts/`** (all three) — out of scope by intent: the epic AC names exactly `features/`, `components/`, `lib/api/`.
- **`err()` no longer logs the error object** (edge-case) — `low`, deliberate (no PHI/bodies in logs).
- **Proxy `requestId` dropped** (blind-hunter) — `false`: the proxy error body is only `{ code }` (`lib/server/proxy.ts` `errorResponse`); the id is a header.
- **README tree incomplete; ESLint tests live in `keys.test.ts`; `response.text()` failure branch, `MyselfName`-inside-`ClientConfig` assertion, and a 409 e2e untested** (blind-hunter) — `low`, cosmetic or covered elsewhere (e2e "Test User" proves the wrapper).

## Design Notes

- **Error-code parsing:** the 1health error envelope is not documented (agents.md says it is unconfirmed; the launch mock shows a numeric `code`). So only a **string** `code` or `errorCode` becomes `errorCode`; a numeric `code` is ignored. Story 1.12 owns mapping codes to copy.
- **Registration timing:** SWR starts fetching in a layout effect, and child effects run before parent effects, so `ClientConfig` must call `configureClient` in its render body (an idempotent module-level assignment), not in `useEffect`.
- **Name rendering:** text only via JSX (no `dangerouslySetInnerHTML`); trimmed join so a missing last name doesn't leave a trailing space.

## Verification

**Commands:**
- `corepack pnpm lint` -- expected: passes; forbidden-pattern gate clean.
- `corepack pnpm typecheck` -- expected: zero errors.
- `corepack pnpm test` -- expected: all suites pass incl. new client/session-events/keys/use-myself tests.
- `corepack pnpm test:e2e` -- expected: launch spec sees "Test User"; header spec unchanged and green.
- `corepack pnpm build` -- expected: succeeds; `/` stays dynamic.
