---
title: 'Story 5.2: Add and edit a policy'
type: 'feature'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_commit: '8bbb6bd7afa01ee8b846775316412b4eb132de6c'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-view-policies-and-card-images.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Patients can see their policies (Story 5.1) but can't add one or correct one, including a policy held by someone else (Story 5.2, FR29, NG-9029; acceptance source: `epics.md` "### Story 5.2: Add and edit a policy").

**Approach:**
- **Editor:** a drawer opened from "Add insurance" (in the header and on the empty card) and from a card kebab "Edit". It holds the insurer search, fixed lists from the Insurance type key, dates, and a Subscriber group when the relationship isn't Self. It is validated by a zod schema and saved with one `POST` or `PUT`.
- **Guard:** the Section's existing guard-only registration gains the editor's `validate`, `save` and `discard`, so the leave guard and page navigation protect unsaved edits.
- **Later slots:** card images (5.3) and the demotion offer (5.4) are left as slots.

## Boundaries & Constraints

**Always:**
- **Entry points (now that 5.2 exists, decision 1A of 5.1 lifts):**
  - An outline "Add insurance" button with a plus icon in the `SectionHeader` actions.
  - A primary "Add insurance" button on the empty card.
  - A kebab "Edit" item on non-Deleted cards. Deleted cards keep no kebab, because the backend would accept a `PUT` to a Deleted policy.
- **Drawer:** `Sheet` from the right, 480 px wide, full height over the `scrim` token.
  - The sticky header holds "Add insurance" or "Edit insurance" (DRAFT) and the close control. Below 768 px it is full screen, with Back in place of close and the paired fields stacked.
  - The sticky footer holds Cancel (secondary) and Save (primary, `busy` reads "Saving…").
  - While saving: the inputs are read-only, Cancel is disabled and `dismissible={false}`.
  - Focus returns to the trigger on close. The Sheet does this already.
  - Edit pre-fills every field. The backend's placeholders (`1970-01-01` Expiration/Cancellation, `"n/a"` Group ID) load as empty, through `insuranceWireDate` / `isNotProvided`.
- **Field order:**
  - Insurer → Type + Precedence → (5.4 demotion slot) → Relationship → Member ID + Group ID → Effective + Expiration → Cancellation → Subscriber group → (5.3 card images slot).
  - Optional labels: "Group ID (optional)", "Expiration date (optional)", "Cancellation date (optional)". Required fields carry no marker.
- **Insurer:**
  - The insurer `Combobox`, as in the F5-2 fixture: `mode="select-only"`, `minChars={2}`, `pageSize={INSURER_PAGE_SIZE}`, `searchIcon`, help `COMBOBOX_MESSAGES.insurerHelp`.
  - `allowAdd` gives "Add “{name}”" whenever no loaded item's `name` equals the text (trimmed, case-insensitive).
  - It loads `GET v2/health/insurance/organizations?name=&page=&size=20` through `load` (never SWR). The response is a backend `PageImpl`: `{ data: [{ id, name }], lastPage }`, so `hasMore = !lastPage`.
  - On Edit, `defaultSelection` holds the saved insurer.
  - Sent as `insuranceOrganizationDTO: { insuranceCompanyId }` for a listed insurer, or `{ insuranceCompanyName }` (trimmed, never blank) for an added one.
- **Options:**
  - Type, Precedence and Relationship come from `keys.typeKey("Insurance")`, in title case, without `n/a`. Type is a plain attribute (`insuranceType`). Precedence and Relationship are relation attributes (`relationships[].attributes[]`, `insurancePrecedence` and `relationshipToInsured`), read through the foundation change of decision 1A.
  - If the type key fails, an inline `InlineBanner variant="error"` shows with Retry, and Save is blocked until it loads.
  - A saved value the list doesn't offer shows as `unlistedValue` until it is changed.
