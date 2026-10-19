---
title: 'Story 3.2: Add, relabel and remove phones'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '51b165430bb0c5c7838e2bcf5802d32e99d34db7'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Phone Section is read-only (3.1). Users can't add numbers, change labels or remove old numbers (Story 3.2, FR16, NG-9023; acceptance source: `epics.md` "### Story 3.2: Add, relabel and remove phones").

**Approach:** Add the edit view and the save to `features/contacts/phone-section.tsx`, using what is already built:
- the 3.1 engine (`contactPointsDiffToManageDTO`) and `contact-labels.ts`;
- `useSectionForm` with list rows, `section.control()`, `SectionTable` in edit layout, `RowActions`, `RowRemoval` / `RowEditStatus`, `PhoneInput` with `lib/shared/phone.ts`, `InputLocked`, `Select`, `DisabledAction`, drafts, Save all, and the D-A safeguard inside `callApi`.

A new `POST v2/health/contact-point` proxy entry carries the one save request.

## Boundaries & Constraints

**Always:**
- **Entry points:**
  - Read-view header actions: an outline "Edit" (`editButtonProps`) and "Add phone", both 44 px. Only "Add phone" is aria-disabled with the limit reason when both types are full; Edit stays usable, so relabel and remove still work at the limit.
  - The empty-state "Add phone" opens edit with one new row, and focus goes to its first control.
  - **Kebab** (`RowActions`, named "More actions for {formatted number}"):
    - "Edit" opens edit and focuses that row's Label (`startEdit({ focus })`);
    - "Remove" opens edit with that row struck through and focus on its Restore.
  - The kebab and the empty-state action, both held back in 3.1, arrive here.
- **Registration:** `useSectionForm` with `id: "phone"`, label `"Phone"`, `displayOrder: 2`, `onNoChanges: "close"`, `cancelFocus: "heading"`, `fieldOrder` (row paths), `draftFields: ["rows"]`, `describeDraftDiff`, `dataStatus`, and `SectionContainer sectionId="phone"`. Form values are `{ rows: PhoneEditRow[] }`.
- **Saved row** (edit):
  - Number and Type are `InputLocked`, with the help "Saved numbers can't be changed. Remove it and add a new one.".
  - Label is a `Select` of `contactLabelsFrom(type-key names)` without "Primary".
  - A Primary row shows the Primary chip as a locked value (Story 3.4 changes Primary).
- **New row:**
  - **Number:** `PhoneInput` (default `us`) with the help "Include the area code. Mobile numbers get a verification link by text after you save.".
  - **Label and Type:** Label is a required `Select` without "Primary". Type is a required `Select` of Mobile / Landline with no preselect.
  - **Status:** "New · not saved". The type key is read through `useSWR(keys.typeKey("ContactPoint"))`.
- **Validation** (`features/contacts/phone-schema.ts`, `phoneSchema`, on blur and Save; nothing is sent while an error remains, and focus goes to the first invalid field):
  - `phoneIssue`: `tenDigits` → "Enter a 10-digit US number", `invalid` → "Enter a valid phone number", `required` → the same 10-digit / valid message.
  - A number whose E.164 form equals any other row's (saved, struck or new) → "This number is already on your profile".
  - An empty Label → "Choose a label"; an empty Type → "Choose Mobile or Landline".
  - A Type at its limit → "You've reached the limit of 20 phones".
- **Remove:**
  - On a saved row, Remove (`RowRemoval`) strikes it, sets "Removed on save" and turns the action into "Restore". On a new row, it deletes the row.
  - **Remove is aria-disabled** (`DisabledAction` tooltip):
    - "You need at least one phone" when exactly one non-removed phone would remain;
    - "Make another phone primary first" on any Primary-labelled row (see Decisions).
- **Limit:** 20 per type, counting saved non-removed rows and new rows.
  - Both types full: "Add phone" and "Add row" are aria-disabled with "You've reached the limit of 20 phones".
  - One type full: that Type option is disabled in a new row, and the schema rejects it at the field.
