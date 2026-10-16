---
title: 'Story 7.3 Portal hand-off route'
type: 'feature'
created: '2026-10-16'
status: 'in-progress'
route: 'oneshot'
baseline_commit: '384fd7a25ea14d41ff32551220ecc145ce7d4b66'
story_key: '7-3-portal-hand-off-route'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/docs/AUTH-ARCHITECTURE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 7.1 and 7.2 are merged, but the shell's existing portal hand-off URLs still reach a missing route. Provider and organization actions need a safe, consistent way to reach the correct portal without ending the session or losing drafts.

**Approach:** Implement Story 7.3 (NG-9032) as a session-less, read-only server redirect using the existing environment map, sealed-session reader, remembered-environment parser, response/logging helpers and guarded client navigation. Tenant hand-offs keep the approved portal-root fallback pending OQ1; organization creation uses the fixed portal path. Validate all input, ignore destination overrides, and verify headers, method handling and absence of side effects.

</frozen-after-approval>

## Implementation Notes

Route decision: use the small oneshot path, as Story 7.1 did for the Account route. Intent is specified by existing acceptance criteria and later D4/D18/foundation decisions; no unresolved user-visible choice, irreversible operation, external call, dependency or configuration change is required. Scope is one new server module and a thin route, their tests, Team B consumer tests and BMAD tracking. User authorized starting the next story. Do not push or create a PR.

Implementation contract and code map:

1. `lib/server/handoff.ts` (new story-owned server module explicitly assigned by FOUNDATION story map): export `resolveHandoffEnvironment`, `buildTenantPortalUrl`, `TENANT_HANDOFF_SHAPE` and `createHandoffHandler`. Reuse `readCookie`/`unsealSession` and `parseEnvironmentCookie` rather than requiring authentication. Resolve an unsealed session's environment first, including an aged but still unsealable session; otherwise configured remembered environment; otherwise prod. D18 includes dev, but remembered dev is ignored when unconfigured. Never use query, referrer or other headers as environment hints. No refresh, renewal, clearing, upstream access or cookie writes.
2. Keep the tenant shape constant `root` until OQ1 is answered. A server-only shape argument permits unit-testing `root` and `ctx`; requests cannot set it. Build URLs only from `environmentConfig(environment).portalUrl` and a validated 1–19 ASCII-digit positive string, preserving 19-digit precision. Missing/invalid/repeated `to` or tenant id falls back to root. Reject percent-encoded tenant values before decoding, signed/negative/decimal/20-digit/all-zero values, control characters and redirect attempts. Validate decoded parameter names for duplicates. Ignore unrelated query parameters and emit no supplied query or fragment; `ctx` is the only future allowed generated query. `create-org` uses the portal origin's `/organizations/create`.
3. The handler uses `seeOther` for GET; all other supported methods return the existing 405 envelope without Location. Check existing Account/PP kill switches before method/environment work as defense in depth; use existing JSON error there. Log only a generated request id, method, `BFF_PATHS.handoffPortal` template, status and duration, never query/body/cookie. Reuse `guardRoute` for unexpected failures.
4. `app/handoff/portal/route.ts` (new): `dynamic = "force-dynamic"`; export the same guarded handler for GET, HEAD, OPTIONS, POST, PUT, PATCH and DELETE, preventing automatic HEAD/OPTIONS behavior. Reuse AD-18 response builders and the root interceptor's AD-21 headers. Do not edit foundation/interceptor code. Later F2/7.2 behavior supersedes the old AC's JSON switch wording: actual `/handoff/**` HTTP responses are the existing HTML disabled screen, 503 with no Location; direct handler defense returns JSON. Test both contracts explicitly.
5. `lib/server/handoff.test.ts` and `app/handoff/portal/route.test.ts`: real sealed cookies, all environments/precedence, malformed and aged sessions, dev configuration, complete invalid-input matrix, both URL shapes, all methods, no Set-Cookie/upstream calls and PHI-free logging. Test the real route exports and force-dynamic contract; cover unexpected failures through the existing guard. Reuse `test/session-fixture`, `test/named-op-fixture` and `setLogSink`; do not change shared fixtures.
6. `features/account/portal-handoff.test.tsx`: render an Account consumer through existing providers, register a dirty account participant and call existing `handoffHref`/`navigate`. Verify the real leave guard and Keep editing cancellation, successful hand-off without logout/portal-exit hooks. No new production feature button or cross-feature import.
7. `e2e/account-handoff.spec.ts`: production HTTP requests with redirects disabled, cookie-less/invalid-cookie/remembered/session environments, root/create-org destinations, method/header matrix and both disabled servers; assert exact targets, no Set-Cookie and hardened AD-18/AD-21 responses. Reuse fail-fast fixtures, page defaults and `signIn` when launching. Existing Story 7.2 handoff assertions already accept a safe portal-root 303; preserve them.
8. Validation: focused unit/consumer tests, full unit coverage (all enforced metrics 100%), lint/typecheck/forbidden/tokens, production build and full Playwright suite sequentially with bounded workers. Treat the documented Tooltip Escape flake separately; do not weaken assertions. Run BMAD blind review and record every finding/disposition. Sync only the 7.3 sprint line; preserve headers/last_updated under T8. Compile stale Epic 7 context per BMAD, preserve the closed 7.1/7.2 contracts.