- **Subscriber group:** shown only when Relationship ≠ Self.
  - It has a top hairline and the heading "Subscriber", with the copy "The person who holds this policy. Needed because the relationship isn't Self.".
  - Fields: First name + Last name, Email (help "Use {first name}'s email, not the one you sign in with."), Phone (`PhoneInput`, `phoneIssue`, sent as E.164 + region) and Birth date (`DateInput calendar`, max today).
  - **Editable subscriber (Add only, decision 3A):** a line under the copy reads "If {first name} isn't on 1health yet, we'll invite them by email." (DRAFT; "they" until a first name is typed).
  - **No typed subscriber on Edit (decision 3A):** when an Edit would need a subscriber that isn't saved, the group shows no inputs and only the reason "To change the policyholder, remove this policy and add it again." (DRAFT). Save is blocked: `validate()` is invalid and focuses that reason, until Relationship is Self again. This covers a Self policy switched to a non-Self relationship, and a non-Self policy saved without a subscriber. The `PUT` never carries a typed subscriber.
  - **Locked subscriber (Edit of a policy saved with Relationship ≠ Self, decision 2C):**
    - First name, Last name, Email, Phone and Birth date show the saved values read-only (`aria-readonly`, not disabled, so they stay focusable and readable).
    - A short reason under the group reads "To change the policyholder, remove this policy and add it again." (DRAFT).
    - The locked fields skip the client rules. The `PUT` sends the saved subscriber unchanged, so the backend never edits that person's profile.
    - Changing Relationship among non-Self values keeps the same locked subscriber. Changing it to Self hides the group and sends no subscriber.
  - Switching to Self hides the group, and the subscriber is not sent. The backend validates any subscriber it receives on `POST`, even with Self.
- **Validation** (`features/insurance/schema.ts`, zod 4, on blur and Save; nothing is sent while invalid; focus goes to the first invalid field):
  - **Required:** Insurer, Type, Precedence, Relationship, Member ID and Effective date.
  - **Member ID:** 3–32 characters, trimmed.
  - **Group ID:** when filled, 3–32 characters. When blank it is left out (an empty string is refused upstream).
  - **Dates:** Expiration and Cancellation must be after Effective, and Cancellation before Expiration when both are set. The date help reads "Expiration and cancellation must be after the effective date. Cancellation must be before expiration.".
  - **Subscriber (Relationship ≠ Self):**
    - First and last name are required, up to 24 characters each.
    - Email is required and valid. It must not equal `myself.email` (case-insensitive; DRAFT copy, on Email).
    - Phone is required and valid. The AC asks for it even though the backend allows none.
    - Birth date is required and must give an age of 18–120: "You must be 18 to 120 years old".
  - Copy not in EXPERIENCE.md is marked `// DRAFT COPY`.
- **Save:**
  - **Request:** `POST v2/health/patient/insurance` (new) or `PUT v2/health/patient/insurance/{id}` (edit), each a full `InsuranceDTO`. A `PUT` replaces the whole record, so every field is sent.
  - **DTO:**
    - uppercase enums (`insuranceType` MEDICAL|DENTAL|HOSPICE|VISION|DRUG, `insurancePrecedence`, `relationshipToInsured`);
    - dates as `YYYY-MM-DD`, an empty optional date left out;
    - `memberIdNumber` and `insuranceGroupId`, trimmed;
    - `insuranceOrganizationDTO`;
    - `subscriber` only when the relationship isn't Self.
  - **Proxy:** strict zod JSON bodies in `allowlist/insurance.ts`, plus the organizations `GET` (`name` up to 100 characters, `page` 0–9999, `size` 20).
  - **Success:** the drawer closes, `keys.insurance()` is mutated, the toast "Insurance saved." shows, focus returns to the trigger, and `section_save { sectionId: "insurance", ok: true }` is sent.
  - **Failure:** the drawer stays open.
    - Mapped upstream messages go to their fields through anchored rules in `lib/api/errors/insurance.ts`: Member ID length, Group ID length, the duplicate `POST`/`PUT` (on Member ID), the Primary-per-type rule (on Precedence until Story 5.4), the subscriber name, email, phone and birth-date rules, the missing org id (on Insurer), and "does not have an insurance" (Section level).
    - Anything else shows at drawer level with Retry.
    - A network failure reads "Couldn't save insurance. Check your connection." with Retry.
