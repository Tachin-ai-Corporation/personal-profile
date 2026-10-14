---
title: 'Story 1.6: Idle logoff, activity ping and cross-tab activity'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ddf6fc92c03247cfcc2ab9110771827995931307'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A sealed session lives as long as its refresh token, so an unattended or shared device keeps the user signed in indefinitely. `iat` and `lastSeen` are sealed at launch but never enforced or updated, and the page has no warning before a logoff.

**Approach:** Enforce a 15 min idle limit and an 8 h absolute limit wherever the session is read, clearing the cookie on expiry. Update `lastSeen` only for user-initiated requests: a top-level load of `/`, a new `POST /api/session/ping`, and `callApi` calls flagged `X-PP-Activity: user`. On the client, run an idle timer that shows a one-minute warning with "Stay signed in" and publishes `session-expired` at either deadline. Tabs share activity through `BroadcastChannel("pp-activity")`. No session dialogs or logout (Story 1.7).

## Boundaries & Constraints

**Always:**
- **Limits (`lib/server/session.ts`):** export `IDLE_TIMEOUT_MS = 15·60·1000` and `ABSOLUTE_TIMEOUT_MS = 8·60·60·1000`, plus `isSessionAged(session, now)`, which is true when `now − lastSeen > IDLE_TIMEOUT_MS` or `now − iat > ABSOLUTE_TIMEOUT_MS` (strictly greater). `getSession()` returns `null` for an aged session, exactly as for a missing or unsealable cookie, so `requireSession()`, the proxy, `/api/session/*` and every BFF route treat it as no session.
- **Clearing on expiry:** whenever the proxy, `/api/session/refresh` or `/api/session/ping` answers 401 `SESSION_EXPIRED` because `getSession()` returned `null` and the request carried the session cookie, the response also sends `Set-Cookie: clearSessionCookie()`. `app/page.tsx` keeps redirecting to `/launch-error?reason=expired`. The cookie for `/` is cleared in the root `proxy.ts`, because a server component cannot set cookies.
- **Activity rule (RC6):** `lastSeen` is re-sealed to `now` only for:
  - **`/` load:** in the root `proxy.ts`, a `GET /` with `Sec-Fetch-Mode: navigate` and a session cookie. Aged or unsealable → clear the cookie and 307 to `/launch-error?reason=expired`. Valid → re-seal with `lastSeen = now`, set the cookie on the response and forward the updated cookie in the request headers so the page renders the new `lastSeen`. Prefetch and RSC requests to `/` are not activity. Keep every existing header, nonce, `lpl`-redirect and no-store behaviour.
  - **Ping:** `POST /api/session/ping`.
  - **Proxy:** an `/api/1h` request carrying `X-PP-Activity: user` whose `X-PP-Session` binding verified and that was forwarded upstream (any upstream status). **Race guard:** the proxy re-seals only when `accessTokenExpiresAt − now > ACCESS_TOKEN_SKEW_MS + UPSTREAM_TIMEOUT_MS` (55 s). Otherwise it writes no cookie, so a late proxy `Set-Cookie` can never overwrite tokens that a refresh wrote meanwhile.
  - `X-PP-Activity` is never forwarded upstream, and `/api/session/refresh` never touches `lastSeen`.
- **Activity echo:** every response that re-sealed `lastSeen` (ping, proxy) carries `X-PP-Activity-At: <lastSeen epoch ms>`.
- **Ping route** (`app/api/session/ping/route.ts` → `lib/server/ping.ts`, `POST` only, `dynamic = "force-dynamic"`). Pipeline: `PP_DISABLED` → 503 `SERVICE_DISABLED` · `checkCsrf(…, { requireBinding: true })` → 403 `CSRF` · no, unsealable or aged session → 401 `SESSION_EXPIRED` (cookie cleared if one was sent) · binding mismatch → 409 `SESSION_CHANGED` · otherwise re-seal `lastSeen = now` (everything else unchanged) → 204 + `X-PP-Activity-At`. The token's expiry is irrelevant here. Headers are the no-store trio plus `nosniff`; log via `logRoute`.
- **`callApi`:**
  - Its `init` type becomes `RequestInit & { userInitiated?: boolean }`, and the signature is otherwise unchanged. `userInitiated` is stripped before `fetch`.
  - It sends `X-PP-Activity: user` on every non-GET and on GETs with `userInitiated: true`, and removes any caller-supplied value otherwise. The refresh `POST` never carries it. Replays carry the same header as the original.
  - When a response has a numeric `X-PP-Activity-At`, it calls `noteActivity(t)` in `lib/api/activity.ts`.
  - The SWR fetcher and `fetchMyself` never set `userInitiated`.
