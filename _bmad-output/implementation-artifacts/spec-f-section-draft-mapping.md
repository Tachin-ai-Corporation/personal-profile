---
title: 'Foundation: optional Section draft transformation'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: '4f57ca2ddf70ea59ef745ae361b8063f3c0540fa'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/FOUNDATION.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Story 7.6 must restore only still-Verified contact choices, falling back to the current primary for unavailable choices. useSectionForm owns restore but exposes no transformation callback. Add an optional owner-level extension, in a separate foundation PR before the Account feature.

## Boundaries & Constraints

**Always:** Preserve the existing behavior when omitted. Keep draft filtering, denied-field rules, preset baseline, validation, dirty tracking, registration and lifecycle events under the existing owner. Use current callbacks and baseline.

**Never:** Store contact metadata, implement Account policy in the shared hook, replace registry registrations externally, change current callers or edit integrator-owned shared docs/tracking headers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Legacy caller | No callback | Existing restoration unchanged | Existing validation |
| Mapping | Callback supplies replacement values | Apply only declared draft fields; start edit and retain preset baseline/dirty behavior | Existing field validation |
| Unready data | Callback returns null | Return false; leave read/edit state and form values untouched; retain offered draft | Retry restore after data resolves |
| Saving | Any restore attempt | Refuse before callback or mutation | Existing false result |
| Updated caller | New callback/baseline after render | Restore uses latest inputs | No stale closure |

</frozen-after-approval>

## Code Map

- `features/shell/use-section-form.ts`: UseSectionFormOptions and internal registration.applyDraft own restore; transformation belongs here before enterEdit and writes.
- `features/shell/use-section-form.test.tsx`: real providers/registry tests for hook contracts.
- `features/shell/drafts-ui.test.tsx`: existing integrated persisted restore lifecycle; inspect before adding tests.
- `features/shell/section-registry.tsx`: existing registration callbacks; unchanged.

## Tasks & Acceptance

- [x] `features/shell/use-section-form.ts` -- add optional transformDraft(values: DraftValues, baseline: T): DraftValues | null; invoke before any restore state transition; preserve all legacy behavior and filtering.
- [x] `features/shell/use-section-form.test.tsx` -- test omitted/mapped/refused/saving/updated-input scenarios, unknown-key filtering and preset/dirty semantics.
- [x] `features/shell/drafts-ui.test.tsx` -- verify a refused restore remains offered and can later succeed; add only if existing integration cannot establish this contract.

Given existing callers, when the option is omitted, then all current suites pass unchanged. Given a mapped restore, when save/cancel runs, then each lifecycle event and draft cleanup occurs once. Given refusal, when dependencies become ready, then the original stored draft is still available.

## Implementation Notes

- Added the optional transformDraft callback before any edit transition or form mutation. Null refuses restoration; mapped output still passes through declared draftFields. Existing callers and registry remain unchanged.
- Parent inspected the complete unified baseline diff (including this new spec): `/var/folders/h_/_0j0tkt10dj4lhvlt6zl54c00000gn/T/pp-draft-mapping-audit-qrp3y2eq.diff`.
- Matrix audit: six hook tests cover omitted callback, mapping/filtering/validation, null in read/edit, saving refusal, latest callback/baseline and preset/lifecycle semantics. Two persisted UI cases cover refusal, preserved original draft, later successful restore and exactly-once Save/Cancel cleanup. All ran and passed in focused and full units.

## Spec Change Log

## Review Triage Log

All three BMAD layers completed. Individual verdicts precede grouping:

