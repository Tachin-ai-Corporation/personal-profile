---
title: 'Story 5.5: Delete a policy'
type: 'feature'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
baseline_commit: 'bc8438e3b5d3abee58face3ceb8f583ce4e9b8f7'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-4-primary-per-type-with-demote-offer.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Patients can't remove a policy they no longer have, so outdated coverage stays on their profile (Story 5.5, FR30, NG-9029; acceptance source: `epics.md` "### Story 5.5: Delete a policy").

**Approach:** Add "Delete" to a non-Deleted card's kebab. Confirm it in the shared destructive `ConfirmDialog`, send `DELETE v2/health/insurance/{id}`, refetch, and show whatever the platform did: the card turns Deleted (muted), or it disappears. Failures show an error toast with Retry. The backend's "already gone" answers count as already removed, with an info toast (decision 1B).

## Boundaries & Constraints

**Always:**
- **Kebab:** a non-Deleted card with an id lists "Edit" and "Delete" (`destructive`, error-strong). A Deleted card still has no kebab (5.1).
- **Confirm:** `ConfirmDialog` with `variant="destructive"`:
  - title "Delete this insurance policy?";
  - body "{Insurer} {Type} Insurance will be removed from your profile." (`insurancePolicyName`);
  - buttons Cancel and "Delete policy", with `busyLabel` "Deleting…" (DRAFT).
  - Focus starts on Cancel. Escape or Cancel closes with no request, and focus returns to the kebab.
- **Request:** `DELETE v2/health/insurance/{id}`, the id from the card (never typed).
  - Allowlist entry `{ method: "DELETE", template: "v2/health/insurance/{insuranceId}" }`: numeric id, no query, no body.
  - `deleteInsurancePolicy(id)` in `lib/api/insurance.ts` never throws, and a bad id sends nothing.
  - While it runs, the confirm button is busy and the dialog can't be dismissed. The backend answers 200 with an empty body.
