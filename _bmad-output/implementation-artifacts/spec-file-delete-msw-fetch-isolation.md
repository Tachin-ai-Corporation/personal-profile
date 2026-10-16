---
title: 'File-delete ownership tests: isolate MSW Fetch from native TLS dispatch'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
baseline_commit: 'ab937a30ebc5c776d3e01134dd3a79df5550bc2b'
---

## Intent

The user reported a CI failure in file-delete ownership pagination: the expected UPSTREAM_ERROR response was returned, but zero insurance pages had been observed instead of five, with an unhandled Undici ERR_TLS_CERT_ALTNAME_INVALID assertion. Fix test isolation without changing runtime deletion, weakening ownership/page-cap assertions, bypassing TLS, or permitting real network requests. The user explicitly authorized this shared-area repair alongside Story 7.4; save it as its own commit.

## Implementation Notes

- The exact CI TLS exception did not reproduce locally. Inspection/reproduction showed the installed MSW 3 Node Fetch interceptor delegates to Undici/socket interception. A failed earlier ownership read can also produce the expected 502, so the previous status assertion alone did not prove the test reached insurance pagination.
- File-local Fetch boundary now resolves the current real MSW request handlers through getResponse and rejects unmatched requests instead of falling through. No application runtime or shared fixture/configuration changed. Existing Vitest unstubGlobals restores the boundary before the next test.
- Validate both expected GraphQL documents instead of treating an unknown document as a picture lookup. Strengthen the page-cap case with exact ordered page queries, prior lookup counts, zero late Signature reads and zero deletes.
- Add regressions for an unmocked request rejection and zero native Undici request dispatch while traversing all ownership lookups. The native-dispatch regression observed four dispatches under the original setup and zero under the corrected Fetch boundary.
- Focused validation by the fixing agent: 39 tests repeated 20 times; 188 adjacent tests repeated three times with one reused worker; targeted lint, typecheck, forbidden/token and whitespace checks passed. Full integrated validation and independent review follow below. Do not claim the precise CI TLS exception was locally reproduced.

## Review and Validation

Independent read-only review found no actionable bugs: real handler authentication, lookup order, exact page cap and fail-closed behavior remain intact, with no native Fetch fallback. Clarified the cleanup comment to match Vitest’s before-next-test restoration. Parent integrated focused run passed all 114 tests across Account route/view and file-delete coverage. Full-suite validation is recorded in the accompanying Story 7.4 spec.
