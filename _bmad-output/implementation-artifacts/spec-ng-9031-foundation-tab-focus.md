---
title: 'Foundation: reveal keyboard-focused tabs before manual activation'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
baseline_commit: '3cddb3c1c92fadfe6da391802eff143f8e133c8e'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/FOUNDATION.md'
---

## Intent

Applying approved review action R6 for Story 7.2 exposed a shared shell bug. At 360 px, ArrowRight focuses Individual Provider Registration while Personal Account remains selected, but the focused label is clipped until Enter/Space activates it. Radix's roving focus prevents the browser from scrolling; `PageTabs` reveals only the selected trigger in its `current` effect.

Reveal the focused trigger within the tab strip without activating it or scrolling the document. Preserve the existing selected-tab effect, manual activation, leave guard, URL/history and public API. The same generic shell serves both pages.

## Ownership and integration

FOUNDATION §1 T2 requires this shared fix to ship alone, before the story that consumes it. This branch is `feat/NG-9031-foundation-tab-focus`, based on main, in a separate worktree. Only `features/shell/page-tabs.tsx`, its new focus regression and this proposal belong in its commit. Story 7.2's stronger consumer test is temporarily copied into the worktree for validation and must not enter this foundation commit. Both teams review the foundation PR before merging; no remote push or merge is authorized by this proposal.

## Implementation and acceptance

- `features/shell/page-tabs.tsx`: let internal `keepInView` accept a focused HTMLElement, falling back to the selected trigger for the existing effect. Invoke it on `TabsList` focus capture. Scroll changes stay on the list element; no `scrollIntoView` or document scrolling is introduced.
- `features/shell/page-tabs-focus.test.tsx`: exercise the real Profile/Account presets through existing providers and user-event keyboard input. Stub only jsdom's missing geometry. Assert both strip edges, Home/End and wrapping; selection, visible panel and URL remain unchanged.
- Given an overflowing strip, when an arrow/Home/End focuses a trigger, then that trigger is revealed while the original tab remains active until explicit activation.

## Evidence and review

- Before the fix, the new regression failed on both presets: expected `scrollLeft=86` after ArrowRight, received 0.
- After the fix, the three relevant unit files passed: 57 tests, including both new regressions.
- Independent read-only reviewer found no actionable issue in the runtime change and regression; confirmed strip-only scrolling and no change to public API/selection/navigation.
- Final browser validation: `PP_E2E_PORT=3133 corepack pnpm exec playwright test e2e/account-hardening.spec.ts e2e/account-page.spec.ts e2e/shell.spec.ts --workers=2` → **180 passed, 4 viewport-specific skips**, no retries. This builds the production app and tests both presets, Account's complete approved review-patch suite and both kill-switch servers. The temporarily copied consumer test is excluded from this foundation commit.
- Final full unit/coverage validation: `corepack pnpm exec vitest run --coverage --maxWorkers=2` → **164 files, 3,564 tests passed**, server/API/shared lines, functions, branches and statements all **100%**. This main-based foundation branch does not include Story 7.2's 21 additional proxy cases.
- `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm check:forbidden` (including tokens) and whitespace checks passed. Browser and full unit runs were executed sequentially for the final checks; an earlier concurrent run exhausted worker/startup time budgets without a reproducible code failure.
- Integration still requires the separate foundation PR to be reviewed by both teams and merged before Story 7.2. No push or merge has been performed.

## Local integration resolution — 2026-10-16

The preceding integration requirement records the original T2 proposal. The user subsequently directed resolving all work locally before closing Story 7.2 instead of publishing the prerequisite PR. Under that explicit direction, cherry-picked the isolated, independently reviewed foundation commit `0602f9e41d54d643030814a561ae95f490444ca1` onto `feat/NG-9031-account-hardening` as `aac40e8c2a64877804ddc71a55d3090c977bcce9`. The change remains a separate commit; this is an exception to T2's separate-PR integration sequence, not a claim of cross-team PR approval or a main merge.

On the actual integrated story branch, the full unit suite passed **164 files / 3,585 tests**, with all enforced coverage metrics **100%**; the production-build browser suite passed **442 tests, 6 viewport-specific skips**, with no failures or retries. Both formerly failing mobile focus cases pass. Lint, typecheck, forbidden/token and whitespace checks passed. Local implementation and integration are complete, and the Story 7.2 blocker is resolved. No remote push, PR or merge was performed.
