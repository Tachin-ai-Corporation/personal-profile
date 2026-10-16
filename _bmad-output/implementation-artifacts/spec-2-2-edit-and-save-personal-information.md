---
title: 'Story 2.2: Edit and save Personal Information'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '09c8d09164e47f4f59b0ca29cc120b11f119bdb3'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Personal information Section on `/` is read-only (Story 2.1). Users can't correct their legal name, birth details or demographics (Story 2.2, FR12, NG-9022; acceptance source: `epics.md` "### Story 2.2: Edit and save Personal Information").

**Approach:** Add the edit view and the save to `features/personal`, using what is already built: `useSectionForm` with the shared chrome, `KeyValueEditTable`, drafts and Save all registration, `Select`/`DateInput`/`Combobox`, `person-rules.ts`, `userEditPath()` + `mapApiError("personal", …)` + `mutateMyself()`, the D-A save safeguard inside `callApi`, and 2.1's `usePersonOptions`.

## Boundaries & Constraints

**Always:**
- **Edit view:** an outline "Edit" (`editButtonProps`) in read view. The header shows muted "Editing" while editing. Use a `<section id="personal">` landmark with `SectionHeader editing`, the same element from the first render, as the fixture Section does. `SectionLandmark` can't show "Editing". Focus goes to Name prefix first. Rows follow the F1 order. While editing, SSN and Signature stay read-only rows ("(optional)", masked value / thumbnail, Signature keeps `rowId: SIGNATURE_ANCHOR`) until 2.3/2.4 add their controls.
- **Rules** (`features/personal/schema.ts`, `personalSchema`, built on `person-rules.ts`):
  - all text is trimmed before validating and diffing;
  - First and Last name use `nameIssue`;
  - Middle name, Other names and Titles are optional, ≤ 24 characters (`NAME_MAX_LENGTH`);
  - Prefix and Suffix are optional, ≤ 10 (`PREFIX_SUFFIX_MAX_LENGTH`);
  - City of birth and Sexual orientation are optional, ≤ 128;
  - Gender identity is required, ≤ 128;
  - every text field accepts printable characters only (`textIssue`);
  - Birth date: empty → `birthDateRequired`, unparsable → `birthDateFormat`, outside `isBirthDateInRange(date, roles, today)` (future dates included) → `ageRange` with `birthDateAgeRange(roles)`;
  - Race, Ethnicity and Biological gender are required → "Choose a value".
- **Preselects:** when edit opens, an unset Race or Ethnicity is set to "Unknown", and an unset Biological gender or Gender identity to "Asked but not answered", with `form.setValue`. They count as changes (sent on Save) but write no draft.
- **Option lists (settles the 2.1 note and the `deferred-work.md` two-sources entry):**
  - The pickers offer `usePersonOptions` ∩ the `user/edit` enums, so no offered value can be a 400. The enums are copied into `lib/shared/person-options.ts`, and a drift test in `allowlist/personal.test.ts` asserts the copies equal `RACES`/`ETHNICITIES`/`BIOLOGICAL_GENDERS`.
  - An empty intersection uses the fallback list, and the preselect value is always offered.
  - A saved value that isn't offered (a platform-only or legacy value) shows on the trigger through `Select unlistedValue`. It is kept while unchanged, so it is never sent. Once changed it can't be picked again; Cancel brings it back.
- **Copy:** new `PERSON_MESSAGES` keys only.
  - Verbatim: "Former or other legal names.", "Up to 128 characters." (Sexual orientation help and error).
  - `// DRAFT COPY`: "Choose a value", "Use letters, spaces and standard punctuation only" (every non-printable error), "Up to 128 characters" (City of birth, Gender identity), "Up to 24 characters", "Up to 10 characters".
  - Reuse `COMBOBOX_MESSAGES.genderIdentityHelp`. The Birth date help is `ageRange`, hidden while the field shows an error.
- **Save** (`savePersonalInformation(diff)` in `lib/api/personal.ts`): `PUT userEditPath()` with a `PersonalInformationPayload` of the changed fields only (strings, birth date `YYYY-MM-DD`). A cleared optional field is sent as `"n/a"`. An empty diff sends nothing and resolves ok. On success: `mutateMyself()`, then `{ ok: true }`. On failure: `{ ok: false, error: { code: mappedErrorCode(m), mapped: m } }` with `m = mapApiError("personal", res)`. Never throws.
- **Registration:** `useSectionForm({ id: "personal", label: SHELL_MESSAGES.sectionPersonal, displayOrder: 1, onNoChanges: "close", fieldOrder, draftFields = the 14 fields, describeDraftDiff, dataStatus, SectionContainer sectionId="personal" })`. The `user/edit` allowlist entry already exists (spec F1), so no new allowlist entry.

