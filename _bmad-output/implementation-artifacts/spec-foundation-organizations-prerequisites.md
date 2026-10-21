---
title: 'Organization data privacy, fixture contracts and logo membership reuse'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
baseline_commit: '0693a1b1c0268619e77f70264743565897fd9b8c'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Prepare the shared organization boundary before10.1–10.3 consume it. Shared fixture tests currently require the wrong Spring page envelope, the development API logger exposes organization/contact payloads, and every logo independently repeats membership paging. Deliver one separate foundation prerequisite preserving existing auth, image hardening and browser no-store behavior.

## Boundaries & Constraints

**Always:** Extend existing modules; preserve metadata-only URL normalization and all other logger protections. Shared tests assert transport/override behavior without owning Team B's organization domain. Cache only sanitized membership/logo-URL page projections in bounded server memory, isolated by environment, session sid, user/person/tenant and token generation. Keep failures uncached, short5s TTL, concurrent identical page reads single-flight, at most256 cached pages per handler instance. Membership still comes from authenticated upstream data, never a browser-supplied allowlist. Every request still passes the named operation's session/token/kill-switch gates. Keep images and responses no-store.

**Never:** Change other areas' logging policy, cache credentials/contact data/image bytes, share cache across identities/environments/generations, weaken origin/redirect/size/byte checks, add session fields or new routes, accept arbitrary logo hosts, modify future story endpoints, or mix shared foundation source into a story commit. No live-account writes or publication during implementation.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| Privacy | Organizations list with search/contact payload, all statuses | Metadata only; no query/payload logs | Include normalized/rejected URL variants and real callApi tests |
| Fixtures | Team B changes its default envelope later | Shared transport tests keep passing | Explicit mock answers remain exact and override recording is tested |
| Concurrent logos | Same authorized session/generation, same page within5s | Reuse sanitized page/read promise | Upstream failure/malformed page never cached |
| Isolation | Different sid/environment/person/tenant/gen | Independent membership reads | No reuse after token refresh or expiry |
| Bounds | TTL elapsed or capacity exceeded | Fresh bounded lookup | Eviction never changes membership/image validation |
| Images | Valid/invalid logo response | Existing protected PNG/JPEG/WebP path | Same404/401/503 and no-store contracts |

</frozen-after-approval>

## Code Map

- `lib/api/log-api-call.ts`, its tests and `client.test.ts`: extend existing metadata-only classifier for organization portal reads, using existing path normalization.
- `test/providers.test.tsx:90`, `e2e/fixtures.spec.ts:45`: replace shared hardcoded content-envelope expectations with ownership-neutral transport assertions or fixed per-test overrides. Team B changes its defaults only after merge.
- `lib/server/named-ops/org-logo.ts` and tests: existing pageSchema/findLogoUrl/createOrgLogoHandler; private bounded page cache owned by this module/handler. `NamedOpContext` already supplies session identity/generation and clock. No generic cache framework needed.
- `docs/FOUNDATION.md`: integrator documents reusable behavior and limits. Existing shared image, HTTP and route tests remain authoritative.

## Tasks & Acceptance

- [x] `lib/api/log-api-call.ts`, `log-api-call.test.ts`, `client.test.ts` — metadata-only organization reads, normalized-path and real transport privacy regressions.
- [x] `test/providers.test.tsx`, `e2e/fixtures.spec.ts` — shared fixture tests no longer prescribe Team B's domain page shape; preserve override/count contracts.
- [x] `lib/server/named-ops/org-logo.ts`, `org-logo.test.ts` — bounded5s sanitized membership-page cache with isolation, concurrency, expiry, capacity, malformed/failure and existing image-hardening regressions.
- [x] `docs/FOUNDATION.md` — document ownership-neutral fixtures, private reuse and unchanged no-store/host checks.

**Acceptance Criteria:**
- Given organization names/contacts/errors, when local logging runs, then only approved metadata is emitted and unrelated APIs retain their prior behavior.
- Given concurrent logo requests, when membership pages repeat within the same session/generation, then upstream reads are reused; different identities and expired/failed entries cannot reuse them.
- Given a separate reviewed prerequisite, when stories consume it after merge, then no shared test/route/logger edits remain in the story diff.

## Implementation Notes

Local-only implementation is authorized by the development request; separate publication/merge remains a delivery action after the concrete reviewed change is ready.5s is the maximum membership snapshot window; token-generation keys prevent refresh reuse and server memory is bounded. Cold instances safely refetch. Root owns integration and Git operations. User explicitly chose mocked/code completion with real-logo origin verification deferred to QA; this foundation never broadens hosts.

## Verification

Full enforced100% library coverage, meaningful focused cache/privacy tests, lint/typecheck/forbidden checks, production shared fixture/logo/browser regressions and BMAD review by both teams before local commit. No cached image bytes or cache-control relaxation.


### Approval record

Human selected Approve and continue on2026-10-21 for this prerequisite and all3 stories. Frozen intent and captured baseline are preserved. Explicit multiagent authorization overrides the default sequential-only implementation rule after prerequisite integration. Remote publication remains a separate final delivery action.

### Isolated implementation checkout

