# Epic 5 Context: Insurance

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->
<!-- Compiled 2026-10-20 on feat/NG-9029-epic-5 (cut from origin/main f415d43; Epic 4 is in an open PR and not on this branch, so no epic-4-context.md; epic-3-context.md is the format model). Sources: epics.md (Epic 5, FR28–FR31, AD-2/7/13, RC10/RC11, UX-DR45/46, per-story Foundation lines), EXPERIENCE.md, docs/FOUNDATION.md, deferred-work.md, sprint-status.yaml, the current code, and 1h-ng-bo-core-be (OneHealthResource, InsuranceResource, OneHealthServiceImpl insurance create/update/validate, InsuranceServiceImpl, AbstractInsuranceDeleteFactory, InsuranceDTO/ResponseInsuranceDTO, InsuranceConstants, OneHealthRepository.fetchPatientInsurances). ../1health-fe is NOT present in this workspace (only 1h-ng-bo-core-be, 1h-agents-docs, ai-agents-knowledge are siblings), so 1health-fe behaviour comes only from the PRD's research-1health-fe.md. -->

**Read `docs/FOUNDATION.md` before writing any code.** This file doesn't repeat it. Where this file and FOUNDATION or the code disagree, FOUNDATION and the code win.

## Goal

Epic 5 (Jira NG-9029, all five stories) fills the Insurance tab of `/` (`?tab=insurance`). Patients can see every policy on file as a card with front/back card photos, add or correct a policy (including a non-Self subscriber) in a drawer editor, upload card photos with retry, keep one Primary policy per insurance type, and delete a policy. It carries UJ-2 (Jordan adds a spouse's plan: new insurer by name, demote the old Primary, upload card photos). **State on 2026-10-20:** all five stories and the epic are backlog. `features/insurance` holds only the F6-1 `InsuranceSection` placeholder. `lib/api/insurance.ts` has path builders and constants and no loader. `allowlist/insurance.ts` has the two card uploads and `GET v2/type/key/Insurance`. The insurance errors, messages and e2e fixtures are empty or default-only.

## Stories

- Story 5.1: View policies and card images
- Story 5.2: Add and edit a policy
- Story 5.3: Card image upload with retry
- Story 5.4: Primary per type with demote offer
- Story 5.5: Delete a policy

## Requirements & Constraints

- **Read (5.1):**
  - One read: `GET v2/health/patient/insurance?page=0&size=100` under `keys.insurance()`. The wire is a Spring `PageImpl` (`{ content: ResponseInsuranceDTO[], last, … }`), not a bare array. The Team A defaults return `[]` today (`test/page-handlers/profile.ts` and `mockInsurance` in `e2e/fixtures/insurance.ts`), so fix both in 5.1.
  - A 403 is the Section-level owner `insurance` (`forbiddenScopeFor`). The load error is "Couldn't load insurance · Retry", and Retry revalidates only `keys.insurance()`.
  - The Section is guard-only (`saveAll:false, draftFields:[]`). It is never in Save all, never in the dirty count, and never drafted. Nothing from the editor goes to `localStorage`.
  - The tab has no Section index or Jump to. Cards use the full width.
- **Card mapping:**
  - Status is the DTO's `label` (`"Active"` or `"Deleted"`). Deleted cards sort after active ones; otherwise keep the platform order.
  - The count counts only non-Deleted policies.
  - The title is "{Type} Insurance" (Medical, Dental, Hospice, Vision, Drug).
  - The precedence chip: Primary uses the filled `primary` chip, and the other values use the `label` chip. A Deleted card gets the `deleted` chip, muted text, no kebab and no thumbnail action.
  - The key/value grid shows Insurer, Subscriber, Member ID, Effective, Group ID, Expiration and Cancellation. Dates show as `MM/DD/YYYY`, and an empty value reads "Not provided".
  - Subscriber is `subscriber.firstName + lastName`, or the user's own name when the relationship is Self.
- **Backend sentinels:**
  - The backend stores a missing Expiration or Cancellation date as **`1970-01-01`**, and a missing Group ID as `"n/a"`.
  - `isNotProvided` handles `"n/a"` but not the date, so the read must show `1970-01-01` as "Not provided", and the editor must load it as empty. Otherwise the date-order rules fail on Edit.
- **Card images (5.1, FR31):**
  - A thumbnail is `<img src="/api/1h/v2/health/insurance/{id}/file/{fileId}/download?fileRelKey=InsuranceHas{Front|Back}SideCardFile">`. The ids come from `frontSideCardFile.id` / `backSideCardFile.id` (`PublicFileDTO`). The list carries only the **newest** file of each side.
  - Add the download entry with `asImage: true`, `preview=true` forced server-side, and `fileRelKey` as the only client query (the two values). The backend ignores `preview`; F2's sniffing sets the headers.
  - A missing side, or an image that fails to load, shows a dashed placeholder "Image not uploaded".
- **Editor (5.2):**
  - Required: Insurer, Type, Precedence, Relationship, Member ID and Effective date.
  - Member ID needs ≥ 3 characters, and so does Group ID when it is filled in. The backend also caps both at **32** characters.
  - Expiration and Cancellation must be after Effective, and Cancellation must be before Expiration.
  - When Relationship ≠ Self:
    - the subscriber's first name, last name, email, phone and birth date are required;
    - the subscriber's age must be 18–120;
    - the email must not equal the user's own login email (case-insensitive; the backend doesn't check this).
  - Options come from `keys.typeKey("Insurance")` attributes (RC10), shown in title case. If they fail to load, the editor shows an inline error with Retry and blocks Save.
  - DTO:
    - uppercase enums: `insuranceType` MEDICAL|DENTAL|HOSPICE|VISION|DRUG (DRUG is real even though the Swagger doc omits it), `insurancePrecedence`, `relationshipToInsured` SELF|SPOUSE|PARENT|CHILD|DEPENDENT;
    - `planEffectiveDate`, `expirationDate`, `cancellationDate` as `YYYY-MM-DD`;
    - `memberIdNumber`, `insuranceGroupId`;
    - `insuranceOrganizationDTO`: `{insuranceCompanyId}` for a listed insurer, or `{insuranceCompanyName}` only for "Add “{name}”" (the backend reuses a same-named insurer or creates one);
    - `subscriber` (`firstName`, `lastName`, `email`, `phoneNumber`, `phoneNumberRegion`, `birthDate`), sent only when Relationship ≠ Self.
  - POST and PUT each validate the **full** DTO, so every PUT sends every field.