**Decisions (agent, 2026-10-16):**
- **Non-printable copy:** a non-printable character in City of birth or Sexual orientation shows "Use letters, spaces and standard punctuation only", not the length copy the AC lists for both. A length message would mislead.
- **Whitespace-only edit:** trailing spaces make the form dirty, but the trimmed diff is empty. Save then sends nothing and still shows "Personal information saved.". The foundation compares raw values; this is accepted.
- **Foundation (human, 2026-10-16):** two additive foundation changes ship alone on `feat/NG-9022-form-controls` (off `origin/main`, its own commit and PR for both teams), and that commit is cherry-picked here so 2.2 doesn't wait for the merge:
  - `Combobox` gets an optional `control?: FieldControlProps` prop. When set, it renders the input without its own `FormField` and uses the table's label, help and error wiring.
  - `useSectionForm` gets `control(name)` → `{ name, value, onChange(value), onBlur, ref, readOnly }` for non-native controls (Select, DateInput, Combobox). It registers the element for first-invalid focus and reports a user change (drafts), without RHF writing DOM values.
  - Gender identity uses `Combobox control`. The Selects, Birth date and Gender identity use `section.control(name)`, so every invalid field gets focus.
- **Emoji (human, 2026-10-16, review):** the shared printable rule (`lib/shared/person-rules.ts`) accepted full emoji, which the AC rejects. Fixed in the shared rule as a second foundation commit on `feat/NG-9022-form-controls` (`be9aee2`, cherry-picked here as `b11c9e8`). Both pages and the proxy now reject emoji the same way.
- **Spec size:** about 2,000 tokens, kept whole because it is one goal (self-approved per the user's instruction).

**Never:**
- Don't edit `features/shell/**`, `features/header/**`, existing `components/ui/*`, `lib/api/{index,myself,type-keys,account}.ts`, `user-edit-path.internal.ts`, `allowlist/{index,core,files}.ts`, foundation message files or the shared PA4 keys, `test/**` (except `test/page-handlers/profile.ts`), `e2e/fixtures/{core,index}.ts`, or `app/page.tsx`.
- Don't send `email`, `phoneNumber` or `phoneNumberRegion`. Don't draft SSN or Signature. Don't widen `userEditBodySchema`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Change + save | First name "Ann " → "Anna" | PUT `{ firstName: "Anna" }`; header name updates; read view; toast "Personal information saved."; `h2` focused; draft cleared | N/A |
| Clear optional | Middle name "B" → "" | PUT `{ middleName: "n/a" }` | N/A |
| Preselects | race, ethnicity, biologicalGender, genderIdentity unset; Save | PUT has `race: "Unknown"`, `ethnicity: "Unknown"`, `biologicalGender` and `genderIdentity` "Asked but not answered" | N/A |
| No changes | Edit → Save | no request, read view, no toast, focus `h2` | N/A |
| Invalid | First name 25 chars, Race empty | no request; first invalid (First name) focused; both errors under their fields | N/A |
| Age | Birth date 18th birthday today / one day short; Proctor 21 | valid / `ageRange` 18–120; 21–120 for Proctor | N/A |
| Unlisted saved value | `biologicalGender: "Intersex"` (not in enum) | trigger shows "Intersex"; untouched → not sent | N/A |
| Field error | 400 SSN taken | error under its field (2.3 adds the SSN field; until then a Section error) | stays in edit |
| Coded/unknown | 400 `INVALID_ENUM_VALUE` | Section error "Couldn't save personal information." + Retry | stays in edit |
| Network/5xx | PUT 503 | "Couldn't save personal information. Check your connection." + Retry resends the same diff | stays in edit |
| Account fields | `myself` has email + phone; full diff | body has no `email`/`phoneNumber`/`phoneNumberRegion` | N/A |

</frozen-after-approval>

## Code Map

- `features/personal/personal-section.tsx` -- 2.1 read Section: keep the `PersonalSection` export, `StateFrame`/attempt/claim logic, `personalRows`, `isMaskedSsn`, `SignatureAnchor`; add the edit branch.
- `features/personal/use-person-options.ts` -- 2.1 option lists; the enum intersection and unlisted handling go here (or in `person-options.ts` as pure helpers).
- `features/shell/__fixtures__/fixture-section.tsx` -- reference wiring: `<section aria-labelledby>` + `SectionHeader editing` + `SectionContainer sectionId` + `KeyValueEditTable` rows `{ key, label, optional, required, help, error, render }` + `SectionFooter {...footerProps}`.
- `features/shell/use-section-form.ts` -- `useSectionForm` (presets via `form.setValue` count as dirty, not as user change; `errorFields`; `fieldOrder`; `describeDraftDiff`; `dataStatus`).
- `components/ui/{select,date-input,combobox,input}.tsx` -- `Select placeholder`, `unlistedValue`; `DateInput value/onChange(value,{text})/min/max/resetKey/calendar`; `Combobox staticOptions mode="free-text" text onTextChange maxLength`.
- `lib/shared/person-rules.ts`, `lib/shared/dates.ts` (`wireToDisplayDate`, `displayToWireDate`, `parseDisplayDate`), `lib/shared/display-value.ts#isNotProvided`.
- `lib/server/proxy/allowlist/personal.ts:33-47` -- `RACES`, `ETHNICITIES`, `BIOLOGICAL_GENDERS` (read-only source for the drift test).
- `lib/api/personal.ts` -- `PersonalInformationPayload`; add `savePersonalInformation`. `lib/api/user-edit-path.internal.ts#userEditPath`, `lib/api/keys.ts#mutateMyself`, `lib/api/errors#mapApiError/mappedErrorCode`, `lib/api/client.ts#callApi`.
- `lib/shared/messages/{person,combobox,section,shell,fields,common}.ts` -- copy; only `person.ts` gains keys. `messages.test.ts` checks non-draft strings against Voice and Tone automatically.
- `test/myself-fixture.ts`, `test/providers.tsx#renderInPage`, `test/axe.ts`; e2e `mockProfileDefaults`, `mockUserEdit` (core, use as is).

## Tasks & Acceptance

**Execution:**
- [x] `lib/shared/person-options.ts` (+ test) -- accepted-value lists and `offeredOptions(list, accepted, fallback, preselect)` -- picker lists that never 400.
- [x] `lib/server/proxy/allowlist/personal.test.ts` -- drift test: the shared copies equal the proxy enums.
- [x] `lib/shared/messages/person.ts` -- the new keys -- catalog copy.
- [x] `features/personal/schema.ts` (+ `schema.test.ts`) -- `personalSchema`, `toPersonalValues(myself)`, `personalDiff(values, baseline)`, `PERSONAL_DRAFT_FIELDS`, `personalDraftDiff` -- every rule, the 24/25 boundaries, Proctor, preselects, `"n/a"` on clear, no email/phone.
- [x] `lib/api/personal.ts` (+ `personal.test.ts`) -- `savePersonalInformation` -- 200 / 400 `errorCode` / network result shapes, the AD-9 body assertion.
- [x] `features/personal/personal-section.tsx` (+ `personal-section.test.tsx`), `use-person-options.ts` -- edit view, presets, save, drafts -- every matrix row, Enter/Escape, Cancel, axe light/dark.
- [x] `e2e/profile-personal.spec.ts` (+ `e2e/fixtures/personal.ts`) -- edit → save → header name, invalid focus, 360 px, axe edit view.
- [x] `_bmad-output/implementation-artifacts/{sprint-status.yaml,deferred-work.md}` -- the `2-2` line; resolve the two-sources entry.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api`, `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed plus the two cherry-picked foundation commits (`8b00585`: `components/ui/combobox.tsx`, `features/shell/use-section-form.ts` and their tests; `b11c9e8`: `lib/shared/person-rules.ts` emoji rule and its tests).

## Implementation Notes

- **Birth date in the form** is the date input's shown text (`MM/DD/YYYY` or partial), so the schema tells `birthDateRequired` from `birthDateFormat`; `personalDiff` sends it as `YYYY-MM-DD`, and drafts and the conflict compare show the display text. `BirthDateControl` bumps `resetKey` only when the form value changes from outside (a restored draft).
- **Offered options** live in `usePersonOptions().offered` (`offeredOptions` from `lib/shared/person-options.ts`). The fallback is intersected too, so the biological-gender fallback never offers a platform-only current value; that value shows through `unlistedValue`.
- **Read only while saving:** `Select` gets `open={false}` and ignores changes (plus `aria-readonly`); the `Combobox` has no `readOnly` prop, so its `onTextChange` is ignored while saving (the text is controlled). Nothing is `disabled`.
- **SSN and Signature rows in edit view** render an `<output aria-live="off">` with the row's control id, so the row label names a labelable element (a `div` is not labelable).
- **Card:** once `myself` is loaded the `StateFrame` drops its own card classes (`border-0 bg-transparent overflow-visible`), so `SectionContainer` is the one card and its editing halo isn't clipped; loading and load-error frames are unchanged from 2.1.
- **Header refresh:** unit tests render with a per-test SWR cache, which `mutateMyself()` (global cache) doesn't reach, so the header update is asserted in e2e; `lib/api/personal.test.ts` checks the revalidation on the default cache.

- **Review patches (pass 1):**
  - required names and Gender identity reject the clear sentinels ("n/a", "-1");
  - one `PERSONAL_OPTIONAL_FIELDS` set;
  - the Select's unlisted value follows the current value;
  - Sexual orientation help is hidden while it shows an error;
  - one `today` per render for the schema and the calendar bounds;
  - new tests: first-invalid focus on Birth date, Gender identity and Race (draft-restored `""`) with no Section error, and in-flight read-only;
  - the emoji assertions are restored after foundation `b11c9e8`;
  - e2e aliases are removed, and the 360 px test checks the non-native controls' widths.

- **Final verification (Node 24.22, after the review patches and `b11c9e8`):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 3926/3926 passed, coverage 100% on `lib/server`, `lib/api`, `lib/shared`.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 456 passed, 5 skipped (by design), 1 flaky. The flaky one, `primitives.spec.ts` DisabledAction tooltip Escape on desktop, is unrelated (seen in 2.1 too) and passed on retry.

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification-gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | VG, B | No test makes a non-native control (Birth date, Gender identity, a picker) the first invalid field; the "Race empty" matrix row is untested | medium | Real: the focus path through `control().ref` was unpinned → **patch**: three focus tests (Race via `applyDraft({ race: "" })`). |
| 2 | VG | Nothing tests that the pickers and Gender identity are inert while saving | low | Real test gap, direct addition → **patch**. |
| 3 | E | A required name or Gender identity typed "n/a" / "-1" passes and is sent as the platform's clear sentinel | medium | Real: `nameIssue("n/a")` is null and `isNotProvided` then reads it as empty → **patch**: required fields treat `isNotProvided` as required. |
| 4 | E | A value picked from the fallback, then absent from the later platform list, leaves the trigger blank while it is still sent | low | Real: `unlisted` came from the saved value only → **patch**: derive it from the current value. |
| 5 | B | Full emoji pass the printable rule although the AC rejects them | medium | Real: `NON_PRINTABLE` had no emoji classes. The fix is shared foundation, so the human was asked → foundation commit `be9aee2` (cherry-picked as `b11c9e8`) + schema assertions. |
| 6 | B | The optional-field list is defined twice (Section and schema) | low | Real drift risk (label vs rule); direct correction → **patch**. |
| 7 | B | Sexual orientation shows the same text as help and error | low | Real, read twice by screen readers → **patch**: hide the help while in error. |
| 8 | E, B | The schema's memoized `today` and the calendar bounds' `today` can disagree across midnight | low | Real, but a direct correction → **patch**: one `today`, memo on the day key. |
| 9 | B | The boundary test says "121" but checks 120 years and a day | low | Real misnaming (the rule is the backend's `minusYears`) → **patch**: rename. |
| 10 | B | Invisible literal characters in the schema tests | low | Real readability issue → **patch**: `\u` escapes. |
| 11 | B | Leftover e2e aliases and a stale comment | low | Real → **patch**: delete. |
| 12 | B | The 360 px e2e checks only First name | low | Real → **patch**: also the Race, Birth date and Gender identity widths. |
| 13 | E, VG, B | A partial birth date restored from a draft, or kept across a 768 px remount, shows an empty input while the form holds the text | low | Real: `DateInput` can't show partial text from outside (foundation) → **defer**. |
| 14 | E, B | The Gender identity Combobox has no read-only mode: its list opens and it lacks `aria-readonly` while saving (changes are already ignored) | low | Real; needs a foundation `readOnly` on Combobox → **defer**. |
| 15 | B | The read view can show old values after "saved" if the `myself` refetch fails | low | Real only when the GET fails right after a successful PUT. Seeding the cache from the PUT needs a `toMyself` mapping of the response → rejected (unlikely; not a direct fix). |
| 16 | B | Opening Edit with unset pickers makes the Section dirty | false | The AC requires it: "A default preselected by the app counts as a change, so it is sent on Save". |
| 17 | B | Length messages are inconsistent ("First name can be up to 24 characters" vs "Up to 24 characters") | low | First and Last are verbatim PA4 copy; the rest are DRAFT COPY for PM review → rejected. |
| 18 | E | A `myself` revalidation during edit with a newly set race keeps the preset "Unknown" over it | low | Real only if race changes elsewhere while this edit is open (no other app page edits it); the fix adds merge logic → rejected (unlikely). |
| 19 | B | The spec Verification hard-codes a session path; the logs were empty at review | false | The path is this machine's Node 24 for the build agent; the logs fill in at review (this table). |
| 20 | B | The sprint-status note says "Remaining" before "built" | false | The line is an append-only dated log (as 1.9–1.14); the newest entry wins. |
| 21 | B | New deferred items are not logged | low | Rows 13–14 are deferred now; the whitespace-only edit is a recorded decision. Nothing else to defer. |
| 22 | B | `watchMyself` waits 10 ms; the toasts mock targets the internal path | low | Passes repeatably; the barrel re-exports that module. Rejected. |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`, since the system Node is 26; no git commits, no push; the cherry-picked foundation commit `8b00585` is already in HEAD; `corepack pnpm` if `pnpm` isn't on `PATH`; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
