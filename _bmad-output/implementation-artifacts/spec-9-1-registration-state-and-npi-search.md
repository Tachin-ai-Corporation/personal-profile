---
title: 'Registration state and NPI search'
type: 'feature'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_commit: '75eef504092b76da91e0acc9bd9cb3224dd8347f'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Implement Story 9.1 (NG-9039): replace the Provider tab placeholder with Healthcare credentials. Detect registration on opening the tab; let unregistered users find personal/practice NPIs, and show registered users their personal NPI read-only. Use Story 9.1 in `epics.md` for exact copy and behavior.

## Boundaries & Constraints

**Always:** Reuse StateFrame, SectionLandmark, InfoPopover, Combobox and KeyValueTable. Validate API boundaries; use semantic tokens and shared copy/errors. Fixed individual/organization search functions own type enforcement. Only registration state uses `keys.npi()`; searches/selections remain ephemeral and clear on session expiry/unmount/reload. Honor Foundation ownership and existing BFF/session behavior.

**Never:** Register, check availability, edit/unregister credentials or implement the full 9.3 view. Register stays inert. No search keys, drafts, storage, URL values, telemetry or logging of NPI queries/results/selections. No shared-control changes, aggregators, dependency upgrades or Team A edits in this story branch.

**Prerequisite:** The dev logger currently exposes search URLs and response bodies. Prepare a separate foundation change to `lib/api/log-api-call.ts` with a metadata-only policy for NPI reads/searches, omitting query and payloads. Test real transport logging in development; merge that foundation PR before implementing the dependent story.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| Lazy read | Provider tab mounts | Header, two-bar skeleton; GET user/npi only now | Retry only NPI key; repeated errors announced |
| Registration | Successful PersonWithNpiDTO | Null/absent providerNpi: form; present: single mono NPI row | Malformed payload is a load error; 404 is not unregistered |
| Access | Upstream 403 on read/search | Whole Provider tab no-access; other tabs work | Proxy denial uses generic error; session uses shell flow |
| Search | Focus/typing | Empty page0 on focus; trimmed text, 600ms debounce, max100; ten rows/page | Abort/ignore stale responses; no caching |
| Results | Individual/organization records | Full PRD label; two-line NPI/name/location; record id distinct from NPI | Null optional fields handled; invalid payload is search error |
| Pagination | data[], totalElements | Append pages until exhausted; zero/end rows and polite announcements | Retry same query/page; preserve existing options |
| Keyboard/privacy | Pick/type/clear/expiry | Shared keyboard behavior; typing drops pick; clear retains focus | No sensitive persistence/logs; expire clears ephemeral state |
| Proxy | Two profile-tagged GETs | user/npi rejects all query; search requires type1/2, text≤100, page≤4 digits, limit1–10 | Unknown/invalid query→400; Account switch→503; template-only server logs |

</frozen-after-approval>

## Code Map

