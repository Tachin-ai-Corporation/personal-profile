---
title: '7.0b-2 Shell navigation: app bar, tabs, header, navigate + leave guard, session dialog'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: '3531ecea93d34f3bde3128878d8e8d089462e2f0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
  - 'https://agents.1health.io/public/demo/api/v2/user/contact-point/list/agents.md'
  - 'https://agents.1health.io/public/demo/api/v2/user/myself/agents.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 7.1 needs a working shell around its page — app bar with page navigation and "Return to 1health", the tabs pattern, the shared profile header, a single `navigate()` guarded by unsaved-changes protection, a per-page Section registry, and the session-expired dialog — and `/` must become a real page frame so navigation works both ways. None of it exists; `/` still shows the 7.0a placeholder.

**Approach:** Build the rest of Epic 1 Stories 1.7 (session-expired dialog, `navigate({external:"portal"})`, login intent), 1.8 (app bar, tabs), 1.9 (minimal header), 1.11 (Section registry only) and 1.13 (leave guard) as `epics.md` specifies, under D1–D13, reusing spec 7.0b-1 (tokens, `messages.ts`, `mapApiError`, `ConfirmDialog`, read states). Human decisions: a relaunch always lands on `/` (the login intent is used only when its pathname is `/`); the header shows initials only (no picture until Story 1.10).

## Boundaries & Constraints

**Always:**
- Shell code in `features/shell/` behind `features/shell/index.ts`; header in `features/header/`; primitives in `components/ui/`; data in `lib/api/`. Exactly one `navigate()`, one `requestLeave()`, one leave-guard dialog (built on `ConfirmDialog`), one session dialog; no duplicated navigation or copy (all strings from `lib/shared/messages.ts`, adding any missing ones there).
- Exported types: `NavTarget = {page:"profile",tab?:ProfileTab,hash?:string} | {page:"account",tab?:AccountTab,hash?:string} | {external:"portal"} | {external:"handoff",href:string}`, `ProfileTab = "contacts"|"insurance"|"medical"`, `AccountTab = "personal"|"provider"|"organizations"`, `SectionId`, `SectionRegistration`, `SaveResult` (allows `failedParts`).
- `navigate()`: page → `requestLeave()` → `router.push` (shared SWR cache kept); tab → `requestLeave()` → URL `?tab=` replace, hash dropped, no scroll jump; portal → `requestLeave()` → before-exit callbacks → `POST /api/session/logout` (≤3 s, failures ignored) → `location.assign(portalUrl)`; handoff → `requestLeave()` → `location.assign(href)`, no logout, no before-exit callbacks. `requestLeave()` resolves `true` when no guard is set or nothing is dirty.
- Section registry per page (Story 1.11 L1410–1431): `useRegisterSection({id,label,displayOrder,isDirty,validate,save,discard,draftFields?})`, dev throw on duplicate id, `getDirty()`, `isAnyDirty`, `subscribe()`, save wrapper turning throw/reject into `{ok:false,error:{code:"UNEXPECTED"}}`. Guard-only participants (no `save`) are `canSave:false`.
- Leave guard (Story 1.13 L1556–1597): dialog "You have unsaved changes" with Keep editing (initial focus) / Discard (outline extra action) / Save; Save validates all first (invalid → close, cancel, focus first invalid field), then saves Sections in `displayOrder`, navigating only if all `{ok:true}`; `canSave:false` hides Save; `beforeunload` only while dirty and suppressed after a confirmed navigation.
- Session dialog (Story 1.7 L1137–1151): on `session-expired` (check `hasPublished` on mount and subscribe) run `onBeforeSessionExpired` callbacks, `saveLoginIntent(location.pathname + location.search)`, open the non-dismissable "Your session ended" dialog on `scrim` with focus on "Return to 1health" (same-tab portal, no logout, `beforeunload` suppressed); a second publish opens nothing new. `consumeLoginIntent` callers accept only intents whose pathname is `/`.
- App bar (Story 1.8 L1194–1202, D10, D11): 52 px bar, non-interactive `span` wordmark in `primary-text`, vertical rule, `<nav aria-label="Pages">` items Personal Profile / Account (44 px, active `aria-current="page"` with 2 px primary indicator; current item inert), "Return to 1health" link in `link-text` with external-link icon, always shown; segmented control <768 px, wrapping under the wordmark <400 px.
- Tabs (Story 1.8 L1204–1220): `components/ui/tabs.tsx` on pinned `@radix-ui/react-tabs`, ARIA tabs with manual activation, Left/Right wrap, Home/End; changes go through `navigate`; unknown `?tab=` normalized with replace.
- Header (Story 1.9, initials only): 40 px initials avatar + `{firstName} {lastName}` as the page's single `h1`, skeleton while `myself` loads, fallback to username when names are blank; ≥768 px also primary phone and email from `keys.contactPoints(type)` (`["pp","contact-points",type]`, new `lib/api/contact-points.ts` mapping the agents.md `ContactPointResponseDTO`, all fields nullable); <768 px no contact fetch; a failed contact fetch omits that item.
- `/` page frame: app bar, header, `ProfileTab` tabs with placeholder panels (Medical uses its "Coming soon" copy), read errors via `ReadStateFor`; `ProfilePlaceholder` removed.
- WCAG 2.1 AA: tab order page nav → Return → header → tabs → content (wordmark never focused); 44 px targets; no horizontal scroll at 360×740; real-browser axe (`@axe-core/playwright`, pinned) in light and dark at desktop and 360 px, including the session and leave-guard dialogs.
- Tests colocated for every module; Playwright for the matrix journeys.

