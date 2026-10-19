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


## Full Code Review — 2026-10-19

Review mode: full. Scope: `b46a297108161fd3e76c5f2f6bd0966e670e4933..74e3feb8979d2835d4d3a5fb0aa62b6bf229b883`, including both DateInput foundation and Account feature commits: 23 files, +1,331/-18 lines. The working tree was clean at entry. Loaded the story and existing CLAUDE/FOUNDATION/Epic 7 context; those context files were unchanged from the reviewed baseline.

All four configured layers completed: Blind Hunter (10 observations), Edge Case Hunter (one observation), Verification Gap Reviewer (one regression gap), Acceptance Auditor (no concrete AC violation). No layer failed or was skipped. Reviewer follow-ups clarified reachability before host triage. Three reviewers ran concurrently and the fourth started when a slot became available; findings were handled only after all layers had been launched and returned.

**Result: 0 decision-needed, 5 patch, 0 defer, 7 rejected.** At presentation, no production source had changed and patches awaited the human's workflow choice. The human selected option 1 (apply every patch); completion evidence follows.

### Normalized verdicts

Every observation retains its individual verdict before grouping. IDs correspond to the original reviewer observations, not the earlier Build review.

- R1 / blind-hunter — high / patch. `accountWrite` promotes any 2xx status to success, overriding a failed D-A identity check. Both malformed-JSON-shape and non-JSON 200 preflight responses were reproduced through real callApi/MSW: zero PUTs were sent, yet updateAccount returned success true. This can acknowledge unsent changes and delete their draft.
- R2 / blind-hunter — false / rejected. The claimed malformed stored birth date cannot reach accountFormDefaults through the production loader: `toMyself` validates with parseWireDate and maps malformed/impossible dates to null before exposing Myself. The backend DTO also serializes LocalDate. Valid dates outside the age rule remain preserved and are tested; changing Account to reverse the shared normalization would bypass its owner.
- R3 / blind-hunter — low / rejected. A stale successful refresh can leave the shared header older than the Account acknowledgement; failed reads show their existing error behavior. The AC requires key revalidation, which occurs, and fresh responses update the independent identity reader in tests. Strong optimistic consistency despite failed/stale reads is a broader improvement requiring cache reconciliation beyond a direct correction, so it is not added here.
- R4 / blind-hunter — false / rejected. The alleged masking after an authoritative confirmation is disproved: confirmation retires the acknowledgement, then external predecessor values flow through. Existing confirmation/external-replacement tests cover it. An unconfirmed predecessor response is indistinguishable from the stale reads this mechanism intentionally protects against; the reviewer withdrew the stronger defect claim.
- R5 / blind-hunter — low / rejected. A direct controlled-to-legacy rerender with the same wire value can expose old internal text. Account and the inputs fixture always supply textValue; Personal always omits it. No mounted application caller switches modes, and the optional prop does not promise such transitions. Additional transition synchronization would add complexity for an unshown application state.
- R6 / blind-hunter — false / rejected. Registered saves and shell-toast retries bypass the own-Save wrapper, but accountDetailsDiff still normalizes comparison and payloads; normalized acknowledgements replace the hook's raw override. The reviewer could not demonstrate re-sending unchanged fields, lost edits or an observable bad baseline. Ordinary name blur trims as well.
- R7 / blind-hunter — low / patch. Regional query tests directly exercise buildUpstreamQuery, while the literal AC asks for real proxy 400 responses. Shared handler tests cover generic rejection and area tests cover aggregation, so no current routing defect was found. Add narrow handler-level negative rows for the specified regional queries, with appropriate successful-forwarding coverage for the two new endpoints.
- R8 / blind-hunter — medium / patch. Account's guard browser case fails details only; its partial-success/retry cases use own Save. The registered-save path through the leave guard is a separate integration boundary. Add details-success/time-zone-failure followed by a second guard Save that sends only the zone and then navigates.
- R9 / blind-hunter — false / rejected. Persisted cleanup is already verified by real FixtureSection/useSectionForm/DraftsProvider integration in drafts-ui tests for own Save, Cancel and guard Save. Account uses those unchanged lifecycle paths and its own tests verify actual six-field registration and persistence/restoration. No Account cleanup defect or bypass was identified.
- R10 / blind-hunter — low / patch. The proxy's six-zone regex duplicates ACCOUNT_TIME_ZONES, which the UI consumes. Derive membership from that existing constant to keep endpoint acceptance and selectable options under one owner; preserve exact matching and required-query behavior. This is a small direct correction, with no new helper/public API needed.
- R11 / edge-case-hunter — low / rejected. Independently describes the same unsupported controlled-to-legacy DateInput transition as R5. The reviewer confirmed no current production caller toggles textValue; retain the same rejection rationale.
- R12 / verification-gap — medium / patch. Pre-verified gap: no test selects the supported locale through Account's actual Select. Existing locale save tests inject draft values or call the API directly. Add a real control interaction from fr-FR to en-US, asserting one correct locale request and the resulting read display.

Survivors have distinct root causes; no surviving observations were merged. The two DateInput transition observations were each assessed and rejected individually. No human intent decision or new deferral is required.

### Review evidence