- `lib/api/npi.ts`: existing fixed-type paths/constants; add domain mapping, cancellable searches and registered loader. Search uses `data`, numeric NPI and speculative totals; honor pagination.
- `lib/server/proxy/allowlist/npi.ts`: empty owned area. Existing `lib/api/errors/forbidden-scope.ts` already assigns read/search403 to Provider tab; no new error rule needed.
- `features/provider/provider-tab.tsx`: composed already by Account; replace stub, retaining public export. Use shell ready signals.
- `components/ui/combobox.tsx`, `use-combobox.ts`, `info-popover.tsx`: reuse existing debounce, cancellation, paging, accessible rows/popover; no forks.
- `e2e/fixtures/npi.ts`, `test/page-handlers/account.ts`: replace placeholder404 with valid unregistered200. Backend PersonServiceImpl returns PersonWithNpiDTO; NpiQueryService returns paged BaseNpiDTOs.

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/support.test.ts`, `lib/api/errors/errors.test.ts`, `lib/server/proxy/handler.test.ts`, `test/providers.test.tsx` — separate backward-compatible foundation test-contract PR; integrate before story delivery.
- [x] `lib/api/log-api-call.ts`, `lib/api/log-api-call.test.ts`, `lib/api/client.test.ts` — separate foundation prerequisite and privacy regressions, merged first.
- [x] `lib/api/npi.ts`, `lib/api/npi.test.ts` — validated domain types, getUserNpi, loader registration, two fixed-type searches and matrix tests.
- [x] `lib/server/proxy/allowlist/npi.ts`, `lib/server/proxy/allowlist/npi.test.ts` — query, kill-switch and privacy tests.
- [x] `features/provider/{provider-tab,npi-search,registered-view}.tsx`, `features/provider/use-provider-controller.ts` — states, scoped errors/retry, session cleanup, info trigger, stacked searches and minimal table; colocated integration tests.
- [x] `lib/shared/messages/npi.ts` — exact story copy, reusing existing catalog strings before additions.
- [x] `e2e/fixtures/npi.ts`, `e2e/fixtures/defaults-account.ts`, `test/page-handlers/account.ts`, `app/account.test.tsx`, `e2e/account-provider.spec.ts` — defaults, lazy reads, UJ-103, keyboard/privacy/errors/paging/axe.

**Acceptance Criteria:**
- Given each matrix input, when its operation settles, then integration tests observe the documented output/error, including unchanged-query retries and stale-response rejection.
- Given both search fields, when arbitrary text is entered, then personal requests stay type1 and practice requests type2; provider sources contain no entity-type selector.
- Given registered/unregistered states in either theme at 360px and desktop, when using keyboard/popover/open/error listboxes, then targets are44px, focus/announcements work, axe passes and no horizontal overflow occurs.
- Given completion, when verification and BMAD review finish, then all changed code has meaningful full coverage, enforced suite/static gates pass and no unresolved scoped findings remain.

## Implementation Notes

- Human approved the specification on 2026-10-20. BMAD step-03 prohibits remote operations during implementation. Prepare and verify the separate foundation prerequisite locally first; do not begin dependent story code until that prerequisite is merged. Preserve the story branch and its planning files. Use an isolated foundation worktree if needed, without discarding user work.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence and route |
| --- | --- | --- |
| Blind1: control-obfuscated dot segment leaks NPI logging | medium | isApiPath checks raw segments; URL parsing removes tab and resolves dot, while logger removes tab without dot resolution. Actual NPI transport can log query/body. Patch in a separate foundation follow-up. |
| Blind2: exact-cap label cannot be edited | medium | prepareLongSelectionEdit returns for length equal to maxlength, so native insertion at the end emits no change. Patch equality boundary in foundation and verify native browser behavior. |
| Blind3: settled old-query options remain selectable | medium | useCombobox entries use results.items even when results.query differs from current trimmed input; ArrowDown/Enter can select the previous query. Patch shared query matching, with Provider consumer regression. |
| Blind4: Provider debounce value unverified | medium | Provider stale-query test checks immediately, not599/600ms; shared tests verify their fixture setting, not the Provider prop. Patch consumer timing assertion. |
| Blind5: repeated failure announcement unverified | medium | Existing repeated-error test sees identical text but never checks live-region remount/announcement. Patch assertion against the actual announcement node. |
| Blind6: Retry-only-NPI claim unverified | medium | Only NPI requests are counted; an additional resource revalidation would escape the assertion. Patch transport-level counts for other Account resources. |
| Blind7: picked-record SWR privacy unverified | medium | Cache test loads options but never selects one. Patch selection followed by cache inspection for record identifying values. |
| Blind8: tab-unmount cleanup unverified | medium | Reload/session cleanup passes, but ordinary tab switching with a pending query is not exercised. Patch browser consumer cleanup/late-response regression. |
| Blind9: inert Register observer omits named operations | low | Request observer counts only proxy writes, allowing api/pp mutations to escape the intended no-write assertion. Direct correction: observe both namespaces. |
| Blind10: native deletion/Cut regression missing | medium | New handlers affect native default deletion/clipboard behavior; synthetic events alone do not exercise those defaults. Patch trusted browser Backspace/Delete/partial Cut assertions in foundation. |
| Edge1: obfuscated dot segment leaks logs | medium | Independently verified same raw-guard versus WHATWG normalization mismatch as Blind1. Patch in same isolated foundation follow-up. |
| Edge2: ordinary capped IME exceeds limit | medium | Only compositions starting from an overlong pick are buffered; empty/short capped inputs forward native pre-edit/commit beyond100 into new NPI validation, producing search errors. Patch the existing private buffer for capped compositions without altering uncapped input; prove bounded commit. |
| Edge3: pagination exceeds allowed page9999 | low | A full page9999 with speculative total>100000 returns hasMore, then the existing UI requests page10000 which local schema rejects forever. Direct correction: terminate at the supported upper boundary and add API regression. |

Verification-gap layer reported no gaps. All three layers returned before classification. The shared fixes remain separate foundation deliveries; Team B consumer fixes stay on the story branch.

## Verification

Run targeted MSW/Vitest and changed-code coverage, full `corepack pnpm vitest run --coverage`, lint/typecheck/check:forbidden; then production Provider/Account Playwright with two workers. Use synthetic data. BMAD/React review; update only9.1 sprint tracking.

### Foundation prerequisite progress

- Prepared, verified and BMAD-reviewed on separate branch feat/foundation-npi-read-logging-privacy; commit bfc1b7dde287b0d284fb514fbd3d3ab78300120b. Published PR #27 under the approved prerequisite-integration plan. CI pending; dependent story code has not started. Foundation final verification: 6,230 tests, 100% enforced coverage, static gates green. Reviewer URL-normalization and error-envelope gaps resolved.

- Prerequisite PR #27 merged into main on 2026-10-20 at 1342f7e7e4040beda43e4b7957707d10732a9c79. Both CI runs and Vercel passed; CI browser evidence includes 1,031 passed /11 expected skips. Story branch fast-forwarded to the actual merged prerequisite before dependent implementation. Step03 remote prohibition was overridden only for prerequisite publication/integration explicitly approved in this plan; story publication is not authorized by this exception.

### Story implementation verification (2026-10-20)

- Implemented Team B NPI API validation/mapping, fixed-type cancellable searches, both profile-tagged proxy reads, Provider registration/read/error/session states, shared search controls, minimal registered table, catalog copy and Account defaults/tests. Register remains inert; no registration/availability/support operations added.
- Targeted verification: 904 tests pass; changed NPI API, proxy and Provider code has 100% statements/branches/functions/lines (`/tmp/story91-targeted-final.log`).
- Production Provider/Account Playwright: 54 passed, desktop and mobile-360, two workers; both themes, axe, keyboard, popover/error lists, paging/retry, ephemeral selection/reload/session expiry and reduced-motion skeleton (`/tmp/story91-e2e-verified.log`).
- Final lint, typecheck, forbidden/token gates and diff check pass (`/tmp/story91-{lint,typecheck,forbidden}-final.log`).
- Full enforced coverage run blocked by four pre-existing foundation test assumptions: `support.test.ts` claims the now-real npi loader; proxy `handler.test.ts` treats user/npi as unallowlisted; `test/providers.test.tsx` freezes placeholder NPI404; `errors.test.ts` mistakes required catalog copy containing "NPI Number" for upstream-message matching. Integrator will prepare a separate foundation test compatibility prerequisite. Shared tests remain untouched by this story.
- An unrelated concurrent-refresh timing assertion failed under combined browser/unit load and passed targeted rerun (`/tmp/story91-stale-and-refresh.log`). Full suite output: `/tmp/story91-full-coverage.log` (6299 passed /5 failed before the final extra stale-query regression).
- Story code remains uncommitted for root BMAD/React review; full-suite rerun remains outstanding after foundation test compatibility integration. No story remote operations performed.

### Test-contract foundation follow-up

- Full story verification exposed four stale shared-test assumptions: support.test.ts claims the NPI registry without resetting it; proxy handler.test.ts treats the planned NPI endpoint as permanently unallowlisted; providers.test.tsx freezes the acknowledged NPI404 placeholder; errors.test.ts treats the mandated field label ending NPI Number as upstream message matching. Prepare backward-compatible test corrections on separate feat/foundation-npi-test-contracts; no shared test edits in the story branch. Integrate before story delivery. These are test-contract updates, not changed product behavior.
- Initial story evidence: 904 targeted tests and100% changed-code coverage, 54 production Provider/Account browser tests passed, static gates green. Full gate pending foundation test-contract integration; unrelated refresh concurrency timing failure passed targeted rerun. Re-run full verification sequentially after resolving the shared-test assumptions.

### Long-label foundation follow-up

- Root browser matrix audit reproduced a shared Combobox defect in both projects: a full selected practice label longer than100characters prevents typing because native maxlength is100. Story consumer regression: e2e/account-provider-long-label.spec.ts, initial evidence /tmp/story91-long-label-before.log. Prepare separate feat/foundation-combobox-long-selection; no shared controls changed on the story branch. Keep full labels and bounded meaningful editing/search; integrate before delivery.
- Root expiry audit also reproduced a missed publication between render and passive subscription. Provider now uses useSyncExternalStore, with layout-publication and server-render regressions. Provider20tests /100% coverage and Account12tests pass. Root integration final full suite:6,313tests /100% enforced coverage; browser integration worktree build failed on Turbopack out-of-root dependency symlink, so production browser verification uses the normal story checkout instead.

- Foundation test-contract PR #31 passed both CI runs and Vercel, then squash-merged at `3a896ded22a9d7e6d68124a402b6b2e387443d98`. Story branch fast-forwarded to the actual main commit; frozen baseline remains unchanged. No shared tests were edited in this story branch.
- Live personal/practice searches now mark `userInitiated: true`; transport regressions prove `X-PP-Activity: user` on both searches and its absence on automatic registration reads/SWR. All28 NPI API tests passed (`/tmp/story91-npi-activity.log`).

### Root matrix audit and review snapshot

- Final integration snapshot contains the exact Team B story files from the story branch plus foundation commit `bfaaab3` (PR #32, already reviewed and locally verified; CI/integration into main pending). It is isolated at `/tmp/personal-profile-story91-integration-20261020`; no shared control edits exist on the story branch. Foundation merges remain a prerequisite to final delivery.
- Final stack verification:6,330 tests /219 files,100% enforced coverage; lint/typecheck/forbidden green;56 production Provider/Account browser cases passed, both viewports/themes, with the long-practice-label consumer regression (`/tmp/story91-stack-final-{coverage,lint,types,forbidden,browser}.log`). Dependencies installed from frozen lockfile; no symlink build limitation remains.
- All eight frozen matrix rows ran and passed: lazy/retry/skeleton and registration via Provider/Account tests; upstream/proxy403/session via Provider/browser; focus/debounce/type locking/stale cancellation via API/Provider/shared Combobox tests; full labels/nullable fields/malformed payload via NPI API tests; page retry/retained options/end/empty via Provider/browser; keyboard/no-storage/no-SWR/session expiry/long edits via Provider/shared controls/browser; exact proxy query/kill-switch/logging via NPI allowlist tests. Logger privacy transport regressions ran in the full suite.
- Root read the complete staged integration diff since the preserved baseline, including untracked story files and the separately reviewed prerequisites. Official three-layer review uses that verified integration snapshot. It will not publish the story; after foundation CI/merge, confirm the story checkout matches the reviewed product sources.

### Official review patch resolution and final gates

- All13 reported rows are resolved, without deferrals or changes to frozen intent/public foundation APIs. Shared findings published separately: Combobox PR #32, head18e9eb2d9b8ae602b0d0015a3478d79998f24e9a; log normalization PR #33, head9d6502d67a2e610913b44c229721e8d2c80a7240. Their integration into main remains pending CI. Story-only changes remain local.
- Provider regressions now prove599/600ms debounce, no selectable settled stale options, repeated-error live-region remount, Retry isolation over concurrently loaded resources, actual selected-record SWR privacy, and both personal/practice selection cleanup plus late pending-query response cleanup across ordinary tab unmount. Inert Register observes both proxy and named-operation writes. API pagination terminates at supported page9999.
- Root inspected every final source/test patch and ran the combined verified stack sequentially with isolated browser ports:6,349 tests /219files and100% enforced statements/branches/functions/lines; lint/typecheck/forbidden/token checks passed;58 production Account/Provider browser cases passed, both projects/themes, including axe and the long-label consumer regression (`/tmp/story91-reviewed-stack-{coverage,lint,types,forbidden,browser}.log`).
- Shared final verification:73 targeted tests; modified component/hook47/47 lines,58/58 statements,60/60 branches,11/11functions covered;6,252 full tests and158 production shared/Profile/Addresses browser cases passed. Logger follow-up125 targeted tests and6,246 full tests,100% enforced/logger coverage, static gates green.
- No further code changes or repeated broad tests are needed absent a new failure/change. Await actual prerequisite merges, confirm exact source identity on the story checkout, finish only its sprint row and local conventional commit; never auto-push the story.

- Privacy URL normalization PR #33 passed both CI runs and Vercel, then merged at66ef9175b0edd4e195245873a8cf32641a0da4fc; story branch fast-forwarded to that actual main commit. Source identity comparison now differs only in the five Combobox control/test/fixture files from pending PR #32.

### Completion

- Combobox prerequisite PR #32 passed both CI runs and Vercel, then merged at54e84fda34c92ae71324d040ab863943130421cd. Its final CI browser run passed1,047 cases with11 expected skips. Privacy follow-up PR #33 was already merged at66ef9175b0edd4e195245873a8cf32641a0da4fc after both pipelines passed. All prerequisite deliveries are integrated.
- Story branch fast-forwarded to actual main54e84fda34c92ae71324d040ab863943130421cd. All646 product/config/test files match the exact fully verified integration snapshot (SHA-256 manifest comparison, zero differences). No code changed after the final6,349-test /58-browser verification; no redundant broad test rerun is necessary.
- BMAD complete: all13 official findings resolved, none deferred. Mark only Story9.1 sprint status review; retain the sprint header, last_updated, parent epic and other rows per project instructions. Prepare the local conventional story commit without pushing or opening its PR.


### Review Findings — main synchronization (2026-10-21)

Review scope: branch against `origin/main` at `9a1f97c`, after conflict-free merge `69f04a3`. Independent blind, edge-case, verification-gap and acceptance layers completed. No decision-needed or deferred findings. User approved all nine patches (option1). All patches applied and verified; independent follow-up found no concrete regressions.

- [x] [Review][Patch] Recheck registration on each tab opening before showing cached registration content [features/provider/use-provider-controller.ts:23]
- [x] [Review][Patch] Skip registration reads when session expiry was published before mounting [features/provider/use-provider-controller.ts:14]
- [x] [Review][Patch] Reject unexpected registration envelopes while preserving the valid empty DTO [lib/api/npi.ts:64]
- [x] [Review][Patch] Trim individual name parts before joining [lib/api/npi.ts:131]
- [x] [Review][Patch] Exercise network and upstream-timeout search failures with retained options and unchanged retry [features/provider/provider-tab.test.tsx:133]
- [x] [Review][Patch] Exercise actual scrolling pagination in the Provider browser flow [e2e/account-provider.spec.ts:112]
- [x] [Review][Patch] Exercise mobile info-popover tap opening and outside-tap dismissal [e2e/account-provider.spec.ts:72]
- [x] [Review][Patch] Verify long practice labels fit the viewport and popup in both themes [e2e/account-provider-long-label.spec.ts:4]
- [x] [Review][Patch] Give Register the required touch size and verify remaining visible targets [features/provider/npi-search.tsx]

| ID / source | Verdict | Evidence |
| --- | --- | --- |
| 1 / blind-hunter | medium | SWR can supply cached unregistered data with isLoading false during remount revalidation; the form is exposed before the opening read confirms current registration. |
| 2 / blind-hunter | low | The NPI key remains enabled despite an already-published expiry event; hiding the rendered children does not prevent the request. |
| 3 / blind-hunter | medium | All root DTO fields are optional and z.object strips unknown fields, so an unrelated successful JSON envelope becomes unregistered. The backend PersonWithNpiDTO defines exactly the three known fields; an empty object is valid. |
| 4 / blind-hunter | low | Only the final joined individual name is trimmed, preserving extra whitespace between padded first and last names. A direct per-part correction suffices. |
| 5 / blind-hunter | false | hasMore is a server-total hint: the sole search consumer explicitly ends short, empty and duplicate pages in use-combobox.ts:290-296, so no subsequent request or retry loop occurs. |
| 6 / blind-hunter | medium | The pagination regression returns HTTP500; it never rejects the transport or exercises an upstream timeout response, leaving the specified failure matrix incomplete. |
| 7 / blind-hunter | low | Provider browser pagination uses ArrowDown/End only; the shared Combobox scroll test provides generic coverage but the Provider adapter has no actual scroll interaction assertion. |
| 8 / blind-hunter | low | Provider popover browser coverage opens through keyboard focus and dismisses with Escape; mobile tap/outside-tap behavior is not exercised in this consumer. |
| 9 / blind-hunter | low | The long-label consumer regression sets only light theme and asserts editing, with no viewport/popup containment assertion. |
| 10 / blind-hunter | medium | Register omits size=touch and therefore uses the shared Button default h-9 (36px), below the required44px; current browser target assertions measure only info and personal input. |

#### Rejected

- Finding5 — false: speculative server totals are constrained by the shared Combobox short/empty/duplicate-page termination guard; no user-facing pagination defect occurs in its sole consumer.

Validation before review patches:6,357 unit tests across219 files; enforced coverage, lint, typecheck and forbidden/token gates pass;58 production Account/Provider browser tests pass. Logs: `/tmp/story91-main-sync-20261021-{coverage,lint,types,forbidden,browser}.log`. No remote publication performed.


#### Main-sync review completion

- Revalidated registration on each Provider mount before exposing cached content; an already-published session expiry prevents opening reads, including publication during layout. Server data remains in the existing SWR key, with no search cache.
- Rejected unrelated successful JSON envelopes against the backend registration DTO, normalized padded individual name parts, and used the existing touch-sized Button for Register.
- Added regressions for cached registered/unregistered remounts, expired-session reads, network rejection and BFF upstream timeout with retained options/exact-page retry; browser coverage now checks Provider scrolling, mobile tap/outside tap, long-label containment in both themes and visible control targets.
- Final validation:6,364 unit tests /219 files;100% enforced statements, branches, functions and lines; lint, typecheck, forbidden/token checks and diff check pass. Production Account/Provider browser run:63 passed,1 expected desktop skip for the mobile-only tap case, two workers on isolated port3500. Logs: `/tmp/story91-bmad-patched-{coverage,lint,types,forbidden,browser}.log`.
- BMAD result:9 patches fixed,1 finding rejected,0 deferred,0 decision-needed; all four review layers completed and the patch follow-up found no concrete regression. Story remains done. Origin main9a1f97c was merged without conflicts in69f04a3 before verification.
