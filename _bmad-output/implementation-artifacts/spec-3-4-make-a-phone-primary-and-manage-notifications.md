---
title: 'Story 3.4: Make a phone primary and manage notifications'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'de034dfea240f0c7ecfb15bd45f5593039daf9ec'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users can't change which phone they sign in with or turn its notifications on or off. The backend's Primary-rule errors also all show the same message (Story 3.4, FR18–FR19, NG-9023; acceptance source: `epics.md` "### Story 3.4: Make a phone primary and manage notifications"; Story 3.2 review row 18).

**Approach:** Add a read-view "Make primary" row action to `features/contacts/phone-section.tsx`. It opens the standard `ConfirmDialog` and sends one manage POST, built by the existing engine (`contactPointsDiffToManageDTO` already relabels the old Primary "Old" and turns notifications on). Add a Primary-row `Switch` in the edit view. Give each backend Primary rule its own message in `lib/api/errors/contacts.ts`. Reuse the 3.3 verify flow (Verify beside a disabled "Verify this number first").

## Boundaries & Constraints

**Always:**
- **Eligibility** (read view only; never in edit view or on new, id-less or repeated rows):
  - Eligible: a saved Mobile that isn't the shown Primary and is Verified.
  - RC2: when no shown phone is Verified and none is Primary, an unverified Mobile not labelled Home is eligible too.
  - Disabled reasons (aria-disabled, `RowActions` `disabledReason`; Verify stays beside it on unverified rows):
    - Landline: "Landlines can't be primary";
    - unverified Home-labelled Mobile: "Change the label from Home, then verify this number";
    - any other unverified Mobile: "Verify this number first".
  - The Primary row offers no Make primary.
- **Action:** "Make primary" is `inline` and in the kebab, after Verify and before Edit.
- **Confirm:** `ConfirmDialog` with `variant="standard"`, focus on Cancel.
  - Title "This changes how you sign in"; confirm label `COMMON_MESSAGES.makePrimary`.
  - Body "{formatted number} becomes your primary phone and sign-in number. Your current primary is relabeled Old.". With no current Primary, only the first sentence.
  - Cancel or Escape sends nothing, and focus returns to the trigger.
