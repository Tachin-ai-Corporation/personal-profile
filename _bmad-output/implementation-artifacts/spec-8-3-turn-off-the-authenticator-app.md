---
title: 'Story 8.3 Turn off the authenticator app (NG-9038)'
type: 'feature'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_commit: 'b44e7038b08219806b4a3f66c17c377a9c52e27c'
story_key: '8-3-turn-off-the-authenticator-app'
review_loop_iteration: 1
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The linked authenticator has a Disable button without its confirmed turn-off flow.

**Approach:** Implement Story 8.3 in epics.md: explicit destructive confirmation, one TOTP-only disable request, mapped feedback, authoritative account-status refresh and accessible focus recovery.

## Boundaries & Constraints

**Always:** Reuse ConfirmDialog, callApi, MFA area files, mapApiError, shared myself, shell toasts and semantic tokens. Preserve merged 8.2 privacy, single-flight and reconciliation guarantees. Keep work on `feat/NG-9038-disable-authenticator`, with BMAD review before publication.

**Never:** Disable base MFA, invent reauthentication/recovery codes, retry failed mutations automatically, optimistically alter account status, register drafts/Save, change shared foundation, or operate on real accounts during development. Keep the accepted demo rate-limit policy unchanged.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Open | Linked; activate Disable | Centered destructive ConfirmDialog; exact title/body; Cancel initially focused and focus trapped | No mutation on open, render or mount |
| Cancel | Cancel, Escape or overlay dismissal | Close without request; preserve status; return focus to Disable | Busy confirmation cannot be dismissed |
| Confirm | Turn off; repeated click/key | One bodyless/queryless disable/totp POST; spinner with Turn off label retained | Ref guard shared across MFA mutations and reconciliation |
| Success | Empty 200 | Close; Authenticator app disabled toast; refresh myself; focus heading | Tiles activate only after authoritative refreshed status; base MFA preserved |
| Failure | Network/5xx/timeout, upstream message or proxy denial | Close; mapped inline error or catalog fallback; refresh myself; focus Disable if present, otherwise heading | No automatic replay; suppress raw 5xx text using existing mapper |
| Access/session | Upstream 403 / session expiry | Card-only no-access / shell session dialog | Close; no feature error or focus theft on expired session |
| Lifecycle | pagehide, unmount, external status/read change while pending | Clear confirmation; ignore stale toast/error/focus; reconcile late outcomes | Outstanding request keeps mutation coordination until settlement; no conflicting enrollment |
| Presentation | Desktop/360px, light/dark | Centered confirmation, 16px mobile gutters, 44px targets, no overflow; exact catalog copy | Keyboard and axe clean; no full-screen confirm |

</frozen-after-approval>

## Code Map