- **Engine fix** (`lib/api/contacts.ts`): the body always carries all three lists as arrays, empty ones included. The backend's `validateContactPointsTypeSwap` iterates `contactPointsToUpdate` without a null guard, so an add-only body would be a 500.
- **Save:**
  - `saveContactPoints(dto)` in `lib/api/contacts.ts` (`contactPointManagePath()`) sends exactly one `POST /api/1h/v2/health/contact-point`, built by `contactPointsDiffToManageDTO`. New numbers go as `toE164` with `phoneNumberRegion` = the picked region, and `type` is Mobile or Landline.
  - An empty diff sends nothing (`onNoChanges: "close"`).
  - **On success:** `mutateContactPoints("Mobile", "Landline")` and `mutateMyself()` (the header and the `/account` picker refresh), then read view, "Phone saved.", focus on the `h2`, and the draft cleared.
  - Never throws: a failure resolves `{ ok: false, error }` with `mapApiError("phone", res)`.
- **Errors** (`lib/api/errors/contacts.ts`, anchored on the exact backend texts; `Field` extended to `"value" | "type" | "label" | "primary"`):
  - **Limit** `MAX_CONTACT_POINTS_PER_TYPE_ERROR` → field `type`, "You've reached the limit of 20 phones".
  - **Invalid phone** `Invalid phone number provided {…}.` → field `value`, "Enter a valid phone number".
  - **Invalid label or type** `INVALID_ENUM_VALUE` → field `label`, "Choose a label from the list".
  - **The Primary rules** (delete or downgrade without a replacement, two Primaries, a Primary in an add, already has a Primary, not verified) → field `primary`, "Make another phone primary first".
  - **Placement:** `errorFields` maps `value`/`type`/`label` to the single new row's paths when exactly one new row exists. Otherwise, and for `primary`, the message shows at Section level with Retry. An unknown code shows "Couldn't save phone." with Retry, and a network failure "Couldn't save phone. Check your connection." with Retry.
- **Proxy** (`allowlist/contacts.ts` + test): `POST v2/health/contact-point`, no query (any → 400 `BAD_QUERY`), JSON only (other → 415), `maxBytes` 64 KB. Its body is a strict zod schema (`contactPointManageBodySchema`):
  - all three keys required as arrays (≤ 100 each);
  - add `{ value: string 1–2048, type: Email|Mobile|Landline|Social Media, label: the backend labels without Partnership Organization, isNotificationEnabled?: boolean, phoneNumberRegion?: /^[a-z]{2}$/ }`;
  - update `{ id: positive int, type, label, isNotificationEnabled?: boolean }`;
  - remove: positive ints.
  - Tests cover the happy path, 415, 405, a query, a missing list, an unknown key, a bad type or label, and too many rows.
- **Copy:** new `CONTACT_MESSAGES` keys; grep the catalog first. Verbatim from Voice and Tone: "You need at least one phone", "You've reached the limit of 20 phones", "Add phone", "Make another phone primary first". The rest is DRAFT COPY. Reuse `SECTION_MESSAGES.phoneInvalid`, `edit`, `removedOnSave`, and `COMMON_MESSAGES.remove` / `restore`.
- **Layout:** below 768 px each card stacks its inputs full width in place, with every control ≥ 44 px. Enter never submits, and Escape never cancels.

