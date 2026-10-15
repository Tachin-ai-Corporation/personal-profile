/**
 * The Practice-name support-contact popover (Team B, Story 9.3). Pre-created
 * by spec F6-3 (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoint this module will own: `GET /api/pp/practice-support` (named op,
 * built in F2; 404 `NO_PRACTICE`; body `PracticeSupportBody`) under
 * `keys.practiceSupport()`; Story 9.3 registers
 * `registerFetcher("practice-support", …)` here. A 403 belongs to the popover
 * (`forbiddenScopeFor`).
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"

export function practiceSupportPath(): string {
  return BFF_PATHS.practiceSupport
}
