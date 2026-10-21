---
title: 'Story 5.4: Primary per type with demote offer'
type: 'feature'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
baseline_commit: '20354967dda7ba1eed72ddbebc7edcfd2c928040'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-card-image-upload-with-retry.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A patient who makes a policy Primary while another policy of the same type is already Primary gets the backend's refusal on Precedence (Story 5.2's stopgap). There's no way to move Primary in one step (Story 5.4, FR29, NG-9029; acceptance source: `epics.md` "### Story 5.4: Primary per type with demote offer").

**Approach:** When the editor's Type + Precedence would make a second Primary of a type, show an info banner that offers to make the other policy (or policies) Secondary. Once the user accepts, Save demotes the other policy, then saves this one, then uploads images (5.3), as decided in 1A. If this policy's save fails after a demotion, the demotion is rolled back (2A).

## Boundaries & Constraints

**Always:**
- **Conflict** (computed in `features/insurance`, pure + tested):
  - The form's Precedence is `PRIMARY` and its Type is T.
  - The conflict is every non-Deleted policy in `keys.insurance()` with type T and precedence `PRIMARY`, other than the one being edited.
  - Legacy data with more than one conflicting policy names all of them and demotes all of them.
  - Editing the current Primary without changing its type shows no banner. Changing its type to one that already has a Primary does.
- **Banner:**
  - It sits in 5.2's slot, right after Type + Precedence: `InlineBanner variant="info"` reading "Only one primary {Type} policy. Make {insurer} secondary?". With several, the insurers are joined ("Make Aetna and Cigna secondary?"; DRAFT for the plural).
  - The action is an outline `Button` "Make {insurer} secondary" (`aria-pressed`). Pressing it accepts the demotion and shows the muted note "The change saves with this policy.". Pressing it again un-accepts.
  - Changing Type or Precedence re-evaluates the conflict and clears the acceptance.
  - Nothing goes to drafts or `localStorage`.
- **Save blocked:** with a conflict and no acceptance, `validate()` is invalid. Nothing is sent, focus moves to the banner's button, and an error line under the banner reads "Only one primary {Type} policy is allowed. Make {insurer} secondary, or choose another precedence." (DRAFT). The guard's Save behaves the same way.
- **Demotion request:** `PUT v2/health/patient/insurance/{otherId}` with the other policy's current values and `insurancePrecedence: "SECONDARY"`.
  - The body is built with 5.2's builders from that policy: `toInsuranceFormValues`, then `toInsurancePolicyInput` with its saved subscriber locked and unchanged and `typed=false`, with only the precedence changed.
  - If that policy's saved values can't make a valid body (e.g. a legacy `N_A` type or a missing member ID), nothing is sent. The editor shows "Couldn't make {insurer} secondary. Edit that policy first." (DRAFT), at drawer level.
- **Order (decision 1A):** the demotion(s) first, then the policy `POST`/`PUT`, then the images. If a demotion fails, nothing else is sent: the earlier demotions are rolled back as below, and the editor shows the error with Retry.
- **The policy save fails after the demotion(s) (decision 2A, roll back):**
  - Re-promote every demoted policy with a `PUT` back to `PRIMARY` (the same body, precedence restored). Then show the policy's error, mapped as in 5.2, with Retry. Retry runs the whole flow again.
  - If a rollback fails, the error also names it: "{insurer} is now secondary." (DRAFT). After the refetch that policy is Secondary, so the conflict and banner for it are gone, and Retry sends only what is left.
- **In every case:**
  - Images (5.3) go only after the policy itself saved.
  - The list is refetched after any partial outcome.
  - The editor stays open with a drawer-level error and Retry. Retry sends only what is still needed: the rebased state decides whether the conflict and the demotion are still there.
