# Epic 3 Context: Contact methods — Phone, Email and Social Media

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->
<!-- Compiled 2026-10-16 on feat/NG-9023-epic-3 (= main after Epic 2, PR #12 5a7fd02). Sources: epics.md (Epic 3, D1–D18, "Foundation F6 and path corrections", per-story Foundation lines), docs/FOUNDATION.md, epic-2-context.md, deferred-work.md, sprint-status.yaml, the current code, 1h-ng-bo-core-be (ContactPointResource, ContactPointServiceImpl, Helper.validateURL). -->

**Read `docs/FOUNDATION.md` before writing any code.** This file doesn't repeat it. It lists the pieces Epic 3 uses, the rules a Team A story PR must follow and the open points. Where this file and FOUNDATION or the code disagree, FOUNDATION and the code win.

## Goal

Epic 3 (Jira NG-9023 for 3.1–3.4, NG-9024 for 3.5–3.6, NG-9025 for 3.7) fills the Phone, Email and Social media Sections on the Contacts tab of `/`. Users can keep every way to reach them current, verify new mobiles and emails, safely switch the primary contact they sign in with, and manage social links. All three Sections share one Contact Point engine. It builds the save DTO, finds new unverified rows and holds the label list. This epic carries UJ-1 (Maria switches to a new phone number: add, auto-verify, verify, make primary, relabel the old one). **State on 2026-10-16:** all seven stories and the epic are backlog. Epic 2 is done. The three Sections are still the F6-1 stubs in `features/contacts`, and `lib/api/contacts.ts` is an empty stub (Story 3.1 then filled the engine, `lib/shared/contact-labels.ts` and the Phone read view).

## Stories

- Story 3.1: Contact Point engine and Phone read view
- Story 3.2: Add, relabel and remove phones
- Story 3.3: Verify phones
- Story 3.4: Make a phone primary and manage notifications
- Story 3.5: View, add, relabel and remove emails
- Story 3.6: Verify emails, make an email primary and manage notifications
- Story 3.7: Manage social media links

## Requirements & Constraints

- **Reads (3.1, 3.5, 3.7):**
  - Phone merges two reads, `keys.contactPoints("Mobile")` and `("Landline")`. Primary comes first, the rest keep the API order. Email reads `("Email")` and Social reads `("Social Media")`.
  - These keys are shared with the header and the `/account` pickers. After every write, call `mutateContactPoints(...types)` and `mutateMyself()`.
  - Each Section shows its own 3-row skeleton in the real table.
  - Load error: "Couldn't load phones / emails / social links · Retry". Retry revalidates only that Section's keys, and the other Sections keep working.
  - A 403 shows Section-level `NoAccess` (`forbiddenScopeFor`). `SESSION_EXPIRED` is left to the shell.
  - Empty rows read "No phones yet · Add phone", "No emails yet · Add email" and "No social links yet · Add link".
  - The saved count shows in the header and in the Section index.
- **Row display:**
  - Phone uses `formatPhoneDisplay(value, phoneNumberRegion)` behind a decorative flag (`aria-hidden`).
  - Label is a chip. The Primary row gets the filled primary chip.
  - Status shows "Verified" / "Not verified" as icon + word. A Home-labelled row shows an empty Status.
  - Notifications shows "On" / "Off" on the Primary row only. Every other row shows "—" (RC3).
  - The kebab is named "More actions for {formatted number | email | link}". Its menu never shows an item without a handler.
- **Engine (3.1, extended in 3.7):**
  - `contactPointsDiffToManageDTO(before, after)` (the AC's `diffToManageDTO`; T6 prefix, Story 3.1) sorts rows into three lists:
    - rows with no id go to `contactPointsToAdd`;
    - removed ids go to `contactPointsToRemove` as numbers;
    - rows whose label or notifications changed go to `contactPointsToUpdate`.
  - Unchanged rows aren't sent. An empty diff returns `null`, and nothing is sent.
  - Changing the value or type of a saved Phone or Email row throws a programmer error. Story 3.7 adds a replace option for Social only.
  - A Primary switch puts both rows in `contactPointsToUpdate`: the new one with `label "Primary"` and `isNotificationEnabled true`, the old one with `label "Old"`.
  - A DTO never holds two Primary rows of one type, and never a Primary in `contactPointsToAdd` (the backend rejects both).
  - `newUnverifiedContactPoints(before, after)` (the AC's `newUnverified`) returns the ids that are new and unverified, of type Mobile or Email, whose label isn't Home. It never returns Landline or Social rows.
  - `ContactPoint.id` is nullable on the wire, so a row without an id can't be updated or removed.
- **Contact labels:**
  - `lib/shared/contact-labels.ts` (new, Team A) is the only definition. Phone, Email and Social import it.
  - The list is `CONTACT_LABELS` = `Primary, Home, Main, Old, Personal, Mailing List, Work` (the AC's order; the backend enum order differs, Story 3.1 decision) intersected with the `GET v2/type/key/ContactPoint` label values, minus "Partnership Organization", in enum order.
  - `valueListOptions` sorts by locale, so `contactLabelsFrom` puts the result back in `CONTACT_LABELS` order. Story 3.2's picker is its first caller (`useSWR(keys.typeKey("ContactPoint"))`).
  - If the type key fails, use the enum (minus Partnership Organization).
- **Edit (3.2, 3.5, 3.7):**
  - The whole table switches to edit, with Add row / Cancel / Save in the `tfoot`. "Add phone/email/link" or the empty-state action opens edit with one new row focused. A kebab Edit focuses that row.
  - Registration: `phone` (displayOrder 2), `email` (3) and `social` (4), all through `useSectionForm`, with drafts.
  - Saved Phone and Email values and the Phone type are locked (`InputLocked`).
    - Phone help: "Saved numbers can't be changed. Remove it and add a new one."
    - Email help on the Primary row: "Locked. This is the address you sign in with."; on every other row: "Saved addresses can't be changed. Remove it and add a new one."
  - Label is a Select without "Primary". The Primary row's label is locked.
  - Social values stay editable.
- **Validation (blur and Save):** focus moves to the first invalid field, and nothing is sent while an error remains.
  - Phone:
    - US number: exactly 10 digits, else "Enter a 10-digit US number". Other regions: "Enter a valid phone number".
    - A duplicate, compared as E.164 against every row (saved, struck through or new): "This number is already on your profile".
    - "Choose a label" / "Choose Mobile or Landline" when empty.
  - Email:
    - zod email, trimmed.
    - A duplicate, compared case-insensitively: "This email is already on your profile".
  - Social:
    - Accepts an `https://` URL whose host contains a dot, or a handle `^@[A-Za-z0-9._]{1,30}$` (see open decision 1).
    - "Enter a link" when empty.
    - A duplicate, compared case-insensitively: "This link is already on your profile".
  - Enter never submits, and Escape never cancels.
- **Remove and limits:**
  - Remove strikes a saved row through ("Removed on save" + Restore). Nothing is sent until Save. A new row is deleted outright. Remove from the read view opens edit with the row already struck through.
  - The last phone or email can't be removed: aria-disabled with "You need at least one phone/email". Social may go to zero links.
  - The Primary row can't be removed: "Make another phone/email primary first".
  - Limit of 20 per Contact Type:
    - Phone: Add is disabled only when both Mobile and Landline are full. When one type is full, only that Type option is blocked.
    - Email and Social: "You've reached the limit of 20 emails/links".
- **Save:**
  - Exactly one `POST /api/1h/v2/health/contact-point`. A new phone is sent as E.164 with `phoneNumberRegion` (ISO). A new social link always has `type "Social Media"` and `label "Personal"`.
  - On success:
    - mutate the keys and `myself`, so the header and `/account` refresh;
    - return to read view and show "Phone saved." / "Email saved." / "Social media saved.";
    - move focus to the `h2`, clear the draft and resolve `{ok:true}`.
  - Errors:
    - A mapped code shows at the field, or at Section level when the row can't be identified.
    - An unknown code shows a generic Section error with Retry.
    - Network: "Couldn't save phone/email/social media. Check your connection." with Retry.
  - `save()` never throws.
- **Verify (3.3, 3.6):**
  - After its own successful save, the Section refetches and calls `verifyContactPoints(newUnverifiedContactPoints(...))` once, inside `save()`. A failed verify never fails the save, and the toast still shows.
  - A successfully sent row shows "Link sent · Resend in 60 s" (pending badge). It counts down, then shows "Not verified" with "Resend verification". "Link sent" is announced once.
  - Ids in `contactPointIdsWithSendError` (all ids if the call fails) show "Couldn't send the link" with Resend available at once.
  - Manual Verify / Resend is an inline action and a kebab item. It sends at once, with no confirm and no edit mode. During the countdown the kebab item is aria-disabled with "Link sent · Resend in {n} s". A network failure shows the toast "Couldn't send the link. Check your connection." with Retry.
  - No Verify on Verified, Landline, Home-labelled or Social rows.
  - A reload loses the countdown. Window-focus revalidation shows the new "Verified" without overwriting an open edit.
- **Make primary (3.4, 3.6):**
  - Phone eligibility: a Verified Mobile that isn't Primary. RC2 exception: when no phone is Verified and none is Primary, an unverified Mobile is eligible too.
  - Disabled reasons for phones: "Landlines can't be primary"; "Verify this number first" (with Verify beside it); "Change the label from Home, then verify this number".
  - Email: only a Verified email is eligible, with no exception. Reasons: "Verify this email first"; "Change the label from Home, then verify this email".
  - New rows never offer Primary. Make primary is never offered in edit mode.
  - It opens a standard `ConfirmDialog` with focus on Cancel. Title: "This changes how you sign in". Body: "{x} becomes your primary phone and sign-in number. Your current primary is relabeled Old." Drop the second sentence when there is no current Primary.
  - Confirm sends one POST with both rows.
  - On success the new Primary sorts first with Notifications On, the old row reads "Old", the toast shows, focus moves to the `h2`, and the header updates.
  - On failure the view stays unchanged and an error toast with Retry shows.
  - The phone footnote reads "Changing your primary phone changes how you sign in."
  - Email in use: "This email is used by another account. Choose a different one." (see open decision 3).
  - Notifications: in edit view the Primary row has a `Switch` named "Notifications for {x}". Toggling it sends only that row.
- **Social links (3.7):**
  - A value that passes `safeHref(value, ["https:"])` renders as a `link-text` anchor with `target="_blank"` and `rel="noopener noreferrer"`, not through `navigate()` (AD-5 exception). A component test asserts both attributes.
  - A rejected value renders as plain text. No `dangerouslySetInnerHTML`.
  - The kebab holds only Edit and Remove.
  - No verify call after save.
- **Save all:** `SAVE_ORDER` is personal → email → phone → social. Email's save, including its auto-verify, finishes before Phone starts. An MSW integration test asserts the request order (3.6).
- **Quality bar:**
  - WCAG 2.1 AA, 44 px targets, `focus-ring`, reduced motion (no row-action fade).
  - 360 px with no horizontal scroll (automated check). Long emails and URLs wrap.
  - axe in light and dark.
  - Semantic tokens only.
  - Copy is verbatim from Voice and Tone or marked `// DRAFT COPY`.

## Technical Decisions

**Rules for a Team A story PR** (FOUNDATION §1 T1–T8, R1–R11; the same as Epics 1 and 2):

- **Edit only these files:**
  - `features/contacts/**` (one folder for all three Sections; keep the `PhoneSection` / `EmailSection` / `SocialSection` exports)
  - `lib/api/contacts.ts` + `contacts.test.ts` (the engine and the writes)
  - `lib/server/proxy/allowlist/contacts.ts` + `.test.ts`
  - `lib/api/errors/contacts.ts` (extend its `Field` union)
  - `lib/shared/messages/contacts.ts`
  - `test/page-handlers/profile.ts`
  - `e2e/fixtures/contacts.ts` (empty: add the write mocks with a `mockContact*` prefix) and `defaults-profile.ts`
  - `e2e/profile-*`
  - `app/page.test.tsx` (shell-level asserts only)
- **New files allowed:** `lib/shared/contact-labels.ts` (+ its test; planned for 3.1 in FOUNDATION §3.3) and any brand-new `components/ui/*` file.
- **Never edit:**
  - `features/shell/**`, `features/header/**` and `features/personal/**`
  - `lib/api/index.ts`, `keys.ts`, `type-keys.ts`, `allowlist/index.ts`
  - `test/**` and `e2e/fixtures/{core,index}.ts`. `mockContacts`, `mockTypeKey` and `contactPointWire` are foundation: override them per test.
  - `lib/api/contact-points.ts` stays the read module. Team B's `contact-points.contract.test.ts` freezes it (`id`, `value`, `type`, `label`, `isVerified`, `phoneNumberRegion`; Email/Mobile/Landline), so only additive changes are allowed. Put writes and verify in `lib/api/contacts.ts`.
- **Names:** use the `contact` area prefix for exports (T6, e.g. `contactPointManagePath`). `planned-modules.test.ts` rejects a name made only of generic words.
- **Coverage:** `lib/api/contacts.ts` and `lib/shared/contact-labels.ts` need 100 % coverage.
- **Copy:** grep the whole catalog before adding a string (T5). These keys already exist:
  - `COMMON_MESSAGES`: `primary`, `makePrimary`, `verified`, `notVerified`, `verify`, `resendVerification`, `moreActionsFor`, `remove`, `restore`
  - `SECTION_MESSAGES`: `removedOnSave`, `newNotSaved`, `countryCode`, `phoneInvalid`
  - `SHELL_MESSAGES`: the three Section labels and every column header
  - `STATE_MESSAGES`: the load nouns
  - `CONTACT_MESSAGES`: `phoneTenDigits` and the three duplicates
- **Tests:**
  - Sections render with `renderInPage(ui, { page: "profile" })`.
  - The contact-point reads are already in the shell defaults. A new read adds its default to `profileReadHandlers` and `defaults-profile.ts` in the same change.

**Built pieces to use, per story** (FOUNDATION §3–§5 has the APIs):

- **3.1:**
  - the `PhoneSection` stub. Render `SectionLandmark id="phone"` from the first render and never remount it.
  - `StateFrame` with `skeleton="table"`, `columns={SECTION_COLUMNS.phone}`, `loadError {kind:"section", sectionId:"phone"}`, `level="section"`, `attempt` and `onReady={useSectionFrame("phone").onReady}`
  - `SectionHeader count`, `useReportSectionCount`
  - `SectionTable` (desktop table, stacked cards below 768 px, `actions`), `RowActions`, `Chip`, `StatusBadge`, `EmptyState variant="row"`
  - `formatPhoneDisplay`, `regionFlag`, `findPrimary` / `PRIMARY_LABEL`
  - `useSWR(keys.typeKey("ContactPoint"))` + `valueListOptions`. The `GET v2/type/key/ContactPoint` entry is already built: 3.1 adds only a proxy-test row if one is missing.
- **3.2:**
  - `useSectionForm` (`onNoChanges:"close"`, `cancelFocus:"heading"`, `fieldOrder`, `errorFields`, `startEdit({ focus })`, `draftFields` + `describeDraftDiff` + `dataStatus`, `SectionContainer sectionId`) and `SectionFooter addRow {label, onClick, disabledReason}`
  - controls: `PhoneInput` + `phoneIssue` / `toE164` / `phoneInputFrom` / `EMPTY_PHONE_INPUT`, `InputLocked`, `Select placeholder`, `DisabledAction`
  - rows: `RowRemoval` / `RowEditStatus` (Restore takes focus through the ref)
  - save: `mapApiError("phone", …)` (the duplicate rule is built)
  - A single POST needs no runner (recipe 4.3). Use `runSaveSteps` only if a step is added.
- **3.3:** `useCountdown` (60 s), `useAnnounce` / `LiveStatus`, `StatusBadge status="pending"`, the `RowActions` item `disabledReason`, `toastError(text, { onRetry })`.
- **3.4:** `ConfirmDialog` (standard, `busy`), `Switch` (`ariaDisabled`), `Chip variant="primary"`, `DisabledAction`. Make primary is an immediate action outside edit view. After the refetch an open edit view rebases through the new `baseline`.
- **3.5 / 3.6:** the same kit, with `SECTION_COLUMNS.email`, `sectionId:"email"`, `mapApiError("email", …)` and `contacts.duplicateEmail`.
- **3.7:** `safeHref`, `SECTION_COLUMNS.social`, `SectionTable` (`table-fixed`, wrapping cells), `contacts.duplicateSocial`.

**Per-row state lives in the Section.** `SectionTable` remounts its cells when the layout swaps at 768 px. Keep the countdowns, send errors and the "sent this session" flags in Section state keyed by row id, never in a cell component.

**Endpoints (confirmed in the backend):**

- **`POST v2/health/contact-point`** (3.2): one manage call adds, updates and removes rows and switches the Primary. It answers 200 with no body, so get new ids from the refetch.
  - The allowlist entry: no query, a strict zod body `{contactPointsToAdd?, contactPointsToUpdate?, contactPointsToRemove?}` (JSON only, 415 otherwise), with tests.
  - Backend rules the UI must respect:
    - at most one Primary per type in a request;
    - no Primary Email or Mobile in an add;
    - a Primary Email needs to be verified;
    - removing or downgrading a Primary needs a replacement in the same request;
    - values are unique within the request and among the person's rows;
    - at most 20 per type;
    - type and label match case-insensitively.
- **`POST v2/health/contact-point/verify`** (3.3): body `{contactPointIds: number[]}`, answer `{success, contactPointIdsWithSendError: number[]}`. Send nothing for an empty list. Its allowlist entry gets tests.

**D-A save safeguard (already in `callApi`):** every non-GET call (the manage POST, verify and Make primary) first re-reads `myself`. The auto-verify adds a second check after the save. Unit tests must let `myself` load before a write. The stories add nothing for this.

**Stale AC text** (the ACs are frozen; read them as follows):

- `features/phone`, `features/email`, `features/social` mean the stubs in `features/contacts`.
- "Replace the placeholder in `contacts-panel.tsx`" means: fill the stub.
- `useRegisterSection({...})` means `useSectionForm`, which registers.
- `lib/shared/messages.ts` means `messages/contacts.ts`, and `lib/api/errors.ts` means `errors/contacts.ts`.
- `keys.contactPoints("Social")` means `"Social Media"`, and `fetchContactPoints(["Social Media"])` takes one type string.
- "Created here unless …" for `formatPhoneDisplay`, `safeHref`, `RowActions`, the phone input and `ConfirmDialog`: all of these are built.
- "`verifyContactPoints` added to `lib/api/contact-points.ts`" means `lib/api/contacts.ts`.
- The `lib/api/contacts.ts` stub header lists separate `v2/user/contact-point` create/update/delete, make-primary and notification calls. That is stale: one manage POST does all of it.
- "No CSRF or `X-PP-Session` check" is already true (D5); nothing to add.

**Open decisions for the story specs:**

1. **Social handles (3.7):** the backend checks every Social Media value with `Helper.validateURL`, which accepts only `http(s)`/`ftp` URLs. It answers 400 "Invalid URL provided '@maria'.", so the AC's `@name` handle can't be saved. Decide with the PM: drop handles (https only), or keep them and map the error. Add an anchored `social` rule for `^Invalid URL provided '.*'\.$` either way.
2. **Social replace mode (3.7):** the backend also accepts a `value` change on a Social Media row in `contactPointsToUpdate`. The AC asks for remove + add in one request, which changes the id. Both are valid. Pick one, and keep the immutable guard for Phone and Email.
3. **Email in use on Make primary (3.6):** the exact backend message for the manage POST is unconfirmed on demo. The F1 rule `User with email '…' already exists.` is scoped to `account` only, with different copy. Add an `email`-scope rule once the message is confirmed.
4. **Legacy Primary on a Landline or Social row:** for types other than Email and Mobile, the backend requires exactly one replacement when a Primary is removed or downgraded. Removing such a row would fail with 400. Decide in 3.2/3.7: map the error, or disable Remove with a reason.
5. **Limit and Primary-rule rows:** only the duplicate rules exist in `errors/contacts.ts` today. Add anchored rules for the 20-per-type limit and the Primary rules (exact backend texts) in the story that triggers them.
6. **Known UI-kit limits** (`deferred-work.md`):
   - `PhoneInput` re-renders 245 country items on every keystroke. Memoize in a foundation PR if 3.2 lags with many rows.
   - Its picker has no type-to-search.
   - While a Radix Select is open, scan only the listbox with axe.

## UX & Interaction Patterns

- **Read view:**
  - A real `<table>`. Phone columns: Number · Label · Type · Status · Notifications · actions. Email: Email address · Label · Status · Notifications · actions. Social: Link · actions.
  - Values use `cell-strong`. There is no `cell-number` utility yet: adding one is a foundation token change. No row click.
  - On desktop, inline row actions fade in on hover or focus (no fade under reduced motion). The 44×44 kebab is always visible.
- **Below 768 px:** each row is a stacked card. Line 1 holds the value + status, line 2 the label chip + type + notifications (muted), with the kebab on the right. In edit view the inputs stack full width in place (no bottom sheet).
- **Edit view:**
  - The container gets the primary border and halo, and the header shows "Editing".
  - The `tfoot` shows "Unsaved changes" after the first change, then Add row / Cancel / Save. Saving shows "Saving…", makes inputs read-only and disables Cancel; other Sections stay usable.
  - A new row's status reads "New · not saved".
  - New phone help: "Include the area code. Mobile numbers get a verification link by text after you save." The country picker is a flag + dial-code segment inside the 44 px input, default US.
- **Disabled actions:** `aria-disabled`, focusable, a no-op, with the reason in a Tooltip (hover, focus, tap; closes on Escape, blur or an outside tap) and `aria-describedby`.
- **Make primary confirm:** a standard (not destructive) dialog. Focus starts on Cancel, and Escape or Cancel returns focus to the trigger.
- **Countdown:** muted pending style, updated each second. Announced once, never every second.

## Cross-Story Dependencies

- **Inside the epic:**
  - 3.1 builds the engine, the label list and the Phone read view.
  - 3.2 adds edit and save on top of it, 3.3 the auto-verify inside 3.2's `save()`, and 3.4 Make primary and notifications.
  - 3.5 reuses the engine and the 3.2 patterns for Email. 3.6 reuses 3.3 and 3.4 for Email and adds the Save-all order test.
  - 3.7 adds the engine's replace mode and the Social Section.
  - All seven share `features/contacts`, `lib/api/contacts.ts` and the contacts area files, so expect them to land one after another.
- **Epic 1:**
  - The header (1.9) shows the primary phone and email from the same keys.
  - Save all (1.14) uses `SAVE_ORDER`.
  - Drafts (1.15), the leave guard and the D-A safeguard apply.
- **Epic 7 (Team B):**
  - 7.4 and 7.6 read the same per-type keys through the one SWR cache, so a Contacts save refreshes the `/account` pickers and a 7.6 Primary switch refreshes the Contacts lists.
  - Team B's contract freezes the read API in `contact-points.ts`.
  - 7.6 sets the Primary through `PUT v2/user/edit` (`updateAccount`, `features/account` only). Epic 3 uses the manage POST, never `updateAccount`.
- **Dates:** feature freeze 2026-10-22, demo QA of UJ-1 to UJ-5 (UJ-1 = add, verify and make primary a phone) by 2026-10-24, go-live 2026-10-29.
