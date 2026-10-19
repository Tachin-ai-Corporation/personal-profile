---
title: 'Story 3.6: Verify emails, make an email primary and manage notifications'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: '6642d291213ee8dcb7e4e8343fd4a8bca8cd7146'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** New emails are never verified, and users can't make a verified email their primary sign-in email or turn its notifications on or off (Story 3.6, FR21–FR23, NG-9024; acceptance source: `epics.md` "### Story 3.6"). Also, Phone's read-view kebab offers Remove on a repeated-id row, which opens a struck row with no Restore and a Save that sends nothing but toasts "Phone saved." (`deferred-work.md`, Story 3.5 review row 25).

**Approach:** Move Phone's 3.3 verify flow (state, countdown, Status cell, send) and its 3.4 Make primary flow (eligibility check, confirm, one manage POST, refetch, toast with Retry) and notifications switch into shared `features/contacts` modules. Phone uses them with no behaviour change, and Email adds them with email eligibility and copy. Phone's kebab hides Remove on a repeat row, as Email does.

## Boundaries & Constraints

**Always:**
- **Auto-verify:** Email's `save()` refetches through the bound `email.mutate()`. It then calls `sendContactVerification(newUnverifiedContactPoints(savedPoints, fresh typed "Email"), "email")` once, before it resolves. A failed refetch or verify never fails the save.
- **Verify / Resend verification:** offered on a saved email (has an id, not a repeat) that isn't labelled Home and isn't Verified, including an unverified Primary.
  - It is `inline` and a kebab item. It sends at once.
  - It shows "Link sent · Resend in {n} s" for 60 s and announces "Link sent" once.
  - Send errors show "Couldn't send the link". A network failure shows the toast "Couldn't send the link. Check your connection." with Retry.
  - The cooldown help reads "A link was already sent in the last hour. Check your email." (DRAFT).
  - States live in the Section, keyed by id.
- **Make primary:** offered on read-view rows only (never in edit view, never on new, id-less, repeat, Primary or Primary-labelled rows).
  - Enabled only on a Verified email.
  - Disabled reasons: unverified Home → "Change the label from Home, then verify this email" (DRAFT); other unverified → "Verify this email first" (verbatim).
  - Order: after Verify, before Edit.
- **Confirm:** standard `ConfirmDialog`, focus on Cancel. Title "This changes how you sign in". Confirm label `COMMON_MESSAGES.makePrimary`.
  - Body: "{email} becomes your primary email and sign-in email. Your current primary is relabeled Old." Without a current Primary, the first sentence only. Both are DRAFT.
  - Cancel or Escape sends nothing, and focus returns to the trigger.
- **Make primary send:** one POST via `contactPointsDiffToManageDTO(saved, withPrimary(saved, id))` + `saveContactPoints(dto, "email")`. The new Primary goes first with notifications on, and the old one is relabelled "Old".
  - **Success:** `email.mutate()` + `mutateMyself()`, then "Email saved." and focus on the Email `h2`.
  - **Failure:** refetch first, then `toastError(text, { onRetry })`. Retry re-checks eligibility on the latest rows and sends with no confirm. A session end shows nothing.
  - **Failure text:** a mapped Email Primary rule's message, else "Couldn't save email." / "Couldn't save email. Check your connection.".
- **Email error rules** (`lib/api/errors/contacts.ts`, `email` scope, anchored):
  - the seven Primary rules with email messages (field `primary`): "Make another email primary first" (exists), "Verify this email first", and five DRAFT variants of Phone's;
  - "User with email '…' already exists." → field `primary`, "This email is used by another account. Choose a different one." (DRAFT);
  - the verify cooldown → field `verify`.
- **Notifications:** in edit view the Primary row's cell is a `Switch` named "Notifications for {email}".
  - Edit rows carry an optional `notifications`, which drafts include. Save sends only that row.
  - It applies only to the saved Primary. Every other row shows "—".
- **Phone bug:** `PhoneReadActions` offers no Remove when `isRepeat(row)`. A test proves it.
- **Save all order:** a Vitest + MSW integration test with real Email and Phone Sections calls `runSaveAll(registry, { order: SAVE_ORDER })` (via `useSectionRegistry`). It asserts the request order: email manage → email verify → phone manage → phone verify.
- **Copy:** grep the catalog first, reuse the Phone keys where the text is the same, and mark DRAFT as listed above.

