---
title: 'Story 8.1 Authenticator status and app tiles (NG-9036)'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: '18e8b1723af454c7af9ec6cc4254066fc6e50a97'
story_key: '8-1-authenticator-status-and-app-tiles'
implementation_base_commit: '7d0d7e65198a64133c423c1e6f9a78e2f3c4abfe'
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
- [x] `public/mfa/*.png` -- deliver five original logos through a separate reviewed foundation PR, merged before the story; no shared behavioral change.
- [x] `features/mfa/authenticator-section.tsx`, `authenticator-card.tsx` -- shared read/chrome, statuses, tile controls, layout, readiness and retry attempts.
- [x] `features/mfa/mfa-access.ts` -- local mapped-failure/owner state seam for later flows; no request on mount.
- [x] `lib/shared/messages/mfa.ts` -- exact Story 8.1 copy and vendor/action labels; reuse existing strings.
- [x] `features/mfa/*.test.tsx`, `app/account/authenticator-access.test.tsx` -- RTL/MSW matrix, real forbidden seam, shared request counts, registry exclusion, inactive callbacks and caption association.
- [x] `e2e/account-authenticator.spec.ts` -- both states/themes/viewports, logo loads, tooltip keyboard/touch, deep link, loading/retry, no overflow and axe.
- [x] `e2e/account-settings.spec.ts`, `e2e/account-hardening.spec.ts` -- update actual shared-read integration expectations without weakening Account assertions.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- own 8.1 entry only; preserve headers, last_updated and other stories.

**Acceptance Criteria:**
- Given real Account composition, when mounted, then identity is shared and no MFA request or registry participant is added.
- Given scoped MFA denial, when rendered, then other Account functionality and tabs remain available.
- Given every matrix row, when registered tests execute, then all asserted behavior passes alongside existing Account/anchor regressions.

## Implementation Notes

- Parent audited all tasks and all eight matrix rows against the changed source and passing 21 MFA RTL cases, catalog suite and 11 focused production-browser passes. The foundation prerequisite is already merged; original baseline diff includes its assets, while implementation_base_commit gives the feature-only audit. Own sprint entry stays in-progress during independent review and moves to review at final closure.

- Prerequisite merged first in PR #18 at 2026-10-19T18:31:08Z, canonical merge 7d0d7e65198a64133c423c1e6f9a78e2f3c4abfe. Both CI runs succeeded, including 746 browser passes / 10 expected skips on PR CI, full enforced coverage and build. Main pulled and story rebased onto it before source implementation. implementation_base_commit identifies the merged asset prerequisite; preserve the original planning baseline_commit.

- Parent owns the prerequisite worktree `/tmp/personal-profile-mfa-assets` and PR #18. Do not duplicate its commits or remote steps. Load context/investigate while it runs, but wait for the parent's merged/base evidence before changing story source. Parent will rebase this story branch onto the merged prerequisite before implementation.

- Validate ready-tile minimum widths in the real 360px Account composition, including panel/card padding. Three 96px tiles plus two 12px gaps require 312px of inner width; avoid adding ready-body padding that would force overflow. Reuse the existing skeleton unchanged.

- Foundation asset PR #18 contains only five PNGs, commit 2119897422846547a37970731cb8a19b61d66106. All match the legacy source bytes/SHA-256 and valid PNG dimensions; parent visual inspection passed. Independent static reviews of Team A integration boundaries and Team B filename/vendor contracts found no findings. Wait for green CI and merge before story source work.

