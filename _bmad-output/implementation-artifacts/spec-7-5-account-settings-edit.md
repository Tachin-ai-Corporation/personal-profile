---
title: 'Story 7.5 Edit names, birth date and regional preferences'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: 'b46a297108161fd3e76c5f2f6bd0966e670e4933'
story_key: '7-5-edit-names-birth-date-and-regional-preferences'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Account settings can be viewed but cannot be corrected.

**Approach:** Implement 7.5 (NG-9034): edit six fields, save changes only, recover partial failures. Follow epics.md Story 7.5 and its Foundation amendments.

## Boundaries & Constraints

**Always:** Reuse Section forms, states, controls, save runner, drafts, navigation, toasts, person rules and semantic tokens. Preserve 7.4 read/Retry focus behavior. Every write uses callApi's existing D-A identity safeguard.

**Never:** Modify foundation/Team A files except the human-approved optional DateInput controlled-text extension and its tests/fixture, add dependencies, edit primary contacts (7.6), write credentials, or send locale/timeZone in user/edit. No push, PR, deployment or real-account mutation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
|---|---|---|---|
| Edit | Ready identity | Ten rows in existing order; six editable fields; locked credentials and read-only contacts | Preserve loading/error states |
| Validation | Blur/Save | Trimmed printable names, 1–24 characters; real date, age 18–120 or Proctor 21–120; bounded calendar | Catalog errors; first-invalid focus; no writes |
| Regional | Blank/unlisted values | Require language/time zone; English, six zones, en-US; retain unlisted values; blank locale defaults without a diff | Required locale error when cleared |
| Save | Valid changes | Details PUT, time-zone POST, locale POST; skip unchanged parts | Attempt all ordinary failures; stop on session expiry |
| Partial | Any failed subset | Stay editing, per-part banner and mapped field errors; rebase successes; retry failures only | Preserve acknowledged successes if refresh fails/stays stale |
| Success/Cancel | Saved/discarded | Toast and heading focus / revert and Edit focus; clear draft | Lock changes and duplicate saves while saving |
| Draft/leave | Dirty navigation/relaunch | Exactly six draft fields; restore/conflict UI and three-way guard | Failed save prevents navigation; retain original draft owner |

</frozen-after-approval>

## Code Map

- `features/account/account-settings-section.tsx`, `view-model.ts`: preserve StateFrame, cached Mobile observer and Retry focus. Edit defaults come from raw Myself; display model hides invalid dates.
- `features/shell/use-section-form.ts`, `run-save-steps.ts`: reuse drafts/focus/attemptAll; Account captures per-part outcomes and composes field/banner errors locally.
- `lib/api/account.ts`: owned stub; reuse internal userEditPath and transport identity checks; regional POSTs return void.
- `lib/shared/{person-rules,dates,time-zones}.ts`: rules/options; reuse Section chrome, KeyValueEditTable and components/ui.

## Tasks & Acceptance

**Execution:**
- [x] `lib/shared/messages/account.ts` -- unique Account copy; reuse catalogs.
- [x] `lib/api/account.ts`, `account.test.ts` -- typed writes; test payloads, void success, errors and identity.
- [x] `lib/server/proxy/allowlist/account.ts`, `account.test.ts`, `user-edit.account.test.ts` -- required six-zone/en-US query rules, profile tags; test valid/invalid/missing/duplicate/extra params, kill switch and locale body rejection.
- [x] `features/account/schema.ts`, `schema.test.ts` -- schema/diff/drafts; test age/leap boundaries, dates, names, defaults, unlisted values and draft exclusions.
- [x] `features/account/account-save.ts`, `account-save.test.ts` -- ordered attemptAll, per-part errors, success rebase and cache refresh; test every failure subset, expiry, failed/stale refresh and retry diffs.
- [x] `features/account/account-settings-section.tsx`, `account-edit-fields.tsx`, `account-settings-section.test.tsx` -- integrate form/chrome, controls, tooltip, drafts and both error surfaces; preserve read recovery.
- [x] `e2e/account-settings-edit.spec.ts`, `e2e/fixtures/account.ts` -- desktop/mobile editing, validation, help, retry, drafts, guard and light/dark axe.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update only 7.5's line; record validation and review here.

