/**
 * The one upstream → app error mapping (Story 1.12, AD-19, D5). `errors/*` is
 * the only place outside `client.ts` and `errors-codes.ts` that reads
 * `errorCode`/`upstreamCode`, and the only place that matches upstream
 * message text (guarded by `errors.test.ts`). Each area owns its own
 * exact-message table in its own file (pre-created for every planned area).
 * `forbidden-scope.ts` is not an area table: it is the AD-23 403 owner table.
 */

import { ApiResponseError } from "../fetcher"
import type { ApiResponse } from "../types"
import { rules as accountRules } from "./account"
import { rules as addressRules } from "./addresses"
import { rules as contactRules } from "./contacts"
import { classifyTransport, type ErrorScope, type MappedError, type MessageRule } from "./core"
import { rules as insuranceRules } from "./insurance"
import { rules as mfaRules } from "./mfa"
import { rules as npiRules } from "./npi"
import { rules as orgRules } from "./orgs"
import { rules as personalRules } from "./personal"

export { mappedErrorCode, type ErrorField, type ErrorScope, type MappedError, type MessageRule } from "./core"
export {
  FORBIDDEN_SCOPE_TABLE,
  forbiddenScopeFor,
  normalizeForbiddenPath,
  type ForbiddenLevel,
  type ForbiddenOwner,
  type ForbiddenScope,
  type ForbiddenScopeRule,
} from "./forbidden-scope"

/** Every area table (each file under `errors/` but `core`/`index`), imported once; a story edits only its area file. */
export const ERROR_RULES: readonly MessageRule[] = [
  ...personalRules,
  ...contactRules,
  ...addressRules,
  ...insuranceRules,
  ...accountRules,
  ...mfaRules,
  ...npiRules,
  ...orgRules,
]

/**
 * Maps a failed `ApiResponse` for the surface `sectionId` to what the UI
 * shows. An upstream 4xx whose message matches a table row for that scope is
 * `field`/`coded`; any other 4xx message is `generic` with that message.
 */
export function mapApiError(sectionId: ErrorScope, response: ApiResponse<unknown>): MappedError {
  const classified = classifyTransport(response)
  if (classified.kind !== "upstream") return classified
  const rule = ERROR_RULES.find((candidate) => candidate.scopes.includes(sectionId) && candidate.pattern.test(classified.message))
  return rule ? rule.result : { kind: "generic", message: classified.message }
}

/** Maps an SWR read error: an `ApiResponseError` by its response, anything else as generic. */
export function mapFetchError(sectionId: ErrorScope, error: unknown): MappedError {
  return error instanceof ApiResponseError ? mapApiError(sectionId, error.response) : { kind: "generic" }
}
