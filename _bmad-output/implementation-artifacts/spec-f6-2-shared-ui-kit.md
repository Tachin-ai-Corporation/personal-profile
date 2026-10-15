---
title: 'F6-2 Shared UI kit: dialogs, menus, rows, chips, phone input'
type: 'feature'
created: '2026-10-14'
status: 'in-progress'
baseline_commit: '8547231'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/docs/DESIGN-SYSTEM.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
  - '../1health-fe/src/components/PhoneNumberInput/PhoneNumberInput.tsx'
  - '../1health-fe/src/utils/phoneNumber/phoneNumberUtils.ts'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A cross-team audit found UI pieces that several stories of both teams need and that the foundation does not provide yet: a row menu (DropdownMenu), checkbox, switch, a sized/full-screen Dialog and a Sheet, an outline-destructive button, square chips, empty states, a polite announcer, the `qr-surface` token and Ledger typography utilities, a Combobox input ref, the Section row kit (row actions + kebab, draft row removal, Section table with stacked mobile cards), a phone input and a countdown hook. Without them each team builds its own in the same files (Stories 1.10, 1.11, 3.1–3.7, 4.1, 4.2, 4.4, 5.1, 5.2, 5.5, 8.2, 8.3, 9.x, 10.1, 10.2).

**Approach:** Build them once as foundation primitives (`components/ui/*`, `features/shell/*`, `lib/shared/phone.ts`, `app/globals.css`), on semantic tokens and catalog copy, each with Testing Library + axe tests, one fixture page behind `PP_E2E_FIXTURES` and one e2e spec. No story wiring. Pre-approved by the human (2026-10-14): write the spec, then implement directly.

## Boundaries & Constraints

