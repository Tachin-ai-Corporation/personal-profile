---
title: 'Register provider and optional practice NPI (NG-9040)'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
baseline_commit: '0001fdd03b28ba25f83c19fa6d24218e0e42f4b8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Implement Story 9.2: an unregistered user selects a personal NPI and optional practice NPI, checks availability, and registers once. Success refreshes the registered body supplied by 9.3; errors preserve selections with clear inline feedback. Exact copy follows Story 9.2 and its superseding foundation notes in `epics.md`.

## Boundaries & Constraints

**Always:** Reuse callApi, mapper, fixed-type searches, shared controls/chrome/toasts, semantic tokens and catalog copy. Use registry record ids, never ten-digit NPI numbers. Keep picks/results only in mounted component memory. Foundation privacy prerequisite merges first in its own PR. Registration is an ephemeral command form (RHF/Zod and a private controller, matching MFA command semantics), not a Section read/edit/save workflow: no drafts, Save-all or leave-guard registration. Existing Account dirty protection remains intact.

**Never:** Edit shared framework/aggregators, Team A code, shared unions or global error policy. No confirmation, optimistic search-to-SWR data, automatic mutation replay except transport TOKEN_EXPIRED, live-account writes or story publication during implementation. Existing foundation deliberately masks 5xx bodies; show the registration fallback for 5xx/timeouts and expose only mapper-approved 4xx messages. Use real field-specific backend messages, not obsolete prefix errors.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| Required | No personal pick on blur/Register | Linked required error; Register focuses personal; no traffic | A pick clears its own error |
| Checks | Personal and optional practice selected | Parallel boolean GETs using record ids; busy immediately; freeze selections | Any failed/malformed check prevents POST; both taken errors shown |
| Mutation | All explicit false | One POST with providerNpiId and optional practiceNpiId; accept empty200 | Ref single-flight across checks/POST; no automatic 502/504 replay |
| Failure | Taken race, ordinary error,403,expiry | Mapper field error; persistent banner until next Register; tab no-access; session dialog respectively | Retain choices on ordinary failure; ignore late callbacks after unmount/expiry |
| Success | Acknowledged write | Toast once, discard picks, revalidate npi key, full registered body and h2 focus | If read fails/stays unregistered, StateFrame Retry without permitting another POST |
| Privacy | Reload/tab exit/session end | No persisted picks, URLs or sensitive logging/telemetry | Abort/ignore obsolete work; no POST after abandoned checks |
| Proxy | GET availability; POST strict ids | Profile-tagged exact endpoints, no query; strict safe positive integer ids | Invalid key/id/body400; content type415; Account switch503 |

</frozen-after-approval>

## Code Map

- `features/provider/npi-search.tsx`: existing inert command; retain search behavior; shared Combobox offers selection/error/onBlur/inputRef/disabled.
- `features/provider/use-provider-controller.ts`, `provider-tab.tsx`: root owns completion latch, fresh read/retry and composition.
- `lib/api/npi.ts`: existing paths; GET returns raw Boolean; backend POST is void200. Preserve failed identity-preflight behavior; no 2xx fallback from a blocked write.
- `lib/api/errors/npi.ts`: exact taken messages already select personal/practice; do not remove shared dead code here.
- `lib/server/proxy/allowlist/npi.ts`, `lib/shared/messages/npi.ts`, `e2e/fixtures/npi.ts`: owned area files; root integrates common contracts.
- Backend `v2/rest/UserResource.java:444`, `OneHealthResource.java:199` and `v2/service/PersonServiceImpl.java:595` confirm atomic record-id registration.

## Tasks & Acceptance