- **Subscriber side effect:** a subscriber email that matches no existing person makes the backend **invite a new 1health user**, which sends an invite email. An email that matches an existing person links that person.
- **Card upload (5.3):**
  - User-facing limits: PNG or JPEG, checked by MIME type and leading bytes; at most 10 MB; at most 6000×4000 in either orientation. SVG is rejected.
  - The file is re-encoded to a JPEG of at most 4 MB (RC11) before upload.
  - Order: the policy saves, then the front image, then the back. An upload failure never fails the save.
  - The re-encoded image is kept only in memory, keyed by policy id + side, for "Retry upload". If it is gone, Retry reopens the picker.
  - The upload id comes only from the policy just saved or from the user's own `keys.insurance()` list. The backend has no ownership check on uploads.
- **Primary per type (5.4):**
  - The banner appears when another non-Deleted policy of the same type is Primary. Legacy data can have more than one; name and demote all of them.
  - Save is blocked until the demotion is accepted. Changing Type or Precedence clears the acceptance.
  - **The backend enforces one Primary per type**: `"You can not have multiple insurance records from same type with precedence field set to Primary."`, on POST, and on a PUT that makes a policy Primary or changes its type. See open decision 1.
- **Delete (5.5):**
  - `DELETE v2/health/insurance/{id}`. The backend either labels the policy Deleted or only unlinks the user (the card disappears). The UI follows the refetch.
  - A missing policy answers **400** `"Insurance with id: {id} not found."`, and an already-deleted one `"Insurance with Id: {id} is already deleted."`, never 404 (open decision 3).
  - Any in-memory pending image for the policy is dropped.
