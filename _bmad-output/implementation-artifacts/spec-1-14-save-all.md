---
title: 'Story 1.14: Save all bar and pill on /'
type: 'feature'
created: '2026-10-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '714d896412bf085ee639bad4f0a60a1a25df049e'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On `/` a user who edits several Sections has to save each one separately. The `features/save-all` `SaveAllBar` is still a stub that renders nothing, so Story 1.14's bar and pill (FR5, UX-DR31/32/57, AD-8) are missing.

**Approach:** Replace only the `SaveAllBar` body. Build it on the foundation as it is: `useDirtyCount`, `useSectionRegistry`, `runSaveAll(registry, { order: SAVE_ORDER })`, which includes PR #7's D-A batch check, `saveAllSummary`, `toastSuccess`/`toastPartial`, the busy `Button`, `useMediaQuery(DESKTOP_QUERY)` and `--toast-bottom-offset`. It renders a sticky bar from 768 px and a floating pill below that. Add the Vitest and Playwright specs; the Playwright spec runs on PR #7's `/test-fixtures/save-all`.

## Boundaries & Constraints

**Always:**
- The bar renders only while `useDirtyCount() >= 1` and leaves the DOM at 0.
  - **Bar (≥ 768 px):** a sticky bottom card with a top border, flat with no shadow, padding `6px` by the page gutter. It holds an 8 px warning dot, "{N} unsaved section" or "{N} unsaved sections" (weight 600, a polite live region), and a muted sub-line, which is a polite live region and stays empty until a run comes back `invalid`. On the right are "Discard all" (secondary) and "Save all (N)" (primary).
  - **Pill (< 768 px):** a centered, fixed, 44 px `rounded-full` `shadow-md` primary pill "Save all (N)" above the bottom edge, with no Discard action. It is hidden while the on-screen keyboard is open: an input, select or textarea has focus and `window.innerHeight - visualViewport.height >= 150`.
- **Toast offset:** while the pill shows, `--toast-bottom-offset` on `<html>` is raised so toasts sit above it. While the bar shows, it is raised by the bar's height, so a summary toast never covers "Save all". The property is removed when neither is shown and on unmount.
- **Save all:**
  - The run goes only through `runSaveAll(registry, { order: SAVE_ORDER })`.
  - While it runs, the button is `busy` with `busyLabel` `SECTION_MESSAGES.saving`, Discard all is disabled, and a second activation does nothing.
  - **`invalid`:** the sub-line shows `saveAllSummary(...).lines`, `focusFirstInvalid()` runs, and the focused field scrolls into view with `motionAwareScrollBehavior()`.
  - **`done`:** show the `saveAllSummary` toast, `success` → `toastSuccess` and `partial` → `toastPartial`. Then focus moves after the Sections have rendered their results:
    - **Any failure:** the first failed Section in page (`displayOrder`) order. Its first `[aria-invalid="true"]` control or its error `[data-slot~="inline-banner"][data-variant="error"]` inside `<section id={id}>` gets focus, or failing those, its `h2` (`sectionHeadingId`).
    - **Otherwise:** the `h2` of the first saved Section in page order.
  - **`session` / `clean`:** no toast and no focus move; the session dialog takes over.
- **Discard all** calls `discard()` on every dirty Save-all Section (`saveAll === true`), with no confirm. Then focus moves to the first discarded Section's `h2` in page order, because the bar unmounts and focus would otherwise drop to `<body>`. The sub-line is cleared.
- The sub-line clears when a run starts, on Discard all, and when the count reaches 0.
- Semantic tokens only. 44 px targets, `focus-ring`, reduced motion, AA in light and dark, and no horizontal scroll at 360 px.
- Every copy string comes from the catalog.

