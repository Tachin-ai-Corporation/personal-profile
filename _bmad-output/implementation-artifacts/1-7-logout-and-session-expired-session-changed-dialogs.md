---
title: 'Story 1.7: Logout and session-expired / session-changed dialogs'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '89245d42dd22ee50db37ec38a531c2aa24f273c4'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `callApi` and the idle warning publish `session-expired` / `session-changed`, but nothing listens, so the page silently stops working. There is also no way to sign out: leaving for 1health keeps the sealed cookie and its tokens alive.

**Approach:** Add the shell's single `SessionDialogs` listener with two non-dismissable dialogs and hook registries for drafts (1.15) and in-memory clearing (2.x), plus `POST /api/session/logout` and the client leave helpers `returnToPortal()` / `requestLeave()` / `useIsFramed()` that the app bar (1.8) and leave guard (1.13) will use.

## Boundaries & Constraints

**Always:**
- **`features/shell/session-dialogs.tsx`** (`"use client"`) is the only module that opens these dialogs. It exports `SessionDialogs({ portalUrl })`, `onBeforeSessionExpired(cb)` and `onSessionChanged(cb)` (each returns an unsubscribe function; callbacks live in module-level sets).
  - **First event wins:** it subscribes to both events; the first one handled sets the dialog kind, and any later event (either kind) is ignored entirely: no callbacks, no cache clear, no second dialog.
  - **`session-expired`:** run every `onBeforeSessionExpired` callback synchronously, each in its own try/catch (log only the error name). Then open "Your session ended" + body + one primary action with initial focus. Not framed: "Return to 1health" is a link to `portalUrl` (same tab; no logout call, no `requestLeave`, no draft deletion). Framed: "Close and reopen from 1health" is a button that does nothing (the dialog stays).
  - **`session-changed`:** run every `onSessionChanged` callback (same isolation), clear the whole SWR cache without revalidating (`useSWRConfig().mutate(() => true, undefined, { revalidate: false })`), run no `onBeforeSessionExpired` callback, then open "This profile was opened by another account in another tab" with a primary "Reload" (`window.location.reload()`).
  - Both dialogs: shadcn `Dialog` + `DialogContent` (`role="alertdialog"`, `showCloseButton={false}`, Escape / pointer-down-outside / interact-outside prevented, `bg-popover`, existing `rounded-lg` + `shadow-lg` (elevation-2) + dimmed overlay), title and body wired to `aria-labelledby`/`aria-describedby`, the button `min-h-11` with the idle warning's visible focus-ring classes. Page content stays mounted behind the overlay.