- **Mapped upstream messages** (anchored rules in `errors/insurance.ts`, field = Member ID where it applies):
  - on POST, `^Patient with ID \{\d+\} already has an existing insurance record associated with Insurance Company ID \{\d+\} and Policy Number \{.*\}$`
  - on PUT, `^Unable to update insurance\. There is already an existing insurance record associated with Insurance Company ID \{\d+\} and Policy Number \{.*\}$`
  - the Primary rule above
  - the subscriber rules (`Please provide subscriber's …`, `… is not valid email.`)
- **Quality bar:**
  - WCAG 2.1 AA, 44 px targets, `focus-ring`, reduced motion.
  - 360 px with no horizontal scroll. axe in light and dark.
  - Semantic tokens only; the drawer uses the `scrim` token.
  - Copy is verbatim from EXPERIENCE Voice and Tone, or marked `// DRAFT COPY`. The Add/Edit titles, the validation lines, the upload errors, "Insurance saved. Back image not uploaded." and the delete toasts are draft.

## Technical Decisions

**Rules for a Team A story PR** (FOUNDATION §1 T1–T8, R1–R11):

- **Edit only these files:**
  - `features/insurance/**` (keep the `InsuranceSection` export and render `SectionLandmark id="insurance"` from the first render)
  - `lib/api/insurance.ts` + test
  - `lib/server/proxy/allowlist/insurance.ts` + test
  - `lib/api/errors/insurance.ts` (extend `Field`)
  - `lib/shared/messages/insurance.ts`
  - `test/page-handlers/profile.ts`
  - `e2e/fixtures/insurance.ts` and `defaults-profile.ts`
  - `e2e/profile-*`
  - `app/page.test.tsx`
- **Never edit** `features/shell/**`, `components/ui/*` (except adding a new file), `lib/api/{index,keys,type-keys}.ts` or `allowlist/index.ts`.
- **Names:** use the `insurance`/`insurer` prefix for exports (T6). Grep the catalog before adding copy (T5). `COMMON_MESSAGES` already has `replace`, `remove`, `delete`, `close`, `back`, `moreActionsFor` and `primary`; `COMBOBOX_MESSAGES` has `addOption` and `insurerHelp`.
- **Features can't import each other:** `features/header/picture-file.ts` is off-limits. Write insurance card-file rules in `features/insurance` on top of `components/ui/image-reencode.ts` (`reencodeImage`, `canDecodeImage`).

**Built pieces to use, per story** (APIs in FOUNDATION §3–§5):

- **5.1:**
  - `keys.insurance()` (register the loader with `registerFetcher("insurance", …)` in `lib/api/insurance.ts`) and `insuranceListPath()`
  - `StateFrame` (`skeleton`, `loadError {kind:"section", sectionId:"insurance"}`, `attempt`, `useSectionFrame("insurance").onReady`)
  - `SectionHeader`, `KeyValueTable` (two pairs per row), `Chip` (`primary`/`label`/`deleted`), `RowActions` kebab, `EmptyState card`
  - `Dialog fullScreenOnMobile` for the viewer, `lib/shared/dates.ts`, `isNotProvided`
- **5.2:**
  - `Sheet` (right, 480 px, full screen with Back below 768 px, `dismissible={false}` while saving, `initialFocus`)
  - every close path calls the scoped `requestLeave({ scope: "insurance" })`
  - guard-only `useRegisterSection` (`validate`/`save`/`discard`, `canSave: true`). `useSectionForm` focuses the `h2` on success, but the drawer must return focus to its trigger, so registering directly is expected.
  - the insurer `Combobox` (`pageSize={INSURER_PAGE_SIZE}`, `allowAdd`, `defaultSelection` on Edit, `inputRef`; loads through `load`, never SWR)
  - `DateInput calendar` + `birthDateBounds`, `Select placeholder`, `PhoneInput` + `phoneIssue`/`toE164`
  - `FormField`/`FieldError`, `InlineBanner`, `Button busy`, `toastSuccess("Insurance saved.")`, `telemetry.track("section_save", …)`, `mapApiError("insurance", …)`
