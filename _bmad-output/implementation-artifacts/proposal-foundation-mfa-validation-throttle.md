---
title: 'Foundation proposal: shared attempt limiting for TOTP enrollment'
status: 'draft'
created: '2026-10-19'
baseline_commit: 'a56a8358de9adc26afef57e68ac19498d003cfba'
---

# Shared attempt limiting for TOTP enrollment

This is a design proposal for the foundation prerequisite of Story 8.2
(NG-9037). It does not implement or activate protection. The implementation
requires an agreed counter store, policy and operational ownership. Keep
this PR in draft until implementation and verification are complete; a
merged proposal alone must not unblock enrollment release.

## Evidence

The locally available backend checkout is `9a7342252e` in
`../1h-ng-bo-core-be`; these observations do not establish deployed behavior.

- `common/.../config/WebMvcCommonConfig.java` registers
  `RateLimitInterceptor` on `/**`.
- `common/.../service/bucket4j/RateLimitServiceImpl.java` maintains counters
  in a process-local `ConcurrentHashMap`. The checked-in
  `env/{demo,prod,qa,develop}.env` sets capacity 500 and refill 60 seconds.
- `RateLimitInterceptor` keys authenticated requests by user ID, otherwise
  remote address, bypasses private clients and returns 429 on exhaustion.
- `oauth2/.../service/impl/MfaServiceImpl.java#validateAndEnableTotp` checks
  the submitted code without consulting or updating a failed-attempt counter.
- `oauth2/.../config/mfa/MfaAuthFilter.java` implements a three-failure,
  five-minute login lock, but only matches `POST /oauth2/token`.
- No endpoint-specific enrollment limiter or deployed edge configuration
  was found in the local repositories. No live enrollment requests were made.

## Proposed policy — requires approval

Allow at most **three upstream validation requests in a fixed five-minute
window**, starting at the first admitted request. Count requests before
calling upstream, including unsuccessful responses, timeouts and successes;
do not depend on learning an outcome to consume capacity. The fourth request
returns 429 without an upstream call. Rejections do not extend the window.

This is a proposed enrollment request budget, not a claim of parity with
the backend's failed-login policy. It deliberately counts all attempts to
close concurrency and uncertain-outcome gaps.

Scope the budget to operation + environment + tenant + user, all obtained
from the authenticated session. Tabs, token refresh, fresh launch sessions,
reopening the dialog and reusing an older sealed cookie must share the
same budget. Separate users, tenants and environments must remain isolated.
Use an opaque keyed digest for storage keys; store only counts and expiry,
never codes, QR data, credentials or raw identity fields. A new digest secret
must remain stable across app deployments/ordinary session-secret rotation;
coordinate its own rotation because changing it creates a new budget.

## Implementation seam

The foundation catalog already reserves `lib/server/throttle.ts` for named
operations. Build that shared module instead of adding an MFA-specific
counter inside a feature or copying it for Places.

The store must atomically admit/increment a request and establish expiry,
using one shared authority for time. Independent application instances must
observe the same budget. No read-then-write counter, process-local fallback,
or counter stored only in the sealed session cookie is sufficient.

Proposed wiring after storage selection:

1. `lib/server/throttle.ts` and its colocated tests: atomic store adapter,
   bounded timeout, operation namespace, opaque key and typed outcomes
   `allowed`, `limited`, `unavailable`.
2. `lib/server/env.ts` and its tests: server-only connection configuration,
   credentials and digest key validation for the selected service.
3. `lib/server/named-ops/mfa-validate.ts`: consume capacity inside `handle`,
   after the existing session/body/token checks and before the upstream call.
   Preserve the named-op wrapper and validation schema.
4. `lib/shared/bff-contract.ts`, `lib/api/errors-codes.ts`, mapper/copy tests:
   add any required error members without changing existing contracts.
   Proposed limited response: 429 `{ errorCode: "RATE_LIMITED", source: "proxy" }`
   and positive integer `Retry-After` seconds until expiry. Proposed store
   failure response: 503 `{ errorCode: "THROTTLE_UNAVAILABLE", source: "proxy" }`.
   Neither response triggers an automatic retry of the mutation.
5. Named-op and route tests: retain private no-store, nosniff, request IDs,
   template-only logging, kill-switch behavior and existing upstream mappings.
6. Integrator updates `docs/FOUNDATION.md` only when the implemented module
   lands. Story 8.2 reuses it after this foundation PR merges.

Fail closed on an unavailable or malformed store response: do not call
upstream, leak credentials or silently fall back to local memory. Do not
activate the handler change until the service is provisioned and validated
in the intended deployment environments. Rollback must disable enrollment
or restore equivalent protection rather than remove the limiter alone.

## Required verification before this PR becomes ready

- Given three admitted requests, the fourth is rejected before upstream;
  immediately before expiry it remains blocked, at expiry it is admitted.
  `Retry-After` reflects remaining time and rejected requests do not extend it.
- Given concurrent requests from separate application instances, at most
  three reach upstream. Validate against the chosen real shared store as
  well as deterministic unit tests; a fake map cannot establish this property.
- Given refresh, a new launch, an old cookie, another tab or dialog reopen,
  the same identity retains its existing budget. Different operation,
  environment, tenant and user scopes remain isolated.
- Given invalid JSON/body, missing session, stale access token or a kill
  switch, existing responses are preserved without consuming the budget.
- Given upstream false, true, error or timeout, an admitted attempt remains
  consumed. Given a store timeout/error/malformed result, no upstream request
  occurs and the failure remains generic and no-store.
- Given completed requests, logs, errors and store keys contain no code,
  QR, tokens, connection secret or raw identity fields.
- Run lint, typecheck, forbidden-pattern checks, full enforced unit coverage
  and BMAD code review on the implementation. Document a deployment smoke
  check using synthetic store keys; do not mutate real MFA accounts.

## Decisions needed before implementation

1. **Store and operator:** identify an existing shared Redis or equivalent
   atomic service and its configuration location, authorize a new service,
   or implement this protection in backend/infrastructure instead. Do not
   put credentials in this PR. Specify access, timeout, eviction/durability
   policy and failure/recovery behavior; avoid losing active counters during
   routine restarts, failover or deployments.
2. **Policy:** approve or amend the proposed three-request/five-minute budget,
   counting rules, scope and generic 429/503 behavior.
3. **Release evidence:** record target environments, configuration owner and
   proof that the shared limiter is enabled before releasing Story 8.2.

This limits requests through Personal Profile's BFF only. Other callers of
the upstream validation endpoint require backend or infrastructure coverage;
this PR must not claim platform-wide TOTP lockout.
