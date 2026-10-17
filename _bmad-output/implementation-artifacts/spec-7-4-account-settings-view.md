---
title: 'Story 7.4 View Personal account settings'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
baseline_commit: 'ab937a30ebc5c776d3e01134dd3a79df5550bc2b'
story_key: '7-4-view-personal-account-settings'
review_loop_iteration: 1
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Personal account settings section is still a placeholder after the Account route and hardening shipped. Users cannot inspect their ten account fields or regional preferences here.

**Approach:** Implement Story 7.4 (NG-9033) as a read-only section on the existing shared identity cache and UI foundation. Preserve scoped loading/error/retry/no-access behavior, anchors, responsive row order and accessibility. Do not add editing, writes or contact-list requests; those belong to later stories. Reuse existing formatting and age rules.

</frozen-after-approval>

## Implementation Notes

BMAD route decision: oneshot for a small, reversible read view composed from existing pieces, no unresolved intent choice, external side effect, new endpoint, dependency or deployment change. The user separately and explicitly requested repair of the existing file-delete CI failure; investigate/fix it independently and record evidence in its own bugfix spec/commit. This authorizes the narrow shared repair without changing unrelated foundation behavior. No push or PR.

Implementation contract:

1. `lib/shared/messages/account.ts`: add the seven Account-only field labels, English/en-US display labels and six time-zone labels after searching for duplicates. Reuse FIELD_MESSAGES for First/Last name and Birth date, SHELL_MESSAGES.accountSectionHeading and COMMON_MESSAGES.notProvided. Mark non-V&T display data copy as draft. No shared catalog/index edits.
2. `lib/shared/time-zones.ts` (new, explicitly Team B's planned Story 7.4 module in FOUNDATION §3.3): export ordered ACCOUNT_TIME_ZONES with ids/labels Honolulu, Anchorage, Los Angeles, Denver, Chicago and New York, consuming the Account copy. Tests freeze approved order for 7.5 reuse; do not update the foundation catalog.
3. `features/account/view-model.ts`: pure `toAccountView(myself, mobileRows?, today?)` returns ten display fields. Trim provided strings; normalize all PM3 absence to null. Password is always eight stars. Phone uses primaryPhoneRegion and formatPhoneDisplay, default us. Birth date uses isBirthDateInRange with roles/local Date then wireToDisplayDate, never ad-hoc age math. Map en and en-US plus known time-zone labels, retain unlisted raw codes; absent locale always maps to English - United States.
4. `features/account/account-settings-section.tsx`: keep export and first-render SectionLandmark id=account; useMyself, useSectionFrame.onReady and useClaimMyselfError. Reuse StateFrame kv/section with page copy, scoped retry/attempt count and KeyValueTable labelled by the existing heading. Ready content is the ten rows in specified row-major order, password mono-value. StateFrame already owns the read table border; avoid nested containers. No Edit button, form or registry mutation for read-only 7.4.
5. For phone region, subscribe to already cached Mobile contact rows via useSWR(keys.contactPoints('Mobile'), null); disable revalidation on that observer. This never fetches contacts itself, reacts to existing cache changes, and uses us without cached rows. The existing desktop header owns its own contacts reads. Prove no contacts fetch in an isolated section or on mobile.
6. Component/unit tests: all fields, missing/empty/n-a/-1, invalid/withheld/out-of-range dates including Proctor boundaries/local leap rules through shared helpers; unknown regional values; phone region from cached Primary/matching rows; shared myself updates without reload; one request across fresh cache; row order and th/td headers pairing in desktop/mobile; skeleton, generic/upstream403/proxy403 errors and scoped Retry with Authenticator unchanged; claim page errors only while this section owns them. Use renderInPage/myselfWire and MSW, never mock owned hooks.
7. `e2e/account-settings.spec.ts`: exact ten-field parity on both viewports, populated/empty/unknown values, five desktop or ten mobile rows and no overflow, mono password, axe light/dark, anchor focus after readiness, scoped errors/Retry recovery and session expiry. Reuse fail-fast test/defaults and synthetic overrides; preserve frozen fixtures. Existing Account hardening/route assertions must remain valid with real section reads; adjust only Team B expectations whose placeholder behavior is intentionally replaced. Measure ready content in a controlled local browser case, documenting that real demo broadband PNFR timing remains an environment check.
8. Follow CLAUDE/FOUNDATION and the local React test-writer guidance. Cached Epic 7 context is valid; Story 7.3 is continuity. Run focused tests, full 100% unit coverage, production browser suite, lint/typecheck/forbidden/token gates sequentially with bounded workers. Perform BMAD blind review and triage every finding. Sync only 7.4 sprint line, preserving tracking headers and last_updated (T8). Independently fix the supplied file-delete test/network failure without weakening security, TLS or page-cap assertions.

## Implementation Results

- Implemented the ten-field read table, semantic copy, ordered time-zone data and pure display model using the shared identity, phone and date owners. No endpoint, write or dependency was added.
- The initial passive `useSWR(key, null)` observer was rejected in review: an observer mounted before the header can own SWR revalidation and block subsequent contact refreshes. Account now uses the separately documented foundation cache observer; it registers no SWR fetcher or revalidator.
- An integrated browser regression exposed a shared anchor limitation: a loading Account table can grow and displace the later Authenticator deep-link target. The foundation correction tracks only unsettled earlier/target frames from navigation, re-scrolls as those settle, and preserves hand-scroll cancellation and one-shot semantics.
- The user explicitly instructed that both foundation repairs be made on this same branch, overriding T2's split-branch/PR rule for this task. Keep foundation code and story changes in separate commits for review; do not push or create a PR. Existing foundation/CLAUDE/AGENTS catalogs remain integrator-owned and unchanged.
- Initial integrated unit run: 182 files, 4,559 tests, all passed; statements/branches/functions/lines all 100%. This predates the final review patches, whose final validation follows below.
- Initial focused browser run: 146 passed, five expected skips, one new mobile Authenticator deep-link failure; do not treat this as green. That failure drove the foundation anchor correction. New long-value tests subsequently passed at 360/768/1280 px in both projects.

## Review Triage Log

- medium / patch — A null-fetcher SWR subscriber can become the key's first revalidation owner. Reproduced by the reviewer; replaced with foundation `useCachedValue`, with real SWR mutation/focus/reconnect tests and a mobile-first → desktop browser regression. No new contact read originates in Account.
- medium / patch — Incrementing attempt on Retry re-announced a stale error too early. Track completed failure identities instead; a held-response test proves the existing alert remains during Retry and is remounted only after each repeated failure finishes.
- medium / patch — The file-delete mock ignored aborts. Honor the Request signal before and during handler resolution, remove listeners, and verify a held-handler cancellation. See the separate bugfix spec.
- medium / patch — A resolver failure could be mistaken for a valid upstream error. Assert a separate unexpected-mock-failure collection after every test and explicitly consume it only in tests proving that guard. See the separate bugfix spec.
- low / patch — Local placeholder normalization duplicated the shared owner. Delegate trimmed strings to `providedOrNull`; keep Account-specific formatting in its view model.
- false / reject — Production cache reuse is already verified by `e2e/account-page.spec.ts` (the `/` → `/account` one-request navigation case) and the existing Account route contract tests. The isolated component's long dedupe window tests a fresh-cache scenario; it is not the only evidence for production behavior.
- low / patch — Width-only overflow checks could miss clipped content. Add long username/email/language/time-zone/locale values and verify every text range rectangle stays inside its cell at 360/768/1280 px.
- low / patch — Bugfix evidence referenced planned full checks. Record observed integrated results directly and identify later validation separately.

### Follow-up Review Triage

- medium / patch — A cached null must not revive configured fallback. The new observer now falls back only for undefined, matching SWR, and has a null-with-fallback regression. An empty server-snapshot test covers hydration behavior. This correction was already implemented when the asynchronous follow-up report arrived.
- medium / patch — Earlier-frame error/forbidden layouts also move the target. Add optional `StateFrame.onSettled` for ready/error/forbidden transitions while preserving the existing onReady callback and session-dialog ownership. Account relays its existing section signal through onSettled. Anchors arm only actual loading frames and retire non-loading frames, including failure. Unit and held-response browser cases cover success, error and forbidden without re-arming later loads.

### Independent Review Closure

The reviewer verified the original findings and the null/error-anchor follow-ups: no concrete remaining bugs found. Final focused follow-up: 94 tests across four files passed, including callback compatibility and session exclusion. Review was read-only; integrated browser/coverage evidence is owned by the parent run.

## Final Validation

- Full unit suite: 183 files / 4,578 tests passed, no unhandled errors. Enforced server/API/shared coverage: 100% statements, branches, functions and lines.
- Focused feature/foundation checks: 195 tests across seven files passed; the six scoped Account/cache/anchor/copy/time-zone modules have 100% in all four coverage metrics. Existing StateFrame callback and Section navigation tests remain green.
- Production browser regression: 664 passed / 10 expected viewport skips, no retries or failures. After the final settled-state additions, rebuilt production and reran all affected Account, shell and Section browser suites: 254 passed / six expected viewport skips, no retries or failures. Includes held success/400/403 reads at #authenticator, mobile-first contact refresh, session dialog ownership, light/dark axe and text bounds at 360/768/1280 px.
- Full lint, typecheck, forbidden/token and whitespace gates passed. No dependencies, real upstream data or credentials were changed.
- Controlled local response-to-ready timing passed the 1,500 ms target. This does not establish real demo broadband PNFR timing; that remains an environment acceptance check.
- BMAD one-shot blind review and all follow-ups are complete, with every finding triaged and no unresolved implementation finding. At completion of that build run, the separate full bmad-code-review was still pending; its subsequent results and approved patch are recorded below.
- Changes are saved on feat/NG-9033-account-settings-view in separate bugfix/foundation/story commits as requested. No remote push, PR, Jira transition or main merge.

## Full Code Review — 2026-10-16

Review mode: full. Scope: `ab937a30ebc5c776d3e01134dd3a79df5550bc2b..bb29fc4`, branch `feat/NG-9033-account-settings-view`; all four associated commits, 20 files, +1,531/-29 lines. The user's explicit same-branch foundation authorization remains in force. No source-code changes, push or PR were performed during this review.

All four configured layers completed successfully: Blind Hunter (10 observations), Edge Case Hunter (no concrete findings), Verification Gap Reviewer (no gaps), Acceptance Auditor (no actionable AC/spec violations; 141 focused tests across six files passed). The host verified each observation before routing it. No review layer failed.

**Initial result: 0 decision-needed, 1 patch, 2 defer, 7 rejected.** The user approved R6; its implementation and validation are recorded below.

### Review Findings

- [x] [Review][Patch][R6][medium] Restore keyboard context after a successful manual Retry [`features/account/account-settings-section.tsx:39`]. The focused Retry button is removed when the table recovers, and no Account recovery callback moves focus. A production-browser reproduction on desktop and 360 px confirms `document.activeElement === document.body` after keyboard activation and successful loading. This loses the keyboard user's place in the section. Restore focus to the Account heading after a user-initiated Retry succeeds, without stealing focus after background updates, after the user has moved elsewhere, or from the session dialog. Add a browser assertion for recovery focus. This is an unambiguous local patch with no new public API.

- [x] [Review][Defer][R5][medium] Existing Profile consumers do not signal failure layouts [`features/personal/personal-section.tsx:509`; `features/shell/section-frame.tsx:30`]. Deferred: pre-existing Team A / Foundation integration. Account already uses the new settled signal; Personal information still supplies only onReady, so an earlier load error never notifies the later Phone anchor. A held 400 at `/?tab=contacts#phone` moves the desktop Phone heading from y=10 to y=-150 (outside the viewport); mobile remained at y=10 in the same reproduction. The Personal information caller and section-frame guidance are unchanged from the baseline, and the old hash hook likewise received no callback for that earlier failure. Coordinate with Team A/Foundation to migrate the appropriate failure notifications and their guidance; this is not a regression introduced by the Account read view.

- [x] [Review][Defer][R10][medium] Close the inherited real-demo PNFR acceptance check [`e2e/account-settings.spec.ts:276`; existing Team B deferred item from Story 7.2]. Deferred: environment acceptance, owner **Team B QA / integrator**. The controlled local test deliberately measures response-to-ready rendering, not navigation/network/hydration. No real-demo latency failure has been demonstrated, and the implementation notes explicitly do not claim that check passed. Before release acceptance, use a synthetic demo account and a documented typical-broadband profile, measure from first Personal Account/tab navigation until the ten-field table is ready (including request latency and hydration), and record evidence against the <=1,500 ms target. Retain the local rendering test as a separate measurement.

### Rejected

- **R1 — false:** Frozen or partially non-writable cache-provider methods are not a reachable provider configuration in this application. `SwrProvider` uses SWR's mutable default cache; test providers use mutable Maps. No application provider freezes these methods. Requiring support for an invented provider would add a new contract and guards for an unshown state.
- **R2 — false:** No application SWR provider supplies Promise-valued fallback data. The root has no fallback; the Account/cache tests supply already-mapped synchronous rows. An async fallback reaching primaryPhoneRegion is not a demonstrated application path, so no asynchronous fallback API is required by this change.
- **R3 — false:** No production caller clears the SWR cache with Map.clear. The Cache interface used here exposes get/set/delete/keys, and supported mutation paths write through SWR (covered by scoped and global mutation tests). The clear calls found in unrelated stores and test navigation are not this cache. Logout exits the document. No mounted Account observer is shown receiving an unsupported clear operation.
- **R4 — false:** No current aborted handler can produce the alleged late rejection. The sole held cancellation handler resolves with a successful mock response on abort; all other installed handlers are synchronous responses or finite, validated Request.json reads. The already-aborted path exits before handler execution. The reviewer described a future handler that rejects after cancellation, rather than a failing path in this suite. Existing handler failures are recorded before the awaited request settles and checked afterEach; repeats and integrated checks passed.
- **R7 — low, rejected:** Leaving an unchanged read page open across local midnight can retain the prior eligibility display until another render. The specified contract evaluates age when mapping/rendering, and the view model does so using the shared injectable local-date helper. No continuous clock subscription is required. A rollover timer/store for this rare read-only boundary adds complexity beyond a direct correction; no write or authorization rule depends on this display.
- **R8 — false:** The Account tests intentionally use the foundation's zero-retry test isolation. Production retry behavior is already directly tested in use-myself.test.tsx for 5xx/network success, exhausted budgets, error suppression, manual recovery and retained identity; Account consumes that unchanged real hook and separately tests loading, error ownership and retry recovery without mocking it. No missing new retry-policy implementation or concrete uncovered branch was identified; the Verification Gap layer also found no gaps.
- **R9 — false:** Ready-state axe in the new story file is not the only accessibility coverage. Existing real-page account-hardening.spec.ts scans the new Account error/forbidden states in light/dark, including keyboard Retry; StateFrame tests scan loading/error/forbidden/ready in both themes. These tests ran against the implemented section. The claimed absence of non-ready-state coverage is disproved by those suites.

### Review Validation and Reproduction

- Baseline integrated evidence was checked: 4,578 unit tests / 100% enforced server/API/shared coverage, six scoped feature/foundation modules at 100%, 664 full-browser passes and 254 final affected-browser passes, expected viewport skips only. These are the preceding implementation run's results, not a new full-suite execution in this review.
- New review-only production-browser probes: **four passed**, confirming the observed R6 focus loss on both viewports and the pre-existing R5 desktop anchor displacement (mobile retained its position). Probe sources/configuration and traces are in a system temporary directory; no test or application source was added to the repository. The initial R5 probe used an incorrect copy string; the final probe waits for the actual StateFrame error state and asserts the observed geometry.
- Evidence log: `/tmp/pp-review-7-4-final-repro.log`. The probes confirm reported defects; they do not represent fixes.
- R6 was approved through workflow option 1 and patched; see the approved-patch validation below. R5 and R10 remain separate, assigned follow-ups.

### Approved R6 Patch — 2026-10-16

The user selected option 1 (apply every patch). Only R6 is patched; the checked-off deferred R5/Profile and R10/demo items retain their assigned follow-ups.

- Account records focus ownership only when its Retry control owns focus. A successful manual recovery consumes that ownership and focuses the existing section heading. Focus/pointer movement cancels it permanently, including moving elsewhere then blurring back to body.
- Scope stays local to Account, without changing foundation APIs. AbortController removes the temporary focus/pointer listeners on replacement, success, a new failure, cancellation and unmount. A later background update cannot reuse a failed manual request's intent, and the session dialog retains focus ownership.
- Red-before-green proof: the two existing recovery regressions failed their new heading-focus assertions before the source patch; both passed after it.
- Focused component validation: 23 tests passed; changed Account section has 100% statements, branches, functions and lines. Real MSW/SWR providers are used, including repeated pending Retry, virtual activation, moving to another control/body, pointer interaction and background recovery after failure.
- Production browser validation: 129 passed / five expected viewport skips, no failures or retries, across Account settings and Account hardening. The first run exposed a test assumption: Chromium focuses the containing tabpanel after a click on nonfocusable text. The corrected regression asserts that actual focus target and requires recovery to preserve it; the production cancellation behavior was already correct.
- Independent read-only follow-up found no concrete remaining issues in R6, including latest-callback timing, failure/session exclusion and listener cleanup.
- Final full unit regression: 183 files / 4,584 tests passed, with no unhandled errors and 100% statements, branches, functions and lines in the enforced server/API/shared scope. Full lint, typecheck, forbidden and semantic-token gates passed.

### Final Review Closure

Full bmad-code-review is complete: 0 decision-needed, 1 approved patch resolved, 0 open findings in the scoped implementation, 2 assigned deferrals and 7 rejected observations. Story 7.4 is done in local BMAD tracking. R5 remains a pre-existing Team A/Foundation integration follow-up; R10 remains real-demo performance acceptance for Team B QA / integrator, with no claim that it passed. The approved R6 changes remain local and uncommitted; no push, PR or Jira transition was performed.