- **5.3:**
  - the upload entries (built, F2) and `insuranceCardUploadPath()`, `INSURANCE_CARD_RELATIONS`
  - `isUploadRejected` + `COMMON_MESSAGES.uploadRejected`, `toastError(text, { onRetry })`
  - `fileDeletePath(id)` (the named op `DELETE /api/pp/file/{id}`; no allowlist entry)
- **5.4:** `InlineBanner variant="info"` with the outline Button as `action`, and `runSaveSteps(steps, { scope: "insurance", mode: "stop" })`.
- **5.5:** `ConfirmDialog` (`variant:"destructive"`, `busyLabel`), the `RowActions` destructive item, `COMMON_MESSAGES.delete`.

**Entries to add in `allowlist/insurance.ts`, each with tests:**

- `GET v2/health/patient/insurance` (fixed `page=0&size=100`)
- `GET v2/health/insurance/organizations` (`name`, `page`, `size`)
- `POST v2/health/patient/insurance` and `PUT v2/health/patient/insurance/{id}`, with a strict zod JSON body
- `DELETE v2/health/insurance/{id}`
- the card download (`asImage`)

**D-A save safeguard (already in `callApi`):** every non-GET call re-reads `myself` first. Unit tests must let `myself` load before a write.

**Stale AC text** (the ACs are frozen; read them as follows):

- `lib/shared/messages.ts` means `messages/insurance.ts`, and `lib/api/errors.ts` means `errors/insurance.ts`.
- `lib/shared/image-reencode.ts` means `components/ui/image-reencode.ts`.
- "`DELETE /api/1h/v2/file/{oldId}`" means `fileDeletePath(oldId)`. The proxy denies `DELETE v2/file/**`.
- "Replace the placeholder in `insurance-panel.tsx`" means: fill the `InsuranceSection` stub.
- The card upload entries and the type-key entry already exist (5.3 adds only its tests and the client side).
- 5.4's "the backend does not enforce one Primary per type" is wrong; see open decision 1.
- 5.5's "a 404 is treated as already removed": the backend answers 400; see open decision 3.

**Open decisions for the story specs:**

1. **Demotion order (5.4, also AD-7):**
   - The AC sends the policy first, then the demotion PUT. The backend rejects a second Primary of a type, so with that order the policy save fails every time.
   - The F3-2 foundation note on 5.4 already says demote-then-save (the save is skipped if the demote fails). Adopt demotion → policy → images.
   - Decide in 5.4 what happens when the demotion succeeds and the policy save then fails (the old policy is left Secondary): revert it with a compensating PUT, or keep it and say so in the editor error.
   - Map the Primary-rule message either way.
2. **Replace-then-delete of a card image (5.3):**
   - An upload adds a new relation, and the list returns only the newest file of each side. After a replacement, the old file id is no longer in the list, and the file-delete named op proves card ownership only from that list. So it would answer 404 `NO_FILE` and nothing gets deleted.
   - Options:
     - a foundation PR that teaches `cardIds` to read every card relation (like Signature's `signatureRelationIds`);
     - delete before upload (that inverts AD-13);
     - skip the delete and accept the orphan.
   - Whichever you choose, a failed delete never fails the save.
3. **Delete outcomes (5.5):**
   - The backend never answers 404. Decide whether "Insurance with id: … not found." and "… is already deleted." (anchored rules) count as already removed (refetch, no error toast) or show the error toast.
4. **Upload id ownership (5.3, deferred-work):** the backend doesn't check that the user owns the policy id. Accept the gap (ids only from the saved policy or the user's own list) or propose a named op. Record the choice in deferred-work.
5. **Sentinel dates:** confirm on demo that a missing Expiration or Cancellation comes back as `1970-01-01`. Keep the check insurance-local. Extending `isNotProvided` would be a foundation PR.
6. **Length caps:** the backend also caps Member ID and Group ID at 32 characters and subscriber names at the patient name limits. Decide whether the schema adds the max-length rules (draft copy) or relies on the mapped errors.
7. **Subscriber invite:** a new subscriber email triggers a 1health invite. Confirm with the PM that this is acceptable, or whether the subscriber copy should mention it.
8. **Draft copy:** the editor titles, validation lines, upload rejections, partial-upload toast and delete toasts need PM review before go-live.

