---
title: 'Opt-in proxy path parameter validation'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
route: 'oneshot'
baseline_commit: 'faf0dfe5311285259c138c1037670b1745a76d0b'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Resolve standalone9.2/9.3 review finding12: the shared proxy currently admits any1–19 digit identifier, including0 and values above Number.MAX_SAFE_INTEGER, while provider availability requires positive safe integer IDs. Add optional per-entry Zod path parameter constraints and reject invalid matched parameters with400 BAD_PATH before upstream work. Preserve the existing route-shape/method matching, owner substitution, authorization, kill-switch precedence, template-only logging and all unconfigured endpoints' behavior. Deliver this capability as a separate foundation change before the dependent story opts into it; do not add future story endpoints to main as part of foundation.

</frozen-after-approval>

## Implementation Notes

- User requested resolution of the identified foundation follow-up. Small single-purpose additive change; no unresolved intent choices or data mutation. Work in isolated /tmp/personal-profile-foundation-proxy-path-ids-20261021 on feat/foundation-proxy-path-id-validation, based on current origin/main. Original feature branch's uncommitted review patches remain untouched.
- Reuse existing AllowlistEntry/match/handler and Zod, not a parallel route or global tightening. Optional pathParams record maps exact placeholder names to schemas parsing normalized string segments; unknown configured names must fail closed, all occurrences of a configured name must validate. Existing shape gate still rejects nonnumeric/20-digit IDs; parameter errors on matched authenticated requests use existing BAD_PATH. Successful parse is validation only; forward original segments, preserving lossless IDs for unconstrained endpoints.
- Owned files: lib/server/proxy/types.ts, match.ts, handler.ts and their existing tests; docs/FOUNDATION.md and this spec. Test the real handler with an injected availability-shaped entry so this foundation has no dependency on unmerged stories. Verify0/unsafe/19digit failures,1/MAX_SAFE boundaries, wrong method, kill switches, missing session, no-store/template logs/no upstream on invalid, repeated/missing schema placeholders and unchanged unconstrained ID forwarding.
- Verify full enforced library coverage/static checks and BMAD review before conventional local commit. No push/PR/merge until explicitly requested; retain the concrete reviewed prerequisite for final publication approval. Story consumer opt-in/integration must wait for separate foundation merge.

### Implementation and focused validation

- Added optional `AllowlistEntry.pathParams` in the existing type and exported `validatePathParams` from the existing matcher. Each configured exact placeholder name must exist, and every occurrence must parse from its decoded segment. Successful coercion/transforms do not replace forwarded strings; unspecified entries retain their prior behavior. Handler constraints run after session validation and before query/body/token validation, retaining kill switches and route/method precedence.
- No area allowlist or application route was added or edited. The availability-shaped injected handler fixture covers zero (including encoded zero), unsafe and 19-digit integers, valid safe-integer boundaries, encoded positive digits, leading zeros, wrong method, unchanged unconstrained forwarding, missing/expired sessions, stale tokens, both kill switches, query/body precedence, absent configured names, no upstream on rejection, no-store headers and template-only logs. Matcher cases also cover repeated placeholders, multiple constraints, missing segments and owner substitution.
- Focused verification: `corepack pnpm vitest run lib/server/proxy/match.test.ts lib/server/proxy/handler.test.ts --coverage --coverage.include='lib/server/proxy/{match,handler}.ts' --coverage.reportsDirectory=/tmp/foundation-path-ids-focused-coverage` passed **146 tests / 2 files**, with **100% statements (129), branches (103), functions (22), lines (96)** on both implementation modules. Log: `/tmp/foundation-path-ids-focused.log`. Full enforced suite, static checks and independent BMAD review remain for the integrator before commit.

## Review Triage Log

BMAD Build oneshot blind review completed together with independent Team A compatibility and Team B acceptance reviews. All reviewers returned before triage. Team A reported no compatibility findings; Team B independently passed146 matcher/handler tests and61 actual consumer allowlist tests, with no defect found. Blind floor6, each finding individually graded before any grouping:

