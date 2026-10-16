---
title: 'Story 2.1: View Personal Information'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e9942d46f4d09ea43b1433291b5a966e2d9b40ba'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On `/` the Personal information Section is still the F6-1 placeholder. Users can't check their legal name, birth details, demographics, Masked SSN or Signature (Story 2.1, FR11, NG-9022; acceptance source: `epics.md` "### Story 2.1: View Personal Information").

**Approach:** Replace the `PersonalSection` stub body with a read-only Section built on the foundation as it is:
- `useMyself` (`["pp","myself"]`), `StateFrame`, `KeyValueTable`, `SignatureThumb`, `wireToDisplayDate`, `useClaimMyselfError` and `useSectionFrame("personal")`.
- The Person option lists come from the shared type-key loader, with a fallback held in the planned `lib/shared/person-options.ts`.

## Boundaries & Constraints

**Always:**
- **Landmark:** `SectionLandmark id="personal"`, titled "Personal information" (`SHELL_MESSAGES.sectionPersonal`), rendered from the first render and never remounted. The `StateFrame` is `skeleton="kv"`, `level="section"`, `loadError {kind:"section", sectionId:"personal"}`, with `attempt` and `onReady={useSectionFrame("personal").onReady}`. Its `anchors` keep a `#signature` target while it loads. Retry revalidates only `keys.myself()`. `useClaimMyselfError(Boolean(error))` applies while the Section shows its own error. No count is reported, so the index's count column stays blank.
- **Rows:** in exactly this order, with no group headings and no email or phone row: Name prefix · First name · Middle name · Last name · Name suffix · Other names · Titles · Birth date · City of birth · Race · Ethnicity · Biological gender · Gender identity · Sexual orientation · SSN · Signature.
  - Empty, null, `"n/a"` and `[]` values read "Not provided" (`KeyValueTable`/`isNotProvided`).
  - `birthDate` shows through `wireToDisplayDate` (`1987-03-09` → `03/09/1987`, no timezone shift).
  - The Signature row has `rowId: SIGNATURE_ANCHOR`.
- **SSN:** shown in `mono-value` only when it is a masked value: it contains a `*` and at most 4 digits. Any other value, including a full SSN by mistake, reads "Not provided". Never render more.
- **Signature:** `SignatureThumb({ fileId: myself.signature?.id, fallback: COMMON_MESSAGES.notProvided })`, with the alt "Your signature". A missing or broken image reads "Not provided". There is no "Added {date}" meta, because `myself.signature` is `{id, name}` with no date, and the AC omits the meta without one.
- **Option lists** go in `features/personal/use-person-options.ts`, area-prefixed as `usePersonOptions` (T6).
  - **Source:** `useSWR(keys.typeKey(PERSON_TYPE_KEY))` + `valueListOptions(info, attr)` for `race`, `ethnicity` and `biologicalGender`.
  - **Fallback:** on an error or an empty list, race and ethnicity use the addendum §C lists in the new `lib/shared/person-options.ts`, and biological gender uses "Asked but not answered" plus the user's current value. The fixed gender identity list (Asked but not answered, Female, Male, Other) also lives there.
  - It never blocks or errors the read view.
  - **Not here:** intersecting the lists with the `user/edit` enums is Story 2.2's decision (`deferred-work.md`).
- **Copy:** the missing labels go in `PERSON_MESSAGES` (`lib/shared/messages/person.ts`, new keys only), marked `// DRAFT COPY` unless they appear verbatim in Voice and Tone. Grep the catalog first (T5): `FIELD_MESSAGES` already has first, middle and last name and birth date; `COMMON_MESSAGES.notProvided`, `SHELL_MESSAGES.signature` and `signatureAlt` also exist.
- **Layout:** semantic tokens only. Four columns from 768 px and one Field | Value pair below, both from `KeyValueTable`. No horizontal scroll at 360 px. AA in light and dark.

