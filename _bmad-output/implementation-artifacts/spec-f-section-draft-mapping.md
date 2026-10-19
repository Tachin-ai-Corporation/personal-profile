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
