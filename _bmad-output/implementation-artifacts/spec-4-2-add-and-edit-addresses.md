---
title: 'Story 4.2: Add and edit addresses'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: '2ba19d0f739246aba7a214bda52ba79ecd5568b7'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users can see their addresses (Story 4.1) but can't add one or correct one (Story 4.2, FR26, NG-9026; acceptance source: `epics.md` "### Story 4.2: Add and edit addresses").

**Approach:**
- Add the edit view to `features/addresses` on `useSectionForm`. Rows collapse and expand, an expanded row holds the field grid, and new rows are added in place.
- Add the write calls to `lib/api/addresses.ts` (`POST v2/person/location`, `PUT v2/person/location/{id}`) and the countries loader (`GET v2/public/countries`), with strict allowlist entries in `allowlist/addresses.ts`.
- Save sends one request per changed or new row through `runSaveSteps` (`mode: "stop"`). After a failure, Retry sends only what is left.
- This story also adds the entry points held back from 4.1 (decision 1a): "Add address" in the header, on the empty row and in the footer, and a row kebab holding Edit. Make primary and Remove come in 4.4.

## Boundaries & Constraints

**Always:**
- **Allowlist** (`allowlist/addresses.ts`, with tests):
  - `GET v2/public/countries` (no query);
  - `POST v2/person/location` and `PUT v2/person/location/{id}` (numeric id), each with a strict zod body (JSON only).
  - The body fields are `personLocationType` (the backend's seven values), `addressLine1`, `addressLine2`, `cityName`, `county`, `stateName`, `postalCode`, `country`, `primary` and `validated` (booleans; never `isPrimary`/`isValidated`, decision 1a), plus `fullAddress` on PUT only. Each typed text field is at most 255 characters, and `fullAddress` at most 1,100 (decision below).
  - Anything else is a 400.
- **Countries** (`lib/api/addresses.ts`): `fetchCountries` with `registerFetcher("countries", …)` under `keys.countries()`, read only in edit view.
  - The list is ordered United States, Canada, Australia first (matched by name, decision 3a), then the rest alphabetical. Entries named "n/a" or blank are dropped.
- **Entry points:**
  - Header "Edit" (outline) and "Add address" (outline, plus icon, 44 px);
  - the empty row's "Add address";
  - the footer's "Add address" (ghost);
  - each read row's kebab "More actions for {one-line address}", with Edit only.
  - "Add address" appends one new row, expanded, with focus on Address Type. A kebab Edit opens edit view with that row expanded and focused; the other saved rows start collapsed. The header Edit starts with every row collapsed and focus on the first chevron.
- **Collapsed row:** a 44 px chevron (`aria-expanded`, named "Expand {one-line address}" or "Collapse {…}"), then the read columns. Each row expands on its own, and the expanded state lives in the Section, keyed by row key.
- **Expanded row** (`SectionTable renderExpanded`):
  - A header: the chevron, then "New address" + "· New · not saved" on a new row, or the one-line address on a saved row.
  - Then a 4-column grid with 16 px gaps:
    - [Address Type][Country][Set as primary ×2]
    - [Address line 1 ×2][Address line 2 ×2]
    - [City][County][State/Province][Zip]
  - Optional fields are labelled "(optional)". 44 px controls, `FormField`/`Select`/`Input`/`Checkbox`.
  - Below 768 px the fields stack full width in the card.
- **Address Type:** a `Select` of exactly Home, Main Work, Other Work, Vacation Home (decision 2a). A saved type outside the four shows through `unlistedValue` and is never sent unless changed.
- **Country:** a `Select` of the countries list, defaulting to United States on a new row.
  - A saved country not in the list shows through `unlistedValue` and is sent only if changed.
  - If the list fails, the Select shows "Couldn't load countries · Retry" (DRAFT). Save is blocked only for a row that needs a country picked: a new row, or a saved row whose country is empty.
- **Validation** (`features/addresses/schema.ts`, `addressesSchema`; on blur and on Save; nothing is sent while an error remains; on Save the first invalid row expands via `revealField` and its first invalid field takes focus):
  - Required: Address Type, Country, Line 1, City, Zip, each with DRAFT copy.
  - US zip: the trimmed value must be exactly 5 digits → "Enter a 5-digit ZIP code".
  - Duplicate: country + line 1 + city + zip + type equal to another row in the Section (trimmed, case-insensitive) → "This address is already on your profile" (DRAFT), on Line 1.
- **Save** (`runSaveSteps`, `scope: "addresses"`, `mode: "stop"`, `refetch` the key, `rebase` the baseline):
  - Order: the row with "Set as primary" checked first, then the other rows in table order.
  - A changed saved row → `PUT`; a new row → `POST`; unchanged rows aren't sent.
  - Every PUT sends `primary` and `validated` explicitly, because the backend demotes the current Primary when `primary` is missing, and keeps the old `validated` when it is missing.
  - `validated` is true only if the saved row was validated and no address part changed (country, line 1, line 2, city, county, state, zip). A new row is sent with `validated: false`.
  - Every PUT sends `fullAddress` rebuilt the way the backend builds it on create: `"{line 1}, {city}, {zip}, {country}"`. The backend doesn't recompute it on PUT.
  - Text is sent trimmed. A cleared optional field on a saved row is sent as `"n/a"` (decision 2a). On POST, empty optional fields are omitted.
  - **Success:** the shell's "Addresses saved.", read view, focus on the `h2`, the draft cleared and `section_save` (all through `useSectionForm`).
  - **Failure:** the mapped error at the field when the row can be identified, else at Section level with Retry. The key is refetched and the baseline rebased. A network failure shows "Couldn't save addresses. Check your connection." + Retry. `save()` never throws.
- **Errors** (`lib/api/errors/addresses.ts`, anchored backend texts):
  - the five POST required messages ("Operation failed. Personal location type is not provided." / "… Location country is not provided." / "… Location city is not provided." / "… Location address1 is not provided." / "… Location zip is not provided.") → their field;
  - "Operation failed. Please, first set another Location as the primary one." → field `primary`, "Set another address as primary first" (DRAFT).
- **"Set as primary":** a `Checkbox` per expanded row. Its value is sent as `primary`. Exclusivity and the guards on the current Primary come in Story 4.4; until then the backend rule above maps to its message.
- **Drafts:** `draftFields: ["rows"]`, `describeDraftDiff`, `dataStatus`. The rows carry no expanded state.
- **Copy:** `lib/shared/messages/addresses.ts`. Grep the catalog first, and reuse `SECTION_MESSAGES.newNotSaved` and any shared field labels.
- Enter never submits, and Escape never cancels. 44 px targets, axe in light and dark, no horizontal scroll at 360 px.

**Decisions (human, 2026-10-19):**
- **1a, send `primary` / `validated`:** these are the only names the backend's `PersonLocationRequestDTO` reads; it silently ignores `isPrimary`/`isValidated`, and on PUT an ignored `primary` demotes the current Primary. The proxy body schema refuses the `is…` forms. Reads still accept both (4.1).
- **2a, clear with `"n/a"`:** a cleared optional field (line 2, county, state) on a saved row is sent as `"n/a"`. This app reads it as empty, and other 1health screens may show the literal text (logged in `deferred-work.md`).
- **3a, no `countryCode`:** nothing sends `countryCode`. The list is pinned by name ("United States", "Canada", "Australia"), and Story 4.3 maps those three names to codes in the client. A PUT leaves a stale stored code, which the read view ignores because the name decides (logged in `deferred-work.md`).

- **`fullAddress` cap (user, 2026-10-19, after implementation):** I checked the backend first. Text attributes are stored as Postgres `text` (`TypeUtil.java:214`, `LONGNVARCHAR`), with no limit in code. A per-attribute `maxLength` would be database configuration (`TypeUtil.java:338-364`), and neither code nor docs give one for `fullAddress`. So the proxy allows `fullAddress` up to 1,100 characters (four 255-character parts plus separators), and the write body cap becomes 24 KB. Confirming the real limit with the backend is logged in `deferred-work.md`.

- **Foundation test fix (user-approved, 2026-10-19):** `features/shell/use-myself.test.tsx` ("leaves every other key without automatic retries") registered its own `countries` loader, which now clashes with the real one. It now fails the real loader at the `/api` boundary (countries answers 502) and still asserts one call. This ships as its own test-only commit, placed after the story commit because it needs the story's loader.

**Decisions (agent, 2026-10-19):**
- **No foundation or Team B edits are expected.** Everything goes in Team A files: the proxy matches numeric `{id}` segments, and the shell already has `renderExpanded`, `revealField`, `runSaveSteps` and `Select unlistedValue`. If one turns out to be needed, ask first and give it its own commit (user instruction).
- **Primary-first order now:** the request order already follows Story 4.4's rule. It's harmless on its own and saves a rewrite later.
- **Local-view mock, after the commit:** `POST` and `PUT v2/person/location` apply the change to the mock's address rows with the backend's rules: POST required fields, first address auto-Primary, `primary:true` unsets the old Primary, `primary:false` on the Primary is refused, a missing `primary` on PUT demotes, and `""`/null keep the old value. Countries come from a sample list (including an "n/a" entry).

**Never:** edit `features/shell/**`, `components/ui/*` (existing), `lib/api/{index,keys}.ts`, `allowlist/index.ts`, `test/**` (except `test/page-handlers/profile.ts`), `e2e/fixtures/{core,index}.ts` or another team's files, without asking first. Never import from another feature. Never send `isPrimary`, `isValidated` or `countryCode`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | Add address; Home, US, "1 Pine St", SF, CA, 94105 | `POST` body `{personLocationType:"Home",addressLine1:"1 Pine St",cityName:"SF",stateName:"CA",postalCode:"94105",country:"United States",primary:false,validated:false}`; "Addresses saved."; read view; `h2` | N/A |
| Edit | saved validated 2: city SF → Oakland | `PUT /2` with every field, `validated:false`, `primary` as saved, `fullAddress` rebuilt | N/A |
| Label only | saved validated 2: type Home → Main Work | `PUT /2` with `validated:true` (no address part changed) | N/A |
| Unchanged | edit view opened, nothing changed, Save | nothing sent; read view | N/A |
| Invalid | new row, US zip "941" / empty city / duplicate of row 2 | the matching messages; that row expands; focus on the first invalid field; nothing sent | N/A |
| Two steps | changed row 2 + new row; PUT ok, POST 500 | refetch + rebase; Retry sends only the POST | Section error + Retry |
| Primary rule | uncheck Primary on the Primary row; 400 "…first set another Location as the primary one." | "Set another address as primary first" | stays in edit |
| Countries fail | countries 500 in edit view | "Couldn't load countries · Retry"; a new row can't save; saved rows can | Retry reloads countries |
| Unlisted | saved "Billing" type, "U.S.A." country | both show as unlisted values; not sent unless changed | N/A |
| Proxy | PUT body with `isPrimary` or an unknown field; non-numeric id | 400 | N/A |

</frozen-after-approval>

## Code Map

- `features/addresses/addresses-section.tsx` -- the 4.1 read view to extend: rows (`addressRowsOf`, keys), columns, `StateFrame`.
- `features/contacts/email-section.tsx` + `email-schema.ts` -- the edit template (copy, don't import): the attempt counter, `baseline`, `save()`, `useSectionForm` options, the rebase on leaving edit, `latestSaved` refs, add/edit entry points, header actions, `SectionFooter addRow`, draft rows and `describeDraftDiff`.
- `features/personal/*` (read only) -- an example of a `FormField` + `Select` grid on `useSectionForm` with `errorFields` per field.
- `lib/api/addresses.ts` -- `Address`, `toAddresses`, `fetchAddresses`, `countriesPath`, `PINNED_COUNTRY_CODES` (replace it with names, or add `PINNED_COUNTRY_NAMES`; T5: add, never change a shared export, but this module is Team A's).
- `lib/server/proxy/allowlist/addresses.ts` -- the list entry. Body schemas and `maxBytes` are in `allowlist/contacts.ts`.
- `features/shell` (read only): `useSectionForm` (`revealField`, `startEdit({ focus })`, `errorFields`, `fieldOrder`), `runSaveSteps`, `SectionTable renderExpanded`, `SectionFooter`, `RowActions`.
- `components/ui/{select,checkbox,form-field,input}.tsx` (read only).
- `lib/api/errors/addresses.ts` -- `Field` (`never` today): add `type`, `country`, `line1`, `city`, `zip`, `primary`.
- Backend (1h-ng-bo-core-be, from code): `PersonLocationFactory.java` (POST required fields at 172-189; primary rules at 197-232; PUT `getValueOrDefault` at 234-268), `PersonLocationRequestDTO.java:20-36`, `OneHealthUtil.java:181` (the `fullAddress` format).
- Tests to copy: `features/contacts/email-section.edit.test.tsx` (20 s timeout), `email-schema.test.ts`, `lib/api/contacts.test.ts` (writes), `allowlist/contacts.test.ts` (body schemas); e2e `e2e/profile-email.spec.ts` (edit describe), `e2e/fixtures/addresses.ts` (`mockCountries` exists; add `mockAddressCreate` / `mockAddressUpdate`).
- `../personal-profile-local-view/lib/server/dev-mock.ts` -- `personLocations` and the list handler (from 4.1).

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/addresses.ts` (+ test) -- the countries, POST and PUT entries and their strict bodies.
- [x] `lib/api/addresses.ts` (+ test) -- countries loader and order, `addressCreatePath` / `addressUpdatePath`, `saveAddressCreate` / `saveAddressUpdate` (never throw), the body builders.
- [x] `lib/api/errors/addresses.ts` (+ test), `lib/shared/messages/addresses.ts` -- the rules and copy.
- [x] `features/addresses/schema.ts` (+ test) -- every rule, the draft rows and the diff.
- [x] `features/addresses/addresses-section.tsx` (+ `addresses-section.edit.test.tsx`) -- every I/O row except Proxy; axe light and dark in edit view.
- [x] `e2e/fixtures/addresses.ts`, `e2e/profile-addresses.spec.ts` -- add, edit, label-only, invalid with reveal, two-step Retry, countries failure, 360 px edit, axe.
- [x] `sprint-status.yaml` -- the `4-2` line only.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100 % coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed, or each other path was approved by the user and is in its own commit.

## Implementation Notes

- **Foundation test conflict (approved and applied, own commit):** `features/shell/use-myself.test.tsx` now fails the real `countries` loader at the `/api` boundary; see the Decisions.
- **Which rows are checked and sent:** only new rows and changed saved rows with an id (`isAddressRowSent`); an untouched legacy row (bad zip, legacy duplicate) never blocks a save. A field that is empty before and after is left out of the PUT; a cleared optional field that had a value is sent as `"n/a"`.
- **Type and country on PUT:** sent when changed, or when listed (one of the four types; a country in the loaded list). With the countries list failed or not loaded, an unchanged country is left out (the backend keeps it).
- **Order:** a newly checked "Set as primary" row first (new, or saved and not Primary before), then table order.
- **After a failed step:** the refetched rows replace the form rows three-way (`mergeAddressRows`): succeeded rows and unchanged fields come from the server, a created row takes its new id from the POST answer, and only the user's unsent edits stay. Server field errors map to the failed row through `errorFields` getters (`createFailedRowTarget`).
- **Select validation:** a Select validates when its list closes (or on blur while closed), so opening the list never leaves a stale "Choose…" error.
- **`fullAddress` cap (resolved):** the proxy allows `fullAddress` up to 1,100 characters (user decision after checking the backend), and the write body cap is 24 KB. Confirming the real backend limit is in `deferred-work.md`.
- **Review pass 1 patches:** triage rows 1–9.
  - Created rows are marked saved whatever happens after the steps, so there's no duplicate POST on Retry.
  - Edit rows take the single-Primary flag.
  - On saved rows the zip and length rules run only for changed fields (and zip also on a country change).
  - The 255 rule measures the trimmed value, and the duplicate key normalizes whitespace and US names.
  - Tests added: refetch-after-success fails; a later-step field error.
  - The zip copy has its provenance comment, and the JSDoc is fixed.
  - Rows 10–12 are in `deferred-work.md` (Team A).
- **Commits:** the story first, then the foundation test fix (`features/shell/use-myself.test.tsx`), which needs the story's `countries` loader.
- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 5902/5902 passed (211 files), coverage thresholds met.
  - `pnpm build`, then `CI=1 pnpm test:e2e` (desktop and 360 px): 941 passed, 11 skipped (by design), none flaky.

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | E, VG | A POST succeeds, then a later step fails with a session end or the refetch fails: `rebase` never runs, the created row stays `isNew`, and Retry POSTs it again (duplicate address) | high | Real: `runSaveSteps` skips refetch and rebase on a session failure and swallows refetch errors (`run-save-steps.ts:110-115`), and the Section keeps `created` only locally → **patch**: whatever happens after the steps, mark the created rows saved in the form (id, `isNew: false`), with a test. |
| 2 | B, E | The edit rows take `primary` from the raw address, so with two `primary: true` rows the one shown as plain becomes checked, and any edit sends `primary: true` (silently promotes it) | low | Real, and the fix corrects a value directly (pass the row's single-Primary flag) → **patch**, with a test. |
| 3 | E | A legacy saved row with a ZIP+4 (or a field over 255 characters) blocks an unrelated edit, e.g. a type change, with "Enter a 5-digit ZIP code" | medium | Real: `addressesSchemaWith` checks zip and length on every sent row; the backend has no zip rule → **patch**: on a saved row, run the zip and length rules only when that field changed, with a test. |
| 4 | B | The 255 check measures the untrimmed value, but the body sends it trimmed | low | Real, direct → **patch**: measure `.trim()`. |
| 5 | B | The duplicate key doesn't normalize US country synonyms or inner whitespace | low | Real, direct → **patch**: collapse inner whitespace, and treat any US name (`isUnitedStatesName`) as one country, with a test. |
| 6 | VG | Untested: a save succeeds but the list refetch after it fails | medium | Real gap; a regression would re-POST on Retry → **patch**: a test (success toast, read view, a later Save sends nothing). |
| 7 | VG | Untested: a mapped field error on a step after the first lands on the right row | low | Real gap → **patch**: a two-step test (PUT ok, POST "Location zip is not provided." → that new row's Zip). |
| 8 | B | `zipFiveDigits` has no provenance comment | low | Real → **patch**: `// verbatim: …`, or DRAFT with its source. |
| 9 | B | The Section JSDoc names `failedRowErrorFields`, which doesn't exist | low | Real → **patch**: name `createFailedRowTarget`. |
| 10 | B, E | Editing an address removed elsewhere: the PUT fails with "Location with id … is not related to …", unmapped, and Retry repeats it | medium | Needs a concurrent delete from another client; the fix adds a rule, copy and a merge branch → **defer** (Team A). |
| 11 | B | No `transformDraft`: a restored draft re-sends values that changed on the server since, and misses rows added elsewhere | medium | Real, but needs a server change while a draft waits. `useSectionForm` supports `transformDraft` since main 6c31204 → **defer** (Team A), to rebase draft rows like `mergeUnsent`. |
| 12 | VG | Untested: new-row key collision after a restored draft | low | Needs a draft-restore harness → **defer** (Team A, with row 11). |
| 13 | B | Two checked "Set as primary" boxes before Story 4.4 | low | Exclusivity is Story 4.4's AC, and Epic 4 ships as one PR (decision 1a) → rejected. |
| 14 | B | The empty-state header Edit acts as Add address | low | The same pattern as Phone, Email and Social → rejected. |
| 15 | B | The e2e skips the Primary-rule, Unlisted and countries-Retry rows | low | The unit tests cover each matrix row → rejected. |
| 16 | B | The client and proxy limits and type lists are defined twice | low | Developer drift only, and both are pinned by tests; a shared contract would be a foundation addition → rejected. |
| 17 | E | A repeated id's twin trips the duplicate check | low | Needs a repeated id in the list → rejected. |
| 18 | E | Header Edit with no expandable rows has no focus target | low | Needs every row to be id-less → rejected. |
| 19 | B, VG | The spec's stale "Risk" note, the frozen-block edits, the Node path | — | Fixes edit this build's spec → rejected (the stale note is corrected in the final notes). |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin` (the default `node` is 26); no git commits, no push; `corepack pnpm` if `pnpm` isn't on `PATH`; never `pnpm dev` here; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
