# Epic 4 Context: Addresses

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->
<!-- Compiled 2026-10-19 on feat/NG-9026-epic-4 (built on the Epic 3 branch). Sources: epics.md (Epic 4, D1–D18, "Foundation F6 and path corrections", per-story Foundation lines), docs/FOUNDATION.md, EXPERIENCE.md (UJ-4, Address edit row), epic-3-context.md, deferred-work.md, sprint-status.yaml, the current code, 1h-ng-bo-core-be (person location resource/service; confirmed from code, not live). -->

**Read `docs/FOUNDATION.md` before writing any code.** This file doesn't repeat it. It lists the pieces Epic 4 uses, the rules a Team A story PR must follow and the open points. Where this file and FOUNDATION or the code disagree, FOUNDATION and the code win.

## Goal

Epic 4 (Jira NG-9026) fills the Addresses Section (id `addresses`, "05 Addresses", the last Section on the Contacts tab of `/`). Users see every address with the Primary first, add and edit addresses in collapsible rows, get address-line-1 suggestions for US/CA/AU that fill the row and mark it Verified, and keep exactly one Primary address that can't be removed. It carries UJ-4 (Sam moves house: add with a suggestion, save, Make primary, remove the old one). **State on 2026-10-19:** all four stories are backlog. Epic 3 is in review. `features/addresses` is still the F6-1 `ProfileSectionPlaceholder` stub. `lib/api/addresses.ts` holds only `ADDRESS_LIST_PAGE_SIZE` (100), `PINNED_COUNTRY_CODES` and two path builders. `lib/api/places.ts` holds only `isPlacesCountry` and two paths. The allowlist, error and copy area files are empty. The `/api/places/*` server routes are built (F2).

## Stories

- Story 4.1: View addresses
- Story 4.2: Add and edit addresses
- Story 4.3: Address suggestions via server
- Story 4.4: Primary address and removal

## Requirements & Constraints

- **Read (4.1):**
  - One read: `GET v2/person/location/list?page=0&size=100` under `keys.addresses()`, loaded by a loader registered in `lib/api/addresses.ts`.
  - Primary row first, the rest in platform order (the backend sorts by updated date, newest first).
  - Columns: Address · Label · Type · Status · actions.
  - Address is a one-line summary: line 1, line 2 (if any), city, state zip. The country is omitted for United States and appended otherwise. Treat `"n/a"`, blank and null parts as missing (`isNotProvided` / `joinProvided` in `lib/shared/display-value.ts`).
  - Label shows the filled Primary chip on the Primary row only. Type shows the Address Type. Status shows "Verified" (`StatusBadge status="verified"`) when validated, and nothing otherwise.
  - The kebab is named "More actions for {one-line address}". Its menu never shows an item without a handler.
  - Empty: one row "No addresses yet · Add address". Load error: "Couldn't load addresses · Retry", and Retry revalidates only `keys.addresses()`. A 403 shows Section-level `NoAccess` (the `person/location/list` owner row `addresses` is built). The count shows in the header and the index.
- **Edit (4.2):**
  - Edit is entered from the header Edit, a kebab Edit (that row expanded and focused, the other saved rows collapsed) or "Add address" (one new row, expanded, focus on Address Type).
  - A collapsed row is 56 px: chevron button (`aria-expanded`, "Expand {one-line address}"), then the read columns.
  - The expanded row is a full-width grid: [Address Type][Country][Set as primary ×2] / [Line 1 ×2][Line 2 ×2] / [City][County][State/Province][Zip]. The labels of the optional fields end in "(optional)", and required fields have no marker.
  - Address Type is a fixed in-app list: Home, Main Work, Other Work, Vacation Home (see open decision 2).
  - Country comes from `GET v2/public/countries` under `keys.countries()`, loaded only in edit. United States, Canada and Australia are pinned first in that order, the rest alphabetical, and any "n/a" entry is dropped. A new row defaults to United States. On a load failure the select shows "Couldn't load countries · Retry", and Save is blocked only for rows that need a country.
- **Validation (zod 4 `addressesSchema` in `features/addresses/schema.ts`, on blur and on Save):**
  - Required: Address Type, Country, Line 1, City, Zip. The required copy is draft.
  - United States Zip: exactly 5 digits, else "Enter a 5-digit ZIP code".
  - Duplicate: country + line 1 + city + zip + type equal to another row (case-insensitive, trimmed) shows "This address is already on your profile" on Line 1.
  - On Save the invalid row expands (`revealField`), focus moves to the first invalid field, and nothing is sent.
