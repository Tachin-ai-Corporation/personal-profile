---
title: '7.0c-1 Idle logoff, activity ping and cross-tab activity (port of main Story 1.6)'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: '369997828a7ff07601223df9cf916977d29499a7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/1-6-idle-logoff-activity-ping-and-cross-tab-activity.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sessions never time out: `iat` and `lastSeen` are written at launch but nothing enforces the 15-minute idle or 8-hour absolute limits, nothing updates `lastSeen`, and there is no idle warning. Main built this as Story 1.6 (commit `b005536`), but on the CSRF / session-binding / session-changed design that D5 removed, so it was not kept in the rebase.

**Approach:** Port main's Story 1.6 behaviour into our architecture exactly as `epics.md` Story 1.6 and main's spec `1-6-idle-logoff-activity-ping-and-cross-tab-activity.md` describe, stripped of every CSRF, `X-PP-Session`, binding and `session-changed` piece. Read main's code with `git show b005536:<path>` (`lib/server/session.ts`, `lib/server/ping.ts`, `app/api/session/ping/route.ts`, `lib/server/proxy.ts`, root `proxy.ts`, `lib/api/activity.ts`, `lib/api/client.ts`, `features/shell/idle-warning.tsx`, `test/fake-broadcast-channel.ts` and their tests). Human-approved deltas: the page-navigation re-seal covers `/account` as well as `/`; an idle timeout while the leave-guard dialog is open closes the guard first (settles the leave as false) before the session-expired dialog.

## Boundaries & Constraints

**Always:**
- Limits in `lib/server/session/session.ts`: `IDLE_TIMEOUT_MS = 15 min`, `ABSOLUTE_TIMEOUT_MS = 8 h`, `isSessionAged(session, now)` (strictly greater). `getSession()`/`requireSession()`/`requirePageSession()` treat an aged session as none; a 401 clears the cookie only when one was sent (`hasSessionCookie`). The 8 h per-seal TTL stays; fix its comment.
- `POST /api/session/ping` (new `createPingHandler` in `session-routes.ts`, route with `guardRoute` and explicit 405s, `BFF_PATHS.sessionPing`): `PP_DISABLED` → 503 `SERVICE_DISABLED`; no/aged session → 401 `SESSION_EXPIRED` (+ clear if a cookie was sent); otherwise re-seal `lastSeen = now` → 204 with `X-PP-Activity-At`, no-store headers, PHI-free log line.
- Proxy (`lib/server/proxy/handler.ts`): after a successful forward, re-seal `lastSeen` and echo `X-PP-Activity-At` only when the request carries `X-PP-Activity: user` and the access token has more than `EXPIRY_SKEW_MS + UPSTREAM_TIMEOUT_MS` left; `X-PP-Activity` is never forwarded upstream.
- Root `proxy.ts`: top-level navigations (GET, `sec-fetch-mode: navigate`, not RSC/prefetch) to `/` or `/account` with a cookie: unsealable or aged → 307 `/auth` clearing the cookie with security + no-store headers; valid → re-seal and rewrite only the `__Host-pp_s` segment of the forwarded `Cookie` header.
- `lib/api/activity.ts` as a `createActivity()` factory + default instance (channel `pp-activity`, payload exactly `{ t }`, keep the max, never re-broadcast received messages, local-only without `BroadcastChannel`); `callApi` sets `X-PP-Activity: user` for non-GET or `userInitiated: true` (`CallApiInit`), strips caller-supplied values otherwise, never on refresh; `send` reads a valid `X-PP-Activity-At` into `noteActivity`.
- `features/shell/idle-warning.tsx` mounted once in `PageFrame` (so `/` and `/account` both get it), fed by `requirePageSession()` (`idleTimeoutSec`, `lastSeen`, `absoluteExpiresAt`, `serverNow`): warning 60 s before the idle deadline, non-dismissable `alertdialog` on `scrim` "You'll be signed out in 1 minute" with "Stay signed in" (pings; focus returns on failure); at `min(idle, absolute)` it closes and publishes `session-expired` (unless a ping is in flight); re-evaluates on tick, activity, `visibilitychange`, `focus`; stops once `session-expired` was published. Copy in `lib/shared/messages.ts` as `IDLE_MESSAGES` marked `// DRAFT COPY`.
- Tests ported from main minus binding/changed rows (session boundaries 14:59/15:00/15:01/8 h+1 s, ping, activity, proxy activity rows, root `proxy.ts` navigate block, client activity rows, idle-warning incl. axe); `test/fake-broadcast-channel.ts`; activity reset in `test/setup-dom.ts`; 100% coverage kept on `lib/**`.