**Decisions (agent, 2026-10-16; no human input needed):**
- **Remove on a Primary row is disabled, with a reason.** The AC says Story 3.4 handles it and the backend rejection is mapped until then. But the 3.1 engine throws on removing a Mobile Primary with no replacement, and the backend rejects it for every type. Disabling it with "Make another phone primary first" tells the user why before they try. Story 3.4's Make primary gives them the way.
- **Engine body:** the three lists are always sent (the backend null bug). This changes the 3.1 behaviour of omitting empty lists.
- **Known errors at Section level** use `field` results whose field the Section doesn't map. `useSectionForm` already shows those messages at Section level with Retry, so no new `DerivedErrorCode` (a foundation change) is needed.
- **Spec size:** about 2,300 tokens, kept whole because it is one goal (self-approved per the user's instruction).

**Never:**
- Don't edit `features/shell/**`, `components/ui/*` (existing), `lib/api/{index,contact-points,keys,type-keys,errors/core,errors-codes}.ts`, `allowlist/index.ts`, foundation message files, `test/**` (except `test/page-handlers/profile.ts`), `e2e/fixtures/{core,index}.ts` or `app/page.tsx`.
- Don't verify here (Story 3.3) and don't Make primary (3.4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add US | new row us `4155550101`, Personal, Mobile; Save | one POST `{ contactPointsToAdd:[{ value:"+14155550101", type:"Mobile", label:"Personal", isNotificationEnabled:false, phoneNumberRegion:"us" }], contactPointsToUpdate:[], contactPointsToRemove:[] }`; keys and myself mutated; read view; "Phone saved."; `h2` | N/A |
| Relabel | saved Home → Work | one POST with `contactPointsToUpdate:[{ id, type, label:"Work", isNotificationEnabled }]` | N/A |
| Remove + Restore | Remove saved id 7, Restore it, Remove again; Save | struck "Removed on save"; Save sends `contactPointsToRemove:[7]` | N/A |
| Remove new row | add, then Remove | the row disappears; nothing sent | N/A |
| Last phone | one phone left | Remove aria-disabled, "You need at least one phone" | N/A |
| Primary row | Remove on the Primary row | aria-disabled, "Make another phone primary first" | N/A |
| Invalid | us `41555`; gb `123`; duplicate of a struck row; empty label/type | the four messages at their fields; nothing sent; focus first invalid | N/A |
| Limit | 20 Mobile + 20 Landline / 20 Mobile only | Add phone and Add row disabled / the Mobile option disabled, schema error | N/A |
| Kebab | read view kebab Edit / Remove | edit with Label focused / row struck, Restore focused | N/A |
| Duplicate 400 | `PERSON_ALREADY_HAS_CONTACT_POINT_ERROR` with one new row | "This number is already on your profile" at that row's number | stays in edit |
| Limit 400 | `MAX_CONTACT_POINTS_PER_TYPE_ERROR`, two new rows | "You've reached the limit of 20 phones" at Section level + Retry | stays in edit |
| Unknown / network | 400 other / network | "Couldn't save phone." / "Couldn't save phone. Check your connection." + Retry resends the same diff | stays in edit |
| Cancel | dirty edit; Cancel | only Phone reverts, no confirm, draft deleted | N/A |
| Drafts | add a row; session expires | the draft holds `rows`; a restore shows the new row | N/A |

</frozen-after-approval>

## Code Map

- `features/contacts/phone-section.tsx` -- the 3.1 read view (merge, `findPrimary` hoist, cells, `StateFrame`); add the edit branch, header actions and kebab. New `features/contacts/phone-schema.ts` (+ test) and per-row edit cells.
- `lib/api/contacts.ts` -- the engine (`ContactPointEditRow`, `contactPointsDiffToManageDTO`, guards); change it to always send three lists; add `contactPointManagePath()` and `saveContactPoints(dto)` (copy `sendPersonalInformation` in `lib/api/personal.ts`).
- `lib/shared/contact-labels.ts` -- `CONTACT_LABELS`, `contactLabelsFrom`, `CONTACT_LABEL_HOME`/`OLD`, `CONTACT_PHONE_TYPES`.
- `features/shell/__fixtures__/ui-kit-fixture.tsx:52-350` -- the reference wiring of `PhoneInput` + `RowRemoval` + `SectionTable` edit layout.
- `features/shell/use-section-form.ts` -- list paths in `fieldOrder`/`errorFields`, `control(name)` for `PhoneInput`/`Select`, `startEdit({ focus })`, the field-result Section fallback (`showFailure`).
- `components/ui/{phone-input,input-locked,select,disabled-action}.tsx`; `lib/shared/phone.ts` (`phoneIssue`, `toE164`, `phoneInputFrom`, `EMPTY_PHONE_INPUT`, `normalizeRegion`).
- `features/shell/{row-actions,row-removal,section-table,section-footer}.tsx` -- `RowActions`, `RowRemoval` (Restore focus through its ref), `SectionFooter addRow { label, onClick, disabledReason }`.
- `lib/api/errors/contacts.ts` -- the duplicate rules; add the new anchored rules and `Field` members. Backend texts: `common/Messages.java:1160-1181`, `INVALID_ENUM_VALUE` (:771) "Invalid '%s' specified. Possible values are %s.", `INVALID_PHONE_PROVIDED` (common util `Messages.java:104`) "Invalid phone number provided {%s}.".
- `lib/server/proxy/allowlist/contacts.ts` (+ test) -- add the POST entry; `userEditBodySchema` in `allowlist/personal.ts` is the strict-schema pattern.
- Tests: `renderInPage`, MSW, `test/myself-fixture.ts#contactPointWire`; e2e `mockContacts`, `mockTypeKey`, `e2e/fixtures/contacts.ts` (`contactPointRow`, `CONTACT_PHONES`).

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/contacts.ts` (+ test) -- the POST entry and its schema.
- [x] `lib/api/contacts.ts` (+ test) -- three lists always; `contactPointManagePath`, `saveContactPoints` (success, field and generic errors, network, never throws).
- [x] `lib/api/errors/contacts.ts` (+ errors tests) -- the new rules and `Field` members.
- [x] `lib/shared/messages/contacts.ts` -- the new keys.
- [x] `features/contacts/phone-schema.ts` (+ test) -- every validation rule incl. struck duplicates and the per-type limit.
- [x] `features/contacts/phone-section.tsx` (+ test) -- edit view, entry points, Remove/Restore, disabled reasons, save, errors, Cancel, drafts, Enter/Escape, axe light/dark.
- [x] `e2e/profile-phone.spec.ts` (+ `e2e/fixtures/contacts.ts`) -- add → save → read; relabel; remove/restore; last-phone disabled; invalid; duplicate 400; 360 px edit; axe.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- the `3-2` line.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api`, `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed.

## Implementation Notes

- **Field order and error mapping** follow the form rows' shape (`n` new / `s` saved, label editable / `l` locked), kept in step while rendering, so `fieldOrder` and `errorFields` always describe the rows on screen. A kebab Edit on a row with nothing editable (the Primary, a row without an id) focuses its locked number; the header Edit with no phones opens a new row like "Add phone".
- **Save** diffs against the saved rows as read: a saved phone the form doesn't hold (e.g. one a stale draft didn't know) is kept unchanged, never removed. After a save the baseline is rebased onto the server rows when the Section returns to read view.
- **Revalidation in unit tests:** `mutateContactPoints` / `mutateMyself` act on the default SWR cache, which `renderInPage` replaces, so the edit test observes them through probes on the default cache; the e2e covers the real refetch.
- **Copy and limit (resolved in review pass 1):** "Make another phone primary first" is the verbatim Voice and Tone copy (no DRAFT marker). At the limit only "Add phone" and "Add row" are aria-disabled; the header Edit stays usable.
- **Tests:** `phone-section.edit.test.tsx` holds the Story 3.2 cases (the 3.1 file keeps the read view), `phone-schema.test.ts` the rules, `lib/api/errors/contacts.test.ts` the new error rows.

- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 4528/4528 passed (181 files), coverage 100% on `lib/server`, `lib/api`, `lib/shared`.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 590 passed, 8 skipped (by design), none flaky.

## Spec Change Log

- **2026-10-16, review pass 1 (bad_spec, corrected in place; agent-authored lines only, so no human renegotiation):**
  - **Trigger:** the implementer's report. The spec said "Make another number primary first", but Voice and Tone has the verbatim "Make another phone primary first" (`EXPERIENCE.md:87`). It also aria-disabled the header Edit at the limit, though the AC names only "Add phone" and "Add row".
  - **Amended:** the copy (verbatim, no DRAFT marker), and the header actions line (only Add phone is disabled at the limit).
  - **Known-bad state avoided:** relabel and remove blocked for a user with 40 phones, and an unapproved copy variant.
  - **KEEP:** everything else; the code is patched rather than re-derived.

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B, E | The header Edit is aria-disabled at the limit, blocking relabel and remove | medium | A spec error (Spec Change Log) → **patch**: only Add phone and Add row. |
| 2 | B, E | "Make another number primary first" differs from the verbatim V&T "Make another phone primary first" | low | A spec error → **patch**: verbatim. |
| 3 | B | `Invalid 'Type'` lands under Label with Label copy | low | Real → **patch**: a Type rule, field `type`. |
| 4 | B | The tfoot button says "Add phone"; the AC says "Add row" | low | Real AC deviation → **patch**. |
| 5 | B | The locked help is repeated on the locked Type input | low | Real → **patch**: Number only. |
| 6 | B | `editRow` / `removeRow` don't handle a missing row (−1) | low | Real (`RowActions` runs the item after the kebab regains focus) → **patch**. |
| 7 | B | Id-less rows count toward "at least one phone" | low | Real → **patch**. |
| 8 | E, B | Index-based keys and lookups: a reorder shifts drafts and cells; a repeated id makes every save throw | medium | Real → **patch**: key by id, de-duplicate. |
| 9 | E | A rejected revalidation after a successful POST reports failure, and Retry re-POSTs the adds | medium | Real → **patch**: catch, still ok. |
| 10 | B | The proxy schema accepts empty, duplicate-id, update+remove and Primary-add bodies | low | Real (cheap to reject) → **patch**: superRefine. |
| 11 | VG | Re-entering Edit after a save is untested (stale override would re-send the add) | medium | Real regression gap → **patch**: a test. |
| 12 | VG | A saved phone the form doesn't hold is never tested as kept | medium | Real gap (a silent delete could ship) → **patch**: a test. |
| 13 | VG | The id-less row guards are untested | low | Real gap → **patch**. |
| 14 | VG | A saved unlisted label (`unlistedValue`) is untested | low | Real gap → **patch**. |
| 15 | B | "Cancel leaves other Sections" and "other Sections usable while saving" are untested | low | Real gap → **patch**. |
| 16 | B | The e2e refetch check doesn't prove order and skips `myself` | low | Real → **patch**. |
| 17 | B | A stray blank line in `phone-section.test.tsx` | low | Real → **patch**. |
| 18 | B | All seven Primary rules share one message | low | Story 3.2 sends no Primary change, so only the disabled-Remove path is reachable. Story 3.4 owns Make primary and its specific copy → rejected (note for 3.4). |
| 19 | B | The locked help leads into a duplicate when the same number is re-added in one edit | low | The AC requires struck rows to count as duplicates, and the help is AC copy → rejected. |
| 20 | B | The new-number help promises a verification text before Story 3.3 | low | AC copy; Story 3.3 adds the auto-verify in this epic before release → rejected. |
| 21 | B | The limit copy hardcodes 20 and reads as a total | low | Verbatim Voice and Tone copy; the backend limit is 20 per type → rejected. |
| 22 | B | A save can report success while the refetch leaves the list stale | low | A failed GET right after a successful POST; the next revalidation corrects it → rejected. |
| 23 | E | Stale form rows can turn a now-Primary row into a programmer error | low | Needs a Primary change on another device during this edit or draft → rejected (unlikely). |
| 24 | E | A row deleted server-side during the edit keeps counting | low | Needs a concurrent delete elsewhere → rejected (unlikely). |
| 25 | B | The spec held session-path, status and empty-log leftovers | false | The tasks are ticked after verification, and the logs fill in at review (this table). |
| 26 | B | `INVALID_ENUM_VALUE` for Type mapped to Label (VG product note) | — | Same as row 3. |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; `corepack pnpm` if `pnpm` isn't on `PATH`; no git commits, no push; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
