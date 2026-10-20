---
title: 'Keep NPI reads and searches out of development logs'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
route: 'oneshot'
baseline_commit: '75eef504092b76da91e0acc9bd9cb3224dd8347f'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Foundation prerequisite explicitly approved in Story 9.1's plan on 2026-10-20. For user/npi and public/npi/list, log only method, canonical route without query/fragment, status and duration during development. Never print NPI request/response payloads, including errors/network failures. Preserve other endpoints' logging and production/test silence. Keep this change in its own foundation PR and merge it before dependent Provider implementation. No UI or registration behavior belongs here.

</frozen-after-approval>

## Implementation Notes

- Extend the existing logger, without a second transport or public API. Classify supported encoded route variants. Skip body logging altogether for the two NPI endpoints.
- Direct development-mode regressions and real callApi/MSW tests cover individual/practice queries, success, forbidden, server and network failures. Existing non-NPI tests protect prior behavior.
- Verification: 102 targeted tests; logger 100% statements/branches/functions/lines. Full suite: 6,217 tests / 218 files, 100% enforced coverage across 131 files. ESLint, TypeScript, forbidden/token gates and diff checks pass. Verification record: /tmp/npi-foundation-verification.txt.

## Review Triage Log

| Finding | Verdict | Evidence and resolution |
| --- | --- | --- |
| Blind: URL parsing removes literal control characters before fetch. | medium; patch | callApi's guard accepts these same-origin paths, and WHATWG URL parsing removes tab/CR/LF. The logger previously compared raw characters, permitting a query/body disclosure. Canonicalize consistently and add real transport/direct regressions. |
| Blind: real error envelopes/plain text lack privacy/metadata assertions. | low; patch | Existing tests only supply success-shaped objects for403/500 and assert success. Add genuine upstream/BFF envelopes and plain text, preserving caller status/error details while suppressing log contents. |
| Blind: catalog omits metadata-only contract. | low; resolved | Integrator updated the Dev logging row in docs/FOUNDATION.md as part of this prerequisite; no contract omission remains. |
| Edge: whitespace-normalized NPI aliases bypass classifier. | medium; patch | Same verified URL parsing defect as the first finding, including trailing ASCII whitespace. The same canonicalization and regressions resolve both observations. |

Verification-gap layer: no gaps reported. All three layers completed before triage. No unrelated work deferred.

## Final verification

- Both patch groups resolved. Literal control/whitespace aliases now follow fetch URL normalization before matching; non-NPI log output is unchanged. Real upstream/BFF/plain-text error metadata remains available to callers. Follow-up edge reviewer returned no remaining findings.
- Final targeted run: 115 tests, logger100% all metrics (/tmp/npi-foundation-review-fixes-tests.log). Final full run: 6,230 tests /218files, 100% enforced coverage (/tmp/npi-foundation-final-coverage.log). ESLint, TypeScript and forbidden/token checks passed (/tmp/npi-foundation-final-{lint,types,forbidden}.log).