**Decisions (agent, 2026-10-19):**
- **Shared modules (Team A, not foundation):**
  - `features/contacts/contact-verify.tsx`: the verify state types, `useResendSeconds`, the Status cell and `useContactVerification(scope, cooldownHelp)`.
  - `features/contacts/contact-primary.tsx`: `withPrimary` and `useMakePrimary`, which returns `open(id)` and the dialog.
  - `NotificationsSwitch` goes into `contact-edit-kit.tsx`.
  - Phone's existing tests stay unchanged and green.
- **The Save-all test** lives in `features/contacts`, because lint forbids importing `features/save-all` there. `SaveAllBar` itself is already covered by Story 1.14.
- **The email-in-use backend text** is confirmed in `ContactPointServiceImpl.java:144-147` (`USER_ALREADY_EXISTS`, which rolls back the whole request).
- **Local-view worktree, after the commits:** move it to the new HEAD and keep its uncommitted dev mock. The verify and manage endpoints already exist there. The mock gains a verified non-Primary email and an unverified Home email, plus an email-in-use rejection for a chosen address.

**Decisions (human, 2026-10-19):**
- **Foundation test retarget (approved):** `lib/api/errors/errors.test.ts:87` ("email in use outside account") moves from scope `"email"` to `"phone"` so the AC's email-scope mapping can land. It ships as its own test-only commit before the feat commit (three commits in all: docs, foundation test, feat).
- **Spec size:** about 2,300 tokens, kept whole because it is one goal (self-approved per the user's instruction).

**Never:** edit `features/shell/**`, `components/ui/*` (existing), `lib/api/{index,contact-points,keys}.ts`, `allowlist/**`, the foundation message files, `test/**` or `e2e/fixtures/{core,index}.ts` (except the approved test row). Never send `isVerified`. Never change the engine.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Auto-verify | add `b@x.com` (Personal); the refetch returns id 44 unverified | manage POST, then verify `{contactPointIds:[44]}`; "Link sent · Resend in 60 s"; "Email saved." | verify 500 → "Couldn't send the link", still saved |
| Manual verify | unverified Work 41; Verify | one verify POST, no edit mode | network → toast + Retry |
| Switch | Primary 42, Verified Work 41; Make primary 41, confirm | POST update `[{id:41,type:"Email",label:"Primary",isNotificationEnabled:true},{id:42,type:"Email",label:"Old",…}]`; 41 first, "On"; "Email saved."; `h2` | N/A |
| Reasons | unverified 41; unverified Home 43 | "Verify this email first" (Verify beside it) / "Change the label from Home, then verify this email" | N/A |
| In use | 400 "User with email 'x' already exists." | "This email is used by another account. Choose a different one." + Retry; view unchanged | keys revalidated |
| Notifications | edit; Primary switch off; Save | POST updating only 42, `isNotificationEnabled:false` | N/A |
| Phone repeat | Mobile list holds id 12 twice | the second row's kebab has no Remove | N/A |
| Save all | Email and Phone dirty with new rows | order: email manage, email verify, phone manage, phone verify | N/A |

</frozen-after-approval>

## Code Map

- `features/contacts/phone-section.tsx` -- source to extract from: l.121–186 (verify state, `useResendSeconds`, `PhoneStatus`), 188–234 (`primaryOfferOf`, `withPrimary`), 444–461 (`NotificationsCell`), 572–581 (`makePrimaryFailureText`), 668–709 (`sendVerification`), 791–912 (latest refs, `verifyRow`, Make primary state/send/retry/confirm), 1045–1067 (dialog, `LiveStatus`). Bug at 282–284.
- `features/contacts/email-section.tsx` -- add verify, Make primary, the switch, auto-verify in `save()` (l.395–413); `editedContactPoints` (l.305) gains Primary-only notifications; `EmailReadActions` gains the items.
- `features/contacts/email-schema.ts` -- add an optional `notifications` to the row and the draft diff (copy `phone-schema.ts`).
- `features/contacts/contact-edit-kit.tsx` -- add `NotificationsSwitch`.
- `lib/api/contacts.ts` -- `sendContactVerification(ids, scope)` and `saveContactPoints(dto, scope)` already take the scope. No change.
- `lib/api/errors/contacts.ts` -- `PRIMARY_RULES` is a list of `[pattern, key]` pairs: make it per scope. Add the cooldown rule and the email-in-use rule for `email`.
- `lib/shared/messages/contacts.ts` -- new email keys. Verbatim: "Verify this email first" (EXPERIENCE.md l.85).
- Tests to copy: `phone-section.verify.test.tsx`, `phone-section.primary.test.tsx` (20 s timeout), `email-section.edit.test.tsx`; `lib/api/errors/contacts.test.ts`; `test/providers.tsx` `renderInPage` (returns `registry`); e2e `e2e/profile-email.spec.ts` (`mockContactManage`, and `mockContactVerify` from `e2e/fixtures/contacts.ts`).
- `../personal-profile-local-view/lib/server/dev-mock.ts` -- `EMAIL` rows (l.76), `primaryRuleError` (l.94), the POST handler (l.323).

## Tasks & Acceptance

**Execution:**
- [x] `features/contacts/contact-verify.tsx`, `contact-primary.tsx`, `contact-edit-kit.tsx` -- the shared flows; `phone-section.tsx` uses them, plus the repeat-row Remove fix (+ a test in `phone-section.test.tsx`).
- [x] `lib/shared/messages/contacts.ts`, `lib/api/errors/contacts.ts` (+ `contacts.test.ts`) -- the email keys and rules.
- [x] `features/contacts/email-schema.ts` (+ test) -- notifications.
- [x] `features/contacts/email-section.tsx` (+ `email-section.verify.test.tsx`, `email-section.primary.test.tsx`) -- every I/O row; axe light and dark with the dialog open.
- [x] `features/contacts/contacts-save-all.test.tsx` -- the request order.
- [x] `e2e/profile-email.spec.ts` -- auto-verify after add; Verify; Make primary → one POST → the header email; Cancel; reasons; in use; switch; 360 px; axe.
- [x] `deferred-work.md` (the Phone item resolved) and `sprint-status.yaml` (`3-6` line only).

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api` and `lib/shared`, and Phone's existing tests are unchanged.
- Given the diff against the baseline, when listed, then only Team A paths changed plus the one approved `lib/api/errors/errors.test.ts` row.

## Implementation Notes

- `contact-verify.tsx` exports `CONTACT_VERIFY_COUNTDOWN_MS`, `ContactVerifyState(s)`, `useResendSeconds`, `contactResendInText`, `ContactVerifyStatus` (label, isVerified, state, cooldownHelp), `contactVerifyAction` and `useContactVerification(scope, cooldownHelp, isVerifiable)` → `{ states, announcement, sendAfterSave, verify }`. `contact-primary.tsx` exports `withPrimary`, `contactPrimaryFailureText(mapped, sectionLabel)` and `useMakePrimary({ scope, sectionLabel, headingId, eligible, savedPoints, refetch, body })` → `{ open, dialog }`. Both keep the Section's latest-render callbacks in refs, as Phone did.
- Email's notifications apply only to the saved Primary's id (`findPrimary`, not a repeat); Phone keeps its label check.
- Phone's other test files are untouched; `phone-section.test.tsx` only gains the repeat-row test (and its `act`/`stubLayoutApis` imports).
- Three Email 3.5 assertions changed with the new behaviour (`email-section.edit.test.tsx`: the kebab items, the Primary's switch in edit view, the repeat row's first occurrence offering Make primary; `e2e/profile-email.spec.ts`: the kebab items and the add test now expects the verify call).
- Not done here (after the commits, per the Decisions): moving the local-view worktree and extending its dev mock.
- **Review pass 1 patches:** rows 1, 2, 8 (first half), 9, 14, 17 and 19 (Email) of the triage log. Row 19's Phone twin is in `deferred-work.md`.
  - The Email confirm body is a `<span data-slot="make-primary-body" className="break-words">`, and `MakePrimaryOptions.body` returns a `ReactNode`. Phone still passes a string.
  - **Known leftover (accepted):** in the stale-draft case of row 19, the restored switch still reads the draft's Off, although Save sends nothing. Its Label cell has the same mismatch in that case (3.5 review row 16, rejected as rare).
- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 5231/5231 passed (196 files), coverage thresholds met.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 784 passed, 10 skipped (by design), none flaky.

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | VG | Email's Make primary Retry pressed in edit view is untested (Phone has its own test) | low | Real gap: dropping `latestEditing` from Email's `eligible` fails no test → **patch**: the Email test. |
| 2 | VG | No test checks that Email cards (< 768 px) hide the inline Verify / Make primary | low | Real gap: removing `showInline` fails no test → **patch**: a card assert. |
| 3 | B | The spec names another session's Node path | — | The fix edits this build's spec → rejected. |
| 4 | B | The spec's hook signature and Code Map line refs are stale | — | The fix edits this build's spec → rejected. |
| 5 | B | The local-view follow-up isn't tracked | false | This run does it right after the commits (Decisions). |
| 6 | B | The old Primary keeps notifications on, with no switch | low | Engine behaviour decided in spec 3.4 ("the old row keeps its value") → rejected. |
| 7 | B | Retry on rejections that always fail (in use, Primary rules) | low | The spec requires Retry, and the toast API requires `onRetry`; 3.4/3.5 rejected the same → rejected. |
| 8 | B | "Check your emails" reads as "check your inbox"; "Choose a different one" doesn't fit | low | The first is real and a one-string fix → **patch**: "Check your email addresses and try again."; the in-use text is the AC's own copy → kept. |
| 9 | B | A long address overflows the confirm at 360 px | medium | Real: `ConfirmDialog` renders the body in a plain `div` with no wrapping, and a 50+ character address is ordinary → **patch**: `body` returns a `ReactNode`, and Email wraps it with `break-words`. |
| 10 | B, E | A confirm or Retry that ends up sending nothing (stale row, edit view, in flight) closes silently | low | Same as 3.4 row 8; needs the rows to change during the modal → rejected. |
| 11 | B | The `{number}` placeholder carries an email | low | No user-visible harm → rejected. |
| 12 | B | The draft compare and the save use different Primary rules (legacy second Primary) | low | Needs a legacy second Primary row; same as 3.4 row 11 → rejected. |
| 13 | B | "Never more than one Primary in any DTO" isn't unit-tested | false | `lib/api/contacts.test.ts:213` ("throws when two rows of one type would be Primary") covers the engine for every type. |
| 14 | B | The repeat-row Phone test waits with a real 20 ms sleep | low | Real flake risk, direct fix → **patch**: `waitFor` that the menu is gone. |
| 15 | B | Menu-item asserts compare concatenated `textContent` | low | The 3.5 test pattern; no failure named → rejected. |
| 16 | B | The Save-all test labels requests loosely and mocks the internal toasts path | low | The exact sequence is asserted, and a mislabel needs a mixed body that no Section builds → rejected. |
| 17 | B | The approved `errors.test.ts` row is still named "outside account" | low | Real: the text is now mapped on `email` too; renaming it stays within the approved row → **patch**. |
| 18 | B | The in-use e2e doesn't check the refetch | low | The unit test checks it → rejected. |
| 19 | E | A stale draft (row not Primary when stored) turns off the new Primary's notifications | medium | Real: `editedContactPoints` takes `edit.notifications` for `primaryId` whatever the draft's label → **patch** (Email): also require `edit.label === PRIMARY_LABEL`; Phone's identical gap → **defer** (Phone stays unchanged in this story). |
| 20 | E | A confirm pressed while a Retry is in flight closes silently | low | Same as row 10 → rejected. |
| 21 | E | A refetched row with `isVerified: null` gets no auto-verify but offers Verify | low | Engine rule from Story 3.1 (`=== false`), shared with Phone; the backend returns booleans → rejected. |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin` (the default `node` is 26); no git commits, no push; `corepack pnpm` if `pnpm` isn't on `PATH`; never `pnpm dev` here; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