- **No conflict:** no banner and no demotion request, as before.
- **Success:** the list refetches. The new or edited card shows the Primary chip and the old one reads Secondary. "Insurance saved." (or 5.3's partial toast) shows and the drawer closes.
- **Copy:** grep first. New strings go in `lib/shared/messages/insurance.ts`, DRAFT unless verbatim (the banner text, the button and the note are verbatim from the AC/EXPERIENCE).
- **Quality:** axe light and dark with the banner (accepted, not accepted, error), 44 px targets, keyboard-only, 360 px.

**Decisions (human, 2026-10-21):**
- **1A, demotion first:** demote the other policy (or policies), then save this one, then upload the images. This is a deliberate change to the AC (which says policy, then demotion), because the backend refuses a second Primary of the same type. See the Spec Change Log.
- **2A, roll back:** if this policy's save fails after a demotion, re-promote the demoted policies. If a rollback fails, the error says so.
- **Full spec kept** (about 2,500 tokens).

**Never:**
- Demote a Deleted policy, or the policy being edited.
- Send a typed subscriber on the demotion `PUT` (the saved one only, decision 2C/3A of 5.2).
- Upload images before the policy saved.
- Edit `features/shell/**`, `components/ui/*`, `lib/api/{index,keys}.ts` or `test/**` without asking.
- Push. Commit locally only, after the checks and the review.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Banner | Add, Medical + Primary; Blue Shield is Primary Medical | banner + "Make Blue Shield secondary" | N/A |
| Not same type / Deleted | Dental Primary only; or the Medical Primary is Deleted | no banner | N/A |
| Edit current Primary | edit Blue Shield, keep Primary Medical | no banner | N/A |
| Type change | edit a Primary Dental to Medical | banner for Blue Shield | N/A |
| Legacy two Primaries | Aetna and Cigna both Primary Medical | banner names both; both demoted | N/A |
| Not accepted | Save with the banner unaccepted | nothing sent; focus on the button; error line | inline |
| Re-evaluate | accept, then change Precedence to Secondary | banner gone; acceptance cleared | N/A |
| Happy path | accepted, Save | `PUT` the other policy SECONDARY, then the policy `POST`/`PUT`, then the images; refetch shows the new Primary and the old Secondary | N/A |
| Demotion fails | the demotion `PUT` 500s | the policy isn't sent; editor error + Retry; Retry demotes again | drawer |
| Policy save fails after the demotion | demotion ok, policy `POST` 400 | rollback `PUT` the other policy PRIMARY; the policy error + Retry; Retry demotes and saves again | drawer |
| Rollback fails too | demotion ok, policy fails, rollback 500 | error also says "{insurer} is now secondary."; refetch; Retry sends only the policy (no conflict left) | drawer |
| Unbuildable demotion | the other policy has an `N_A` type | nothing sent; "Couldn't make {insurer} secondary. Edit that policy first." | drawer |

</frozen-after-approval>

## Code Map

- `features/insurance/primary-conflict.ts` (+ test, new): `insurancePrimaryConflicts(policies, editingId, type, precedence)` → the conflicting policies; `insuranceDemotionInput(policy)` → the demotion body or `null` when it can't be built.
- `features/insurance/use-insurance-editor.ts`:
  - **State:** the acceptance (reset on any Type/Precedence change).
  - **`validate()`:** a conflict without acceptance gives invalid with focus on the banner button.
  - **`sendOnce`:** the demotion step(s) in the decided order (1A), the rollback (2A), refetch and rebase.
  - **Telemetry:** stays one `section_save` per save.
  - Today `sendOnce` sends one `POST`/`PUT` (~l.389-391), then `uploadImages` (5.3). Model the step order and the rebase on `runSaveSteps(steps, { scope: "insurance", mode: "stop" })` (`features/shell`), or sequence by hand, whichever keeps the images-after-the-policy rule clear.
- `features/insurance/policy-editor.tsx`: the banner in the slot marked `{/* Story 5.4: … */}` (~l.365). Use `InlineBanner variant="info"` with the outline `Button` as `action`, and `FieldError` for the line under it.
- `features/insurance/dto.ts`: `toInsuranceFormValues`, `toInsurancePolicyInput`, `insuranceLockedSubscriber` (reuse, no change expected).
- `lib/api/errors/insurance.ts`: the Primary rule is already mapped (to Precedence, 5.2). With the banner, a race (another device made a Primary meanwhile) still shows it there.
- `lib/shared/messages/insurance.ts`: the banner copy.
- **Tests:**
  - unit: `primary-conflict.test.ts`, `policy-editor.primary.test.tsx` (MSW, request-order log as in `card-images.test.tsx`);
  - e2e: extend `e2e/profile-insurance.spec.ts` (banner, accept, the order, a failure + Retry, 360 px).

## Tasks & Acceptance

**Execution:**
- [x] `features/insurance/primary-conflict.ts` (+ test) -- the conflict and demotion builders.
- [x] `features/insurance/use-insurance-editor.ts`, `policy-editor.tsx`, `lib/shared/messages/insurance.ts` (+ unit tests: every I/O row, axe light and dark) -- the banner, the acceptance, validate, the save order and failures.
- [x] `e2e/fixtures/insurance.ts`, `e2e/profile-insurance.spec.ts` -- the journeys.
- [x] `sprint-status.yaml` (the `5-4` line only).
- [ ] After review (orchestrator): commit locally (no push), then the local-view `dev-mock.ts` (the Primary rule is already mocked; add a second Primary for the legacy case if useful), and typecheck there.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100 % coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed.

## Implementation Notes

- **`primary-conflict.ts`:** `insurancePrimaryConflicts(policies, editingId, type, precedence)` (Active Primary of the type, trimmed compare; none when the edited policy is itself the Active Primary of that type, even with a legacy second one, since the backend skips that `PUT`); `insuranceDemotionInput(policy, precedence = "SECONDARY")` (5.2's `toInsuranceFormValues` → `toInsurancePolicyInput(values, locked, false)`, checked first with `insuranceSchema({ subscriberLocked: true })`; `null` for no positive id, an invalid saved value, or a non-Self policy without a saved subscriber); `insuranceConflictName` (insurer, else the policy title) and `insuranceJoinNames` ("A and B", "A, B and C").
- **Editor (`use-insurance-editor.ts`):** the hook now takes the list (`useInsuranceEditor(() => read.mutate(), read.data)`), so the conflict follows every refetch. The acceptance is the accepted policy ids, reset (with the error line) while rendering whenever the open session, Type or Precedence changes. It holds while the current conflict is a subset of what was accepted (a refetch after a failed rollback shrinks it, and Retry demotes only what is left); a new Primary appearing in a refetch asks again.
  - `validate()`: a conflict without the acceptance is invalid (+1 to the count), shows the error line, and focuses the banner's button (the Insurer first when it is invalid, since it sits above). The guard's Save goes through the same `validate`.
  - `sendOnce`: unbuildable demotions → drawer error "Couldn't make {insurer} secondary. Edit that policy first." (no Retry, nothing sent, no telemetry, like 5.3's refused image); then each demotion `PUT` in list order; a failed one rolls back the earlier ones, refetches, and shows a drawer-level error (a 4xx field rule about the other policy reads "Couldn't make {insurer} secondary. Edit that policy first." without Retry; network / 5xx use 5.2's messages with Retry; never a field error on this form); then the policy (5.2), then the images (5.3). A failed policy save after demotions re-promotes them (same body, `PRIMARY`), refetches, and shows 5.2's mapped error; each failed rollback appends "{insurer} is now secondary." (beside a field error it shows alone at drawer level, without Retry). One `section_save` per save.
  - **Session failures:** no rollback and no refetch once the session ended (no request can go); the shell's dialog takes over. A demotion left Secondary then shows after the relaunch.
- **UI (`policy-editor.tsx` `DemotionOffer`):** `InlineBanner variant="info"` with the outline `Button size="touch"` (`aria-pressed`, a check icon when pressed, wraps long names) as `action`; the note in a polite region; the error line (`FieldError`) in an `alert` region; the button is described by the note or the error line.
- **Copy (`messages/insurance.ts`):** verbatim `primaryConflict`, `makeSecondary`, `demotionNote`; DRAFT `insurerList`, `primaryConflictUnaccepted`, `demotionUnbuildable`, `demotionNotRolledBack`. **Deviation:** the DRAFT error line reads "… Make {insurer} secondary, or don't make this policy primary." instead of "… or choose another precedence.": `messages.test.ts` bans "precedence" in catalog sentences (platform jargon).
- **I/O matrix "Unbuildable demotion" row:** an `N_A`-type policy can never conflict (the conflict needs the form's type), so the tests use a missing Member ID, an `N_A` relationship and a Spouse policy without a saved subscriber.
- **Comments:** the 5.2 Primary-rule rule and its test title now say it covers the race (another device made a Primary meanwhile).
- **Tests:** `primary-conflict.test.ts` (33); `policy-editor.primary.test.tsx` (36: every I/O row, the guard's Save, re-evaluation and reopen, legacy demote + rollback, a field error with a failed rollback, telemetry, axe light and dark with the banner not accepted / error / accepted, 360 px wrap); e2e `Primary per type with demote offer (Story 5.4)` (5 journeys × desktop and 360 px, the keyboard one desktop only) with the fixture `insuranceWriteLog(page)`.
- **Verification (Node 24.22.0):** lint, typecheck, `check-forbidden` clean; `vitest run --coverage` 7,037 tests (231 files), thresholds met; `pnpm build` passed; `CI=1 pnpm test:e2e` 1,127 passed, 15 skipped, 2 flaky (both passed on retry: the known 5.2 keyboard-only Radix Select journey, and `profile-phone.spec.ts:324` axe at 360 px, outside this story); `profile-insurance.spec.ts --repeat-each=3`: 177 passed, 9 skipped, no flakes.
- **Review fixes (pass 1, coordinator):**
  - With an accepted demotion, the save reads the list again first (`fetchInsurance`, then into the key). The demotions are built from those fresh rows, and a Primary in them that wasn't accepted stops the save before any write (focus on the button, the banner names it). If the read fails, the save stops with 5.2's transport error and Retry.
  - `demoted` and whether the policy saved are kept outside the `try`: an unexpected throw before the policy saved rolls back and refetches, then shows the generic error with the notes.
  - Error copy:
    - A demotion refused because the other policy is gone: refetch, then "{insurer} is no longer on your profile. Save again." with Retry.
    - A non-Self policy without a saved subscriber: "Couldn't make {insurer} secondary: its policyholder is missing. Remove that policy and add it again." The unbuildable stop tracks `FIELD`.
  - Rollback: it stops on a session failure (no refetch, no drawer error) and rebuilds the body with `insuranceDemotionInput(policy, "PRIMARY")`.
  - Copy and names: the success toast adds "{insurer} is now secondary." (also after 5.3's partial toast). Duplicate insurer names are joined once, and the separator is `insurerListSeparator`.
  - Banner: the demote button is `aria-disabled` while saving, and the error line is only the button's description (no `alert`).
  - Type / Precedence / Relationship (`ChoiceField`): a trigger blur into its own list no longer validates. "Choose a value" used to flash while picking; it then disappeared as focus moved on, and the Sheet's focus trap pulled focus to the dialog, so Tab from Precedence never reached the demote button.
  - e2e: a keyboard journey that uses only Tab, an Edit journey (Secondary → Primary), the field-error rollback, legacy two Primaries at 360 px, and lists that change once a write went. `insuranceWriteLog` also records `DELETE file {id}`, parses bodies safely and detaches (`stop()`, or when the page closes).
  - `deferred-work.md` (Team A): the session-ended-after-demotion item.

- **Orchestrator, after review:**
  - **`ChoiceField` focus fix kept:** the implementer's change to 5.2's `ChoiceField` (moving focus into a Select's own list is no longer a blur) was not asked for. It is kept because without it Tab from Precedence lost focus to the Sheet and never reached the demote button. It stays inside `features/insurance`.
  - **Flake logged:** the 5.2 keyboard-only e2e flake is logged in `deferred-work.md`.
- **Final verification (orchestrator, Node 24.22):**
  - Lint, typecheck and `check-forbidden` are clean.
  - Vitest: 7063/7063 (231 files), 100 % on `lib/server`, `lib/api` and `lib/shared`.
  - `pnpm build` passed.
  - `CI=1 pnpm test:e2e`: 1134 passed, 15 skipped, 1 flaky (the 5.2 keyboard-only Select pick, passed on retry).

## Spec Change Log

- **2026-10-21, approval (human decision 1A):** the AC's fixed order "the policy `POST`/`PUT`, then `PUT` the other policy SECONDARY, then card images" is changed to "demotion(s), then the policy, then images". The AC's failure case ("the policy saved but the demotion `PUT` fails") no longer applies; it is replaced by "the demotion fails: nothing else is sent" and by the rollback of decision 2A. The backend's `validatePrimaryInsurance` refuses a second Primary of the same type ("You can not have multiple insurance records from same type with precedence field set to Primary.") on `POST` and on a `PUT` that makes a policy Primary or changes its type, so the AC's order fails on its first request every time. Known-bad state avoided: every accepted demotion failing. KEEP: the images still go only after the policy saved.

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | E | `sendOnce` doesn't re-check the acceptance, so a refetch between `validate` and the send that adds a new Primary gets demoted without consent | high | Real (the guard is only in `validate`) → **patch**, together with row 2. |
| 2 | E | The demotion `PUT` is a full replace built from the cached list, so newer edits of the other policy made elsewhere are silently reverted (and again by a rollback) | medium | Real → **patch**: when a demotion is accepted, re-read the list at send time. Build the demotion bodies from the fresh rows. If the fresh conflict set holds a policy the user didn't accept, stop before any request and ask again (invalid, focus on the banner). |
| 3 | B, E, E-claim | A throw after a demotion succeeded skips the rollback and refetch (`demoted` is local to the `try`) | medium | Real → **patch**: hoist `demoted`; the `catch` rolls back, refetches, and shows the generic error with the notes. |
| 4 | B, E | A demotion that fails because the other policy is gone (`field: "policy"`) says "Edit that policy first" with no Retry, though Save would now succeed | medium | Real → **patch**: refetch and show a retryable drawer error ("{insurer} is no longer on your profile. Save again." DRAFT). |
| 5 | B | For a non-Self policy without a saved subscriber, "Edit that policy first" is a dead end (decision 3A blocks that edit) | low | Real → **patch**: a cause-specific message ("Couldn't make {insurer} secondary: its policyholder is missing. Remove that policy and add it again." DRAFT). |
| 6 | E | A rollback that hits a session end still shows the drawer error and notes behind the session dialog | low | Real → **patch**: stop rolling back on a session failure, with no drawer error. |
| 7 | B, VG, E-claim | A session end after a demotion leaves the other policy Secondary with no rollback or notice; this path is untested | medium | No request can be sent once the session has ended, so this can't be fixed in-app → **defer** (documented limit, Team A). Its tests → **patch** (both session cases: demotion 401 and policy 401 after a demotion, asserting the request log and no drawer error). |
| 8 | VG | Untested: the policy-gone toast carries the rollback note | low | Gap as filed → **patch**: a test. |
| 9 | B | `rollBack` spreads `{ ...input, precedence: "PRIMARY" }` instead of `insuranceDemotionInput(policy, "PRIMARY")` (built and tested for it) | low | Real duplication → **patch**: use the builder. |
| 10 | B, E | Duplicate insurer names read "Make Aetna and Aetna secondary" | low | Real → **patch**: de-duplicate the names. |
| 11 | B | The names separator (`", "`, "and") is hardcoded outside the messages file | low | Copy rule → **patch**: move it into `INSURANCE_MESSAGES`. |
| 12 | B | The demote button stays operable-looking while saving | low | Real a11y → **patch**: `aria-disabled` while saving. |
| 13 | B | The error line is announced twice (alert, plus the focused button's description) | low | Real → **patch**: drop the alert announcement when focus moves to the button (keep the description). |
| 14 | B | After a successful save, nothing says the other policy changed | low | Real → **patch**: the success toast reads "Insurance saved. {insurer} is now secondary." (DRAFT) when demotions ran. |
| 15 | B | The unbuildable-demotion stop isn't tracked (`section_save`) | low | Real → **patch**: track `{ ok: false, code: "FIELD" }`. |
| 16 | B | `insuranceDemotionInput` validates with `today: new Date(0)`, which a future today-relative rule would break | low | Real fragility → **patch**: a test that pins the assumption (and a comment). |
| 17 | B | The keyboard e2e moves focus with `.focus()`, so the Tab order of the new button is untested | low | Real → **patch**: Tab from Precedence reaches the demote button, then onward. |
| 18 | B | The 360 px wrap of a long (two-insurer) button label is only class-checked | low | Real → **patch**: an e2e legacy two-Primaries banner at 360 px with no horizontal scroll. |
| 19 | B | No e2e for the Edit path | low | Real → **patch**: one e2e (Edit a Secondary to Primary: demotion `PUT`, then the policy's `PUT`). |
| 20 | B | `insuranceWriteLog` misses `DELETE /api/pp/file`, never removes its listener, and throws on a non-JSON body | low | Real test hygiene → **patch**. |
| 21 | E | Editing a policy with a `null` id would conflict with itself | false | Id-less policies get no Edit (5.2 row 15). |
| 22 | E | A policy with a null or unknown label counts as active | low | The backend's `Label` is Active or Deleted → rejected. |
| 23 | B | The banner's `{Type}` uses the enum label, not the type-key label | low | Both are title-cased from the same values → rejected. |

## Design Notes

**Backend facts** (1h-ng-bo-core-be):
- **The Primary rule:** `validatePrimaryInsurance` counts only Active policies. On `POST` it always runs; on `PUT` only when the policy becomes `PRIMARY` or changes type.
- **The demotion `PUT` is never refused by that rule:** it changes `PRIMARY` to `SECONDARY` and keeps the type.
- **A `PUT` is a full replace:** every field is sent. The demotion re-sends the saved subscriber unchanged, so the backend never edits that person (5.2's 2C/3A).

**Agent decisions:**
- **Deleted policies:** a Deleted Primary never conflicts. The backend counts Active only.
- **Unbuildable demotion:** when a conflicting policy can't produce a valid body, nothing is sent, and the user is told to edit that policy first.

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; also put `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/af4a8bf2-5800-44b7-adc9-13891a6c3dc2/scratchpad/shim` first; the implementer makes no commits; never `pnpm dev` here; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
