---
title: 'Story 4.1: View addresses'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: '21943e9464ae8286c5024f5049a8221d22da6ada'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Addresses Section on the Contacts tab is still the F6-1 placeholder, so users can't see the addresses on their profile, which one is Primary, or which are verified (Story 4.1, FR25, NG-9026; acceptance source: `epics.md` "### Story 4.1: View addresses").

**Approach:** Build the read view in `features/addresses` on the shell's `StateFrame`, `SectionTable`, `Chip` and `StatusBadge`. It reads the new `GET v2/person/location/list?page=0&size=100` allowlist entry through a loader registered in `lib/api/addresses.ts` under `keys.addresses()`. The patterns follow the Epic 3 Email read view (`features/contacts/email-section.tsx`), copied, not imported: lint forbids importing another feature.

## Boundaries & Constraints

**Always:**
- **Allowlist** (`lib/server/proxy/allowlist/addresses.ts`, + tests): exactly `GET v2/person/location/list` with only `page` and `size` (digits). Any other or repeated param → 400.
- **Loader** (`lib/api/addresses.ts`, 100 % coverage): `fetchAddresses()` + `registerFetcher("addresses", …)` maps each row to a client `Address`:
  - fields: `id`, `type` (personLocationType), `addressLine1`, `addressLine2`, `cityName`, `county`, `stateName`, `postalCode`, `country`, `countryCode`, `primary`, `validated`;
  - it reads `primary ?? isPrimary` and `validated ?? isValidated`, because the code and the docs disagree;
  - it accepts a Spring Page (`content`) or a bare array, drops rows with `active === false`, and treats `"n/a"`, blank and `null` as absent.
- **Order:** the row with `primary: true` comes first (the first one, if the data holds two). The rest keep API order, which is newest-updated first.
- **One-line address** (`features/addresses/format.ts`, unit-tested): `line 1, line 2, city, state zip`, skipping absent parts. The country is omitted when it is the US (`countryCode` "US", or a name "United States" / "United States of America", case-insensitive) and appended otherwise. Example: "12 King St W, Toronto, ON M5H 1A1, Canada".
- **Section:**
  - `SectionLandmark id="addresses"` on the first render. `h2` "Addresses", `SectionHeader count`, `useReportSectionCount("addresses", n)`.
  - `StateFrame` with `skeleton="table"`, `columns={SECTION_COLUMNS.addresses}`, `loadError {kind:"section", sectionId:"addresses"}` ("Couldn't load addresses" + Retry), `level="section"`, `attempt` and `onReady`.
  - Retry revalidates only `keys.addresses()`. A 403 shows the Section `NoAccess`, and a session end is left to the shell.