- **Save (4.2 + 4.4):**
  - A new row is sent as `POST v2/person/location` and a changed saved row as `PUT v2/person/location/{id}`. Unchanged rows aren't sent.
  - The DTO uses `primary` / `validated`, never `isPrimary` / `isValidated`.
  - A manual new address is sent with `validated=false`. An edited saved row keeps `validated` only if no address part changed.
  - Fixed order: the new Primary first (PUT, or POST if it is new), then the other PUT/POST, then `DELETE` for removed rows.
  - On a step failure, later steps aren't sent, the key is refetched and the baseline rebased, so Retry sends only the rest (`runSaveSteps`, `mode: "stop"`).
  - On success: mutate the key, return to read view, show "Addresses saved.", move focus to the `h2`, clear the draft and send `section_save`.
  - A network failure shows "Couldn't save addresses. Check your connection." with Retry. `save()` never throws.
  - Save all runs `addresses` last (`SAVE_ORDER` is built).
  - Drafts store the address rows only, under the key `addresses`.
- **Suggestions (4.3):**
  - Shown only when the row's country is US/CA/AU and the server answers `enabled=true`. Line 1 is the address `Combobox` variant. Each lookup gets a new `lookupId` (UUID v4), reused until its details call.
  - A picked suggestion with `complete:true` fills line 1, city, county, state, zip and country, and sets `validated=true`. With `complete:false` the fields fill but `validated` stays false.
  - A later manual edit of any address part resets `validated`.
  - Google failures fall back silently to manual entry, with no banner. With `PLACES_ENABLED` off, no listbox and no help line show.
  - On mobile, suggestions show under line 1 and the Save all pill hides while the keyboard is open (the pill-hiding is built in 1.14).
- **Primary and removal (4.4):**
  - The first or only remaining address is always sent as Primary, and its checkbox shows checked.
  - "Set as primary" is exclusive across the Section and applies on Section save. The current Primary's checked box is aria-disabled with "Set another address as primary first" (draft copy).
  - Read-view kebab: "Make primary" · Edit · Remove on non-Primary rows, Edit · Remove on the Primary row.
  - Make primary saves at once, with no confirm: PUT the new row `primary=true`, then PUT the old one `primary=false`. Then refetch and show "Addresses saved.".
  - Remove is aria-disabled with "Make another address primary first" on the Primary row and "You need at least one address" on the last row. The rules are checked against the draft.
  - Remove strikes the row through ("Removed on save" + Restore). A new row is deleted outright. No confirm, toast or undo.
- **Quality bar:** WCAG 2.1 AA, 44 px targets, reduced motion, 360 px with no horizontal scroll, axe in light and dark, semantic tokens only, copy verbatim from Voice and Tone or marked `// DRAFT COPY`.

## Technical Decisions

**Rules for a Team A story PR** (FOUNDATION §1; the same as Epics 2 and 3):

- **Edit only these files:**
  - `features/addresses/**` (keep the `AddressesSection` export)
  - `lib/api/addresses.ts`, `lib/api/places.ts` + their tests
  - `lib/server/proxy/allowlist/addresses.ts` + `.test.ts`
  - `lib/api/errors/addresses.ts` (extend `Field`, today `never`)
  - `lib/shared/messages/addresses.ts` and `places.ts`
  - `test/page-handlers/profile.ts`, `e2e/fixtures/addresses.ts`, `defaults-profile.ts`, `e2e/profile-*`
- **Never edit:** `features/shell/**`, `lib/api/index.ts`, `keys.ts`, `allowlist/index.ts`, `test/**` (except the profile handlers) or `e2e/fixtures/{core,index}.ts`. A throttle is a foundation PR (`lib/server/throttle.ts`, planned), never built inside a story.
- **Names:** use area-prefixed exports (T6), e.g. `addressesListPath`, not `listPath`.
- **Copy:** grep the whole catalog first (T5). These already exist: `COMBOBOX_MESSAGES.addressHelp`, `COMMON_MESSAGES` (`primary`, `makePrimary`, `verified`, `moreActionsFor`, `remove`, `restore`), `SECTION_MESSAGES` (`removedOnSave`, `newNotSaved`), `SHELL_MESSAGES` (the Section label and the column headers) and `STATE_MESSAGES.loadNounAddresses`.
- **Coverage:** `lib/api/addresses.ts` and `places.ts` need 100 % coverage.
- **Test defaults:** `profileReadHandlers` and `mockAddresses` answer the list with a bare `[]`, but the backend returns a Spring Page. Story 4.1 changes both defaults to the Page shape together with the loader.

**Built pieces to use, per story** (FOUNDATION §3–§5 has the APIs):

