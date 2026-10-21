---
title: 'Protect provider registration and support logs'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
baseline_commit: 'a18bf477cc2ff2f2477a88b5fcabd642f38fcbb0'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Before 9.2/9.3 activate new Provider calls, extend the established metadata-only logger policy so availability/registration/support traffic cannot print selected record ids, NPI-bearing errors or support contact data. Deliver this as a separate foundation PR, merged before dependent story implementation.

## Boundaries & Constraints

**Always:** Extend `lib/api/log-api-call.ts`, preserving its WHATWG URL normalization and existing NPI/Places protections. Log only method, a safe route/path template, status and duration for Provider operations. Protect request/response bodies equally on success/error/network failures. Keep the standard callApi path and real-consumer verification.

**Never:** Add a skip-logging flag or bypass transport, change general D6 development logging, weaken error mapping, expose 5xx bodies, change endpoint behavior, introduce new dependencies or make Team A/Team B story changes in this prerequisite. No production logging changes: this logger remains local-development only.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| Availability | health/npi/record-id/is-registered | Safe template omits actual id and query; no request/response payload | Same for false/true/403/error/network and malformed one-segment ids |
| Registration | user/register/npi POST | No provider/practice ids or backend taken text in logs | Metadata only for all statuses and unreadable bodies |
| Practice support | pp/practice-support GET | No support names/phone/email/query/payloads | Same on403/5xx/network |
| Normalization | Encoded/control/dot-segment/redundant slash forms | Classify the effective fetch/proxy path before logging | Preserve existing normalization and invalid unrelated URL behavior |
| Regression | Existing NPI/Places and unrelated API | Existing protected endpoints stay private; unrelated local-dev redacted logs unchanged | Production/test logging remains silent |

</frozen-after-approval>

## Code Map

- `lib/api/log-api-call.ts:65`: metadata-only predicate currently covers user/npi and public/npi/list plus Places, omitting the newly consumed registration/availability/support routes.
- `lib/api/log-api-call.test.ts`: existing status/privacy and normalized-path matrices; extend the owned cases.
- `lib/api/client.test.ts`: real callApi tests prove effective request logging; use direct future paths without depending on story wrappers.
- `lib/shared/bff-contract.ts`: practice-support path already exists; consume it without modification.
- `docs/FOUNDATION.md`: integrator updates dev-logging catalog after prerequisite integration.

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/log-api-call.ts` — extend existing privacy classifier; dynamic availability ids use a route template instead of the identifier.
- [x] `lib/api/log-api-call.test.ts` — normalized and malformed-id paths, success/failure/network, no request/response/query leakage; preserve ordinary redacted logging and silence outside local development.
- [x] `lib/api/client.test.ts` — drive real availability/POST/support calls and inspect complete logger calls for synthetic ids/NPI/messages/contact fields, including unsuccessful responses.
- [x] `docs/FOUNDATION.md` — update shared logger catalog without altering story ownership or decisions.
- [ ] `spec-foundation-provider-registration-log-privacy.md` — record review and verification; publish separate foundation branch/PR for review and integrate before stories.

**Acceptance Criteria:**
- Given sensitive request and response values, when any protected Provider operation is logged, then neither payload nor query nor actual availability identifier appears anywhere in the console calls.
- Given supported normalized paths and obfuscated separators, when fetch/proxy interprets the endpoint, then the logger selects the same privacy policy rather than exposing a disguised protected request.
- Given ordinary API traffic, when logged locally, then approved redaction behavior remains unchanged; outside local development, no log is emitted.
- Given the prerequisite delivery, when9.2/9.3 start, then the reviewed foundation change is integrated first and stories add no shared logger modifications.

## Implementation Notes

- Human approved the prerequisite and both story specifications on2026-10-21. Implement locally in `/tmp/personal-profile-foundation-provider-privacy-20261021` on `feat/foundation-provider-registration-log-privacy`. The implementation agent changes only foundation code/tests/catalog and this spec; root owns Git operations, PR publication and integration. Approval of this prerequisite authorizes its separate PR/integration; the exception to the implementation no-remote default is limited to this foundation delivery. No dependent story implementation starts before it is merged.

## Spec Change Log

- 2026-10-21: Extended the existing metadata-only classifier after its unchanged WHATWG/decode/slash normalization. Availability paths replace every single-segment id (valid or malformed) with `{npiRecordId}`; registration and practice support share payload/query suppression. Added direct logger and real `callApi` matrices; updated the foundation catalog.

## Review Triage Log

- BMAD blind hunter: **medium → patch**. Single decoding turns `%2F` inside a raw id into a slash before the classifier; `[^/]+` then misses the protected request and logs the raw query/payload. The smallest correction broadens only the protected availability suffix classifier, with logger and real-transport regressions.
- BMAD edge-case hunter: **medium → patch**. Independently verified the same encoded-separator leak in `log-api-call.ts`; grouped with the blind finding only after its separate verdict.
- BMAD verification-gap layer: no gaps reported. Blind hunter rechecked the surrounding code and reported one substantiated finding against its computed floor of five; no unsupported findings were manufactured.

- 2026-10-21: Implementation self-review complete; BMAD code review and separate prerequisite publication/integration remain with root. No dependent story code was changed.

## Verification

Meaningful targeted logger/transport tests with 100% changed-library coverage; full enforced library coverage, lint/typecheck/forbidden checks and BMAD code review. No live credentials or upstream mutations. Foundation integration remains a separate delivery checkpoint from the two story implementations.

- 2026-10-21: `corepack pnpm vitest run lib/api/log-api-call.test.ts lib/api/client.test.ts --coverage --coverage.include=lib/api/log-api-call.ts` passed: 163 tests; changed logger 100% statements, branches, functions and lines.
- 2026-10-21: `corepack pnpm vitest run --coverage` passed: 221 files, 6,522 tests; all 132 covered library files have 100% statements (2,748), branches (1,888), functions (623) and lines (2,282).
- 2026-10-21: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm check:forbidden` (including token gate) and `git diff --check` passed. Existing Vitest/Vite, jsdom canvas and Node warning output did not fail checks.
- Browser/build checks were not run for this logger-only prerequisite, as directed by root. Review, PR publication and integration are outstanding delivery checkpoints.

- Final root verification after review patches: 6,526 tests passed in 221 files; enforced library coverage remains 100% in all four metrics. Lint, typecheck, forbidden/token gates and whitespace checks pass. Focused logger/transport regressions: 167 passed. The ES6 target uses equivalent character-class matching rather than a dotAll flag.
- Review complete: both encoded-separator findings resolved by the same minimal private-classifier correction, with real-consumer tests. No deferred findings. Implementation is done; the delivery checkbox remains open until root publishes and integrates this isolated prerequisite.
