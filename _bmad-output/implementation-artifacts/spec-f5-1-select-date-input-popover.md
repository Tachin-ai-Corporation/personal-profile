---
title: 'F5-1 Select (aria-disabled + helper), date input with calendar, popover and info-popover'
type: 'feature'
created: '2026-10-14'
status: 'in-progress'
baseline_commit: 'a95a7ec689ba8d773395a48f8ae1871efa4156d4'
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

**Problem:** Stories of both teams need the same input controls: a Select that can be shown but not opened (with a helper that explains why), a masked `MM/DD/YYYY` date input with an optional calendar bounded by the person rules, and a non-modal popover with the three info-popover variants. Only a basic Select exists (F3-1 port); no date input, calendar or popover exists.

**Approach:** Build the F5-1 slice of `shared-foundation-plan.md` ("F4 / F5 decisions") on F1 (`lib/shared/{dates,person-rules}.ts`, `PERSON_MESSAGES`) and F3-1 (`select.tsx`, `tooltip.tsx` tap handling, `info-icon-button.tsx`, `form-field.tsx`). Approved by the human in advance (2026-10-14): implement directly after writing this spec.

## Boundaries & Constraints

**Always:**
- **Select** (`components/ui/select.tsx`, extended): `ariaDisabled` keeps the trigger focusable with `aria-disabled="true"` and blocks opening by pointer and keyboard; `helper` (ReactNode, may contain an in-app link that uses `navigate()`) referenced by `aria-describedby` and composable with `FormField`; `loading` sets `aria-busy`; `placeholder` prop (no hard-coded copy); a stored value that is not among the options is still shown (label if known, else the raw code) and is not selectable again once changed. Consumers: 7.5, 7.6 (Team B); 2.2, 4.2, 5.2 (Team A); F3-3 Jump to.
- **Popover** (`components/ui/popover.tsx`, pinned `@radix-ui/react-popover@1.1.23`): non-modal, popover tokens, `rounded-md`, `shadow-lg`, placed below with left edges aligned and flipping above only without room.
- **InfoPopover** (`components/ui/info-popover.tsx`): 280 px; controlled open — hover after 150 ms, keyboard focus on the trigger (focus stays on the trigger), click/tap (reuse the tap handling pattern from `tooltip.tsx`); closes on Escape (focus back to the trigger), blur out of trigger and content, outside click; Tab from the trigger reaches links inside the popover; trigger `aria-expanded`/`aria-controls`; trigger is `InfoIconButton` or a `link-text` button. Content is generic: `title?`, `children`, plus optional `state: "loading" | "error" | "forbidden"` slots with catalog copy ("Loading…", "Couldn't load the support contact." + "Try again." DRAFT where not verbatim, the no-access line) so 9.1, 9.3 and 10.2 only supply content.
- **DateInput** (`components/ui/date-input.tsx`) + **Calendar** (`components/ui/calendar.tsx`, pinned `react-day-picker@10.0.1` with `date-fns` 4.x): masked `MM/DD/YYYY` (`inputMode="numeric"`, slashes auto-inserted, paste of `MM/DD/YYYY` or `YYYY-MM-DD` accepted), value/onChange in wire format `YYYY-MM-DD | ""` via `lib/shared/dates.ts`; optional 44 px calendar button (`calendar` prop) opening the Calendar in a Popover with month/year dropdown captions; `min`/`max` props (wire dates) bound both typing validation hooks and the calendar; a helper `birthDateBounds(roles, today)` in `lib/shared/person-rules.ts` returns the bounds from F1's backend-aligned rule (18–120, 21–120 for Proctor); validation messages come from `PERSON_MESSAGES` via the caller's zod schema (the input never invents copy). Works inside `FormField` (aria wiring, error border).
- WCAG 2.1 AA: keyboard operable (calendar grid arrows, Escape, focus return), 44 px targets, axe in a browser fixture (`app/test-fixtures/inputs` behind `PP_E2E_FIXTURES`), reduced motion; semantic tokens only (token gate green).
- Tests for every component (Testing Library with real event order) and an e2e spec for the fixture (light/dark axe, 360 px).

**Never:**
- No Combobox (F5-2), no drafts (F4), no feature forms. No hard-coded feature copy beyond the generic popover states.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Disabled Select | Enter/Space/click on an `ariaDisabled` Select | stays closed, focus stays, helper announced | — |
| Unlisted value | stored `America/Phoenix`, options exclude it | trigger shows it; choosing another value works | — |
| Typing a date | `0`,`2`,`2`,`9`,`2`,`0`,`2`,`4` | shows `02/29/2024`, onChange `"2024-02-29"` | invalid `02/30/1990` → onChange `""` + caller error |
| Bounds | Proctor, today 2026-10-14 | calendar disables dates after 2005-10-14 and before 1906-10-14 | — |
| InfoPopover | hover 150 ms / focus / tap / Escape | opens / opens without moving focus / opens / closes with focus on trigger | outside click closes |

</frozen-after-approval>

## Code Map

- `components/ui/{select,tooltip,info-icon-button,form-field,input}.tsx` (F3-1) -- extend Select; reuse tap handling, trigger, field wiring, input styles.
- `lib/shared/{dates,person-rules}.ts`, `lib/shared/messages/{person,common}.ts` (F1) -- parsing, bounds, copy.
- `app/test-fixtures/primitives/page.tsx`, `app/test-fixtures.test.ts`, `e2e/primitives.spec.ts` -- pattern for the new fixture page, gate test and e2e.
- `package.json` -- add `@radix-ui/react-popover@1.1.23`, `react-day-picker@10.0.1`, `date-fns` (4.x, ≥2 weeks old).

## Tasks & Acceptance

**Execution:**
- [ ] `package.json` -- pinned deps.
- [ ] `components/ui/select.tsx` (+tests) -- aria-disabled, helper, loading, placeholder, unlisted value.
- [ ] `components/ui/{popover,info-popover}.tsx` (+tests) -- popover and info-popover.
- [ ] `components/ui/{date-input,calendar}.tsx`, `lib/shared/person-rules.ts#birthDateBounds` (+tests) -- date input and calendar.
- [ ] `app/test-fixtures/inputs/page.tsx`, `app/test-fixtures.test.ts`, `e2e/inputs.spec.ts` -- browser fixture, gate test, e2e.

**Acceptance Criteria:**
- Given the inputs fixture in light and dark at desktop and 360 px, when axe runs and a keyboard user operates every control, then there are no violations and focus is never lost.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, 100% on `lib/**`
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

## Spec Change Log

## Review Triage Log
