---
title: 'Story 7.6 Switch Primary email and phone (NG-9035)'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: '4f57ca2ddf70ea59ef745ae361b8063f3c0540fa'
story_key: '7-6-switch-primary-email-and-phone'
implementation_base_commit: 'dce921008430ec767c4771ee1f8977396382029a'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/AUTH-ARCHITECTURE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
  - '{project-root}/node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md'
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Account displays primary contacts but cannot select verified replacements for login and notifications.

**Approach:** Extend the existing 7.5 form with Email/Mobile pickers and changed-only contact writes, preserving partial-save recovery, identity checks and drafts. Story 7.6 in epics.md is the acceptance authority.

## Boundaries & Constraints

**Always:** Reuse shared contact keys, Select, StateFrame, mapper, navigation, form and attemptAll runner. Keep current primary selected even when unverified; alternatives require Verified Email/Mobile, never Landline. Preserve row order, locked credentials and 7.5 behavior. Shared draft-mapping extension must ship in its separate foundation PR first (spec-f-section-draft-mapping.md).

**Never:** Edit Team A, shared controls/registries, aggregators, ownership gates or sprint headers. No custom draft store, registry replacement or effect that silently rewrites live selections. No new endpoint, confirmation dialog, real-account mutation, deployment or performance claim.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Options | Edit opens | Cached Email/Mobile keys; current shown while busy; dedupe and exclude current; email matching case insensitive; formatted Mobile only | Read view issues no contact fetch |
| No alternatives | Only current exists | Focusable aria-disabled Select; exact story helper with guarded personal-profile link to contacts#email/phone | Dirty navigation uses leave guard |
| Change | First selection differs | Exact story info notice persists even after reverting, until Save/Cancel; no confirmation | Controls locked during save |
| Validation | Missing phone, malformed email or unknown changed selection | Exact required/format copy; unknown or no-longer-Verified changes fail before requests | Preserve values and focus errors; unresolved lists cannot authorize changes |
| Save | Valid changed primaries | Same details PUT; email only if changed; phone and chosen row region together, default us, retain supplied region casing | A→B→A sends no email; preserve D-A failures |
| Partial | Details succeeds, regional fails | Acknowledge contact values; retry sends only pending steps | Duplicate email under picker; ordinary errors in existing per-part banner; expiry stops |
| Read errors | Contact 403 or ordinary failure | Only affected pickers show current read-only/no-access or page-copy Retry; other fields stay savable | Retry only contact keys; distinguish failed reads from empty lists |
| Success | Complete save | Existing toast; identity plus Email/Mobile/Landline revalidate; notices clear; header updates | Later expiry uses normal dialog |
| Draft | Relaunch/restore | Add only primaryEmail/primaryPhone values to six existing fields and baseline hash | Missing Verified drafted option falls back to current; do not apply before lists resolve |

</frozen-after-approval>

## Code Map

- `features/account/schema.ts`, `account-save.ts`, `account-settings-section.tsx`, `account-edit-fields.tsx`: existing defaults/diff, partial rebase, acknowledgement retirement, refresh and controls.
- `lib/api/account.ts`: sole explicit details builder. Shared contact-points/keys/error mapper and personal allowlist already provide the contracts; reuse unchanged.
- `features/shell/use-section-form.ts`: optional transformDraft is now merged through foundation PR #16; reuse it. External registry wrapping would replace hook-owned lifecycle callbacks. Read the Story 7.6 section and Foundation notes in `_bmad-output/planning-artifacts/epics.md` for the full acceptance contract.

## Tasks & Acceptance

**Execution:**
- [x] `spec-f-section-draft-mapping.md` -- deliver prerequisite separately first.
- [x] `features/account/primary-contacts.ts` + colocated tests -- option building, dedupe, membership and restore fallback; preserve chosen region casing.
- [x] `features/account/schema.ts` + tests -- eight-field defaults/drafts/diff, phone requirement and email format.
- [x] `lib/api/account.ts` + tests -- explicit contact payload and PersonalInformationPayload type exclusions; retain identity-preflight regressions.
- [x] `lib/server/proxy/allowlist/user-edit.account.test.ts` -- existing contact acceptance and paired-phone rejection contracts; no Team A source edits.
- [x] `features/account/account-save.ts` + tests -- current verified membership before any write, acknowledged contacts and retry-only failed parts.
- [x] `features/account/account-primary-picker.tsx`, `account-edit-fields.tsx`, `account-settings-section.tsx` + tests -- scoped reads, notices, guarded links, errors, draft transform and read/header propagation.
- [x] `lib/shared/messages/account.ts` -- exact story copy; search catalog first.
- [x] `e2e/account-primary-contacts.spec.ts`, `e2e/fixtures/account.ts` -- actual controls, UJ-101, cache reuse, failures, drafts, guarded helper link, expiry and axe.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- own story line only.

