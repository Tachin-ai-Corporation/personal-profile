---
title: 'Story 8.2 Link an authenticator app (NG-9037)'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: 'a56a8358de9adc26afef57e68ac19498d003cfba'
story_key: '8-2-link-an-authenticator-app'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Account shows authenticator status but its tiles cannot enroll an app.

**Approach:** Implement Story 8.2 in epics.md, the acceptance authority: user-initiated QR enrollment, six-digit validation, accessible feedback and shared status refresh. Interpolate the selected vendor as the legacy modal does; Microsoft matches the AC example.

## Boundaries & Constraints

**Always:** Reuse the named validation op, mapped errors, dialog, tokens, telemetry and shared identity. Human decision: use demo's existing backend limit of 500 requests per 60 seconds, retaining its general per-instance scope and private-client exemption; no new BFF counter or Redis prerequisite. This accepts existing protection, not a verified TOTP-specific lockout. Keep Story 8.2 on `feat/NG-9037-link-authenticator`; run bmad-code-review before the authorized commit/push.

**Never:** Enable base MFA, implement 8.3, rotate secrets from effects, automatically retry mutations, persist QR/codes, register drafts/Save, edit shared foundation in this story, or operate on real accounts. Prerequisite foundation changes merge separately first.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Start | Unlinked; activate any tile | One enable request; chosen tile busy, others inert; fresh PNG QR opens dialog | Ref gate; discard stale/unmounted/pagehide responses |
| Prerequisites | Base MFA unavailable / already linked | Focus repeated information notice / refresh myself without dialog | Existing coded mapper results |
| Failure | Enable or validate fails | Mapped generic text or catalog fallback; upstream 403 becomes card-only no-access | Session closes/clears without stealing shell focus; no automatic retry |
| Input | Typed/pasted code | Digits only, max six; short Submit announces error and focuses field without request | Submit enabled unless validating; single-flight valid submissions |
| Invalid | Validate returns false | Clear code, retain QR and focus; emit mfa_link false with per-open attempt | Never request another QR |
| Success | Validate returns true | Close, clear secrets, toast, refresh myself; heading focus, linked state | Emit only ok/attempt telemetry |
| Close | Cancel, Escape, close, unmount, pagehide | Clear sensitive state; cancellation refreshes myself and restores originating tile | Busy dialog non-dismissible; suppress late responses |
| Presentation | Both themes; 360px/desktop | 440px desktop dialog; full-screen mobile with scrolling body/pinned actions; white 184px QR, labeled 200x44 code field | Focus trap, initial field focus, announced errors, no overflow |

</frozen-after-approval>

## Code Map