- User approved option 1 (approve and continue) on 2026-10-19 after reading the full plan, including the separate reviewed foundation asset PR and merge before the story. Perform that prerequisite first; feature branch remote publication is not part of this approval. Preserve the frozen block from this approval onward.
- Preserve sprint headers, last_updated, parent epic and other story entries; update only the own 8.1 line. This repository/user constraint overrides generic sprint synchronization instructions.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence and route |
|---|---|---|
| Blind 1: focus lost on linked transition | medium | Confirmed: Tooltip returns its child for null content, but TooltipRoot for a reason, replacing the focused Button subtree. Patch: retain the trigger and regress both transitions. |
| Blind 2: 320px overflow | medium | Three minimum 96px tiles plus gaps need 312px; the Account gutter leaves less at 320px. Patch: two-column fallback below 360px, preserving approved layouts. |
| Blind 3: wrong registry exclusion id | low | The test asks for account while the landmark is authenticator, so accidental registration could escape the assertion. Patch the id directly. |
| Blind 4: dummy Account control in forbidden test | low | The neighboring button is artificial and does not prove the real Account Edit remains operable. Patch the composition to use the real Account section. |
| Blind 5: breakpoint geometry untested | low | Current geometry runs cover only desktop and 360px, leaving the 768px transition unobserved. Patch with 767/768 checks alongside the narrower reflow regression. |
| Blind 6: enabled traversal/callback coverage incomplete | low | Only Microsoft activation is asserted; linked traversal covers all tiles but enabled traversal does not. Patch with all five vendor callbacks and enabled keyboard traversal. |
| Blind 7: network/5xx retry coverage absent | false | features/shell/use-myself.test.tsx explicitly tests network and 5xx retries, suppression until exhaustion and final Retry recovery. The feature directly consumes that unchanged hook; its own held-loading and error/retry tests cover presentation. No new retry implementation needs duplicate policy tests. |
| Blind 8: real session dialog unverified | false | e2e/account-settings.spec.ts already covers expired Account self-read with the real shell dialog and no section load error, and keyboard Retry ending in expiry. These run with the new real authenticator in final Account regression; its RTL test additionally asserts no competing frame. |
| Blind 9: compact epic cache lacks concrete foundation API names | false | compile-epic-context explicitly forbids code-derivable details and source-document references. The story requires reading FOUNDATION and authoritative epics, whose concrete contracts remain intact; cache prose retains transport, named operation and scope rules. No API contract was removed. |
| Blind 10: cache omits exact future enrollment dimensions | false | compile-epic-context explicitly excludes story-level details; authoritative epics retain the exact enrollment requirements for 8.2. The cache preserves busy, dialog/input, focus and transient-state constraints; regeneration does not replace acceptance authority. |
| Edge 1: linked transition remounts focused trigger | medium | Independently confirmed the same reachable Tooltip null-to-root replacement as Blind 1. Patch; group with Blind 1 after individual verdict. |
| Parent regression: hardening assumes unique global read error/Retry | low | Three existing hardening cases fail strict locators in both projects because both real cards now render the same shared read failure. Patch tests to scope Account controls and assert both card states, preserving accessibility and recovery checks; no app behavior change. |
| Parent regression: transient responsive document overflow | medium | Existing long-stored-values Account regression fails immediate document no-overflow after width changes in both projects. Tiles inherit Button transition-all and interpolate dimensions across the responsive layouts. Patch the local tile transition to colors, keeping the established immediate overflow assertion. |

Grouping: B1/E1 share trigger replacement; B2/B5 share missing responsive boundary checks. B3, B4 and B6 are independent direct test corrections. All surviving fixes are local, add no public surface and address demonstrated states; route patch. Verification-gap reviewer reported no gaps. No deferred findings.

## Design Notes

No unresolved intent choice or irreversible app operation. Footprint: approximately 10–15 Team B source/test/artifact files plus five foundation assets in their prerequisite PR. Link/Disable callbacks remain integration seams until 8.2/8.3; do not invent temporary dialogs or copy. The regenerated epic cache is planning output, not a pre-existing user change. This is the first story in Epic 8; no lower-story continuity spec exists.

## Verification

Focused MFA RTL/MSW and catalog tests; typecheck, lint, forbidden/token and whitespace gates; full unit coverage (100% enforced modules). Production Playwright Account authenticator/settings/page and anchor regressions, desktop/mobile and light/dark axe. Run full coverage and browser sequentially with 2 workers. Foundation assets must be reviewable and merged separately before feature implementation.


### Implementation evidence (2026-10-19)