**Acceptance Criteria:**
- Given 7.6 scenarios, when unit/browser tests run, then every matrix row has request/control assertions.
- Given successful details and failed zone, when own Save or guard retries, then primaries are omitted.
- Given fresh shared lists, when editing, then no duplicate reads occur; given read view, then contact loaders stay unmounted.
- Given ownership guards, when lint/type checks run, then outside-Account imports fail and Personal payload excludes contact fields.

## Design Notes

No irreversible implementation actions. Approximately 15–20 owned source/test files. Foundation adds an optional restore mapper separately. Read display must map acknowledged primaryEmail/primaryPhone to Myself.email/phoneNumber; preserve 7.5 stale-refresh protection. Region/verification metadata never enters drafts. Failed reads cannot authorize a changed contact or erase pending values.

## Implementation Notes

- Foundation prerequisite merged first in PR #16: https://github.com/Tachin-ai-Corporation/personal-profile/pull/16, merge dce921008430ec767c4771ee1f8977396382029a. Both CI runs passed; PR browser run had 720 passes / 10 expected skips. Story branch rebased onto main before implementation. Preserve the original planning baseline_commit; implementation_base_commit identifies the already-merged prerequisite for feature-only audit.
- The user authorized prerequisite commit/push/PR/merge and full Story 7.6 implementation/validation/BMAD review in one request. Do not push or merge the feature story as part of that foundation-only remote authorization.
- Exercise restoration from a cold mobile contact cache: idle read view must not load contacts, but an explicit Restore must resolve verified choices without being permanently blocked by reads gated on isEditing. Keep the draft until dependencies resolve, and do not overwrite live user choices through a blanket sanitizing effect. Cover invalid/unavailable drafted values falling back to current.
- Validate changed primary membership before any request, including regional requests, while keeping names/regional saves available when unchanged pickers have read errors. Extend successful-details acknowledgements to both contact fields and map their form names to Myself email/phoneNumber in the read model.
- Full coverage and browser runs must be sequential, with bounded workers (2–4), to avoid resource-contention tooling timeouts. Run focused tests first. Existing 7.5 regressions may need their expected eight-field draft/default shapes updated; preserve assertions and coverage.

## Spec Change Log

## Review Triage Log

All three BMAD layers completed before triage. Findings were judged individually:

| ID | Verdict / route | Evidence |
|---|---|---|
| B1 | medium / patch | A removed/unverified selected alternative leaves zero alternatives; the disabled condition also blocks the current entry, while membership validation blocks Save. Allow reverting to current and cover revalidation. |
| B2 | low / patch | Unchanged Save bypasses the save callback, so A→B→A retains its notice. Clear notices in the explicit Save handler as well. |
| B3 | medium / patch | The unconditional two-list prerequisite blocks a names-only draft when an unrelated picker read fails. Require a resolved list only for a changed drafted primary needing membership validation; preserve refusal for unresolved changed choices. |
| B4 | medium / patch | Picker StateFrame omits attempt; repeated Retry failures have unchanged live-region content. Add a local failure counter using the existing StateFrame contract. |
| B5 | low / patch | Cached read retry uses isLoading and keeps its old error without pending feedback. Use revalidation state for retry feedback at the affected picker. |
| B6 | medium / patch | Exact string matching loses a national current phone's region when myself/contact formatting differs. Use the existing primaryPhoneRegion resolver for the current primary. |
| B7 | low / patch | Field-mapped duplicate email is rendered under the picker and again in the part banner. Filter field outcomes from the banner; preserve generic part failures. |
| B8 | false / rejected | Shared SWR has no separate time-to-live freshness contract beyond its established deduplication/revalidation policy. This test proves reuse of fresh shared keys under that policy; inventing a longer freshness window would change the foundation contract. |
| B9 | low / patch | No mounted-picker test exercises verification removal after selection. Add recovery and no-write assertions with B1. |
| B10 | low / patch | Email helper is exercised, phone hash/guard is not. Parameterize the helper navigation coverage for both destinations. |
| E1 | medium / patch | Independently confirms B1: disabled empty alternatives prevent recovery to current after a live revalidation. |
| V1 | medium / patch | Existing save-lock assertions use empty lists, so the independent no-alternatives condition masks a missing saving lock. Hold a write with enabled alternatives and verify both controls remain unchanged. |
| P2 | medium / patch | Final ESLint rejected rendering restore dependency flags from a ref. Store render-relevant flags in state and preserve deferred Restore tests; no lint suppression. |
| P1 | medium / patch | Parent stale-national-phone probe confirmed the old cached Primary/us row overrode the chosen GB row while acknowledgement was active. The confirmed identity could also arrive before Mobile relabeling. Prefer the matching current Mobile row region in the Account view model, with the shared resolver as fallback; drafts and shared code stay unchanged. |
| V2 | medium / patch | Success browser refresh supplies new identity immediately; name-only stale-read regressions cannot detect missing contact acknowledgement mapping. Add a stale-identity mounted regression for both primary fields. |