**Acceptance Criteria:**
- Given Edit opens, when interacting, then row order, halo, focus, responsive controls and footer match 7.5; Enter/Escape do not submit/cancel.
- Given valid unchanged values, when saving, then no write occurs and polite status keeps edit open.
- Given partial success, when retrying through own Save or leave guard, then successful fields are omitted and failed fields retain edits/errors.
- Given identity mismatch/expiry, when saving, then existing session flow prevents later writes and preserves the original draft owner.
- Given relaunch after external name changes, when restoring, then draft conflict UI appears.

## Design Notes

Draft keys: firstName, lastName, birthDate, preferredLanguage, timeZone, locale. Reuse canonical form-baseline hashing (display date/default en-US), detecting external name/date changes. Preserve stored invalid-age dates. DateInput detail.text distinguishes invalid/empty. Keep acknowledged successes despite stale/failed refresh. Refresh myself and Email/Mobile/Landline keys after success. Retain all mapped outcomes for field errors and per-part banners.

## Implementation Notes

- Implemented Account-owned typed writes through `callApi`, required regional query rules, PM3-aware canonical defaults, shared person validation, changed-only detail diff, six-field drafts, Section chrome/controls, birth-date help, identity protection and independent partial-save recovery. Successful fields are acknowledged before refresh and omitted on retry; acknowledgements retire after server confirmation or external replacement (covered through A → B → C → A).
- Account prevalidates an unchanged Save through the registered foundation validator: `useSectionForm` otherwise short-circuits unchanged values before validation. This preserves the required invalid stored age/withheld-field errors without changing foundation.
- **Human-approved scope exception (2026-10-19, “si ampliar el dateinput”):** implemented the optional `DateInput.textValue?: string` controlled display-text extension on this branch, with shared component tests, the existing inputs browser fixture/spec and Account reload/restore tests for partial/impossible date drafts. The default wire-only mode and `resetKey` behavior are unchanged. In controlled mode the caller owns display-text resets; `value` continues to own wire/calendar selection. Account now supplies its exact form string, so invalid drafts restore visibly and still block writes. See `spec-f-date-input-controlled-text.md` for the isolated foundation scope and evidence. Integrator docs remain unchanged.
- No dependencies, Team A source changes, primary-contact editing, credential writes, real-account mutations, push, PR or deployment. Foundation edits are limited to the approved DateInput API and supporting shared tests/fixture.

## Spec Change Log

- 2026-10-19: user approved “si ampliar el dateinput”; narrowly amended the frozen Never constraint to permit optional controlled DateInput display text plus supporting tests/fixture on this branch. No other boundary changed.

## Review Triage Log

- Parent implementation audit: addressed PM3 withheld defaults, acknowledgement retirement, diff-only detail acknowledgement and external DateInput reset. Invalid/partial date restore was resolved through the human-approved DateInput scope exception. BMAD review and final triage remain pending; do not mark this story done.

### Independent BMAD review triage (2026-10-19)

All three layers returned successfully. Each finding was considered before grouping; the host checked the cited implementation and foundation callers.