- The host traced callApi -> checkPageUser -> accountWrite and the Section/save/draft result path. A temporary two-case MSW probe confirmed updateAccount returned `{ success: true, statusCode: 200 }` with zero PUT calls after malformed/non-JSON identity preflights. Both diagnostic assertions passed because they explicitly assert the observed bad behavior; these are reproductions, not fixes. Log: `/tmp/pp-7-5-full-review-identity-probe.log`. The probe source was removed.
- Reviewed current caller reachability, existing shared draft cleanup, query handler contracts, registered-save normalization and acknowledgement retirement before rejecting observations. No full unit/browser rerun was claimed for this read-only review; the preceding Build validation remains separate evidence above.
- Unified review diff: `/var/folders/h_/_0j0tkt10dj4lhvlt6zl54c00000gn/T/pp-7-5-full-review-diff-9k_w9g29.diff`. Commit narrative was staged separately for the edge layer.

### Review Findings

- [x] [Review][Patch][R1][high] Preserve blocked identity-check failures in Account writes [`lib/api/account.ts:44`]. Do not turn a failed callApi preflight into success solely because its HTTP status was 2xx. Keep legitimate empty 200/204 write responses working (callApi already supports empty success bodies), and cover malformed/non-JSON 200 identity preflights with zero writes and failed save results so drafts cannot be cleared as saved.
- [x] [Review][Patch][R8][medium] Verify partial recovery through leave-guard Save [`e2e/account-settings-edit.spec.ts:84`]. First guard Save: details succeeds, zone fails, departure stays blocked. Second guard Save: zone alone is retried, details is not resent, navigation completes.
- [x] [Review][Patch][R12][medium] Exercise the preferred-locale Select through the real Account UI [`features/account/account-edit-fields.tsx:49`]. Start from fr-FR, pick English - United States, save, verify the en-US request and resulting read value. Do not substitute draft injection for this control interaction.
- [x] [Review][Patch][R7][low] Complete regional real-proxy contract coverage [`lib/server/proxy/allowlist/account.test.ts:103`]. Add handler-level bad-query response cases required by the story, plus forwarding checks for both regional endpoints; preserve existing query helper and kill-switch coverage.
- [x] [Review][Patch][R10][low] Use the shared time-zone options as proxy membership source [`lib/server/proxy/allowlist/account.ts:12`]. Derive exact membership from ACCOUNT_TIME_ZONES instead of duplicating its six strings in a regex; retain rejection of unknown, missing, repeated and extra parameters.

### Approved patch completion — 2026-10-19

- All five approved patches (R1, R8, R12, R7, R10) are resolved. Account now preserves callApi failures from identity preflights, including malformed/non-JSON HTTP 200 responses; unsent changes remain unsaved and their draft remains recoverable. Legitimate empty 200/204 writes remain supported.
- Regional allowlist membership derives from the existing ACCOUNT_TIME_ZONES constant. Real proxy tests verify authenticated query forwarding, no request body, no-store responses and 400 rejection of invalid/missing/repeated/extra query parameters or unexpected bodies without upstream work. No shared foundation source changed in these patches.
- Real Account browser cases cover leave-guard partial success followed by retrying only the failed zone before departure, actual locale Select interaction from fr-FR to en-US with request/read/reload assertions, and both HTTP 200 identity-preflight failures with zero writes and exact persisted-draft restoration.
- Regression proof: the six new API identity-preflight assertions failed against the original implementation (`/tmp/pp-7-5-review-r1-red.log`), then passed after the fix. Focused API/proxy suite: 2 files / 63 tests passed (`/tmp/pp-7-5-review-api-proxy.log`). New browser cases: 8 passed across desktop/mobile (`/tmp/pp-7-5-review-new-browser.log`).
- Full unit validation: `corepack pnpm vitest run --coverage --maxWorkers=4` — 185 files / 4,708 tests passed; enforced server/API/shared statements, branches, functions and lines all 100% (`/tmp/pp-7-5-review-patches-coverage.log`).
- Final affected production build/browser regression: `corepack pnpm test:e2e e2e/account-settings-edit.spec.ts e2e/account-settings.spec.ts e2e/account-page.spec.ts e2e/account-hardening.spec.ts e2e/shell.spec.ts --workers=4` — 282 passed / 6 expected viewport-conditional skips, no failures or retries (`/tmp/pp-7-5-review-patches-browser.log`).
- Typecheck, lint, forbidden/token gates and whitespace checks passed. Independent read-only reviewer follow-up confirmed all five approved findings addressed with no concrete regression; that follow-up did not rerun suites.
- BMAD review actions complete: 0 decisions, 5 fixes, 0 new deferrals, 7 rejected observations unchanged. Story and own sprint entry are done; sprint header/last_updated are preserved. Existing real-demo acceptance limits remain unchanged. These review patches remain local and uncommitted; no push, PR, Jira transition or deployment occurred.

### Rejected

- R2 — false: shared toMyself converts malformed/impossible dates to null before Account; valid out-of-range dates remain prefilled and tested.
- R3 — low: required revalidation and fresh-data propagation already work; optimistic cache reconciliation under failed/stale reads is beyond a direct correction and is not added for this rare condition.
- R4 — false: confirmation retires acknowledgements; subsequent external predecessor replacements are accepted. Only an unconfirmed stale/external ambiguity remained, and the reviewer withdrew the defect claim.
- R5 — low: controlled-to-legacy mode switching has no mounted application caller and is not an advertised contract; additional state synchronization is not justified here.
- R6 — false: normalized diffs/acknowledgements and ordinary blur prevent the claimed material failure; no reachable data loss or repeated unchanged write was shown.
- R9 — false: real foundation integration already verifies persisted cleanup after Save, Cancel and guard Save; Account uses the same registered lifecycle.
- R11 — low: same unreachable application mode-transition condition as R5, individually verified and rejected.