**Never:**
- No Save all, drafts storage (only the `onBeforeExit`/`onBeforeSessionExpired` hooks), idle logoff, Section menu/Jump to, `SectionFrame`, edit-model primitives, toasts, Tooltip, profile picture or its routes, scoped `requestLeave`, `/account` page (Story 7.1).
- No session-changed dialog, `X-PP-Session`, `PORTAL_URL` env, `next/link` or raw `<a href>` to app pages/portal outside `features/shell`. No new allowlist entries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Page switch clean | on `/`, activate Account | `router.push("/account")`, no refetch of fresh `myself` | — |
| Page switch dirty | a registered participant dirty | guard dialog; Keep editing cancels; Discard discards all then navigates; Save saves then navigates only if all ok | any `{ok:false}` stays on page |
| Return to 1health | activate Return | guard → before-exit callbacks → logout → `location.assign(portalUrl)` | logout failure/timeout still navigates |
| Handoff | `navigate({external:"handoff",href})` | guard → assign; no logout, no before-exit | — |
| Session expired | `callApi` publishes `session-expired` (or already published on mount) | callbacks, intent saved, dialog with focus on Return | second publish ignored |
| Relaunch intent | saved `/?tab=insurance` / saved `/account?tab=provider` | lands on `/?tab=insurance` / lands on `/` | invalid → `/` |
| Tabs | keyboard Left/Right/Home/End/Enter; `?tab=bogus` | manual activation via `navigate`; bogus normalized by replace | — |
| Header | loading / ≥768 px / <768 px / contact 5xx | skeleton / initials + name + primary phone & email / initials + name, no contact fetch / item omitted | — |

</frozen-after-approval>

## Code Map

- `features/shell/portal-url-provider.tsx` -- `usePortalUrl()`; `lib/api` `getPortalUrl()` for non-React exits. Reuse in `navigate()`.
- `lib/api/{session-events,session,keys,fetcher,user,index}.ts` -- `sessionEvents.subscribe/hasPublished`, `endSession()` (logout), `keys.myself()`, fetcher `byResource` Map; add `keys.contactPoints` + fetcher entry.
- `lib/shared/login-intent.ts` -- `saveLoginIntent`/`consumeLoginIntent`; add the `/`-only acceptance (helper or option) and use it in `features/shell/auth-screen.tsx`.
- `lib/shared/messages.ts`, `lib/api/errors.ts`, `components/ui/confirm-dialog.tsx`, `features/shell/read-state.tsx` -- from 7.0b-1; reuse, extend copy only in `messages.ts`.
- `features/shell/profile-placeholder.tsx` + `features/shell/shell.test.tsx` -- delete/replace (closes deferred item: placeholder bypassing `ReadStateFor`).
- `app/page.tsx` -- `requirePageSession()` → `PortalUrlProvider` → page frame.
- `eslint.config.mjs` -- navigation bans already exempt `features/shell/**`; keep.
- `package.json` -- add pinned `@radix-ui/react-tabs`, `@axe-core/playwright`.

## Tasks & Acceptance

**Execution:**
- [x] `features/shell/{nav-types,navigate,leave,exit-hooks}.ts` (+tests) -- types, `navigate`, `requestLeave`/`setLeaveGuard`, `onBeforeExit`/`onBeforeSessionExpired`.
- [x] `features/shell/section-registry.tsx` (+tests) -- provider + `useRegisterSection` per Boundaries.
- [x] `features/shell/leave-guard.tsx` (+tests) -- dialog on `ConfirmDialog` + `beforeunload`.
- [x] `features/shell/session-dialog.tsx` + `lib/shared/login-intent.ts` + `features/shell/auth-screen.tsx` (+tests) -- session dialog, intent save, `/`-only consumption.
- [x] `features/shell/{app-bar,page-nav,return-link}.tsx` (+tests) -- app bar per Boundaries.
- [x] `components/ui/tabs.tsx` + `features/shell/page-tabs.tsx` (+tests) -- tabs pattern via `navigate`.
- [x] `lib/api/contact-points.ts` + `lib/api/{keys,fetcher,index}.ts` + `features/header/*` (+tests) -- minimal header.
- [x] `features/shell/page-frame.tsx` + `app/page.tsx` (+tests) -- `/` frame; remove `ProfilePlaceholder`.
- [x] `e2e/shell.spec.ts` (+ `e2e` fixtures) -- matrix journeys, keyboard order, axe light/dark desktop + 360 px, no horizontal scroll.