Implementation evidence:

- Added the route and server handler without changing existing foundation implementations, public client helpers or deployment configuration. The foundation story map explicitly assigns the new hand-off server module to 7.3; no existing shared module is edited. Generic T1 ownership interpretation was raised during read-only investigation; the explicit Story 7.3 assignment controls this new, story-specific module. Integrator catalog updates remain outside this branch.
- Existing `unsealSession` is read without the idle/absolute age filter, matching D4's environment-resolution rule; cryptographically expired/invalid seals fall back. Configured remembered dev follows D18. No 1health API endpoint is needed or added.
- The root fallback remains enabled; the server-only `ctx` builder preserves the full 19-digit string. All non-GET exports use the same guarded handler, so the method and kill-switch outcomes are logged without query values.
- Focused production browser verification: `PP_E2E_PORT=3136 corepack pnpm exec playwright test e2e/account-handoff.spec.ts e2e/account-hardening.spec.ts --workers=2` → **113 passed, 3 viewport-specific skips**, including unchanged strict RSC/prefetch and mobile focus assertions from 7.2. Existing switch behavior remains HTML 503 over HTTP; direct-handler defense is JSON.
- The new Account consumer contract passed **7 tests**, covering both hand-off targets, Keep editing cancellation/repeated protection, Discard, awaited successful Save, no logout/portal-exit/new-tab effects, and axe accessibility. Browser navigation and persistence are the substituted external boundaries; real navigation helpers, registry, providers and LeaveGuard run unchanged.

## Review Triage Log

BMAD oneshot Blind Hunter ran context-free at inherited model level (finding floor 7 from 37.443 kB); dispatch-only layers were skipped. The reviewer inspected the worktree while server tests were still being completed, so findings 1–5 identify the same missing-test root cause, not production defects. Every finding is retained below.

| Finding | Verdict and evidence | Disposition |
|---|---|---|
| 1. Missing server/route tests and 0% new-module coverage | medium: true at review snapshot; planned tests had not yet been saved. | Patched: two new server/route files, 189 passing tests; focused new-module/route coverage all four metrics 100%. Full-suite results follow. |
| 2. Alternate ctx shape/19-digit precision untested | medium: root-only HTTP checks cannot verify ctx. Same missing-test root cause. | Patched: direct real-builder tests for both shapes, all environments, safe-integer boundary and 19-digit strings; invalid IDs with ctx enabled. |
| 3. Invalid/encoded/repeated query matrix absent | medium: parser needed direct invalid cases. Same missing-test root cause. | Patched: real-handler request matrix includes encoded digits and duplicate keys, CR/LF, signed/decimal/long/all-zero IDs and redirect attempts. No duplicate browser cross-product required. |
| 4. Environment resolution only tested with fresh demo cookie | medium: aged/readable seals and D18 need explicit proof. Same missing-test root cause. | Patched: real sealed prod/demo/dev, idle/absolute/access expiry, cryptographic expiry, foreign/malformed seal, configured/unconfigured remembered dev and ignored request hints. |
| 5. No zero-network/PHI-free logging proof | medium: Set-Cookie assertions alone do not prove these contracts. Same missing-test root cause. | Patched: MSW tracks all requests in both new server files (zero required after every test), captured metadata logs exclude sensitive query/body/header/cookie inputs; sealed payload remains unchanged. |
| 6. Failed/partial-save guard behavior not verified by Account consumer | low: shared guard failure behavior is covered already, but a direct handoff retry assertion is a simple improvement. | Patched: both targets now preserve edits and block assign after failed Save, then require explicit successful retry before assign (9 consumer tests total). Existing guard closes its dialog after failure; the tests preserve that behavior. Partial multi-part Account saves belong to 7.5; existing shared partial-save tests remain unchanged. |
| 7. No new persisted-draft retention test | low, rejected: unchanged e2e/shell.spec.ts handoff journey seeds another Section's persisted draft and asserts it survives handoff without logout; unchanged draft/navigate tests cover exit hooks. | Rejected redundant expansion: Story 7.3 adds only the read-only server destination, not client draft behavior. New consumer tests additionally prove no portal-exit callbacks on either target. |

