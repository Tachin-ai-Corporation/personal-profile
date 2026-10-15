---
title: 'R5-2 Main parity recovery: client, tooling and docs'
type: 'fix'
created: '2026-10-14'
status: 'done'
baseline_commit: '3d485ab'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/FOUNDATION.md (§1)'
  - '{project-root}/docs/DESIGN-SYSTEM.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md (Launch and environment decisions D1–D13)'
  - 'origin/main (b005536): eslint.config.mjs, lib/api/keys.test.ts (lint guards), scripts/check-forbidden.{sh,test.ts} (colour gate), app/globals.test.ts (DESIGN map), features/shell/{use-myself,auth-screen,profile-tabs}.test.tsx, lib/api/client{,.refresh}.test.ts, lib/shared/messages.test.ts, .github/workflows/ci.yml, package.json, CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `origin/main` (b005536) holds the other team's Epic 1 (Stories 1.1–1.8). `feat/NG-9019-epic-7` was rebuilt on main keeping our implementation, and a parity audit found behaviours and tests of main that were lost on the client, tooling and docs side: lint bans (`window.fetch`, inline SWR keys of every shape, `app-env.ts` reading only `NODE_ENV`), colour-gate palettes and prefixes, Vitest include holes, client robustness (logout `keepalive`, the `navigator.locks` failure fallback, non-string paths, bad caller headers, error logging), the `myself` auto-retry, the disabled screen's `/auth` environment order (D2), several ported tests, and stale housekeeping. Spec R5-1 recovers the server side in parallel.

