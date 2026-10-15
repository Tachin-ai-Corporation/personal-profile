---
title: 'F5-2 Async Combobox (ARIA 1.2) with NPI, address, insurer and gender-identity variants'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: '69b99d4'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/shared-foundation-plan.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Four searches across both teams need the same accessible combobox — NPI search (9.1, Team B), address line 1 suggestions (4.3), insurer search (5.2) and gender identity with free text (2.2, Team A) — each with different debounce, paging, free-text and error rules. None exists; building four would diverge in accessibility and keyboard behaviour.

**Approach:** Build the F5-2 slice of `shared-foundation-plan.md` as one headless hook plus one view on the F5-1 `Popover` anchor, configured by props for the four variants exactly as `epics.md` Stories 9.1 (~L4065–4100), 4.3 (~L2902), 5.2 (~L3071) and 2.2 (~L1992) describe. Approved by the human in advance (2026-10-14).

## Boundaries & Constraints

**Always:**
- **API** (`components/ui/combobox.tsx`, `components/ui/use-combobox.ts`): `useCombobox<T>({ load(query, page, signal) → Promise<{ items: T[]; hasMore: boolean } | { error: true }>, getKey, getLabel, debounceMs, minChars, pageSize?, maxResults?, openOnFocus, mode: "select-only" | "free-text", allowAdd?(query) → label, staticOptions?, onSelect, onClear })` and a `Combobox` view with `renderOption` (one-line or two-line `combobox-option` style), leading search icon option, clear button named "Clear {label}", helper text slot and FormField wiring.
- **ARIA 1.2:** input `role="combobox"` with `aria-expanded`, `aria-controls` → `role="listbox"`, `aria-activedescendant`, `aria-autocomplete="list"`; options `role="option"` with `aria-selected`; non-selectable rows (loading, error, empty, end) are not options or are `aria-disabled`; polite status for "{N} results", "Cleared", loading and errors.
- **Keyboard:** ArrowDown/Up move (skip non-selectable rows), Home/End, Enter selects, Escape closes only the listbox (never cancels a Section), Tab leaves the field (free-text mode keeps the typed text; select-only clears an unselected query); typing after a selection clears the selection.
- **Async correctness:** debounce per variant; abort the previous request (`AbortSignal`) and discard stale responses; infinite scroll loads the next page when the last option scrolls into view; "Try again." retries the same query and page; nothing cached across sessions (NPI results never drafted).
- **Variants via props:** NPI (opens on focus with empty query page 0, 600 ms, `maxLength` 100, 10 per page, infinite scroll, loading row "Searching…", error row "Couldn't load results." + "Try again.", end "No more results", zero "No matching NPI found", select-only), Address (≥3 chars, 250 ms, max 5, matched text weight 600, free text kept, silent failure, disabled when told), Insurer (debounce, 20 per page, last option `Add "{name}"` when nothing matches exactly, helper copy), Gender identity (static options + free text, helper copy). All copy from the catalog (new `lib/shared/messages/combobox.ts`, DRAFT COPY where not verbatim).
- Popover from F5-1 (`components/ui/popover.tsx`) for positioning; `row-menu` listbox style (popover bg, `rounded-md`, `shadow-md`); 44 px rows; semantic tokens; reduced motion.
- Tests: ARIA attributes, keyboard, debounce timing (fake timers), stale discard, paging and end, error + retry with same query/page, zero results, free text vs select-only, clear, `Add "{name}"`, axe of the open list; browser fixture `app/test-fixtures/combobox` (behind `PP_E2E_FIXTURES`) + gate test + `e2e/combobox.spec.ts` (desktop and 360 px, light/dark axe, virtual-keyboard friendly).

**Never:**
- No feature wiring (NPI API calls, Places routes, insurer API) — stories pass `load`. No cmdk/downshift dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Debounce | type 3 chars fast (NPI) | one request 600 ms after the last key | earlier requests aborted |
| Stale | response for "ab" arrives after "abc" | ignored | — |
| Paging | scroll to last of 10 | page 1 requested; "No more results" when `hasMore=false` | error row + Try again (same page) |
| Zero | no results | "No matching NPI found" (aria-disabled) | — |
| Free text | address, type then Tab | text kept, no selection | Google failure → no listbox, no error |
| Escape | listbox open inside an editing Section | listbox closes; Section stays in edit | — |

