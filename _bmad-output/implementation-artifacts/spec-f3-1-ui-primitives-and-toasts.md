---
title: 'F3-1 UI primitives and toasts'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: 'e72e96885248d92bd39ef2600b351d8a39107963'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/shared-foundation-plan.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories of both teams need the same small UI primitives — tooltips, a disabled action that explains why, the 44 px info button, inline banners, status badges, a busy button, labelled form fields with errors, locked inputs, toasts, the focus ring and a Select — and none exist (or the existing toast is wrong: one at a time, shown at the top on desktop, fixed 3.5 s). Each team building its own guarantees divergent UI and conflicts in `components/ui`.

**Approach:** Build the F3-1 slice of `shared-foundation-plan.md` (Stories 1.11 L~1484–1497, 1.12 toasts L~1528–1556, DESIGN.md components and tokens, EXPERIENCE.md interaction rules) as `components/ui` primitives plus `features/shell/toasts.ts`, and port main's `components/ui/select.tsx` and `focus-ring` utility (commit `b005536`). Defaults decided by the human plan: toast radius from the DESIGN.md `toast` token, partial toast 5 s, locked inputs `readOnly` + `aria-readonly` (focusable).

## Boundaries & Constraints

**Always:**
- **Tooltip** (`components/ui/tooltip.tsx`, pinned `@radix-ui/react-tooltip` ≥2 weeks old): `tooltip` tokens, caption type, 6 px arrow, side top, elevation-1; one line on desktop, `wide` variant (`max-w-80`, wraps); opens on hover, keyboard focus and tap, closes on Escape, blur and outside tap (controlled for touch).
- **DisabledAction** (`components/ui/disabled-action.tsx`): Button look per DESIGN.md disabled-action, `aria-disabled="true"`, stays in tab order, click/Enter/Space are no-ops, reason in a Tooltip and in an always-rendered visually-hidden span referenced by `aria-describedby`.
- **InfoIconButton** (`components/ui/info-icon-button.tsx`): 44 px target, 18 px `CircleHelp` ("?") or `Info` ("(i)"), `muted-foreground`, required `aria-label`, `forwardRef` so it can trigger a Tooltip now and a Popover (F5).
- **InlineBanner** (`components/ui/inline-banner.tsx`): `error` and `info` variants per DESIGN.md; only the text is the live region (`alert`/`status`), the optional action sits outside it; optional `focusable` (`tabIndex=-1`). `features/shell/read-state.tsx#LoadError` moves onto it with unchanged copy and behaviour.
- **StatusBadge** (`components/ui/status-badge.tsx`): `verified` (CheckCircle, `success-strong`), `notVerified` (AlertCircle, `warning-strong`), `pending` (muted, no icon); always icon + word.
- **Button busy**: `busy?`, `busyLabel?` on `components/ui/button.tsx` (spinner + label, `aria-disabled`, `aria-busy`, clicks are no-ops, focus kept); `ConfirmDialog` refactored onto it.
- **FormField / FieldError** (`components/ui/form-field.tsx`): wires `id`, `aria-describedby` (help + error), `aria-invalid`; "{Label} (optional)" suffix muted; error = AlertCircle + `error-strong` text; invalid input gets the 2 px `error` border; inputs 44 px, 16 px text, `control-border`.
- **InputLocked** (`components/ui/input-locked.tsx`): muted fill, lock icon, `readOnly` + `aria-readonly`, focusable, help line referenced by `aria-describedby`.
- **Toasts** (`features/shell/toasts.ts`, the only importer of `hooks/use-toast`): `toastSuccess(text)` 5 s paused on hover/focus, `toastPartial(text)` 5 s, `toastError(text, { onRetry })` persistent with a "Retry" action; polite announcement; bottom-right on desktop, bottom-center on mobile with a CSS offset variable for a bottom pill; per-toast durations; `TOAST_LIMIT` raised to 3 and the remove delay reduced to the exit animation; copy from the catalog (add "Couldn't save {section}." DRAFT, "All saved." DRAFT, "{saved} saved, {failed} failed", toast close label DRAFT).
- **Select** (`components/ui/select.tsx`, pinned `@radix-ui/react-select` 2.3.7) and the `@utility focus-ring` in `app/globals.css`, ported from main `b005536`; existing focus styles switch to `focus-ring` where they hand-roll the same rule.
- Semantic tokens only (token gate stays green), WCAG 2.1 AA with axe in light and dark, 44 px targets, reduced motion respected. Component tests with Testing Library for every primitive (open/close paths, aria wiring, no-op disabled behaviour, timers for toasts), exported from their modules.