Survivor groups: unavailable-choice recovery (B1/B9/E1); unchanged Save notice (B2); unrelated draft dependencies (B3); retry announcements (B4); retry pending feedback (B5); current phone region (B6); field banner duplication (B7); phone helper coverage (B10); selectable save locking (V1); stale contact acknowledgements (V2). All are direct local corrections or tests of existing contracts; no public API additions, intent/spec loopback or deferral.

## Verification

Run focused Account/API/contract Vitest and production Playwright first. Then typecheck, lint, forbidden/token gates, full unit coverage (100% enforced server/API/shared), affected Account/shell browser regression and git diff --check. Include original identity-preflight/draft regressions. Mock PNFR10 expiry; real-demo acceptance remains an existing environment check.


### Executed validation — pre-review patches

- Parent audited every task and matrix row against the unified planning-baseline diff (including the already merged prerequisite) at `/tmp/story-7-6-bmad-review.diff`; feature changes were also checked against implementation_base_commit. Existing proxy pairing/lint ownership contracts were reused unchanged.
- Focused Account/API/proxy units: 198 passed in 9 files; an additional schema case then ran in the full suite. Typecheck, lint, forbidden/token gates passed.
- Production Account browser: 164 passed / 2 expected viewport-specific skips, including all 22 new 7.6 cases; desktop/mobile, light/dark and axe checks passed. Command: `corepack pnpm test:e2e e2e/account-primary-contacts.spec.ts e2e/account-settings-edit.spec.ts e2e/account-settings.spec.ts e2e/account-page.spec.ts --workers=2`.
- Full isolated coverage: 187 files / 4,758 tests passed; statements, branches, functions and lines each 100% in enforced modules. Command: `corepack pnpm vitest run --coverage --maxWorkers=2`; log `/tmp/story-7-6-coverage.log`.
- Production shared Section/draft regressions: 30 passed across desktop/mobile. Command: `corepack pnpm test:e2e e2e/section.spec.ts e2e/drafts.spec.ts --workers=2`; log `/tmp/story-7-6-shell-browser.log`.
- All three context-free BMAD review layers completed; individual triage and local corrections are recorded above. Final post-patch validation follows below.


### Review closure and final validation — 2026-10-19

- Resolved every surviving BMAD group and parent verification correction (P1/P2); B8 was rejected with its specific shared-cache refutation. No new deferrals, unresolved findings, intent changes or shared source edits.
- Recovery now allows reverting invalidated alternatives, preserves unrelated draft fields through failed independent reads, clears notices on unchanged Save, scopes duplicate errors to the field, and exposes repeated read failures/pending retries through the existing StateFrame contract. Tests cover both helper destinations, enabled picker save locking and acknowledged contacts over stale identity/contact rows.
- P1 was reproduced with a GB national phone before and after identity confirmation while the old Mobile Primary label persisted. Account view-model formatting now prefers the matching current Mobile row region and falls back to the existing shared resolver. Focused component/view-model validation: 98 passed in 3 files.
- Full unit suite: 187 files / 4,768 tests passed, with 100% statements/branches/functions/lines in enforced server/API/shared modules. Log: `/tmp/story-7-6-final-coverage.log`. Final render-state correction P2 additionally passed all 11 primary-contact component cases and file ESLint; no suppression or threshold changed.
- Final TypeScript, full ESLint, forbidden/token and whitespace checks passed. Logs: `/tmp/story-7-6-final-typecheck.log`, `/tmp/story-7-6-final-lint.log`, `/tmp/story-7-6-final-gates.log`.
- Final production build and affected Account Playwright: 168 passed / 2 expected viewport skips, including all 26 primary-contact cases. Desktop/mobile, light/dark, Select/helper/notices axe, held-save locking, cold and clean-fallback restore, mapped errors, partial retry and mocked expiry passed. Log: `/tmp/story-7-6-final-browser.log`. Shared Section/draft production regression remains 30 passed; Account-only patches do not change that fixture or shared source.
- Parent re-read changed source/tests, refreshed the complete baseline diff and feature-only diff, checked every matrix row against executed passing tests, and verified approved frozen intent and sprint headers remained unchanged. Spec done; own sprint story moves to review for team review. Local conventional commit only; feature push/PR/merge and real-demo PNFR acceptance are not performed here.