- **Guard:**
  - The editor state is lifted into `InsuranceSection`, so its single `useRegisterSection("insurance")` call supplies:
    - `isDirty`: the form differs from the values it opened with;
    - `validate()`: the schema, with `focusFirstInvalid`;
    - `save()`: the same flow as Save. It never throws and returns `{ok}`. Story 5.4 inserts the demotion before it and 5.3 the images after;
    - `discard()`: drop the edits and close.
  - Every close path (close, Back, Escape, scrim, Cancel) calls `requestLeave({ scope: "insurance" })` and closes only on `true`. With no changes it closes at once.
  - Page navigation through `navigate()` (tab, app-bar page switch, Return to 1health) is already guarded. Nothing goes to `localStorage`.
- **Quality:** axe light and dark (drawer open), 44 px targets, 360 px with no horizontal scroll, keyboard-only completion.

**Decisions (human, 2026-10-20):**
- **1A, relation attributes in the shared type-key loader:** a small additive change to `lib/api/type-keys.ts` (+ test). `toTypeInfo` also collects the attributes of `relationships[]`, and `valueListOptions` finds them by `attrKey`. Nothing existing changes. It ships in its own commit, ahead of the story commit, for both teams' review.
- **2C plus the invite line:**
  - On Edit, a saved non-Self subscriber's name, email, phone and birth date are locked, with the reason "To change the policyholder, remove this policy and add it again." (DRAFT).
  - An editable subscriber shows the invite line.
  - Both backend behaviours are logged in `deferred-work.md` as security/PM items: a `PUT` that differs overwrites the other person's 1health profile, and an unmatched email sends an invitation.
- **Full spec kept** (about 3,300 tokens).
- **3A, no typed subscriber on Edit (review row 1, 2026-10-20):** an Edit `PUT` only ever carries the saved subscriber unchanged, or none (Self). Any other non-Self Edit is blocked with the policyholder reason. Applied as a spec change together with review rows 2–15, keeping the build (user decision).

**Never:**
- Edit `features/shell/**`, `components/ui/*` (existing files), `lib/api/{index,keys}.ts`, `allowlist/index.ts` or `test/**` (except `test/page-handlers/profile.ts`) without asking. Decision 1A approves the one `lib/api/type-keys.ts` change, in its own commit.
- Search through SWR, or cache searches.
- Build the card images (5.3) or the demotion banner (5.4).
- Push. Commit locally only, after the checks and the review.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add, listed insurer | "Add insurance"; type "Blu", pick "Blue Shield"; Medical, Primary, Self, member "XKH123", effective | `POST` with `{insuranceCompanyId}`, MEDICAL/PRIMARY/SELF, no subscriber; drawer closes, "Insurance saved.", focus on "Add insurance" | N/A |
| Add, new insurer | "Acme Health" not listed → "Add “Acme Health”" | `insuranceOrganizationDTO: {insuranceCompanyName:"Acme Health"}` | N/A |
| Edit | kebab Edit on a policy with `1970-01-01` and group "n/a" | fields pre-filled, those empty; `PUT /{id}` sends every field; focus back on the kebab | N/A |
| Subscriber | Add, Relationship Spouse | group shows with the invite line; all five required; own email refused; age 17 refused; Self again hides it and `subscriber` isn't sent | inline |
| Locked subscriber | Edit of a Spouse policy | the five fields read-only with the saved values and the reason; `PUT` sends the saved subscriber unchanged; switching to Self hides it | N/A |
| No typed subscriber on Edit | Edit of a Self policy switched to Spouse (or a non-Self policy with no saved subscriber) | no subscriber inputs, the policyholder reason; Save blocked with focus on the reason; back to Self allows Save | blocked |
| Dates | expiration before effective; cancellation after expiration | inline errors on those fields; nothing sent | inline |
| Drug | Type Drug | `insuranceType:"DRUG"` | N/A |
| Server field error | backend "Member Id Number should be at least 3 symbols." / Primary rule / duplicate | message at Member ID / Precedence / Member ID; drawer stays open | mapped |
| Network | `POST` fails | "Couldn't save insurance. Check your connection." + Retry | banner |
| Options fail | type key 500 | inline error + Retry; Save blocked | banner |
| Dirty close | edit, then Escape / scrim / Cancel / Back / tab switch / app-bar Account | leave guard: Keep editing keeps it; Discard closes, focus on trigger; Save validates then saves (invalid → stays, focus on field; failure → stays with error) | guard |
| Clean close | open, then Escape | closes at once, focus on trigger | N/A |

