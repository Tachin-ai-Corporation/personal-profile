---
title: 'Story 4.3: Address suggestions via server'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: 'bb40de3536871e57462a770f55c55ad0170e42c5'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the Addresses edit view (Story 4.2), address line 1 is a plain input. Users in the US, Canada and Australia get no suggestions, and an address can never become "Verified" from this app (Story 4.3, FR26, NG-9026; acceptance source: `epics.md` "### Story 4.3: Address suggestions via server").

**Approach:** Turn line 1 of an expanded address row into the address variant of the F5-2 `Combobox`, loaded through `lib/api/places.ts`. That module calls the existing named ops `POST /api/places/autocomplete` and `/details` (built and tested in F2, so no server change). Picking a suggestion fills the row and sets its `validated` flag; a later manual edit clears it. Everything stays inert while `PLACES_ENABLED` is off, which it is everywhere until the Google BAA.

## Boundaries & Constraints

**Always:**
- **Client** (`lib/api/places.ts`, 100 % coverage):
  - `placesAutocomplete({ input, countryCode, lookupId }, signal)` → `{ enabled, suggestions }`, and `placesDetails({ placeId, lookupId })` → `{ enabled, address }`, both through `callApi`.
  - **Failures:** an autocomplete failure (network, 4xx, 5xx, abort) answers `{ enabled: true, suggestions: [] }`. A details failure answers `null`. Neither throws.
  - **Lookups:** `newPlacesLookupId()` (UUID v4, `crypto.randomUUID`). One lookup per row edit session: reused for every keystroke until its details call, and a new one after a pick or after line 1 is emptied.
  - **Countries:** `placesCountryCodeOf(countryName)` maps the three pinned names to US / CA / AU (any US spelling counts, via `isUnitedStatesName`); any other country gives `null`. This follows decision 3a of Story 4.2: the countries list has no codes.
- **Line 1** in an expanded row is a `Combobox`:
  - `mode: "free-text"` (Tab keeps the typed text), `minChars: 3`, `debounceMs: 250`, `maxResults: 5`, `quiet`, `highlightMatch`.
  - Label "Address line 1", bound to the form through a `Controller` so typing counts as a user change (drafts, dirty).
  - `inputRef` comes from the form, so it takes focus as the first invalid field. Its value stays the row's `line1`.
