# Foundation NPI test compatibility

Implemented 2026-10-20 on `feat/foundation-npi-test-contracts`, based on merged prerequisite `1342f7e7e4040beda43e4b7957707d10732a9c79`.

Scope: four shared tests only; production behavior is unchanged. These corrections work both before and after Story 9.1.

- `lib/api/support.test.ts`: run registry tests against fresh dynamically imported fetcher modules after `vi.resetModules()`, preserving the original module registrations and duplicate-registration enforcement.
- `lib/server/proxy/handler.test.ts`: test rejection with a permanently synthetic unknown route instead of a planned endpoint.
- `test/providers.test.tsx`: retain default-handler presence/composition coverage and add Account handler override checks; Team B owns the actual NPI default status contract.
- `lib/api/errors/errors.test.ts`: retain broad NPI upstream-text detection, exempt only the exact mandated full UI label, and verify actual rejections plus generic substring/regex matchers remain detected. Source exclusions and error-field ownership checks are unchanged.

Verification commands use the existing dependency installation with `corepack pnpm --config.verify-deps-before-run=false`:

- `vitest run lib/api/support.test.ts lib/server/proxy/handler.test.ts test/providers.test.tsx lib/api/errors/errors.test.ts`: 229 passed (`/tmp/npi-test-contracts-targeted.log`).
- `lint`, `typecheck`, `check:forbidden`: passed, including token checks (`/tmp/npi-test-contracts-{lint,typecheck,forbidden}.log`).
- `git diff --check`: passed.
- Full enforced `vitest run --coverage`: 218 suites /6,233 tests passed; 131 files fully covered, 100% statements/branches/functions/lines (`/tmp/npi-test-contracts-coverage.log`).

Prepared independently from the story worktree; production code and shared error-field rules are unchanged.

## BMAD prerequisite review

All three layers completed before triage; edge-case and verification-gap reviewers reported no additional findings.

| Finding | Verdict | Evidence and resolution |
| --- | --- | --- |
| Narrowed NPI phrase guard misses generic upstream matching. | medium; patch | Node reproduction confirms message.includes("NPI Number") and /NPI Number/.test(response.error) passed the proposed scanner. Retain the broad detector, exclude only exact legitimate full UI label text and add both bypass regressions. |
| Overrides hide missing default handlers. | medium; patch | Replacing all area defaults in the only Account default test means it no longer exercises those defaults. Keep override composition and separate default-handler coverage; actual NPI state semantics remain Team B-owned. |
| Unregistering removes real registry entries. | low; patch | The test overwrites/deletes the actual imported registry family, so subsequent calls in that module context lose its registered loader. Use isolated fresh fetcher modules for registry tests without production API changes. |

Review corrections: only the three edited test suites rerun (`/tmp/npi-test-contracts-review-fixes.log`); the full/static results above precede these corrections, with final full verification owned by the integrator.

## Final integrator verification

All three review corrections resolved. Final full suite: 218 suites /6,236 tests and100% enforced coverage (/tmp/npi-contracts-final-coverage.log). ESLint, TypeScript and forbidden/token gates pass (/tmp/npi-contracts-final-{lint,types,forbidden}.log). Targeted correction run137tests passed. No review finding remains deferred.