- **`lib/api/activity.ts`:**
  - `noteActivity(t)` records `max(current, t)`, notifies local subscribers, and posts `{ t }` to `BroadcastChannel("pp-activity")`. The payload is exactly one numeric key `t`, with no ids or PHI.
  - Incoming channel messages are validated (an object with exactly a finite numeric `t`, else ignored), then recorded and notified but never re-broadcast.
  - It also exposes `subscribeActivity(cb)` (returns an unsubscribe function) and `lastActivityAt()`.
  - If `BroadcastChannel` is unavailable, everything is local only.
- **Page props:** `app/page.tsx` passes `idleTimeoutSec = 900`, `lastSeen`, `absoluteExpiresAt = iat + ABSOLUTE_TIMEOUT_MS` and `serverNow = Date.now()` to `features/shell/idle-warning.tsx`, alongside `sessionBinding`. The client computes `offset = serverNow − Date.now()` once and evaluates every deadline in server time.
- **Idle warning (`features/shell/idle-warning.tsx`):**
  - `lastActivity` is the larger of the page's `lastSeen` and `lastActivityAt()`. At `lastActivity + 14 min` it opens a shadcn `Dialog` with `role="alertdialog"`, showing `IDLE_COPY.title` ("You'll be signed out in 1 minute") and one primary button, `IDLE_COPY.stay` ("Stay signed in"), which has initial focus and a visible focus ring. Escape and outside clicks do not close it; only the button does.
  - "Stay signed in" calls `callApi("session/ping", "/api/session/ping", { method: "POST" })`. Success closes the dialog, and the timer restarts from the echoed `X-PP-Activity-At`. A `SESSION_EXPIRED` result closes it (`callApi` has already published the event). Any other failure leaves it open, with the button enabled again.
  - At `lastActivity + 15 min`, or at `absoluteExpiresAt`, whichever comes first, it closes the dialog and calls `publish("session-expired")`, then stops.
  - Activity from any tab moves the deadlines and closes an open warning.
  - Timers re-evaluate from the clock on each tick, on `visibilitychange` and on `focus`, so throttled background tabs still fire on time.
- **Copy:** `IDLE_COPY` lives in `lib/shared/messages.ts`, marked `// ARCHITECTURE-ADDED COPY — PM review`.
- `publish` gains exactly one more caller: the idle warning (update the `session-events.ts` header comment). `lib/api/index.ts` still does not re-export `publish`.