- **Search on/off:**
  - The help line "Pick a suggestion to fill the rest and verify the address." (`COMBOBOX_MESSAGES.addressHelp`) shows, and suggestions load, only when the row's country maps to US/CA/AU and the server hasn't answered `enabled: false`.
  - With any other country, or after an `enabled: false` answer (remembered for the Section's lifetime), it sets `searchDisabled`. No call is made, and no listbox or help line shows. Manual entry and Save work as in 4.2.
- **Pick (after review):** line 1 shows the suggestion's street (`mainText`) at once, so a Save meanwhile sends the street. The details answer applies only to the row's latest pick, while the Section is editing and not saving and line 1 still shows that street; a failure (or `enabled: false`) puts back the typed line 1 and "Verified" (the snapshot never comes from a pending pick). A complete answer empties a part Google didn't return; a partial one fills only non-empty parts; an empty answer line 1 keeps the street; a complete answer whose country the Select can't show stays unverified. A polite status announces the fill ("Address filled from the suggestion[ and verified]."). The fill is `features/addresses/suggestion.ts`.
- **Help line** shows only after an `enabled: true` answer in this Section (unknown → hidden). Line 1 keeps `autocomplete="address-line1"` (set through its ref; the shared Combobox hardcodes `off`). A Places-country change ends the row's lookup and remounts the combobox.
  - Calls details with the same `lookupId`. A `complete: true` answer fills line 1, city, county, state/province, zip and country with `setValue(…, { shouldDirty: true, shouldValidate: true })`, and sets the row's `validated` to true.
  - A `complete: false` answer fills the fields it returns and leaves `validated` false. The missing required fields show their errors on Save.
  - **Country:** filled with the list entry matching the answer's `countryCode` (US/CA/AU → the pinned names), else its `country` if listed, else left unchanged.
  - A details failure keeps the typed text silently, with no banner.
- **Validated:**
  - A row's form `validated` starts as the saved value (false for a new row). It becomes true only through a complete pick, and false on any later manual edit of line 1, city, county, state/province, zip or country. Line 2 never clears it (decision 2a).
  - Save sends the row's form `validated`, replacing 4.2's "saved and no part changed" rule. A row that wasn't picked still follows that rule, because any manual change of those fields clears the flag.
- **Collapsed and read views:** show "Verified" after save from the refetched `validated` (4.1, unchanged).
- **Attribution:** "Powered by Google" (DRAFT) shows under the suggestions as the `Combobox` `endMessage`, whenever suggestions are listed (decision 3a).
- **Keyboard:** Arrow Up/Down moves through the options, Enter picks, Escape closes only the listbox (never the Section), and Tab leaves with the typed text. These are built into the `Combobox`.
- **Mobile:** suggestions show under line 1. The Save all pill already hides while the on-screen keyboard is open (Story 1.14, `useOnScreenKeyboard`); a test confirms it with the listbox open.
- **Copy:** grep first. `COMBOBOX_MESSAGES.addressHelp` already exists, and new strings go in `lib/shared/messages/places.ts`.
- 44 px options, axe in light and dark with the listbox open, no horizontal scroll at 360 px.

**Decisions (human, 2026-10-19):**
- **1a, no throttle now:** `/api/places/autocomplete` gets no server-side limiter in this story. Places stays off until the Google BAA. A release blocker is logged in `deferred-work.md`: decide on a server-side throttle before `PLACES_ENABLED=1`. The client keeps its 250 ms debounce and 3-character minimum.
- **2a, line 2 never clears "Verified":** only manual edits of line 1, city, county, state/province, zip or country clear `validated`, on picked and saved rows alike. This replaces Story 4.2's rule that line 2 counts; 4.2's `isAddressPartChanged` drops line 2.
- **3a, text attribution:** "Powered by Google" (DRAFT) as text under the suggestions. Whether the Google logo image is required before `PLACES_ENABLED=1` is logged for PM/legal in `deferred-work.md`.

**Decisions (agent, 2026-10-19):**
- **CSP stays unchanged:** the browser never contacts Google (AD-14). The app calls only `/api/places/*`, and no Google script, image or font is loaded, so `connect-src 'self'` holds. The open deferred item "CSP has no Google Maps hosts" is resolved this way.
- **No server or foundation change:** both routes, `PLACES_ENABLED`, the kill switch, input limits, timeouts and logging are built and tested in F2 (`lib/server/named-ops/places.test.ts`, `app/api/places/*/route.test.ts`). 4.3 adds only a client test that `enabled: false` shows nothing.
- **Local-view mock, after the commit:** the worktree turns `PLACES_ENABLED` on with a dummy `GOOGLE_PLACES_KEY`. `dev-mock.ts` answers Google's `places:autocomplete` and `places/{id}` with sample US/CA/AU addresses (one incomplete), so suggestions can be tried there.

**Never:** edit `lib/server/**`, `app/api/**`, `features/shell/**`, `features/save-all/**`, `components/ui/*` (existing), `lib/api/{index,keys}.ts` or `test/**` without asking first (each such change gets its own commit). Never call Google from the browser, cache searches or put a search under an SWR key. Never log typed text, place ids or addresses.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Suggest | US row, type "1 Pin" (3+ chars) | after 250 ms, one `POST /api/places/autocomplete {input:"1 Pin",countryCode:"US",lookupId}`; up to 5 options, match in 600; help line shown | stale answers discarded |
| Complete pick | Enter on an option; details `complete:true` | line 1, city, county, state, zip, country filled; row `validated` true; after Save, read view "Verified" | N/A |
| Partial pick | details `complete:false`, no zip | fields filled, zip empty; `validated` false; Save → "Enter a ZIP …" on zip | N/A |
| Edit after pick | picked row; type in city | `validated` false; Save sends `validated:false` | N/A |
| Other country | Germany row | no request, no listbox, no help line | N/A |
| Off | autocomplete answers `{enabled:false}` | no listbox, no help, for the rest of the Section's life; manual Save works | N/A |
| Failure | autocomplete 502 / network; details 504 | no listbox (or the typed text kept); no banner | silent |
| Session | two picks in one row | the second lookup uses a new `lookupId` | N/A |

</frozen-after-approval>

## Code Map

- `lib/api/places.ts` -- the stub (`isPlacesCountry`, the paths). Add the client calls, the lookup id and the country mapping.
- `lib/shared/bff-contract.ts` -- `PlacesAutocompleteRequest`/`Body`, `PlacesDetailsRequest`/`Body`, `PlaceSuggestion`, `PlaceAddress` (with `complete`), `PLACES_COUNTRIES` (read only).
- `components/ui/combobox.tsx` + `use-combobox.ts` (read only) -- `load(query, page, signal)`, `mode`, `minChars`, `debounceMs`, `maxResults`, `quiet`, `searchDisabled`, `highlightMatch`, `text` / `onTextChange`, `onSelect`, `inputRef`, `help`, `endMessage`.
- `features/addresses/addresses-section.tsx` -- the expanded row grid; replace line 1's `AddressTextField` (~l.427) with the `Combobox`. The other fields are unchanged.
- `features/addresses/schema.ts` -- the row already has `validated` (the saved value). It becomes form state.
- `lib/api/addresses.ts` -- `addressUpdateBody` / `addressCreateBody`: send the row's `validated`, and drop the part-changed rule.
- `features/addresses/format.ts` -- `isUnitedStatesName`.
- `lib/server/named-ops/places.ts` (read only) -- the server behaviour: `enabled`, failures as an empty list, details 502/504.
- `features/save-all/use-on-screen-keyboard.ts` (read only) -- the pill hiding to confirm.
- Tests to copy: the existing `Combobox` tests (`components/ui/combobox.test.tsx`), `addresses-section.edit.test.tsx`; e2e `e2e/profile-addresses.spec.ts` (mock `/api/places/*` with `page.route`).

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/places.ts` (+ `places.test.ts`) -- the client calls, failure mapping, lookup id, country mapping.
- [x] `lib/api/addresses.ts` (+ test), `features/addresses/schema.ts` (+ test) -- `validated` as form state, sent as is; line 2 no longer clears it (2a).
- [x] `features/addresses/addresses-section.tsx` (+ a new `addresses-section.places.test.tsx`) -- every I/O row, the keyboard, axe light and dark with the listbox open.
- [x] `e2e/profile-addresses.spec.ts` -- suggest → pick → fill → Save → Verified; partial; other country; off; 360 px with the pill hidden.
- [x] `deferred-work.md` (the CSP item resolved, plus the open-question follow-ups) and `sprint-status.yaml` (the `4-3` line only).

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100 % coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed, or each other path was approved by the user and is in its own commit.

## Implementation Notes

- **`isUnitedStatesName` moved** from `features/addresses/format.ts` to `lib/api/addresses.ts` (`lib/api` can't import a feature), so `placesCountryCodeOf` maps every US spelling; `format.ts` re-exports it. Also added `placesCountryNameOf(code)` (the fill's country) and `PLACES_INPUT_MAX_LENGTH` (120: a longer input makes no call, the route would answer 400).
- **Line 1** uses `section.control` (the foundation's Controller wiring for non-native controls). The Combobox has no read-only prop, so while saving the input gets `readOnly`/`aria-readonly` from a layout effect, search is off and typing is ignored.
- **Pick:** the Combobox first sets the text to the option label (a user change, which clears "Verified"), then `onSelect`; the Section calls details and applies the answer only while line 1 still shows that label. A failure (or `enabled: false`) puts back the line 1 text and "Verified" from before the pick. A complete answer empties a part Google didn't return (county, state); a partial one fills only non-empty parts. The fill is `features/addresses/suggestion.ts` (`placeAddressFill`, `suggestionLabel`).
- **`validated` is form state:** it counts in `isAddressRowChanged` (a pick alone is sent) and is merged as a user field after a failed step (`EDITED_FIELDS`). `isAddressPartChanged` was removed (no caller).
- **Lookups** are kept by row key in the Section (survives the 768 px remount) and cleared when the edit ends.
- **Tests:** the 4.2 unit and e2e line 1 helpers now find a `combobox`; the 4.2 unit server and `mockProfileDefaults` answer autocomplete with `enabled: false`. The 360 px e2e scrolls line 1 up first: the popup is placed within the visual viewport and flips above when there is no room below.
- Not done here (spec: after the commit): the worktree local-view mock (`PLACES_ENABLED=1`, `dev-mock.ts` Google answers).
- **Review pass 1 patches:** triage rows 1–11.
  - On a pick, line 1 holds the suggestion's street (`mainText`) and keeps it when the answer has none. A late answer applies only to the latest pick, while editing and not saving.
  - The help line shows only after an `enabled:true` answer.
  - `autocomplete="address-line1"` is restored through the ref.
  - The pick is announced politely.
  - A country change ends the lookup and resets the combobox.
  - A complete pick with no settable country stays unverified.
  - `isAddressPartChanged` is removed, and three tests are added.
  - Rows 12–15 are in `deferred-work.md`.
- **e2e flake fixed before commit:** "axe … with the suggestions open" flaked once on mobile-360 under full-suite load (0 options for 5 s). Radix closes the popover when the page scrolls under it, and on mobile the focused field scrolled while typing. The tests that open the list now centre line 1 first (`searchLine1`, as the suggest test already did). That gives 60/60 on repeat, and the next full run has no 4.3 flake.
- **Final verification (Node 24.22):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 5985/5985 passed (213 files), coverage thresholds met.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 952 passed, 11 skipped. 1 flaky: the known foundation `DisabledAction` tooltip-Escape flake (`e2e/primitives.spec.ts:75`, in `deferred-work.md`).

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B, E | While a pick's details call is pending, line 1 holds the full suggestion label. A Save then sends it as `addressLine1`, and a late answer can dirty the form after the edit ended. A second pick before the first answer restores the wrong text on failure | medium | Real (the agent flagged it too) → **patch**: on a pick, line 1 shows the suggestion's `mainText` (the street); apply a late answer only while still editing and not saving; keep the pre-pick snapshot from typed text only. Tests included. |
| 2 | B | A partial pick with an empty `addressLine1` leaves the comma-joined label in line 1 | medium | Real: `placeAddressFill` skips empty parts → **patch**: covered by row 1 (line 1 keeps `mainText` when the answer has none), with a test. |
| 3 | B, E | With Places off (production until the BAA), every US/CA/AU row shows "Pick a suggestion…", and the first 3-character search posts once before `enabled:false` hides it | medium | Real: the help line shows before any answer → **patch**: show the help line only after an `enabled:true` answer has been seen (the one cheap request when off stays; the server answers without calling Google), and pin the 4.2 focus test's exact description again. |
| 4 | B | Line 1 lost `autocomplete="address-line1"` (WCAG 1.3.5), because the shared `Combobox` hardcodes `off` | medium | Real AA regression → **patch** (Team A): set the attribute on the input through its ref, as the read-only workaround does. **defer** (Foundation): an `autoComplete` prop on `Combobox`. |
| 5 | B | No screen-reader message after a pick fills the other fields (WCAG 4.1.3) | low | Real → **patch**: a polite announcement through `useAnnounce` ("Address filled from the suggestion.", DRAFT; "… and verified." on a complete pick). |
| 6 | B, E | Changing the country doesn't end the lookup, so another country's stale suggestions can be picked under the same `lookupId` | low | Real → **patch**: end the row's lookup and reset the combobox (key it by country code) when the country changes. |
| 7 | E | A complete answer whose country can't be put in the Select still marks the row Verified | low | Real, a direct fix → **patch**: `validated` stays false when the country isn't filled. |
| 8 | B, E | `isAddressPartChanged` is exported with no production caller | low | Real → **patch**: remove it (and its test), or use it. |
| 9 | VG | Untested: line 1 read-only while saving (no change, no autocomplete call) | low | Real gap → **patch**: a held-save test. |
| 10 | VG | Untested: the stale-details guard (pick, type, late answer) | low | Real gap → **patch**: a held-details test. |
| 11 | VG | Untested: a new lookup id after Cancel and reopen | low | Real gap → **patch**: a test. |
| 12 | B | Restored drafts now also carry `validated` | low | Covered by the existing draft-rebase item, which must also reset `validated` → **defer** (Team A, a new entry pointing to it). |
| 13 | B | "Verified" is asserted by the client: the proxy accepts any `validated` boolean, so any caller can mark an address verified | medium | True since 4.2 (the backend stores it as given); a fix needs the backend or a server-side check tied to a details answer → **defer** (backend/Foundation). |
| 14 | B | Under `next dev`, `logApiCall` prints request bodies (typed text, place ids) because `redact()` doesn't cover them | low | Dev only, and the logger is foundation → **defer** (Foundation). |
| 15 | B | The `readOnly` workaround instead of a `Combobox` prop | low | Works; a prop is foundation → **defer** (with row 4's prop). |
| 16 | B, E | `validated` merges on its own after a failed save, so it can survive server-changed parts | low | Needs a concurrent server change and a failed step → rejected. |
| 17 | E | Typing then reverting drops "Verified" | low | Clearing on any manual edit is the spec'd rule → rejected. |
| 18 | B | `isUnitedStatesName` belongs in `lib/shared` | low | That would be a shared-folder addition (a foundation PR); `lib/api` keeps it Team A → rejected. |
| 19 | B | `PLACES_INPUT_MAX_LENGTH` copies the server's 120 | low | Moving it to `bff-contract` is a foundation change; the mismatch only costs one silent 400 → rejected. |
| 20 | B | The e2e "other country" test waits 600 ms | low | Proving that nothing is sent needs a wait → rejected. |
| 21 | E | A suggestion with an empty label | low | The server never returns one → rejected. |
| 22 | E | The clear button works while saving | low | Its only effect is the list announcement; the text stays → rejected. |
| 23 | B | The spec names a session Node path | — | The fix edits this build's spec → rejected. |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin` (the default `node` is 26); no git commits, no push; `corepack pnpm` if `pnpm` isn't on `PATH`; never `pnpm dev` here; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