**Never:**
- No CSRF, `Sec-Fetch-Site`, `X-PP-Session`, binding, `session-changed`, `ClientConfig`, `{code}` error bodies (D5; `check-forbidden.sh` enforces).
- No section navigation, disabled screen or other Story 1.8B work (7.0c-2, 7.0c-3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Idle boundary | `lastSeen` 14:59 / 15:01 ago | session valid / treated as none → 401 `SESSION_EXPIRED` + clear | — |
| Absolute cap | `iat` 8 h + 1 s ago, recent `lastSeen` | treated as none | — |
| User call | non-GET or `userInitiated` GET via proxy, token > 55 s left | re-seal `lastSeen`, `X-PP-Activity-At` echoed, header not forwarded | token ≤ 55 s: no re-seal |
| Background call | GET without `userInitiated` | no re-seal; session ages out at 15:01 | — |
| Ping | Stay signed in | 204 + re-seal; dialog closes | 401 → session-expired; 503 when disabled |
| Page navigation | GET `/` or `/account` navigate with valid / aged cookie | re-seal + cookie header rewrite / 307 `/auth` + clear | prefetch/RSC ignored |
| Cross-tab | activity in tab A | tab B's timer extends via `pp-activity` `{t}` | malformed message ignored |
| Guard open at timeout | leave-guard dialog open when idle deadline passes | guard settles false and closes, then session-expired dialog | — |

</frozen-after-approval>

## Code Map

- `lib/server/session/{session,types,session-routes}.ts` -- add limits, `isSessionAged`, `hasSessionCookie`, `renewLastSeen`, `createPingHandler`; payload already has `iat`, `lastSeen`.
- `lib/server/proxy/handler.ts`, `lib/server/proxy/forward.ts` -- activity re-seal + echo; `forward` already strips non-allowlisted headers.
- `lib/server/session/refresh.ts` (`EXPIRY_SKEW_MS`), `lib/server/http/fetch-with-timeout.ts` (`UPSTREAM_TIMEOUT_MS`) -- reuse the constants.
- `proxy.ts` (root) -- currently sync and headers-only; becomes async with the navigation re-seal.
- `lib/server/page-session.ts` -- extend the context with idle data.
- `lib/api/{client,index}.ts`, `lib/shared/bff-contract.ts` -- `CallApiInit`, activity header, echo read, `BFF_PATHS.sessionPing`.
- `features/shell/{page-frame,leave-guard,index}.tsx` -- mount `IdleWarning`; guard listens for the idle timeout path (it already closes on `session-expired`).
- `test/setup-dom.ts` -- reset activity.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/session/*` (+tests) -- limits, aged handling, ping handler, `renewLastSeen`.
- [x] `app/api/session/ping/route.ts` + `lib/shared/bff-contract.ts` (+route test) -- ping route.
- [x] `lib/server/proxy/handler.ts` (+tests) -- activity re-seal and echo.
- [x] `proxy.ts` (+`proxy.test.ts`) -- navigation re-seal / expiry redirect for `/` and `/account`.
- [x] `lib/api/activity.ts`, `lib/api/client.ts`, `lib/api/index.ts` (+tests) -- activity bus and client header rules.
- [x] `lib/server/page-session.ts`, `features/shell/{idle-warning,page-frame,leave-guard,index}.tsx`, `lib/shared/messages.ts` (+tests incl. axe) -- idle warning.
- [x] `test/fake-broadcast-channel.ts`, `test/setup-dom.ts` -- test support.
- [x] `e2e/shell.spec.ts` -- idle warning appears and Stay signed in pings (fake clock).

**Acceptance Criteria:**
- Given two tabs, when the user works in one, then the other tab's idle warning does not fire early.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Design Notes

Main's open risk carries over: every non-GET counts as user activity, so a future POST-based read polled by SWR would keep sessions alive; such reads must not be added without `userInitiated: false` semantics. Factory-style `createActivity()` matches `createSessionEvents()` and keeps tests isolated.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, 100% on `lib/**`
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

- `getSession(request, now)` and `requireSession(now)` / `requirePageSession(now)` take the clock (default `Date.now()`) so the handlers' injected `now` also drives the aging check. The shared `sessionExpiredResponse(request)` (`session-routes.ts`) answers 401 `SESSION_EXPIRED` and clears the cookie only when one was sent; the proxy, refresh and ping all use it.
- Header names and the page idle payload are in `lib/shared/bff-contract.ts` (`ACTIVITY_HEADER`, `ACTIVITY_USER`, `ACTIVITY_AT_HEADER`, `PageIdleTiming`), so client and server cannot drift. `requirePageSession()` returns `{ portalUrl, idle }`; `PageFrame` takes a required `idle` prop and mounts `IdleWarning` once.
- Proxy activity re-seal happens for any forwarded upstream answer (including upstream 4xx/5xx mapped errors) but not for an upstream 401 (`TOKEN_EXPIRED`), because the client refreshes and replays. A re-seal that throws (cookie over budget) leaves the upstream answer untouched instead of turning a completed write into a 500. The race guard is `accessExpiresAt − now > EXPIRY_SKEW_MS + UPSTREAM_TIMEOUT_MS` (55 s, strictly greater).
- Root `proxy.ts`: a session-secret misconfiguration during the navigation check is swallowed (no re-seal), so the AD-21 headers are still set and the page's `requireSession()` decides. The 307 is built with `new NextResponse(…, { status: 307 })` because `NextResponse.redirect` is lint-banned.
- `createActivity()` opens the `pp-activity` channel lazily (on `note`, `subscribe` or `lastAt`). `test/setup-dom.ts` resets the default instance before and after every client test.
- The guard-open-at-timeout delta needed no leave-guard change: `IdleWarning` publishes `session-expired`, which `LeaveGuard` already settles as `false`. A page-frame test in `idle-warning.test.tsx` covers the order.
- Logout unseals the cookie without the age check, so an idle- or absolute-expired session's tokens are still revoked upstream.
- Race guard everywhere `lastSeen` is re-sealed (`canRenewLastSeen`, 55 s): the proxy skips the re-seal, the ping answers 401 `TOKEN_EXPIRED` (the client refreshes and replays), and the page-navigation re-seal is skipped (the request still passes through). A ping whose re-seal exceeds the cookie budget answers 401 `SESSION_EXPIRED` with the cookie cleared.
- Client: GET/HEAD/OPTIONS are never activity unless `userInitiated`. `recordUserActivity()` (`lib/api/session.ts`) pings; it is called by "Stay signed in", LoadError Retry and `navigate()` page/tab moves (not exits), so reading and switching pages counts as activity.
- Idle warning: client deadlines run `IDLE_SAFETY_MARGIN_MS` (30 s) ahead of the server's (mount-time offset ignores render/hydration latency and cached RSC payloads), so the warning shows at 13:30 and expiry at 14:30 of server idle time. The ping is aborted after 10 s; a 204 without a usable echo notes the ping's start time; an unmounted component does nothing after a pending ping; while pending, the button is `aria-disabled` (focus stays) and a visually hidden status announces it.
- e2e: Playwright's clock is per browser context, so the two-tab test shares one clock across both pages.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-14; Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Finding | Verdict | Route |
|---|---|---|---|
| 1 | Logout skips upstream revoke for aged sessions (main revoked them) | medium | patch |
| 2 | Ping / navigation re-seal can overwrite rotated tokens (no race guard) | high | patch (shared `canRenewLastSeen`; ping → 401 TOKEN_EXPIRED in window) |
| 3 | Ping over cookie budget → 500 forever | low | patch (401 + clear) |
| 4 | IdleWarning stale evaluate after unmount | medium | patch |
| 5 | Ping that never settles disables expiry | medium | patch (10 s abort) |
| 6 | Client deadlines late (hydration latency / cached RSC) | medium | patch (30 s safety margin) |
| 7 | Pending ping not announced, focus lost | low | patch |
| 8 | HEAD/OPTIONS counted as activity | low | patch |
| 9 | `userInitiated` unused; Retry and page moves not activity | medium | patch (`recordUserActivity`) |
| 10 | Real-clock tests break after 2027-01-15 | medium | patch |
| 11 | Missing tests: echo absent/malformed, HEAD /, trailing slash | low | patch |
| 12 | Flaky dark-mode contrast e2e | low | patch |
| 13 | No warning before the 8 h absolute limit | low | reject (Story 1.6 defines it) |
| 14 | Cross-tab channel not session-scoped | false | reject (one cookie per origin → one session for all tabs) |
| 15 | Activity in the 31–55 s window dropped | low | reject (rare; next call refreshes) |
| 16 | Dialog lacks body text / countdown / sign-out option | low | reject (Story 1.6 copy; DRAFT for PM) |
| 17 | Cross-site ping SameSite test in a real browser | low | reject (D5 accepted, Lax documented) |