Implement this foundation only in `/tmp/personal-profile-foundation-organizations-20261021`, branch `feat/foundation-organizations-boundary`, based on main0693a1b1c0268619e77f70264743565897fd9b8c. Run commands and resolve project-root/context paths from that checkout, not the primary feature checkout. Read CLAUDE.md first. Root owns Git/PR/integration and final broad checks; implementation agent must not commit/push/switch branches, edit other checkouts or start a production build. Run meaningful focused tests/coverage with a unique temporary report directory; report stable files for integrator verification. Scope and files remain exactly the approved Code Map and tasks.

## Verification Results

- Root full Vitest run: 234 files, 7,395 tests passed; 100% statements, branches, functions and lines across enforced libraries (132 fully covered files). Report: `/tmp/foundation-orgs-root-coverage-20261021`; log: `/tmp/foundation-orgs-full-tests.log`.
- Focused implementation tests: 238 passed with 100% changed-source coverage.
- Full lint, typecheck, forbidden/token checks and diff whitespace check passed.
- Fresh production build and Playwright fixture, Account page and kill-switch regressions passed: 112 tests across desktop/mobile, including light/dark axe checks and named-op no-store/session/kill-switch contracts. Log: `/tmp/foundation-orgs-browser.log`.
- Matrix audit: privacy success/error/network and normalized paths; fixture override recording; concurrent paged membership/image refetch; identity/environment/generation isolation; exact expiry/revocation; malformed/failure retry; bounded eviction/handler isolation; existing image hardening covered. Story consumption after merge remains a delivery dependency, not an implemented story claim. Real logo origins remain explicitly deferred to QA.

## Review Triage Log

| ID | Layer | Verdict | Evidence and route |
| --- | --- | --- | --- |
| B1 | Blind | medium | Confirmed: ctx.now is fixed before handle, so a later page can reuse an entry that expired while awaiting an earlier page. Patch: prune against the injected current clock at every lookup; retain request-start deadlines. |
| B2 | Blind | false | TTL controls authorization reuse, not physical deletion timing. A 256-entry per-handler bound limits retained projections; inactive expired entries cannot authorize a request and are pruned on the next read. Active timers were never required. |
| B3 | Blind | false | named-op upstream reads cap the entire JSON body at 2 MiB before parsing; projecting only IDs/validated URLs plus a 256-entry cap makes retention bounded. Additional field caps would introduce a new rejection policy without a demonstrated failure under the approved bound. |
| B4 | Blind | low | Confirmed regression gap: releasing immediately after starting the second async handler need not exercise pending-result reuse. Patch: synchronize second caller reaching lookup before release. |
| B5 | Blind | low | Confirmed regression gap: sequential capacity tests do not prove an old evicted failure leaves a replacement entry intact. Patch: add controlled in-flight eviction/replacement regression. |
| B6 | Blind | false | This test intentionally checks transport defaults only. The adjacent Account override test already asserts the exact organization override body and composition; the owner validates its domain, so no contract regression is untested. |
| B7 | Blind | false | The compiled planning context identifies cross-story prerequisite work, not a new story implementation instruction; the approved story spec explicitly requires the prerequisite merged first and forbids shared story edits. No duplicate caching implementation is instructed by the controlling spec. |
| B8 | Blind | false | The authoritative approved 10.1 spec explicitly requires identical trimmed queries not to fetch. Condensed context is not the acceptance checklist; no implementation or acceptance requirement was removed from the story. |
| B9 | Blind | false | The authoritative approved 10.1 spec preserves aria-current and focusable inert boundary controls. Condensed context does not supersede it or change a pager implementation. |
| B10 | Blind | false | The authoritative approved 10.2 spec uses existing provided-value helpers and exact missing-field fallbacks. No contact implementation or authoritative display rule was changed in this prerequisite. |
| E1 | Edge | medium | Confirmed same delayed-pagination expiry defect as B1. Group with B1; patch current-time pruning. |
| E2 | Edge claim | medium | Confirmed maximum reuse claim is violated by B1's request-start clock during later page lookups. Same root cause and patch as B1. |
| V1 | Verification | low | Accepted pre-verified gap: no regression proves an initial slow membership read does not extend its deadline. Patch the request-start-plus-four-seconds/revocation-at-five-seconds test as filed. |

All layers reported before triage. Source fixes are private and preserve the approved deadline, API surface and ownership boundaries; no intent/spec loopback is necessary. Review covers shared transport contracts consumed by Team A and Team B; both page suites passed in the complete unit run and production shared/browser contracts passed.

### Review fixes and final verification

B1/E1/E2 now prune with the injected current clock at every page lookup while retaining request-start deadlines. B4 synchronizes both callers before releasing upstream. B5 exercises evicted in-flight failure versus replacement retention. V1 proves slow initial reads do not extend authorization reuse. All accepted findings are resolved; no source defects remain deferred.

Post-patch full run: 234 files / 7,398 tests passed, with 100% enforced library coverage (132 fully covered files). Full lint, typecheck, forbidden/token and whitespace checks passed again. Final coverage: `/tmp/foundation-orgs-root-final-coverage-20261021`; logs: `/tmp/foundation-orgs-final-{tests,lint,types,forbidden}.log`.

The requested standalone bmad-code-review of the complete story implementation remains scheduled after stories 10.1–10.3 are developed. This prerequisite has completed the three-layer BMAD Build review; those are distinct workflows.

Final fresh production build and browser rerun after review fixes: 112 tests passed (desktop/mobile; fixtures, Account and kill-switch contracts). Log: `/tmp/foundation-orgs-final-browser.log`. Local implementation is complete; publication and merge are pending explicit delivery authorization.