**Execution:**
- [x] `spec-foundation-provider-registration-log-privacy.md` — deliver separate logger prerequisite before dependent code.
- [x] `lib/api/npi.ts`, `npi.test.ts` — add boolean-validated isNpiRegistered(recordId, options?), empty-ack registerNpi(input, signal?), user/automatic activity distinction and transport contracts.
- [x] `lib/server/proxy/allowlist/npi.ts`, `npi.test.ts` — exact GET/POST entries, strict body, rejection/kill-switch/no-store tests.
- [x] `lib/shared/messages/npi.ts`, `e2e/fixtures/npi.ts` — unique exact copy and reusable availability/register mocks; sole root owner.
- [x] `features/provider/npi-search.tsx`, `use-npi-registration.ts`, `provider-registration.test.tsx` — typed ephemeral command, matrix tests, duplicate activation and disposal safety.
- [x] `features/provider/use-provider-controller.ts`, `provider-tab.tsx`, `provider-tab.test.tsx` — safe acknowledged completion, registered/error retry, h2 focus and replace obsolete inert-Register assertions.
- [x] `e2e/account-provider-register.spec.ts` — personal-only/both success, taken/fallback states, keyboard/axe and actual9.3 transition.

**Acceptance Criteria:**
- Given the matrix, when real MSW-bound commands run, then each documented outcome and request count is asserted, including held checks and success-read failure.
- Given desktop/360px and both themes, when registering by keyboard, then progress/errors/focus are accessible, axe passes and no horizontal overflow occurs.
- Given integration with 9.3, when POST succeeds, then the complete credentials view appears without drafts, duplicate mutations or NPI leakage.

## Implementation Notes

- Human approved this specification on2026-10-21. Implement9.2/9.3 in parallel only after the separate foundation privacy PR is merged; this explicit user instruction overrides the workflow's sequential-only default. Root owns common API/copy/fixtures and composition. Story publication remains outside implementation scope.

## Spec Change Log

- 2026-10-21: Foundation privacy PR38 merged after complete CI passed. Baseline includes the independently merged Phone-theme test fix (PR36); no changes to that work.

## Review Triage Log