**Decisions (human, 2026-10-15):**
- **Copy home:** four keys are added to the shared `lib/shared/messages/section.ts` (`SECTION_MESSAGES`), add only (T3): `unsavedOne` "{count} unsaved section" (DRAFT COPY), `unsavedMany` "{count} unsaved sections", `saveAllCount` "Save all ({count})" and `discardAll` "Discard all". The last three are verbatim Voice and Tone. `messages.test.ts` adds those three strings to its Voice and Tone list and drops the "Not yet in it" comment. Both are approved foundation edits and ship in the feature commit.
- **E2E order:** a test-only edit to the foundation fixture `features/shell/__fixtures__/save-all-fixture.tsx` passes `onSave` to each participant and renders the saved ids, in order, as `data-testid="save-log"`. Runtime behavior doesn't change. The e2e asserts that the log follows `SAVE_ORDER`.
- **Spec size:** kept whole above the 1600-token guideline, because it is one goal.

**Never:**
- Don't edit `app/page.tsx`, `features/shell/**` (except the approved `__fixtures__/save-all-fixture.tsx`), existing `components/ui/*`, `lib/api/**`, `lib/shared/**` (except the approved `messages/section.ts` and `messages.test.ts`), `test/**` or `app/test-fixtures/**`. Don't build a second runner, page-user check, toast or media-query hook.
- No confirm on Discard all, no "All saved" unless F = 0, no Discard on the pill, and no Save all UI on `/account`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Count 0 → 2, desktop | two dirty Save-all Sections | the bar shows "2 unsaved sections", Discard all, "Save all (2)" | N/A |
| Guard-only dirty | only `insurance` (`saveAll: false`) dirty | no bar, no pill | N/A |
| Invalid | one dirty Section reads invalid | nothing sent; sub-line "Fixture email has 1 field to fix"; focus on its input | N/A |
| All succeed | personal + email dirty | "All saved." toast; focus on the first saved `h2` in page order; bar gone | N/A |
| One fails | phone + email dirty, phone fails | "1 saved, 1 failed" toast; bar "Save all (1)"; focus on phone's error, or its `h2` | N/A |
| Session | the batch check or a save ends the session | no toast, no focus move | the session dialog |
| Keyboard open, mobile | input focused, viewport shrunk ≥ 150 px | pill hidden, offset removed; reappears on blur or resize | N/A |
| Double activation | Save all clicked twice during a run | one run | N/A |

</frozen-after-approval>

## Code Map

