---
title: 'Story 7.2 Account hardening — proxy contracts, headers, mobile and accessibility'
type: 'chore'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
baseline_commit: '3cddb3c1c92fadfe6da391802eff143f8e133c8e'
story_key: '7-2-account-page-hardening-denies-kill-switch-headers-mobile-and-a'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The real Account page is merged (7.1), but Story 7.2 (NG-9031) still lacks its complete proxy rejection contract and real-page security/cache, mobile and keyboard coverage. The foundation already implements the enforcement; the remaining change is a small, reversible test-only addition with no new runtime API or external side effects.

**Approach:** Exercise the existing proxy and production Account page with Team B-owned tests. Preserve the session, proxy, headers, kill switches and shell; reuse their tests rather than rebuilding them. Keep future endpoints closed until their consuming stories. Follow D1–D18 and the D-A save safeguard, existing semantic tokens, and the React standards adapted to Next.js. No production calls or credentials are required.

</frozen-after-approval>

## Implementation Notes

Planning investigation and implementation contract:

1. `lib/server/proxy/allowlist/account.test.ts`: retain the area assertions and add a consumer suite invoking `createProxyHandler` with the shipped allowlist/deny rules. Cover all seven deny cases and eight traversal cases from Story 7.2, asserting exact BFF status/code, no-store, and zero network calls (`trackAllRequests`). No session is necessary: rejection must precede authentication. `Request` canonicalizes literal/encoded dot segments; assert the resulting rejection, not preservation of the raw URL. Do not add MFA/NPI/org passthrough entries or edit shared test files.
2. `e2e/account-hardening.spec.ts`: use fail-fast `test`, `mockAccountDefaults`, `signIn`, `mockMyself`, `mockContacts`, `setTheme` and `expectHeaderTabOrder` from `./fixtures`. On all three tabs, assert the complete AD-21 headers and AD-18 private/no-store/zero-age/Pragma policy for signed-in HTML. Check the response nonce reaches rendered scripts without runtime CSP violations and differs across requests. Check unauthenticated 307 and ACCOUNT_DISABLED 503 responses too.
3. The same e2e suite sends real RSC navigation and prefetch requests to `/`, `/account` and `/handoff/portal`, using Next's existing `computeCacheBustingSearchParam` convention from `e2e/kill-switch.spec.ts`. Assert actual RSC content on rendered routes, no-store and security headers; handoff is still a hardened 404 until 7.3. Preserve Next's RSC `Vary` values. Rendered pages currently replace `Vary: Cookie`; retaining `private, no-store` is the technical cache-isolation choice, not adding deployment configuration or changing foundation. Assert Cookie where the redirect/disabled response retains it, and record this exact-header limitation for the integrator.
4. Mobile coverage: all tabs have no page overflow at 360×740, 16 px app-bar/header/tab/panel gutters, header contacts hidden (supply nonempty contacts so hiding is observable), 44 px controls, horizontally scrollable strip, and selected tabs revealed inside the strip (a wide label may exceed its viewport). Keyboard coverage includes header order, visible focus, manual ArrowLeft/Right activation with Enter/Space, wrap, Home/End, and active-panel focus in DOM order. Reuse 7.1's light/dark axe scans of every normal tab instead of duplicating them.
5. Error-state coverage uses the real page's `myself` read: a nonretryable 400 yields the page load banner and Retry; upstream 403 yields no-access without Retry. Scan both in light/dark on desktop and mobile, assert no page overflow, 44 px Retry, and successful recovery after replacing the network answer. The feature slots remain placeholders; per-feature failed reads and tab-level no-access journeys arrive with their real reads (7.4/8/9/10), as already tracked after 7.1. No fixture-only production states are introduced.
6. Existing coverage reused: `app/account.test.tsx` asserts `force-dynamic` and the session portal URL; `e2e/account-page.spec.ts` covers every normal tab with axe and touch targets; `e2e/kill-switch.spec.ts`, `proxy.test.ts`, `lib/server/kill-switch.test.ts` and named-op tests cover switches before upstream, with Personal Profile unaffected. Run these alongside the new tests.
7. Validation: focused Vitest and Playwright, then lint, typecheck, check-forbidden, full Vitest with the existing 100% server/API/shared coverage gate, production build (via Playwright), and the complete e2e suite. Review through BMAD's blind-hunter layer and triage each finding. Test-only changes do not introduce instrumented runtime lines.

