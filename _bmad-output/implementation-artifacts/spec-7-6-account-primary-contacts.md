---
title: 'Story 7.6 Switch Primary email and phone (NG-9035)'
type: 'feature'
created: '2026-10-19'
status: 'ready-for-dev'
route: 'dispatch'
baseline_commit: '4f57ca2ddf70ea59ef745ae361b8063f3c0540fa'
story_key: '7-6-switch-primary-email-and-phone'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
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
- `features/shell/use-section-form.ts`: foundation prerequisite; no restore transform exists. External registry wrapping would replace hook-owned lifecycle callbacks.

## Tasks & Acceptance

**Execution:**
- [ ] `spec-f-section-draft-mapping.md` -- deliver prerequisite separately first.
- [ ] `features/account/primary-contacts.ts` + colocated tests -- option building, dedupe, membership and restore fallback; preserve chosen region casing.
- [ ] `features/account/schema.ts` + tests -- eight-field defaults/drafts/diff, phone requirement and email format.
- [ ] `lib/api/account.ts` + tests -- explicit contact payload and PersonalInformationPayload type exclusions; retain identity-preflight regressions.
- [ ] `lib/server/proxy/allowlist/user-edit.account.test.ts` -- existing contact acceptance and paired-phone rejection contracts; no Team A source edits.
- [ ] `features/account/account-save.ts` + tests -- current verified membership before any write, acknowledged contacts and retry-only failed parts.
- [ ] `features/account/account-primary-picker.tsx`, `account-edit-fields.tsx`, `account-settings-section.tsx` + tests -- scoped reads, notices, guarded links, errors, draft transform and read/header propagation.
- [ ] `lib/shared/messages/account.ts` -- exact story copy; search catalog first.
- [ ] `e2e/account-primary-contacts.spec.ts`, `e2e/fixtures/account.ts` -- actual controls, UJ-101, cache reuse, failures, drafts, guarded helper link, expiry and axe.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- own story line only.

**Acceptance Criteria:**
- Given 7.6 scenarios, when unit/browser tests run, then every matrix row has request/control assertions.
- Given successful details and failed zone, when own Save or guard retries, then primaries are omitted.
- Given fresh shared lists, when editing, then no duplicate reads occur; given read view, then contact loaders stay unmounted.
- Given ownership guards, when lint/type checks run, then outside-Account imports fail and Personal payload excludes contact fields.

## Design Notes

No irreversible implementation actions. Approximately 15–20 owned source/test files. Foundation adds an optional restore mapper separately. Read display must map acknowledged primaryEmail/primaryPhone to Myself.email/phoneNumber; preserve 7.5 stale-refresh protection. Region/verification metadata never enters drafts. Failed reads cannot authorize a changed contact or erase pending values.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

Run focused Account/API/contract Vitest and production Playwright first. Then typecheck, lint, forbidden/token gates, full unit coverage (100% enforced server/API/shared), affected Account/shell browser regression and git diff --check. Include original identity-preflight/draft regressions. Mock PNFR10 expiry; real-demo acceptance remains an existing environment check.