**Never:**
- No `lastSeen` update from the SWR fetcher, background revalidation, `/api/session/refresh`, prefetch or RSC requests, or a proxy request without a verified binding.
- No ids, tokens or PHI in `pp-activity` messages, `X-PP-Activity-At`, logs or page props beyond the four numbers above.
- No logout route, no session-expired/changed dialogs, no drafts (Stories 1.7 and 1.15). Never extend the 8 h limit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Idle 14:59 | `now − lastSeen = 14:59` | session valid | N/A |
| Idle 15:01 | `now − lastSeen = 15:01` | proxy, refresh and ping → 401 `SESSION_EXPIRED` + cookie cleared; `/` → cookie cleared, 307 to `reason=expired` | SESSION_EXPIRED |
| Absolute 8 h + 1 s | `now − iat = 8 h + 1 s`, `lastSeen` 1 min ago | rejected as above | SESSION_EXPIRED |
| Background only | proxy GETs without `X-PP-Activity` for 15:01 | `lastSeen` never moves; then `SESSION_EXPIRED` | SESSION_EXPIRED |
| Activity GET | proxy GET with `X-PP-Activity: user`, valid binding, token > 55 s | upstream called; response re-seals `lastSeen = now`, echoes `X-PP-Activity-At`; header not forwarded | N/A |
| Activity near token expiry | as above, token 31–55 s from expiry | forwarded; no `Set-Cookie`, no echo | N/A |
| Activity, no binding | `asImage` GET without `X-PP-Session` but with `X-PP-Activity` | no re-seal | N/A |
| `/` navigate | `GET /`, `Sec-Fetch-Mode: navigate`, valid cookie | cookie re-sealed with new `lastSeen`; page props carry it | N/A |
| `/` prefetch/RSC | `GET /` not `navigate` | no re-seal | N/A |
| Ping ok | valid session + binding + same-origin | 204, `lastSeen = now`, `X-PP-Activity-At`, no-store + `nosniff` | N/A |
| Ping guards | `PP_DISABLED` / CSRF / no or aged session / wrong binding | 503 / 403 / 401 (+ clear) / 409 | per code |
| Refresh not activity | refresh succeeds | `lastSeen` unchanged | N/A |
| `callApi` header | POST; GET `userInitiated`; plain GET; refresh POST | header / header / none / none; `userInitiated` not passed to `fetch` | N/A |
| Echo → activity | response with `X-PP-Activity-At: t` | `noteActivity(t)`; channel posts exactly `{ t }` | N/A |
| Bad channel message | `{ t: "x" }`, `{ t: 1, id: 2 }`, `null` | ignored | N/A |
| Warning | 14 min since `lastActivity` | alertdialog with copy; "Stay signed in" focused | N/A |
| Stay ok | ping 204 | dialog closes; timer restarts | N/A |
| Stay expired | ping 401 `SESSION_EXPIRED` | dialog closes; `session-expired` published once | event |
| Stay network error | ping `NETWORK_ERROR` | dialog stays open; button enabled | N/A |
| Idle deadline | no action until 15 min | dialog closes; `session-expired` published | event |
| Absolute deadline | `absoluteExpiresAt` reached while active | `session-expired` published | event |
| Other tab active | channel message with a newer `t` | deadlines move; open warning closes | N/A |

</frozen-after-approval>

## Code Map

