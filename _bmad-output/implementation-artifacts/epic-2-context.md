# Epic 2 Context: Identity — Personal Information, SSN and Signature

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->
<!-- Compiled 2026-10-16 on feat/NG-9022-epic-2 (after Stories 1.9, 1.10, 1.14 and foundation PRs #4–#8). Sources: epics.md (Epic 2, D1–D18, "Foundation F6 and path corrections", per-story Foundation lines), docs/FOUNDATION.md, epic-1-context.md, spec-ng-9027-foundation-tests-safeguard.md, deferred-work.md, sprint-status.yaml, the current code. -->

**Read `docs/FOUNDATION.md` before writing any code.** This file doesn't repeat it. It lists the pieces Epic 2 uses, the rules a Team A story PR must follow and the open points. Where this file and FOUNDATION or the code disagree, FOUNDATION and the code win.

## Goal

Epic 2 (Jira NG-9022) delivers the Personal information Section on the Contacts tab of `/`. Users and providers can check and correct their legal identity and demographics, briefly reveal their own SSN without it ever being stored on the client, and draw or upload their Signature, which documents they sign will carry. It is the first real Section on `/`. It is first in `SAVE_ORDER`, and the `#signature` deep link (UJ-3) points into it. **State on 2026-10-16:** all four stories are backlog. Every Epic 1 dependency has landed: the shell, drafts, Save all (1.14), `components/ui/image-reencode.ts` (1.10), the ownership-checked file-delete named op and the D-A save safeguard (PR #7).

## Stories

- Story 2.1: View Personal Information
- Story 2.2: Edit and save Personal Information
- Story 2.3: SSN entry and Reveal
- Story 2.4: Signature

They run in order. All four fill the same `features/personal` Section, and each builds on the one before.

## Requirements & Constraints

- **Read view (2.1):**
  - Data comes only from `useMyself()` (`keys.myself()`). Don't call GraphQL or `v2/person/{id}`.
  - Fields appear in one fixed order, with no group headings and no email or phone: Name prefix · First · Middle · Last · Name suffix · Other names · Titles · Birth date · City of birth · Race · Ethnicity · Biological gender · Gender identity · Sexual orientation · SSN · Signature.
  - Empty values (null, blank, `n/a`, `[]`, `-1`) read "Not provided".
  - Birth date shows as `MM/DD/YYYY` with no timezone shift. Array values are joined with ", ".
  - SSN shows the mask only. Signature shows a 112×32 thumbnail, or "Not provided" when there is none or the image fails to load.
  - While loading: a skeleton. On failure: "Couldn't load personal information · Retry". Retry revalidates only `myself`.
  - The count column in the Section index stays blank.
- **Option lists:**
  - Race, Ethnicity and Biological gender come from `GET v2/type/key/Person` (VALUE_LIST, `n/a` dropped, sorted by locale).
  - If that request fails, use the fallback lists in a new `lib/shared/person-options.ts`: Race and Ethnicity from addendum §C, and Biological gender = "Asked but not answered" plus the user's current value.
  - Gender identity is a fixed list: Asked but not answered / Female / Male / Other, plus free text.
  - A failed option list never blocks or errors the read view.
- **Edit and validation (2.2):**
  - Required: First and Last name (1–24 chars after trim), Birth date, Race, Ethnicity, Biological gender and Gender identity.
  - Birth date: age 18–120, or 21–120 when `roles` include Proctor. Help text explains the rule before any error appears.
  - Name fields accept printable characters only. Sexual orientation and City of birth allow ≤ 128 chars.
  - An unset value preselects "Unknown" / "Unknown" / "Asked but not answered" / "Asked but not answered". These preselects count as changes and are sent on Save.
  - Validation runs on blur and on Save. On Save, focus moves to the first invalid field.
  - Enter never submits, and Escape never cancels.
- **Save (2.2–2.4):**
  - Send only the changed fields, keeping array vs string per field.
  - A cleared optional field is sent as `"n/a"`. With no changes, nothing is sent and the Section returns to read view with no toast.
  - The body never contains `email`, `phoneNumber` or `phoneNumberRegion` (AD-9), and a unit test asserts this.
  - On success:
    - mutate `myself`, so the header name updates;
    - return to read view and show "Personal information saved.";
    - move focus to the `h2` and clear the draft.
  - The save also turns a stored `/account` draft of names or birth date into a conflict (AD-12, `baseHash`).
  - Errors:
    - A field code shows under its field.
    - `INVALID_ENUM_VALUE` or an unknown code shows a Section-level error with Retry.
    - Network or 5xx shows "Couldn't save personal information. Check your connection." Retry resends the same diff.
- **Registration:**
  - `{ id: "personal", label: "Personal information", displayOrder: 1 }`.
  - `draftFields` is exactly the 14 demographic fields: never SSN, never Signature. A test asserts that no `pp:draft:v1:*:personal` value holds either.
- **SSN (2.3):**
  - Reveal calls `GET /api/1h/v2/person/me/ssn/expose` through `callApi`, bypassing SWR.
  - The full value lives only in the SSN component's React state. It never goes to SWR, storage, the URL, a draft, form defaults, telemetry or the console. Tests assert this after a reveal.
  - Auto-hide triggers:
    - 30 s pass, or the user presses Hide;
    - the window blurs, the page is hidden or `pagehide` fires;
    - the Section saves or cancels, or the component unmounts;
    - `session-expired` is published.
  - Each trigger is covered by a fake-timer test.
  - Input: auto-format `XXX-XX-XXXX`, at most 9 digits. Typing over the mask replaces it.
  - Valid values: the untouched mask, a complete SSN, or empty.
  - Diff: send a changed value as `XXX-XX-XXXX` and a cleared one as `"n/a"`. Never send the mask or an unchanged revealed value.
  - "SSN taken" sets the SSN field error and moves focus to it.
- **Signature (2.4):**
  - Uploaded images: PNG or JPEG only, checked by MIME and leading bytes.
  - Every uploaded Signature, drawn or uploaded, is re-encoded to a PNG of at most 1 MB.
  - Save order: the `PUT v2/user/edit` (only if other fields changed), then the Signature step. The Signature step is one of:
    - upload, when there is no saved Signature;
    - `version`, when a saved Signature is replaced;
    - delete, when a saved Signature is cleared, after "Remove your signature?".
  - Cancel in that confirm resolves `CANCELLED`.
  - If the PUT succeeds and the Signature step fails: refetch and rebase. Show "Couldn't save your signature. Try again." Retry sends only the Signature step.
  - Signature data is never drafted. After a draft restore, the pad shows the saved Signature.
- **Proxy:**
  - Each story adds its own entries in `allowlist/personal.ts`, with tests.
  - 2.3 adds `GET v2/person/{personId}/ssn/expose`:
    - only `me` is accepted, so a numeric id → 403 `NOT_ALLOWED`;
    - any query → 400;
    - a test asserts the response is no-store.
  - Logs hold only method, template, status, duration and request id.
- **Quality bar:**
  - WCAG 2.1 AA, 44 px targets, `focus-ring`, reduced motion (no shimmer, no countdown sweep, no smooth scroll).
  - 360 px with no horizontal scroll.
  - axe in light and dark.
  - Semantic tokens only.
  - Copy is verbatim from Voice and Tone or the approved mock, or marked `// DRAFT COPY`.

## Technical Decisions

**Rules for a Team A story PR** (FOUNDATION §1 T1–T8, R1–R11; the same as Epic 1):

- **Edit only these files:**
  - `features/personal/**`
  - `lib/api/personal.ts` and its test
  - `lib/server/proxy/allowlist/personal.ts` and `.test.ts`
  - `lib/api/errors/personal.ts`
  - `lib/shared/messages/person.ts` (new keys only: its shared PA4 keys are foundation, and Team B reads them)
  - `test/page-handlers/profile.ts`
  - `e2e/fixtures/personal.ts` (currently empty) and `defaults-profile.ts`
  - `e2e/profile-*`
  - `app/page.test.tsx` (shell-level asserts only)
- **New files allowed:** `lib/shared/person-options.ts` (planned for 2.1 in FOUNDATION §3.3) and any brand-new `components/ui/*` file.
- **Never edit:** `features/shell/**`, `features/header/**` (a feature can't import another feature, so write the Signature PNG/JPEG check in `features/personal` rather than reusing `features/header/picture-file.ts`), `lib/api/index.ts`, `allowlist/index.ts`, `user-edit-path.internal.ts` (import it), `test/**` or `e2e/fixtures/{core,index}.ts`.
- **Copy:** grep the whole catalog before adding a string. `FIELD_MESSAGES` already holds `firstName`, `middleName`, `lastName` and `birthDate`. `SHELL_MESSAGES` already holds `sectionPersonal`, `signature` and `signatureAlt`. `COMMON_MESSAGES` already holds `clear` and `notProvided`.
- **Tests:**
  - Sections render with `renderInPage(ui, { page: "profile" })`.
  - A new read adds its default to `profileReadHandlers` and `defaults-profile.ts` in the same change.
  - `myselfWire()` and `ANN` are frozen: override them per test.

**Built pieces to use, per story** (FOUNDATION §3–§5 has the APIs):

- **2.1:**
  - the `PersonalSection` stub. Keep its export and render `SectionLandmark id="personal"` from the first render.
  - `KeyValueTable`, giving the Signature row `rowId: SIGNATURE_ANCHOR`
  - `StateFrame` with `skeleton="kv"`, `loadError {kind:"section", sectionId:"personal"}`, `attempt`, `anchors` and `onReady={useSectionFrame("personal").onReady}`
  - `useClaimMyselfError(Boolean(error))`
  - `SignatureThumb({ fileId: myself.signature?.id, fallback })`
  - `wireToDisplayDate`, `isNotProvided`, `mono-value`
  - `useSWR(keys.typeKey(PERSON_TYPE_KEY))` + `valueListOptions(info, attr)` for the option lists. This replaces the AC's `fetchPersonTypeKeys()`, and its entry already exists.
- **2.2:**
  - `useSectionForm` (`onNoChanges:"close"`, `cancelFocus:"heading"`, `fieldOrder`, `errorFields`, `draftFields` + `describeDraftDiff` + `dataStatus`, `SectionContainer sectionId`) and `KeyValueEditTable`
  - controls: `DateInput` with `birthDateBounds(roles, today)` and `resetKey`, `Select` with `placeholder`, and the gender-identity `Combobox` (`staticOptions`, `mode:"free-text"`, `COMBOBOX_MESSAGES.genderIdentityHelp`)
  - rules and copy: `person-rules.ts` (`nameIssue`, `textIssue`, the length constants) and `PERSON_MESSAGES`
  - save: `PersonalInformationPayload`, `userEditPath()`, `mapApiError("personal", …)`, `mutateMyself()`
  - The `PUT v2/user/edit` entry and its full `userEditBodySchema` are built.
- **2.3:**
  - the SSN-taken rule (`field:"ssn"`, `person.ssnTaken`)
  - the SSN pattern on `user/edit`
  - `ssnExposePath()`
  - `useCountdown` (30 s), `useAnnounce`/`LiveStatus`
  - the SSN draft denylist
- **2.4:**
  - the Signature upload entries in `allowlist/personal.ts`: upload, part `file`, `isPublic=false` forced; and `version`, part `fileNewVersion`, `current=true` forced. Both accept PNG only, 1 MB.
  - `reencodeImage(file, { format:"png", maxBytes, maxDims })` from `components/ui/image-reencode.ts`, which returns `{ok:false, reason:"UNDECODABLE"|"TOO_LARGE"}` on failure
  - `fileDeletePath(id)` for removal
  - `runSaveSteps(..., { scope:"personal", mode:"stop", refetch, rebase })`
  - `confirmBeforeSave` + `ConfirmDialog variant="destructive"` + `CANCELLED_CODE`
  - `SignatureThumb`
  - `signature_pad` 5.1.4, already in `package.json`
  - `uploadProfilePicture` in `lib/api/profile-picture.ts` is the pattern to copy for a `FormData` upload.

**Stale AC text** (the ACs are frozen; read them as follows):

- `lib/shared/messages.ts` means `messages/person.ts`, and `lib/api/errors.ts` means `errors/personal.ts`.
- `lib/shared/image-reencode.ts` means `components/ui/image-reencode.ts`.
- `DELETE /api/1h/v2/file/{id}` with a forced `hardDelete`: the proxy now denies `DELETE v2/file/**`. Delete through the ownership-checked named op `DELETE /api/pp/file/{fileId}` instead. Drop the `?hardDelete=false` proxy-test AC. The client-URL test still asserts no `isPublic`, `current` or `hardDelete`.
- "Replace the placeholder in `contacts-panel.tsx`" means: fill the `PersonalSection` stub.
- The `download` `asImage` entry (with `preview=true` forced) is built and lives in `allowlist/files.ts`.

**D-A save safeguard (already in `callApi`):**

- Every non-GET call to `/api/1h/*` or `/api/pp/*` first re-reads `myself`. That covers the PUT, the Signature uploads and the delete.
- On another user id, nothing is sent and the page ends through `session-expired`. With no pinned page user, the write is blocked as a network failure.
- SSN Reveal is a GET, so the safeguard doesn't check it.
- The stories add nothing for this. Unit tests must let `myself` load before a write.

**Open decisions for the story specs:**

1. **Type-key values vs the `user/edit` enums** (`deferred-work.md`): a platform value missing from `RACES` / `ETHNICITIES` / `BIOLOGICAL_GENDERS` would show in the picker, then fail with 400. Decide in 2.1/2.2: intersect the lists in the UI, or widen the schema. Widening it touches Team B's consumer contract `allowlist/user-edit.account.test.ts`, so agree it with them first.
2. **Signature-version id ownership:** the backend doesn't check it. Take the id only from `myself.signature.id`, never from input or the URL. Accept this, or propose a named op.
3. **"Added {date}":** `Myself.signature` is only `{id, name}`, so no file date is available today. The AC omits the meta without a date. The UJ-3 Playwright step "thumbnail with Added {today}" depends on finding a date source.
4. **Hard delete may leave private S3 objects:** a backend follow-up, recorded in `deferred-work.md`.
5. **Radix Select axe:** while a Select is open, scan only the listbox (known library issue).

## UX & Interaction Patterns

- **Read view:**
  - From 768 px: four columns (key ~16 % | value ~34 % ×2, with a vertical hairline), filled row by row, no row hover. Keys use `kv-key`, values `kv-value`, empty values `kv-value-empty`.
  - Below 768 px: one Field | Value pair per row (key 44 %).
  - The header has the `h2` "Personal information" and an outline "Edit" button.
- **Edit view:**
  - The whole Section switches in place. The container gets the primary border and a 3 px halo, the header shows "Editing", and focus moves to Name prefix.
  - From 768 px: a 240 px key column, with controls ≤ 480 px and help or error text below.
  - Below 768 px: the label sits above a full-width control.
  - Optional fields get a muted "(optional)" suffix. Required fields are unmarked.
  - Help text: Other names "Former or other legal names.", Gender identity "Choose from the list or type your own.", Sexual orientation "Up to 128 characters.", Birth date shows the age rule.
  - Footer: "Unsaved changes" (8 px warning dot, polite), Cancel, Save. Saving shows "Saving…", makes inputs read-only and disables Cancel; other Sections stay usable.
- **SSN:**
  - The mask uses `mono-value`. "Reveal" is a link-text button with an eye icon, underlined, 44 px, named "Reveal SSN".
  - When revealed: a 16 px countdown ring (or the text "Hides in 30 s" under reduced motion) and a "Hide" button, which takes focus.
  - The polite announcement reads "Social Security number shown, hides in 30 seconds". After it hides, focus returns to Reveal.
  - Edit help: masked "Type a new number to replace it."; revealed "Format XXX-XX-XXXX. Hides in 30 s. Clear it to remove your SSN." An auto-hide skips a value the user has edited.
  - A failed Reveal shows the inline error "Couldn't show your SSN. Try again." (draft copy).
- **Signature pad:**
  - Width up to 480 px, 160 px tall, surface background, `control-border`, a baseline rule, `--foreground` ink.
  - `touch-action: none` on the canvas only. It is sized for `devicePixelRatio` and survives resize and rotation.
  - The cue reads "Draw your signature". Clear and "Upload image instead" are 44 px ghost buttons.
  - The help line ends with "Saved {date}." only when a date exists.
  - A visually hidden instruction points keyboard users to Upload.
  - In edit view the saved image loads into the pad, and the Section stays clean until the user draws, clears or uploads.
- **Remove confirm:** "Remove your signature?" / "Documents you sign will no longer carry it." Cancel has initial focus; "Remove signature" uses `destructive-fill`.
- **Deep link `?tab=contacts#signature`:** scrolls to the row and re-scrolls once after the data loads (already handled by `useHashAnchors` + `onReady`). Smooth scrolling is off under reduced motion.

## Cross-Story Dependencies

- **Inside the epic:**
  - 2.2 extends 2.1's Section.
  - 2.3 adds the SSN to 2.2's diff, input and Reveal.
  - 2.4 adds the Signature step after 2.2's PUT, through `runSaveSteps`.
  - They share the same files, so expect them to land one after another.
- **Epic 1:**
  - the 1.9 header refreshes through `mutateMyself()`
  - the 1.14 Save all saves `personal` first
  - 1.10's `reencodeImage`
  - the D-A safeguard
  - drafts (1.15)
- **Epic 7 (Team B):**
  - It shares `person-rules.ts`, `PERSON_MESSAGES`, `FIELD_MESSAGES` and the `PUT v2/user/edit` entry.
  - 7.5's draft `baseHash` reacts to Personal-information saves.
  - 7.6 type-tests that `PersonalInformationPayload` never gains `email`, `phoneNumber` or `phoneNumberRegion`. Only `updateAccount()` builds those.
- **Epic 9:**
  - 9.3 reuses `SignatureThumb`.
  - Its "?" tooltip links to `/?tab=contacts#signature` (D-UX7), so the anchor must stay stable.
- **Dates:** feature freeze 2026-10-22, demo QA of UJ-1 to UJ-5 (UJ-3 = Signature) by 2026-10-24, go-live 2026-10-29.