| Finding | Verdict | Evidence and action |
| --- | --- | --- |
| 1. Async/throwing schemas can escape safeParse | low | Runtime reproduction is valid for an unsupported developer-supplied schema, like existing synchronous body validation. All real consumer rules are synchronous/nonthrowing. The new property initially left this requirement implicit. Direct contract correction documents synchronous/nonthrowing rules in the type and Foundation recipe; no async/catch branch or widened validation behavior is introduced. |
| 2. Unknown placeholder lacks a distinct diagnostic | false | The frozen intent explicitly requires missing configured names to fail closed;400 BAD_PATH is the selected contract. Code/tests implement that behavior, and no shipped entry is misconfigured. A new configuration diagnostic is a separate enhancement, not a demonstrated defect. |
| 3. Partial log assertion permits extra identifier fields | low | The existing toMatchObject did not exclude unexpected fields, although the implementation actually emits only the established log contract. Direct test correction uses an exact structured log assertion with typed requestId/duration metadata, excluding any extra raw parameter field. |
| 4. Constrained owner handler interaction lacks coverage | low | Helper coverage alone did not freeze the combined pipeline. Direct regression now validates me plus a positive ID through the real handler, proves session-owned98765 forwarding and403/no upstream on a post-substitution deny rule. |
| 5. Mutation test does not observe body consumption | low | Merely asserting BAD_PATH did not establish the body was unread. Direct regression now passes an observable actual JSON Request and asserts bodyUsed=false, preserving the existing early path rejection contract. No separate multipart fixture is needed for the same pre-read gate. |
| 6. Deny precedence lacks a constrained-entry case | low | Existing unconstrained deny coverage did not freeze the new gate's relative ordering. Direct test injects a matching deny rule and a failing schema with an evaluation counter;403 is returned with zero schema evaluations and zero upstream work. |

All5 direct documentation/test improvements applied by the original implementation agent; finding2 rejected with its explicit-contract refutation. No production behavior patch was needed after the initial implementation; no new deferred issue or unresolved intent question remains. Final focused148 tests pass with100% handler/matcher coverage (129 statements,103 branches,22 functions,96 lines). Logs: /tmp/foundation-path-ids-focused.log and /tmp/foundation-path-ids-review-focused.log.


## Final Verification and Delivery State

- Full foundation suite passed6584 tests in221 files with100% library coverage (2781 statements,1914 branches,634 functions,2305 lines). Final focused matcher/handler suite passed148 tests with100% changed-module coverage. Lint, typecheck, forbidden/token and whitespace checks pass. Logs: /tmp/foundation-path-ids-final-units.log, /tmp/foundation-path-ids-review-focused.log, /tmp/foundation-path-ids-final-lint.log, /tmp/foundation-path-ids-typecheck.log, /tmp/foundation-path-ids-forbidden.log.
- An isolated candidate combines this exact foundation source with the current Provider implementation/review patches and the actual NPI pathParams opt-in. Its seven consumer boundary regressions reproduced5 failures/2 valid controls before the prerequisite; after the correction, the consumer allowlist suite passes61 tests. The final combined full suite passed6837 tests/223 files with100% libraries (2813 statements,1929 branches,640 functions,2330 lines). Fresh production build and51 Provider browser cases passed,1 intentional desktop skip for a mobile-only case, no retries. Combined typecheck passes. Logs: /tmp/provider-path-ids-consumer-red.log, /tmp/provider-path-ids-final-combined-units.log, /tmp/provider-path-ids-combined-browser.log, /tmp/provider-path-ids-combined-typecheck.log.
- Initial concurrent full-suite runs plus Next build exceeded some existing test wait budgets. Repeating the suites individually passed completely, without changing timeouts or unrelated source/tests. The final reported pass counts are those sequential executions, not the unsuccessful concurrent attempts.
- Implementation and BMAD review are complete locally. Team A and Team B compatibility reviews found no defect. No new defer remains. Delivery is not yet integrated: publication/PR/merge requires the final user authorization under the oneshot remote rule. The concrete reviewed branch/commit is ready, and /tmp/foundation-path-ids-pr-body.md contains its PR description.
- The original feature branch and its uncommitted approved review patches remain untouched. Its opt-in is staged only in validation checkout /tmp/personal-profile-provider-path-ids-validation-20261021 and saved as /tmp/provider-path-ids-consumer-opt-in.patch. Enable it in the feature branch only after this separate foundation change is merged; then close the original deferred finding and restore Story9.2 completion. No shared foundation source was added to the story branch.
