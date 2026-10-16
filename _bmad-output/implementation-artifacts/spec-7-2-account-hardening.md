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
