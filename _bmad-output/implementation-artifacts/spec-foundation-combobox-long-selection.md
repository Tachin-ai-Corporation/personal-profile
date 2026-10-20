---
title: 'Keep long combobox selections editable within the query limit'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
route: 'oneshot'
baseline_commit: '1342f7e7e4040beda43e4b7957707d10732a9c79'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Required foundation correction exposed by approved Story9.1: a selected practice NPI has a full registry label longer than the100-character query cap. The shared Combobox renders that full label but native maxlength blocks subsequent typing; the pick cannot become a new search as promised. Reproduced in both browser projects (/tmp/story91-long-label-before.log; consumer regression e2e/account-provider-long-label.spec.ts in original story worktree).

Keep full selected labels visible. A deliberate edit/replacement of an over-limit selected label must clear its selection and start a meaningful bounded query containing the new typed/pasted content; do not silently drop that new content. Retain the existing public API, ordinary short-label/free-text behavior, native query limit, accessible focus/keyboard behavior, and cancellation/paging contracts. Verify keyboard and paste, and avoid corrupting composition input. Use the owning shared Combobox, without consumer workarounds or another control. Ship as a separate foundation PR before story delivery, with no story feature changes here.

</frozen-after-approval>

## Implementation Notes

- Local dependencies are being installed from the frozen lockfile so Turbopack can build this worktree without an out-of-root node_modules symlink. Do not change tracked dependency configuration.
- Inspect components/ui/combobox.tsx and use-combobox.ts plus tests and existing combobox fixture/e2e coverage. Choose the smallest private correction, with no public API additions. Preserve legitimate existing edit semantics and input-event handling.
- Regressions must prove a full long label can be selected then changed after moving the caret to its end, bounded queries include the user's new content, paste stays bounded, and existing modes/controls remain correct. Reuse foundation fixtures, extending only a synthetic case when needed; no production API/NPI implementation belongs here.
- Verify targeted changed-code coverage, full enforced unit/coverage, lint/typecheck/forbidden, and production shared Combobox/affected consumers in both themes/viewports. Leave uncommitted for root BMAD review, no remote operations.

## Implementation result (2026-10-20)

- Private correction in `components/ui/combobox.tsx`: replace an overlong picked label on deliberate keyboard/text-input/paste editing while keeping the native `maxLength` attribute. Long-pick composition retains its complete pre-edit text in private state, does not search until commit, and commits a bounded Unicode-safe query. Ordinary short-selection/free-text changes and composition retain their prior forwarding behavior. Public API and hook are unchanged.
- Added nine unit regressions, a synthetic `long` loader case in the existing shared fixture, and six trusted browser regressions covering real keyboard, clipboard paste and CDP IME behavior across desktop/mobile and both themes.
- Targeted unit suite: 60 passed (`/tmp/combobox-long-targeted-final.log`). All changed component code covered: 26/26 statements, 26/26 branch arms, 6/6 functions. Raw targeted report: `/tmp/combobox-long-targeted-coverage.json`. The complete pre-existing component/hook report is 100% lines/functions, 98.78% statements and 95.43% branches; its pre-existing gaps are outside changed code. Targeted reporting used CLI-only zero statement/branch thresholds to report those existing gaps; no tracked threshold configuration changed.
- Full enforced `corepack pnpm vitest run --coverage`: 6,239 tests passed; 131 files fully covered, 100% statements/branches/functions/lines (`/tmp/combobox-long-full-coverage.log`). Initial simultaneous coverage attempt hit Vitest's shared report-directory lock; rerun sequentially passed.
- Final lint, typecheck and forbidden/token gates passed (`/tmp/combobox-long-{lint,typecheck,forbidden}.log`). `git diff --check` passed.
- Production `corepack pnpm test:e2e e2e/combobox.spec.ts e2e/profile-personal.spec.ts --workers=2`: 92 passed; log `/tmp/combobox-long-browser-final.log`. Focused trusted long-selection run previously passed all six cases (`/tmp/combobox-long-browser-focused.log`).
- Changes remain uncommitted for root BMAD review. No story source/worktree edits, dependency changes or remote operations performed.

## Review Triage Log

| Finding | Verdict | Evidence and route |
| --- | --- | --- |
| Blind: cancelled composition loses pick | medium | compositionend unconditionally truncates and calls onInputChange, which drops a pick even when the input equals the original label. Patch: preserve unchanged/cancelled composition. |
| Blind: parent reset masked by composition | medium | The public controlled text prop is used by Personal and Addresses; compositionText overrides it, and compositionend forwards the stale DOM value. Patch: retire private composition when its originating controlled value/selection changes. |
| Blind: native virtual edits bypass preparation | medium | Installed React builds synthetic before-input from keypress/textInput/composition/paste, so its prop does not handle all native replacement/deletion events; the keypress test does not exercise that path. Patch native input preparation with a direct regression. |
| Blind: partial cut exceeds query cap | medium | Cut has no preparation handler and onChange forwards a still-overlimit label after native deletion; search then rejects the oversized query. Patch this demonstrated edit path without changing ordinary free text. |
| Blind: old results survive composition start | medium | After a pick, ArrowDown can openList and fetch its full label; compositionStart buffers text without close/cancel, so old results may remain clickable. Patch: close/cancel existing search when starting this private composition. |
| Edge: unchanged composition truncates pick | medium | Same verified unconditional compositionend forwarding, independently reported. Patch with the blind cancellation finding. |
| Edge: controlled reset masked | medium | Same verified compositionText precedence over controlled text, independently reported. Patch with the blind reset finding. |
| Verification: ordinary composing Enter guard unproved | medium | Existing long-composition tests also satisfy longComposition; ordinary composition test sends no keyboard event. Patch: static free-text active option plus native composing Enter must retain text and avoid selection. |