- `features/mfa/authenticator-section.tsx`, `authenticator-card.tsx`, `mfa-access.ts`: existing read/error/focus and onLink seams; preserve 8.1 behavior and registry exclusion.
- `features/mfa/authenticator-link-dialog.tsx`: new enrollment owner; QR/code only in transient component state, request-generation/ref guards, dismissal/focus cleanup and per-open attempts.
- `lib/api/mfa.ts`: existing path builders; add imperative enableTotp/validateTotp using callApi and required contexts. Validate response shapes; no SWR enrollment key.
- `lib/server/proxy/allowlist/mfa.ts`: add bodyless/queryless POST enable/totp with profile:true. Validation remains denied as passthrough.
- `lib/server/named-ops/mfa-validate.ts`, `app/api/pp/mfa/validate/route.ts`: complete foundation contract; reuse unchanged unless a separate prerequisite explicitly extends it.
- `lib/api/errors/mfa.ts`, `lib/shared/messages/mfa.ts`: existing coded mappings; add owned copy, expose upstream text only through the mapper.
- Legacy `AuthAppSetupModal.tsx` interpolates authenticatorName. Backend `oauth2/.../MfaServiceImpl.java:103` validates without counting; `MfaAuthFilter.java:45,128` limits OAuth login only.

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/mfa.ts`, `mfa.test.ts` -- client calls, response-shape/error/redaction cases; reuse shared logger tests without editing them.
- [x] `lib/server/proxy/allowlist/mfa.ts`, `mfa.test.ts` -- narrow enable entry and deny/query/body/kill-switch coverage.
- [x] `features/mfa/authenticator-link-dialog.tsx`, `authenticator-section.tsx`, `authenticator-card.tsx` -- enrollment, busy/notice wiring and all matrix outcomes.
- [x] `lib/shared/messages/mfa.ts` -- exact/template copy, common actions, marked draft fallbacks.
- [x] `features/mfa/*.test.tsx` -- matrix, held requests, StrictMode, stale responses, privacy, focus, repeated notices and telemetry.
- [x] `e2e/fixtures/mfa.ts`, `e2e/account-authenticator*.spec.ts` -- stateful wrong/correct code, cancellation/reopen, base-MFA-off, 403 and theme/mobile axe; replace obsolete unlinked inert-tile expectation.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- own 8.2 entry only; preserve header/last_updated and other stories.

**Acceptance Criteria:**
- Given the accepted existing demo policy, when upstream rejects a request with 429, then the flow shows its mapped error without automatic retry; no new BFF limiter is required.
- Given every matrix case, when tests run, then behavior matches authoritative 8.2 ACs and existing Account regressions pass.
- Given successful verification, when publishing, then BMAD code review has completed before commit/push to the story branch.

### Review Findings

Standalone `bmad-code-review`, 2026-10-19, reviewed commit `7d83fc9992f7936e5a4841e03c376c928159eed3` against `main`. Four layers completed; verification-gap and acceptance-auditor reported no findings. This review found additional lifecycle/UI issues after the earlier build review. No application code changed during this review.

- [x] [Review][Patch] R1 (medium): Retain physical validation coordination after pagehide until its request settles, preventing a new enable call from overlapping it. [`features/mfa/authenticator-link-dialog.tsx:45`]
- [x] [Review][Patch] R2 (medium): Reconcile shared status after a discarded late validation result; a return-time identity refresh can finish before upstream validation changes the account. [`features/mfa/authenticator-link-dialog.tsx:148`]
- [x] [Review][Patch] R3 (medium): Prevent another enrollment from starting during the delayed status refresh after successful validation. Tiles become active before refreshed identity confirms the new linked status. [`features/mfa/authenticator-link-dialog.tsx:95`]
- [x] [Review][Patch] R4 (medium): Keep truthful in-flight tile feedback when an enable request survives pagehide. Tiles currently look enabled but silently ignore activation until the outstanding request settles. [`features/mfa/authenticator-link-dialog.tsx:49`]
- [x] [Review][Patch] R5 (medium): Clear obsolete enrollment notices when observed account status changes; an Enabled card can retain the base-MFA-unavailable notice. [`features/mfa/authenticator-link-dialog.tsx:76`]
- [x] [Review][Patch] R6 (low): Clear or update field errors when editing/pasting a new code; a complete six-digit value retains the short-code message and aria-invalid until resubmission. [`features/mfa/authenticator-link-dialog.tsx:187`]

#### Individual verdicts before grouping

| ID | Source | Verdict | Verified evidence / disposition |
|---|---|---|---|
| 1 | blind-hunter | medium | clear resets validatePending while await validateTotp is still unresolved; held-request reproduction admits a second enable. R1. |
| 2 | blind-hunter | medium | Reproduction refreshes myself after pagehide but before validation settles, then late true is discarded without another read: backend linked, card Not set up. SWR focus/visibility refresh alone does not close this ordering gap. R2. |
| 3 | blind-hunter | medium | Held-enable reproduction: after pagehide tiles have no aria-disabled, but another activation is ignored by enableRequestPending. R4. |
| 4 | blind-hunter | medium | Reproduction changes shared myself to linked after MFA_NOT_ENABLED: Enabled and the obsolete prerequisite notice render together. Reconciliation never clears notice. R5. |
| 5 | blind-hunter | medium | Delayed post-success identity reproduction: tiles become enabled; another activation launches a second enable after its page-user check completes. Backend may refuse it, but UI exposes a completed action again while reconciliation is pending. R3. |
| 6 | blind-hunter | low | onChange/onPaste update code only; short-submit error/aria-invalid remain on a now-complete code. Direct local UI correction. R6. |
| 7 | blind-hunter | low | Browser privacy assertions stop before success, but the complete-flow unit test actively enables development logging and inspects caches, storage/writes, console and telemetry after invalid and successful validation. Reject redundant additional browser assertions; no uncovered application privacy defect demonstrated. |
| 8 | blind-hunter | low | Browser cancellation test does not count reads; the feature cancellation test captures readsBeforeDismissal and awaits an increment for Cancel/Escape/Close. Reject duplicate browser accounting without a demonstrated consumer gap. |
| 9 | blind-hunter | low | e2e/ui-kit.spec.ts:113 exercises the reused Dialog's mobile full height, body scroll and pinned footer. Story tests verify the full-screen integration and geometry. Reject duplicating shared-control scenarios without an observed composition failure. |
| 10 | edge-case-hunter | medium | Same held physical validation/reset defect as finding 1. Grouped only after individual verification; R1. |

Five isolated reproduction tests passed (they assert the observed bad behaviors), then the temporary test was removed from the working tree. Evidence retained locally at `/tmp/story82-code-review-repro.log` and `/tmp/story82-code-review-repro.test.tsx`; these are ephemeral, not regression fixes.

#### Rejected

- Finding 7 — low: complete-flow privacy, including successful validation and active development logging, already has direct feature coverage; extra browser assertions would duplicate it.
- Finding 8 — low: every cancellation action already proves a fresh identity read in the feature tests; no additional runtime defect shown.
- Finding 9 — low: mobile height/scroll/pinned-footer behavior is verified by the shared Dialog browser contract; no story-specific override or failing composition shown.

Summary: 0 decision-needed, 6 patches resolved, 0 defer, 3 rejected. Human selected Apply every patch.

Resolution (2026-10-19):
- R1/R4: one in-flight mutation guard covers enable and validation, survives dialog cleanup/pagehide, and retains truthful busy/inert tiles until the request settles.
- R2/R3: discarded late results revalidate shared identity; completed validation keeps enrollment blocked until its identity refresh settles, including another pagehide during that refresh. Session expiry prevents background revalidation and preserves shell focus.
- R5: unavailable/linked card transitions and dialog cleanup remove obsolete notices.
- R6: typing or pasting a replacement code removes the prior field error without sending a request.
- Regression verification: 39 enrollment unit tests; full 206-file suite passed with 5,705 tests and all 131 enforced files at 100% statements/branches/functions/lines. Production Account browser suite: 330 passed / 6 expected skips, including delayed validation and delayed identity refresh in desktop/mobile. Typecheck, lint, forbidden-pattern and whitespace checks passed. Local evidence: `/tmp/story82-six-patches-coverage.log`, `/tmp/story82-six-patches-e2e.log` (ephemeral).
- No foundation/API/session contract or accepted rate-limit policy changed. Three rejected items and all frozen intent remain unchanged.

## Implementation Notes

- CI hover-test follow-up (2026-10-19): the semantic-color probe inherited the universal reduced-motion 0.01ms transition, so its second computed read could still return the previous card color. A standalone browser reproduction showed 200/200 incorrect reads; disabling transition-property on that probe produced 0/200. Probe transitions are now disabled; hover expectations also honor `(hover: hover)` so touch-only devices correctly retain the card surface. No application CSS or runtime behavior changed. Both linked/unlinked surface/theme/axe cases passed 10 repetitions on desktop and mobile (40 total, 2 workers, no retries); lint/typecheck/forbidden checks passed. Evidence: `/tmp/story82-hover-regression-final.log` (ephemeral). The full 934-case CI suite was not rerun locally for this test-only correction.

- Parent diff audit: all seven execution tasks implemented; story-only ownership preserved. No named-op/session/foundation implementation changes.
- Matrix audit: start/StrictMode/held requests and stale-response tests cover Start; repeated base notices/already-linked cover Prerequisites; 403/proxy errors/429/session tests cover Failure; typed/pasted/short input covers Input; boolean flow/telemetry covers Invalid and Success; cancellation/pagehide/unmount/late validation covers Close; both-theme 360px/desktop axe/focus-trap/dimension browser tests cover Presentation. Complete-flow privacy inspects SWR, storages, console, telemetry and URLs.
- Final implementation checks: 206 unit files, 5,692 tests; all 131 enforced files at 100% coverage. Account browser: 326 passed / 6 expected skips. Final-build enrollment: 14 passed. Lint, typecheck and forbidden checks passed. Evidence: `/tmp/mfa-coverage-final.log`, `/tmp/mfa-e2e.log`, `/tmp/mfa-e2e-final.log` (ephemeral local logs).

- Backend `9a7342252e`: `WebMvcCommonConfig` registers `RateLimitInterceptor`; `RateLimitServiceImpl` counts in memory. Demo/prod env files set 500/60s. No deployed TOTP-specific lockout verified.

## Spec Change Log

- Human chose demo's policy; PR #21 is no longer a prerequisite.

## Review Triage Log

| ID / source | Verdict | Evidence and route |
|---|---|---|
| B1 blind | medium | Footer Buttons omit size, so button.tsx defaults to h-9 and DialogFooter adds no minimum. Patch: use touch size and assert 44px browser targets. |
| B2 blind | medium | Enable-time upstream 403 removes the focused tile before any dialog has mounted; close autofocus cannot run. Patch: focus existing landmark heading for pre-open denial. |
| B3 blind | medium | PNG data-URI regex accepts the test's non-PNG hello bytes; no image error handler exists, leaving skeleton forever. Patch with mapped/catalog failure feedback and cleanup, no automatic QR request. |
| B4 blind | medium | pagehide clears pending while enable remains outstanding; a second activation can rotate a secret concurrently. Generation guards only discard responses. Patch: retain coordination until the outstanding mutation settles and test held request ordering. |
| B5 blind | medium | Shared myself can revalidate to linked/no-access while enrollment state remains open. Patch: reconcile observed linked/error card transitions and discard pending validation outcomes. |
| B6 blind | low | Browser fixture returns one constant PNG, contradicting its rotating-response claim; unit reopening already asserts distinct values. Direct test correction: distinct valid fixture PNGs and browser assertion. |
| B7 blind | medium | Existing telemetry assertions cover only one opening and no transport failure; attempts reset and failed-call accounting lack regression assertions. Patch targeted tests; implementation already resets/increments correctly. |
| B8 blind | low | Cumulative reads > 1 can be satisfied by initial load and pre-write identity check before Cancel. Direct correction: capture reads before dismissal, await an increment. |
| B9 blind | low | isLocalDev is false under test, making full-flow console assertions vacuous for real logger behavior; shared redaction tests do cover code/qrCode keys. Direct test correction: enable logger for the privacy test and prove calls occurred. |
| E1 edge | medium | Same invalid-decode path as B3; accepted data URI can fail img decoding. Group with B3; same patch. |
| V1 verification | medium | Pre-verified gap: deleting attempt reset preserves all current assertions; no reopened validation currently checks attempt 1. Group with B7 reset coverage. |
| P1 parent | medium | start captures document.activeElement rather than clicked tile; browsers that do not focus buttons on pointer activation can restore body/another control. Patch: focus event.currentTarget before invoking the existing onLink seam; no API change. |

All entries route to patch: local corrections to observed states or targeted assertions; no new public surface, infrastructure, policy or frozen-intent change. No deferrals.

- Resolution: all B1–B9, E1, V1 and P1 patches applied and checked. No review deferrals. Final reconciliation uses guarded render state cleanup plus layout-effect request invalidation, passing the existing React lint rule without suppression.
- Post-review verification: 206 unit files / 5,699 tests passed, 131 enforced files at 100% statements/branches/functions/lines; production Account Playwright 326 passed / 6 expected skips, including corrected enrollment flows in both themes and viewports. Lint/typecheck/forbidden/diff checks passed. Final evidence: `/tmp/story82-post-review-coverage.log`, `/tmp/story82-post-review-e2e.log` (ephemeral local logs).

## Design Notes

Footprint: 12–16 Team B files plus tracking. Mocked development only. Mobile keyboard-inset handling remains Foundation deferred work; reuse Dialog.

## Verification

Targeted MFA API/allowlist/feature tests, then lint/typecheck/forbidden checks, full enforced coverage and production Account Playwright with two workers. Coverage and browser run sequentially. Assert no QR/code in caches, storage, URLs, logs or telemetry; keep session-dialog focus ownership. Review with bmad-code-review before the authorized push.