- **`features/shell/use-is-framed.ts`:** `useIsFramed()` via `useSyncExternalStore` (server snapshot `false`); a throwing `window.top` counts as framed. `app/launch-error/return-action.tsx` reuses it (no behaviour change).
- **`features/shell/leave.ts`:** `requestLeave(): Promise<boolean>` resolves `true` immediately when no guard is set, else returns the guard's result; `setLeaveGuard(fn | null)` sets or clears the single guard. `returnToPortal()`: `await requestLeave()`; if `false`, stop. Otherwise call `callApi("session/logout", "/api/session/logout", { method: "POST" })`, racing it against a 3 s timer (failures ignored), then `window.location.assign(getPortalUrl())` (do nothing when unset). No `returnUrl`/`next` parameter is read anywhere.
- **Logout route** (`app/api/session/logout/route.ts` → `lib/server/logout.ts`, `POST` only, `dynamic = "force-dynamic"`, no-store trio + `nosniff`, `logRoute`). Pipeline:
  1. `checkCsrf(…, { requireBinding: true })` fails → 403 `CSRF`, cookie untouched.
  2. Unseal the raw cookie (`unsealSession`, ignoring idle/absolute age, so an aged session's token is still revoked). If it unsealed and `X-PP-Session` does not verify against its `sid` → 204, no `Set-Cookie`, no revoke (a stale tab never signs out the account now in this browser).
  3. Otherwise → 204 + `Set-Cookie: clearSessionCookie()`, whether or not a session existed.
  4. Revoke after the response (`after()` from `next/server`), only when a session unsealed, its access token has not expired, `PP_DISABLED` is off and `REVOKE_PATH` is non-null: `POST <API_ORIGIN><REVOKE_PATH>` with `Authorization: Bearer <accessToken>`, `cache: "no-store"`, `redirect: "manual"`, aborted at 5 s. `REVOKE_PATH = "/auth/user/logout"`. Any failure is swallowed (log only `errorName`); it never changes the 204.
- **`app/page.tsx`:** render `<SessionDialogs portalUrl={PORTAL_URL} />` inside `ClientConfig`.
- **Copy (`lib/shared/messages.ts`):** `SESSION_EXPIRED_COPY { title, body, action, framedAction }` and `SESSION_CHANGED_COPY { title, reload }`. "Your session ended", its body and "Return to 1health" are locked (EXPERIENCE). `framedAction`, the changed title and "Reload" are marked `// ARCHITECTURE-ADDED COPY — PM review`.
- Update the "the shell subscribes (Story 1.7)" comment in `lib/api/session-events.ts`. `publish` gains no caller.

**Never:**
- No logout call, `requestLeave` or draft deletion from the session-expired action. No navigation when framed.
- No token, id or PHI in logout logs or response bodies. No revoke for a mismatched binding or under `PP_DISABLED`.
- No app bar, leave-guard dialog, drafts or registry (Stories 1.8, 1.13, 1.15, 1.11). No `confirm-dialog` primitive yet (1.11).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Expired | `session-expired` published | callbacks run in order, then the dialog opens; "Return to 1health" focused, `href = portalUrl` | a throwing callback is logged; later callbacks and the dialog still run |
| Expired, framed | `window.self !== window.top` | action "Close and reopen from 1health"; click → no navigation, dialog stays | N/A |
| Non-dismissable | Escape / overlay click | dialog stays open | N/A |
| Changed | `session-changed` published | `onSessionChanged` callbacks run, SWR cache emptied with no refetch, no expired callbacks, dialog with "Reload" | callback errors isolated |
| Reload | click "Reload" | `window.location.reload()` | N/A |
| Second event | either event after the first | first dialog stays; nothing else runs | N/A |
| Logout ok | valid session + binding + same-origin | 204 + clear cookie; revoke sent after response with the Bearer token | revoke 5xx/timeout/network → still 204 |
| Logout no/bad cookie | none, unsealable, or aged | 204 + clear; no revoke for none/unsealable; aged → revoke if token unexpired | N/A |
| Logout expired token | session unsealed, `accessTokenExpiresAt ≤ now` | 204 + clear; no revoke | N/A |
| Logout mismatch | `X-PP-Session` ≠ HMAC(sid) | 204, no `Set-Cookie`, no revoke | N/A |
| Logout CSRF | cross-site or no `X-PP-Session` | 403 `CSRF`, cookie untouched | N/A |
| Logout disabled / no endpoint | `PP_DISABLED=1` or `REVOKE_PATH = null` | 204 + clear; no upstream call | N/A |
| `returnToPortal` | logout ok / fails / hangs > 3 s | navigates to `PORTAL_URL` after ≤ 3 s in every case | failures ignored |
| Guarded leave | guard resolves `false` | no logout, no navigation | N/A |

</frozen-after-approval>

## Code Map

- `features/shell/idle-warning.tsx` -- **reuse** its `Dialog`/`DialogContent` props (non-dismissable, `onOpenAutoFocus` → focus the button) and focus-ring classes. It already stops on both events; leave it alone.
- `app/launch-error/return-action.tsx` -- **edit**: move `readFramed`/`noopSubscribe` into `features/shell/use-is-framed.ts` and import `useIsFramed`.
- `lib/api/client.ts` -- `getPortalUrl()` (set by `ClientConfig`) and `callApi`; `lib/api/session-events.ts` -- `subscribe`, comment only. Don't change `callApi`.
- `lib/server/ping.ts` -- **mirror** for `lib/server/logout.ts` (`baseHeaders`, `logRoute`/`logError`, `randomUUID`, `run` + catch → 500). Use `checkCsrf` (`lib/server/csrf.ts`), `verifyBinding` (`lib/server/session-binding.ts`), `unsealSession`/`SESSION_COOKIE_NAME`/`clearSessionCookie` (`lib/server/session.ts`, read the cookie with `cookies()` from `next/headers`), `API_ORIGIN`/`PP_DISABLED` (`lib/server/env.ts`). `/api/session/*` already gets the AD-21 headers from the root `proxy.ts` matcher.
- `lib/server/refresh.ts` -- reference for the upstream `fetch` + `AbortController` timeout pattern.
- Backend: `1h-ng-bo-core-be` `TokenController` `POST /user/logout` (auth server, served at `<API_ORIGIN>/auth/user/logout`) invalidates the Bearer access token only.
- `app/page.tsx` -- **edit**: mount `SessionDialogs`; `app/page.test.tsx` -- assert it receives `PORTAL_URL`.
- Tests:
  - `features/shell/session-dialogs.test.tsx` -- every dialog row, callback order and isolation, SWR clear without refetch (a `SWRConfig` provider with a seeded key and an MSW handler that must not be hit), axe-core zero violations for both dialogs, initial focus.
  - `features/shell/leave.test.ts` -- guard/no guard, logout timeout (fake timers), failure, unset portal URL.
  - `features/shell/use-is-framed.test.tsx`.
  - `lib/server/logout.test.ts` -- every logout row; mock `next/headers` like `ping.test.ts` and `next/server`'s `after` to collect and run the callback; assert the revoke URL, method, header and log shape.
  - `e2e/session-dialogs.spec.ts` -- launch (reuse `makeLpl` from `e2e/launch.spec.ts`, moved into `e2e/fixtures.ts`), `page.route("**/api/1h/v2/user/myself")` → 401 `SESSION_EXPIRED` → dialog, focus on "Return to 1health"; → 409 → changed dialog → Reload reloads. Framed: `page.route` a portal-origin page (`https://dev.1hdev.io/…`, the dev `frame-ancestors`) that iframes `/launch?lpl=…`; in the frame the action reads "Close and reopen from 1health". `e2e/headers.spec.ts` -- logout without CSRF → 403 with no-store + `nosniff`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/logout.ts`, `app/api/session/logout/route.ts` -- logout pipeline + deferred revoke.
- [x] `lib/shared/messages.ts` -- session copy.
- [x] `features/shell/use-is-framed.ts`, `app/launch-error/return-action.tsx` -- shared framing hook.
- [x] `features/shell/leave.ts` -- `requestLeave`, `setLeaveGuard`, `returnToPortal`.
- [x] `features/shell/session-dialogs.tsx`, `app/page.tsx`, `lib/api/session-events.ts` -- dialogs and hook registries.
- [x] Tests listed in the Code Map, covering every matrix row; update `CLAUDE.md` (logout route, `SessionDialogs`, leave helpers).

**Acceptance Criteria:**
- Given the component tests, when axe-core runs on each open dialog, then it reports zero violations and the primary action has focus.
- Given the story is done, when CI runs, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass and the forbidden-pattern gate stays clean.

## Implementation Notes

- **Mount order:** `SessionDialogs` is the first child of `ClientConfig`. It must subscribe before `IdleWarning` (or any later publisher) runs its mount effect, because `publish` never replays an event.
- **Framed e2e:** Chromium's Local Network Access checks stop a public origin from framing `localhost`, so the framed spec grants `local-network-access` to the portal origin. This changes only the test setup.
- **Logout e2e:** the logout POSTs are sent with `fetch` from inside the page. The cookie jar of Playwright's `page.request` doesn't remove the browser's partitioned cookie, so the test would have stayed signed in. The upstream mock answers `/auth/user/logout` with 200.
- **Logout fetch:** `returnToPortal`'s logout call uses `keepalive: true`, so a response that arrives after the 3 s wait still applies its `Set-Cookie`.
- **Revoke failure logs:** `logError` with `status` set to the upstream status (`0` for a network error or timeout) and `errorName` set to `"RevokeFailed"` or the error's name. `handleLogout(request, revokePath = REVOKE_PATH)`: the second argument is for tests only.
- `makeLpl`/`freshCode` moved to `e2e/fixtures.ts`.

## Spec Change Log

## Review Triage Log

### Iteration 1 — three layers (blind-hunter, edge-case, verification-gap)

**PATCH:**
- **Session-expired published before `SessionDialogs` subscribes** (blind-hunter + edge-case) — `medium`: `IdleWarning` is an earlier sibling, and its mount effect calls `evaluate()` synchronously. It can publish when the absolute deadline passed during hydration, and `publish` never replays, so no dialog ever opens. Fix: mount `SessionDialogs` first inside `ClientConfig`.
- **Logout's 204 branches never run in the real Next runtime** (verification-gap + blind-hunter) — `medium`, gap: `cookies()` and `after()` are mocked in the unit tests, and e2e reaches only the 403. Fix: an e2e test of the mismatch and success branches, plus an upstream mock for `/auth/user/logout`.
- **Nothing shows the expired link skips logout and the guard** (verification-gap + blind-hunter) — `low`, gap: add a click test with a guard spy and an MSW recorder.
- **A logout response later than 3 s loses its `Set-Cookie`** (edge-case) — `low`: `location.assign` aborts the in-flight fetch. Direct correction: `keepalive: true`.

**REJECTED:**
- **Logout races a concurrent refresh, ping or proxy re-seal** (blind-hunter + edge-case) — `low`: a later `Set-Cookie` can restore the session only if a refresh (token within 30 s of expiry) or a user-initiated request is in flight in the same few hundred ms as the click. Fixing it needs a tombstone or denylist design. Accepted as residual risk; the 15 min idle limit still applies.
- **Async `onBeforeSessionExpired` callbacks escape isolation** — `false` for this design: drafts are `localStorage` (AD-12), which is synchronous, and the callbacks are typed `() => void`.
- **"Your changes are kept on this device" ships before drafts exist** — `false` as a defect: the copy is locked in EXPERIENCE, and Story 1.15 ships in this epic before cutover.
- **`returnToPortal` ignores framing** — `false`: AD-5 hides the app-bar "Return to 1health" when framed, and nothing else calls it.
- **`returnToPortal` with no portal URL; re-entrancy on double click; a guard that throws; a missing binding sends a 403** — `low`: none has a caller yet, `ClientConfig` always registers both values, and Stories 1.8 and 1.13 own the button and the guard.
- **The framed button does nothing; the changed dialog has no body** — `false` as defects: both are what the frozen spec and AD-5/UX-DR38 require. Any copy is PM-owned.
- **SWR revalidation after `session-changed` fetches the other account's data** — `false`: this tab's binding is for the old `sid`, so every request gets 409 `SESSION_CHANGED` and no data.
- **`SessionDialogs` remount loses the dialog** — `low`: it mounts once at the page root, and remounts happen only on dev Fast Refresh.
- **Missing `accessToken` → `Bearer undefined`** — `false`: only `/launch` and refresh seal sessions, and both always set a token.
- **Revoke 401 logged as failure; test seam `revokePath` param; callback sets have no test reset; `page.test` matches by name; changed-handler order untested; other tabs not told of logout; diff excludes the spec** — `low` or `false`: cosmetic or process notes with no named user harm. Other tabs get `SESSION_EXPIRED` on their next call.

## Design Notes

- **Revoke is after the response:** `returnToPortal` waits only 3 s, but the revoke may take 5 s. Revoking before answering could let the navigation cancel the request and lose the cookie-clearing `Set-Cookie`. `after()` sends the 204 first and keeps the function alive for the revoke.
- **What revoke covers:** `/auth/user/logout` invalidates the access token only. The refresh token stays valid upstream until it expires, but it existed only inside the sealed cookie that was just cleared. Revoking it too would need `/oauth2/revoke` with client authentication, which `public-client` doesn't have.
- **Confirmed from backend source (2026-10-13; see the spine's "Answered from backend source"):**
  - `public-client` is the right refresh `client_id`: the launch exchange issues its tokens under it.
  - The IdP rotates refresh tokens (`reuseRefreshTokens(false)`, 24 h TTL) with no reuse detection. A replayed token gets `invalid_grant` but nothing else is revoked.
  - Logout leaving the refresh token valid is accepted for v1, because only the sealed, now-cleared cookie held it. It still leaves the session live upstream for up to 24 h and widens the logout-vs-refresh race in the Review Triage Log.
  - The backend is asked to invalidate the refresh token in `logout()` (`backend-request-refresh-token-revocation.md`). Once that ships, this route revokes both with no app change.
- **Mismatched binding is a no-op:** the cookie then belongs to whichever account launched last in this browser. A stale tab's "Return to 1health" must not sign that account out or revoke its token.
- **First event wins:** after `session-changed`, writing drafts on a later expiry would store edits against an account that is no longer signed in. After `session-expired`, the drafts have already been written and the page is inert, so a later change adds nothing.

## Verification

**Commands:**
- `pnpm lint` -- expected: passes; forbidden-pattern gate clean.
- `pnpm typecheck` -- expected: zero errors.
- `pnpm test` -- expected: all suites pass, including the new ones.
- `CI=1 pnpm test:e2e` -- expected: all pass, including the session dialog and framed specs.
- `APP_ENV=dev APP_ORIGIN=https://localhost:3100 APP_ID=dummy-app-id ONEHEALTH_SECRET_KEY=dummy-onehealth-secret SESSION_SECRET=dummy-session-secret-0123456789abcdef pnpm build` -- expected: succeeds; `/api/session/logout` is `ƒ`.
