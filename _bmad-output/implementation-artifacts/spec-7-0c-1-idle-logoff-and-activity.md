---
title: '7.0c-1 Idle logoff, activity ping and cross-tab activity (port of main Story 1.6)'
type: 'feature'
created: '2026-10-14'
status: 'draft'
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
- [ ] `lib/server/session/*` (+tests) -- limits, aged handling, ping handler, `renewLastSeen`.
- [ ] `app/api/session/ping/route.ts` + `lib/shared/bff-contract.ts` (+route test) -- ping route.
- [ ] `lib/server/proxy/handler.ts` (+tests) -- activity re-seal and echo.
- [ ] `proxy.ts` (+`proxy.test.ts`) -- navigation re-seal / expiry redirect for `/` and `/account`.
- [ ] `lib/api/activity.ts`, `lib/api/client.ts`, `lib/api/index.ts` (+tests) -- activity bus and client header rules.
- [ ] `lib/server/page-session.ts`, `features/shell/{idle-warning,page-frame,leave-guard,index}.tsx`, `lib/shared/messages.ts` (+tests incl. axe) -- idle warning.
- [ ] `test/fake-broadcast-channel.ts`, `test/setup-dom.ts` -- test support.
- [ ] `e2e/shell.spec.ts` -- idle warning appears and Stay signed in pings (fake clock).

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

## Spec Change Log

## Review Triage Log