**Never:**
- No Section edit model, registry changes, state frames or section navigation (F3-2, F3-3). No Popover/Combobox/date input (F5). No feature-specific copy beyond what is listed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Disabled action | click / Enter / Space on `DisabledAction` | nothing happens; focus stays; reason announced via `aria-describedby` | — |
| Tooltip on touch | tap trigger, tap outside | opens, closes | Escape closes |
| Busy button | double click while `busy` | one action only; `aria-busy`; focus kept | — |
| Toasts | three toasts quickly | all three visible (limit 3), success auto-dismisses at 5 s unless hovered/focused | error persists until dismissed; Retry calls `onRetry` |
| Field error | `error` set on `FormField` | `aria-invalid`, `aria-describedby` includes the error id, 2 px error border | — |
| Locked input | Tab onto `InputLocked` | focusable, value read, help announced, not editable | — |

</frozen-after-approval>

## Code Map

- `components/ui/{button,toast,toaster,confirm-dialog,input,tabs}.tsx`, `hooks/use-toast.ts` -- busy prop, toast placement/duration/limit fixes, ConfirmDialog refactor, focus-ring adoption.
- `features/shell/read-state.tsx` -- LoadError onto InlineBanner.
- `app/globals.css` -- `focus-ring` utility (tooltip tokens already exist from 7.0b-1).
- `lib/shared/messages/{common,section}.ts` -- new toast/primitive copy.
- `eslint.config.mjs` -- `use-toast` ownership rule already allows only `features/shell/toasts.ts` (+ `components/ui/toaster.tsx`).
- Main reference: `git show b005536:components/ui/select.tsx`, `git show b005536:app/globals.css` (focus-ring).

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- pin `@radix-ui/react-tooltip`, `@radix-ui/react-select@2.3.7`.
- [x] `components/ui/{tooltip,disabled-action,info-icon-button,inline-banner,status-badge,form-field,input-locked,select}.tsx` (+tests) -- primitives.
- [x] `components/ui/button.tsx`, `confirm-dialog.tsx` (+tests) -- busy state.
- [x] `features/shell/toasts.ts`, `hooks/use-toast.ts`, `components/ui/{toast,toaster}.tsx` (+tests) -- toasts.
- [x] `features/shell/read-state.tsx` (+tests) -- LoadError on InlineBanner.
- [x] `app/globals.css`, `lib/shared/messages/*` -- focus-ring, copy.

**Acceptance Criteria:**
- Given any new primitive rendered in light and dark, when axe runs, then there are no WCAG 2.1 AA violations.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, 100% on `lib/**`
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