**Always:**
- **Deps once**, exact versions at least two weeks old, lockfile updated: `@radix-ui/react-dropdown-menu`, `@radix-ui/react-checkbox`, `@radix-ui/react-switch` (the July 2026 generation that matches the pinned popover 1.1.23 / select 2.3.7). No canvas or other test dependency (mock instead).
- **`components/ui/dropdown-menu.tsx`, `checkbox.tsx`, `switch.tsx`**: shadcn parts on semantic tokens (`row-menu`: popover fill, `rounded-md`, `shadow-md`; 44 px items; destructive item in `error-strong`), every control a 44 px target, `focus-ring`, reduced motion.
- **Dialog** (`components/ui/dialog.tsx`): `size` (`default` 440 px per DESIGN.md `picture-dialog`/`qr-dialog`, `lg`), popover surface, `rounded-lg`, `shadow-lg`, `bg-scrim` overlay, optional full-screen below 768 px with pinned header and footer and a scrolling `DialogBody`, a 44 px close button named from the catalog, `dismissible={false}` (busy: Escape, scrim and close do nothing), `initialFocus` ref. **Sheet** (`components/ui/sheet.tsx`, on the installed Radix dialog): right side, 480 px, full height over the scrim, sticky header (title + 44 px close; a back control in its place below 768 px, where the sheet is full-screen), scrolling body, sticky footer, same `dismissible`/`initialFocus`. **ConfirmDialog** gains `busyLabel` (default "Saving…").
- **Button** `outline-destructive` variant (DESIGN.md `button-outline-destructive`: card fill, border, `error-strong` text, muted hover).
- **Chip** (`components/ui/chip.tsx`): `label` (muted, square), `primary` (the only filled chip), `deleted`, and the "+N" `OverflowChip` (bordered, `rounded-sm`, focusable 44 px trigger with a caller-supplied accessible name). Chips in cells are `rounded-sm` (DESIGN.md Shapes Ledger delta); `Badge` keeps the design system's pill. `docs/DESIGN-SYSTEM.md` documents the split.
- **EmptyState** (`components/ui/empty-state.tsx`): `card` (dashed border, copy, optional title/children, optional primary action) and `row` (one full-width table row spanning the columns, muted copy + link-text action).
- **LiveStatus / `useAnnounce()`** (`components/ui/live-status.tsx`): one polite status region; announcing the same text again is heard again; `clear()` empties it. No refactor of existing announcers.
- **Tokens/utilities** in `app/globals.css` (+ `globals.test.ts`): `qr-surface` (#ffffff in both themes, `bg-qr-surface`), `@utility` roles `mono-value`, `cell-strong`, `section-title`, `kv-value-empty`, `control-max-wide` (720 px), exactly as DESIGN.md typography/spacing define them.
- **Combobox `inputRef`**: a ref to the text input (merged with the internal one) so `useSectionForm` `field()` refs can register it.
- **Row kit** (`features/shell`, exported from `index.ts`): `RowActions` (desktop inline ghost actions that fade in on row hover/focus-within, none under reduced motion, plus an always-visible 44 × 44 kebab named "More actions for {name}" whose menu repeats every action, never shows an item without a handler, shows destructive items in `error-strong`, and keeps aria-disabled items focusable with their reason); `RowRemoval` ("Removed on save" + Restore, "New · not saved", Remove; a ref to focus Restore); `SectionTable` (real `<table>` with column headers on desktop, hairline dividers, accent hover/focus-within in read view, an actions column, an empty-state row spanning the columns; stacked cards below 768 px with the same action names).
- **PhoneInput** (`components/ui/phone-input.tsx`): country picker (flag + dial code, on the existing `Select`, every libphonenumber region, default `us` as in 1health-fe), national number input (16 px, 44 px), digits clamped to the country's maximum length, formatting on blur, paste of an international number switches the country, value `{ region, national }` with `toE164`; `lib/shared/phone.ts` gains the pure helpers (region list, flag, dial code, parse/format/validate, E.164) at 100 % coverage. Validation follows 1health-fe: +1 regions need exactly 10 digits, others must be valid for the country.
- **`useCountdown`** (`features/shell/use-countdown.ts`): whole seconds left to a deadline (60 s resend, 30 s auto-hide), `start`/`stop`, `onDone`, drift-free, independent of reduced motion; fake-timer tests.
- Copy only from the catalog. A generic word already in `COMMON_MESSAGES` is imported from there; otherwise it goes in `lib/shared/messages/section.ts` (allowed for this spec; spec F6-3 may move shared words to `common.ts`). Catalog uniqueness and the verbatim/DRAFT rules hold.
- Tests for each piece (Testing Library real events + axe); fixture page `app/test-fixtures/ui-kit/page.tsx` behind `PP_E2E_FIXTURES` + a gate test row; `e2e/ui-kit.spec.ts` (desktop + 360 px, light/dark axe, 44 px targets, no horizontal scroll).

**Never:**
- No story wiring (no Contacts/Insurance/MFA screens, no endpoints, no schemas).
- Don't touch `features/shell/{page-tabs,profile-tabs,contacts-panel,insurance-panel,page-frame,use-section-form,state-frame}.tsx`, `proxy.ts`, `app/page.tsx`, `lib/api/*`, `e2e/fixtures.ts`, `lib/shared/messages/common.ts` (other specs own them) except to import.
- No hex or palette classes, no hard-coded user-facing strings, no second confirm dialog, no hover-only affordance.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Busy dialog | `dismissible={false}` | Escape, scrim click and the close button do nothing | close button `aria-disabled` |
| Full-screen dialog | < 768 px, `fullScreenOnMobile` | fills the viewport; header and footer stay put while the body scrolls | no horizontal scroll at 360 px |
| Sheet close | close, Escape, scrim, mobile Back | `onOpenChange(false)` (the editor runs its guard) | blocked while not dismissible |
| Kebab | actions incl. an aria-disabled one | menu repeats every action; the disabled item is focusable, does nothing and shows its reason | items without a handler are dropped |
| Row removal | Remove saved row / Restore | "Removed on save" + Restore; Restore focusable by ref | new rows: caller deletes outright |
| Empty table | no rows | one row spanning all columns (desktop) or one card (mobile) | — |
| Phone typing | US, 11th digit | ignored (clamped) | — |
| Phone paste | "+44 20 7183 8750" in a US field | region switches to GB, national "20 7183 8750" | unparsable paste kept as typed |
| Phone validate | US "415 555 212" / GB "123" | `tenDigits` / `invalid` | empty → `required` |
| Countdown | start(60) | 60 … 1, then `onDone` once and `remaining` 0 | restart replaces the deadline |
| Announce twice | announce("Link sent") ×2 | the second is heard (text differs by a trailing no-break space) | clear() empties |

</frozen-after-approval>

## Code Map

- `components/ui/{button,dialog,confirm-dialog,combobox,select,input,form-field,tooltip,disabled-action,link-text-button}.tsx` -- extended or reused.
- `components/ui/{dropdown-menu,checkbox,switch,sheet,chip,empty-state,live-status,phone-input}.tsx` -- new.
- `features/shell/{row-actions,row-removal,section-table,use-countdown}.tsx|ts`, `features/shell/index.ts` -- row kit and countdown.
- `lib/shared/phone.ts`, `lib/shared/messages/section.ts` -- helpers and copy.
- `app/globals.css`, `app/globals.test.ts`, `docs/DESIGN-SYSTEM.md`, `docs/FOUNDATION.md` -- tokens, utilities, docs.
- `app/test-fixtures/ui-kit/page.tsx` → `features/shell/__fixtures__/ui-kit-fixture.tsx`, `app/test-fixtures.test.ts`, `e2e/ui-kit.spec.ts` -- fixture, gate, e2e.

## Tasks & Acceptance

**Execution:**
- [ ] Deps + `dropdown-menu`, `checkbox`, `switch` (+tests).
- [ ] Dialog sizes/full-screen/dismissible/initial focus, `Sheet`, `ConfirmDialog busyLabel` (+tests).
- [ ] Button `outline-destructive`, `Chip`/`OverflowChip`, `EmptyState`, `LiveStatus`/`useAnnounce` (+tests).
- [ ] `globals.css` token and utilities (+test), DESIGN-SYSTEM.md chip note.
- [ ] Combobox `inputRef` (+test).
- [ ] `RowActions`, `RowRemoval`, `SectionTable`, `useCountdown` (+tests, exports).
- [ ] `phone.ts` helpers (100 %) and `PhoneInput` (+tests).
- [ ] Fixture page, gate test, `e2e/ui-kit.spec.ts`; FOUNDATION.md catalog rows.

**Acceptance Criteria:**
- Given the fixture page at desktop and 360 px, when a keyboard and a touch user open the dialogs, the sheet and the row menu, toggle the checkbox and switch, and use the phone input, then behaviour matches the matrix, every target is at least 44 px, nothing scrolls sideways and axe reports no violations in light and dark.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm install` -- expected: lockfile in sync
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, thresholds met
- `PP_E2E_PORT=3210 corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

## Spec Change Log

## Review Triage Log