- B1 — low / rejected: mutable callback inputs can be abused by a callback that mutates before returning null, but no existing/proposed caller does this. Callbacks are synchronous trusted application code; extra cloning/guards or a public type change for misuse add complexity without demonstrated everyday harm.
- B2 — medium / patch: a transform returning current baseline leaves the form clean, hides the offer but keeps the persisted original. Actual UI probe reproduced both Save/Cancel and re-offering after remount. Fix clean mapped restoration cleanup without changing omitted-callback behavior.
- B3 — low / patch: add conflict Keep mine coverage for refusal/retry with the changed server baseline. Same controller path is shared, but this is a direct integration-test improvement for the new callback.
- B4 — low / patch: new tests save/cancel immediately; add persistence/flush assertion of transformed values and current base hash before cleanup. Existing provider tests cover ordinary values; exercise mapped values at this boundary.
- B5 — low / patch: callback test changes baseline props only; test effective baseline after rebase while parent prop stays unchanged, guarding against passing options.baseline instead of the hook's actual override.
- E1 — low / rejected: an application callback can throw, but no throwing caller or required error conversion is present. Exceptions already propagate from existing draft callbacks; adding a catch for unspecified programmer errors is unjustified complexity here.
- E2 — medium / patch: independently confirms B2. The temporary real-UI probe proved original draft survives clean Save/Cancel and is re-offered on remount; log `/tmp/draft-mapping-review-probe.log`. Probe removed.
- E3 — low / rejected: transformed output could restore a denylisted field only if a caller also incorrectly declares it in draftFields in production (development rejects registration). No mounted caller declares such fields; raw-field iteration predates this extension. Current transform filtering tests prove undeclared password keys ignored. Additional production defense for an invalid declaration is beyond a direct correction for a shown caller.
- Verification-gap layer — no gaps found; both test files are registered and their new cases execute normally.

Survivor groups: clean mapped cleanup (B2/E2), conflict integration (B3), mapped persistence (B4), effective override baseline (B5). No intent gap or spec revision is required; all are direct corrections/tests within existing contracts. Three low observations rejected individually; no new deferrals.

## Verification

Focused Section/draft tests, typecheck, lint, forbidden/token checks, full unit suite with enforced coverage and affected Section/draft browser regressions. Review as a standalone foundation change before merging; integrator updates FOUNDATION on landing.

### Executed validation — 2026-10-19

- Focused Section/draft unit suite: 81 tests passed. Typecheck, lint, forbidden/token gates passed.
- Full isolated coverage: 185 files / 4,716 tests passed; statements, branches, functions and lines all 100% in enforced modules. Command: `corepack pnpm vitest run --coverage --maxWorkers=2`. Log: `/tmp/draft-mapping-unit-sequential.log`.
- Production build and `corepack pnpm test:e2e e2e/section.spec.ts e2e/drafts.spec.ts --workers=2`: 30 passed across desktop/mobile, no skips or retries. Log: `/tmp/draft-mapping-browser-sequential.log`.
- Initial concurrent full-unit/browser attempt hit two existing 5-second lint/fixture-gate timeouts (4,714 unit passes); browser attempt interrupted. Original logs preserved at `/tmp/draft-mapping-unit.log` and `/tmp/draft-mapping-browser.log`. Isolated reruns above passed; no test timeout or coverage threshold changed.

### Post-review closure

- Resolved all four surviving groups (B2/E2, B3, B4, B5). Accepted mapped restoration that leaves the form clean now uses the existing discarded lifecycle event to remove its persisted draft exactly once; omitted-callback behavior is preserved. No other shared API or caller changed.
- Expanded persisted tests cover Restore and conflict Keep mine, unchanged comparison/offer on refusal, mapped values and current base hash on flush, clean Save/Cancel/remount cleanup and legacy behavior. Hook coverage now includes the effective rebase override with unchanged parent props.
- Independent edge-review follow-up found no additional concrete regression; read-only, no test run. Three low observations remain individually rejected; no new deferrals or unresolved findings.
- Final full unit validation after the source correction: 185 files / 4,722 tests passed, 100% statements/branches/functions/lines in enforced modules. Log: `/tmp/draft-mapping-final-coverage.log`.
- Parent replaced the remount test's fixed 20 ms wait with an observed read from the real draft store returning null. Final focused suite after this test-only adjustment: 87 passed; typecheck, lint, forbidden/token and whitespace checks passed. No production code changed after full coverage.
- Final production build plus Section/drafts Playwright: 30 passed across desktop/mobile, no skips/retries. Log: `/tmp/draft-mapping-final-browser.log`.
- Parent re-read the final unified diff and verified every task/matrix row against passing tests. Foundation spec done; no sprint entry/header or integrator docs changed. Local conventional commit only; no push/PR/merge/deployment. Story 7.6 remains approved ready-for-dev until this separate prerequisite is reviewed and merged first.