- `features/save-all/save-all-bar.tsx` -- stub to replace; keep the `SaveAllBar` export (`index.ts` unchanged).
- `features/shell/save-all.ts` -- `runSaveAll`, which includes the D-A batch check (`checkPageUser` + `pageUser.runVerified`, PR #7), `saveAllSummary` (`invalid` lines / `success` / `partial` / `null`), and outcomes `clean | invalid | session | done` with `saved/failed/cancelled` in save order. Reuse as is.
- `features/shell/section-registry.tsx` -- `useSectionRegistry().getDirty()` (`displayOrder`; filter `saveAll`), `.get(id).displayOrder`, `useDirtyCount()`.
- `features/shell/leave-guard.tsx:117-129` -- the pattern to follow: the summary toast, then focus on the failed `h2` via `sectionHeadingId`.
- `features/shell/use-section-form.ts:397-425,519-545` -- a registered save (`withUi: false`) renders the field error (`aria-invalid`) or the `SectionFooter` `InlineBanner` (focusable, `data-slot="inline-banner"`, `data-variant="error"`) but doesn't move focus, so the bar focuses it.
- `features/shell/section-landmark.tsx` -- `<section id={id}>` with `h2#<id>-heading` (`tabIndex=-1`).
- `features/shell/{toasts.ts,use-media-query.ts,use-hash-anchors.ts}` -- `toastSuccess`/`toastPartial`, `DESKTOP_QUERY`, `motionAwareScrollBehavior`; all exported from `@/features/shell`.
- `components/ui/button.tsx` -- `busy` + `busyLabel` (inert while busy), `size="touch"`.
- `components/ui/toast.tsx:51`, `app/globals.css:319-323` -- the viewport reads `--toast-bottom-offset` (pill hint 4.5rem).
- `features/shell/page-frame.tsx:87` -- the slot is rendered after `main` on `profile` only, so it is last in the tab order and `/account` is already excluded (tested in `app/account.test.tsx`, `page-frame.test.tsx`).
- `app/test-fixtures/save-all/page.tsx`, `features/shell/__fixtures__/{save-all-fixture,fixture-participant}.tsx` -- the PR #7 Save-all test page: personal (1), phone (2), email (3), guard-only insurance, `?fail=<id>`, `dirty-count`. Participants have no `h2` or error element. Reuse; don't duplicate.
- `e2e/fixtures.spec.ts:130-156` -- the smoke case on that page (sign-in, AxeBuilder pattern).
- `test/providers.tsx` `renderInPage(ui, { page: "profile" })` -- unit tests (gives the registry and toaster).
- `lib/shared/messages/section.ts`, `messages.test.ts:116-118` -- the copy home and the verbatim list (approved foundation edits).

## Tasks & Acceptance

**Execution:**
- [x] `lib/shared/messages/section.ts` + `messages.test.ts` -- add the four keys and the three verbatim strings -- the approved copy home.
- [x] `features/shell/__fixtures__/save-all-fixture.tsx` -- `onSave` per participant and a `data-testid="save-log"` list of the saved ids in order -- the approved test-only edit that lets the e2e observe the order.
- [x] `features/save-all/save-all-bar.tsx` -- the bar, pill, run and Discard all, the post-run focus, the toast offset, and the keyboard-hidden pill (a local `useOnScreenKeyboard` in `features/save-all/use-on-screen-keyboard.ts`) -- the story body.
- [x] `features/save-all/save-all-bar.test.tsx` -- every I/O matrix row with `renderInPage` plus test Sections (a `useSectionForm` one for error/h2 focus, a `FixtureParticipant` for order via `onSave`), including the offset set/removed, the singular/plural count, the busy single run, the session outcome and reduced motion -- coverage of the matrix.
- [x] `e2e/profile-save-all.spec.ts` -- on `/test-fixtures/save-all?fail=phone` at desktop and 360 px: dirty phone + email → Save all → "1 saved, 1 failed", "Save all (1)", axe, no horizontal scroll; Discard all clears the bar (desktop); invalid → sub-line + focus; the pill hidden with a focused input and a shrunk `visualViewport` (360 px); "Save all" last in tab order; the `save-log` follows `SAVE_ORDER` (email before phone) -- the AC's Playwright spec.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- the `1-14-save-all` line only.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm build && pnpm test:e2e && bash scripts/check-forbidden.sh`), when it runs on Node 24, then all of it is green.
- Given the change, when it is diffed against its baseline commit, then no file outside the Team A paths and the two approved foundation edits (copy, fixture) changed.

## Implementation Notes

- **Bar position:** the bar is `sticky bottom-0` with `top: calc(100dvh - var(--save-all-bar-height))` (its measured height, set on the bar). `PageFrame` renders the slot right after `main` inside a `min-h-screen` block, so on a page shorter than the viewport plain `bottom: 0` would leave the bar under the content, mid-screen; the `top` inset pushes it to the bottom edge (clamped by that block), and on a long page `bottom: 0` keeps it there. The same measured height is the toast offset.
- **Sub-line:** one `<span>` per invalid Section (page order), inside the polite `role="status"` `<p>`; cleared when a run starts, on Discard all and when the count changes to 0 (adjusted while rendering).
- **Fixture `save-log`:** `onSave` fires as each participant's save starts, so a failed save (`?fail=`) is logged too; the e2e reads it as the call order.
- **Keyboard detection:** `focusout` re-checks in a microtask, because focus may still sit on the leaving element while the event runs.

- **Review patches (pass 1):**
  - The sub-line stores each line with its Section id and renders only Sections that are still dirty.
  - The `invalid` reveal skips an element inside the bar or pill.
  - An `aria-hidden` in-flow spacer (4.5rem) sits under the fixed pill, so it never covers the end of the page.
  - A `ResizeObserver` re-measure test, a test for the count going from 2 to 1, a test for the reveal skip, spacer assertions, and a test comment fixed.
- **Final verification (Node 24.22):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 3689/3689 passed, coverage thresholds met.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 429 passed and 5 skipped. Two of the skips are new and by design: Discard all on mobile, and the pill on desktop.
- **Nothing deferred.** Rejected findings are in the Review Triage Log.

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | VG, B | The `ResizeObserver` re-measure of the bar (`--save-all-bar-height`, `--toast-bottom-offset`) is never exercised, because jsdom has no `ResizeObserver` | low | Real: deleting `observe(bar)` leaves every test green → **patch** (a test with a stubbed `ResizeObserver`, a height change and `disconnect` on unmount). |
| 2 | E, B | The sub-line keeps naming a Section that is no longer dirty, e.g. one discarded on its own (2 → 1) | low | Real: the sub-line clears only at count 0 → **patch**: keep the invalid Section ids and render only the lines whose Section is still dirty. |
| 3 | E, B | The `invalid` reveal scrolls the Save all button when `focusFirstInvalid` defers focus (reveal pass) or focuses nothing | low | Real for `requestFocus("firstInvalid"/"error")` in `use-section-form.ts:327-336` → **patch**: don't reveal an element inside the bar or pill. |
| 4 | B | The fixed pill covers the end of the page (no bottom spacer) | medium | Real: no `pb-*` in `page-frame` or the panels, so the last Section's footer can sit under the pill → **patch**: a spacer of the pill's footprint while the pill shows. |
| 5 | B | The test comment "the bar has no Discard on the pill only" is garbled | low | Direct correction → **patch**. |
| 6 | E, B | Pinch-zoom shrinks `visualViewport.height`, so the pill hides while an input has focus | low | Real but rare: while a text field has focus on a phone, the keyboard is open anyway, and the frozen rule names the exact formula. Rejected. |
| 7 | E | A focused checkbox or radio (non-text input) counts toward keyboard detection | low | Needs zoom plus a focused checkbox at < 768 px, which is unlikely; the fix adds a guard. Rejected. |
| 8 | E | `runSaveAll` rejecting or `focusFirstInvalid` throwing gives an unhandled rejection | false | `validate`/`save` are wrapped (`safeValidate`/`safeSave`), `callApi` never throws, telemetry never throws, and `useSectionForm`'s `focusFirst` doesn't throw. |
| 9 | E, B | A saved or discarded Section with no `h2` drops focus to `<body>` | low | Every Section on `/` renders its `SectionLandmark` (FOUNDATION F6-1); only the test page has none. Rejected. |
| 10 | E | Discard all while a Section's own Save is in flight | low | Unlikely timing, the registry exposes no saving state, and the leave guard has the same window. Rejected. |
| 11 | B | The pill shows no invalid summary below 768 px | false | By design: the frozen spec and DESIGN.md "the pill carries only Save all". The inline errors and focus on the field remain. |
| 12 | B | The count's live region mounts together with its first text, so the first count may not be announced | low | The Section's own "Unsaved changes" indicator is already a polite region; later count changes are announced. Rejected. |
| 13 | B | The pill offset is hard-coded and ignores the safe area | low | The constant sits next to the pill's classes in the same file, and there is no `viewport-fit=cover`, so `env(safe-area-inset-bottom)` is 0. Rejected. |
| 14 | B | Focus is lost when the viewport crosses 768 px while Save all has focus | low | Needs a window resize while Save all is focused, which is rare. Rejected. |
| 15 | B | Runs with a `CANCELLED` Section have no bar test | low | Same `done` branch; the summary is tested in `save-all.test.ts`. Rejected. |
| 16 | B | The e2e checks a client `save-log`, not network request order | false | The human decision (2026-10-15) chose the fixture `save-log`; the fixture participants send no requests. |
| 17 | B | The new copy keys have no "verbatim" source comments | false | Not a rule: `unsavedChanges`, `saved` and `partialSaved` have none either; `messages.test.ts` enforces verbatim. |
| 18 | B | The diff leaves out the spec and `sprint-status.yaml` | false | Deliberate: the claims file is kept from the blind layers. |

## Design Notes

- **Focus after the run** goes through a state-driven effect in `SaveAllBar` (a `focusRequest` state set after `runSaveAll` resolves). The failed Section's `setSaveError` and `setError` updates commit in the same or an earlier render, so the error element exists when the effect runs.
- **Page order** comes from `registry.get(id)?.displayOrder`, not from the outcome's save order, which matches "first … in page order".

## Verification

**Commands** (the system Node is 26, so put Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; use `corepack pnpm` if `pnpm` isn't on `PATH`; never run `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, coverage thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass (Node 24)
