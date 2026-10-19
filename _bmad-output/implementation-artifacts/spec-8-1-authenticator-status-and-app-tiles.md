---
title: 'Story 8.1 Authenticator status and app tiles (NG-9036)'
type: 'feature'
created: '2026-10-19'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '18e8b1723af454c7af9ec6cc4254066fc6e50a97'
story_key: '8-1-authenticator-status-and-app-tiles'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Account authenticator placeholder cannot show linked status or available apps.

**Approach:** Implement Story 8.1 in epics.md, the acceptance authority: shared identity status, accessible vendor tiles, loading/error/no-access states and existing anchor handling.

## Boundaries & Constraints

**Always:** Reuse useMyself, SectionLandmark, StateFrame, StatusBadge, Button, Tooltip and catalog copy. Only totpEnabled === true means linked. Keep the landmark mounted immediately. Ship vendor assets in a separate foundation PR first (T1/T2).

**Never:** Register an editable Section, add drafts/Save, duplicate reads or change shared code. No MFA mutation, QR, linking/disable dialog, base-MFA change, throttle, deployment or real-account operation; those flows belong to 8.2/8.3.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Unlinked | false/null/absent totpEnabled, including mfaEnabled=true | Not set up; exact intro; Google, Microsoft, Authy, DUO, Android OTP in order | No Disable; no MFA request |
| Linked | totpEnabled=true, independently of mfaEnabled | Enabled check; outline-destructive Disable; focusable inactive tiles and visible caption | Click/Enter/Space never invoke inactive handlers |
| Tile | Either state | Native button, Link {App}, aria-haspopup=dialog, decorative same-origin 48px logo | Linked aria-describedby references caption; Tooltip on hover/focus/tap |
| Loading | Shared identity pending | Heading immediately; five shared tile skeletons; no status/actions | Respect reduced motion |
| Read failure | Ordinary error or proxy NOT_ALLOWED | Page-copy error within card; repeated Retry announced; retry only myself | Hide tiles/status; claim error; preserve shell expiry behavior |
| MFA forbidden | Mapped upstream 403 and owner authenticator | Card-only no-access, no status/actions/tiles; Account stays usable | Proxy 403 never sets mfaForbidden; future operations supply failures |
| Navigation | Direct authenticator hash, delayed read | Existing frame readiness/anchor behavior focuses the card heading | No custom hash handler or focus theft on background updates |
| Layout | Desktop/mobile, both themes | Five 112px tiles/16px gaps at >=768; three columns/12px below, min96 squares, no 360px overflow | Token styles; inactive opacity .55; accessible keyboard order |

</frozen-after-approval>

## Code Map

- `features/mfa/authenticator-section.tsx` replaces the stub behind its existing export; `app/account/page.tsx` already composes it. No route/shell changes.
- Shell exports useMyself/useClaimMyselfError/useSectionFrame; StateFrame tiles supplies skeleton layout. Pass attempt and frame readiness; shared identity owns retry policy.
- `lib/api/errors/forbidden-scope.ts` and mapper already classify MFA owner and upstream/proxy denial. An MFA-local controller seam will feed mfaForbidden from later operations; test that actual seam without adding endpoints or global events.
- `lib/shared/messages/mfa.ts` is empty. Reuse SHELL_MESSAGES.authenticatorHeading; automatic catalog verbatim/uniqueness tests cover new area strings.
- `../1health-fe/src/assets/mfaAppsLogos/` contains google, microsoft, authy, duo and otp-android PNGs. Foundation prerequisite copies to public/mfa, renaming otp-android to android-otp; no generated/recolored logos.
- `e2e/account-settings.spec.ts:362–399` assumes one identity error and unchanged placeholder HTML. Scope assertions per card and verify both recover. Preserve isolated placeholder tests in Account unit fixtures. Shared ANN/default handlers remain unchanged.

## Tasks & Acceptance

**Execution:**
- [ ] `public/mfa/*.png` -- deliver five original logos through a separate reviewed foundation PR, merged before the story; no shared behavioral change.
- [ ] `features/mfa/authenticator-section.tsx`, `authenticator-card.tsx` -- shared read/chrome, statuses, tile controls, layout, readiness and retry attempts.
- [ ] `features/mfa/mfa-access.ts` -- local mapped-failure/owner state seam for later flows; no request on mount.
- [ ] `lib/shared/messages/mfa.ts` -- exact Story 8.1 copy and vendor/action labels; reuse existing strings.
- [ ] `features/mfa/*.test.tsx` -- RTL/MSW matrix, real forbidden seam, shared request counts, registry exclusion, inactive callbacks and caption association.
- [ ] `e2e/account-authenticator.spec.ts` -- both states/themes/viewports, logo loads, tooltip keyboard/touch, deep link, loading/retry, no overflow and axe.
- [ ] `e2e/account-settings.spec.ts` -- update actual shared-read integration expectations without weakening Account assertions.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- own 8.1 entry only; preserve headers, last_updated and other stories.

**Acceptance Criteria:**
- Given real Account composition, when mounted, then identity is shared and no MFA request or registry participant is added.
- Given scoped MFA denial, when rendered, then other Account functionality and tabs remain available.
- Given every matrix row, when registered tests execute, then all asserted behavior passes alongside existing Account/anchor regressions.

## Implementation Notes

- Parent owns the prerequisite worktree `/tmp/personal-profile-mfa-assets` and PR #18. Do not duplicate its commits or remote steps. Load context/investigate while it runs, but wait for the parent's merged/base evidence before changing story source. Parent will rebase this story branch onto the merged prerequisite before implementation.

- Validate ready-tile minimum widths in the real 360px Account composition, including panel/card padding. Three 96px tiles plus two 12px gaps require 312px of inner width; avoid adding ready-body padding that would force overflow. Reuse the existing skeleton unchanged.

- Foundation asset PR #18 contains only five PNGs, commit 2119897422846547a37970731cb8a19b61d66106. All match the legacy source bytes/SHA-256 and valid PNG dimensions; parent visual inspection passed. Independent static reviews of Team A integration boundaries and Team B filename/vendor contracts found no findings. Wait for green CI and merge before story source work.

- User approved option 1 (approve and continue) on 2026-10-19 after reading the full plan, including the separate reviewed foundation asset PR and merge before the story. Perform that prerequisite first; feature branch remote publication is not part of this approval. Preserve the frozen block from this approval onward.
- Preserve sprint headers, last_updated, parent epic and other story entries; update only the own 8.1 line. This repository/user constraint overrides generic sprint synchronization instructions.

## Spec Change Log

## Review Triage Log

## Design Notes

No unresolved intent choice or irreversible app operation. Footprint: approximately 10–15 Team B source/test/artifact files plus five foundation assets in their prerequisite PR. Link/Disable callbacks remain integration seams until 8.2/8.3; do not invent temporary dialogs or copy. The regenerated epic cache is planning output, not a pre-existing user change. This is the first story in Epic 8; no lower-story continuity spec exists.

## Verification

Focused MFA RTL/MSW and catalog tests; typecheck, lint, forbidden/token and whitespace gates; full unit coverage (100% enforced modules). Production Playwright Account authenticator/settings/page and anchor regressions, desktop/mobile and light/dark axe. Run full coverage and browser sequentially with 2 workers. Foundation assets must be reviewable and merged separately before feature implementation.