## Full Code Review — 2026-10-19

Review mode: full. Confirmed scope: `4f57ca2ddf70ea59ef745ae361b8063f3c0540fa..6c312043f29ae547d49ab97f3c61a7a10322ace4`, 4 files, +353/-4. Working tree clean at entry; review runs on feat/f-section-draft-mapping. Spec plus existing CLAUDE/FOUNDATION context apply; no 7.6 implementation is included.

All four configured layers completed: Blind Hunter (six observations), Edge Case Hunter (two observations), Verification Gap Reviewer (no gaps), Acceptance Auditor (no AC violations). Three reviewers launched concurrently; the fourth launched when a slot became available, before host triage. No layer failed or was skipped.

**Result: 0 decision-needed, 4 low patch items, 0 defer, 4 rejected.** No new functional defect was confirmed. Surviving items clarify the new callback contract and add narrow regression assertions; no runtime API/type widening is proposed. At presentation patches awaited the human workflow choice; the human selected option 1 (apply all four). Completion evidence follows.

### Normalized verdicts and evidence

- R1 / blind-hunter — low / patch: public transformDraft documentation does not explain that output is the set of fields to apply (not merged automatically with draft input), omitted fields retain existing values, an empty object accepts restore, and an accepted clean result immediately resolves the draft through discarded. These behaviors are observable by the upcoming Account caller; add precise JSDoc only, preserving behavior.
- R2 / blind-hunter — low / patch: the callback receives live inputs; documentation does not state that it must be synchronous and treat inputs as immutable. Clarify the callback contract so the future Account mapper does not mutate its shared baseline or expect asynchronous refusal. Do not change its public signature or introduce cloning/guards.
- R3 / blind-hunter — low / patch: clean mapped restoration now emits discarded and the existing controller suppresses writes until a clean registration. Controller tests verify suppression/recovery generically, and new integration tests verify cleanup/remount, but none types a new edit immediately after this new clean-mapping path. Add a narrow real-provider regression proving the next user change persists; no current failure is claimed.
- R4 / blind-hunter — low / patch: no callback case returns an empty object or exclusively undeclared keys. Existing filtering test also returns a declared invalid value, while cleanup tests explicitly return baseline fields. Add these two permitted cases to verify accepted restore, unchanged clean values and exactly-once cleanup. This directly tests no-applied-field behavior without adding runtime branches.
- R5 / blind-hunter — false / rejected: the proposed existing-independent-user-edit restore scenario is not offered by the real draft UI. createDraftController.trackWrites clears state.stored and the offer on a user change before a restore choice; controller.apply then has nothing to apply. Direct repeated calls to registration.applyDraft bypass that user-facing lifecycle and its preset reset predates this change. No reachable regression in the new mapper was demonstrated; existing preset/cancel tests remain valid.
- R6 / blind-hunter — low / rejected: a mapped-restore followed by failed Save is a missing combination, not a demonstrated new failure. The mapped output becomes ordinary form values through the same setValue path; existing hook failure/Retry tests preserve those values and dirty state, while mapped integration tests assert persisted values/current base hash and lifecycle cleanup. transformDraft is not called by sendOnce or failure handling. Adding a separate full retry setup duplicates established downstream contracts without a concrete mutant or distinct new branch; Verification Gap Reviewer found no gap.
- R7 / edge-case-hunter — low / rejected: a throwing trusted application callback can escape, as can existing draft callbacks; no throwing production caller or specified catch/refusal conversion exists. New exception-handling branches would defend a programmer error not demonstrated in an intended caller. Same runtime-guard proposal was individually considered in the Build review; no new reachability evidence changes its rejection.
- R8 / edge-case-hunter — low / rejected: a callback can deliberately mutate the live baseline before returning null, but no existing/proposed caller does so. Cloning inputs would add runtime complexity for misuse and is not needed for the intended pure mapper. R2 documents the expectation; it does not implement the cloning suggested here. Same runtime mutation guard was individually considered in Build review without a reachable caller.