- **Send:**
  - Confirm keeps the dialog open and `busy`. It sends `saveContactPoints(contactPointsDiffToManageDTO(savedPoints, savedPoints with the target labelled Primary))`: one POST, the new Primary with notifications on, and the old one relabelled "Old".
  - **On success:** refetch through the bound `mobile.mutate()` / `landline.mutate()` plus `mutateMyself()` (as 3.3's save does), so the header and `/account` follow. Then close the dialog, `toastSuccess("Phone saved.")` and move focus to the Phone `h2`.
  - **On failure:** close the dialog (focus returns to the trigger) and leave the view as it was.
    - Toast `toastError(mapped message, { onRetry })`: a mapped Primary rule's message, else "Couldn't save phone." / "Couldn't save phone. Check your connection.".
    - Retry re-checks eligibility on the latest rows and resends without reopening the confirm.
    - The two Phone keys are revalidated, because the server may have changed.
  - A session end shows nothing; the shell handles it.
- **Notifications** (edit view):
  - The Primary row's Notifications cell is a `Switch`, labelled "Notifications for {formatted number}", reflecting `isNotificationEnabled`. Every other row keeps "—" (RC3).
  - The edit rows carry `notifications`, which drafts include. A toggle makes the Section dirty, and Save sends only that row in `contactPointsToUpdate`.
  - An unverified Primary gets the switch too.
- **Footnote:** "Changing your primary phone changes how you sign in." shows below the table (`text-muted-foreground text-body-sm`) whenever the table shows, in both views.
- **Primary-rule messages** (`lib/api/errors/contacts.ts`, still field `primary`, `phone` scope; each rule gets its own `CONTACT_MESSAGES` key):
  - delete without a replacement → "Make another phone primary first" (verbatim);
  - downgrade without a replacement → "Make another phone primary before you change this one's label";
  - only one replacement → "Only one phone can replace your primary phone";
  - one Primary per type → "Only one phone can be primary";
  - Primary in an add → "A new phone can't be primary. Save it, then make it primary.";
  - already has a Primary → "Your primary phone changed. Check your phones and try again.";
  - not verified → "Verify this number first" (verbatim).
  - All except the two verbatim ones are DRAFT COPY. The edit-save placement is unchanged (Section level with Retry).
- **Copy:** verbatim from Voice and Tone: the footnote, the confirm title and body, "Landlines can't be primary" and "Verify this number first". DRAFT COPY: the Home reason, the body without its second sentence, and the switch name. Reuse `COMMON_MESSAGES.makePrimary` and `primary`, and grep before adding.

**Decisions (agent, 2026-10-19; no human input needed):**
- **RC2 check:** RC2 looks at every shown phone, as the AC says. The backend allows an unverified Mobile Primary only when no Mobile is verified (`ContactPointServiceImpl:475-484`), so the AC is the stricter of the two.
- **Failure handling:** Retry skips the confirm, because the user already confirmed. Revalidating after a failure keeps the "already has a Primary" case from failing again.
- **Notifications on Make primary:** the new Primary always has notifications on (AC and engine), and the old row keeps its value (the backend copies it as sent).
- **Spec size:** about 2,100 tokens, kept whole because it is one goal (self-approved per the user's instruction).

**Never:**
- Don't edit `features/shell/**`, `components/ui/*` (existing), `lib/api/{index,contact-points,keys}.ts`, `allowlist/**` (no new endpoint), foundation message files, `test/**` (except `test/page-handlers/profile.ts`), `e2e/fixtures/{core,index}.ts` or `app/page.tsx`.
- Never send `isVerified`. The strict proxy schema refuses it, and it stays that way.
- Emails belong to Story 3.6.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Switch | Primary 12 (notif on), Verified Work 13; Make primary on 13, confirm | one POST `{contactPointsToAdd:[], contactPointsToUpdate:[{id:13,type:"Mobile",label:"Primary",isNotificationEnabled:true},{id:12,type:"Mobile",label:"Old",isNotificationEnabled:true}], contactPointsToRemove:[]}`; 13 first with the Primary chip and "On"; 12 "Old"; "Phone saved."; `h2` | N/A |
| Cancel | open, then Cancel or Escape | no request; focus on the trigger | N/A |
| RC2 | no Verified, no Primary; unverified Work 11 | enabled; body has only the first sentence; the update holds only 11 | N/A |
| Reasons | Landline / unverified Mobile / unverified Home Mobile | aria-disabled with the three reasons; Verify beside the unverified one | N/A |
| Not offered | edit view; new row; the Primary row | no Make primary | N/A |
| Failure | 400 "…already has primary contact point from type 'Mobile'." | dialog closes; the view is unchanged; toast with that message + Retry; keys revalidated | Retry resends once |
| Network | network failure | toast "Couldn't save phone. Check your connection." + Retry | N/A |
| Notifications | edit; toggle the Primary's switch off; Save | one POST updating only the Primary `{…,label:"Primary",isNotificationEnabled:false}`; read view "Off" | N/A |
| RC3 | edit view | only the Primary row has a switch; the others show "—" | N/A |
| Messages | each of the 7 backend Primary texts on save | each shows its own message at Section level | N/A |

</frozen-after-approval>

## Code Map

- `features/contacts/phone-section.tsx` -- `PhoneReadActions` (add Make primary next to Verify; `isVerifiable`, `verifyIdOf`, `useResendSeconds`), `phoneRowsOf` / `row.primary`, `savedPoints`, `save()` (the bound-mutate refetch pattern to copy), `latestRows` ref plus the `verifyRow` stale guard (copy it for Make primary and Retry), `notificationsOf` / `NotApplicable` (the read cells), `phoneEditColumns` Notifications cell, `editedContactPoints` (carry `notifications` into `isNotificationEnabled`), `headingId`. The dialog state lives in the Section.
- `features/contacts/phone-schema.ts` -- `phoneEditRowSchema`, `phoneEditRowOf`, `newPhoneEditRow` (add `notifications`), `phoneDraftDiff` (include it).
- `lib/api/contacts.ts` -- `contactPointsDiffToManageDTO` (the Primary switch already built and tested), `saveContactPoints` (returns `{ ok:false, error:{ mapped } }`).
- `lib/api/errors/contacts.ts` -- `PRIMARY_PATTERNS` (the seven, in the order above) all map to `contacts.phonePrimaryFirst` today; split them into per-pattern keys. The texts are in `common/Messages.java`. `mapApiError` / `MappedError` kinds (`field`, `generic`, `network`, `session`).
- `components/ui/confirm-dialog.tsx` (`ConfirmDialogProps`: `busy`, `variant`, `onCancel`), `components/ui/switch.tsx`, `features/shell/toasts.ts` (`toastSuccess`, `toastError`), `features/shell/row-actions.tsx`.
- Tests: a new `features/contacts/phone-section.primary.test.tsx` (copy the 3.3 harness in `phone-section.verify.test.tsx`, including its `vi.setConfig({ testTimeout: 20_000 })` and the comment explaining it); `lib/api/errors/contacts.test.ts`; `e2e/profile-phone.spec.ts` with `mockContactManage`. Existing 3.1–3.3 tests that list the kebab items or the edit cells may need updating.

## Tasks & Acceptance

**Execution:**
- [x] `lib/shared/messages/contacts.ts` -- the new keys.
- [x] `lib/api/errors/contacts.ts` (+ test) -- the seven Primary rules with their own messages.
- [x] `features/contacts/phone-schema.ts` (+ test) -- `notifications` on edit rows and in the draft diff.
- [x] `features/contacts/phone-section.tsx` (+ `phone-section.primary.test.tsx`) -- eligibility, reasons, confirm, send, success, failure + Retry, footnote, the switch; every I/O row; axe light/dark with the dialog open.
- [x] `e2e/profile-phone.spec.ts` -- Make primary → confirm → one POST → header shows the new number; Cancel; disabled reasons; notifications toggle; 360 px; axe.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` (Team A: backend `isVerified` maybe writable on update, guarded by the strict proxy) and `sprint-status.yaml` (`3-4` line only).

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api`, `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed.

## Implementation Notes

- Make primary builds `after` with the target first (`withPrimary`), so `contactPointsToUpdate` lists the new Primary before the old one, as in the I/O matrix. The backend checks the request as a whole, so the order is cosmetic.
- Not offered also on a row already labelled Primary that isn't the shown one (a legacy second Primary): the engine would send nothing for it.
- The confirm body's second sentence shows when the engine will relabel a row Old (another saved row of the target's type labelled Primary), so a legacy Landline Primary never claims to be relabelled.
- Retry (and a confirm whose row went stale) re-checks eligibility on the latest rows and sends nothing from edit view.
- Edit rows' `notifications` is optional in the schema: a draft stored before this story parses, reads as unchanged in `editedContactPoints` and the switch, and takes the current row's value in the draft compare. The compare shows "Notifications on/off" (DRAFT COPY) on Primary-labelled rows only.
- An id-less Primary keeps its "On"/"Off" text in edit view (nothing to update).
- Existing tests updated for the new kebab item: `phone-section.edit.test.tsx` and `phone-section.verify.test.tsx` (kebab lists), `e2e/profile-phone.spec.ts` 3.3 360 px test (`menuitem` "Verify" is now `exact`).
- After review pass 1:
  - **Engine throw:** a programmer error from the engine is caught. It toasts "Couldn't save phone." and the confirm always closes. `toastError` requires `onRetry` (a foundation file), so that toast's Retry only reloads both Phone keys and `myself` and never sends again.
  - **Failures:** a failure awaits that reload before it toasts.
  - **Draft notifications:** a draft's `notifications` applies only to the saved Primary.
  - **Old-draft test:** react-hook-form fills a missing `rows.N.notifications` from the baseline once the switch registers it, so the test passes with or without the two fallbacks; they only guard against that behaviour changing.
- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 5015/5015 passed (190 files), coverage 100% on `lib/server`, `lib/api`, `lib/shared`.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 734 passed, 10 skipped (by design).

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B, E | If the engine throws, the confirm stays busy with Escape blocked | medium | Real: `contactPointsDiffToManageDTO` runs before `sendMakePrimary`'s try, and `confirmMakePrimary` has no finally → **patch**: try/finally plus the generic toast. |
| 2 | VG | Restoring a pre-3.4 draft (no `notifications`) is untested at Section level | medium | Real: a regression would silently turn the Primary's notifications off → **patch**: a test. |
| 3 | E | A restored draft can change a non-Primary row's notifications, which has no control | medium | Real: `editedContactPoints` reads `edit.notifications` for every saved row → **patch**: only the saved Primary's. |
| 4 | E, B | The failure path revalidates fire-and-forget and skips `myself` | low | Real: an early Retry re-checks stale rows, and the header stays stale → **patch**: await `allSettled` of both keys plus `myself` before the toast. |
| 5 | VG | The switch's read-only-while-saving guard is untested | low | Real → **patch**: a held-save test. |
| 6 | VG, B | The Retry re-check test passes without the re-check, and a stale confirm is untested | low | Real: in its state the engine returns null → **patch**: an unverified-target Retry and a stale-confirm test. |
| 7 | B | Two test titles overclaim | low | Real → **patch**: an assertion and a title fix. |
| 8 | B, E | A confirm or Retry that sends nothing (stale row, in flight) closes silently | low | Needs the rows to change while the modal is open, or a double send; the fix adds branches → rejected. |
| 9 | B | The footnote shows below the footer in edit view, and in the empty state | false | The spec says "below the table … whenever the table shows, in both views"; the footer belongs to the table container. |
| 10 | B | "Verify this number first" and "this one's label" at Section level name no row | low | The copy is fixed in the frozen block (verbatim reuse); the fix edits the spec → rejected. |
| 11 | B | The draft compare's Primary check differs from the switch's (legacy second Primary) | low | Needs a legacy second Primary-labelled row → rejected (unlikely). |
| 12 | B | `toLowerCase()` builds the failure copy | false | It is the shell's own pattern (`use-section-form.ts:350`, `SECTION_MESSAGES.saveFailed`). |
| 13 | B | The spec's Verification section names a session temp path | low | The fix edits the spec; it matches the 3.2 and 3.3 specs → rejected. |
| 14 | B | A saved Primary without a value is never relabelled Old | low | The backend always stores a value → rejected (unlikely). |
| 15 | B | The e2e header locator `div:has(> h1)` is fragile | low | A stable hook would mean editing the foundation-owned `features/header` → rejected. |
| 16 | B | No unit test checks that the header follows | low | The e2e asserts the header's new number → rejected. |
| 17 | E | A Retry in flight, then Edit: focus jumps to the `h2` mid-edit | low | Needs Edit pressed during the request after a Retry; the baseline rebase keeps edits → rejected (unlikely). |
| 18 | E | A toast Retry after the Section unmounts still sends | low | The user asked for it, and the outcome is still toasted → rejected. |
| 19 | E | The draft compare hides a non-Primary notifications difference | low | Moot after row 3: non-Primary notifications are never sent → rejected. |
| 20 | E | A Landline Primary gives the one-sentence body | false | Correct: a Mobile switch doesn't relabel a Landline Primary, so nothing is relabelled Old. |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; `corepack pnpm` if `pnpm` isn't on `PATH`; no git commits, no push; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
