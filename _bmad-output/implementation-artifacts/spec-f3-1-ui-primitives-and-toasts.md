---
title: 'F3-1 UI primitives and toasts'
type: 'feature'
created: '2026-10-14'
status: 'draft'
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
- [ ] `package.json` -- pin `@radix-ui/react-tooltip`, `@radix-ui/react-select@2.3.7`.
- [ ] `components/ui/{tooltip,disabled-action,info-icon-button,inline-banner,status-badge,form-field,input-locked,select}.tsx` (+tests) -- primitives.
- [ ] `components/ui/button.tsx`, `confirm-dialog.tsx` (+tests) -- busy state.
- [ ] `features/shell/toasts.ts`, `hooks/use-toast.ts`, `components/ui/{toast,toaster}.tsx` (+tests) -- toasts.
- [ ] `features/shell/read-state.tsx` (+tests) -- LoadError on InlineBanner.
- [ ] `app/globals.css`, `lib/shared/messages/*` -- focus-ring, copy.

**Acceptance Criteria:**
- Given any new primitive rendered in light and dark, when axe runs, then there are no WCAG 2.1 AA violations.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, 100% on `lib/**`
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

## Spec Change Log

## Review Triage Log