- Replaced the authenticator stub with a permanently mounted read-only landmark sharing `useMyself`, with catalog status/copy, original vendor tiles, inactive caption/Tooltip and scoped MFA access controller seam. No registry, draft, mutation or additional read was introduced.
- Mobile ready tiles use no inner horizontal padding and no label wrapping, preserving square cells >=96 px at the real 360x740 viewport. Ready-only frame overflow allows the standard focus outline; keyboard-focused edge screenshots and computed outline/overflow checks verify it.
- `corepack pnpm vitest run features/mfa/authenticator-section.test.tsx lib/shared/messages/messages.test.ts --maxWorkers=2`: 596 passed (21 MFA cases plus catalog checks).
- `corepack pnpm test:e2e e2e/account-authenticator.spec.ts --workers=2`: 11 passed, 1 expected desktop touch skip. Production build passed; both states, themes and viewports passed geometry, actual logo load, semantic card/hover surfaces, opacity, keyboard/touch, delayed deep link, reduced motion, retry and axe checks. Local log `/tmp/ng9036-authenticator-pass.log`.
- Account settings/page browser regressions passed in both projects during the preceding affected run (`/tmp/ng9036-browser-final.log`); its failures were isolated to new authenticator test observations corrected in the final focused run. The subsequent ready-only overflow correction affects only authenticator source.
- Typecheck, focused file lint, forbidden/token and whitespace gates passed. Full enforced unit coverage and final broad regression/review remain with the parent integrator.
- Only Story 8.1's sprint status changed to review; sprint headers, last_updated, epic and other story lines are preserved. Link/Disable callbacks remain intentional seams for Stories 8.2/8.3.

### Review patch evidence

- Preserved Tooltip trigger DOM across both linked transitions with stable non-null content; inactive popup hidden while unlinked. Both transition directions preserve the exact focused native Button.
- Added two-column reflow below360px; confirmed minimum96px square tiles, exact gaps, three columns at767 and five112px tiles at768, plus no document overflow. The subsequent broad regression exposed transient overflow from the inherited dimension transition; tiles now transition only colors and resize assertions check immediate overflow without polling.
- Corrected authenticator registry exclusion; all five vendor callbacks and enabled keyboard traversal/activation are now asserted.
- The real Account Edit and provider tab remain operable after scoped denial in the composition-owned app/account/authenticator-access.test.tsx. This avoids cross-feature imports in feature tests and needs no shared changes or lint suppressions.
- Focused post-review checks:23 RTL cases;15 production browser passes and one expected desktop touch skip. Typecheck, full lint and forbidden/token gates passed. Unsupported RTL ByRole exact options caught by typecheck were removed before the successful production build.
- All surviving review findings patched; rejected findings have individual evidence above. No deferred findings.

### Broad regression corrections

- First broad Account run:294 passes,6 expected skips and8 failures. Six failures were the hardening global-locator assumption; two were immediate document overflow during tile dimension transitions. Both root causes are documented individually in triage.
- Scoped hardening assertions to Account settings and explicitly checked Authenticator's failure/recovery, preserving axe/layout, touch target, theme, keyboard focus and single-request assertions.
- Limited only local tiles to transition-colors; shared Button and existing immediate no-overflow checks are unchanged. The new breakpoint test checks immediate overflow and exact settled dimensions without polling.
- Targeted post-correction checks passed 23 unit cases and 23 production browser cases, with 1 expected desktop touch skip, covering all authenticator cases, all hardening read-failure cases and unchanged long-stored-values cases in both projects. Log: /tmp/ng9036-responsive-browser.log.
- Final typecheck, full lint and forbidden/token gates passed. The subsequent complete verification below supersedes the earlier intermediate runs.

### Final verification and closure

- Final full unit command: `corepack pnpm vitest run --coverage --maxWorkers=2` — 189 files / 4,811 tests passed. Statements, branches, functions and lines 100% across all enforced modules. Log: `/tmp/story81-complete-coverage.log`.
- Final production browser command: `corepack pnpm test:e2e e2e/account-*.spec.ts --workers=2` — 302 passed / 6 expected viewport-specific skips; all seven Account specs passed, including both themes, axe, keyboard/touch, real logo loading, direct/delayed anchors, shared read/retry/session handling, primary contacts and editing/draft regressions. Build passed. Log: `/tmp/story81-complete-browser.log`.
- Final typecheck, full lint, forbidden/token and whitespace gates passed. Visual inspection of focused first/last mobile tiles confirmed complete focus rings, legible caption and no clipping.
- BMAD blind, edge and verification-gap reviews completed; all surviving findings and broad-regression corrections resolved. Nothing deferred. Approved frozen intent remains byte-identical to the planning commit.
- Spec done; only own 8.1 sprint entry set to review. Headers, last_updated, parent epic and all other stories preserved. Feature is ready for a later authorized push/PR; no feature publication performed. Link/Disable flows remain the intentional Stories 8.2/8.3 integration seams.
