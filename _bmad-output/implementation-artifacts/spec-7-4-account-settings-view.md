---
title: 'Story 7.4 View Personal account settings'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
baseline_commit: 'ab937a30ebc5c776d3e01134dd3a79df5550bc2b'
story_key: '7-4-view-personal-account-settings'
review_loop_iteration: 0
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
- BMAD one-shot blind review and all follow-ups are complete, with every finding triaged and no unresolved implementation finding. A separate full bmad-code-review workflow has not been invoked for Story 7.4.
- Changes are saved on feat/NG-9033-account-settings-view in separate bugfix/foundation/story commits as requested. No remote push, PR, Jira transition or main merge.
