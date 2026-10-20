# Foundation NPI log URL normalization

Approved Story9.1 prerequisite follow-up,2026-10-20. Based on main3a896ded22a9d7e6d68124a402b6b2e387443d98; separate branch feat/foundation-npi-log-url-normalization. The frozen story privacy requirement remains unchanged.

Story9.1 official three-layer BMAD review independently reported this privacy gap in both blind and edge layers; verification-gap layer reported none.

| Finding | Verdict | Evidence and route |
| --- | --- | --- |
| Blind1: URL-control-obfuscated dot segments bypass metadata-only logging | medium; patch | isApiPath raw dot guard permits .+tab; fetch strips the tab and resolves the dot, reaching user/npi while logger fails to resolve it and logs the original URL/payload. Use the same WHATWG pathname normalization privately, retaining ordinary endpoint output and malformed-input behavior. |
| Edge1: same URL normalization gap | medium; patch | Independent same reachable failure; resolve with the same transport/direct logger regression. |

Implement only the owning logger and privacy transport/direct tests; no transport public API changes, TeamB features, dependencies or lockfiles. Keep this separate from the shared Combobox PR. Regression paths must reach the real NPI route through callApi, prove metadata-only output on success/errors/network failures, and preserve caller metadata and non-NPI logging. Include both read and search routes and canonical normalization variants.

Root owns final full coverage, lint/types/forbidden and review resolution. No publication of the story is authorized. Publication/integration of this necessary privacy prerequisite follows the approved story prerequisite plan.

Implementation ready for integrator gates: private WHATWG pathname parsing now resolves control-obfuscated dot segments before existing proxy byte decoding, while unrelated output remains raw and malformed URLs retain prior logging behavior. Direct and actual transport regressions cover both NPI endpoints, caller metadata, errors and network failures. Targeted command: `corepack pnpm vitest run lib/api/log-api-call.test.ts lib/api/client.test.ts --coverage --coverage.include=lib/api/log-api-call.ts --coverage.reportsDirectory=/tmp/npi-url-normalization-targeted-coverage` — 125 passed, logger 100% coverage. Log: `/tmp/npi-url-normalization-targeted.log`. No other production changes; uncommitted for root review.

## Root final verification

- Both independently reported findings are resolved; root traced the real transport guard and read the complete final code/test diff. No findings remain open.
-125 targeted tests passed, logger100% coverage; root full suite6,246 tests /218 files passed with100% enforced statements/branches/functions/lines (`/tmp/npi-url-normalization-final-coverage.log`).
- Lint, typecheck and forbidden/token gates passed (`/tmp/npi-url-normalization-final-{lint,types,forbidden}.log`); diff check passed.
- Runtime behavior change is restricted to development logging; no browser UI or production transport behavior changed. Story9.1 integration/browser verification remains separate.