- **4.1:** `StateFrame` (`skeleton="table"`, `columns={SECTION_COLUMNS.addresses}`, `loadError {kind:"section", sectionId:"addresses"}`, `attempt`, `onReady={useSectionFrame("addresses").onReady}`), `SectionLandmark` (from the first render, never remounted), `SectionHeader count`, `useReportSectionCount`, `SectionTable`, `RowActions`, `Chip variant="primary"`, `EmptyState variant="row"`, `StatusBadge`.
- **4.2:** `useSectionForm` (`onNoChanges:"close"`, `cancelFocus:"heading"`, `fieldOrder`, `errorFields`, `startEdit({ focus })`, `revealField`, `draftFields` + `describeDraftDiff` + `dataStatus`), `SectionFooter addRow`, `SectionTable renderExpanded` (keep the expanded state in the Section, because the 768 px swap remounts cells), `Select` (`placeholder`, `loading`), `InlineBanner` with Retry, `Checkbox`, `runSaveSteps(steps, { scope:"addresses", mode:"stop", refetch, rebase })`, `mapApiError("addresses", …)`.
- **4.3:** the address `Combobox` (`minChars 3`, `debounceMs 250`, `maxResults 5`, `mode "free-text"`, `quiet`, `highlightMatch`, `searchDisabled`, `inputRef`). Bind line 1 through a `Controller` so typing counts as a user change; the suggestion fill uses `form.setValue(…, { shouldDirty: true })`. Live search loads through the Combobox `load` with `callApi`, never through SWR. The server contract types (`PlaceSuggestion`, `PlaceAddress`, `lookupId`) are in `lib/shared/bff-contract.ts`.
- **4.4:** `DisabledAction`, `Tooltip keepOpenOnPress`, `RowRemoval` / `RowEditStatus`, `toastSuccess` / `toastError(text, { onRetry })`, `runSaveSteps`.

**Endpoints** (confirmed from 1h-ng-bo-core-be code, not yet confirmed live):

- **`GET v2/person/location/list`** (4.1):
  - Params `page` (default 0) and `size` (default 50). The allowlist entry allows only these two, and any other param gets 400. It reads the caller's own person.
  - Returns a Spring Page `{content, totalElements, …}` sorted by updated date, newest first.
  - Row fields: `id`, `name`, `type`, `country`, `fullAddress`, `addressLine1`, `addressLine2`, `cityName`, `county`, `stateName`, `lat`, `lon`, `postalCode`, `countryCode`, `validated`, `primary`, `active`, `personLocationType`.
  - The code serializes the booleans as `primary` / `validated`, while the ai-agents-knowledge docs show `isPrimary` / `isValidated`. Accept both until confirmed live.
- **`POST v2/person/location`, `PUT v2/person/location/{id}`** (4.2):
  - Body fields: `fullAddress`, `addressLine1`, `addressLine2`, `county`, `cityName`, `stateName`, `country`, `countryCode`, `postalCode`, `lat`, `lon`, `validated`, `primary`, `personLocationType`. Use a strict zod body (JSON only).
  - POST rejects a missing location type, country, city, address1 or zip, each with its own message: "Operation failed. Personal location type is not provided." and "Operation failed. Location {country|city|address1|zip} is not provided.".
  - On PUT the backend turns empty strings into null, which most likely means "unchanged", not "cleared". The location code doesn't handle "n/a".
  - Always send `primary` explicitly. On PUT a missing or null `primary` falls into the set-as-primary branch.
- **`DELETE v2/person/location/{id}`** (4.4): a soft delete.
- **Primary rules (backend):**
  - The first address becomes Primary automatically.
  - Writing `primary:true` unsets the old Primary.
  - `primary:false` on the current Primary, or deleting it, fails with "Operation failed. Please, first set another Location as the primary one.". The fixed order (new Primary first, deletes last) avoids this. Add an anchored rule for it.
  - Ownership failure: "Operation failed. Location with id: '%d' is not related to '%s' with id: '%d'.".
- **`personLocationType` enum:** Home, Main Work, Other Work, Vacation Home, Billing, Mailing, Temporary.
- **`GET v2/public/countries`** (4.2): `List<{id, name}>`, with no ISO code. Whether an "n/a" entry exists depends on the data.
- **`/api/places/autocomplete` and `/api/places/details`** (built, F2):
  - Kill switch `"pp"`. With `PLACES_ENABLED` not `1` they answer `{enabled:false}`.
  - A country outside US/CA/AU gets empty suggestions, with no Google call.
  - Autocomplete failures answer empty. Details answers 504 on a timeout and 502 on other failures.
  - CSP stays `connect-src 'self'` (Places is server-proxied).

**D-A save safeguard (already in `callApi`):** every non-GET call first re-reads `myself`. Unit tests must let `myself` load before a write. The stories add nothing.

**Stale AC text** (the ACs are frozen; read them as follows):

