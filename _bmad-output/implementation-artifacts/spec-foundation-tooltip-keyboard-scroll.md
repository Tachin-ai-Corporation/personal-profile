---
title: 'Preserve keyboard tooltip during focus scroll'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
baseline_commit: '0001fdd03b28ba25f83c19fa6d24218e0e42f4b8'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/docs/FOUNDATION.md'
---

<frozen-after-approval reason="preserve the already-approved Story9.3 keyboard accessibility intent">

## Intent

Fix the shared Tooltip so keyboard focus remains a reliable way to read its description when bringing an off-screen trigger into view scrolls an ancestor. Story9.3's approved keyboard navigation exposed a pre-existing shared defect. Ship any shared change independently of the Team B story according to T2.

## Boundaries & Constraints

Always preserve the existing Tooltip API, semantic tokens, Radix positioning, hover delay/provider behavior, touch/pen toggle, keepOpenOnPress, empty-content behavior, Escape, blur and outside dismissal. Correct only the focus/scroll interaction, with no story files or Team A changes. A focused trigger must retain its description through browser focus scrolling. Hover-only tooltips must still close on ancestor scroll; leaving focus must release any protection. Reuse the existing primitive rather than a feature workaround.

Never add a public prop, dependency, global CSS policy, feature-specific condition, fixed sleep as a test solution, pre-scroll the story browser test, or weaken its exact tooltip/focus assertion. No live backend calls, source commits, push, PR publication or merge by implementation worker; root owns delivery. Publication/integration approval is a separate final checkpoint for this newly discovered prerequisite.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected | Failure handling |
| --- | --- | --- | --- |
| Focus scroll | Keyboard Tab to off-screen trigger in root/nested scroller | Trigger keeps focus and named tooltip is readable after scroll settles | No disappearance while focus remains |
| Dismiss | Escape, blur, outside press after focus scroll | Tooltip closes promptly | Scroll protection cannot suppress explicit dismissal |
| Pointer | Hover scroll; mouse press; keepOpenOnPress; touch/pen tap | Existing behavior persists | No stale focus/scroll protection after blur/unmount |
| Integration | Desktop and360px, light/dark, repeated keyboard traversals | Original exact accessibility behavior stable | No bypass or pre-scroll in Provider test |

</frozen-after-approval>

## Code Map

- `components/ui/tooltip.tsx`: controlled Radix root currently accepts ancestor-scroll close while trigger stays keyboard-focused.
- `components/ui/tooltip.test.tsx`: existing focus/blur/Escape/hover/touch/pen/provider/presentation coverage; extend actual event regressions.
- `e2e/primitives.spec.ts`: existing pre-scroll comment acknowledges the foundation defect; add a real browser regression using existing primitive fixture or a minimal shared fixture extension.
- `features/shell/__fixtures__/primitives-fixture.tsx`: if necessary, expose a deterministic off-screen/nested-scroll tooltip scenario; no product copy or route changes.
- `docs/FOUNDATION.md`: root/integrator records changed shared behavior.

## Tasks & Acceptance

- [x] Add a browser regression that fails on the current foundation, matching focus-induced scroll without pre-scrolling the target.
- [x] Apply the smallest private shared Tooltip correction and unit regressions, preserving existing dismissal/input modes.
- [x] Run focused unit/browser/static checks, report changed-control coverage and regressions, leave Git operations to root.
- [x] Root runs BMAD three-layer review and prepares separate prerequisite delivery before story integration.

Given keyboard navigation, when focus scrolls an ancestor, then the exact description stays available and focus stays on the trigger. Given explicit dismissal or pointer-only interaction, when it occurs, then existing semantics remain correct. Given dependency integration, when9.3 resumes final verification, then its original browser assertion passes repeatedly without a workaround.

## Implementation Notes