- B1 — medium / patch: InlineBanner renders a paragraph around children, so Account's ul/li creates invalid nesting. Replace it with valid phrasing markup.
- B2 — medium / patch: the per-part banner lacks focusable/ref wiring; useSectionForm currently focuses the separate generic footer error. Connect its existing error ref to the detailed banner.
- B3 — medium / patch: ordinary failures render two alert regions and Retry only on the generic one. Consolidate into one detailed, focusable banner with the existing Retry action. Group B2/B3 by split error ownership; B1 remains a distinct markup correction.
- B4 — medium / patch: outcomes survive an unchanged Save after reverting edits, so a failed-part alert remains alongside no-changes status. Clear obsolete outcomes on that path.
- B5 — medium / patch: a whitespace-only restored name differs in the hook's raw dirty comparison but produces no request steps, causing own Save to report success. Normalize name form values before the own-Save no-changes check; preserve guard behavior and shared hooks.
- B6 — medium / patch: a restored changed unlisted locale passes required validation, while parameterless setLocale always writes en-US; current acknowledgement can incorrectly record the restored locale. Reject that demonstrated unsupported changed locale locally rather than sending/acknowledging a different value.
- B7 — medium / patch: saveAccount awaits supplementary refreshes, holding all controls locked after acknowledged writes. Start refresh best-effort without delaying the save result; test a held refresh. No new public API is needed.
- B8 — medium / patch: StateFrame forces ready while editing even after an upstream read 403. Honor the existing forbidden read state while retaining form/draft data; keep transient refresh handling and write identity guards.
- B9 — medium / patch: failure subsets use indistinguishable 500 responses; no regression checks distinct safe platform messages paired to their parts. Add 400-message pairing, one-alert focus/Retry and axe assertions.
- B10 — medium / patch: section-local acknowledgements are verified, but a second shared identity consumer is not asserted after an Account write. Add the cross-consumer cache-refresh regression.
- E1 — medium / patch: independently confirms B6 with the restored fr-FR/en-US mismatch trace; same root cause and correction.
- V1 — medium / patch: pre-verified regression gap: removing options.refresh leaves current save assertions passing while a second identity consumer stays stale. Same root cause as B10; mount a shared identity reader and change the GET after the write.

Groups: valid banner markup (B1); consolidated focused failure presentation (B2/B3); obsolete errors (B4); normalized no-changes (B5); truthful locale outcome (B6/E1); nonblocking supplemental refresh (B7); forbidden read state (B8); per-part message verification (B9); cross-consumer revalidation verification (B10/V1). All corrections are local, add no public surface and address demonstrated paths; no intent/spec loopback is needed. Patches and focused regression verification follow.

### Patch follow-up audit

- E2 — medium / patch: detailed-banner Retry selected the shared hook callback, bypassing Account normalization/outcome clearing. After reverting failed values, Retry retained the old per-part alert next to no-changes. Route all detailed-banner retries through Account submit after moving focus to Save; verify the actual Retry path.
- E3 — medium / patch: nonblocking refresh exposed back-to-back save ordering. A delayed A→B refresh during B→C can invalidate C's acknowledgement because its recorded server baseline came from an older render. Preserve acknowledged C across known stale predecessor responses, while retaining confirmation/external replacement retirement. Add deterministic held-response coverage.
- H1 — medium / patch: integrated post-review unit run caught the ownership gate: Account constructed platformMessage in a synthetic failed response. Remove upstream metadata from feature source and keep the local locale rejection without changing shared error ownership.

## Verification

- Focused Vitest/MSW, then full unit suite with enforced 100% server/API/shared coverage.
- Typecheck, lint, forbidden/token gates, production build and whitespace checks.
- Affected production Account/shell Playwright suites on desktop/mobile, including drafts, guard, partial errors and axe.
- Complete BMAD implementation/review and triage findings before done. Record environmental limits; local checks do not establish real-demo performance acceptance.

### Executed validation (2026-10-19)

- `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm check:forbidden` (includes token gate), and `git diff --check`: passed.
- `corepack pnpm test:e2e e2e/account-settings-edit.spec.ts e2e/account-settings.spec.ts e2e/account-page.spec.ts e2e/shell.spec.ts e2e/inputs.spec.ts e2e/profile-personal.spec.ts --workers=4`: production build passed, **300 passed / 4 existing project-conditional skips**, desktop and mobile. Log: `/tmp/account-date-final-browser.log`.
- Shared DateInput + Account unit tests cover controlled external partial/impossible/valid/empty text, caret/paste/reset/readOnly/calendar behavior, canonical draft defaults, every ordinary-failure subset, expiry, retry-only failures, stale/failed refresh acknowledgement and acknowledgement retirement. Browser cases add date age/role boundaries, blank/unlisted regionals, help, locks/duplicate saves, drafts/conflicts, navigation failures, identity mismatch/original owner, exact invalid-date restore and light/dark axe.
- `corepack pnpm vitest run --coverage --maxWorkers=4`: **185 files / 4,677 tests passed; 100% statements, branches, functions and lines** across server/API/shared (129 fully covered files, 2 empty files skipped). Log: `/tmp/account-complete-coverage.log`.
- An initial concurrent coverage/browser run hit two 5-second timeouts in existing tooling/gate tests; the complete isolated bounded-worker rerun above passed. No test timeout or threshold was weakened.
- BMAD review/final triage remain pending. Local mocked checks do not establish real-demo performance acceptance; no real-account mutation or performance claim was made.