</frozen-after-approval>

## Code Map

- **`features/insurance/insurance-section.tsx`:**
  - Owns the editor state (open, mode, policy, trigger) and the single `useRegisterSection` (today `isDirty:false, discard:noop` at ~l.41).
  - Header `actions` gets "Add insurance". `EmptyState` gets `action`.
- **`features/insurance/policy-card.tsx`:** `RowActions actions={[]}` (~l.126) gets `{ id: "edit", label: SECTION_MESSAGES.edit, onSelect: onEdit }`. Add the `onEdit` prop.
- **New:**
  - `features/insurance/policy-editor.tsx` (Sheet + fields; react-hook-form + `zodResolver`; not `useSectionForm`, which registers its own id and focuses the `h2`);
  - `schema.ts` (+ test);
  - `dto.ts` (form ↔ `InsuranceDTO`, + test), or put the DTO builders in `lib/api/insurance.ts` (100 % coverage).
- **`lib/api/insurance.ts`:**
  - `searchInsurers(name, page, signal)` → `ComboboxLoader` result; never throws; a failure gives `{ error: true }`;
  - `insuranceCreateBody` / `insuranceUpdateBody`;
  - `saveInsuranceCreate` / `saveInsuranceUpdate` (never throw);
  - an options helper over `valueListOptions` for the three attrKeys `insuranceType`, `insurancePrecedence`, `relationshipToInsured`.
- **`lib/server/proxy/allowlist/insurance.ts` (+ test):** organizations `GET`, `POST`/`PUT` with strict bodies (enums limited to the backend constants without `N_A`, strings ≤ 255, dates `^\d{4}-\d{2}-\d{2}$`, subscriber optional), JSON only, `maxBytes`.
- **`lib/api/errors/insurance.ts`:** `Field` = `insurer|type|precedence|relationship|memberId|groupId|effective|expiration|cancellation|subscriberFirstName|subscriberLastName|subscriberEmail|subscriberPhone|subscriberBirthDate`, plus anchored rules with the backend's exact texts (backend notes: `Messages.java:933-955`, `OHS:3284-3330`).
- **`lib/shared/messages/insurance.ts`:** the editor copy. `COMBOBOX_MESSAGES.insurerHelp/addOption` and `COMMON_MESSAGES` already exist; grep first.
- **Foundation pieces:**
  - `components/ui`: `Sheet` (`SheetContent`, `SheetHeader`, `SheetBody`, `SheetFooter`; example `features/shell/__fixtures__/ui-kit-fixture.tsx:136`), `Combobox` (insurer fixture `features/shell/__fixtures__/combobox-fixture.tsx:168`), `DateInput`, `PhoneInput`, `Select`, `FormField`, `InlineBanner`, `Button busy`;
  - `lib/shared`: `phone.ts` (`phoneIssue`, `toE164`, `phoneInputFrom`), `dates.ts`;
  - `features/shell`: `requestLeave`, `toastSuccess`, `useMyself` (`myself.email`);
  - field-error mapping like `features/account/account-settings-section.tsx:99`.
- **Tests:**
  - unit: `features/insurance/policy-editor.test.tsx`;
  - guard: `features/shell/leave-guard.test.tsx` cases as the model;
  - e2e: extend `e2e/profile-insurance.spec.ts`, plus fixtures `mockInsurers`, `mockInsuranceCreate`, `mockInsuranceUpdate`, `mockInsuranceTypeKey` in `e2e/fixtures/insurance.ts`.

## Tasks & Acceptance