- **Success:**
  - The dialog closes and `keys.insurance()` refetches. The UI shows the platform result: the card turns Deleted (muted, Deleted chip, no actions) when the user was its only policyholder, or the card is gone (the user's link was removed).
  - The toast "Insurance policy deleted." shows (DRAFT).
  - Focus moves to the next card's kebab in the list's order. If there is no next card, it goes to the previous card's kebab. With no active cards left, it goes to "Add insurance" (in the header, or on the empty card).
  - `dropInsurancePendingCards(id)` (5.3) drops any in-memory image of that policy.
- **Failure:** the dialog closes and the card is unchanged.
  - `toastError(text, { onRetry })` persists until dismissed, and Retry sends the delete again with no second confirm.
  - A network failure reads "Couldn't delete insurance policy. Check your connection." (DRAFT). Other failures read "Couldn't delete insurance policy." (DRAFT), or a mapped message.
  - A session end shows nothing (the shell handles it).
  - Single flight: one delete per policy at a time.
- **"Already gone" answers (decision 1B):** treated as already removed: refresh the list and close the dialog, with no error, and focus moves as on success. Instead of the success toast, the message "This policy was already removed." (DRAFT COPY; it parallels Epic 4's "removed elsewhere") shows through `toastSuccess`, because the shell has no info toast and adding one would be a foundation change. Pending images of that policy are dropped. The backend never answers 404; it answers 400 with the anchored texts in `lib/api/errors/insurance.ts`:
  - `^Insurance with id: \d+ not found\.$`
  - `^Insurance with Id: \d+ is already deleted\.$`
  - "does not have an insurance", already mapped to `policy`.
- **Primary:** deleting a Primary policy is allowed and has no extra prompt. The backend counts only Active policies for the Primary rule, so the slot frees up.
- **Copy:** grep first (`COMMON_MESSAGES.delete`). New strings go in `lib/shared/messages/insurance.ts`, verbatim from the AC/EXPERIENCE or marked DRAFT.
- **Quality:** axe light and dark with the dialog open (idle and busy), 44 px targets, keyboard-only, 360 px.

**Decisions (human, 2026-10-21):**
- **1B, already gone means removed, and say so:** the three "already gone" answers (already deleted, not found, not linked to the user) count as already removed: refresh and close with an info toast "This policy was already removed." (DRAFT). This replaces the AC's "a 404 is treated as already removed", because the backend never sends 404.

**Never:**
- Delete a Deleted policy, or one without an id.
- Delete card files on a policy delete (the backend leaves them; see Design Notes).
- Edit `features/shell/**`, `components/ui/*`, `lib/api/{index,keys}.ts` or `test/**` without asking.
- Push. Commit locally only, after the checks and the review.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Kebab | active card | "Edit", "Delete" (destructive); a Deleted card has no kebab | N/A |
| Confirm copy and focus | Delete | title, body with "{Insurer} {Type} Insurance", focus on Cancel; Escape → no request, focus on the kebab | N/A |
| Labelled Deleted | sole policyholder; 200 | refetch shows the muted Deleted card; toast; focus on the next card's kebab | N/A |
| Unlinked | other holders; 200 | refetch has no card; toast; focus on the next/previous kebab or "Add insurance" | N/A |
| Busy | request pending | spinner, "Deleting…", Escape/scrim ignored | N/A |
| Network failure | fetch fails | dialog closes; card unchanged; error toast with Retry; Retry deletes again without confirm | toast |
| Already gone | 400 "already deleted" / "not found" / "does not have an insurance" | refetch; dialog closes; toast "This policy was already removed."; no error; focus as on success | N/A |
| Pending image | a failed 5.3 upload of that policy in memory | dropped on success | N/A |
| Last card | only one active card, deleted (unlinked) | focus on "Add insurance" (the empty card's) | N/A |

</frozen-after-approval>

## Code Map

- `lib/server/proxy/allowlist/insurance.ts` (+ test): the `DELETE` entry. For tests, copy `allowlist/addresses.test.ts:298-345` (entry shape, forwarding, refusing a non-numeric id, a query or a body). Update the entry list (`insurance.test.ts:39-50`).
- `lib/api/insurance.ts` (+ test, 100 %): `insurancePolicyDeletePath(id)` and `deleteInsurancePolicy(id)`, like `insuranceUpdatePath` and `deleteAddress` (`lib/api/addresses.ts:398`).
- `lib/api/errors/insurance.ts`: the two anchored rules (to a key the feature can test, as Addresses' `isRemovedElsewhere` does).
- `features/insurance/policy-card.tsx`: `cardActions` (~l.87) gains Delete. Add a `kebabRef` per card (via the `RowActions` `kebabRef` prop) and an `onDelete` prop.
- `features/insurance/use-policy-delete.ts` (new): modelled on `features/contacts/contact-primary.tsx:84-178` (`useMakePrimary`), without SWR keys. It holds a `latest` ref, a single-flight ref, `busy`, a confirm that closes whatever the outcome, `toastError` with Retry, and `onCloseFocus` for the focus target.
- `features/insurance/insurance-section.tsx`: wires `onDelete`, the kebab-refs map and the empty card's "Add insurance" ref.
- `ConfirmDialog`: `components/ui/confirm-dialog.tsx:19-44` (`variant="destructive"`, `busy`, `busyLabel`, `onCloseFocus`).
- **Tests:**
  - unit: `features/insurance/policy-delete.test.tsx`;
  - e2e: extend `e2e/profile-insurance.spec.ts`, plus a `mockInsuranceDelete` fixture.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/insurance.ts` (+ test) -- the `DELETE` entry.
- [x] `lib/api/insurance.ts` (+ test), `lib/api/errors/insurance.ts` (+ test), `lib/shared/messages/insurance.ts` -- the delete call, rules and copy.
- [x] `features/insurance/*` (+ unit tests: every I/O row, axe light and dark) -- kebab, confirm, delete, focus, pending drop.
- [x] `e2e/fixtures/insurance.ts`, `e2e/profile-insurance.spec.ts` -- the journeys at desktop and 360 px.
- [x] `deferred-work.md` -- correct the 5.3 entry "older card files orphaned on policy delete": the backend's policy delete leaves **all** card files (its `deleteFiles()` is never called).
- [x] `sprint-status.yaml` (the `5-5` line only).
- [ ] After review (orchestrator): commit locally (no push), then the local-view `dev-mock.ts` (`DELETE v2/health/insurance/:id` with the backend's label-vs-unlink rule and its exact texts), and typecheck there.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100 % coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed.

## Implementation Notes

- **Allowlist:** `{ method: "DELETE", template: "v2/health/insurance/{insuranceId}" }` (numeric id, no query, no body). Tests: the entry shape, the forwarding of an empty 200, the relayed 400, and refusals of a non-numeric / negative / `me` id, a query and a JSON or text body (no upstream call).
- **`lib/api/insurance.ts`:** `insurancePolicyDeletePath(id)` (`null` unless a positive integer) and `deleteInsurancePolicy(id)` (never throws; a bad id sends nothing and fails with `insurance/deleteInsurancePolicy: not a policy id`). `callApi` already reads an empty 2xx body as a success.
- **Errors (decision 1B):** the two new anchored rules (`^Insurance with id: \d+ not found\.$`, the backend's `TYPE_INSTANCE_NOT_FOUND` with the type key "Insurance"; `^Insurance with Id: \d+ is already deleted\.$`, `INSURANCE_ALREADY_DELETED`) map to the existing `policy` field with the new key `insurance.policyAlreadyRemoved`. The feature's test is `isInsurancePolicyGone(mapped)` (`field === "policy"`), which covers "does not have an insurance" (5.2's `policyMissing`) too. Side effect for the 5.2 editor: if a `PUT` ever got one of the two new texts, it now closes the drawer and toasts "This policy was already removed." (its `policy` path) instead of the generic drawer error.
- **Copy (`messages/insurance.ts`):** verbatim `deleteTitle`, `deleteBody` ("{policy} will be removed from your profile.", `{policy}` = `insurancePolicyName`), `deleteConfirm`; DRAFT `deleting`, `policyDeleted`, `deleteNetworkFailure`, `deleteFailed`, `policyAlreadyRemoved`. The kebab item is `COMMON_MESSAGES.delete`.
- **`use-policy-delete.ts`:** `useInsurancePolicyDelete({ policies, refetch, addButtons })` → `{ open, kebabRef, dialog }`. `dialog` is the `ConfirmDialogProps` the Section spreads into `<ConfirmDialog />` (a `.ts` file per the Code Map; building the element in the hook trips the React Compiler `react-hooks/refs` lint). The order of the active cards is snapshotted at confirm (or Retry) time; after a removal focus goes to the next active card's kebab in that order, else the nearest previous one, else the empty card's "Add insurance", else the header's (only Deleted cards left: no empty card). The refetch is awaited while the confirm is busy, so the focus target is computed on the new list. Failure: no refetch, the confirm closes and `ConfirmDialog` returns focus to the kebab. Error text: network → "Couldn't delete insurance policy. Check your connection."; a mapped field rule → its message; 403 → `STATE_MESSAGES.noAccess`; anything else → "Couldn't delete insurance policy.". A session end shows nothing. Single flight is a per-policy id set (a second confirm or Retry meanwhile sends nothing).
- **`policy-card.tsx` / `insurance-section.tsx`:** `cardActions` adds `{ id: "delete", destructive: true }` for a policy with an id; the card takes `onDelete` and `kebabRef` (`RowActions kebabRef`). The Section wraps the empty card in a `div` ref and finds its button (`EmptyState` takes no action ref, and `components/ui` is off-limits).
- **Tests:** unit `features/insurance/policy-delete.test.tsx` (35: the helpers, the kebab, confirm copy and focus, Escape / Cancel, labelled Deleted, unlinked, previous-kebab and both "Add insurance" fallbacks, Primary, busy, pending images, network failure + Retry, other failure + failed Retry, single flight, session end, the three "already gone" texts, a failed refetch, axe light and dark idle and busy, 44 px at 360 px); `lib/api` and allowlist tests above; e2e `Delete a policy (Story 5.5)` (6 journeys × desktop and 360 px, the keyboard one desktop only) with the fixture `mockInsuranceDelete(page, answer)`.
- **Review fixes (pass 1, coordinator):**
  - The two "already gone" rules now map to `insurance.policyMissing` (the 5.2 editor and 5.4 demotion keep their policy-gone handling; tests for each text); the delete's own toast still reads "This policy was already removed.".
  - After a removal the list is read with `fetchInsurance()` and written into the key (`store`); if that read fails, the cached policy is marked Deleted (no kebab) until the next revalidation. Once the DELETE went through, nothing is reported as a failure (each local step is guarded). `deleteInsurancePolicy` counts a 2xx with a non-JSON body as a success.
  - Retry only for network, 5xx and unknown failures (`insuranceDeleteRetryable`, `retryable: false` respected); a 403, a proxy refusal or another 4xx shows its text in a toast without Retry (`toastPartial`, the 5.3 precedent). A field rule of another request reads "Couldn't delete insurance policy.".
  - One failure toast per policy (dismissed when a new attempt starts or the policy is removed). While a policy's delete is in flight its kebab's "Delete" is `aria-disabled` with "Deleting…" and `open()` refuses.
  - Retry uses the order snapshotted when the delete was asked for, closes an editor holding the policy (`onRemoved` → `editor.discard()`), and moves focus only if it is on the body or the toast region.
  - The confirm keeps its last policy name while it closes. The unit scrim check is unconditional; the 44 px check at 360 px lives in the e2e (measured). `mockInsuranceDelete` counts attempts per id and returns `{ requests, deleted }`.
  - `deferred-work.md` (Team A): the unlinked-delete card images (row 14) and the missing info toast tone (row 15).
- **Verification (Node 24.22.0, implementer):** lint, typecheck, `check-forbidden` clean; `vitest run --coverage` 7143 tests (232 files), thresholds met; `pnpm build` passed; `CI=1 pnpm test:e2e` (port 3410, machine load ~16): 1128 passed, 16 skipped, 16 flaky (passed on retry; all outside Story 5.5 but the known 5.2 keyboard-only flake), 2 failed: `account-authenticator.spec.ts:19` (Team B, 8.1 tiles, "expected 5 tiles, got 0" under load); that spec alone then passed 25/25. `profile-insurance.spec.ts --repeat-each=2`: 151 passed, 8 skipped, 1 flaky (5.4 "a failed rollback is named", then 16/16 alone with `--repeat-each=8 --retries=0`); the 5.5 journeys never flaked.

- **Orchestrator:**
  - **Footprint check:** the implementer's safety classifier timed out once, so its footprint was checked by hand: only Team A paths changed, no commits, nothing pushed, the local-view worktree and settings untouched.
  - **Spec 5.3 corrected:** its Design Notes now say the backend's policy delete leaves every card file (review row 13).
- **Final verification (orchestrator, Node 24.22, quiet machine):**
  - Lint, typecheck and `check-forbidden` are clean.
  - Vitest: 7167/7167 (232 files), 100 % on `lib/server`, `lib/api` and `lib/shared`.
  - `pnpm build` passed.
  - `CI=1 pnpm test:e2e`: 1145 passed, 16 skipped, 1 flaky (the Phone axe test fixed on `main` by #36; this branch gets the fix with its next rebase).

## Spec Change Log

- **2026-10-21, approval (human decision 1B):** the AC's "a 404 is treated as already removed: the list refetches with no error" becomes: the backend's three 400 "already gone" answers ("Insurance with Id: … is already deleted.", "Insurance with id: … not found.", "Patient with id: {…} does not have an insurance with id: {…}") are treated as already removed, with the info toast "This policy was already removed." (DRAFT). The backend's delete path never answers 404. Known-bad state avoided: an "already gone" policy reported as a failure with a useless Retry.

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG, no findings).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B | A failed refetch after a 200 leaves the card active with its kebab while the toast says "Insurance policy deleted." (`read.mutate()` doesn't reject, and the frame keeps the cached data) | medium | Real → **patch**: after a 200, refetch through `fetchInsurance()`; on failure, update the cached list locally so that policy reads Deleted (no kebab) until the next revalidation; replace the test that locks the old behaviour. |
| 2 | B | The two new error rules apply to every insurance request, so the editor's `PUT` (5.2) and the demotion (5.4) now show "This policy was already removed." for them | medium | Real side effect → **patch**: map the two texts to the existing `insurance.policyMissing` key (editor and demotion keep "This policy is no longer on your profile." / their 5.4 handling); the delete chooses its own "This policy was already removed." text via `isInsurancePolicyGone`; add editor and demotion tests for the two texts. |
| 3 | E, B | Confirming while a toast Retry of the same policy is in flight closes silently, with no request and no feedback | medium | Real → **patch**: while a policy's delete is in flight, its kebab Delete is unavailable (`disabledReason` "Deleting…", DRAFT), and `open()` refuses; test it through the real `sending` guard. |
| 4 | B | The error toast's handle is dropped: a later attempt leaves the stale toast and its Retry (which then sends a second `DELETE`), and repeated failures stack | low | Real → **patch**: one error toast per policy id, dismissed when a new attempt starts or the policy is removed. |
| 5 | B | Retry is offered when it can't help (forbidden, proxy refusals, `retryable: false`) | low | Real → **patch**: Retry only for network, 5xx and generic failures; others show the message without Retry. |
| 6 | B | A non-`policy` field mapping toasts editor copy (e.g. the Member ID rule) | low | Real → **patch**: fall through to "Couldn't delete insurance policy."; fix the test that locks it. |
| 7 | B | The catch-all can report "Couldn't delete" after the `DELETE` already succeeded (a later step threw) | low | Real → **patch**: after a successful `DELETE`, never report a failure. |
| 8 | E | Retry recomputes the card order, so after a revalidation the focus can jump to "Add insurance" though cards remain | low | Real → **patch**: snapshot the order when the delete fails, and use it on Retry. |
| 9 | B | A toast Retry ignores the open editor and pulls focus from wherever the user is | low | Real → **patch**: close the editor if it holds that policy; move focus only if it is still on the toast or on `body`. |
| 10 | E | The confirm body blanks out during the dialog's exit animation | low | Real; direct → **patch**: keep the last name for the closing dialog. |
| 11 | B | Weak tests: the scrim check is skipped when the overlay isn't found; the 360 px test checks only a class; the "second confirm" step clicks a busy button | low | Real → **patch**: assert the overlay unconditionally; measure the 44 px targets; exercise the guard through the in-flight path (row 3). |
| 12 | B | e2e `mockInsuranceDelete` counts attempts across all policies and records refused requests as "deleted" | low | Real test hygiene → **patch**: count per id and name it for what it records. |
| 13 | B | Spec 5.3's Design Notes still say a policy delete removes the newest card files | low | Real doc error → **patch** (orchestrator): correct the 5.3 note. |
| 14 | B | The confirm says "will be removed from your profile" although the labelled outcome keeps a Deleted card, and in the unlinked outcome the user's uploaded images stay on the shared policy without notice | low | The confirm copy is the AC's (verbatim) → rejected. The images left on a shared policy are a product question → **defer** (PM/backend). |
| 15 | B | "This policy was already removed." uses the success toast tone | low | Accepted at decision 1B (no info tone exists) → **defer** (Foundation: an info toast variant). |
| 16 | B | The spec file isn't in the diff | false | Excluded on purpose (it is the claims file); it is committed with the story. |

## Design Notes

**Backend facts** (1h-ng-bo-core-be, read 2026-10-21):
- **Endpoint:** `InsuranceResource.java:21-25` returns `void` (200). `AbstractInsuranceDeleteFactory` finds the policy joined to the caller (else "not found"), validates that the caller is a subscriber (else "does not have an insurance"), and refuses an already Deleted one.
- **Label vs unlink:** `isDeletionAllowedForPerson` (`InsuranceServiceImpl.java:296-327`) labels the policy Deleted when the caller is the only subscriber, or is SELF with no other SELF subscriber. Otherwise it only removes the caller's link (the card goes).
- **Files:** none are touched (`deleteFiles()` is never called). Nothing is hard-deleted.
- **Primary:** there is no Primary rule on delete. A Deleted Primary doesn't count for `checkExistingPrimaryInsuranceByPatientIdAndType`.

**Agent decisions:**
- **Retry:** Retry needs no second confirm (the user already confirmed).
- **Primary:** deleting a Primary needs no extra warning.
- **Focus:** if there is no next card, focus goes to the previous card's kebab.

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; also put `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/af4a8bf2-5800-44b7-adc9-13891a6c3dc2/scratchpad/shim` first; the implementer makes no commits; never `pnpm dev` here; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