**Acceptance Criteria:**
- Given `/`, when tabbing from the top, then focus visits page nav, Return, header, tabs in order and never the wordmark.
- Given a dirty registered participant, when the browser tab is closed, then `beforeunload` fires; when nothing is dirty, it does not.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Design Notes

`requestLeave()` is the only gate; the leave guard registers itself with `setLeaveGuard` and reads the registry, so pages without dirty participants never see a dialog. Before-exit callbacks are the seam where `drafts.purgeUser` (Story 1.15) will plug in; until then they are an empty list. Page moves rely on `router.push` so the root `SWRConfig` cache survives between `/` and `/account`.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, 100% kept on `lib/**`
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

- `navigate(target, deps)` is the one navigation; `useNavigate()` binds it to the Next router, `usePortalUrl()` and the frame's current page (`CurrentPageProvider`). Same-page tab/hash moves use `history.replaceState(null, …)`: Next's patched history skips syncing `useSearchParams` when it is handed its own state object.
- Validation contract: `validate()` returns `{ valid: true } | { valid: false, focusFirstInvalid }`; the leave guard calls `focusFirstInvalid` through a new `ConfirmDialog` `onCloseFocus` prop (so the trigger isn't refocused). `ConfirmDialog` also gained `showConfirm` (Save hidden when a dirty participant has `canSave: false`).
- Login intent: `consumeLaunchIntent()` in `lib/shared/login-intent.ts` (accepts only pathname `/`), used by `auth-screen.tsx`.
- Dev-only duplicate-id throw uses the new `isProductionBuild()` in `lib/shared/app-env.ts` (throws whenever NODE_ENV ≠ production, so tests see it).
- Medical copy is the EXPERIENCE.md Voice and Tone line ("Coming soon: medications, allergies and conditions will appear here"), not the epics Story 1.8 wording, because `messages.test.ts` enforces Voice and Tone verbatim. Contacts/Insurance placeholders, header labels and leave-guard bodies are `// DRAFT COPY`.
- Header phone shows the raw platform value until `formatPhoneDisplay()` (Story 7.4).
- Real-browser leave-guard coverage needs a dirty participant, so `app/test-fixtures/leave-guard` renders the `/` frame plus `features/shell/__fixtures__/fixture-participant.tsx`; it 404s unless `PP_E2E_FIXTURES=1` (new `lib/server/env.ts` flag, set only in `e2e/server-env.ts`).
- Review fixes (round 1): a throwing `validate()` counts as invalid and the guard's Save always settles; the guard settles a pending leave as false on unmount and on `session-expired`; external exits are latched (`beginExit`), and `confirmUnload` resets after `UNLOAD_CONFIRM_MS` or on `pageshow`; tab moves keep other search params; Return to 1health leaves modified clicks to the browser; the tab strip rule is an inset shadow with an inset focus ring; the header's sr-only `h1` names the current page (also while loading) and waits for Mobile before showing a Landline primary; `sessionEvents.reset()` (test hook) and `resetTestNavigation()` run around every client test.
- e2e sign-in goes through a routed `Set-Cookie` response (`e2e/fixtures.ts#signIn`): CDP refuses to add a `__Host-` cookie directly.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-14; Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Finding | Verdict | Route |
|---|---|---|---|
| 1 | Throwing `validate()` leaves the guard dialog busy forever | medium | patch |
| 2 | Pending leave never settles if LeaveGuard unmounts | low | patch |
| 3 | Session expiry during guard Save stacks two alertdialogs | low | patch |
| 4 | Double external exit runs callbacks/logout/assign twice | medium | patch (in-flight latch) |
| 5 | Modified clicks on Return log out the current tab | low | patch (`isPlainClick`) |
| 6 | `unloadConfirmed` never reset | low | patch |
| 7 | Tab change / normalization drops other query params | medium | patch |
| 8 | TabsList not positioned; overflow clips focus ring/underline | medium | patch (a11y) |
| 9 | Fallback `h1` says "Personal Profile" on `/account`; no `h1` while loading | low | patch |
| 10 | Header phone flips Landline → Mobile | low | patch |
| 11 | Initials break on astral characters | low | patch |
| 12 | `useMediaQuery` resize untested | medium | patch (test) |
| 13 | `usePortalUrl` outside-provider test deleted | low | patch (test) |
| 14 | Shared `/myself` request and once-only session-expired tests deleted | low | patch (tests) |
| 15 | Order-dependent tests / global navigation stub state | low | patch |
| 16 | Fixture page 404 gate untested | medium | patch (test) |
| 17 | Flaky fixed waits in e2e | low | patch |
| 18 | ConfirmDialog indentation | low | patch |
| 19 | `/account` 404 makes the clean page-switch e2e vacuous | low | defer (Story 7.1) |
| 20 | Header phone shown raw | low | defer (Story 7.4 `formatPhoneDisplay`) |
| 21 | Failed save in guard gives no Section feedback | low | defer (7.5 edit model) |
| 22 | Registry re-registers stale id when `id` prop changes | low | reject (ids are static per Section) |
| 23 | `TabsList loop` default redundant | low | reject (cosmetic) |

