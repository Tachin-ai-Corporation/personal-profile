---
title: 'R5-2 Main parity recovery: client, tooling and docs'
type: 'fix'
created: '2026-10-14'
status: 'ready-for-dev'
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
- `features/shell/{use-myself.ts,swr-provider.tsx}` (+ `use-myself.test.tsx`) -- myself retry.
- `lib/server/disabled-screen.{ts,test.ts}` -- D2 order.
- `features/shell/{auth-screen,page-tabs}.test.tsx`, `app/globals.test.ts`, `lib/shared/messages/messages.test.ts`, `test/page-session.test.ts` -- ported tests.
- `package.json`, `.github/workflows/ci.yml`, `CLAUDE.md`, `docs/DESIGN-SYSTEM.md`, `_bmad-output/implementation-artifacts/{deferred-work.md,sprint-status.yaml}` -- housekeeping.

## Tasks & Acceptance

**Execution:**
- [ ] ESLint bans + lint-guard fixtures.
- [ ] Token gate rows.
- [ ] Vitest includes + orphan guard.
- [ ] Client fixes + tests.
- [ ] myself auto-retry + tests.
- [ ] Disabled screen D2 order + test.
- [ ] Ported tests.
- [ ] Housekeeping.

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