### Review patch verification

- Resolved the eight triaged rows with private Combobox changes: unchanged/cancelled composition retains the full pick; a changed controlled origin retires the private buffer and suppresses stale input/commit; real native `beforeinput` replacement/deletion and Cut prepare the long selection; starting long-pick composition closes/cancels pending search. Added an independent ordinary free-text composing-Enter regression.
- Only the owning targeted suite was rerun: `corepack pnpm vitest run components/ui/combobox.test.tsx` — 68 passed (`/tmp/combobox-long-review-patches.log`). `git diff --check` passed. The full/browser/static results above precede these review patches; integrator owns broader final verification.
- Public API, dependencies, frozen intent and original story worktree remain unchanged. Activity-header adjustment stays queued.

## Final review verification

- All eight reported rows are resolved by the private patches and direct regressions. No findings remain open. Cancellation, controlled text/selection reset, native replacement/deletion, Cut, pending request abort and ordinary composing Enter all pass.
- Final targeted suite:68 passed; every changed executable line45/45, statement56/56, branch52/52 and function11/11 covered (`/tmp/combobox-reviewed-modified-coverage.txt`).
- Root final full gate:6,247 tests /218 files passed with100% enforced coverage; lint, typecheck and forbidden/token gates passed (`/tmp/combobox-long-reviewed-{coverage,lint,types,forbidden}.log`).
- Root production browser:92 passed, two workers, desktop/mobile360, keyboard/paste/IME and Profile consumer regression (`/tmp/combobox-long-reviewed-browser.log`).
- Foundation catalog now documents the existing public contract for long display labels and bounded edits. No public API or dependencies changed. Prepared for the approved prerequisite publication/integration before Story9.1 delivery.

### Official Story9.1 review follow-up

- Equality at the native cap now prepares a selected label for replacement. Private buffering applies to all capped IME compositions, including empty/short fields, and bounds Unicode-safe committed queries while uncapped composition keeps prior forwarding.
- Query results from a settled older query are hidden immediately during the next query's debounce; same-query pagination/error retry retains its options.
- Directed verification: 73 Combobox unit tests passed (`/tmp/combobox-official-review-unit.log`); 16 production long-selection/capped-edit cases passed across both projects (`/tmp/combobox-official-review-browser-final.log`). Browser Backspace, Delete and real clipboard Cut use a partial selection formed by actual keyboard events; exact-cap and trusted CDP IME cases pass.
- Foundation checkout is ready for integrator full gates. No story source or public API/dependency changes here.

## Story9.1 consumer review follow-up

The official story review exposed four additional shared-control cases, resolved privately in this same foundation delivery before integration.

| Finding | Verdict | Evidence and resolution |
| --- | --- | --- |
| Blind2: exactly-capped pick cannot accept typing | medium; patch | Include equality in the existing replacement boundary; trusted browser100-character pick followed by x passes in both projects. |
| Blind3: settled prior-query entries selectable during debounce | medium; patch | Only expose async entries whose result query matches current trimmed input. Provider/shared regressions prove old Ann entries disappear before Bob loads; same-query paging/retry remains green. |
| Blind10: native deletion/Cut coverage missing | medium; patch | Browser keyboard creates an actual partial selection, then Backspace/Delete/native clipboard Cut produce empty bounded query and drop the pick. Both projects pass. |
| Edge2: ordinary capped composition can exceed query limit | medium; patch | Reuse the existing private composition buffer for capped inputs, retaining complete pre-edit and bounding Unicode-safe commit. Empty/short inputs have trusted CDP IME regressions; uncapped input forwarding remains unchanged. |

Final root verification after these corrections:73 targeted unit tests; modified code47/47 lines,58/58 statements,60/60 branches and11/11 functions covered. Full enforced suite6,252 tests /218files and100% coverage; lint, types and forbidden/token gates pass (`/tmp/combobox-story-review-final-{coverage,lint,types,forbidden}.log`).

Final production browser158 passed across shared Combobox, Profile personal and Profile Addresses, desktop/mobile and both themes (`/tmp/combobox-story-review-final-browser-isolated.log`). Initial overlapping browser runs reused a server on3100 that shut down; isolated3300 rerun passed. No product defect was inferred from those connection failures. All shared review findings are resolved; no public API or dependencies changed.
