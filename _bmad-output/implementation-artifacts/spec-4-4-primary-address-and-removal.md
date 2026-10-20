---
title: 'Story 4.4: Primary address and removal'
type: 'feature'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_commit: '44b5b156523bf6fda74003d6413db837a318d2f5'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Addresses (Stories 4.1–4.3) can be added and edited, but "Set as primary" isn't exclusive, there's no Make primary or Remove, and nothing stops a user from ending with no Primary address. Separately, editing an address that another client removed fails with an unmapped generic error, and Retry repeats the same failing `PUT` (deferred item, spec 4.2 review row 10). Source: Story 4.4 (FR27, NG-9026) in `epics.md` "### Story 4.4: Primary address and removal".

**Approach:** Finish `features/addresses` with the Phone/Email row kit: an exclusive Primary checkbox with the auto-Primary rule, a read-view Make primary that saves at once, and Remove/Restore with disabled reasons, all checked against the draft. Section save adds `DELETE v2/person/location/{id}` as the last steps. A "removed elsewhere" answer is mapped to its own message, and that row leaves the form, so Retry never sends it again.

## Boundaries & Constraints

**Always:**
- **Primary in edit:**
  - Checking "Set as primary" on a row unchecks it on every other row.
  - Whichever row is checked in the draft can't be unchecked. Its checkbox is `ariaDisabled`, focusable and described by a Tooltip (`keepOpenOnPress`, `aria-describedby`) reading "Set another address as primary first" (`ADDRESS_MESSAGES.primaryFirst`).
  - When exactly one non-removed row remains (the first address added, or after removals), it is set Primary in the form and sent with `primary: true`. Its checkbox shows checked with the same disabled pattern.
  - The collapsed rows' Primary chip follows the form.
- **Read-view kebab:**
  - A non-Primary saved row (id, not a repeat) shows "Make primary", "Edit", "Remove". The Primary row shows "Edit" and "Remove".
  - Remove carries `disabledReason` "Make another address primary first" on the Primary row and "You need at least one address" when it is the only address.
- **Make primary (read view):**
  - No confirm. One `PUT` of the row with `primary: true` (decision 1B): the backend demotes the old Primary itself.
  - Guarded against a second run while sending. It never runs in edit mode.
  - Success refetches the list, shows "Addresses saved." (`SECTION_MESSAGES.saved`) and focuses the Section `h2`.
  - Failure shows `toastError(text, { onRetry })`. Retry re-reads the latest rows and sends only what is still needed; if the target is already Primary, nothing is sent.
- **Remove:**
  - From the read-view kebab, Remove enters edit with that row struck through ("Removed on save", Restore), focus on Restore. In edit, `RowRemoval` gives Remove/Restore.
  - A new row is deleted outright. No confirm, toast or undo.
  - The reasons above are re-evaluated against the draft (after checking another row's box, the old Primary's Remove becomes available).
  - A removed row is held as `removed: true` on the form row (optional in the schema, so older drafts still parse). It is never validated, never counts as a duplicate, and isn't sent as a `PUT`.
- **Save order:**
  - The newly Primary row first (`PUT`, or `POST` if new), then the other `PUT`/`POST`, then one `DELETE` per removed saved row.
  - `runSaveSteps` keeps `mode: "stop"`. After a failure, `mergeAddressRows` drops the rows whose `DELETE` succeeded and keeps the unsent removals struck.
- **Removed elsewhere:**
  - The backend's `Operation failed. Location with id: '…' is not related to '…' with id: '…'.` maps (anchored rule, `lib/api/errors/addresses.ts`) to "This address was removed elsewhere, so your changes to it weren't saved." (DRAFT). It shows at Section level with Retry.
  - After the refetch, any saved row the refetch no longer holds leaves the form, so Retry sends only the rest; if nothing is left to send, Retry just closes the edit.
  - A `DELETE` answered with that error counts as done, because the address is already gone.
  - On Make primary it shows as the toast text, with no Retry, and the list refetches.
- **Proxy:** `{ method: "DELETE", template: "v2/person/location/{locationId}" }` in `allowlist/addresses.ts`. It takes no query and no body; the id is numeric only.
- **Copy:** grep first. New strings go in `lib/shared/messages/addresses.ts`, marked `// DRAFT COPY`.
- **Quality:** axe light and dark, 44 px targets, 360 px with no horizontal scroll.
- **Local view:** after the commit, fast-forward `../personal-profile-local-view` and give `dev-mock.ts` a `DELETE v2/person/location/:id`. It soft-deletes; deleting the Primary is refused with `SET_PRIMARY_LOCATION`, and an unknown or removed id is refused with "not related". Never commit that worktree.