All actionable review findings are resolved in two patch groups (server coverage and consumer failure/retry). No production bug, unresolved intent choice or new deferred review action was found. The already documented Tooltip Escape flake remains unrelated foundation follow-up.


Final verification and workflow outcome:

- Full sequential unit run: `corepack pnpm exec vitest run --coverage --maxWorkers=2` → **170 files / 3,962 tests passed**. Server/API/shared lines (1,918/1,918), statements (2,285/2,285), functions (514/514), branches (1,554/1,554) are all **100%**. No coverage exclusions were added.
- Full production-build browser run: `PP_E2E_PORT=3136 corepack pnpm exec playwright test --workers=2` → **543 passed, 8 viewport-specific skips, 1 failure** in the pre-existing `e2e/primitives.spec.ts:90` Tooltip Escape case on mobile. All Story 7.3 and Account regression cases passed. The unchanged tooltip rerun, three repetitions on each viewport, passed **6/6**. This does not relabel the full run as green; the historical foundation flake remains documented in deferred work.
- Final lint (no warnings), typecheck, forbidden/token gates and whitespace checks passed. Production compilation passed in the browser runs. Heavy suites ran sequentially.
- BMAD oneshot spec is done, and Story 7.3 sprint entry is review as required by the build workflow. Sprint headers and last_updated remain unchanged under T8. No new API passthrough entry, deployment configuration, existing shared runtime module or credentials changed. Tenant portal root is the approved OQ1 fallback, not a newly resolved tenant-context contract. No push, PR or Jira transition was performed.

### Review Findings — bmad-code-review (2026-10-16)

Full review of commit `e588491` against baseline `384fd7a25ea14d41ff32551220ecc145ce7d4b66`: 9 files, 779 insertions and 21 deletions. All four configured layers ran with inherited model capability. Edge Case Hunter returned no findings (`[]`); Verification Gap reported no verification gaps; Acceptance Auditor reported no acceptance violations and independently reran all **198 focused tests**, passing. Blind Hunter returned nine observations (finding floor 9 from 65.916 kB). No layer failed. The triage below verifies each observation before grouping.

Summary: **0 decision-needed, 6 patch groups, 0 deferred, 2 rejected individual findings**. Seven surviving observations become six groups because B3/B7 share the root-only parser-test blind spot. The existing Tooltip Escape flake is unchanged historical follow-up; it was not introduced by this review. No runtime or test patch has been applied yet. Implementation remains saved, but the spec and sprint entry return to **in-progress** while approved handling of these actions is pending. Preserve sprint headers and last_updated under T8.

#### Patch actions

