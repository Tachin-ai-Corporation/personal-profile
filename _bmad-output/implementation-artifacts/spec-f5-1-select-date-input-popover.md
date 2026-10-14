---
title: 'F5-1 Select (aria-disabled + helper), date input with calendar, popover and info-popover'
type: 'feature'
created: '2026-10-14'
status: 'in-review'
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
- [x] `package.json` -- pinned deps.
- [x] `components/ui/select.tsx` (+tests) -- aria-disabled, helper, loading, placeholder, unlisted value.
- [x] `components/ui/{popover,info-popover}.tsx` (+tests) -- popover and info-popover.
- [x] `components/ui/{date-input,calendar}.tsx`, `lib/shared/person-rules.ts#birthDateBounds` (+tests) -- date input and calendar.
- [x] `app/test-fixtures/inputs/page.tsx`, `app/test-fixtures.test.ts`, `e2e/inputs.spec.ts` -- browser fixture, gate test, e2e.

**Acceptance Criteria:**
- Given the inputs fixture in light and dark at desktop and 360 px, when axe runs and a keyboard user operates every control, then there are no violations and focus is never lost.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, 100% on `lib/**`
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

Implemented 2026-10-14.

- **Deps** (exact pins): `@radix-ui/react-popover@1.1.23`, `react-day-picker@10.0.1`, `date-fns@4.4.0` (all older than two weeks; no release-age exclusions needed).
- **Select** (`components/ui/select.tsx`, backward compatible; Jump to unchanged): new root props `ariaDisabled`, `helper`, `loading`, `placeholder`, `unlistedValue: { value, label? }` (exported `SelectProps`, `SelectUnlistedValue`), shared with the parts through a context. `ariaDisabled` forces `open={false}` and prevents the trigger's pointerdown/keydown (all keys but Tab)/click before Radix sees them, so neither opening nor closed-trigger typeahead can change the value; a pointer press still focuses the trigger. Styling follows `button-aria-disabled` (muted fill and text, not-allowed cursor). `helper` renders a `help-text` line right after the trigger (`data-slot="select-helper"`) and its id is appended after FormField's `aria-describedby` ids. `loading` → `aria-busy`. `placeholder` is used by `SelectValue` unless it has its own. `unlistedValue` renders a hidden, disabled item inside `SelectContent` so the trigger shows `label ?? value`, and the value is never listed, keyed to or typed to (not selectable again once changed).
- **Popover** (`components/ui/popover.tsx`): shadcn parts (`Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverContent`, `POPOVER_CONTENT_STYLES`); non-modal by default; content `side="bottom" align="start"`, 4 px offset, 16 px collision padding (flips above only without room, verified in e2e), popover tokens, `rounded-md`, `shadow-lg`, `motion-reduce:animate-none`.
- **InfoPopover** (`components/ui/info-popover.tsx`): `InfoPopover({ trigger, title?, label?, children, state?: "loading" | "error" | "forbidden", errorMessage?, onRetry?, onOpenChange?, contentId?, contentClassName? })` + `LinkTextButton` (the `link-text` trigger / "Try again." button, 44 px tall), `INFO_POPOVER_HOVER_DELAY_MS` 150. Controlled open with a reason (hover / focus / click). Mouse hover opens after 150 ms; additions beyond the spec: a hover-opened popover closes 100 ms after the pointer leaves both trigger and content (WCAG 1.4.13, like the Tooltip), and a click on a hover-opened popover pins it. Presses toggle from the state at pointerdown (the tap pattern of `tooltip.tsx`), so the focus a press causes never opens it first; keyboard clicks (`detail` 0) toggle. Escape: if focus was inside, it goes back to the trigger (and that focus doesn't reopen it). Blur out of trigger and content closes it (a blur with no new target, e.g. window switch, doesn't). Since the content is portaled, Tab is bridged: trigger → first focusable inside → the element after the trigger (closing it); Shift+Tab from the first focusable → trigger. "Try again." moves focus to the content before calling `onRetry`, so focus isn't lost when the button unmounts. Content is 280 px (`w-70`), named by `title` (or `label`).
- **Copy**: new area file `lib/shared/messages/controls.ts` (`CONTROL_MESSAGES`, all DRAFT COPY: `loading` "Loading…", `supportContactLoadError` "Couldn't load the support contact.", `tryAgain` "Try again.", `chooseDate` "Choose date", `datePlaceholder` "MM/DD/YYYY"), aggregated as `MESSAGE_CATALOG.controls`; the forbidden state reuses `STATE_MESSAGES.noAccess`.
- **Dates** (`lib/shared/dates.ts`, 100% covered): `DateBounds`, `isWireDateWithin(value, bounds)` (the "typing validation hook" for callers' schemas), the mask helpers `maskDisplayDate`, `digitsBefore`, `caretAfterDigits`, `pastedDisplayDate`, `DISPLAY_DATE_LENGTH`. `lib/shared/person-rules.ts#birthDateBounds(roles, today)` → `{ min, max }` wire dates, the exact bounds of `isBirthDateInRange` (Proctor at 2026-10-14: 1906-10-14 … 2005-10-14; Feb 29 per Java `minusYears`).
- **DateInput** (`components/ui/date-input.tsx`): `DateInput({ value, onChange(value, { text }), min?, max?, calendar?, calendarLabel?, today?, wrapperClassName?, …input props })`. `onChange` gets `""` unless the text is a real date, plus the shown `text`, so a schema can tell "Birth date is required" (empty) from "Enter a date as MM/DD/YYYY" (text present, value `""`); the input itself shows no message. Slashes are inserted once a digit follows; Backspace right after a slash deletes the digit before it; the caret stays on the same digit after masking; paste of `MM/DD/YYYY` or `YYYY-MM-DD` (trimmed) is taken whole. A new `value` from outside replaces the text; the echo of its own edit doesn't (so partial text survives). FormField props land on the input (error border via `INPUT_STYLES`). The calendar (44 px trailing button, `aria-haspopup="dialog"`) opens a **modal** Popover (`aria-modal`, focus trapped, Escape returns focus to the button) anchored to the whole input box, starting at the selected date, else today clamped to the bounds; `min`/`max` bound both the year dropdown range and the disabled days. Without bounds the dropdowns span 120 years back and 20 years ahead (`CALENDAR_YEARS_BACK`/`AHEAD`; react-day-picker's default would end at the current year, which future dates such as insurance expiry need). Modal rather than non-modal because a non-modal portaled calendar lets Tab leave it into Radix's focus guards and lose focus.
- **Calendar** (`components/ui/calendar.tsx`): DayPicker on tokens only (no library CSS): visible native month/year selects (44 px, `control-border`, chevron), 44 px day buttons and nav buttons, `focus-ring`, selected = primary, today bold underlined, outside days muted; keyboard grid from the library.
- **Fixture / tests**: `app/test-fixtures/inputs/page.tsx` → `features/shell/__fixtures__/inputs-fixture.tsx` (behind `PP_E2E_FIXTURES`), gate test in `app/test-fixtures.test.ts`, unit tests for every component (`select`, `popover`, `info-popover`, `calendar`, `date-input`; Testing Library, real event order) and `e2e/inputs.spec.ts` (axe light/dark at desktop and 360 px with the listbox, the calendar and an info popover open; keyboard operation of every control; 44 px targets; no horizontal scroll; placement and flip).
- **E2E port**: `e2e/server-env.ts` exports `E2E_PORT` = `PP_E2E_PORT` or 3100 (kill-switch servers on the next two ports) and `playwright.config.ts` uses it, so parallel worktrees can run `PP_E2E_PORT=3170 pnpm test:e2e` without reusing another checkout's server; the default is unchanged. `eslint.config.mjs` lets `e2e/server-env.ts` read `process.env` (like `*.config.*`).
- **Known limitation**: with a Radix Select listbox open, axe's `aria-hidden-focus` flags the page because Radix Select (the F3-1 port) hides it with `aria-hidden` while trapping focus but without `aria-modal`; the e2e therefore scans only the listbox in that state (commented in `e2e/inputs.spec.ts`). The page and every other state are scanned whole. Radix restores focus to a closed listbox's / modal popover's trigger one task after closing; the e2e waits 50 ms before moving focus programmatically (`settleFocus`).
- **Verification** (2026-10-14): `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 111 files / 2195 tests green, 100% on the covered `lib/**`; `PP_E2E_PORT=3170 pnpm test:e2e` 175 passed, 1 skipped (desktop-only placement test on 360 px), and `e2e/inputs.spec.ts` stable with `--repeat-each=6`; `pnpm build` OK (`/test-fixtures/inputs` dynamic); `bash scripts/check-forbidden.sh` OK.

**Review fixes (2026-10-14, commit "fix: F5-1 review findings").**
- **DateInput:** new `resetKey` prop; forms bump it on reset or Cancel so partial text is cleared even when the value already is `""`. `disabled` and `readOnly` now skip the slash-Backspace and paste handlers, and close an open calendar. Delete just before a slash removes the digit after it. Dates are built with `setFullYear`, so years 0001–0099 stay in their own century. Inverted `min > max` bounds are ignored, with a non-production `console.warn`; this goes through the new `lib/shared/dates.ts#parseDateBounds`, which `isWireDateWithin` now uses too.
- **Select:**
  - `ariaDisabled` blocks only the opening and typeahead keys (Enter, Space, arrows, Home/End, printable keys without Ctrl/Meta/Alt); browser shortcuts pass through.
  - `loading` adds a trigger spinner and a disabled "Loading…" row (`CONTROL_MESSAGES.loading`).
  - Radix always gets a controlled `open`, with internal state when the caller doesn't control it.
  - `unlistedValue` adds no hidden item for `""` or for a value that is already listed. Only `SelectItem`s written directly in `SelectContent` are seen; custom wrappers are not.
- **InfoPopover:**
  - Props are a union, so `title` or `label` is required.
  - The default error line is the generic `CONTROL_MESSAGES.loadError` "Couldn't load this information." (DRAFT). "Couldn't load the support contact." moved to `NPI_MESSAGES.practiceSupportLoadError` for Story 9.3.
  - A press released or cancelled away from the trigger is forgotten through document listeners.
  - Focus entering the content turns a hover-open into a focus-open, so the hover-close timer can't unmount focused content.
  - Tab from the focused container goes to its first link.
  - The tab-stop scan skips `display: none` and `visibility: hidden`, and includes `summary`, `iframe`, `audio`/`video[controls]` and `[contenteditable]`.
  - When the trigger is the page's last tab stop, Tab out of the last link closes the popover with focus on the trigger. Radix's looping focus scope would otherwise wrap focus back in, and the browser can't move on.
- **e2e and tooling:**
  - The fixture uses a fixed today (2026-10-14), and the calendar test checks exact day names (Oct 14 enabled, Oct 15 disabled, Oct 1 → Sep 30).
  - `PP_E2E_PORT` is validated (an integer from 1 to 65533, with a clear error), and the three-port stride is documented.
  - The fixture clears its retry timer on unmount.
  - The two formatting slips are fixed by hand: the repo has no formatter installed.

## Spec Change Log

## Review Triage Log