Root prepared isolated worktree `/tmp/personal-profile-foundation-tooltip-scroll-20261021` on `feat/foundation-tooltip-keyboard-scroll`. Worker owns only the shared files above and this spec outside frozen text. Read CLAUDE.md, installed react-standards (Framework app profile), relevant installed Next guides, and current primitive tests before editing. No own subagents or broad suites/builds while root coordinates. Use isolated browser ports (PP_E2E_PORT=3200 or an available triple) and unique coverage reports directory. Root source diagnostics: `/tmp/provider-tooltip-stability.log`, traces `/tmp/provider-tooltip-stability-results/`; original story failure repeated6/10mobile and0/10desktop. Existing `e2e/primitives.spec.ts` already documents pre-scrolling to avoid Radix ancestor-scroll closure.

## Review Triage Log

All three independent layers completed before triage. Verification-gap reviewer found no gaps. Each finding below is evaluated separately before grouping.

| Finding | Verdict | Evidence and disposition |
| --- | --- | --- |
| Blind1: one permanent capture listener per mounted tooltip | low | Each scroll invokes one ref assignment per mounted nonempty tooltip, including closed ones. This is real bounded extra work, without layout reads or state updates. No measured slowdown; a shared subscription manager would add complexity for negligible everyday impact. Reject. |
| Blind2: last scroll event retains its target | low | The ref retains exactly one event until the next scroll or unmount; its target can keep a detached scroller alive during that interval. This cannot accumulate events. Extra asynchronous cleanup/state machinery is not justified for this uncommon bounded retention. Reject. |
| Blind3: synthetic dismissal dispatched synchronously inside another scroll listener | low | A deliberately nested synthetic Escape/outside dispatch would share the current capture phase and be rejected. Real user input runs in a later task; project scroll consumers only recompute navigation and do not dispatch dismissal events. Supporting this uncommon synthetic nesting would require a more complex close-cause protocol. Reject. |
| Blind4: cleanup assertion accepts a different callback | low | The assertion uses any Function, so a wrong callback would pass despite a remaining listener. A direct test correction should assert the exact registered callback identity. Patch if no implementation loopback supersedes this listener. |
| Blind5: ordinary touch/pen after focused scroll lack a direct regression | low | Existing tap tests cover ordinary interactions and the new scroll case covers protected pen, but that is not a direct ordinary-touch/pen-after-scroll sequence. Add a small parametrized regression while preserving the existing actual pointer event helpers. Patch if no loopback supersedes this flow. |

| Edge1: provider closes internally before wrapper veto | medium | Confirmed with real two-tooltip provider regression: no-scroll control passes, scroll then301ms leaves the second hover closed. Radix invokes provider.onClose before wrapper onOpenChange, so it starts the skip-delay reset despite the focused tooltip remaining open. This violates required provider timing preservation. bad_spec loopback1; move the guard before Radix onClose using the existing pinned-package patch mechanism. |

## Spec Change Log

- 2026-10-21, loopback1: Edge1 proved provider timing regression: Radix calls provider.onClose before the controlled wrapper veto. Paired regression passes without scroll and fails after scroll+301ms. Revert the wrapper implementation and rederive at the actual scroll closure. Use the established pnpm patchedDependencies mechanism for pinned @radix-ui/react-tooltip@1.2.16, changing only the ancestor-scroll close condition in both shipped dist/index.js and dist/index.mjs to exclude the trigger while it owns focus (trigger.ownerDocument.activeElement). No package addition or version change. Preserve all provider notification/timer code and other dismissal paths unchanged. Remove permanent wrapper recorder/ref/guard entirely; update lockfile with pnpm and verify frozen install.
- KEEP: exact original Provider keyboard assertion; baseline-failing native root/nested scroll fixture; light/dark/Desktop360px keyboard, blur, Escape, outside and hover-only controls; paired immediate-provider regression; existing input semantics and wrapper API. Positive reference copies are in /tmp/foundation-tooltip-loopback-keep with repository-relative paths. Reuse the relevant positive tests/fixture, but discard the now-inapplicable wrapper-listener cleanup assertion. Add ordinary touch and pen after focused scroll regressions. Document the pinned patch and eventual upstream removal condition in FOUNDATION. The known-bad wrapper veto must not return.