- [ ] [Review][Patch][P2] R1 — Include `Allow: GET` in the explicit 405 response and assert it through route/unit/HTTP method tests. `lib/server/handoff.ts:74` (B2). The current handler emits 405 with no Allow header, reproduced with the actual handler. RFC 9110 §15.5.6 requires the supported-method list; preserve the JSON envelope, no-store/security headers, and kill-switch precedence. This correction is local to the new handoff handler, not a change to the shared error builder.
- [ ] [Review][Patch][P2] R2 — Make raw tenant-query validation observable independently of the root fallback, then cover encoded whitespace/control values. `lib/server/handoff.test.ts:144` (B3 + B7). Valid and invalid IDs both currently yield the same root target; the request matrix cannot fail solely because tenant validation was removed. Exercise the real parser with server-selected ctx behavior or an equivalent internal parser contract, retaining root as the production default and exposing no query override. Include `%201`, `1%20`, `1%0A`, `1%0D%0A`, duplicates and encoded duplicate keys, encoded digits, signed/decimal/long/all-zero IDs; valid 19-digit values must keep precision. Direct builder cases alone do not verify request parsing.
- [ ] [Review][Patch][P3] R3 — Resolve session seals using the same effective configuration as the handler's injected environment. `lib/server/handoff.ts:76` (B4). Reproduced: a valid demo cookie sealed with `deps.env().SESSION_SECRET` falls back to remembered prod when the global secret differs. Production defaults use the same global configuration, so this is a developer-facing dependency-contract defect, not an observed deployment misroute. Reuse unsealSession's existing explicit-secret support through an internal resolver; keep the HTTP contract and existing exported resolver compatible, and test current/previous injected secrets.
- [ ] [Review][Patch][P3] R4 — Freeze the real Date clock and explicitly establish age in the handler's aged-session/logging test. `lib/server/handoff.test.ts:177` (B5). `NOW` is 2027-01-15; at review time the fixture's lastSeen is in the future. Injected `now` changes log duration only and does not change session age. Existing direct resolver age tests do freeze Date; extend that discipline to this real-handler case.
- [ ] [Review][Patch][P2] R5 — Add a production-HTTP request with a genuinely sealed aged session and conflicting remembered environment. `e2e/account-handoff.spec.ts:44` (B6). The literal `expired` tests an invalid seal, not idle/absolute age. Verify the interceptor and real route retain the aged seal's environment and send no Set-Cookie, auth redirect, renewal or logout. Keep the invalid-seal case and describe it precisely.
- [ ] [Review][Patch][P3] R6 — Assert trigger-focus restoration after Keep editing in the Account consumer. `features/account/portal-handoff.test.tsx:126` (B8). This consumer test currently asserts values/navigation only. Add the direct keyboard-continuation assertion using the real guard, retaining the later guarded-attempt check; no UI or guard implementation change is indicated.

#### Individual verdicts and evidence

| ID | Layer | Verdict | Evidence and disposition |
|---|---|---|---|
| B1 | blind-hunter | low, rejected | Browser fragment inheritance is real (RFC 9110 §10.2.2), but the approved AC constrains the emitted Location header, which has no fragment. Existing handoffHref emits no fragment either. The cited no-follow HTTP tests correctly verify emitted-header behavior and do not establish a stronger browser-URL promise. Changing this behavior would require changing the approved header contract; reject the proposed spec/intent expansion. No new runtime fragment defect against the current AC was demonstrated. |
| B2 | blind-hunter | medium | Actual handler reproduction confirms Allow is absent on 405. RFC 9110 requires it. Patch R1. |
| B3 | blind-hunter | medium | All request-level tenant branches converge on root with the shipped constant, so those assertions cannot distinguish valid parsing from unconditional fallback. Direct ctx builder tests cover validation of a string, not extraction/cardinality from a request. Patch R2. |
| B4 | blind-hunter | low | Actual handler reproduction with an injected alternate session secret returned prod creation instead of the valid seal's demo destination. Defaults remain consistent in production; the new injectable factory is inconsistent for developers. Patch R3. |
| B5 | blind-hunter | low | Date inspection shows NOW = 2027-01-15T08:00:00Z; only the handler's logging clock is injected in this test. Its aged-state claim is false at the current real Date. Patch R4. |
| B6 | blind-hunter | medium | E2E sends the string expired; sealedSessionCookie only builds a fresh session. Genuine age is covered directly at the resolver layer but not through the production interceptor/route. Patch R5. |
| B7 | blind-hunter | low | The raw matrix filters whitespace values and omits encoded leading/trailing whitespace/control cases. Combined with the root-only parser assertion, it cannot establish raw request rejection. Same root cause as B3; patch R2. |
| B8 | blind-hunter | low | Restored trigger focus is not asserted in the Account consumer after Keep editing, though foundation guard tests cover restoration generally. A direct assertion closes this local omission without duplicating the UI implementation. Patch R6. |
| B9 | blind-hunter | false, rejected | The seven-test statement is historical implementation evidence before the documented failure/retry patch. The subsequent triage explicitly reports nine consumer tests and the final full-suite result includes them. It is not the final count being stated inconsistently. Changing only the reviewed spec is also excluded by triage rules. |

#### Rejected

- B1 — low: inherited browser fragments do not violate the emitted-Location contract; the proposed behavior change would expand approved intent. The existing client helper supplies no hash.
- B9 — false: chronological seven-then-nine validation notes describe separate checkpoints; the final test count is already recorded correctly.

Reference verification: [RFC 9110 §15.5.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.6) (405/Allow), [§10.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.2) (Location/fragment inheritance). A temporary focused probe reproduced missing Allow and injected-secret mismatch using the real handler and sealed cookies; it passed and was removed. No production code or committed test was changed during verification.