</frozen-after-approval>

## Code Map

- `components/ui/{popover,form-field,input}.tsx` (F5-1/F3-1) -- anchor, field wiring, input styles.
- `lib/shared/messages/*` -- new combobox area file.
- `app/test-fixtures/inputs/page.tsx`, `app/test-fixtures.test.ts`, `e2e/inputs.spec.ts` (F5-1) -- patterns for fixture, gate test, e2e (honour `PP_E2E_PORT`).

## Tasks & Acceptance

**Execution:**
- [x] `components/ui/use-combobox.ts`, `components/ui/combobox.tsx`, `lib/shared/messages/combobox.ts` (+tests) -- hook, view, copy.
- [x] `app/test-fixtures/combobox/page.tsx`, `app/test-fixtures.test.ts`, `e2e/combobox.spec.ts` -- fixture with the four variants (fake loaders), gate test, e2e.

**Acceptance Criteria:**
- Given each variant on the fixture page, when a keyboard and a touch user search, page, retry and select, then behaviour matches the matrix and axe reports no violations in light and dark at desktop and 360 px.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

Implemented 2026-10-14.

- **Hook** (`components/ui/use-combobox.ts`): `useCombobox<T>({ load?, getKey, getLabel, debounceMs = 300, minChars = 0, pageSize?, maxResults?, openOnFocus?, mode, allowAdd?, staticOptions?, searchDisabled?, quiet?, emptyMessage?, endMessage?, text?/defaultText?/onTextChange?, onSelect?, onClear? })`. Additions to the spec's signature, all optional: `text`/`defaultText`/`onTextChange` (controlled or uncontrolled input text, so address autofill and the gender preselect can set it), `searchDisabled` (address "disabled when told": no search, no listbox), `quiet` (address silent failure: no loading or error rows or announcements; a failure shows nothing), `emptyMessage`/`endMessage` (variant rows; without them zero results show no listbox and no end row). `onSelect(selection | null)` receives `{ type: "option", item }` or `{ type: "add", text }`, and `null` when typing after a pick drops it; `onClear` fires for ×. `load` is optional so a static list (gender identity) needs no loader.
- **Async rules**: the query passed to `load` is trimmed; each keystroke aborts the in-flight request (`AbortSignal`) and restarts the debounce; a request counter discards any late response (also a rejection after abort); closing while loading aborts and the next open reloads. A rejected `load` counts as an error. `pageSize`: a page shorter than it also ends the list, whatever `hasMore` says. `maxResults` caps and disables paging. Retry repeats the failed query and page; a failed page keeps the loaded options. Nothing is cached outside the component (NPI results are never drafted).
- **Static options** filter by "contains" (case-insensitive), but all are offered while the text equals one of them (so a preselected "Asked but not answered" lists every choice).
- **Add option**: appears last when the trimmed query is non-empty, the search for it has settled and no result label equals it case-insensitively; label from `allowAdd(query)` (fixture uses `COMBOBOX_MESSAGES.addOption` "Add “{name}”"); picking it puts the trimmed name in the input.
- **View** (`components/ui/combobox.tsx`): `Combobox<T>` renders its own `FormField` (`label`, `help`, `error`, `optional`, `required`, `id`, `labelAddon`) around an `INPUT_STYLES` input (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `autoComplete="off"`), optional leading search icon, × button "Clear {label}" (44 px), a polite `role="status"` region (in the field, so it exists before the popup), and the popup on the F5-1 `PopoverAnchor`/`PopoverContent` (`role` removed so it isn't a dialog; trigger width; `shadow-md` row-menu; no auto-focus on open/close). Options are `role="option"` with `aria-selected` on the active option and `aria-label` = `getLabel(item)` (full PRD string), 44 px one-line or 52 px two-line (`optionLayout`, `ComboboxOptionText` for line 1 `cell-strong` + muted caption line 2), check icon on the current pick; `renderOption(item, { active, selected, query })` and `HighlightMatch` (matched text weight 600, `highlightMatch` prop). The zero and end rows are `aria-disabled` options (never navigable); the loading and error rows sit under the listbox, outside it (a button may not be inside a listbox). Exports: `Combobox`, `ComboboxOptionText`, `HighlightMatch`, `useCombobox` and the types.
- **Keyboard/pointer**: ArrowDown opens (and loads if needed) and moves; ArrowUp from none goes to the last option; Home/End move among options only while an option is active (otherwise they move the caret, as in a text field); Enter selects; Escape closes the list and stops propagation, so a Section or dialog never sees it (Radix sees Escape first in the capture phase; it only closes there when focus is on "Try again."). Reaching the last option by keyboard, or the last option scrolling into view (IntersectionObserver rooted at the listbox), loads the next page. Pointer presses on the popup are `preventDefault`ed on mousedown so focus and the on-screen keyboard stay in the input; a press on the input doesn't dismiss the popup. Leaving the field (focus outside input and popup) closes it; select-only then drops an unpicked query, free-text keeps it.
- **Decisions beyond the spec**: (1) the × button is `tabIndex=-1` (still a named button for screen readers and pointers) so Tab leaves the field in one step as the spec requires; keyboard users clear by deleting the text. (2) The popup is portaled, so Tab is bridged while the error row shows: Tab from the input focuses "Try again.", Tab from there goes to the element after the field, Shift+Tab returns to the input; activating it moves focus back to the input first, then retries. (3) The listbox itself is the scroll container: axe's `scrollable-region-focusable` exempts combobox popups, while a wrapper scroller is flagged (found in e2e). (4) Focus returning to the input while the list is open does not re-search (otherwise Shift+Tab from "Try again." would retry).
- **Copy**: new area `lib/shared/messages/combobox.ts` (`COMBOBOX_MESSAGES`, aggregated as `MESSAGE_CATALOG.combobox`): verbatim `searching`, `noMoreResults`, `addOption`, `npiPlaceholder`, `npiNoMatches`, `addressHelp`, `insurerHelp`, `genderIdentityHelp`; DRAFT COPY `loadError` "Couldn't load results.", `resultCount` "{N} results", `resultCountOne` "1 result", `cleared` "Cleared", `clearLabel` "Clear {label}". "Try again." reuses `CONTROL_MESSAGES.tryAgain`. Stories 9.1, 4.3, 5.2, 2.2 should use these keys rather than adding the strings to their own area files (catalog uniqueness test).
- **Shared helper**: `tabbables()` in `components/ui/info-popover.tsx` is now exported (reused for the Tab bridge).
- **Fixture / tests**: `app/test-fixtures/combobox/page.tsx` → `features/shell/__fixtures__/combobox-fixture.tsx` (behind `PP_E2E_FIXTURES`; four variants on fake loaders with a request log; NPI query "error" fails once per page, "zzz" finds nothing; address queries with "fail" fail silently; a checkbox turns address suggestions off), gate test in `app/test-fixtures.test.ts`, `components/ui/combobox.test.tsx` (28 tests, fake timers: ARIA, axe open with results / loading / error, debounce + abort, stale discard, paging by IntersectionObserver and by keyboard, short page ends, page error + retry same query/page, zero results, abort rejection ignored, close-while-loading, minChars, keyboard, Escape isolation, pointer, typing after a pick, select-only vs free-text leave, clear, Tab bridge, Add, address, gender identity), `e2e/combobox.spec.ts` (10 tests × desktop and 360 px touch: axe light/dark closed, results, error row, zero results, Add option and suggestions; 44 px targets, 16 px text, 52 px NPI rows, no horizontal scroll; NPI paging/keys/Escape isolation, debounce, retry, touch pick + clear, scroll paging; address, insurer, gender identity).
- **Verification** (2026-10-14): `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 112 files / 2257 tests green, thresholds met; `PP_E2E_PORT=3180 pnpm test:e2e` 195 passed, 1 skipped (the existing desktop-only placement test on 360 px), and `e2e/combobox.spec.ts` stable with `--repeat-each=5` (100/100); `pnpm build` OK (`/test-fixtures/combobox` dynamic); `bash scripts/check-forbidden.sh` OK.
- **Review fixes** (2026-10-14): New props `selection` (controlled) and `defaultSelection` let edit forms seed a saved NPI or insurer, and the text then defaults to the pick's label. A pick holds only while the text equals its label, so a parent reset (Discard) drops it. Select-only `leave()` clears only text the user typed without picking. `openOnFocus` opens only an empty field. A blur with no new target while the window or tab lost focus keeps the field as it is.
  - **Paging:** pages load only for the current query (not during a new query's debounce). Items are deduped by `getKey`. An empty, all-duplicate or short page ends the list. Closing after an error clears it: a failed first page reloads on the next open, a failed later page keeps the loaded options and is requested again at the last option.
  - **Cancellation:** `searchDisabled` or a disabled input cancels the debounce and the request, clears the results and closes the popup (state reset during render, abort in an effect).
  - **Add option:** `Add "{name}"` waits until every page is loaded, unless the loader returns `exactMatch: false` (new optional field on `ComboboxLoadResult`).
  - **Announcements:** a repeated announcement gets a trailing no-break space so it is read again, and closing clears it. Quiet mode never announces loading and clears a stale count after a silent failure. Zero results with no listbox announce nothing. Static filtering announces its count.
  - **Pick for assistive tech:** `aria-selected` now marks the current pick; the active option is only `aria-activedescendant`.
  - **Smaller fixes:** `HighlightMatch` falls back to plain text when lowercasing changes the length. The Tab bridge skips hidden elements and stays inside an enclosing dialog, and it leaves the key alone when nothing follows; the popup's Radix focus scope then keeps focus on "Try again.".
  - **Shared modules:** `tabbables` (with F5-1's visibility filter and selectors) moved to `components/ui/focus.ts`, and `LinkTextButton` to `components/ui/link-text-button.tsx`. `info-popover.tsx` imports both and re-exports `LinkTextButton`. `info-popover.test.tsx` got the same `getClientRects` jsdom stub as F5-1's fix.
  - **Tests and fixture:** the fixture's `wait()` rejects at once when already aborted and removes its listener. Tests added for every finding (49 unit tests). The e2e debounce test now measures 550 to 1000 ms between the last key and the request.
  - **Verification:** related unit tests (453) green, lint and typecheck clean, `e2e/combobox.spec.ts` + `e2e/inputs.spec.ts` with `--repeat-each=3`: 123 passed, 3 skipped. check-forbidden OK.

## Spec Change Log

## Review Triage Log

Three parallel reviewers (Blind Hunter, Edge Case Hunter, Verification Gap) on `1b4e8be` vs its F5-1 base.

- **Patched (round 1, "fix: F5-2 review findings"):** `selection`/`defaultSelection` seeding and pick invalidation on external text reset; select-only leave clears only user-typed text; `openOnFocus` only when empty; window blur ignored; paging only for the current query; empty/short/all-duplicate page ends the list; dedupe by `getKey`; `searchDisabled`/`disabled` cancel and close; unmount/clear/select abort (tested); error cleared on close, failed later page retried in place; `Add "{name}"` waits for all pages unless `exactMatch: false`; re-announce identical status, quiet mode never says "Searching…", no "0 results" without a listbox, static filtering announces; `aria-selected` marks the current pick; highlight bails out on length-changing case folding; Tab from "Try again." skips hidden elements and stays in a dialog; `tabbables` → `components/ui/focus.ts`, `LinkTextButton` → `components/ui/link-text-button.tsx`; test and fixture fixes; e2e debounce measured in page (550–1000 ms).
- **Deferred:** none.
- **Rejected:** none.
- **Integration:** cherry-picked onto `feat/NG-9019-epic-7` after F4 and F5-1; the `info-popover.tsx` conflict was resolved by keeping F5-1's fixes and F5-2's move (the helper in `focus.ts` is F5-1's verbatim).
- **Re-verified 2026-10-14 on the branch:** lint, typecheck, `vitest run --coverage` (115 files, 2465 tests), `test:e2e` (205 passed, 1 skipped desktop-only), build and `check-forbidden.sh` green.
