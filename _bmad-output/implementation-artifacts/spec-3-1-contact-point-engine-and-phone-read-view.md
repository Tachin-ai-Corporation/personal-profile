---
title: 'Story 3.1: Contact Point engine and Phone read view'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '25f693e5ff73408d582f93e1ef763eda8c808550'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Phone Section on `/` is still the F6-1 placeholder. There is no shared Contact Point engine either: no save DTO builder, no "new unverified" finder and no label list. So users can't see how 1health reaches them, and Stories 3.2–3.7 have nothing to build on (Story 3.1, FR15, NG-9023; acceptance source: `epics.md` "### Story 3.1: Contact Point engine and Phone read view").

**Approach:** Build three things on the foundation as it is:
- the engine as pure functions in the pre-created `lib/api/contacts.ts`;
- the label list in the planned `lib/shared/contact-labels.ts`;
- the Phone read view in the `features/contacts` `PhoneSection` stub, on `StateFrame`, `SectionTable`, `Chip`, `StatusBadge` and `EmptyState`, reading the shared per-type keys `contactPoints("Mobile")` + `("Landline")`.

## Boundaries & Constraints

**Always:**
- **Engine** (`lib/api/contacts.ts`, area-prefixed names, T6):
  - **Row type:** `ContactPointEditRow` = `ContactPoint` plus an optional `removed: true`.
  - **`contactPointsDiffToManageDTO(before, after)` → `ContactPointManageDTO | null`:**
    - Rows without an `id` → `contactPointsToAdd` as `{ value, type, label, isNotificationEnabled }`, plus `phoneNumberRegion` for `Mobile`/`Landline` only.
    - Ids in `before` that are absent from `after`, or marked `removed`, → `contactPointsToRemove` (numbers).
    - Saved rows whose `label` or `isNotificationEnabled` changed → `contactPointsToUpdate` as `{ id, type, label, isNotificationEnabled }`. The backend requires `type` and `label` on an update and ignores `value`.
    - Unchanged rows are never sent. An empty diff returns `null`.
    - A saved row whose `value` or `type` changed throws a programmer error (Story 3.7 adds Social's replace mode).
  - **Primary switch:** when `after` makes a different saved row Primary, `contactPointsToUpdate` holds the new Primary (`label: "Primary"`, `isNotificationEnabled: true`) and the old Primary relabelled `"Old"` (its other fields unchanged), in one DTO (AD-9).
  - **Primary invariants:** the result never holds two Primary rows of one type, and never a Primary in `contactPointsToAdd`. Either case throws a programmer error. Unit-tested.
  - **`newUnverifiedContactPoints(before, after)` → `number[]`:** ids in `after` but not in `before`, with `isVerified === false`, type `Mobile` or `Email`, and a label other than `Home`. Landline and Social Media rows are never returned.
  - **Stub doc:** the `lib/api/contacts.ts` doc is corrected. All writes go through one `POST v2/health/contact-point` (Story 3.2) and `POST v2/health/contact-point/verify` (3.3); there are no separate create/update/delete calls.
- **Labels** (`lib/shared/contact-labels.ts`, the only definition; imports nothing from the app):
  - `CONTACT_LABELS` = `Primary, Home, Main, Old, Personal, Mailing List, Work`, in that order.
  - `contactLabelsFrom(names?: readonly string[])` returns those labels that `names` contains, in `CONTACT_LABELS` order. "Partnership Organization" is always dropped, and so is any name outside `CONTACT_LABELS` (e.g. "Main Work"). `undefined` or an empty intersection gives all of `CONTACT_LABELS`.
  - The caller passes `valueListOptions(info, "label")` names from `useSWR(keys.typeKey("ContactPoint"))`. Story 3.2's picker is the first caller.
- **Phone read view** (`features/contacts/phone-section.tsx`, `PhoneSection` export kept):
  - **Frame:** `SectionLandmark id="phone"` from the first render, never remounted, with `SectionHeader` showing the saved count, reported through `useReportSectionCount("phone", n)`. Inside it, `StateFrame` with `skeleton="table"`, `columns={SECTION_COLUMNS.phone}` (its 3 rows), `loadError {kind:"section", sectionId:"phone"}`, `level="section"`, `attempt` (bumped per new error) and `onReady={useSectionFrame("phone").onReady}`.
  - **Data:** both keys are read and merged. Rows without a `value` are dropped. The Primary phone comes first (`findPrimary`), and the rest keep the API order: Mobile rows, then Landline rows.
  - **States:**
    - Either read failing (network, 5xx, unknown) shows "Couldn't load phones" with Retry, which revalidates only the two Phone keys. A 403 shows the Section `NoAccess` (`mapFetchError("phone", …)`).
    - A session failure is left to the shell.
    - Cached data wins over a failed background revalidation (2.1 rule).
  - **Table** (`SectionTable`, real `<table>`), columns Number · Label · Type · Status · Notifications:
    - **Number:** `regionFlag(region)` (`aria-hidden`), then `formatPhoneDisplay(value, phoneNumberRegion)` in `cell-number`.
    - **Label:** `Chip` (`variant="primary"` for Primary).
    - **Type:** "Mobile" / "Landline".
    - **Status:** `StatusBadge` "Verified" / "Not verified"; empty for Home-labelled rows.
    - **Notifications:** "On" / "Off" (Off muted) on the Primary row only, "—" on every other row.
  - **Below 768 px:** stacked cards. Line 1 is the number and status; line 2 is the label chip, type and notifications (muted). There is no horizontal scroll at 360 px.
  - **Empty:** `EmptyState variant="row"` reading "No phones yet".
- **Copy:** new keys in `CONTACT_MESSAGES` (`lib/shared/messages/contacts.ts`); grep the catalog first. "Mobile", "Landline", "On", "Off" and "No phones yet" are DRAFT COPY unless verbatim in Voice and Tone. Reuse `COMMON_MESSAGES.verified` / `notVerified` and the `SHELL_MESSAGES` column labels.
- **Proxy:** the `GET v2/type/key/ContactPoint` and `contact-point/list` entries already exist (F1/F6-3). Add a proxy-test row only where one is missing; no new entry.

**Decisions (agent, 2026-10-16; no human input needed):**
- **No kebab and no "Add phone" in 3.1.** There are no row actions yet, and `RowActions` renders nothing without one, matching the AC's "the menu never shows an item with no handler". A link that does nothing fails users and assistive tech (the 2.1 Edit-button rule). Story 3.2 adds the first action (Edit/Remove), the kebab and the empty-state "Add phone".
- **Label order:** the AC's list (Primary, Home, Main, Old, Personal, Mailing List, Work). The backend enum order differs (`Primary, Work, Home, Personal, Old, Main, Mailing List, …`); the AC's list is the explicit one.
- **Names:** `contactPointsDiffToManageDTO` / `newUnverifiedContactPoints` instead of the AC's `diffToManageDTO` / `newUnverified` (T6 area prefix).
- **Value-less rows** are not shown or counted, because nothing can be done with them.
- **Foundation exception (human, 2026-10-16):** `e2e/shell.spec.ts` (foundation-owned, T1/T2) is edited in this story, as Story 7.1 was for the same file. Its header test asserted that nothing is fetched below 768 px and that `main` has no alert. The real Phone Section legitimately reads Mobile and Landline and shows "Couldn't load phones" for the mocked 502. The test is rewritten to check only the profile header (`div:has(> h1)`): no Email request below 768 px, no header alert, and the header's own contact texts. So it holds on `main` and through Story 3.5.
- **Spec size:** about 1,900 tokens, kept whole because it is one goal (self-approved per the user's instruction).

**Never:**
- Don't edit `features/shell/**`, `lib/api/{index,contact-points,keys,type-keys}.ts`, `components/ui/*` (existing), `allowlist/index.ts`, foundation message files, `test/**` (except `test/page-handlers/profile.ts`), `e2e/fixtures/{core,index}.ts` or `app/page.tsx`.
- No POST entry in this story; no combined Phone SWR key.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | after has `{ value:"+14155550101", type:"Mobile", label:"Work", region:"us" }` without id | `contactPointsToAdd: [{ value, type, label, isNotificationEnabled, phoneNumberRegion:"us" }]` | N/A |
| Relabel / notify | saved id 5 label Home → Work; id 6 notifications false → true | `contactPointsToUpdate: [{ id:5, type, label:"Work", … }, { id:6, … isNotificationEnabled:true }]` | N/A |
| Remove | id 7 absent or `removed` | `contactPointsToRemove: [7]` | N/A |
| Primary switch | Primary 1 → id 2 Primary | update `{id:2, label:"Primary", isNotificationEnabled:true}` + `{id:1, label:"Old"}` | N/A |
| Empty diff | before = after | `null` | N/A |
| Immutable | saved id 5 value or type changed | — | throws |
| Two Primary / Primary add | after has two Mobile Primaries, or a new row labelled Primary | — | throws |
| newUnverified | new Mobile unverified Work; new Home; new Landline; new Social; new verified; pre-existing unverified | only the first id | N/A |
| Labels | type key names incl. "Main Work", "Partnership Organization", unsorted | the subset in `CONTACT_LABELS` order, both dropped | type key fails → all of `CONTACT_LABELS` |
| Read | Mobile [Work 11, Primary 12 (notifications on)], Landline [Home 21] | rows 12 (On), 11 (—), 21 (—, no status); count 3 | N/A |
| Format | US `+14155512125`; GB `+442071838750` region gb | `+1 (415) 551-2125`; international form | N/A |
| Empty | both lists `[]` | "No phones yet" row; count 0 | N/A |
| Error | Landline 500 | "Couldn't load phones" + Retry (both keys only); Email and Social still load | 403 → NoAccess; session → shell |
| 360 px | any rows | stacked cards, no horizontal scroll | N/A |

</frozen-after-approval>

## Code Map

- `lib/api/contacts.ts` -- the empty stub to fill (doc to correct); tests in `lib/api/contacts.test.ts` (100 % coverage gate).
- `lib/api/contact-points.ts` -- `ContactPoint` (all fields nullable, `id: number | null`), `findPrimary`, `PRIMARY_LABEL`, `isContactPointType`; read-only here (Team B's contract freezes it).
- `lib/api/keys.ts` -- `keys.contactPoints(type)`, `keys.typeKey("ContactPoint")`, `CONTACT_POINT_TYPES`.
- `lib/api/type-keys.ts#valueListOptions(info, attrKey)` -- locale-sorted names; `contactLabelsFrom` puts them back in `CONTACT_LABELS` order.
- Backend: `ManageContactPointDTO { contactPointsToAdd, contactPointsToUpdate, contactPointsToRemove }`; update needs `id`, `type`, `label`, and `value` is nulled for updates (`ContactPointServiceImpl.java:197-219`); label enum `ContactPointConstants.ContactPointLabel`.
- `features/contacts/phone-section.tsx` (stub), `features/contacts/index.ts` (unchanged).
- `features/personal/personal-section.tsx` -- the pattern for the `StateFrame` attempt/claim/stale-data rules (`useMyself` there, `useSWR` per key here).
- `features/shell` -- `StateFrame`, `SectionLandmark`, `SectionHeader`, `SectionTable`, `useReportSectionCount`, `useSectionFrame`, `SECTION_COLUMNS.phone` (5 columns), `sectionHeadingId`.
- `components/ui/{chip,status-badge,empty-state}.tsx`; `lib/shared/phone.ts` (`formatPhoneDisplay`, `regionFlag`, `normalizeRegion`).
- `lib/shared/messages/{contacts,common,shell}.ts` -- copy.
- `lib/server/proxy/allowlist/contacts.ts` (+ test) -- existing list and type-key entries.
- Tests: `test/myself-fixture.ts#contactPointWire`, `test/page-handlers/profile.ts` (contact points already in the shell defaults), `renderInPage(…, { page: "profile" })`; e2e `mockContacts`, `mockTypeKey`, `mockProfileDefaults`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/contacts.ts` (+ `contacts.test.ts`) -- the engine and its types -- every matrix engine row.
- [x] `lib/shared/contact-labels.ts` (+ test) -- `CONTACT_LABELS`, `contactLabelsFrom` -- the label rows.
- [x] `lib/shared/messages/contacts.ts` -- the new keys.
- [x] `features/contacts/phone-section.tsx` (+ `phone-section.test.tsx`) -- the read view, every read matrix row, axe light/dark.
- [x] `lib/server/proxy/allowlist/contacts.test.ts` -- a type-key test row, only if missing.
- [x] `e2e/profile-phone.spec.ts` (+ `e2e/fixtures/contacts.ts` helpers) -- order, formatting, statuses, empty, error + Retry, 360 px, axe light/dark.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- the `3-1` line and `epic-3`.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api`, `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths, the new `lib/shared/contact-labels.ts` (+ test) and the approved `e2e/shell.spec.ts` exception changed.

## Implementation Notes

- **Landmark:** `SectionLandmark` takes no `count`, so the Section renders its own `<section id="phone" aria-labelledby="phone-heading">` with `SectionHeader count` (the Personal information pattern); same landmark, same `h2`, never remounted.
- **`cell-number`:** no such utility exists (adding one is a foundation token change, epic-3-context "UX"). The number uses `cell-strong` inside the table's `tabular-nums`.
- **Engine semantics:** the old Primary is relabelled "Old" only when `after` leaves it labelled Primary; a label `after` gives it wins. The two-Primary guard runs on the DTO, so two rows newly made Primary of one type throw. An `after` id missing from `before`, and a sent row with no value/type/label, are programmer errors too. Empty lists are left out of the DTO (all three are optional in `ManageContactPointDTO`). `CONTACT_OLD_PRIMARY_LABEL` is exported.
- **Errors:** with both reads failing, a session end wins, then a 403, then the first other error. "Notifications" "—" and "Off" are muted.
- **Proxy:** no row added: the `GET v2/type/key/ContactPoint` entry is already covered by `allowlist/type-keys.test.ts` (and listed in `contacts.test.ts`).
- **Foundation test edit (human-approved exception, see Decisions):** `e2e/shell.spec.ts` "header: primary phone and email…" asserted that nothing fetches contact points below 768 px and that `main` holds no alert. The Phone Section now reads Mobile and Landline and shows its own load error. The test was rewritten to check only the profile header (`div:has(> h1)`, asserted to match exactly one element): no Email request below 768 px, the header's own email and phone texts, and no alert in the header; `seen` is compared as a set.
- `e2e/fixtures/contacts.ts` gained `contactPointRow` and `CONTACT_PHONES` (read data for `mockContacts`).

- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 4344/4344 passed (178 files), coverage 100% on `lib/server`, `lib/api`, `lib/shared`.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 574 passed, 8 skipped (by design), none flaky.

## Spec Change Log

- **2026-10-16, implementation deviation (no human renegotiation needed):** the frozen Boundaries name a `cell-number` type for the Number cell, but no such utility exists, and adding one is a foundation token change. The number uses `cell-strong` with `tabular-nums`. **Known-bad state avoided:** a story-PR edit to `app/globals.css`. **KEEP:** the decorative flag before the formatted number.

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG, no gaps found).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | E, B | A legacy Landline Primary next to the Mobile Primary renders as a second Primary (chip + On/Off) | low | Real: `isPrimary` tested each row's label → **patch**: only the `findPrimary` row is Primary in the UI. |
| 2 | E, B | Duplicate ids in `before` or `after` are accepted silently, so the result depends on order | low | Real; the engine already throws for other caller bugs → **patch**: a programmer error. |
| 3 | B | Removing or relabelling the only Mobile/Email Primary without a replacement is sent, though the backend rejects it | medium | Real (`anyPrimaryCpToDowngradeAndReplace`, `deleteContactPointsAndVerifyIfDeletedPrimary`) → **patch**: a programmer error. |
| 4 | E, B | The add row sends `phoneNumberRegion` as given (the wire uses "US") | low | Real; direct → **patch**: `normalizeRegion`. |
| 5 | E | A whitespace-only value, type or label passes | low | Real → **patch**. |
| 6 | E | `newUnverifiedContactPoints` ignores a `type: null` row, which the Mobile list counts as Mobile | low | Real (`isMobileRow`) → **patch**. |
| 7 | E | Duplicate React keys when a list repeats an id | low | Real; direct → **patch**. |
| 8 | E | An unsupported region shows bogus regional-indicator glyphs | low | Real → **patch**: a flag only for a supported region. |
| 9 | B | The bare "—" has no accessible meaning | low | Real → **patch**: `aria-hidden` dash + visually hidden "Not applicable". |
| 10 | B | "Home", "Old" and the phone types are re-declared outside contact-labels | low | Real drift risk against "the only definition" → **patch**. |
| 11 | E, B | The header locator is unchecked, and the exact-array `seen` compare can flake | low | Real → **patch**: count 1, set compare. |
| 12 | B | The matrix "Email and Social still load" is untested | low | Real gap → **patch**: e2e. |
| 13 | B | Retry is clicked with a raw `.click()` outside act | low | Real flake risk → **patch**. |
| 14 | B | The spec contradicted itself on the shell exception; `cell-number` vs `cell-strong` was unlogged; the sprint-status note said "needs a T2 exception" | low | Real → fixed in the docs (Implementation Notes, Spec Change Log, sprint-status). |
| 15 | B | `epic-3-context.md` was stale (names, label order, state) | low | Real → fixed in the docs. |
| 16 | B, E | The old Primary keeps `isNotificationEnabled: true` after the switch, hidden as "—" | low | The AC says the old Primary is relabelled "Old" with its other fields unchanged; notifications matter only on the Primary (RC3) → rejected. |
| 17 | E, B | Landline rows show a permanent "Not verified" | low | The AC exempts only Home rows from Status; flagged for PM → rejected. |
| 18 | E | A Landline can be made Primary next to a Mobile Primary | low | Make primary is Story 3.4 and offered for Mobile only → rejected. |
| 19 | B | Labels are compared case-sensitively, while the backend uses `equalsIgnoreCase` | low | No lower-case label in the data seen; normalizing needs the frozen `findPrimary` (`contact-points.ts`) → rejected. |
| 20 | B | Switching to an unverified Email Primary is rejected by the backend | low | Story 3.4/3.6 own Make primary and offer it only for verified rows → rejected. |
| 21 | E | The header test no longer catches the header fetching Mobile/Landline below 768 px | low | The human-approved header-scoped rewrite; the keys are shared with the Phone Section, so header-only requests can't be told apart → rejected. |
| 22 | B | `contactPointRow` duplicates the foundation `contactPointWire` | low | e2e fixtures and unit fixtures are separate trees; no drift harm named → rejected. |
| 23 | B | The Verification section holds a local Node path | false | This machine's Node 24 for the build agent (as in Epic 2). |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; `corepack pnpm` if `pnpm` isn't on `PATH`; no git commits, no push; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