- `lib/server/proxy-allowlist.ts` means `allowlist/addresses.ts`. `lib/shared/messages.ts` and `lib/api/errors.ts` mean the `addresses` area files.
- `useRegisterSection` means `useSectionForm`.
- "Replaces the placeholder in `contacts-panel.tsx`" means: fill the `features/addresses` stub.
- The Places route ACs marked *(built: spec F2)* are done. 4.3 adds only the client side.
- "No CSRF or session-binding check" is already true (D5).

**Open decisions for the story specs:**

1. **Response field names (4.1):** the code says `primary` / `validated`, the docs say `isPrimary` / `isValidated`. The loader accepts both until demo confirms. Also confirm which of `type` and `personLocationType` carries the Address Type.
2. **7 vs 4 location types (4.1/4.2):** the AC and NFR10 fix the list at four. The backend also allows Billing, Mailing and Temporary, which other clients may have saved. Decide how the read view shows them, and whether the edit Select keeps such a row's current type, so an edit doesn't silently change it.
3. **Forward dependency (4.1):** 4.1's "Add address" header button, its empty-state action and the kebab menu items need 4.2 and 4.4. Decide what 4.1 ships, for example the button and kebab hidden or without handlers until those stories land, since a menu never shows an item without a handler.
4. **"n/a" for cleared optionals (4.2):** the AC sends `"n/a"`, but the backend doesn't handle it (it would be stored as text), and on PUT an empty string most likely means "unchanged". Decide with the PM or backend how a cleared line 2, county or state is cleared. The read side already hides `"n/a"`.
5. **Countries without codes (4.2/4.3):** the countries list has no ISO code, but the AC pins by code (`PINNED_COUNTRY_CODES`), sends `countryCode`, and the Places gating (`isPlacesCountry`) needs a code. Decide on a name → code mapping (for example the pinned three by name, plus the code from a Places details result) or another source.
6. **Places launch (4.3):** `PLACES_ENABLED` stays off everywhere until the Google BAA. The deferred CSP item can likely close as "no change" (the routes are server-proxied). The paid autocomplete has no per-session throttle (deferred-work). Decide whether to throttle; if so, ship it as the shared foundation `lib/server/throttle.ts`.

## UX & Interaction Patterns

- **Read view:**
  - A real `<table>` with 44 px rows, hairline dividers and accent hover/focus-within. No row click.
  - An outline "Add address" button with a plus icon sits in the header, and every row has an always-visible 44×44 kebab.
  - Below 768 px each row is a stacked card. Line 1 holds the one-line address, line 2 (muted) the Primary chip + type + Verified, with the kebab on the right. Tapping the card does nothing.
- **Edit view:**
  - The container gets the primary border and halo, and the header shows "Editing".
  - The `tfoot` shows "Unsaved changes" after the first change, then Add address / Cancel / Save. "Saving…" makes inputs read-only and disables Cancel; other Sections stay usable.
  - A new row's header reads "New address · New · not saved".
  - Inputs are 44 px with 16 px text. On mobile the fields stack full width in the same card.
  - Cancel reverts only Addresses, with no confirm. Escape never cancels, and Enter never submits.
- **Combobox:** ARIA 1.2 combobox with the listbox directly under line 1, matched text in 600 and the help line "Pick a suggestion to fill the rest and verify the address.". Escape closes only the listbox, and Tab keeps the typed text.
- **Addresses never confirm:** Make primary is immediate (an address isn't a sign-in identifier), and Remove is a strikethrough until Save.
- **Disabled actions:** aria-disabled, focusable, a no-op, with the reason in a Tooltip (`aria-describedby`).

## Cross-Story Dependencies

- **Inside the epic:**
  - 4.1 builds the loader, the list entry and the read view.
  - 4.2 adds the countries read, the schema, POST/PUT, collapsible rows, drafts and the "Set as primary" checkbox (its value is sent; exclusivity comes in 4.4).
  - 4.3 adds line-1 suggestions inside 4.2's expanded row.
  - 4.4 adds the DELETE entry, the save order, Make primary, the Remove rules and the auto-Primary rule.
  - All four share `features/addresses` and the `addresses` area files, so they land one after another.
- **Epic 1:** Save all runs `addresses` last. Drafts, the leave guard, `revealField` on Save all and the D-A safeguard apply. Story 1.14's pill hides with the on-screen keyboard.
- **Epic 3:** the patterns of the Phone and Email Sections (row kit, Remove/Restore, disabled reasons, per-row state kept in the Section) are the model to follow. There is no shared code beyond the foundation.
- **Ops:** Story 1.16 turns Places on per deployment after the BAA.
- **Dates:** feature freeze 2026-10-22, demo QA of UJ-1 to UJ-5 (UJ-4 = Sam moves house) by 2026-10-24, go-live 2026-10-29.