- `features/mfa/authenticator-link-dialog.tsx`: existing card-owning controller; preserve its component identity and request/reconciliation guards while adding confirmed disable coordination and shared notice/focus handling.
- `features/mfa/authenticator-card.tsx`: existing onDisable seam; add truthful busy/inert behavior and deterministic trigger focus without changing shared controls.
- `features/mfa/authenticator-section.tsx`, `mfa-access.ts`: shared identity/read/focus and card permission owner; reuse, avoid duplicating status.
- `components/ui/confirm-dialog.tsx`: ready foundation contract, Cancel focus, busyLabel and onCloseFocus. Return true without focusing for session expiry. No separate close-icon extension is needed; reuse supported dismissal routes.
- `lib/api/mfa.ts`, `lib/server/proxy/allowlist/mfa.ts`: existing disable path builder and area registry. Backend MfaResource disableTotp returns empty 200; MfaServiceImpl changes TOTP_ENABLED only.
- `lib/api/errors/mfa.ts`: missing config is already coded; already-disabled text is generic. No new string matching or shared code needed; fall back for non-generic mapped errors.
- `lib/shared/messages/mfa.ts`: add exact Story 8.3 title/body/Turn off/toast and draft fallback; reuse COMMON_MESSAGES.cancel. Use Turn off as busyLabel to preserve the action name.

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/mfa.ts`, `mfa.test.ts` -- add disableTotp returning ApiResponse<void>, context mfa/disableTotp, no body/query; test empty success and failures without retries.
- [x] `lib/server/proxy/allowlist/mfa.ts`, `mfa.test.ts` -- exact POST disable/totp, profile:true; allow/deny/query/body/method/kill-switch/no-store tests; retain enable and validation denies.
- [x] `lib/shared/messages/mfa.ts` -- confirmation/result copy; uniqueness and existing catalog tests.
- [x] `features/mfa/authenticator-link-dialog.tsx`, `authenticator-card.tsx` -- wire confirmed disable into the existing MFA coordinator and preserve enrollment guards.
- [x] `features/mfa/authenticator-disable.test.tsx` -- matrix outcomes, held requests, StrictMode, duplicate activation, session focus and cross-flow ordering; rerun existing MFA feature suites.
- [x] `e2e/fixtures/mfa.ts`, `e2e/account-authenticator-disable.spec.ts` -- synthetic stateful disable; success/cancel/error/access/session and centered both-theme mobile/desktop axe checks; preserve 8.2 fixtures.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- own 8.3 row only; preserve header/last_updated and all other rows.

**Acceptance Criteria:**
- Given a linked account, when the complete matrix runs, then behavior matches authoritative Story 8.3 and enrollment regression tests pass.
- Given intercepted MFA traffic, when disabling, then only disable/totp is called and base mfaEnabled remains unchanged.
- Given completed checks, when reviewed, then all actionable BMAD findings are resolved before publication.

## Implementation Notes

### Iteration 1 re-derivation

- Restored the verified API, narrow allowlist, catalog and browser baseline; added the actual empty upstream 200 assertion and real post-disable enrollment QR activation.
- Extracted transient state, mutation/error handling and focus into `features/mfa/use-authenticator-controller.ts`, retaining `AuthenticatorLinkDialog` identity/public props and declarative dialog rendering. Guarded own-state adjustment discards QR/code on external availability changes; generation changes and external focus stay in effects/handlers. No hooks lint suppression remains in the new hook.
- Added `features/mfa/mfa-coordinator.ts`: one non-secret lease store per SWR cache, subscribed with `useSyncExternalStore`, preserving request/reconciliation gates across actual card remounts. Each lease's settlement can release only its own token.
- Reconciliation checks SWR's raw success metadata because its revalidation promise can resolve with cached data after a failed read. Reuse `useMyself` for observation so an observer never overrides the shared retry policy. Failed reconciliation remains blocked through automatic retries or terminal error/manual Retry until a successful authoritative read.
- Focus recovery observes successful gate release and retains a relinquishable ownership controller. Pointer, keyboard or deliberate focus interaction gives up delayed recovery, including non-focusable clicks; successful retry removal of Disable recovers the heading only while ownership is retained.
- Added real remount tests for held disable and enrollment, failed-read automatic/manual retry gates, automatic retry focus recovery, non-focusable click ownership, and lease isolation. Synchronous raw event dispatch in duplicate/gate stress cases deliberately exercises coordination beyond normal button event suppression; userEvent exercises normal interaction and focus paths.
- Current targeted verification: `corepack pnpm vitest run features/mfa lib/api/mfa.test.ts lib/server/proxy/allowlist/mfa.test.ts lib/shared/messages/messages.test.ts` — **7 files / 877 tests passed**. `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm check:forbidden` all passed. Logs: `/tmp/story83-rederive-final-targeted.log`.
- Integrator verification after re-derivation: full `corepack pnpm vitest run --coverage` passed **5,760 tests / 208 files**, with **100%** enforced statements/branches/functions/lines across 131 files. Separate feature coverage passed 89 tests with **100% lines/functions**, **97.25% statements**, **92.7% branches**; no exclusions added. This does not satisfy the external standard's complete branch/statement coverage requirement yet and remains explicit work before completion.
- Production `corepack pnpm test:e2e e2e/account --workers=2` passed **342 cases / 6 expected viewport skips**, including the actual post-disable enrollment QR. Logs: `/tmp/story83-iteration1-coverage.log`, `/tmp/story83-iteration1-feature-coverage.log`, `/tmp/story83-iteration1-account-browser.log`.
- B1/E1 and B2/E2 now have held automatic/manual-read and actual-remount regressions. B3 focus relinquishment, B5 empty proxy forwarding, and V1 real post-disable enrollment have passing tests. The re-derived diff is staged and audited in `/tmp/story83-iteration1-audit.diff`; final BMAD review remains pending after foundation integration and closure of feature coverage gaps.
- **Foundation integrated:** PR #24 merged into main as `f415d43226dfc7b2a56f58109ba87fe33840d01d` on 2026-10-20; story branch fast-forwarded to that main commit, preserving all local story edits. Original baseline remains immutable; the inherited foundation commit is already on main and is not a story-owned edit. Standalone bmad-code-review of PR #24 completed with no actionable findings.

### Iteration 0 verification history

- Added the bodyless/queryless `disableTotp()` API and the exact account-only proxy entry; base MFA endpoints remain denied. Empty HTTP 200 succeeds.
- Kept `AuthenticatorLinkDialog` as the shared card controller. Disable uses its existing mutation and reconciliation refs, confirmed destructive UI, mapped inline feedback, and lifecycle generation invalidation. Pending requests remain coordinated after `pagehide`; late outcomes reconcile without stale feedback. Tiles stay inert until authoritative identity reconciliation settles.
- Added trigger focus stabilization, heading recovery if reconciliation removes the trigger, and session-owned focus suppression. Confirmation retains the Turn off action name while busy.
- Added 18 focused disable feature tests plus API/proxy tests; browser fixtures use synthetic account state, and the new browser suite covers both themes, keyboard/axe, centered layout, cancellation, errors, permission denial and shell session focus.
- Implementation verification: `corepack pnpm vitest run features/mfa lib/api/mfa.test.ts lib/server/proxy/allowlist/mfa.test.ts lib/shared/messages/messages.test.ts` — 6 files / 868 tests passed, including existing enrollment regressions. `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm check:forbidden` passed.
- Integrator verification: full Vitest coverage passed 5,751 tests / 207 files with 100% enforced statements, branches, functions and lines across 131 files. Production Account Playwright initially passed 336 cases / 6 expected skips; six new test failures were corrected (API traffic collector included vendor images; overlay click raced dialog readiness), and the complete new disable suite subsequently passed all 12 desktop/mobile cases with two workers. Final BMAD review follows.
- Matrix audit: opening/cancellation, single-flight plus held identity read, mapped failure table, upstream denial, pagehide/unmount/session, external linked/read changes, removed-trigger focus and transferred session focus all ran and passed in the 80-test MFA feature run. Browser tests verify centered mobile/desktop confirmation, both themes, focus trap, exact copy, 44px targets and axe.
- The user additionally requested the external React/JS standard during verification. Loaded `dev-std-ai-agents-and-skills` React CLAUDE, AGENTS, react-standards skill, auditor and security-auditor checklists; Framework app profile, retaining project-specific foundation/SWR contracts. Measured feature-only coverage separately: 100% lines, 98.08% statements, 93.5% branches, 97.36% functions across the existing card/controller. These figures do not claim full feature branch coverage; outstanding defensive-path coverage and controller responsibilities need final review.

## Spec Change Log

- 2026-10-20 / iteration 1: B1/E1 and B2/E2 exposed incomplete coordination-lifetime guidance. Re-derive using a cache-scoped, feature-owned coordinator that outlives card remounts; subscribe with useSyncExternalStore. Hold reconciliation until a successful authoritative read, including automatic retries; on terminal read errors keep actions blocked until a successful manual retry. Avoid cached-status unlock. Keep the mounted component identity and all lifecycle generation guards.
- KEEP: all exact API/copy/allowlist behavior, existing enrollment regressions, 868 targeted tests, all 12 corrected browser tests, empty-body contract, session focus suppression, held-request tests and both-theme accessibility checks. The previous verified implementation is captured in `/tmp/story83-implementation-audit.diff` for preservation during re-derivation.
- Apply B3 using relinquishable focus ownership, B5 actual proxy empty 200, and V1 post-disable re-enrollment. User additionally requested external React/JS standards: move controller business logic into a feature hook while preserving the existing component's public interface and coordination; use declarative dialog rendering, established foundation/SWR contracts, typed state and documented deliberate stress-test event dispatch.
- B4 is a separate foundation dependency: `feat/foundation-confirm-mobile-width` in `/tmp/personal-profile-foundation-confirm-mobile-20261020` changes the shared confirm max width to apply from md upward. Keep that change out of this story; verify and publish foundation separately only with user authorization. Story must retain an explicit pending dependency until merged; no claim of full authoritative AC completion before then.

## Review Triage Log

| ID | Verdict | Route | Evidence |
|---|---|---|---|
| B1 | medium | bad_spec | `refresh` releases on the first rejected identity read while `useMyself` suppresses transient errors with cached data. A retry can still be outstanding with actionable controls. |
| B2 | medium | bad_spec | Mutation refs belong to one controller; actual Account panel remounts can create an unlocked replacement before the old mutation settles. |
| B3 | medium | patch | Body focus after a deliberate non-focusable click is indistinguishable from a removed trigger; delayed heading recovery needs explicit relinquishable focus ownership. |
| B4 | medium | bad_spec / foundation prerequisite | At 600px the existing ConfirmDialog max width yields 76px gutters. Authoritative AC requires 16px below 768px. Shared fix prepared in separate foundation branch; no shared edit in story. |
| B5 | medium | patch | Proxy disable success test returns QR JSON; use actual empty upstream 200 and assert its empty response. |
| B6 | false | reject | Timeout is delivered as proxy 504 under the existing transport contract; the feature failure table already exercises 504 and no replay. No new browser-side timeout is introduced by this change. |
| B7 | low | reject | Mocking an additional base-MFA value adds fixture branches without detecting a distinct mechanism: exact traffic assertions prohibit every base-MFA write and the disable handler never sends a base flag. |
| B8 | low | reject | All late outcomes pass the same generation guard before success/error branching; existing lifecycle tests demonstrate invalidation. Additional outcome permutations do not cover a separate branch in the implementation. |
| E1 | medium | bad_spec | Same independently verified failed-reconciliation lifecycle as B1. |
| E2 | medium | bad_spec | Same independently verified remount coordination lifetime as B2. |
| V1 | medium | patch | Verified test gap: enable-looking tiles do not prove the retained mutation gate was released. Activate Link after disable reconciliation and assert returned enrollment QR. |

### Integrated review (iteration 1)

| ID | Verdict | Route | Evidence |
|---|---|---|---|
| I-B1 | false | reject | Account tab changes retain PageFrame's PageDrafts and MyselfReadState readers; settlement therefore has a live shared revalidator. Full page navigation discards the old UI or remounts the normal reader. No reachable story consumer demonstrated the proposed all-readers-absent stale-action path. |
| I-B2 | false | reject | app/account/page.tsx composes exactly one AuthenticatorSection; Radix renders only the selected panel. A remount destroys the old QR and invalidates its generation. The proposed two simultaneously actionable enrollment controllers are not an app state. |
| I-B3 | low | reject | A canceled confirmation can retain ownership until interaction, but any pointer/key/focus transfer aborts it. With no interaction, moving focus to the heading only when the focused Disable disappears is harmless recovery; an additional arming state adds complexity for no demonstrated everyday harm. |
| I-B4 | false | reject | Each actual mutation settlement invokes reconciliation once; close without a token acquires a fresh lease or returns while occupied. Same-token concurrent reconcile calls require direct coordinator invocation not performed by callers. |
| I-B5 | low | patch — resolved | Added upstream 429 to the existing feature failure matrix; mapped feedback, exactly-one mutation, closure, focus and authoritative refresh assertions all pass. |
| I-B6 | low | reject | Held mutation feature tests cover duplicate activation, Cancel and Escape; ConfirmDialog foundation tests additionally cover busy overlay, confirm and extra actions. A second browser held-request fixture duplicates those paths and adds orchestration without a distinct demonstrated defect. |
| I-B7 | low | reject | The remount harness intentionally retains useMyself to model PageFrame's persistent readers. Removing those readers would model a different composition rather than Account panel navigation; an additional synthetic fixture adds complexity without demonstrated consumer harm. |
| I-B8 | low | patch — resolved | Existing real-browser confirmation test now verifies Shift+Tab wrapping and Space activation while retaining the exact single-request assertion; all four theme/project cases and the full Account browser suite pass. |
| I-B9 | medium | defer | Confirmed pre-existing shared ConfirmDialog height/overflow issue: at 600x240 with 200% root text, dialog top=-89/bottom=329 and action bottom=280 exceed the 240px viewport; overflow-y is visible. Normal text fits (top=25/bottom=215). Both baseline and merged foundation lack a height cap/scroll region. Needs separate foundation follow-up; story cannot edit shared UI. Probe evidence: /tmp/story83-short-enlarged-viewport-probe.log. |
| I-B10 | false | reject | The browser collector asserts the exact sole MFA path before re-enrollment, so any base-MFA call fails; proxy negative tests reject both base disable endpoints. The mock field check is supplemental, and backend source already verifies only TOTP_ENABLED is changed. |
| I-Edge | false | none | Edge-case layer returned no findings after tracing. |
| I-Verification | false | none | Verification-gap layer returned no gaps; all changed consumers have passing coverage. |

## Design Notes

Footprint: Team B MFA files, including a controller hook and cache coordinator. Foundation prerequisite resolved: PR #24 merged and inherited from main; no unresolved product choice. Use one existing feature coordinator for both flows: separate controllers must not release each other's outstanding-request or status-refresh gates. Existing mobile keyboard and asset-license deferrals remain unchanged.

### Final feature coverage closure

- Added behavioral event-API tests for synchronous repeated activation, cross-controller lease contention, expiry takeover, QR decode failure during held validation, stale reconciliation rejection and explicit focus transfer. The normal UI suites retain userEvent coverage; queued/reentrant stress dispatch is documented in the tests. No private React internals or DOM property mutations were used.
- Removed redundant pre-checks already enforced atomically by `coordinator.begin`, and simplified impossible branches with their invariants: a controlled Dialog without a DialogTrigger only requests dismissal; the Input's text type guarantees numeric selection positions; expiry publishes before settlement and invalidates its request generation. Origin focus resolves the actual activating tile by its deterministic id. No coverage exclusions were added.
- Exact feature command: `corepack pnpm vitest run features/mfa --coverage --coverage.include='features/mfa/{authenticator-card,authenticator-link-dialog,use-authenticator-controller,mfa-coordinator}.{ts,tsx}' --coverage.reporter=json --coverage.reporter=text --coverage.reportsDirectory=/tmp/story83-final-feature-coverage` — **95 tests / 5 files passed**, enforcing the normal **100%** thresholds: statements **326/326**, branches **254/254**, functions **54/54**, lines **250/250** across the four changed implementation files. Report: `/tmp/story83-final-feature-coverage/coverage-final.json`; log: `/tmp/story83-final-feature-coverage.log`.
- Final targeted API/proxy/catalog/features command: `corepack pnpm vitest run features/mfa lib/api/mfa.test.ts lib/server/proxy/allowlist/mfa.test.ts lib/shared/messages/messages.test.ts` — **883 tests / 8 files passed**; log `/tmp/story83-final-targeted.log`. Full lint, typecheck and forbidden/token gates passed.
- Added a Story 8.3 confirmation width/axe check at **600px** in both themes, asserting **16px** x offset and **568px** width. Existing mobile/desktop accessibility and post-disable enrollment checks remain. These new browser cases are written but await the integrating agent's production run.
- Integrated verification passed: **5,766 tests / 209 files** and **100%** enforced library coverage (`/tmp/story83-integrated-full-coverage.log`), followed sequentially by production Account Playwright with two workers: **346 passed / 6 expected viewport skips** (`/tmp/story83-integrated-account-browser.log`). All frozen-matrix rows are covered by passing feature/browser tests, including the new 600px checks and real re-enrollment. Final BMAD review now runs on the staged integrated diff. No story publication is authorized.

### Final integrated result

- All story-owned implementation tasks and frozen-matrix tests passed. PR #24 is merged and inherited from main; no story-owned shared UI changes remain in the diff against main.
- Final full unit/coverage run: **5,767 tests / 209 files passed**, **100% statements/branches/functions/lines** across 131 enforced library files (`/tmp/story83-reviewed-full-coverage.log`). Changed MFA implementation additionally has **100%** coverage in every metric across all four implementation files; no exclusions added.
- Final production Account browser run: **346 passed / 6 expected viewport skips**, two workers (`/tmp/story83-reviewed-account-browser.log`). Final lint, TypeScript and forbidden/token checks passed (`/tmp/story83-reviewed-{lint,types,forbidden}.log`).
- Final integrated BMAD build review: all three layers completed; **2 test patches resolved**, **7 findings rejected with evidence**, **1 pre-existing shared dialog height issue deferred** to the Team B follow-up queue for a separate foundation change. All prior iteration's story-owned findings were resolved and covered by regression tests. The height follow-up is not a new regression from the width prerequisite or this story.
- No story push or PR was requested. A local conventional commit records the completed implementation under the explicitly invoked bmad-build workflow.

## Verification

Targeted MFA API/allowlist/feature tests, lint/typecheck/forbidden, full enforced coverage, then production Account Playwright with two workers. Coverage and browser runs sequentially. Include empty response, generic/coded errors, late mutation results, held identity refresh, shell focus and negative base-MFA-call assertions. Run BMAD review on the final diff.
