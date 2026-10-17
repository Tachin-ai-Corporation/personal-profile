---
title: 'Foundation: cache-only observation and preceding-frame anchor readiness'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
baseline_commit: 'ab937a30ebc5c776d3e01134dd3a79df5550bc2b'
---

## Intent

Account Story 7.4 requires passive contact-cache observation without issuing contact reads or stealing active consumers’ revalidation. Its populated table also exposes an existing deep-link limitation when an earlier loading frame grows after navigation. Repair the owning foundation modules, preserve the existing default cache/global mutators and hand-scroll behavior, and cover both regressions. The user explicitly authorized these shared repairs on the current story branch after the T2 integration constraint was explained. No remote push or PR is authorized.

## Implementation Notes

- Add `features/shell/use-cached-value.ts`: useSyncExternalStore over the public SWR Cache get/set/delete interface. Subscribe without mounting an SWR key/revalidator, without polling or internal SWR APIs. Preserve the original cache object so global mutate helpers continue to work. Share subscriptions by cache and key; restore exact own/inherited method descriptors after the final observer leaves. Use configured fallback data when appropriate; the server snapshot is empty for hydration safety.
- Keep the observer in foundation; Account consumes it and must not implement a feature-local alternative. No root provider replacement, global-mutator rewiring or test-provider exception is needed.
- Extend `useHashAnchors` pending work to include earlier frames loading at the time of navigation. When one settles into ready, error or forbidden, follow the same target without taking focus again; retire the reported frame and every other frame settled in that React commit. Never arm later load cycles or later siblings, and retain hand-scroll/explicit cancellation.
- Focused foundation/Account/file-delete integrated run: four files, 88 tests passed. Cache tests exercise mutation/focus/reconnect after a passive observer mounts first, live updates, keys, deletion, fallback, StrictMode cleanup, cache method descriptors and global mutate compatibility. Anchor tests exercise loading/ready targets moved by earlier frames, sibling isolation and hand-scroll cancellation. Full production browser validation and independent follow-up review are pending.
- Integrator follow-up after merge: add `useCachedValue` to the foundation catalog; no catalog/header changes are bundled here.

## Review Triage Log

- medium / patch: explicit null was initially treated as missing by a nullish fallback. Use undefined-only fallback; verify null overrides configured old data and server rendering starts from an empty snapshot.
- medium / patch: ready-only notifications miss error/no-access layout changes. Add optional StateFrame.onSettled (ready/error/forbidden only), preserve onReady and session behavior, and arm only actual loading frames. Account uses the existing section-frame signal through this settled callback. Tests cover earlier loading → error/forbidden, one-time corrections and hand-scroll cancellation.

### Independent Review Closure

The reviewer verified the original findings and the null/error-anchor follow-ups: no concrete remaining bugs found. Final focused follow-up: 94 tests across four files passed, including callback compatibility and session exclusion. Review was read-only; integrated browser/coverage evidence is owned by the parent run.

- Integrated compatibility check: existing `section-nav.test.tsx` reports settled callbacks independently of DOM marker updates. Preserve that public contract by retiring the signaled frame immediately, then coalescing other already-settled frames in the same commit. Do not require callers to update a StateFrame marker before notifying.

## Final Validation

- Full unit suite: 183 files / 4,578 tests passed, no unhandled errors. Enforced server/API/shared coverage: 100% statements, branches, functions and lines.
- Focused feature/foundation checks: 195 tests across seven files passed; the six scoped Account/cache/anchor/copy/time-zone modules have 100% in all four coverage metrics. Existing StateFrame callback and Section navigation tests remain green.
- Production browser regression: 664 passed / 10 expected viewport skips, no retries or failures. After the final settled-state additions, rebuilt production and reran all affected Account, shell and Section browser suites: 254 passed / six expected viewport skips, no retries or failures. Includes held success/400/403 reads at #authenticator, mobile-first contact refresh, session dialog ownership, light/dark axe and text bounds at 360/768/1280 px.
- Full lint, typecheck, forbidden/token and whitespace gates passed. No dependencies, real upstream data or credentials were changed.
- Controlled local response-to-ready timing passed the 1,500 ms target. This does not establish real demo broadband PNFR timing; that remains an environment acceptance check.
- BMAD one-shot blind review and all follow-ups are complete, with every finding triaged and no unresolved implementation finding. A separate full bmad-code-review workflow has not been invoked for Story 7.4.
- Changes are saved on feat/NG-9033-account-settings-view in separate bugfix/foundation/story commits as requested. No remote push, PR, Jira transition or main merge.