**Decisions (human, 2026-10-20):**
- **1B, one `PUT` for a Primary change:** a deliberate change to the frozen AC (which says to `PUT` the old Primary with `primary: false` afterwards). The backend already demotes the old Primary when another address gets `primary: true`. So Make primary sends one `PUT`. Section save follows the same rule: the old Primary is never sent just because its box was unchecked by the move, only when another of its fields changed. The local-view mock and the tests reflect this.
- **2A, removed elsewhere:** the row leaves the form, the Section shows "This address was removed elsewhere, so your changes to it weren't saved." (DRAFT), and Retry sends the rest.
- **Full spec kept** (about 2,700 tokens).

**Never:**
- Edit `features/shell/**`, `components/ui/**`, `lib/api/{index,keys}.ts`, `lib/server/**` (except `allowlist/addresses.ts` and its test) or `test/**` (except `test/page-handlers/profile.ts`) without asking first.
- Add a confirm to Make primary or Remove.
- Build the two draft-restore items (rebase onto saved rows; `validated` reset). They stay deferred.
- Push. Commit locally only, after the checks pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First address | no saved rows; Add, fill, Save | `POST` with `primary:true`; box checked + disabled | N/A |
| Move Primary in edit | A Primary, B saved; check B; Save | A unchecked; `PUT B primary:true` only (A is sent only if another field of A changed, then after B) | N/A |
| Uncheck Primary | press A's checked box | no change; tooltip "Set another address as primary first" | N/A |
| Make primary | read view, B's kebab | one `PUT B {primary:true}`, refetch, B on top, "Addresses saved.", h2 focused | `PUT` fails → toast + Retry; Retry re-checks and sends nothing if B is already Primary |
| Remove | B's kebab Remove | edit mode, B struck "Removed on save", focus Restore; Save → `DELETE B` last | N/A |
| Remove guards | Primary row / only row | Remove `aria-disabled` with its reason; activation does nothing | N/A |
| Remove the Primary after moving | check B, then remove A | A's Remove enabled; Save: `PUT B`, (`PUT A` skipped as removed), `DELETE A` | N/A |
| Fail mid-save | step 2 of 3 fails | step 3 not sent; refetch; rebase; error + Retry; Retry sends steps 2–3 only | mapped error |
| Removed elsewhere (`PUT`) | edited row deleted on another device | Section message; row leaves the form; Retry sends the rest | anchored rule |
| Removed elsewhere (`DELETE`) | removed row already gone | counted as done; save succeeds | N/A |

</frozen-after-approval>

## Code Map