Each observation was graded independently; no survivors merged. R1–R4 are direct documentation/test patches. No intent decision, production guard or new deferral is required.

### Review evidence

- Host re-read the complete 437-line unified review diff and traced applyDraft, effective baseline, registry delegation, controller.apply/trackWrites, lifecycle suppression and save failure/Retry behavior.
- Host focused validation: `corepack pnpm vitest run features/shell/use-section-form.test.tsx features/shell/drafts-ui.test.tsx --maxWorkers=2` — 2 files / 87 tests passed. Log: `/tmp/pp-foundation-full-review-focused.log`. No full unit/coverage/browser rerun was needed or claimed for this read-only review; preceding Build validation remains separate evidence.
- Diff: `/var/folders/h_/_0j0tkt10dj4lhvlt6zl54c00000gn/T/pp-foundation-full-review-diff-kmhmsz82.txt`; verbatim commit narrative staged separately for edge reviewer at `/var/folders/h_/_0j0tkt10dj4lhvlt6zl54c00000gn/T/pp-foundation-full-review-claims-sr0s48xv.txt`.

### Review Findings

- [x] [Review][Patch][R1][low] Document replacement, omitted/empty-output and clean-result cleanup semantics of transformDraft [`features/shell/use-section-form.ts:75`]. Documentation only; preserve existing behavior.
- [x] [Review][Patch][R2][low] Document synchronous callback execution and immutable input expectations [`features/shell/use-section-form.ts:76`]. Preserve current signature; no cloning, asynchronous API or runtime guards.
- [x] [Review][Patch][R3][low] Verify new edits persist after clean mapped restoration [`features/shell/drafts-ui.test.tsx:160`]. Use the real provider/controller and observe the written values after user input/flush.
- [x] [Review][Patch][R4][low] Cover empty and exclusively undeclared mapped outputs [`features/shell/drafts-ui.test.tsx:160`]. Verify accepted restore, unchanged clean form values and exactly-once persisted cleanup.

### Approved patch completion — 2026-10-19

- R1/R2: expanded transformDraft JSDoc to state synchronous execution, immutable live inputs, returned replacement fields, omitted/empty-output semantics and immediate discarded cleanup for accepted clean results. Public signature and runtime implementation remain unchanged.
- R3: added real-provider/controller integration coverage proving a new user edit after clean mapped restoration becomes dirty/userChanged and persists with the correct current base hash on flush.
- R4: extended clean mapped restoration cases to baseline, empty-object and exclusively undeclared-key outputs, each with Save and Cancel. All verify accepted restore, unchanged clean values, ignored keys, exactly-once cleanup and no stale draft on remount.
- Final validation: `corepack pnpm vitest run features/shell/use-section-form.test.tsx features/shell/drafts-ui.test.tsx --maxWorkers=2` — 2 files / 92 tests passed (`/tmp/pp-foundation-review-patches-focused.log`). Typecheck, lint, forbidden/token gates and git diff --check passed. Parent read the complete source/test patch diff.
- No executable production code changed; existing full coverage/browser evidence above remains separate, with no unnecessary broad rerun or new full-suite count claimed.
- Code-review actions complete: 0 decisions, 4 fixes, 0 new deferrals, 4 rejected observations unchanged, no unresolved scoped findings. Spec remains done. Foundation has no sprint story key, so sprint/header/last_updated stay untouched. These review patches remain local and uncommitted; no push, PR, merge or deployment occurred. Story 7.6 remains ready-for-dev on its separate branch pending prerequisite integration.

### Rejected

- R5 — false: ordinary user edits supersede the stored offer before restore can run; direct repeated registration calls bypass that lifecycle and no mapper regression was shown.
- R6 — low: mapped values and downstream save failure/Retry are already verified independently through unchanged contracts; another full retry combination adds redundant setup without a distinct new behavior or concrete regression.
- R7 — low: no intended throwing caller or catch contract; runtime error swallowing would add guards for unshown programmer misuse.
- R8 — low: no mutating intended caller; cloning live inputs adds complexity for misuse. R2 documents the pure callback expectation without adding such guards.