Joint three-layer review covers both stories. Each of its thirteen findings has an individual verdict in [the integrated review log](spec-9-3-registered-view.md#review-triage-log); no verdict is silently dropped or counted twice. The surviving registration patches and their passing regressions are recorded below.

## Design Notes

### Parallel integration contract

Root implements `isNpiRegistered(recordId, options?: { signal?: AbortSignal; userInitiated?: boolean })`, defaulting to passive activity, and `registerNpi({providerNpiId, practiceNpiId?}, signal?)`. Availability returns only validated booleans; malformed200 is failure. Search schemas remain strict. `UserNpi` retains registered/provider/practice/hie, id:number and npi:string, adding optional backend-named registered display fields only. Read display sentinels are normalized without weakening search validation.

`NpiSearch` receives `{onFailure: (mapped: MappedError) => void, onRegistered: () => Promise<void>}`. `RegisteredView` receives `{registration: UserNpi}`. Root owns `use-provider-controller.ts`, `provider-tab.tsx`, existing `provider-tab.test.tsx`, NPI API/allowlist/copy and `e2e/fixtures/npi.ts`. The9.2 agent owns the command component/hook and its new unit/browser tests; the9.3 agent owns the registered subtree, private hooks/components, practice-support API/tests and its new browser spec. Agents run only focused tests; root runs integrated coverage/build/browser checks after writers stop. No branch changes by workers.

Keep 9.2/9.3 as separate specifications on one integration branch. Root owns shared area API/copy/fixtures and composition;9.2 agent owns only its command files/tests. Automatic 9.3 checks must not acknowledge user activity. User-visible message policy follows the approved foundation review fix in `spec-7-0b-1-tokens-messages-errors.md` (4xx only) and current proxy masking, rather than exposing raw 5xx text.

### Confirmed boundary details

The backend registration response is empty200; `callApi<void>` already acknowledges it. Return its result unchanged: never reinterpret a failed identity preflight or unreadable response as a successful write. Availability is uncached and validates an actual boolean. Existing numeric ten-digit search validation remains unchanged.

Registered display mapping separately accepts missing/null/blank/n/a/-1 sentinels, retaining `npi:string` and positive safe record ids. Practice `verified` is the actual DTO flag. Preserve a present organization object even when its tenant is missing/unusable; usable tenant ids are non-negative safe integers (including0 and numeric strings). Do not turn unknown organization identity into absent organization.

Root also owns adjustments to existing `e2e/account-provider.spec.ts` assertions/names when the old inert Register assumption becomes obsolete. Acknowledged completion uses a mounted monotonic latch and read-only retries; SWR key-only mutate may resolve stale data after failure, so current read error/provider presence and explicit completion loading govern readiness and heading focus.

### Frozen common implementation interfaces

Root common API/types/copy/fixture implementation is now available. Use the actual exports, without editing their files. New copy keys in `NPI_MESSAGES`: personalNpiRequired, registering, registrationFailed, providerRegistered, providerPracticeRegistered, taxonomy, healthInformationExchange, practiceName, practiceAddress, practiceNpi, licenses, addressOfPractice, organizationExists, registerPractice, signatureUnavailable, aboutSignature, signatureHelp. Reuse SHELL_MESSAGES.signature/pageProfile/signatureAlt and existing common copy.

Browser helpers exported through existing fixtures: `mockNpiAvailability(page, recordId, answer?)`, `mockRegisterNpi(page, answer?)` (default empty200), and `REGISTERED_PROVIDER_NPI` (complete synthetic wire object). Workers own ONLY their listed feature files and their new story-specific tests; root owns these common interfaces, current provider composition/controller, existing provider tests and story tracking/spec completion. Workers do not edit specs/sprint tracking, commit, push, switch branches, run broad suites or build; report any required common-contract change to root. All work is on the current story branch, after PR38 merged. Read CLAUDE.md and installed `.claude/skills/react-standards/SKILL.md`; use the Framework app profile with the project's SWR/per-area decisions overriding generic defaults. Read relevant installed Next guides before component work.


### Integrated verification evidence before final BMAD review

- Foundation privacy PR38 merged as0001fdd03b28ba25f83c19fa6d24218e0e42f4b8, after both complete CI runs and preview passed. No story publication performed.
- Full unit suite:6,756 tests in223 files passed; enforced library coverage100% (2,780 statements,1,903 branches,629 functions,2,307 lines).
- Provider feature suite:106 tests passed; eight implementation files100% statements (283), branches (250), functions (64), lines (212).
- Lint, typecheck, forbidden/token checks and whitespace checks passed. Production build and Provider browser suite passed45 tests with one desktop skip for a mobile-only case.
- Repeat validation exposed a pre-existing shared Tooltip native focus-scroll race:6/10mobile failures versus0/10desktop; the unchanged assertion still requires exact help text and focused trigger. A separate foundation prerequisite is being prepared on `feat/foundation-tooltip-keyboard-scroll`; no shared source is edited in this story branch. Final keyboard verification/review awaits its correction. The existing shared primitives browser spec also documented pre-scrolling to avoid this issue.

## Verification

Targeted API/proxy/Provider MSW tests and meaningful changed-code coverage; full enforced coverage, lint, typecheck, forbidden checks; production Provider browser tests followed by integrated BMAD review. Update only 9.2 story tracking, preserving header.

Matrix audit: Required/Checks/Mutation/Failure/Privacy are exercised by `provider-registration.test.tsx` (26 command cases) and the new registration browser spec; Success by `provider-tab.test.tsx` (45 cases, including held/failed/malformed/unregistered refreshes and heading focus); Proxy by owned API/allowlist tests (159 cases). All ran and passed. Invalid IDs return400 at the typed API/POST body boundary; nonmatching malformed GET paths retain foundation403 NOT_ALLOWED, without changing global routing policy.

### Candidate dependency and integrated review

The separately reviewed shared Tooltip correction is prepared locally as ab04792 on feat/foundation-tooltip-keyboard-scroll. Publication/integration approval is pending; the story branch contains no shared changes. An isolated combined candidate using its actual pinned-package patch passes6,763 tests/223 files with enforced library coverage100%, all static gates, and20/20 repetitions of the unchanged original registered-view keyboard browser case. Full story production browser previously passed45 with one intentional desktop skip for a mobile-only case. Implementation acceptance is verified against that combined candidate; delivery integration remains pending and is not claimed complete. Proceed with read-only integrated review of both story implementations while the separate delivery checkpoint is pending.

Integrated review findings and individual verdicts are recorded in spec-9-3-registered-view.md, section Integrated9.2/9.3 review triage. Registration patches cover monotonic acknowledgement across remount, persisted-page restoration reconciliation, mixed-check banner precedence, fixed-type browser fixtures and changed availability on retry. No frozen intent or captured baseline changes.

### Integrated review patch verification

- All thirteen findings received individual verdicts before grouping; same-practice/changed-tenant support findings share one lifecycle fix. Required patches are implemented and the same original workers verified their own changes.
- Root reproduced acknowledgement loss on tab remount (two variants) and an abandoned server-committed POST on persisted page return before fixing them:3 failures with an ordinary-pageshow passing control. A private WeakMap keyed by the existing SWR cache retains only acknowledgement/focus-consumption metadata for the page lifetime (D5), never picks or storage. The heading focus is consumed once, including after remount/read Retry; ordinary future tab visits do not steal focus. Persisted pageshow invokes existing read-only refresh and never replays a command. All50 controller/composition tests pass with100% changed-controller/entry coverage.
- Integrated feature tests:118/3 files passed; all eight implementation files100% (299 statements,259 branches,68 functions,223 lines). Full combined candidate:6,777/223 files passed; enforced libraries100% (2780 statements,1903 branches,629 functions,2307 lines). Logs: /tmp/provider-review-feature.log and /tmp/provider-integrated-reviewed-coverage.log.
- Updated shared touch targets locally, tenant-only support replacement with held old response, deterministic eligibility completion, mixed-check banner precedence, fresh availability on retry, and per-entity browser fixtures. A root fixture correction preserves explicit null availability as malformed data rather than converting it to false.
- Production Provider browser:41 cases passed with one intentional mobile-only desktop skip; six additional short/missing-name target cases passed after making their successful support mock explicitly200 (its shared helper intentionally defaults404). No production expectation was weakened. Full combined browser suite is running separately.
- Current lint, typecheck, forbidden/token and whitespace gates pass. A follow-up independent review traced completion caches, focus consumption, persisted restoration and tenant-keyed support; it found no new regressions and its86 focused tests passed.
- Human explicitly authorized publishing and merging the separate Tooltip foundation prerequisite. PR40 is open at https://github.com/Tachin-ai-Corporation/personal-profile/pull/40, preview passed, both complete CI runs pending. Final actual-branch integration and keyboard/browser acceptance remain gated on its successful merge. No story publication is authorized or performed.

### Final integrated delivery verification (2026-10-21)

- Human authorized prerequisite publication/merge; foundation PR40 merged after both complete CI runs passed (14m36s/21m46s), without a bypass. Its merge commit is faf0dfe5311285259c138c1037670b1745a76d0b. Foundation privacy PR38 was already merged before implementation. Current main also includes the independent file-delete foundation PR39; that source is not changed by these stories.
- This story branch fast-forwarded to current origin/main and restored all implementation work. The only stash-apply conflict was the append-only deferred-work log; both entries were preserved, with no source conflict. Captured baseline remains0001fdd03b28ba25f83c19fa6d24218e0e42f4b8. The actual story diff against origin/main contains only Team B implementation/area contracts and its tracking artifacts; upstream foundation changes belong to their own reviewed PRs.
- Frozen offline install and actual-branch production build pass. Actual-branch full units:6,792 passed/223 files; enforced libraries100% (2805 statements,1919 branches,636 functions,2325 lines). Actual-branch Provider browser:47 passed,1 intentional desktop skip for a mobile-only case. Original registered-view keyboard assertion then passed10/10 additional actual-branch repetitions across desktop/mobile and both themes, without pre-scrolling or weakening it. Logs: /tmp/provider-delivery-unit.log, /tmp/provider-delivery-browser.log, /tmp/provider-delivery-keyboard-repeat.log.
- Full combined browser suite previously passed1,106 cases with12 intentional skips and no retries. All22 story source/test files matched that tested combined candidate byte-for-byte. Feature tests118 passed with100% all metrics across eight implementation files. Actual-branch lint, standalone typecheck, forbidden/token and whitespace gates pass.
- Every implementation/matrix task is complete, including the separate Tooltip integration. BMAD review patches are resolved; the shared pre-existing focus-scroll defect is now resolved by PR40. The independent baseline DisabledAction Escape-after-protected-press intermittency remains documented for foundation follow-up; it was not suppressed or claimed fixed. All current complete browser runs pass.
- Final story specs are done and their sprint keys are review, preserving the tracking header and other teams' lines. Root prepares the local conventional implementation commit; no story push or PR publication is performed.

### Review Findings — standalone bmad-code-review (2026-10-21)

This is the separately requested `bmad-code-review` workflow, not the earlier Build review. Target: eb264d7 against origin/main faf0dfe (26 files,2200 insertions,59 deletions). Both story specs and their Foundation/Epic9 context were loaded. Four independent layers completed: blind hunter10 findings, edge hunter1, acceptance auditor1, verification-gap reviewer reported no gaps. All12 findings received an individual verdict before grouping. The complete evidence and rejected appendix are in [Story9.3's review report](spec-9-3-registered-view.md#review-findings--standalone-bmad-code-review-2026-10-21).

- [x] [Review][Patch] Persisted restoration must perform a fresh read after an already-running pre-navigation read settles [features/provider/use-provider-controller.ts:27]. Medium; a deterministic held-read repro displays stale unregistered state after restoration with only one GET. Queue one restoration revalidation without replaying mutation.
- [x] [Review][Defer] Availability path IDs use the broader shared proxy matcher [lib/server/proxy/allowlist/npi.ts:15] — deferred: the existing foundation matcher accepts0 and unsafe1–19-digit integers, while the typed helper and POST body require safe positive IDs. A separate additive foundation extension is required under T2; no shared matcher changes belong in this story.

Review results:0 decision-needed,3 patch across both stories (1 here,2 in9.3),1 foundation defer,8 rejected. No implementation patches were applied by this review run; the workflow's action checkpoint is pending.


#### Approved patch execution (2026-10-21)

The human selected option1, apply all3 local patches. Finding1 is fixed on the same feature branch: persisted pageshow waits for an existing read to settle and then invokes the existing guarded/single-flight refresh. Multiple restoration events coalesce into one fresh read; no POST is replayed. Four new controller cases cover stale200/failed500 older reads, repeated restoration events, unmount and expiry. The two positive restoration cases failed before the correction and all54 controller tests now pass.

Actual-branch validation after all3 patches:6796 unit tests/223 files passed with100% enforced library coverage (2805 statements,1919 branches,636 functions,2325 lines);122 Provider tests with100% across8 implementation files (299 statements,261 branches,68 functions,223 lines); fresh production build and51 Provider browser passes with1 intentional desktop skip for a mobile-only case. Lint, standalone typecheck, forbidden/token checks and whitespace checks pass. Logs: /tmp/provider-code-review-controller-red.log, /tmp/provider-code-review-controller-green.log, /tmp/provider-code-review-fixed-units.log, /tmp/provider-code-review-fixed-feature.log, /tmp/provider-code-review-fixed-browser.log.

All approved local patches are checked off. Finding12 remains a medium foundation contract follow-up, unchanged by this action, so this specification is in-progress under the standalone review completion rule rather than claiming complete acceptance of the positive-safe proxy requirement. No frozen intent/baseline changes, commit, push or PR action. Sprint status was not synced: the review target was identified from conversation as a combined branch review, without a single workflow story_key; existing review entries and the protected tracking header/last_updated are preserved.