**Execution:**
- [x] Decision 1A: `lib/api/type-keys.ts` (+ test) collects relation attributes. Keep it a separate, self-contained change; the orchestrator commits it on its own.
- [x] `lib/server/proxy/allowlist/insurance.ts` (+ test) -- organizations `GET`, `POST`, `PUT` entries.
- [x] `lib/api/insurance.ts` (+ test, 100 %), `lib/api/errors/insurance.ts`, `lib/shared/messages/insurance.ts` -- search, DTO builders, saves, rules, copy.
- [x] `features/insurance/*` (+ unit tests, every I/O row, axe light and dark) -- entry points, editor, schema, guard wiring.
- [x] `e2e/fixtures/insurance.ts`, `e2e/profile-insurance.spec.ts` -- the add/edit journeys, the guard, and 360 px.
- [x] `deferred-work.md`: the two backend subscriber behaviours (logged by the orchestrator at approval).
- [x] `sprint-status.yaml`: the `5-2` line only, set to `review` when done.
- [ ] After review (orchestrator): commit locally (no push), then the local-view merge and `dev-mock.ts` (organizations, `POST`/`PUT` with the backend's rules and texts, and the type key with relation attributes), and typecheck there.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100 % coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed, or each other path was approved by the user and is in its own commit.

## Implementation Notes

- **Decision 1A (own commit):** `lib/api/type-keys.ts` gains an optional `TypeInfo.relationAttributes` (only present when a relation sends attributes, so every existing `toEqual` and caller is unchanged); `valueListOptions` searches the type's own attributes first, then the relations'. Files: `lib/api/type-keys.ts`, `lib/api/type-keys.test.ts`.
- **Foundation blocker found, fixed in its own change (needs approval):** `@radix-ui/react-dialog` 1.3.1 (the Sheet) used `react-dismissable-layer` 1.2.1 / `react-focus-scope` 1.3.1, while `react-popover` 1.1.23 (Combobox) and `react-select` 2.3.7 used 1.1.19 / 1.1.16. Two layer stacks meant that inside the Sheet the insurer list got `pointer-events: none`, clicks on it counted as "outside" the drawer, Escape on an open list also closed the drawer, and the Select's keyboard focus fought the Sheet's focus trap. Fix: `package.json` pins `@radix-ui/react-popover` 1.3.1 and `@radix-ui/react-select` 2.4.1 (released with Dialog 1.3.1, same internals) + `pnpm-lock.yaml`. Tooltip and DropdownMenu still use the old layer and would show the same problem if ever placed inside a dialog.
- **List shape:** the backend's `GET v2/health/patient/insurance` answers its own `PageImpl` (`{ data, lastPage }`, `common/repository/PageImpl.java`), not a Spring Page; `toInsurancePolicies` now also reads `{ data }` and `insurancePage()` (e2e) answers that shape. `InsurancePolicy` gained `insurerId` and the subscriber's email, phone, region and birth date.
- **Errors:** `Field` gained `policy` (the "does not have an insurance" rule, shown at drawer level like Contacts' `primary`), besides the spec's list. "Member Id Number is missing." is mapped too.
- **Editor state:** `features/insurance/use-insurance-editor.ts` (react-hook-form + a resolver that reads the latest schema context) returns `{ editor, refs }`: refs are kept apart because the React compiler lint treats an object that carries refs as a ref. `InsuranceSection` registers `isDirty`/`validate`/`save`/`discard`; the registered `save()` validates, sends, closes and toasts like Save but moves no focus. The type key loads only while the drawer is open. The insurer Combobox is controlled (`selection` from the form) instead of `defaultSelection`, so it can stay read-only while saving; the saved insurer is its selection on Edit.
- **Focus:** the trigger is the element focused at open (header/empty "Add insurance", or the kebab, which has focus again when its item runs); after a successful Add, focus goes to the header's "Add insurance" (the empty card's button leaves with the refetch).
- **Tab switch / app-bar page switch with the drawer open:** unreachable by pointer or keyboard while the modal Sheet is open; the unscoped leave (`navigate()`'s path) is covered by the unit test "page navigation (an unscoped leave) asks too".
- **E2E:** the keyboard-only journey runs on desktop only (the 360 px project is a touch device).
- **Verification (Node 24.22.0):** lint, typecheck, check-forbidden clean; `vitest run --coverage` 6,090 tests, 100 % on lib/server, lib/api, lib/shared; `pnpm build` then `CI=1 pnpm test:e2e` 978 passed / 12 skipped (11 pre-existing + the mobile keyboard-only skip), no flaky; `profile-insurance.spec.ts` 105/105 with `--repeat-each=3`.

- **Review pass 1:**
  - **Fixes:** decision 3A plus triage rows 2–15 were patched (see the triage log).
  - **Deferred:** rows 17–18 (Foundation) and the organizations page shape (Team B/Foundation) are in `deferred-work.md`.
  - **Separate branches:**
    - the Radix bump went to its own PR branch `feat/foundation-radix-popover-select`, with a copy here until it merges;
    - the file-delete page-shape fix went to `feat/foundation-file-delete-page-shape`;
    - the Addresses page-shape fix is a commit on `feat/NG-9026-epic-4`.
- **Final verification (orchestrator, Node 24.22):**
  - Lint, typecheck and `check-forbidden` are clean.
  - Vitest: 6107/6107 (212 files), 100 % on `lib/server`, `lib/api` and `lib/shared`. Rerun on a quieter machine: the first full run, under a load average of about 30 from parallel worktree runs, had 4 timeout or timing failures in files this story doesn't touch. All four pass alone (115/115).
  - `pnpm build` passed.
  - `CI=1 pnpm test:e2e`: 980 passed, 12 skipped, none flaky.

## Spec Change Log

- **2026-10-20, review pass 1, row 1 (intent gap, user decision 3A):**
  - **Finding:** the lock of decision 2C covered only a saved subscriber. An Edit could still send a typed subscriber: a Self policy switched to non-Self, or a non-Self policy saved without one. That reaches the backend's `editUser` path, which overwrites another person's profile.
  - **Amended:** subscriber inputs are Add-only. A non-Self Edit without a saved subscriber shows the policyholder reason and blocks Save.
  - **Known-bad state avoided:** a policy edit that edits a stranger's 1health profile.
  - **How applied:** with review rows 2–15 as patches, keeping the build (user decision).
  - **KEEP:** the saved-subscriber lock, the invite line on Add, and everything else built.

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG); O is the orchestrator.

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B, E | The subscriber lock leaves two paths where an Edit `PUT` carries a typed subscriber: a Self policy switched to non-Self, and a non-Self policy saved without a subscriber. An email that matches an existing person with other details reaches the backend's `editUser` path. The new deferred-work note's claim "this app never triggers it" is false | high | Real (`insuranceLockedSubscriber` is `null` in both cases; the backend edits on `PUT` only). The frozen spec makes these editable, so this is an **intent_gap** → asked the user (loopback). |
| 2 | B, E, E | A server error on a subscriber field lands on a read-only (locked) or unmounted (Self) field: the user is told to fix what they can't edit, or sees nothing | medium | Real (`showFailure` sets it on any `SERVER_FIELDS` target) → **patch**: when the target isn't editable or mounted, show it at drawer level ("The saved policyholder is incomplete. To change the policyholder, remove this policy and add it again." DRAFT for a locked subscriber). |
| 3 | B, E | The locked Phone shows a raw `"n/a"` | low | Real (it formats `locked.phoneNumber` directly) → **patch**: empty when not provided. |
| 4 | B, E | Save (and the guard's Save) does nothing, silently, while the options are still loading | medium | Real (`focusFirstInvalid` targets a banner that exists only on error) → **patch**: focus the Type field, which shows its loading state, or a polite "Loading options…" status. |
| 5 | B, E | "Policy no longer on your profile" leaves a dirty, saveable drawer: every Save resends the `PUT` to the gone id | medium | Real → **patch**: refresh the list, close the drawer without the guard, and show the message as an error toast (its Retry reloads the list; the shared toast always has Retry). |
| 6 | B | Docs say "every field is sent" on `PUT` while blank optionals are left out | low | The bad outcome is false: the backend's full replace writes a missing Group ID as `"n/a"` and missing dates as `1970-01-01`, so clearing works. The docs mismatch → **patch**: say "an empty optional is left out, which the backend's full replace clears". |
| 7 | B | The "Duplicate on POST" backend behaviour isn't logged, though the Design Notes say it is | low | Real → **patch**: a Team A deferred-work entry. |
| 8 | B | The enum lists are copied in `lib/api/insurance.ts` and the allowlist, with no drift test | low | Real → **patch**: a test that the client constants equal the proxy's (as `allowlist/personal.test.ts` does for Person). |
| 9 | E | Typing over the saved insurer then leaving the field shows it empty while the form still holds the old id | medium | Real (`select-only` clears the text on leave, the binding keeps the old value) → **patch**: clear the form value when the text stops matching the selection, so "Choose an insurer" shows. |
| 10 | E | A type key without a list (e.g. no relation attributes) leaves a required Select empty, so nothing can ever be saved | low | Real resilience gap; direct fix → **patch**: fall back to the backend constants when a list comes back empty. |
| 11 | E | "Add insurance" shows in the header while the Section is loading, failed or forbidden | low | Real (a no-access user would open the editor and hit 403) → **patch**: show it only when the list is ready. |
| 12 | E | A 403 on save offers Retry | low | Real → **patch**: a forbidden answer shows the no-access message without Retry. |
| 13 | E | A locked subscriber's saved region that isn't two letters (e.g. `"n/a"`) fails the proxy body (400), so that policy can never be edited | medium | Real (the proxy wants two letters) → **patch**: send `phoneNumberRegion` only when it is two letters (the backend defaults to "us"). |
| 14 | VG | Untested: server field errors for Insurer, Group ID and a subscriber field reach their fields | low | Gap as filed → **patch**: extend the "save failures" table. |
| 15 | VG | Untested: an id-less active policy gets no Edit | low | Gap as filed (an Edit there would `POST` a duplicate) → **patch**: a test. |
| 16 | B, VG, E-claim | The two foundation changes (`type-keys.ts`; the Radix bump with `pnpm-lock.yaml`) sit in the story diff | — | Handled at commit time: each goes in its own commit ahead of the story (decision 1A; the Radix bump awaits the user's approval). |
| 17 | B, VG | `valueListOptions` now also searches relation attributes for every type: if Person's or ContactPoint's `label` is a relation attribute, Personal, Phone and Email would start offering the platform list instead of their fallback | maybe-false | Would be medium if true. Settle by checking the Person and ContactPoint type keys on demo for `label` under `relationships[]` → **defer** (Foundation). |
| 18 | B | Tooltip and DropdownMenu are still on the old Radix internals and would break inside a dialog | low | Real latent issue, foundation-owned → **defer** (Foundation). |
| 19 | B | The age copy "You must be 18 to 120 years old" addresses the user, not the subscriber | low | True, but the AC mandates that string → rejected here; a PM copy note can follow. |
| 20 | B, E | "Add “{name}”" or a saved id-less insurer could create duplicate organizations | false | The backend matches the name case-insensitively and reuses an existing organization (`OHS:3241-3260`). |
| 21 | E | The own-email rule is skipped while `myself` hasn't loaded | low | `myself` is the page's first read and loads before the list → rejected. |
| 22 | E | A policy id of 0 or a negative id would offer Edit | false | Policy ids are database ids, always positive. |

## Design Notes

**Agent decisions:**
- **Primary per type before 5.4:** the backend refuses a second Primary of a type. Until Story 5.4's demotion offer lands (same PR), that refusal shows on Precedence.
- **Length caps:** Member and Group ID up to 32, and subscriber names up to 24, are checked in the client (DRAFT copy) and also mapped from the backend.
- **Subscriber phone:** required, as the AC says, although the backend allows none.
- **Duplicate on `POST`:** the backend may return an existing tenant policy with the same company and member ID instead of creating one. The app simply shows what the refetch returns (logged for the backend).
- **Own email:** `myself.email` (the primary email). The login username is not compared.

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; if `corepack` is missing, also put `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/af4a8bf2-5800-44b7-adc9-13891a6c3dc2/scratchpad/shim` first; the implementer makes no commits; never `pnpm dev` here; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