## UX & Interaction Patterns

- **Cards:**
  - Flat bordered `rounded-md` cards with no shadow, in a single column at every width, 16 px apart.
  - The title row is at least 52 px tall, with a bottom hairline. The kebab is 44×44 and named "More actions for {Insurer} {Type} Insurance"; it holds Edit and Delete ("Delete" in `error-strong`).
  - The 120×76 thumbnails sit behind a left hairline and move below the grid under 768 px.
  - Skeleton cards while loading (static under reduced motion).
  - Empty state: a dashed card reading "No insurance on file. Add a policy before your next visit." with a primary "Add insurance".
- **Viewer:**
  - A Dialog `rounded-lg` with the image fit to the viewport, a Front/Back segmented toggle (a missing side is disabled) and Close. Full screen on mobile.
  - Escape or Close returns focus to the thumbnail.
- **Editor:**
  - Desktop: a right drawer with a sticky header (title + close) and a sticky footer (Cancel + Save). Mobile: a full-screen page with Back, paired fields stacked, and Cancel/Save pinned to the bottom.
  - Field order: Insurer → Type + Precedence → demotion banner → Relationship → Member ID + Group ID → Effective + Expiration → Cancellation → Subscriber group (top hairline, heading "Subscriber") → Card images.
  - Optional fields are labelled "(optional)". Required fields carry no marker.
  - Saving shows "Saving…", makes inputs read-only and disables Cancel.
  - Success: the drawer closes, "Insurance saved." shows, and focus returns to the trigger ("Add insurance" or the card's kebab).
  - A dirty close (Close, Cancel, Escape, scrim, Back, tab switch or app-bar page switch) opens the leave guard (Keep editing / Discard / Save). With no changes, the drawer closes at once.
  - One modal level: a confirm may open over the drawer, and nothing opens over a dialog.
- **Card slots:** an empty slot is a dashed 120:76 tile with "No image chosen" and "Choose front/back image". A chosen file shows a preview with "{name} · {size}" and Replace/Remove. A saved image shows its thumbnail with Replace. A failed upload leaves "Image not uploaded" with a `link-text` "Retry upload" on the card.
- **Demotion banner:** an info banner reading "Only one primary {Type} policy. Make {insurer} secondary?" with an outline button (`aria-pressed` once accepted) and the note "The change saves with this policy.". Save without acceptance moves focus to that button and shows an error line under the banner.
- **Delete confirm:** title "Delete this insurance policy?", body "{Insurer} {Type} Insurance will be removed from your profile.", and Cancel / "Delete policy" (`destructive-fill`). Focus starts on Cancel. While deleting, the dialog can't be dismissed. On success, focus goes to the next card's kebab, or to "Add insurance" when no cards remain. On failure, an error toast with Retry stays until dismissed.

## Cross-Story Dependencies

- **Inside the epic:**
  - 5.1 builds the loader, the read entries, the card and the viewer, and the others build on it.
  - 5.2 builds the editor, the schema, the DTO and the guard registration. Its `save()` is the fixed pipeline that 5.4 (demotion, inserted per open decision 1) and 5.3 (images, last) extend.
  - 5.5 needs only 5.1 (the kebab), plus 5.3's in-memory store for dropping pending images.
  - All five share `features/insurance` and the insurance area files, so expect them to land one after another.
- **Epic 1:**
  - The scoped leave guard (1.13), Save all (1.14: insurance only as a guard-only participant, saved after the Save-all Sections) and the D-A safeguard apply.
  - The image re-encode (1.10) and the file-delete named op (F7-2) are reused.
- **Foundation:** open decision 2 may need a foundation PR to the file-delete named op, merged before 5.3's replace path.
- **Epic 4:** no dependency. It is in an open PR, so if both touch `test/page-handlers/profile.ts` or `e2e/fixtures/defaults-profile.ts`, rebase.
- **Dates:** feature freeze 2026-10-22, demo QA of UJ-1 to UJ-5 (UJ-2 = insurance) by 2026-10-24, go-live 2026-10-29.