- `features/addresses/addresses-section.tsx`:
  - `PrimaryField` (~l.542): make it exclusive (`setValue` on the other rows' `primary`), add `ariaDisabled` with a Tooltip reason.
  - `addressEditColumns` (~l.661): add the `RowRemoval` actions column and the Status column's `RowEditStatus` (`removed`/`new`); `SectionTable rowState`.
  - Read-view kebab (~l.1057).
  - `save()` (~l.778): add the DELETE steps, the removed-elsewhere detection, `failedRow.setRow(null)` for a dropped row.
  - Add `makePrimary` (with `latest*` refs, a `sending` ref) and `removeRow`, which follows Phone's `startEdit({ focus })` + `rowsControl.onChange` pattern.
- `features/addresses/schema.ts`:
  - `removed` (optional boolean) on the row.
  - `isAddressRowChanged` / `isAddressRowSent`: removed rows are never `PUT`; new removed rows don't exist.
  - The validation skips removed rows; the duplicate keys ignore them.
  - The draft diff names "Removed on save".
- `features/addresses/save.ts`:
  - `addressRowsToSend` returns writes only; add an `addressRowsToDelete` (saved, removed, with id).
  - `mergeAddressRows`: drop succeeded deletes and any saved row missing from the refetch; keep `removed` as a user field (`EDITED_FIELDS`).
- `lib/api/addresses.ts`: `addressDeletePath(id)` (positive integer, else `null`), `deleteAddress(id)` (never throws), `addressPrimaryBody(primary, validated)` for Make primary.
- `lib/server/proxy/allowlist/addresses.ts` (+ test): the DELETE entry. Today's test line ~285 expects DELETE → 405; change it to allowed, plus non-numeric id, query and body refusals.
- `lib/api/errors/addresses.ts`: `Field` gains `"row"`. Add the anchored "not related" rule → `addresses.removedElsewhere`.
- `lib/shared/messages/addresses.ts`: `removedElsewhere`, `onlyAddress` ("You need at least one address"), `makeAnotherPrimaryFirst` ("Make another address primary first"). `primaryFirst` exists.
- Reuse from `features/shell` / `components/ui`:
  - `RowActions` (`disabledReason`, `destructive`), `RowRemoval`, `RowEditStatus`, `runSaveSteps`, `toastSuccess`/`toastError`.
  - `Checkbox ariaDisabled`, `Tooltip keepOpenOnPress`.
  - Phone's `features/contacts/contact-primary.tsx` `useMakePrimary` as the model, without its ConfirmDialog.
- Tests:
  - `features/addresses/addresses-section.edit.test.tsx` (MSW in-file): add `addresses-section.primary.test.tsx`.
  - Extend `save.test.ts`, `schema.test.ts`, `lib/api/addresses.test.ts`.
  - E2E: `e2e/fixtures/addresses.ts` gains `mockAddressDelete` (Team A file); `e2e/profile-addresses.spec.ts` gets UJ-4's tail (Make primary, remove the old one).

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/addresses.ts` (+ test) -- DELETE entry -- removal needs it.
- [x] `lib/api/addresses.ts`, `lib/api/errors/addresses.ts`, `lib/shared/messages/addresses.ts` (+ tests, 100 %) -- delete call, primary body, removed-elsewhere rule, copy.
- [x] `features/addresses/schema.ts`, `save.ts` (+ tests) -- `removed`, order with deletes, merge rules.
- [x] `features/addresses/addresses-section.tsx` (+ new `addresses-section.primary.test.tsx`) -- exclusivity, auto-Primary, Make primary, Remove/Restore, reasons, every I/O row, axe.
- [x] `e2e/fixtures/addresses.ts`, `e2e/profile-addresses.spec.ts` -- `mockAddressDelete`; UJ-4 tail, guards, removed elsewhere, 360 px.
- [x] `deferred-work.md` (mark the 4.2 "removed elsewhere" item resolved) and `sprint-status.yaml` (the `4-4` line only).
- [ ] After review (done by the orchestrator, not the implementer): commit locally (no push), then update the local-view worktree and `dev-mock.ts`, and typecheck there.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100 % coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given Vitest, when it runs, then it covers: auto-Primary for a single address, checkbox exclusivity, request order (new Primary → other `PUT`/`POST` → `DELETE`), a failure on step 2 that refetches and retries only the rest, and the disabled reasons for the Primary and the last address.
- Given the diff against the baseline, when listed, then only Team A paths changed, or each other path was approved by the user and is in its own commit.

## Implementation Notes

- **Helpers:** `withAutoPrimary`, `withAddressRemoved` and `isAddressRowRemoved` in `schema.ts`; `addressRowsToDelete` and a `deleted` set in `mergeAddressRows` in `save.ts`. The `removed` key is absent rather than `false` after a Restore, so a Remove then Restore leaves the form clean.
- **1B in Section save:** `isAddressRowSent` compares a demoted old Primary as if it were still Primary, so the old Primary is sent only when another of its fields changed. The in-file mock backends of the edit test now demote the old Primary as the real backend does. Three 4.2 tests changed because the behaviour changed: the kebab items, the header-Edit cells, and the Primary-rule test, which is now triggered by a `PUT`.
- **Primary checkbox:** `Checkbox ariaDisabled` inside a Tooltip that is always mounted (empty and hidden while unlocked), so checking a box doesn't remount it and lose focus. The reason is also an sr-only span named by `aria-describedby`.
- **Remove reasons:** "You need at least one address" takes priority over the Primary reason, as in Phone. A first new address (nothing saved yet) can still be removed. A struck row collapses and can't be expanded. A failed `DELETE` shows its error at Section level.
- **Deviation:** `toastError` always shows Retry (`features/shell/toasts.ts`, foundation). On the removed-elsewhere toast after Make primary, Retry therefore only reloads the list, instead of having no Retry.
- **Verification (implementer, Node 24.22):** lint, typecheck and `check-forbidden` are clean; `vitest --coverage` is green with thresholds met; `pnpm build` passed; `CI=1 pnpm test:e2e` gave 978 passed, with the known `e2e/primitives.spec.ts:75` mobile-360 flake passing on retry. The orchestrator re-ran the Addresses unit files: 332/332.
- **Review pass 1 patches** (triage rows 1–13): the removed-elsewhere row also leaves the form when the refetch fails; only sendable rows (`isAddressRowSendable`) count for the last-address rule and auto-Primary; the edit entry points wait while a Make primary is in flight; focus moves to the `h2` after a new row is deleted outright; the sole row's box reads "Your only address is your primary address" (DRAFT); Make primary's Retry re-reads the list first (`makePrimary(key, true)`, needed for the stale-list case); smaller cleanups and the missing tests. Rows 14, 20 and 25 are in `deferred-work.md`.
- **Final verification (orchestrator, Node 24.22):** lint, typecheck and `check-forbidden` are clean. Vitest: 6146/6146 passed (215 files), 100 % on `lib/server`, `lib/api` and `lib/shared`. `pnpm build` passed. `CI=1 pnpm test:e2e`: 977 passed, 11 skipped, 2 flaky that passed on retry: the known `primitives.spec.ts:75`, and `profile-phone.spec.ts:324` (axe under load; 8/8 alone, logged in `deferred-work.md`).

## Spec Change Log

- **2026-10-20, approval (human decision 1B):** the AC's "then `PUT` the old Primary with `primary=false`" (Make primary) and "Move Primary in edit → `PUT A primary:false`" are dropped. The backend's `PersonLocationFactory.verifyPrimaryLocation` already unsets the old Primary when another location is written with `primary: true`, so the second request is redundant; it would also bump the old address's updated date and move it up the list. Known-bad state avoided: a redundant request that reorders the list and can fail after the change already applied. KEEP: the new Primary is still written first, and Retry re-reads the latest rows.

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | E, E-claim | A `PUT` answered "removed elsewhere" while the refetch also fails: no rebase, so the row stays and Retry repeats the doomed `PUT` | low | Real: only `mergeAddressRows` drops it; the no-rebase branch keeps it. A direct fix → **patch**: in the no-rebase branch, drop the failed row when its error is removed-elsewhere. |
| 2 | E, B, E-claim | Counts and auto-Primary include rows that can't be sent or removed (id-less, repeat): `remaining`, the read-view `rows.length` and `withAutoPrimary`'s kept row differ from `removeRow`'s guard | low | Real (needs a duplicated or id-less row from the API), but a direct correction → **patch**: count, and auto-promote, only new rows and saved rows with an id (not repeats), the same way in the read view, edit view, `removeRow` and `withAutoPrimary`. |
| 3 | E, B | Edit can start while a Make primary is in flight: success then focuses the `h2` and toasts over the edit view, and a kebab Remove of that row can strike the new Primary (its `DELETE` is then refused) | low | Real; a direct guard → **patch**: while a Make primary is in flight, the edit entry points (header Edit, Add address, kebab Edit, kebab Remove) do nothing. |
| 4 | E | Deleting a new row outright drops keyboard focus to `body` | low | Real (the focused Remove unmounts), met in everyday keyboard use → **patch**: focus the Section `h2` after the outright delete. |
| 5 | B | The sole row's locked box says "Set another address as primary first" although no other address exists | low | Real and met by every one-address user → **patch**: a sole-row reason "Your only address is your primary address" (DRAFT COPY); update the "First address" test. |
| 6 | B | `refreshAddresses`'s doc says "a failure is left to the next read" but it calls `addresses.mutate()` | low | Real comment mismatch → **patch**: correct the comment. |
| 7 | B | The resolved deferred item keeps a stale `evidence` line, and the shipped copy differs from its DRAFT | low | Real → **patch**: put the resolution in its own `resolution:` line (as other entries do) naming the shipped copy and the merge change. |
| 8 | B | The "already gone" `DELETE` returns `{ success: true, statusCode: 400 }` | low | Real mixed signal → **patch**: leave `statusCode` out. |
| 9 | B | The test "Removed elsewhere (PUT) … Retry sends the rest" has an unused `create`/`failing` setup and a misleading title | low | Confirmed (no POST happens) → **patch**: remove the setup and rename it ("… Retry just closes the edit"). |
| 10 | B | `makePrimaryFailureText` shadows `section` with a string | low | Real readability issue → **patch**: rename it `sectionName`. |
| 11 | VG, B | Untested: save-time auto-Primary of a legacy sole non-Primary row (and that opening Edit alone stays clean) | low | Gap as filed → **patch**: a test. |
| 12 | VG | Untested: Make primary's stale-list branch (Retry after the row left the list) | low | Gap as filed → **patch**: a test. |
| 13 | VG, B | Untested: the single-flight guard and Retry while in edit view; the field-message branch of `makePrimaryFailureText` | low | Gap as filed → **patch**: tests, including row 3's guard and a mapped field answer. |
| 14 | VG | Untested: deleted rows leaving the form when the refetch also fails | low | Masked by "already gone counts as done"; only one redundant request → **defer** (as filed). |
| 15 | B, E, E | Struck old Primary while the new Primary's `PUT` is removed elsewhere: Retry's `DELETE` is refused (`SET_PRIMARY_LOCATION`) | low | Real but needs a concurrent removal, and it is recoverable: the refusal maps to "Set another address as primary first" at Section level, and checking another row fixes it. The fix adds re-normalisation branches → rejected. |
| 16 | E | Restore after an auto-promote leaves the other row Primary (dirty) | low | Only with legacy data that has no Primary at all; promoting is harmless → rejected. |
| 17 | E | Save-time auto-Primary can `PUT` an unvalidated row | false | The handlers already apply the rule, so the row is changed and validated before Save; the save-time call only touches a row the user edited (validated). |
| 18 | E, B | The Make primary toast's Retry pressed in edit view does nothing, with no feedback | low | Needs a failure toast kept open across entering Edit; the fix adds a branch → rejected. |
| 19 | B | Make primary has no busy state; a second press is dropped silently | low | A `PUT` plus refetch is short and the result is toasted; busy UI is new surface → rejected. |
| 20 | B | The removed-elsewhere toast's Retry only reloads (misleading), and the stale-list branch says "removed elsewhere" without asking the server | low | The stale branch reads refetched server data, so the text holds. A toast without Retry needs `toastError` options in `features/shell` → **defer** (Foundation). |
| 21 | B | `primaryFirst` and `makeAnotherPrimaryFirst` say the same thing differently | false | Both texts are mandated by the AC (checkbox and Remove), from EXPERIENCE.md Voice and Tone. |
| 22 | B | Removing a new row clears every row's errors | low | Same as Phone; errors return on the next blur or Save → rejected. |
| 23 | B | `mergeAddressRows` drops a saved row that fell off the 100-row page | low | Needs more than 100 addresses; a guard adds complexity → rejected. |
| 24 | B | The e2e mock allows `DELETE` of the current Primary; no e2e for move-then-remove | low | The order is unit-tested against a backend-faithful mock (`addresses-section.primary.test.tsx` "Remove the Primary after moving") → rejected. |
| 25 | B | The always-mounted empty Tooltip is a workaround; its unlocked state is untested | low | Works and passes axe; a `disabled` prop on Tooltip is foundation → **defer** (Foundation). |

## Design Notes

- **Agent decisions:**
  - **Auto-Primary:** auto-Primary is written into the form by the row-changing handlers (add, remove, restore) and again in `save()`. Legacy data with a sole non-Primary address is therefore fixed on its next save, and opening Edit alone doesn't make the form dirty.
  - **Duplicates:** removed rows don't count, because the backend has no uniqueness rule.
  - **Make primary on a stale list:** if the kebab's row is gone from the refetch, the toast shows the removed-elsewhere text.
- **Removed-elsewhere detection:** compare the mapped error (`kind: "field"`, `messageKey: "addresses.removedElsewhere"`). Dropping happens in the merge (a row missing from the refresh), so it doesn't depend on the error text. The rule only picks the message.

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin` (the default `node` is 26); the implementer makes no commits; `corepack pnpm` if `pnpm` isn't on `PATH`; never `pnpm dev` here; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass (the known `e2e/primitives.spec.ts:75` foundation flake aside)
- In `../personal-profile-local-view`: `pnpm typecheck` -- expected: clean