Route decision: no unresolved user-visible intent, irreversible action, or new public API; the implementation footprint is two test files plus BMAD tracking/context, so use the build workflow's oneshot path. User authorized Story 7.2 implementation. Do not push or merge.

API evidence: dev `agents.md` and `manifest.md` retrieved 2026-10-16; `/v2/mfa/validate/agents.md` confirms validation is POST with a required code query upstream. This story verifies that browser GET/code validation and forbidden legacy calls stay blocked; it does not change the existing named op.

Implementation and validation notes:

- Refreshed the stale Epic 7 context via BMAD's compile-epic-context procedure, including built 7.1, D18 and D-A. Preserved sprint headers/last_updated under T8; only the 7.2 status line changes.
- Implemented the exact 15 proxy rejection cases plus six conflicting-allowlist cases proving explicit denies win. All use the real handler, default denies and zero-upstream observer; no production endpoint was added.
- Browser requests require a valid Flight state tuple `["", {}]`; the existing switch tests' `[""]` never reaches Next rendering. Real render tests exposed and corrected that test construction error.
- A request with no cookie can receive a streaming 200 plus redirect instruction from the server page. The redirect-header contract instead exercises the interceptor's real 307 with an unsealable cookie and navigation fetch mode; Next emits a relative Location, resolved against the response URL.
- Review patches strengthen selected-tab visibility within the strip, mobile hiding after desktop contacts have actually loaded, colored focus rings in both themes, explicit proxy-vs-upstream 403 recovery, and future-safe handoff cache checks (current 404 or 7.3's portal-root 303).
- First full verification: 163 Vitest files / 3,577 tests passed; server/API/shared statements, branches, functions and lines all 100%. Production build, lint, typecheck and forbidden/token gates passed. Later focused proxy run: 23 tests passed (six added during review).
- First complete browser run: 411 passed, 6 skipped, 1 pre-existing DisabledAction/Escape failure on desktop. This exact tooltip failure is already tracked for mobile; added the desktop observation to foundation deferred work. All new Account cases in that run passed. Final review-patch and flake verification results follow below.
- Final focused browser run after review patches: `corepack pnpm exec playwright test e2e/account-hardening.spec.ts e2e/primitives.spec.ts --workers=2` → 53 passed, 3 viewport-specific skips, including the unchanged DisabledAction test on both viewports.
- Final complete browser run: `corepack pnpm exec playwright test --workers=4 --retries=1` → 418 passed, 6 viewport-specific skips, no retry or flaky cases (1.6 minutes). This command built the production Next app and exercised the normal and both kill-switch servers.
- Final unit/coverage run: `corepack pnpm exec vitest run --coverage --maxWorkers=4` → 163 files / 3,583 tests passed, all four enforced coverage metrics 100%. A preceding unrestricted concurrent run had one 5 s timeout in the unchanged Places streaming-body test; the bounded-worker full run passed without changing its code or timeout.
- Final lint, typecheck, check-forbidden (including tokens) and diff whitespace checks passed. No application/runtime files, dependencies, credentials or deployment settings changed. BMAD spec is done; sprint status is review for integration. No push or merge performed.

## Review Triage Log

Blind hunter ran context-free using the inherited model; its finding floor was seven. No dispatch-only review layers apply to the oneshot route.

| Finding | Verdict and evidence | Action |
|---|---|---|
| Rejection tables alone cannot distinguish denies from unlisted paths | medium: removing an explicit deny could leave the default-allowlist test green | Patched with six conflicting-allowlist rows; validation GET remains deliberately unlisted/named-op-only. |
| Mobile contact mocks never load at mobile width | low: the initial absence check does not test hiding already loaded contacts | Patched with desktop load/visibility then 360 px resize/absence on the real header. |
| Selected tab can pass with only 44 px visible | medium: this misses a clipped label inside the strip | Patched with full available-width visibility for direct links and each keyboard activation. |
| Any shadow/outline could satisfy focus visibility | low: transparent default shadows should not count | Patched with colored 2 px outline/ring detection and keyboard tests in both themes. |
| Missing proxy-originated 403 distinction | medium: proxy denial must show generic Retry, not no-access | Patched with proxy 403 → generic error → keyboard Retry → successful identity read, with axe in both themes. |
| Inherited 1.5 s first-tab target is not measured | low, pre-existing: 7.2 acceptance contains no timing clause and real content is still absent | Deferred explicitly to real-read work starting 7.4; no hollow skeleton timing assertion. |
| Handoff test would freeze the not-yet-built route at 404 | low: a legitimate 7.3 303 would break the consumer | Patched: preserve hardened RSC 404 today and allow only a safe environment portal-root 303 when the route lands. |

### Review Findings — bmad-code-review (2026-10-16)

Full review of the Story 7.2 branch against `baseline_commit`, including all six changed files (453 insertions, 31 deletions). All four configured layers completed at the inherited model capability: blind-hunter, edge-case-hunter, verification-gap and acceptance-auditor. Verification Gap reported no gaps under its evidence rules; Acceptance Auditor reported no actionable acceptance violations. The other two layers filed twelve findings, triaged individually below before grouping. No production defect was identified by this review; the actionable findings strengthen the new tests.

Summary: **0 decision-needed, 7 patch groups, 0 deferred, 3 rejected individual findings**. Two pairs of surviving findings share a root cause. The user subsequently chose **Apply every patch**. All seven test changes are implemented; R6 exposed the shared keyboard-focus bug documented below. Prior build/test results above remain historical validation of the original commit.

#### Patch actions

- [x] [Review][Patch][P2] R1 — Reject streamed redirects/errors and assert expected route content in signed-in RSC payloads. `e2e/account-hardening.spec.ts:139` (B5 + E3). Current status/MIME/header checks accept an authentication Flight response. Reproduced against the built app with dummy test env: absent and invalid sessions both returned 200, `text/x-component`, private/no-store, and a `NEXT_REDIRECT` digest pointing to `/auth`. Read the payload and verify authenticated route content in addition to headers.
- [x] [Review][Patch][P2] R2 — Verify actual focus-ring geometry rather than any opaque shadow containing `2px`. `e2e/account-hardening.spec.ts:59` (B1 + E1). The current expression accepts `rgb(0, 0, 0) 0px 2px 4px 0px`, an offset decorative drop shadow, as a ring. Require zero-offset/zero-blur surrounding geometry and positive opacity for the shadow branch. Preserve the intentionally inset tab ring; do not impose an outer offset on that control.
- [x] [Review][Patch][P2] R3 — Cover missing-cookie and invalid-session RSC navigation/prefetch security and cache responses. `e2e/account-hardening.spec.ts:125` (B6). The existing malformed-cookie test exercises the HTML navigation interceptor; the RSC test matrix always signs in. Reproduction confirms the actual RSC authentication response is a streamed 200, so add precise redirect-payload assertions with AD-18/AD-21 checks rather than assuming an HTTP 307.
- [x] [Review][Patch][P2] R4 — Exercise Account's independent emergency flag on valid RSC navigation and prefetch to Account and handoff. `e2e/account-hardening.spec.ts:155` (B7). Existing e2e RSC switch rows are under `PP_DISABLED`; Account-flag rows and new all-tab rows send HTML requests. Add Account-flag RSC/prefetch requests with the valid Flight tuple and assert hardened 503 responses before authentication. Existing foundation code stays unchanged.
- [x] [Review][Patch][P2] R5 — Check Retry keyboard focus in both themes. `e2e/account-hardening.spec.ts:261` (B4). `expectAxeAndLayout` ends in dark mode and only then focuses Retry. Light mode gets axe coverage but no Retry focus-indicator assertion. Exercise the existing Retry focus check in light and dark without changing the mapper or UI.
- [x] [Review][Patch][P3] R6 — Assert focused tab visibility before Enter/Space as well as after activation. `e2e/account-hardening.spec.ts:225` (B3). Current focus/ring assertions do not measure clipping inside the strip until after selection changes. Reuse `expectTabRevealed` immediately after each focus-moving key; no new helper or runtime behavior is necessary.
- [x] [Review][Patch][P3] R7 — Compare the complete same-origin authentication redirect URL. `e2e/account-hardening.spec.ts:94` (E2). The pathname-only assertion also accepts `https://example.invalid/auth` (reproduced with the exact predicate). Compare the resolved href to the response origin's `/auth`, including query/fragment expectations. This is a test false positive, not an observed open redirect in the app.

#### Individual verdicts and evidence

| ID | Source | Verdict | Evidence / disposition |
|---|---|---|---|
| B1 | blind-hunter | medium | Decorative shadow predicate reproduced true; patch R2. The suggested universal outer offset is inapplicable to the documented inset tab ring. |
| B2 | blind-hunter | false | The alleged independent tab/panel activation cannot occur with the reviewed composition: `PageTabs.current` derives from URL search params and controls `<Tabs value={current}>`; the visible panel and `aria-selected` have no independent active state. Rejected rather than adding a speculative implementation guard. |
| B3 | blind-hunter | low | Focused strip visibility is asserted only after activation; the direct existing-helper assertion closes it. Patch R6. |
| B4 | blind-hunter | medium | `expectAxeAndLayout` leaves dark selected, so subsequent Retry focus runs only in dark. Patch R5. |
| B5 | blind-hunter | medium | Built-app reproduction returned a 200 RSC auth-redirect payload satisfying the current structural checks. Patch R1. |
| B6 | blind-hunter | medium | RSC matrix always calls `signIn`; malformed-cookie coverage sends navigation fetch mode rather than RSC. Patch R3. |
| B7 | blind-hunter | medium | Browser RSC switch coverage is under PP_DISABLED, while Account-disabled requests lack RSC/prefetch headers. Root unit tests do not replace that end-to-end response check. Patch R4. |
| B8 | blind-hunter | low | Disable rules are covered in `deny-list.test.ts`; handler deny-before-allowlist precedence is exercised by the shared handler suite and six new consumer rows. Original 7.2's specified deny matrix has no disable rows. Adding another cross-product is a low-value expansion, not worth extra cases for this review. Rejected. |
| E1 | edge-case-hunter | medium | Same reproduced decorative-shadow false positive as B1; grouped in R2, individual verdict retained. |
| E2 | edge-case-hunter | low | Complete external URL with `/auth` pathname passes the current assertion. One direct comparison corrects it; patch R7. |
| E3 | edge-case-hunter | medium | Same reproduced streamed RSC auth redirect as B5; grouped in R1, individual verdict retained. |
| E4 | edge-case-hunter | false | Same controlled URL-derived selected value and panel as B2; no independent activation state exists in the reviewed page. Rejected. |

#### Rejected

- B2 — false: selected tab and visible panel are controlled by the same URL-derived `current`; the proposed independently activated state is not present in this code.
- E4 — false: same controlled-state evidence as B2, independently checked against `features/shell/page-tabs.tsx` and `components/ui/tabs.tsx`.
- B8 — low: explicit disable rules already have foundation coverage; adding additional consumer deny variants beyond Story 7.2's matrix is not worth expanding this patch set.


#### Approved patch implementation and integration dependency

- The user approved all seven patches. Changes remain in Team B's `e2e/account-hardening.spec.ts`; previously rejected findings and existing deferred items are unchanged.
- R1/R3: production inspection showed that Next 16 dynamic prefetch, without a loading boundary, returns only route metadata and never executes `requirePageSession`. Signed-in navigation now asserts page/default-tab/label content and rejects Flight errors/redirects; prefetch asserts route-only metadata without protected page props. Missing/invalid-cookie prefetch is followed by navigation that must emit the exact `/auth` redirect digest, with security/cache headers on both responses. This verifies actual framework behavior rather than inventing a prefetch auth redirect.
- R2/R5/R7: the focus helper now requires zero x/y offsets, zero blur, at least 2 px spread and visible color; Retry keyboard focus is checked in both themes; the HTML auth redirect compares the entire resolved same-origin URL.
- R4: valid Account-disabled RSC navigation/prefetch cases cover `/account` and `/handoff/portal`, asserting hardened HTML 503, Retry-After, Cookie variability and no redirect.
- R6: focused-strip visibility is asserted immediately after each focus-moving key, before activation. On the unchanged foundation, the new suite has **61 passed, 3 viewport skips, 2 failed**, both mobile keyboard tests. The test remains strict; it was not skipped or weakened.
- New integration blocker: shared `PageTabs` only scrolls its selected trigger. Radix focus movement uses preventScroll, so a newly focused tab can remain clipped until activation. A standalone foundation fix and two-preset regression are prepared on `feat/NG-9031-foundation-tab-focus`, based on main, in `.claude/worktrees/foundation-tab-focus`. Its proposal is `_bmad-output/implementation-artifacts/spec-ng-9031-foundation-tab-focus.md` in that worktree. The regression was red on both pages before the fix and the 57 related unit tests passed afterward; independent review found no actionable issue.
- Under FOUNDATION §1 T2, the shared fix must be reviewed and merged separately before 7.2 consumes it. Story 7.2 therefore remains **in-progress** until that dependency is integrated; checking off an applied review action does not claim the current story branch is green. No runtime foundation edit was added to the story branch.
- Final combined browser validation in the isolated foundation worktree: `PP_E2E_PORT=3133 corepack pnpm exec playwright test e2e/account-hardening.spec.ts e2e/account-page.spec.ts e2e/shell.spec.ts --workers=2` → **180 passed, 4 viewport skips**, no retries. The temporarily copied story consumer test was removed before the foundation commit. Thus all approved test assertions pass with the proposed dependency; the original story branch still correctly fails the two R6 cases until integration.
- Foundation full-unit validation: **164 files / 3,564 tests passed**, all four enforced server/API/shared coverage metrics **100%**; this main-based branch excludes the 21 new Story 7.2 proxy cases. The targeted shell regression and composition run passed **57 tests**. Lint, typecheck, forbidden/token and whitespace gates passed. These results are not mislabeled as a green standalone story run.
- Foundation fix is saved in commit `0602f9e41d54d643030814a561ae95f490444ca1` on `feat/NG-9031-foundation-tab-focus`; its worktree is clean. Independent review confirmed strip-local scrolling, unchanged manual selection/navigation/public API, and regression coverage for both presets.
- Review outcome after the user's action choice: **7 patches applied**, **3 original findings rejected**, **1 new foundation integration blocker** (focused-tab clipping, discovered by the stronger R6 test). The new blocker is recorded in Team B deferred work. No patch/defer decisions are being silently overridden; shared code remains in a standalone foundation branch. No push or merge has been performed.

#### Final local integration and closure — 2026-10-16

- The user explicitly directed finishing all work before closing the in-progress ticket, instead of publishing the prerequisite PR. Following that direction, integrated the independently reviewed foundation fix locally by cherry-picking `0602f9e41d54d643030814a561ae95f490444ca1` as `aac40e8c2a64877804ddc71a55d3090c977bcce9` onto `feat/NG-9031-account-hardening`. This is a user-directed exception to T2's separate-PR integration sequence; the shared fix remains a separate commit. No remote publication or main merge was performed.
- The integration blocker described above is **resolved**. Both mobile keyboard cases now pass with the strict pre-activation visibility assertions unchanged. The shared regression covers both Profile and Account; manual activation, URL and panel selection remain unchanged.
- Full integrated unit validation: `corepack pnpm exec vitest run --coverage --maxWorkers=2` → **164 files / 3,585 tests passed**. Server/API/shared statements, branches, functions and lines are all **100%**.
- Full integrated browser validation: `PP_E2E_PORT=3136 corepack pnpm exec playwright test --workers=2` → **442 passed, 6 viewport-specific skips**, no failures or retries. This rebuilt production and exercised desktop/mobile plus both kill-switch servers. Heavy suites ran sequentially.
- `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm check:forbidden` (including tokens), and whitespace checks passed.
- Final BMAD review disposition: **7 approved patches resolved, 3 original findings rejected, 0 unresolved review actions or integration blockers**. Story spec and its sprint-status entry are **done**; unrelated historical deferred work remains unchanged. Sprint headers and `last_updated` are preserved under T8. This closes local BMAD tracking; no external Jira transition is claimed.

#### Synchronization with main — 2026-10-16

- After the user authorized publishing the branch without a PR, they requested incorporating the latest main changes. Merged `origin/main` at `a3fa699` (Profile Picture and Save all work) into the story branch in merge commit `4578100`, without conflicts. Both Account story statuses remain done; main's tracking updates are preserved.
- Post-merge validation: **167 unit files / 3,764 tests passed**, all enforced coverage metrics **100%**; lint, typecheck, forbidden/token and whitespace gates passed. The full production-build browser run had **493 passed, 8 viewport-specific skips, 1 failure** in the previously documented `DisabledAction` Escape tooltip case (`e2e/primitives.spec.ts:90`). All Account cases passed. A focused unchanged-test rerun on both viewports, three repetitions each, passed **6/6**; this confirms the existing intermittent issue remains, not that the full run was green. No unrelated Tooltip change was made.