- **Pins:** `@radix-ui/react-tooltip@1.2.16` (2026-07-24, same Radix release as `react-select@2.3.7`; 1.3.x/1.4.x are under two weeks old).
- **Tooltip** (`Tooltip({ content, children, wide?, side?, contentId? })`) wraps its own Provider (`delayDuration` 0) and controls `open`: Radix ignores touch, so a tap toggles from the state at pointerdown (the browser focuses the trigger between pointerup and click, which already opens it) and the closes Radix sends during that tap are ignored (flag reset in a microtask). Content stays hoverable (WCAG 1.4.13). Radix closes a tooltip when its trigger's scroller scrolls (e.g. focus scrolling an off-screen trigger into view); the reason stays in `aria-describedby` for `DisabledAction`.
- **Button:** `busy` / `busyLabel`; base styles gain `focus-ring`, `aria-disabled:{cursor-not-allowed,opacity-50}`, `aria-busy:cursor-progress`. `asChild` never renders the spinner. `ConfirmDialog` confirm uses `busy`; its own `BUSY_STYLES` constant is gone.
- **Inputs:** `components/ui/input.tsx` now is the DESIGN.md input (44 px, `text-body`, `bg-card`, `control-border`, `focus-ring`, 2 px `error` border on `aria-invalid`) and exports `INPUT_STYLES` (reused by `InputLocked`). This also changes the /auth manual-LPL input.
- **FormField** is a render prop: `children(control)` gets `{ id, aria-describedby, aria-invalid }`; the error line sits in an `aria-live="polite"` wrapper; `labelAddon` hosts an `InfoIconButton`. "(optional)" is catalog copy (`COMMON_MESSAGES.optionalSuffix`, DRAFT).
- **StatusBadge** takes the word as `children` (no feature copy in the primitive).
- **Toasts:** tones live on `Toast` (`tone: default | success | partial | error`); `Toaster` renders every toast `type="background"` (polite) with a 5 s provider default; `toastError` uses `duration: Infinity` and a `ToastAction` "Retry" (closes the toast, calls `onRetry`). `TOAST_LIMIT` 3, `TOAST_REMOVE_DELAY` = `TOAST_EXIT_MS` 200 ms (= the toast's `[animation-duration:200ms]`). Viewport: `pointer-events-none` list, bottom-center < 768 px, bottom-right from `md`, `bottom-[var(--toast-bottom-offset)]` (`:root` default `0px` in globals.css). Close button is 44 px, always visible, named "Dismiss notification" (DRAFT). `hooks/use-toast` gains `resetToasts()` (tests); `features/shell/toasts.test.tsx` is allowed to import it (eslint override + `eslint.config.test.ts`).
- **Copy added:** `SECTION_MESSAGES.saveFailed` "Couldn't save {section}." (DRAFT), `allSaved` "All saved." (DRAFT), `partialSaved` "{saved} saved, {failed} failed" (verbatim); `COMMON_MESSAGES.optionalSuffix`, `dismissNotification` (DRAFT).
- **focus-ring adoption:** Button, Input, Select, toast action/close, dialog close, page nav, Return to 1health. Tabs keep their inset ring (an outset ring is clipped by the scrolling strip).
- **Tests:** Testing Library + axe (WCAG 2.1 A/AA tags, light and dark) per primitive (`test/axe.ts`, `test/dom-stubs.ts` for ResizeObserver/scrollIntoView/pointer capture); e2e `e2e/primitives.spec.ts` on the PP_E2E_FIXTURES-gated `/test-fixtures/primitives` page (real-browser contrast, 44 px targets, tap/hover tooltip, busy double click, toast stacking/placement/Retry).
- **Review fixes (2026-10-14):**
  - **Toasts.** `ADD_TOAST` evicts the oldest *non-error* toasts first and clears their pending removal timeouts. Error toasts are never dropped by the limit, so the queue can exceed 3 when every toast is an error. `toastError`'s Retry runs `onRetry` once per toast and dismisses in a `finally`. `TOAST_DURATION_MS` now lives beside `TOAST_EXIT_MS` in `components/ui/toast.tsx`.
  - **Tooltip.**
    - `TooltipProvider` is mounted once in `app/layout.tsx` (300 ms delay, 300 ms skip-delay). `Tooltip` falls back to its own provider when none is mounted.
    - Pen taps count as taps. A click is a tap only if `detail` ≠ 0, so keyboard-made clicks never count.
    - The pointer type resets on `pointercancel` and 1 s after a `pointerup` with no click.
    - Empty content renders only the trigger.
    - Tap handling moved to `onClickCapture`. Ignored closes now last until the task ends (`setTimeout` 0), because browsers run microtasks between React's capture and bubble listeners. Only e2e caught this.
    - `keepOpenOnPress` keeps a `DisabledAction` reason open on a mouse press.
  - **DisabledAction.** It is always `type="button"`. The e2e fixture puts it in a `<form>` with a submit counter, and Playwright clicks it with `force` (Playwright treats `aria-disabled` as disabled).
  - **Button.**
    - `busy` or `aria-disabled` makes it inert, and with `asChild` the child's own onClick is cloned away.
    - Busy uses `cursor-progress` only.
    - A given `busyLabel` adds an always-rendered, visually hidden polite status beside the button.
    - `ConfirmDialog` passes `busyLabel` "Saving…", so the busy confirm reads "Saving…". It lost its own status region and manual click guards. `IdleWarning` uses `Button busy`.
  - **FormField.** New `required` prop (`required` + `aria-required`). `help` emptiness now matches `error`'s.
  - **InputLocked.** `aria-describedby` lists the locked help first (visual order), and the right padding stays clear of the lock icon when invalid.
  - **InlineBanner.** Props spread first; a caller's `data-slot` is appended to `inline-banner`. A focusable banner shows the ring on `:focus`. `announceKey` remounts the live region. `LoadError` and `ReadStateFor` take `attempt`, so a repeated failure is announced again.
  - **Tests.** Unit axe runs once (light), and e2e covers dark with real contrast. `axe-core` is pinned to 4.13.0, the same minor as `@axe-core/playwright`. The e2e focus-ring check asserts the glow and "no ring after a mouse click". `app-bar.test.tsx` asserts `focus-ring` on every link.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-14; Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Finding | Verdict | Route |
|---|---|---|---|
| 1 | Error toast with Retry evicted by newer toasts; stale timers | high | patch |
| 2 | Retry fires twice; throwing onRetry leaves toast open | medium | patch |
| 3 | Mouse press closes DisabledAction reason tooltip | medium | patch (`keepOpenOnPress`) |
| 4 | DisabledAction Enter/Space tests prove nothing; `type="submit"` could block forms | medium | patch (forced `type="button"`, form e2e) |
| 5 | `aria-disabled` Button still clickable; asChild busy runs child onClick; competing cursors | medium | patch |
| 6 | Standalone busy Button not announced; IdleWarning hand-rolled busy | medium | patch |
| 7 | Per-instance tooltip providers with 0 delay; pen taps; stale pointer type; empty content | low | patch |
| 8 | FormField lacks required; help/error emptiness inconsistent | low | patch |
| 9 | InputLocked describedby order; invalid padding under lock icon | low | patch |
| 10 | InlineBanner props overwrite own attributes; no ring on programmatic focus | low | patch |
| 11 | Repeated LoadError not re-announced | low | patch (`attempt` / `announceKey`) |
| 12 | Unit axe dark runs meaningless; axe versions differ | low | patch |
| 13 | Focus-ring coverage missing (glow, mouse, app bar) | medium | patch (tests) |
| 14 | Shared Input restyle affects /auth | low | reject (auth e2e + axe green) |
| 15 | Unused catalog entries / plural in partial summary | low | reject (F3-2 consumes; V&T verbatim) |