### Parent diff and matrix audit

The parent read the staged unified diff including new files, source integrations and tests, and checked the executed unit/browser logs. All seven matrix rows have passing coverage: Edit (Account section and browser opening/locked-control tests); Validation (schema boundaries and browser invalid-date/role cases); Regional (schema defaults, proxy contracts, blank/unlisted browser cases); Save (all eight failure subsets and session-stop tests); Partial (retry diffs with failed refresh and real-page partial-error axe); Success/Cancel (focus/toast, saving locks and duplicate presses); Draft/leave (reload/conflict, original-owner mismatch, guard failure and exact invalid-date restore). The approved DateInput extension is limited to the optional prop, its existing fixture, tests and Account consumption. Existing read recovery remains covered. Implementation tasks are complete; independent BMAD review follows.

### Post-review verification and closure

- All 15 individual BMAD/host findings (B1–B10, E1–E3, V1, H1) were recorded and resolved. No new issue was deferred. Existing real-demo acceptance work remains outside these local mocked measurements.
- Final independent read-only follow-up reported no concrete remaining defects in locale rejection, detailed Retry or overlapping-save acknowledgement paths. Deterministic MSW tests cover known predecessor responses and failed refreshes while preserving confirmation/external-change retirement.
- A final static check identified React ref inference on nested footer bindings. Destructure the existing footer ref before rendering the detailed banner, preserving behavior and avoiding a lint suppression. Typecheck, lint, forbidden/token gates and staged/unstaged whitespace checks then passed.
- Final integrated unit run after semantic review corrections: `corepack pnpm vitest run --coverage --maxWorkers=4` — 185 files / 4,688 tests passed; 100% statements, branches, functions and lines in enforced server/API/shared modules. Evidence: `/tmp/pp-7-5-final-coverage.log`.
- The earlier post-review attempt correctly failed the ownership gate on synthetic platformMessage metadata. It was removed from feature source; local unsupported-locale rejection uses the existing supported-locale constant and an ordinary failed response. No gate or coverage threshold was weakened.

- Final production build and browser regression after all review corrections: **300 passed / 4 expected viewport-conditional skips**, no retries or failures. Command: `corepack pnpm test:e2e e2e/account-settings-edit.spec.ts e2e/account-settings.spec.ts e2e/account-page.spec.ts e2e/shell.spec.ts e2e/inputs.spec.ts e2e/profile-personal.spec.ts --workers=4`. Evidence: `/tmp/pp-7-5-final-browser-stable.log`.
- The initial final-browser attempt exposed a mobile Tooltip test race. Browser event instrumentation showed a queued ancestor scroll after keyboard focus dismissed the tooltip. The test now finishes scrolling before beginning keyboard interaction (two animation frames, no arbitrary timeout/retry or assertion weakening). The focused interaction passed 20 repetitions across both viewports (`/tmp/pp-7-5-tooltip-stable.log`), followed by the complete green browser run above. The temporary diagnostic probe was removed; no Tooltip implementation changed.
- Final typecheck, lint, forbidden/token and whitespace gates passed after the final test adjustment. Source/test diffs were audited and the unified review artifact was refreshed.
- BMAD Build dispatch, implementation, matrix audit, all three independent review layers, patch triage and final verification are complete. Story spec is done; sprint status is review per Build's terminal workflow, ready for normal team review. No new deferrals or unresolved implementation findings remain.
- BMAD's terminal step records local conventional commits only, with the approved DateInput foundation change isolated before the Account story. No remote push, PR, Jira transition, deployment or real-account mutation occurred. Existing real-demo acceptance limits remain documented, without a new performance claim.
