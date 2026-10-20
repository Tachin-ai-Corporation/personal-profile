---
title: 'Keep confirmation content reachable in short viewports'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
route: 'oneshot'
baseline_commit: 'b19e0e890fdf811864afd15aadc6dd93b8d885c5'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Fix the documented shared ConfirmDialog clipping at 600x240 with text enlarged to 200%. Bound the centered dialog to the dynamic viewport with vertical gutters and allow its complete contents and actions to scroll into view. Preserve its public API, normal sizing, Radix focus trap, busy guards and focus restoration. Verify standard leave confirmation and destructive authenticator confirmation in light/dark themes, using pointer and keyboard to reach actions. Mark the tracked follow-up resolved and update the foundation catalog.

The user explicitly authorizes this shared foundation fix on `feat/NG-9038-disable-authenticator`, overriding the normal separate-foundation-PR rule for this task, and requests commit/push on that same branch after verification and BMAD review. No new branch or merge is required.

</frozen-after-approval>

## Implementation Notes

- Investigation: shared `components/ui/confirm-dialog.tsx` is centered with unlimited height and visible overflow. At 600x240 with 200% text its 418px content extends above/below the viewport. Existing Dialog uses a scrolling body; ConfirmDialog can preserve its DOM/API with a dynamic-viewport max height and vertical scrolling on Content itself.
- Small correction, no unresolved intent choices and no irreversible product/data changes. Publication is already explicitly authorized. Existing width regressions in `e2e/confirm-dialog-width.spec.ts` cover 360/600/767/768/1280px; add short-window/enlarged-text regressions for actual standard and destructive consumers. Reuse shared fixtures and axe. Avoid assertion-only unit tests that mirror CSS classes.
- Verification: existing ConfirmDialog/leave-guard/MFA unit suites; targeted coverage on the touched ConfirmDialog; lint/typecheck/forbidden; production browser checks for shared confirmations, MFA disable and existing Profile confirm consumers. Run coverage before browser. BMAD one-shot blind review follows the verified diff.

- Initial regression: bounding/scrolling fixes passed 600x240/200%; 360px/200% exposed unbroken words and fixed-height action labels overflowing. Added wrapping with preserved minimum touch targets. Mobile also exposed percent-based centering against an expanded layout viewport behind the modal; use dynamic viewport units for height, width and centering so the dialog stays inside the visible viewport. These remain local CSS changes with the same public API.

- Enlarged-text regression now passes all 16 theme/variant/viewport/project cases. Existing ConfirmDialog/leave-guard/MFA suites passed 145 tests. A diagnostic extension of coverage to the legacy ConfirmDialog reports 100% statements, functions and lines; its two pre-existing unexercised guards (busy cancellation and an open=true request without a DialogTrigger) are unchanged. No new branch is introduced by the CSS correction and all changed executable code is covered; do not add hollow tests of impossible Radix events. The production coverage configuration remains unchanged; run its normal full gate before final browser verification.

- Review-driven forward keyboard traversal reproduced an additional clipping path: Radix wraps focus with `preventScroll`, so the focused Keep editing button could remain above the visible scroll area. Content now reveals focused descendants with nearest-edge scrolling, retaining Radix's focus trap. The shared jsdom setup supplies the missing layout API; actual visibility is checked in Playwright.

## Review Triage Log

| Finding | Verdict | Resolution and evidence |
| --- | --- | --- |
| Exercise enlarged busy confirmation with a held response. | Patch; resolved. | Destructive regressions hold the request, check both actions remain reachable with the spinner, block cancel/Escape/overlay/repeated confirmation, and assert exactly one request before completing. The review's suggested "Turning off…" label does not match this consumer's actual "Turn off" busy label. |
| Traverse every action forward with the keyboard. | Patch; resolved. | Native Tab traversal asserts focus and full visibility for Keep editing, Discard and Save, and Cancel/Turn off. This exposed and fixed Radix's focus-wrap scrolling issue; reverse wrapping remains tested. |
| Resize while the dialog is open. | Patch; resolved. | Increase the viewport height by 160px, verify viewport bounds/centering, restore the short height and verify again. |
| Reach the warning with real scrolling input. | Patch; resolved. | Replace direct scrollTop mutation with upward mouse-wheel input; assert the full heading is visible, then scroll down to the full confirm action. |

The blind reviewer inspected the focus-scrolling follow-up and found no additional actionable concerns. No finding remains deferred.

## Verification

- Final targeted ConfirmDialog/leave-guard/MFA unit suites: **145 passed / 7 files** (`/tmp/confirm-height-unit-final.log`).
- Final full suite: **5,767 passed / 209 files**, **100% statements, branches, functions and lines** in the enforced library coverage (`/tmp/confirm-height-coverage-final.log`).
- Final ESLint, TypeScript and forbidden/token gates passed (`/tmp/confirm-height-{lint,types,forbidden}-final.log`).
- Final production browser regressions: **156 passed** across shared confirmation, authenticator disable, Profile email and Profile phone (`/tmp/confirm-height-browser-final.log`). Includes 16 enlarged-text cases covering both themes, standard/destructive consumers, 600x240 and 360x320, desktop/mobile projects, resize, wheel input, all keyboard actions and held busy requests. Axe reports no violations in the tested dialogs.

### CI follow-up: wait for layout after resizing

- CI exposed a timing race in the new resize assertions: after shrinking by 160px, a single bounding-box read could still return the prior enlarged layout (bottom 448 instead of at most 304, or 368 instead of at most 224). Failures point to the assertion immediately after restoring the short viewport. The original test passed 48 repeated cases locally; that did not reproduce CI's timing.
- Wrap the complete bounding-box read and unchanged bounds/centering assertions in Playwright's `expect(...).toPass({ timeout: 5_000 })`. Every attempt remeasures the dialog; a persistent containment regression still fails. No fixed sleeps, relaxed geometry limits or product changes.
- Corrected enlarged-text matrix: **80 passed** (five repetitions of all 16 cases, two workers), without test retries (`/tmp/confirm-resize-after.log`). Targeted ESLint, TypeScript and diff checks passed.
- Complete production browser suite: **975 passed / 11 expected skips**, no failures or flaky cases, two workers (`/tmp/confirm-resize-full.log`, 6.5 minutes). All 986 scheduled tests completed.