- **Columns:** Address (`cell-strong`, wraps) · Label (filled Primary chip on the Primary row only) · Type (the backend's type as received) · Status (`StatusBadge status="verified"` "Verified" when `validated`, else empty).
- **Below 768 px:** each address is a stacked card. Line 1 is the address; line 2 is the Primary chip, type and Verified (muted). There is no horizontal scroll at 360 px.
- **Empty:** one row reads "No addresses yet" (DRAFT), with no action.
- **No actions in 4.1:** no "Add address" header button, no empty-row action and no row kebab or actions column. Story 4.2 adds them (decision below).
- **Defaults:** `e2e/fixtures/addresses.ts` (`mockAddresses`) answers an empty Spring Page `{content:[], totalElements:0, …}` and wraps any rows it gets. The unit-test default in `test/page-handlers/profile.ts` stays a bare `[]` (human decision below). The Section and loader tests send the Page shape themselves.
- **Copy:** `lib/shared/messages/addresses.ts`. Grep the catalog first. "Addresses", the column headers and the load noun already exist.
- 44 px rows, axe in light and dark, `reduced-motion` skeleton.

**Decisions (human, 2026-10-19):**
- **1a, no actions until Story 4.2:** 4.1 ships without "Add address" (header and empty row) and without the row kebab, because they do nothing until 4.2 and 4.4. Epic 4 goes to `main` as one PR, so users never see the gap.
- **2a, the AC's four types in Story 4.2's Select:** Home, Main Work, Other Work, Vacation Home. A saved Billing, Mailing or Temporary address keeps its type, which shows as an unlisted value and is never sent unless changed. 4.1 shows any type as received.

- **Approved after implementation (2026-10-19):** two one-line foundation test edits ship as their own test-only commit for both teams' review: `lib/api/support.test.ts` drops the "No fetcher for addresses" line, and `test/providers.test.tsx` expects the Page-shaped address default. A one-line `mockAddresses(page)` in Team B's `e2e/account-primary-contacts.spec.ts` (the helper test ends on `/?tab=contacts`) ships as its own test-only commit for Team B review.

- **Superseded by the user (2026-10-19, after the move onto `main`):** the `test/providers.test.tsx` edit is dropped. The profile unit-test default for the address list stays `[]`, the loader accepts both shapes, and the Section and loader tests pass the real Page shape themselves. Only `lib/api/support.test.ts` changes among the foundation files.

**Decisions (agent, 2026-10-19):**
- The type shown is the backend's literal, so a Billing, Mailing or Temporary address reads as such. The four-value list matters only for the Story 4.2 Select (decision 2a).
- The backend's newest-first order means editing an address (4.2) moves it up. The AC says "platform order", so this is accepted.

**Never:** edit `features/shell/**`, `components/ui/*` (existing), `lib/api/{index,keys}.ts`, `allowlist/index.ts`, `test/**` (except `test/page-handlers/profile.ts`), `e2e/fixtures/{core,index}.ts` or any other feature folder. Never import from `features/contacts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Read | Page `[{id:2,Main Work,"1 Pine St",SF,CA,94105,US,primary:false,validated:true},{id:1,Home,primary:true,validated:false,…}]` | rows 1 (Primary chip, Home, no status), 2 (Main Work, Verified); count 2 | N/A |
| Non-US | `{"12 King St W", Toronto, ON, "M5H 1A1", Canada, CA}` | "12 King St W, Toronto, ON M5H 1A1, Canada" | N/A |
| Sparse | line 2 "n/a", state blank, US | "1 Pine St, SF 94105" | N/A |
| Legacy names | `isPrimary:true, isValidated:true`, bare array | Primary first, Verified | N/A |
| Inactive | `active:false` row | not shown, not counted | N/A |
| Empty | `{content:[]}` | "No addresses yet" (no action); count 0; no Add address and no kebab anywhere | N/A |
| Error | 500 / 403 | "Couldn't load addresses" + Retry (Addresses key only) / Section `NoAccess` | Phone, Email, Social unaffected |
| Proxy | `?page=0&size=100&sort=x` | 400 | N/A |

</frozen-after-approval>

## Code Map

- `features/addresses/addresses-section.tsx` -- the stub to replace (keep the `AddressesSection` export and `index.ts`).
- `features/contacts/email-section.tsx` -- the read-view template: the attempt counter (`seen`/`attempt`), `StateFrame` props, `SectionHeader count`, `SectionTable` columns with `mobileLine`, `Chip variant="primary"`, `StatusBadge`, the Primary hoist (`emailRowsOf`). Copy the patterns; don't import.
- `lib/api/addresses.ts` -- the stub (`ADDRESS_LIST_PAGE_SIZE`, `addressesListPath`): add the `Address` type, `fetchAddresses`, `registerFetcher("addresses", …)`. See `lib/api/contact-points.ts` for a loader plus `registerFetcher`.
- `lib/server/proxy/allowlist/addresses.ts` -- empty `entries`. The query-rule shape is in `allowlist/contacts.ts` (`query: { type: { pattern, repeatable } }`) and `allowlist/types.ts`.
- `lib/shared/messages/addresses.ts` -- empty `ADDRESS_MESSAGES`. `SHELL_MESSAGES.sectionAddresses`, `columnAddress`/`Label`/`Type`/`Status` and `STATE_MESSAGES.loadNounAddresses` already exist.
- `features/shell/anchors.ts:53` -- `SECTION_COLUMNS.addresses` (read only).
- `test/page-handlers/profile.ts:16`, `e2e/fixtures/addresses.ts` -- the defaults to move to the Page shape.
- Tests to copy: `features/contacts/email-section.test.tsx` (read view, 403, error/Retry isolation, 360 px cards, axe), `lib/api/contact-points.test.ts` (loader), `lib/server/proxy/allowlist/contacts.test.ts` (query rules); e2e `e2e/profile-email.spec.ts` (read describe).

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/addresses.ts` (+ test) -- the list entry.
- [x] `lib/api/addresses.ts` (+ `addresses.test.ts`) -- `Address`, `fetchAddresses`, the fetcher registration.
- [x] `features/addresses/format.ts` (+ test) -- the one-line formatter.
- [x] `lib/shared/messages/addresses.ts` -- the new keys.
- [x] `features/addresses/addresses-section.tsx` (+ `addresses-section.test.tsx`) -- every I/O row except Proxy; axe light and dark.
- [x] `test/page-handlers/profile.ts`, `e2e/fixtures/addresses.ts` -- the Page-shaped defaults.
- [x] `e2e/profile-addresses.spec.ts` -- read, Primary first, non-US, empty, error and Retry isolation, 360 px, axe.
- [x] `sprint-status.yaml` -- the `4-1` line only.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100 % coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed.

## Implementation Notes

- **Landmark:** the Section renders its own `<section id="addresses" aria-labelledby="addresses-heading">` with `SectionHeader count`, as Phone, Email and Social do, because `SectionLandmark` takes no `count`.
- **Type:** the client `type` comes only from `personLocationType`. The wire `type` field is ignored, because it may be a generic location kind. Confirm on demo (open decision 1).
- **One-line address:** without a state, the zip follows the city with a space ("SF 94105"). Without a country name, the country code is shown. An address with no parts reads "Not provided".
- **Allowlist:** `page` is 0–9999 and `size` 1–100, both without leading zeros (`size=0` makes the backend throw).
- **Unit error isolation:** the test can't import `features/contacts`, so it renders probe readers of `keys.contactPoints(Mobile|Email|Social Media)` beside the Section. The e2e spec checks the real Phone, Email and Social Sections.
- **Outside Team A paths (needed for green; each is its own foundation or cross-team commit, like 77c2e09 and 21943e9):**
  - `lib/api/support.test.ts`: dropped the `swrFetcher(keys.addresses())` → "No fetcher for addresses" line, because `addresses` now has a loader. The `npi` line still covers the no-loader branch.
  - `test/providers.test.tsx`: the profile-defaults row now expects the Page shape (`objectContaining({ content: [] })`).
  - `e2e/account-primary-contacts.spec.ts` (Team B): the helper test ends on `/?tab=contacts`, which now reads the address list, so it adds `mockAddresses(page)`.
- **Review pass 1 patches:** triage rows 1–4.
  - The allowlist's `size` is limited to 1–100 and `page` takes no leading zero.
  - "USA", "U.S." and "U.S.A." (and the code "USA") count as the US, and a code fallback is upper-cased.
  - The row-key comment is corrected, and the e2e layout asserts give clear failures.
  - Rows 5 (Team A) and 6 (Foundation) are in `deferred-work.md`.
- **US rule, after the move onto `main` (user check, 2026-10-19):**
  - Names and codes are compared with dots and all whitespace removed, case-insensitively, so "usa", "U.S.A", "U. S. A." and "United  States" count as the US.
  - The name decides when there is one, and the code only without a name. So a non-US name always shows, even beside a "US" code; before this, a "US" code hid "Canada".
  - Tests are in `features/addresses/format.test.ts`.
- **Commits:** the foundation test edit (`lib/api/support.test.ts`), the Team B mock line (`e2e/account-primary-contacts.spec.ts`), then the story. Each passes on its own: an unused route mock and a removed assertion change nothing before the story.
- **Unit default:** `test/page-handlers/profile.ts` and `test/providers.test.tsx` are back to `main` (user decision). An added Section test reads an empty Spring Page, and the page-default test now covers the bare list. Unit tests: 5704/5704 passed.
- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 5636/5636 passed (205 files), coverage thresholds met.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 892 passed, 10 skipped (by design), none flaky.

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG; no gaps).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B, E | The allowlist lets any caller ask for `size` 0–9999 (0 makes Spring's `PageRequest` throw, so upstream answers 500) and accepts leading zeros | medium | Real: `DIGITS = /^\d{1,4}$/` serves both params, and the app only ever sends `page=0&size=100` → **patch**: `size` 1–100 with no leading zero, `page` with no leading zero, plus tests. |
| 2 | B, E | `isUnitedStates` misses "USA", "U.S.", "U.S.A."; a lower-case code fallback shows as typed ("au") | low | Real, and the fix corrects a lookup directly → **patch**: normalize dots and case, add the forms, upper-case the code fallback, plus tests. |
| 3 | B | The row-key comment says "stable across revalidations", but id-less rows are keyed by position | low | Real → **patch**: correct the comment. |
| 4 | B | The e2e 360 px layout checks fail with "expected false to be true" | low | Real → **patch**: assert the boxes exist, then compare the numbers. |
| 5 | B | The type is read only from `personLocationType`, and the field names aren't confirmed live | medium | `maybe-false`: needs a live demo response → **defer** (Team A): confirm on demo before Story 4.2 writes these fields. |
| 6 | B | Mobile cards announce empty "Label:" and "Status:" prefixes for a plain row | low | Real, but the prefix comes from the shared `SectionTable` (it hits Email's Home rows too) → **defer** (Foundation). |
| 7 | B, E | More than 100 addresses are silently cut at the first page | low | Nobody has 100 addresses; the fix would add paging → rejected. |
| 8 | E | One malformed row turns the whole Section into a load error | low | The backend DTO is typed, so a bad row is unlikely, and per-row parsing adds branches → rejected. |
| 9 | E | A row with only a county (or only a US country) reads "Not provided" | low | The backend requires line 1, city and zip on create → rejected. |
| 10 | B | `test/providers.test.tsx` still probes `size=50` | low | The default handler ignores the query, and widening the approved foundation edit isn't worth it → rejected. |
| 11 | B | The Page shape is built in three places (unit `totalPages: 1` vs `0`) | low | Test-only; no assertion depends on it → rejected. |
| 12 | B | A second Primary row shows as a plain row with no log | low | The backend enforces one Primary → rejected. |
| 13 | B | The e2e 403 test checks less than the unit test | low | The unit test covers the counts and isolation → rejected. |
| 14 | B | `epic-4-context.md`'s "State" paragraph is already out of date | low | It's a planning snapshot, not a status record → rejected. |
| 15 | B | The spec names a session Node path | — | The fix edits this build's spec → rejected. |
| 16 | B | The spec's `SectionLandmark` wording vs the Section's own `<section id="addresses">` | false | Same landmark as Phone, Email and Social (F6-1: an `id` landmark from the first render); the AC is met. |
| 17 | B, E | "Only Team A paths changed" fails (two foundation tests, one Team B test) | low | Human-approved after implementation, shipping as separate commits; the fix edits the spec → rejected. |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin` (the default `node` is 26); no git commits, no push; `corepack pnpm` if `pnpm` isn't on `PATH`; never `pnpm dev` here; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