**Approach:** Port each lost behaviour or test into our structure (no revert to main's modules). Pre-approved by the human (2026-10-14): write the spec, then implement.

**Human decision (2026-10-14):** the `myself` read auto-retries on 5xx and network errors with backoff (main's `shouldRetryMyself`), never on 4xx; after the retries are exhausted the manual Retry UI shows. Per key (main set it on the `useMyself` hook, not globally); the root `SwrProvider` keeps `shouldRetryOnError: false` for every other key.

## Boundaries & Constraints

**Always:**
- **ESLint:** ban `window.fetch` / `globalThis.fetch` / `self.fetch` wherever bare `fetch` is banned; the inline-SWR-key ban covers array, template and string first arguments of `useSWR`, `useSWRImmutable`, `useSWRMutation`, `useSWRSubscription`, `mutate`, `preload`, and member calls `x.mutate(…)` / `x.preload(…)` (`keys.*` stays allowed; `lib/api/keys.ts` exempt); `lib/shared/app-env.ts` may read only `process.env.NODE_ENV` (any other member, a computed member or a bare `process.env` fails). Lint-guard fixtures in `eslint.config.test.ts`: fetch (4 shapes, allowed in `lib/api/client.ts`, tests), env, inline SWR keys (8 shapes + outside features + `keys.*` allowed), `dangerouslySetInnerHTML`, `NextResponse.redirect` in `app/handoff/**`.
- **Token gate (`scripts/check-tokens.sh`):** palettes `mauve|olive|mist|taupe`, prefix `drop-shadow`; also scan `*.json` under `app/` and `components/` (`*.css` incl. `*.module.css` is already scanned). `check-tokens.test.ts` gets main's per-prefix / per-border-side / added-palette rows.
- **Vitest:** every `*.test.ts(x)` outside `node_modules`, `e2e`, `.next` and `.claude` belongs to exactly one project; includes broadened to `app/**`, `components/**`, `hooks/**`, `contexts/**`; a test (`vitest.config.test.ts`) fails when a test file matches no project (or two). Coverage thresholds unchanged.
- **Client:** `endSession()` sends `keepalive: true`; the refresh coordinator falls back when `locks.request` rejects (rejected before the callback ran → refresh unlocked; after the callback produced an outcome → that outcome; after it ran without an outcome → `unavailable`, no second refresh, no event); `exit-hooks.ts` and `session-events.ts` log only the error's `name`; `callApi` answers `BAD_PATH` without throwing for a non-string path and for a path that leaves `/api/` once normalised (`/api/../auth`, `/api/%2e%2e/x`), and `NETWORK_ERROR` without throwing for invalid caller headers; `credentials` is always `same-origin` even when the caller passes `include`.
- **myself auto-retry:** on the `useMyself` hook only. Retried: status ≥ 500, or no status with `NETWORK_ERROR`. Never: any 4xx, `BAD_PATH`, other client-side failures. Exponential backoff from SWR's `errorRetryInterval`, at most `errorRetryCount` retries (root `SwrProvider`: 1 000 ms, 3). While a retry is pending the hook reports loading, not the error, so the Retry UI shows only after the last retry fails; loaded data stays when a revalidation fails.
- **Disabled screen (`lib/server/disabled-screen.ts`, D2):** when the switched-off page was `/auth`: referrer, then the remembered `onehealth_environment` cookie, then `prod` (the session is not consulted, as `/auth` itself does not). Other pages: session, then cookie, then `prod`.
- **Ported tests:** auth-screen axe on the error, manual and chooser states; `?lpl=`, `?lpl=%20%20`, `?lpl=+++&x=1` → no POST, card shown, `lpl` stripped; a `document.cookie` getter spy never called; `app/globals.test.ts` full 33-token DESIGN map (light + dark) + `--color-neutral`; verbatim test of every `LAUNCH_MESSAGES` string; `requirePageSession` prod portal URL; roving tabindex on the page tabs.
- **Housekeeping:** `package.json` name `personal-profile`; CI `setup-node` `cache: pnpm` with `corepack enable` before it (main's order); CLAUDE.md: D1–D13 override the spine (e.g. no CSRF / session binding) + the contrast-override table / `text-primary` → `dark:text-info-strong` pointer; DESIGN-SYSTEM.md gets that guidance if absent; `deferred-work.md` marks the stale items resolved (sections kept); `sprint-status.yaml` `1-1r` gets a trailing comment (header untouched).

**Ask First:** none (pre-approved).

**Never:**
- Edit `lib/server/**` (except `lib/server/disabled-screen.ts` + its test), `app/api/**`, `instrumentation.ts`, `e2e/**`, `scripts/check-forbidden.sh`, `test/e2e-upstream-mock*` (spec R5-1 runs in parallel on those).
- Turn on SWR error retries globally or for any key other than `myself`.
- Lower coverage (100 % on `lib/server`, `lib/api`, `lib/shared`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| fetch via global | `window.fetch("/api/x")` in `features/x.ts` | lint error | allowed in `lib/api/client.ts`, `*.test.*`, `lib/server/**` |
| Inline SWR key | `cache.mutate(["pp","myself"])`, `preload("pp", f)`, ``useSWR(`pp-${r}`)`` | lint error | `useSWR(keys.myself(), f)` allowed |
| app-env | `process.env["NODE_ENV"]` in `lib/shared/app-env.ts` | lint error | `process.env.NODE_ENV` allowed |
| Palette | `bg-mauve-500`, `drop-shadow-red-500`, `#000` in `components/theme.json` | gate exit 1 | tokens pass |
| Orphan test | `foo/x.test.ts` matching no project | `vitest.config.test.ts` fails | — |
| Logout | `endSession()` | `POST /api/session/logout` with `keepalive: true` | — |
| Lock rejects first | `locks.request` throws before the callback | refresh runs unlocked, call replayed | — |
| Lock rejects after outcome | callback resolved, then `request` rejects | that outcome is used, no second refresh | — |
| Lock rejects mid-run | callback started, `request` rejects before it resolves | `REFRESH_UNAVAILABLE`, no event, one refresh | — |
| Bad path | `callApi("x", 42)`, `"/api/../auth"` | `BAD_PATH`, no fetch | never throws |
| Bad headers | `headers: { "bad header": "x" }` | `NETWORK_ERROR`, no fetch | never throws |
| myself 502 ×N | three 502s then 200 | name shows, no Retry UI | — |
| myself 502 always | retries exhausted | Retry UI | Retry revalidates |
| myself 401/403/409 | one 4xx | no retry, error at once | — |
| Revalidation fails | data loaded, then 503 | name kept | — |
| Disabled on /auth | referrer demo, cookie prod | demo portal | no referrer → cookie → prod |

</frozen-after-approval>

## Code Map

- `eslint.config.mjs`, `eslint.config.test.ts` -- fetch, SWR key, app-env bans + fixtures.
- `scripts/check-tokens.{sh,test.ts}` -- palettes, `drop-shadow`, `*.json`.
- `vitest.config.ts`, `vitest.config.test.ts` -- includes + orphan guard.
- `lib/api/{session,client,refresh-coordinator,session-events}.ts` (+ tests), `features/shell/exit-hooks.ts` (+ test) -- client robustness.
- `features/shell/{use-myself.ts,swr-provider.tsx}` (+ `use-myself.test.tsx`), `lib/api/errors/index.ts#isTransientReadFailure`, `test/providers.tsx` -- myself retry.
- `lib/server/disabled-screen.{ts,test.ts}` -- D2 order.
- `features/shell/{auth-screen,page-tabs}.test.tsx`, `app/globals.test.ts`, `lib/shared/messages/messages.test.ts`, `test/page-session.test.ts` -- ported tests.
- `package.json`, `.github/workflows/ci.yml`, `CLAUDE.md`, `docs/DESIGN-SYSTEM.md`, `_bmad-output/implementation-artifacts/{deferred-work.md,sprint-status.yaml}` -- housekeeping.

## Tasks & Acceptance

**Execution:**
- [x] ESLint bans + lint-guard fixtures.
- [x] Token gate rows.
- [x] Vitest includes + orphan guard.
- [x] Client fixes + tests.
- [x] myself auto-retry + tests.
- [x] Disabled screen D2 order + test.
- [x] Ported tests.
- [x] Housekeeping.

**Acceptance Criteria:**
- Given any row of the matrix, then the behaviour holds and a test asserts it.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm install` -- expected: OK
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, thresholds met
- `PP_E2E_PORT=3260 corepack pnpm test:e2e` -- expected: green
- `corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

Implemented 2026-10-15 on baseline `3d485ab` (the worktree was reset from `b005536` first).

- **ESLint (`eslint.config.mjs`):** the `ban` entries may now be arrays (`syntax()`, `ALL` and `without()` flatten). `fetch` adds `MemberExpression[object.name=/^(window|globalThis|self)$/][property.name='fetch']` (so an aliased `window.fetch` fails too), lifted wherever bare `fetch` is (`lib/server/**`, `lib/api/client.ts`, tests, tooling). `inlineSwrKey` is main's 6-entry-point × 3-literal-shape matrix plus member `mutate`/`preload` (still lifted only in `lib/api/keys.ts`). `lib/shared/app-env.ts` keeps every other ban and adds main's `APP_ENV_ONLY_NODE_ENV` selector. `NextResponse.redirect` was already banned everywhere (not only `app/handoff/**`). `eslint.config.test.ts` gains a "lint guards ported from main" block (fatal-free check so "allows" cases cannot pass on a parse error): fetch ×5 shapes × 5 locations, 3 allowed locations, app-env ×3 + allowed, 10 inline-key shapes, outside features, `keys.*` allowed, `dangerouslySetInnerHTML`, handoff redirect.
- **Token gate:** `check-tokens.sh` PALETTE + `mauve|olive|mist|taupe`, PREFIX + `drop-shadow`; `*.json` under `app/` and `components/` joins the file list (the two `find` loops are grouped so the test/globals/lib-server filters apply to both). `check-tokens.test.ts`: main's 29 per-prefix/side rows + 5 variant rows + 4 added palettes, JSON/CSS-module scan, nested `globals.css`, allowed `transparent`/`current`/`inherit`/bare `neutral`/`drop-shadow-md`.
- **Vitest:** `SERVER_TESTS` / `CLIENT_TESTS` exported from `vitest.config.ts`: server = `lib/server`, `lib/shared`, `lib/*`, `app/**/*.test.ts`, `scripts`, `test/**/*.test.ts`, root `*.test.ts`; client = `lib/api`, `lib/**/*.test.tsx`, `features`, `components`, `hooks`, `contexts` (`.ts` and `.tsx`), `app/**/*.test.tsx`, `test/**/*.test.tsx`, root `*.test.tsx`. No file moved project (all 157 existing files matched before). `vitest.config.test.ts` globs every `*.test.ts(x)` (skipping node_modules, .next, .git, .claude, _bmad*, coverage, reports, e2e) and fails on any file matching zero or two projects, plus a 10-row example table (`path.matchesGlob`, Node 24).
- **Client:** `endSession()` sends `keepalive: true`. `refresh-coordinator.ts#runLocked` implements main's fallback; the third case (callback started, no outcome) maps to our `unavailable` → `REFRESH_UNAVAILABLE` (main: `NETWORK_ERROR`), no event, no second refresh. `session-events.ts` and `exit-hooks.ts` log `error.name` (or `typeof` for a non-Error). `callApi`: `isApiPath` (main's) rejects non-strings and paths that normalise outside `/api/` (`/api/../auth`, `/api/%2e%2e/x`) with `BAD_PATH`; `buildInit` now runs once in `callApi` inside a try, so invalid caller headers answer `NETWORK_ERROR` without a fetch (the first send and the replay share the built init). Tests: main's 9 bad paths + non-string, credentials forced over `include`, bad headers, the three lock cases at both coordinator (`support.test.ts`) and `callApi` (`client.test.ts`) level, keepalive, name-only logs.
- **myself auto-retry (decision):** the predicate is `isTransientReadFailure(error)` in `lib/api/errors/index.ts` (only `errors/*` may read `errorCode`, guarded by `errors.test.ts`): `ApiResponseError` with status ≥ 500, or no status and `NETWORK_ERROR`; everything else (4xx, 200 bad shape, `BAD_PATH`, unknown key, non-API errors) is terminal. `useMyself` passes per-hook options: `shouldRetryOnError: true` + a custom `onErrorRetry` (SWR's jittered exponential backoff from `errorRetryInterval`, at most `errorRetryCount ?? MYSELF_RETRY_COUNT` = 3). To show the Retry UI only after exhaustion, a per-SWR-cache "retry pending" flag (`WeakMap` + `useSyncExternalStore`) is set in `onErrorRetry` and cleared in `onError`/`onSuccess`; SWR calls these before committing the error, so no frame shows the error while a retry is scheduled. While pending, the hook returns `error: undefined` and `isLoading: true` when there is no data (loaded data stays). Root `SwrProvider` keeps `shouldRetryOnError: false` and adds `errorRetryCount: 3`, `errorRetryInterval: 1000` (used only by `myself`). `TestProviders` sets `errorRetryCount: 0` so shared tests see a failed read at once (documented in its comment); `features/shell/use-myself.test.tsx` (10 cases, real `SwrProvider`, 5 ms backoff base): 5xx retried and loaded with no error frame, network retried, 403/404/409 one request, exhausted after 3 retries then error, smaller `errorRetryCount` honoured, PageFrame Retry UI only after exhaustion and Retry loads, loaded user kept on a failing revalidation, another key not retried.
- **Disabled screen (D2):** `disabledScreenEnvironment` — switched-off `/auth`: referrer → remembered cookie → prod (no session, as `/auth` itself never reads it); other pages: session → cookie → prod (the referrer is no longer consulted after the cookie). New test row; `e2e/kill-switch.spec.ts` rows still hold.
- **Ported tests:** `auth-screen.test.tsx` (blank `?lpl=` ×3 for remembered and unknown environment, `document.cookie` getter spy, axe on error, manual and chooser); `app/globals.test.ts` (33-token DESIGN map light + dark, `--color-neutral` → `--status-neutral` #7a8696, dark destructive fill ≠ error-strong; all matched our `globals.css` unchanged); `messages.test.ts` (every `LAUNCH_MESSAGES` string rendered and compared verbatim, `LAUNCH_ERROR_MESSAGES` exact); `test/page-session.test.ts` (prod and demo portal URL; under `test/` because `lib/server/**` is frozen by R5-1 this round — move it beside `session.test.ts` later); `page-tabs.test.tsx` roving tabindex (Radix: no tab is a stop at rest, the tablist hands focus to the selected tab, which becomes the only `tabindex=0`; arrows move the stop).
- **Housekeeping:** `package.json` name `personal-profile` (lockfile unaffected). CI: `corepack enable` → `setup-node` with `cache: pnpm` → `corepack enable` again for Node 24 (main had only the first; the second keeps the Node 24 shims first on PATH). CLAUDE.md: D1–D13 override the spine (no CSRF / session binding, D5); the SWR line records the `myself` retry; design-system bullets point to the Contrast overrides table and the primary-text rule. On this branch the rule is the `text-primary-text` token (light: brand primary, dark: info-strong), i.e. main's `text-primary dark:text-info-strong` as one token; `docs/DESIGN-SYSTEM.md` gains a "Primary-colored text" paragraph saying so. `deferred-work.md`: 10 items marked "(resolved 2026-10-14, spec R5-2: …)" in place (`.env.example`, stale docs, `cache: pnpm`, `callApiRaw`, stale `lib/server/proxy.test.ts` skew path, refresh not built, `/launch-error` copy (D1), 1.8 part B, ACCOUNT_DISABLED "parsed only", `saveLoginIntent` caller); sections kept. `sprint-status.yaml`: trailing comment on `1-1r` (status unchanged, header untouched).
- **Not touched:** `lib/server/**` except `disabled-screen.{ts,test.ts}`, `app/api/**`, `instrumentation.ts`, `e2e/**`, `scripts/check-forbidden.sh`, `test/e2e-upstream-mock*`.
- **Verification (2026-10-15):** `corepack pnpm install --frozen-lockfile` OK; `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 160 files / 3278 tests green, 100 % statements/branches/functions/lines; `PP_E2E_PORT=3260 pnpm test:e2e` 276 passed, 2 skipped (the existing desktop-only tests on 360 px); `pnpm build` OK; `bash scripts/check-forbidden.sh` OK (check-tokens OK). The new retry and tab tests passed 5/5 repeated runs.

## Review Triage Log

Review of `0d8f7b3` (coordinator, 2026-10-15): no high findings. The base branch now also carries decisions D14–D17 in `epics.md`; this worktree stays on its base (no rebase).

- **Patched ("fix: R5-2 review findings"):** 1 `myself` retry-pending could stick; 2 lock rejection mid-run let a concurrent `TOKEN_EXPIRED` start a second refresh; 3 `isApiPath` allowed dot segments that stay under `/api/`; 4 inline-SWR-key lint gaps and false positives; 5 token gate missed `text-shadow-*` and palette CSS variables; 6 wrong backoff comment, manual Retry budget undocumented; 7 CLAUDE.md decision range and table reference; 8 orphan guard ignored `*.spec.ts(x)` / `*.test.mts|cts`; 9 weak auth-screen and roving-tabindex tests.
- **Deferred** (`deferred-work.md`, Foundation, "Deferred from: code review of spec-r5-2"): `window["fetch"]` / aliased bare `fetch` lint bypass; `NETWORK_ERROR` from invalid caller headers counted as transient; CI `cache: pnpm` + corepack order to confirm on the first Actions run (fallback `pnpm/action-setup`); move `test/page-session.test.ts` beside `lib/server/session` after merge.
- **Rejected:** none.

## Review fixes

Applied 2026-10-15 on `0d8f7b3`.

1. **`myself` retry pending (`features/shell/use-myself.ts`):** the per-cache flag is now a deadline (`backoff + MYSELF_RETRY_REQUEST_MS` = 30 s); an expired deadline counts as not pending, and a timer re-renders when it passes. Cleared by `onError`, `onSuccess` and `onDiscarded` (options are built per cache with `useMemo`, since `onDiscarded` gets only the key). Live backoff timers are counted per cache; on mount, with no live timer and no request running, a leftover pending state is cleared. New tests: unmount during backoff, timer fires with no hook, remount without revalidation → the error shows (fails without the mount check); 401 `SESSION_EXPIRED` one request; hidden tab (`visibilityState: "hidden"`) one request, error at once.
2. **Refresh coordinator:** when the lock rejects after the refresh started, `runLocked` waits for that refresh to settle and then answers `unavailable`, so `inFlight` keeps pointing at it and a concurrent `TOKEN_EXPIRED` joins it. Tests: coordinator (caller not answered before the refresh settles, second caller joins, one run; a rejecting refresh still ends as `unavailable`) and `callApi` (two concurrent 401s, the second arriving after the lock failed → one refresh, both `REFRESH_UNAVAILABLE`, one lock request). Both fail with the old code.
3. **`isApiPath`:** rejects any backslash and any `.` / `..` path segment, plain or `%2e` in any case (query and fragment ignored), before the URL check; `/api/1h/../session/logout` → `BAD_PATH`. Nine new rows; dots inside a segment (`a.b..c`) and in the query still pass.
4. **Inline SWR keys:** replaced the selectors with a scope-aware local rule `pp/inline-swr-key` (`eslint.config.mjs`, off in `lib/api/keys.ts`). It unwraps `as` / `satisfies` / `!` / `<T>`, checks both branches of `?:` and `&&`/`||`, and key functions (expression bodies and `return`s in block bodies, through `if`). It checks `useSWR*` hooks, `preload` unless its 2nd argument is an object (react-dom), and only the global `mutate`: imported from `swr*`, destructured from `useSWRConfig()`, or `useSWRConfig().mutate` / `config.mutate` with `config = useSWRConfig()`. A bound `mutate` (from `useSWR`, another object, or a local function) is never reported. 11 new reject rows, 7 allow rows, `keys.ts` exemption.
5. **Token gate:** `text-shadow` prefix; `CLASS_VAR` rule for `prefix-(--color-<palette>…)` and `prefix-[var(--color-<palette>…)]` (black/white included). Seven new rows; semantic variables (`bg-(--color-card)`, `bg-[var(--color-destructive-fill)]`) and `text-shadow-lg` pass.
6. **Backoff doc:** `swr-provider.tsx` now states the real ranges: retry n waits floor((0.5–1.5) × 2^n) × 1 s, so 1–2 s, 2–5 s, 4–11 s (at most ~18 s before the Retry UI). **A manual Retry starts a fresh request with a fresh 3-retry budget** (SWR resets `retryCount` on a new revalidation). FOUNDATION.md not edited.
7. **CLAUDE.md:** "D1–D17"; `link-text` / `destructive-fill` / `control-border` point to the "Contrast overrides" table, `tooltip` / `scrim` to the "Semantic tokens (Tier 3)" table.
8. **Orphan guard:** scans `**/*.{test,spec}.{ts,tsx,mts,cts}` outside `e2e/` (and the other skipped trees); such a `.spec` or `.mts/.cts` file matches no project and fails. Rows for each form.
9. **Tests:** `?lpl=+++&x=1` keeps `?x=1` (exact search asserted for all three); a `document.cookie` getter spy over no-lpl → manual submit → error screen → chooser. Page tabs: roving tabindex via `@testing-library/user-event` `user.tab()` (new devDependency `@testing-library/user-event` 14.6.1).

- **Review verification (2026-10-15):** `corepack pnpm install --frozen-lockfile` OK; `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 160 files / 3326 tests green, 100 % statements/branches/functions/lines; `PP_E2E_PORT=3260 pnpm test:e2e` 276 passed, 2 skipped; `pnpm build` OK; `bash scripts/check-forbidden.sh` OK. The changed suites passed 5/5 repeated runs.
