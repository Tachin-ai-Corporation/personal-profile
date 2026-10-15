---
title: 'F6-2 Shared UI kit: dialogs, menus, rows, chips, phone input'
type: 'feature'
created: '2026-10-14'
status: 'done'
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
- [x] Deps + `dropdown-menu`, `checkbox`, `switch` (+tests).
- [x] Dialog sizes/full-screen/dismissible/initial focus, `Sheet`, `ConfirmDialog busyLabel` (+tests).
- [x] Button `outline-destructive`, `Chip`/`OverflowChip`, `EmptyState`, `LiveStatus`/`useAnnounce` (+tests).
- [x] `globals.css` token and utilities (+test), DESIGN-SYSTEM.md chip note.
- [x] Combobox `inputRef` (+test).
- [x] `RowActions`, `RowRemoval`, `SectionTable`, `useCountdown` (+tests, exports).
- [x] `phone.ts` helpers (100 %) and `PhoneInput` (+tests).
- [x] Fixture page, gate test, `e2e/ui-kit.spec.ts`; FOUNDATION.md catalog rows.

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

Implemented 2026-10-14 on `8547231` (worktree branch; nothing pushed).

- **Deps** (exact, July 2026 generation, all > 2 weeks old, matching the pinned popover 1.1.23 / select 2.3.7): `@radix-ui/react-dropdown-menu@2.1.24`, `@radix-ui/react-checkbox@1.3.11`, `@radix-ui/react-switch@1.3.7`. New transitives: `@radix-ui/react-menu@2.1.24` and `@radix-ui/react-roving-focus` (corrected in review). No canvas or other test dependency.
- **Dialog** (`components/ui/dialog.tsx`; `DialogContent` had no consumer, so it was reshaped): `size` `default` 440 px / `lg` 640 px, popover surface, `rounded-lg`, `shadow-lg`, scrim, a flex column whose `DialogBody` scrolls while `DialogHeader`/`DialogFooter` stay put; `fullScreenOnMobile` fills the viewport below 768 px (footer gets a top hairline there); `ModalCloseButton` (44 px, `SECTION_MESSAGES.close`, `closeLabel` override). `useModalHandlers` (shared with the Sheet): `dismissible={false}` blocks Escape, scrim and close (close stays focusable, `aria-disabled`; content `aria-busy`), `initialFocus` ref, and **focus returns to the element focused when it opened** (Radix only returns to a `DialogTrigger`; found in e2e). A caller's own handler runs first and may `preventDefault()`.
- **Sheet** (`components/ui/sheet.tsx`): right, 480 px from 768 px, `h-dvh`, `bg-card`, `shadow-lg`, slide-in (none under reduced motion); full screen below 768 px. `SheetHeader` shows Back (ChevronLeft, "Back") below 768 px and Close above, picked by CSS (`md:hidden`/`max-md:hidden`: two controls of one action, not duplicated content). Close/Back/Escape/scrim call the root's `onOpenChange(false)`, so Story 5.2 runs `requestLeave` there.
- **ConfirmDialog** `busyLabel` (default "Saving…"). **Button** `outline-destructive` (`bg-card border-border text-error-strong hover:bg-muted`).
- **DropdownMenu / Checkbox / Switch**: row-menu styling, 44 px items; checkbox 20 px box and switch 44 × 24 track inside 44 px targets; `control-border` boundary, primary when on, error border on `aria-invalid`.
- **Chip** `label | primary | deleted | overflow` (square `rounded-sm`, 22 px, 12/600) and `OverflowChip` (44 px button, `aria-label` = the hidden list, ref-forwarding Tooltip trigger, "+{count}" from the catalog). `docs/DESIGN-SYSTEM.md` now says: `Badge` keeps the pill outside tables; chips in table cells are `Chip` (Ledger delta).
- **EmptyState** `row` (a `<tr>` with one `colSpan` cell, muted copy · `LinkTextButton`) and `card` (dashed, optional title/children, primary `Button`); an action with `disabledReason` renders `DisabledAction`. `EmptyStateLine` is the line alone (used by the mobile Section table).
- **LiveStatus / `useAnnounce({ clearAfterMs? })`**: identical text gets a trailing no-break space so it is read again; `clear()` and optional auto-clear. No existing announcer refactored (none was trivial).
- **Tokens/utilities**: `--qr-surface` #ffffff in `:root` and `.dark` + `bg-qr-surface` (listed in the upstream-report block); `@utility mono-value` (font-mono 14/20 500), `cell-strong` (14/20 500), `section-title` (16/24 600), `kv-value-empty` (14/20 400 muted), `control-max-wide` (max-width 720 px), via `@apply` on the existing scale. `globals.test.ts` checks the token in both themes and each utility body; e2e checks computed styles.
- **Combobox `inputRef`** prop (merged with the internal ref; a generic component can't use `forwardRef` without losing `<T>`).
- **Row kit** (`features/shell`, exported from `index.ts`): `RowActions` (inline actions inside a `md:opacity-0` container that shows on `group/row` hover/focus-within and its own focus-within, `max-md:hidden`; kebab named "More actions for {name}"; the menu drops actions without a handler, `destructive` → `error-strong`; an aria-disabled action is a `DisabledAction` inline and, in the menu, a focusable `aria-disabled` item whose reason is a muted second line referenced by `aria-describedby` and whose select is a no-op that keeps the menu open — a tooltip can't live inside a menu). `RowRemoval` (Remove ghost button / `DisabledAction` with reason / "Restore" link-text button; forwards its ref to whichever is shown, for "Remove from the read-view menu focuses Restore"), `RowEditStatus`, `RowEditState`, `ROW_EDIT_STATE_CLASSES` (removed: muted and line-through on every cell but the actions cell; the status text is `inline-block` so the strike doesn't reach "Removed on save"). A new row's Remove deletes it outright: that is the Section's `onRemove`.
- **SectionTable**: desktop `<table aria-labelledby>` with `th scope=col` (`column-header` type on `muted`), a visually hidden "Actions" header, `group/row` rows, 44 px read rows, hairlines, accent hover/focus-within (read view only), top-aligned edit cells, empty row spanning every column; below 768 px a `<ul aria-labelledby>` of stacked cards (line 1 / line 2 per column `mobileLine`, `"none"` hides a column, each value prefixed by its sr-only column name, actions right with `layout="card"` so `RowActions` can drop inline actions). Picked by `useMediaQuery`.
- **PhoneInput**: `Select` country segment (flag + "+code", `aria-label` "Country code", every libphonenumber region sorted by `Intl.DisplayNames`, default `us`) joined to a `type=tel` input with the FormField wiring; letters dropped; a change past the country's maximum length is ignored (1health-fe clamps too); formatted on blur; a value starting with `+` that parses to a region switches the country; changing the country re-formats the digits for it; `readOnly` makes the picker aria-disabled. `lib/shared/phone.ts` (100 % covered): `phoneRegions`, `regionFlag`, `dialCodeOf`, `isPhoneRegion`, `phoneDigits`, `isPhoneTooLong`, `formatPhoneInput`, `parseInternationalPhone`, `phoneInputFrom`, `phoneIssue` (+1 regions exactly 10 digits as in 1health-fe, else `isValidPhoneNumber`), `toE164`, `EMPTY_PHONE_INPUT`. Copy mapping of `phoneIssue` stays in the Section schema (`CONTACT_MESSAGES.phoneTenDigits`, `SECTION_MESSAGES.phoneInvalid`).
- **useCountdown**: deadline-based (re-reads `Date.now()` every 250 ms), whole seconds rounded up, `onDone` once, `stop()` without `onDone`, restart replaces the deadline.
- **Copy** added to `lib/shared/messages/section.ts` (none were in `COMMON_MESSAGES`; `Restore` is imported from there): `close` "Close" (DRAFT), `back` "Back" (DRAFT), `remove` "Remove" (verbatim), `removedOnSave` "Removed on save" (verbatim), `newNotSaved` "New · not saved" (verbatim), `moreActionsFor` "More actions for {name}" (DRAFT), `actionsColumn` "Actions" (DRAFT), `overflowCount` "+{count}" (DRAFT), `countryCode` "Country code" (DRAFT), `phoneInvalid` "Enter a valid phone number" (DRAFT). Spec F6-3 may move the generic words to `common.ts`.
- **Fixture/e2e**: one page `app/test-fixtures/ui-kit/page.tsx` → `features/shell/__fixtures__/ui-kit-fixture.tsx` (one section per primitive rather than one page each, matching the single `e2e/ui-kit.spec.ts`), gate rows in `app/test-fixtures.test.ts`. `e2e/ui-kit.spec.ts`: axe light/dark (closed, dialog, sheet, row menu, busy confirm, country list), 44 px targets, 16 px input text, no horizontal scroll, computed text roles/qr-surface/720 px, dialog focus/busy/440 px or full-screen with pinned footer, sheet 480 px or full-screen with Back and sticky header/footer, busy label, kebab menu and disabled item, touch tap, desktop hover fade, edit-view removal, phone clamp/format/paste/country pick, countdown + polite status.
- **Decisions / limits**: the long country list's scroll viewport trips axe `scrollable-region-focusable` (Radix moves focus to options; the e2e disables that one rule for that one scan). Radix Select typeahead matched only the last key in the 245-item list under Playwright, so the e2e uses first-letter typeahead + arrows; multi-letter typeahead by country name is not asserted (deferred: consider the Combobox with `staticOptions` for the picker if PM review asks for type-to-search). No existing component was refactored onto the new kit.
- **Verification** (2026-10-14): `corepack pnpm install` up to date; `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 121 files / 2586 tests green, thresholds met; `PP_E2E_PORT=3210 pnpm test:e2e` 230 passed, 2 skipped (desktop-only cases on 360 px), `e2e/ui-kit.spec.ts --repeat-each=3` 75 passed, 3 skipped; `pnpm build` OK (`/test-fixtures/ui-kit` dynamic); `bash scripts/check-forbidden.sh` OK (tokens OK).
- **Review fixes** (2026-10-14, rebased onto `96e39ed` with F6-3 and F6-1; the hand-added gate-test row was dropped because `app/test-fixtures.test.ts` now discovers every fixture page):
  1. **Copy:** `close`, `back`, `remove`, `moreActionsFor` removed from `messages/section.ts`; Dialog, Sheet, RowActions and RowRemoval read `COMMON_MESSAGES` (F6-3). `section.ts` keeps `removedOnSave`, `newNotSaved`, `actionsColumn`, `overflowCount`, `countryCode`, `phoneInvalid`.
  2. **RowActions focus:** a menu item is remembered on select and run from `DropdownMenuContent onCloseAutoFocus` after `preventDefault()` + focusing the kebab, so a ConfirmDialog/Sheet it opens returns focus to the kebab (unit test with and without reduced motion; e2e in both motion modes).
  3. **+1 validation:** a leading trunk "1" is not a national digit (NANP area codes never start with 1): "1 415 555 212" → `tenDigits`, "14155552125" → valid. `toE164` returns `null` unless `phoneIssue` passes.
  4. **`formatPhoneInput`** formats text starting with "+" as an international number (`new AsYouType()`, no default country) instead of rereading it as national; PhoneInput blur never calls `onChange` while read-only or disabled.
  5. **Too-long input:** `clampPhoneInput` drops trailing digits until the number fits (1health-fe `clampNationalDigits`), for typing and paste.
  6. **Touch ≥ 768 px:** inline row actions are hidden-until-hover only under `pointer-fine` (`md:pointer-fine:opacity-0` and its reveal variants); on coarse pointers they stay visible, never invisible but tappable.
  7. **SectionTable:** edit view below 768 px renders one full-width block per column under its visible header; `cell(row, { layout, headerId })` gives the header id for `aria-labelledby`; `renderExpanded?(row)` renders a desktop `colSpan` row or the mobile card body.
  8. **RowRemoval:** a merged ref + layout effect keeps focus on the action when Remove and Restore swap (only when it had focus); `statusId` makes Restore `aria-describedby` the row's "Removed on save" (`RowEditStatus id`).
  9. **Wrapping:** `table-fixed`, `<colgroup>` with column `width` classes and `actionsWidth` (default `w-60` read, `w-32` edit), `[overflow-wrap:anywhere]` on cells; e2e "Links" table with a long unbroken URL at 768 px: no horizontal overflow, kebab inside the viewport.
  10. **Checkbox / Switch `ariaDisabled`:** focusable, `aria-disabled`, disabled look, a click/Space/label press is prevented so `onCheckedChange` never fires.
  11. **PhoneInput name:** the trigger is `aria-labelledby` "Country code" + a hidden "+1 United States" (dial code and region name; the flag stays decorative).
  12. **RowActions** renders nothing without a usable action; **EmptyState** `titleAs` (`p` default, `h2`–`h4`); transitive-package note corrected above.
  13. **Tests:** ConfirmDialog nested in a Sheet (Escape and its scrim close only the confirm; focus returns to its trigger inside the sheet); `useCountdown` under `StrictMode` (one timer, one `onDone`).
  - **FOUNDATION.md** row-kit entry notes the breakpoint swap remounts cells (keep per-row state in the Section); APIs updated.
  - **Verification** (2026-10-14, after the rebase): `corepack pnpm install` up to date; lint and typecheck clean; `vitest run --coverage` 131 files / 2862 tests green, thresholds met (`lib/shared/phone.ts` 100 %); `PP_E2E_PORT=3210 test:e2e` 260 passed, 2 skipped; `build` OK; `check-forbidden.sh` OK.

## Spec Change Log

## Review Triage Log

Review of `6a448e0` (2026-10-14), triaged by the coordinator.

- **Patched ("fix: F6-2 review findings"):** items 1–13 under Implementation Notes "Review fixes".
- **Deferred** (`deferred-work.md`): Team A — country picker type-to-search (no AC requires it), memoize the 245 country items per locale; Foundation — full-screen dialog/sheet footer under the on-screen keyboard (`interactive-widget=resizes-content` or visual viewport), verify `useAnnounce` re-announce with a real screen reader. FOUNDATION.md notes the breakpoint-swap state loss.
- **Rejected:** none.