**Decisions (agent, 2026-10-16; no human input needed):**
- **No Edit button in 2.1.** Story 2.2 adds the outline "Edit" together with its wiring (`useSectionForm` `editButtonProps`), because a visible button that does nothing fails users and assistive technology.
- **No array join.** The backend `OneHealthUserDTO` sends `race`, `ethnicity` and `biologicalGender` as `String`, and `myself.ts` (foundation) maps them to strings. A string is shown as is, and no `myself.ts` change is made.
- **Spec size:** about 2,200 tokens, above the 1600 guideline; kept whole because it is one goal (self-approved per the user's instruction, as for Story 1.14).
- **No new allowlist entry.** `GET v2/type/key/Person` (`allowlist/personal.ts`) and the `v2/file/{id}/download` `asImage` entry (`allowlist/files.ts`) already exist with tests.

**Never:**
- Don't edit `features/shell/**`, `lib/api/{myself,type-keys,files,index}.ts`, `components/ui/*` (existing), foundation message files, `test/**` (except `test/page-handlers/profile.ts`), `e2e/fixtures/{core,index}.ts`, `app/page.tsx` or any allowlist file.
- No GraphQL, no `GET v2/person/{id}`, and no blob conversion of the signature.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Loaded | full `myself` | 16 rows in order; birth date `03/09/1987`; SSN `***-**-1234` in mono; thumbnail with alt "Your signature" | N/A |
| Empty values | null, `""`, `"n/a"`, `"N/A"` | "Not provided" in `kv-value-empty` | N/A |
| Unmasked SSN | `socialSecurityNumber: "123-45-6789"` | SSN row reads "Not provided" | N/A |
| No signature | `signature: null` | "Not provided"; the row keeps `id="signature"` | N/A |
| Broken signature | image 404 | "Not provided", no broken image | N/A |
| Loading | `myself` pending | the foundation `kv` skeleton (4 rows, `KV_ROWS`; human decision 2026-10-16 over the AC's "three") in the real container; `#signature` present | N/A |
| Load error | `myself` 500 after its retries | "Couldn't load personal information" + Retry; Retry refetches only myself | the page banner hides (claim) |
| Options OK | type key with `race` values incl. `n/a`, unsorted | sorted, `n/a` dropped | N/A |
| Options fail | type key 500 | fallback race/ethnicity lists; biological gender = ["Asked but not answered", current]; the read view is unaffected | N/A |

</frozen-after-approval>

## Code Map

- `features/personal/personal-section.tsx` -- the stub to replace (keep the `PersonalSection` export; `index.ts` unchanged).
- `features/shell/__fixtures__/section-fixture-page.tsx:40-140` -- the pattern to copy: `useMyself` → `FrameState`, `useClaimMyselfError`, `StateFrame` with `attempt` and a Retry.
- `features/shell/placeholders.tsx` -- `SignaturePlaceholder` / anchors-while-loading pattern for the `#signature` row.
- `features/shell/{key-value-table,signature-thumb,state-frame,section-landmark,section-frame}.tsx`, `use-myself.ts` -- all from `@/features/shell`.
- `lib/api/myself.ts:21-62` -- `Myself` (strings, `signature {id,name}`); `lib/api/type-keys.ts` -- `valueListOptions`; `lib/api/personal.ts` -- `PERSON_TYPE_KEY`, `PERSON_VALUE_LISTS`.
- `lib/shared/dates.ts#wireToDisplayDate`, `lib/shared/display-value.ts#isNotProvided`; `mono-value` utility (`app/globals.css`).
- `lib/shared/messages/{person,fields,common,shell}.ts` -- copy (only `person.ts` is edited).
- `test/myself-fixture.ts` (`myselfWire()` frozen; override per test), `test/providers.tsx` `renderInPage(ui, { page: "profile" })`, `test/axe.ts`.
- `test/page-handlers/profile.ts`, `e2e/fixtures/defaults-profile.ts` -- the Person type-key default already exists; `e2e/fixtures/personal.ts` (Team A) is for the e2e helpers.
- Addendum §C lists: `_bmad-output/planning-artifacts/epics.md:1963`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/shared/person-options.ts` (+ `person-options.test.ts`) -- the fallback race and ethnicity lists, `biologicalGenderFallback(current)` and the gender identity list -- the planned FOUNDATION §3.3 module.
- [x] `lib/shared/messages/person.ts` -- the new label keys -- catalog copy.
- [x] `features/personal/use-person-options.ts` -- `usePersonOptions(currentBiologicalGender)` -- type-key lists with fallback.
- [x] `features/personal/personal-section.tsx` (+ `personal-section.test.tsx`) -- the read Section and every matrix row. Tests use `renderInPage(…, { page: "profile" })` and MSW, and include axe in light and dark -- the story body.
- [x] `e2e/profile-personal.spec.ts` (+ helpers in `e2e/fixtures/personal.ts` if needed) -- on `/` with `mockProfileDefaults`: rows in order, `#signature` deep link focuses or scrolls to the row, no horizontal scroll at 360 px, axe light/dark, the load error + Retry -- the real page.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- the `2-1-view-personal-information` line only.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then all of it is green, with 100% coverage kept on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline commit, when it is listed, then only Team A paths plus the new `lib/shared/person-options.ts` (+ test) changed.

## Implementation Notes

- **Skeleton rows:** the I/O matrix (and the AC) say three skeleton rows, but the mandated `skeleton="kv"` draws four (`KV_ROWS` in `features/shell/state-frame.tsx`, foundation, not editable here). The tests assert a `kv` skeleton in the real container, not a row count. Changing it is a foundation PR if the AC count matters.
- **`#signature` while loading or failed:** `StateFrame anchors` gets a Section-local `SignatureAnchor`: while loading, a labelled row with a pulse bar (static under reduced motion); on an error or no access, a bare `div#signature` with no label or role. Once ready, the real key cell (`th#signature`) replaces it, so the id is always unique.
- **Signature fallback weight:** `SignatureThumb` gets `className="font-normal"`, so its "Not provided" (missing or broken image) matches the muted 400 `kv-value-empty` look of every other empty value instead of the value cell's 500.
- **SSN mask rule:** `isMaskedSsn` accepts only `[*\d\s-]`, at least one `*` and at most four digits; anything else (a full SSN, nine digits, text around a mask) reads "Not provided".
- **Option lists:** `usePersonOptions(currentBiologicalGender)` returns `{ race, ethnicity, biologicalGender, genderIdentity, isLoading }`. Each list falls back on its own (loading, error or empty), so a partly filled type key still offers what it has. The Section calls it on mount only to load the lists for Story 2.2; nothing in the read view depends on it.
- **Attempt counter:** bumped when a new `myself` error object arrives (adjusted while rendering, not in an effect or on the Retry click), so a repeated failure is announced again only once it has arrived.
- **Stale data wins:** the frame is `ready` whenever `myself` is cached; a failed background revalidation keeps the table, and the Section claims the page banner only while it shows its own error (`Boolean(error) && !myself`), so the page banner reports a failed refresh.
- **`usePersonOptions` result** is memoized on the type-key data, its error state, `isLoading` and the current biological gender; on an error the fallbacks apply even over stale data. Attribute keys are typed from `PERSON_VALUE_LISTS`.
- **No `test/page-handlers/profile.ts` or `e2e/fixtures/{personal,defaults-profile}.ts` change:** both page defaults already answer the Person type key, and `ANN` has no signature, so the default `/` makes no file download.
- **Verification (Node 24.22):** `pnpm lint`, `pnpm typecheck`, `check-forbidden.sh` clean; `pnpm vitest run --coverage` 169 files / 3812 tests, 100 % on `lib/server`, `lib/api`, `lib/shared`; `pnpm build` OK; `CI=1 pnpm test:e2e` 444 passed, 5 skipped, 1 flaky (unrelated: `primitives.spec.ts` DisabledAction tooltip Escape, desktop, passed on retry).

- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 3814/3814 passed, coverage thresholds met.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 445 passed and 5 skipped (by design).
- **Deferred:** one Foundation item, exporting the `#signature` loading anchor. **Notes for later stories:** 2.2 decides whether a saved biological gender missing from the platform list stays selectable; 2.3 decides how the masked SSN reads to screen readers.

## Spec Change Log

- **2026-10-16, human renegotiation in the matrix audit:** the frozen "Loading" row said "three skeleton rows", following the AC. The foundation `StateFrame` `skeleton="kv"` draws 4 (`features/shell/state-frame.tsx:189`), and changing that is a shared edit. The human chose to accept 4, so the matrix row now names the foundation `kv` skeleton. **Known-bad state avoided:** a story editing `features/shell` (T2), or a test pinned to a count the foundation doesn't draw. **KEEP:** everything else in the read view.

## Review Triage Log

Pass 1. The layers were blind hunter (B) and edge-case hunter (E); the verification-gap layer (VG) found no gaps.

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | E | A failed background revalidation of `myself` (focus is on by default) replaces the loaded table with the load error and claims the page banner | medium | Real: `state` checks `error` before `myself` (`personal-section.tsx`) → **patch**: show `ready` while `myself` is cached, and claim only while the Section shows its own error (the page banner then reports the failed refresh). |
| 2 | E, B | `attempt` bumps on the Retry click, so the stale error is re-announced before the retry resolves; the re-announce test asserts right after the click | low | Real: LoadError's `attempt` is the failure count → **patch**: bump `attempt` on each new `myself` error object; the test asserts after the second failure. |
| 3 | B | The error state renders an empty labelled "Signature" group under the error | low | Real: `SignatureAnchor` renders in the error state with a label and no value → **patch**: outside loading, render a bare `#signature` target with no label or group role. |
| 4 | B | `usePersonOptions` returns new arrays every render | low | Real: no memo; Story 2.2's pickers need stable references → **patch**: `useMemo` on the inputs. |
| 5 | B | The attribute keys are hard-coded strings instead of `PERSON_VALUE_LISTS` | low | Real drift risk; direct correction → **patch**: derive or type them from `PERSON_VALUE_LISTS`. |
| 6 | B | The "failed type key leaves the read view unaffected" test never waits for the request | low | Real test weakness → **patch**: wait for the Person request count (`countRequests`). |
| 7 | E, B | On the success path, a saved biological gender missing from the platform list is dropped | low | The code matches the AC (current value only in the fallback). The picker behavior belongs to Story 2.2 together with the enum intersection (`deferred-work.md`). Rejected for 2.1; noted for 2.2. |
| 8 | B | `SignatureAnchor` duplicates the unexported foundation `SignaturePlaceholder` | low | Reusing it needs a foundation export (T2) for about 5 lines of markup → **defer** (Foundation: export a signature anchor). |
| 9 | B | The masked SSN reads as "star star star…" to screen readers | low | Not an AC or WCAG failure, and a spoken phrase needs new copy; Story 2.3 owns the SSN row (Reveal). Rejected; noted for 2.3. |
| 10 | B | `isMaskedSsn` accepts `"*"` or an oddly spaced mask | low | The security property (never more than 4 digits) holds; the backend sends `***-**-NNNN`. Rejected. |
| 11 | E | A signature id ≤ 0 makes a wasted request | low | The backend sends real ids or `null`; the fallback still shows "Not provided". Rejected. |
| 12 | B | The hook hides the type-key error and source from callers | low | No consumer needs it yet (YAGNI); Story 2.2 can add it. Rejected. |
| 13 | B | The e2e deep link doesn't assert tab normalization or `h2` focus | false | `#signature` is a sub-anchor (scroll, not `h2` focus); tab normalization is shell behavior covered by `e2e/shell.spec.ts`. |
| 14 | B | Coverage gaps: empty first/last name, a non-plain `birthDate`, SSN attributes | low | `isNotProvided`/`KeyValueTable` and `wireToDisplayDate` are covered in their own tests; the SSN span has only text. Rejected. |
| 15 | B | E2E fragility: `networkidle`, exact 112×32, a null `id` in `valueCell` | low | 14/14 green on both projects; the thumbnail is fixed integer CSS px. Rejected. |
| 16 | B | Repeated DRAFT COPY comments; the "SSN" label abbreviation | low | Style only; "SSN" is the AC's field name. Rejected. |

## Verification

**Commands** (the system Node is 26: put `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin` first on `PATH`; use `corepack pnpm` if `pnpm` isn't on `PATH`; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