- `lib/server/session.ts` -- **edit**: `IDLE_TIMEOUT_MS`, `ABSOLUTE_TIMEOUT_MS`, `isSessionAged`; `getSession()` returns `null` when aged. Add a small `hasSessionCookie()` (reads `cookies()`) or let callers check `request.cookies`, so routes clear only when a cookie was sent.
- `lib/server/proxy.ts` -- **edit**: export `UPSTREAM_TIMEOUT_MS` (or move it next to `ACCESS_TOKEN_SKEW_MS` in `session.ts`); on `SESSION_EXPIRED` from a null session add the clear `Set-Cookie`; after forwarding, re-seal for verified-binding `X-PP-Activity: user` requests under the 55 s guard and add `X-PP-Activity-At`. `X-PP-Activity` is already outside `FORWARDED_REQUEST_HEADERS`; keep it so.
- `lib/server/refresh.ts` -- **edit**: add the clear `Set-Cookie` on the null-session 401 (aged sessions now land there). No `lastSeen` change.
- `lib/server/ping.ts` + `app/api/session/ping/route.ts` -- **create**, mirroring `lib/server/refresh.ts` (`baseHeaders`, `json`/`errorResponse`, `logRoute`, `logError`, `randomUUID`).
- `proxy.ts` (root) -- **edit**: make `proxy` async; add the `/` navigate branch (unseal with `unsealSession` from the request cookie `SESSION_COOKIE_NAME`, `isSessionAged`, `sealSession`). Forward the new cookie by rewriting the request `cookie` header. Keep all AD-21 headers and no-store on every branch, including the new 307.
- `app/page.tsx` -- **edit**: pass `idleTimeoutSec`, `lastSeen`, `absoluteExpiresAt`, `serverNow` and render `<IdleWarning … />` inside `ClientConfig`.
- `lib/api/client.ts` -- **edit**: `userInitiated` handling and the `X-PP-Activity` header in `send()`, which reads `X-PP-Activity-At` and calls `noteActivity`. `postRefresh` must not send the activity header.
- `lib/api/activity.ts` -- **create**; `lib/api/session-events.ts` -- comment only; `lib/api/index.ts` -- re-export `subscribeActivity`, `lastActivityAt`.
- `features/shell/idle-warning.tsx` -- **create** (`"use client"`), using `components/ui/dialog.tsx` (`DialogContent` with `showCloseButton={false}`, `role="alertdialog"`, `onEscapeKeyDown`/`onPointerDownOutside`/`onInteractOutside` → `preventDefault`) and `components/ui/button.tsx`.
- `lib/shared/messages.ts` -- **edit**: `IDLE_COPY`.
- `package.json` -- **add devDependency** `axe-core` (exact version published at least 2 weeks ago; respect `pnpm-workspace.yaml`) for the component axe check.
- Tests:
  - `lib/server/session.test.ts` (boundaries: 14:59, 15:00, 15:01, 8 h + 1 s);
  - `lib/server/ping.test.ts` (every ping row, headers, log shape);
  - `lib/server/proxy.test.ts` (activity re-seal, guard, no binding, aged → clear, background-only 15:01, header not forwarded);
  - `lib/server/refresh.test.ts` (aged → clear, `lastSeen` unchanged);
  - root `proxy.test.ts` (`/` navigate valid/aged/prefetch; existing behaviour intact);
  - `lib/api/client.test.ts` (header rules, `userInitiated` stripped, echo → `noteActivity`);
  - `lib/api/activity.test.ts` (payload shape `{ t }` exactly, validation, no re-broadcast, max semantics, using a fake `BroadcastChannel`);
  - `features/shell/idle-warning.test.tsx` (fake timers + MSW: 14 min warning, focus, Stay ok/expired/network error, idle deadline, absolute deadline, cross-tab activity, and an `axe-core` run with zero violations);
  - `app/page.test.tsx` (new props);
  - `e2e/headers.spec.ts` (ping without CSRF → 403 with no-store + `nosniff`).

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/session.ts`, `lib/server/proxy.ts`, `lib/server/refresh.ts` -- limits, aged → null, clear on expiry, proxy activity re-seal + guard + echo.
- [x] `lib/server/ping.ts`, `app/api/session/ping/route.ts` -- ping route.
- [x] `proxy.ts` (root) -- `/` navigate activity + aged redirect.
- [x] `lib/api/activity.ts`, `lib/api/client.ts`, `lib/api/index.ts`, `lib/api/session-events.ts` -- activity header, echo, channel.
- [x] `lib/shared/messages.ts`, `features/shell/idle-warning.tsx`, `app/page.tsx` -- warning UI and props.
- [x] `package.json` -- `axe-core` devDependency.
- [x] Tests listed in the Code Map, covering every matrix row.

**Acceptance Criteria:**
- Given the unit suite, when it runs, then idle 14:59 passes, idle 15:01 and absolute 8 h + 1 s are rejected with the cookie cleared, and 15 min of non-activity proxy GETs alone expire the session.
- Given the idle warning component test, when axe-core runs on the open dialog, then it reports zero violations and "Stay signed in" has focus.
- Given the story is done, when CI runs, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass and the forbidden-pattern gate stays clean.

## Implementation Notes

## Spec Change Log

## Review Triage Log

### Iteration 1 — three layers (blind-hunter, edge-case, verification-gap)

**PATCH:**
- **Idle warning ignores session events** (blind-hunter + edge-case + verification-gap) — `medium`. A ping `409 SESSION_CHANGED` falls into "any other failure" (dialog stays open, timer keeps running, later publishes `session-expired` on top of `session-changed`), and a `session-expired`/`session-changed` published by any other `callApi` call leaves the timer able to open the warning over an ended session. Fix: subscribe to both events and stop (close, clear timers, never publish afterwards).
- **Idle deadline passing while the "Stay signed in" ping is in flight publishes `session-expired` although the server accepted the ping** (edge-case) — `low`. Fix: while the ping is pending, defer the deadline decision until it resolves, then re-evaluate.
- **The 401-ping test can't see the dialog reopening** (verification-gap) — gap: after `settle()`, advance 30 s and assert the dialog stays closed.
- **Root `proxy.ts` re-serializes every cookie from decoded values** (edge-case) — `low`: `request.cookies.getAll()` decodes values, so other cookies (e.g. Vercel's) could be altered. Direct correction: replace only the `__Host-pp_s` segment in the raw `cookie` header.
- **Stale or contradictory comments** (blind-hunter) — `low`: `lib/api/index.ts` still says only `callApi` publishes; the `session-events.ts` header contradicts itself; `readServerClock` claims it runs outside render; a Story 1.12 sentence is stuck to the activity paragraph in `client.ts`.

**DEFER:**
- **A refresh re-seal can roll back a `lastSeen` that concurrent activity just wrote** (blind-hunter) — `low`/`medium`: by at most the refresh's IdP latency (≤ 25 s), so the server can expire up to ~25 s before the client's deadline; the warning still shows first. Needs a merge-on-write design.
- **Every non-GET counts as activity** (blind-hunter) — `false` today (only `GET /myself` is allowlisted; spec- and epic-mandated) but a future POST-based read polled by SWR would keep sessions alive: stories adding POST reads must route them so they aren't activity.
- **Idle/absolute logoff on reload lands on "This link has expired"** (blind-hunter) — `low` UX copy question for PM: `reason=expired` copy is locked and launch-oriented.
- carried (Story 1.5): a forced refresh can still overlap a proxy or ping re-seal (accepted as rare in Design Notes).

**REJECTED:**
- **Ping route has no race guard** — `low`: no upstream call, so its read-to-write window is milliseconds and its `Set-Cookie` lands before a concurrent refresh's; the forced-refresh overlap is carried above.
- **Upstream 401 (`TOKEN_EXPIRED`) response still re-seals** — `false`: the browser applies that `Set-Cookie` before `callApi` even starts the refresh, so it cannot overwrite it.
- **No warning before the 8 h absolute limit / "Stay" can't extend it** — `false` as a defect: the frozen block (and epic AC) publish at the absolute deadline without a warning.
- **Ping 204 without echo reopens the dialog; double-click sends two pings; offset skew from hydration latency or prop changes; HEAD/OPTIONS treated as activity; `requireSession` redirect not clearing on non-navigate `/`; future `t` from a same-origin tab; `isSessionAged` with future timestamps; root proxy seal throwing** — `low` or `false` (real pings always echo; duplicate pings are harmless; skew is sub-second; `callApi` never sends HEAD/OPTIONS; the next navigate/BFF call clears; same-origin tabs run our code; cookies are AEAD-sealed; `sealSession` only fails on a missing secret, which fails boot).
- **Use `AlertDialog` instead of `Dialog`; duplicated header helpers; `bindingVerified` naming; extra e2e coverage** — `low`, cosmetic or covered by unit tests; axe reports zero violations.

## Design Notes

- **Why the proxy race guard:** AD-16 exists to prevent last-write-wins cookie overwrites. A proxy activity re-seal is written when the upstream response returns, up to 25 s after the cookie was read. If a refresh rotated the tokens meanwhile, the proxy's `Set-Cookie` would restore the old tokens and strand the session. A normal refresh happens only when the token is within the 30 s skew. Requiring more than 55 s at request start (30 s skew + 25 s upstream timeout) means no normal refresh can overlap the request. The ping and `/` re-seals make no upstream call, so their read-to-write window is milliseconds. A forced refresh (Story 1.5) can still overlap, which is accepted as rare. The cost: activity within about 55 s of token expiry isn't recorded, and the next user request after the refresh records it.
- **Why `X-PP-Activity-At`:** the client timer follows what the server actually recorded, including the guard skips, instead of guessing from response codes. Deadlines are computed in server time through `serverNow`, which removes client clock skew.
- **Why the `/` check sits in the root `proxy.ts`:** RSC rendering cannot set cookies, and the root interceptor already runs on Node for every request.
- **Why Escape doesn't dismiss the warning:** an `alertdialog` needs an explicit answer. Silently dismissing it would let the 15 min deadline pass unnoticed.

## Verification

**Commands:**
- `pnpm lint` -- expected: passes; forbidden-pattern gate clean.
- `pnpm typecheck` -- expected: zero errors.
- `pnpm test` -- expected: all suites pass, including the new ones.
- `CI=1 pnpm test:e2e` -- expected: all pass, including the ping header assertion and the existing launch flow (a navigate to `/` now re-seals).
- `APP_ENV=dev APP_ORIGIN=https://localhost:3100 APP_ID=dummy-app-id ONEHEALTH_SECRET_KEY=dummy-onehealth-secret SESSION_SECRET=dummy-session-secret-0123456789abcdef pnpm build` -- expected: succeeds; `/api/session/ping` is `ƒ`.