## Verification

Meaningful focused control coverage and repeated production primitive/browser checks; full library unit coverage and static gates by root after source freezes. No publication before root's final delivery checkpoint.

### Implementation worker verification — loopback1 (2026-10-21)

- Re-read the amended spec and foundation context; reapplied only the kept shared tests/fixture. The prior wrapper recorder/ref/close veto and its cleanup test are absent. `components/ui/tooltip.tsx` has no diff from baseline.
- Added `patches/@radix-ui__react-tooltip@1.2.16.patch` using `corepack pnpm patch @radix-ui/react-tooltip@1.2.16 --edit-dir /tmp/foundation-tooltip-radix-patch` and `corepack pnpm patch-commit /tmp/foundation-tooltip-radix-patch` (pnpm's patch command, no source-control commit). Both CJS/ESM ancestor-scroll conditions now exclude a trigger that equals `trigger.ownerDocument.activeElement`, before invoking `onClose`. All provider notification/timer code and other dismissal paths remain untouched.
- pnpm generated the workspace registration and lockfile changes. `corepack pnpm install --frozen-lockfile --offline` passed; installed CJS and ESM both contain the guard. `/tmp/foundation-tooltip-loop1-install.log`.
- Added ordinary touch and pen after focused scroll regressions; kept the paired provider regression that proved the previous veto incorrect. `corepack pnpm vitest run components/ui/tooltip.test.tsx components/ui/disabled-action.test.tsx components/ui/info-icon-button.test.tsx --coverage --coverage.include=components/ui/tooltip.tsx --coverage.reportsDirectory=/tmp/foundation-tooltip-loop1-coverage`: **35/35 passed**, including both provider cases. Existing wrapper coverage: **100% statements (54/54), branches (31/31), functions (13/13), lines (43/43)**. The dependency distribution patch is covered behaviorally by these controls and native browser cases; this wrapper coverage metric does not instrument node_modules. `/tmp/foundation-tooltip-loop1-unit.log`.
- Scoped ESLint, `corepack pnpm check:forbidden` (including semantic tokens) and `git diff --check` passed. `patches/README.md` documents package/version, behavior, provider-order rationale, verification commands and eventual upstream-removal condition. Root/integrator owns FOUNDATION catalog updates.
- Initial baseline evidence remains: all four root/nested × desktop/mobile browser cases failed at the exact named tooltip assertion after `scrollend`, with focus retained. `/tmp/foundation-tooltip-baseline.log`, `/tmp/foundation-tooltip-baseline-results/`.
- Patched production primitive run: `PP_E2E_PORT=3200 corepack pnpm test:e2e e2e/primitives.spec.ts --workers=1 --output=/tmp/foundation-tooltip-loop1-browser-results`: **19/20 passed**. All root/nested keyboard traversals, both themes, both projects, retained descriptions/focus, their Escape/blur/outside controls, hover-only scroll controls, original tap/hover and axe cases passed. Existing desktop DisabledAction test failed at line88, expecting Escape immediately following a forced protected click to remove the tooltip. No assertion/test weakening was applied. `/tmp/foundation-tooltip-loop1-browser.log`; trace `/tmp/foundation-tooltip-loop1-browser-results/primitives-F3-1-primitives-71624-ason-is-announced-and-shown-desktop/trace.zip`. Root notified for investigation/repetition; the existing keepOpenOnPress task timer is a hypothesis, not a confirmed diagnosis.
- Source frozen and root notified. Outstanding root work: investigate that DisabledAction browser failure, BMAD three-layer review, full library/static gates, catalog documentation and original unchanged Story9.3 stability verification, then separate prerequisite publication/integration checkpoint. Worker made no source-control commits, push, PR or merge and no live backend calls.

### Loopback1 review triage

All three layers returned before triage: blind6 findings; edge none; verification no gaps.

| Finding | Verdict | Evidence and disposition |
| --- | --- | --- |
| Loop1 Blind1: resolve existing DisabledAction Escape failure | medium | Confirmed pre-existing: unpatched privacy/main-equivalent foundation reproduces the same Escape count0/received1 failure (39/40 pass, mobile repeat12), /tmp/tooltip-baseline-disabled.log and retained trace. Patched focused repeat passes20/20. The application wrapper and protected-press task guard are unchanged. Defer the existing dismissal race; do not widen the frozen focus-scroll correction. |
| Loop1 Blind2: visibility does not prove on-screen readability | low | Playwright visibility does not require viewport intersection; the named-tooltip assertions alone could miss a future off-screen popup. Direct patch: assert the actual visible data-slot tooltip-content is fully in viewport after scroll settles, preserving named role assertions. |
| Loop1 Blind3: literal301 can diverge from provider constant | low | If shared skip timing increases,301 would no longer exercise expiration and the provider regression could pass falsely. Direct patch: use exported TOOLTIP_SKIP_DELAY_MS+1. |
| Loop1 Blind4: native protected press after focus scrolling | low | Existing native DisabledAction presses and new ordinary root/nested focus-scroll cases are separate; no explicit sequence currently forces scrolling before the protected native press. Direct patch: extend the existing native DisabledAction case to begin with its trigger off-screen, then focus it naturally before unchanged press/dismiss assertions. |
| Loop1 Blind5: both patched entrypoints should execute behavior | low | CJS and ESM patch hunks are identical and inspected, but current evidence does not establish independent execution of both; one missing hunk could silently leave require consumers unfixed. Direct patch: small installed-package CJS/ESM behavior smoke covering focused ancestor scroll using actual primitives. No new dependency. |
| Loop1 Blind6: catalog does not point to pinned patch | low | Catalog promises focus-scroll behavior but lacks a pointer to the version-specific patch/removal documentation, making upgrades harder to assess. Direct documentation link to patches/README.md. |

The six findings have separate verdicts. Blind2–6 are independent small test/documentation patches; Blind1 is an independent existing bug deferred with baseline evidence.

### Root acceptance and final verification

- Both BMAD three-layer rounds completed, every finding triaged separately, loopback1 corrected the provider-order issue, and all five surviving small test/documentation patches were applied by the same implementer. Root read the resulting source/test/lock/patch diff. No unresolved finding caused by this correction remains.
- Final complete production primitives:20/20 pass, /tmp/foundation-tooltip-final-browser.log; the stronger viewport and protected-focus-scroll assertions remain. Edited unit file:23/23 pass, including independently executed installed CJS and ESM. Post-patch typecheck, scoped lint, whitespace and frozen offline installation pass.
- Full foundation unit suite after the dependency patch:6,533/221 files pass. Combined candidate with9.2/9.3:6,763/223 files pass, enforced library coverage100% (2780 statements,1903 branches,629 functions,2307 lines), /tmp/provider-integrated-patched-coverage.log. Subsequent changes are tests/docs only and their focused checks pass. The unchanged original Provider keyboard/browser assertion passes20/20 repeated cases across desktop/mobile and both themes, /tmp/provider-tooltip-patched.log.
- Existing protected-press Escape race is recorded in deferred-work.md, with an actual unpatched baseline browser reproduction (39/40 pass). It is neither suppressed nor claimed fixed here. Patched focused20repeat and final full20case run both pass; intermittent baseline behavior can still recur.
- All implementation/matrix acceptance is complete; prerequisite delivery is prepared locally. Publication and integration remain at the explicit final human checkpoint. No story files, Tooltip wrapper changes, new packages, live backend writes or story publication are included in this foundation branch.
