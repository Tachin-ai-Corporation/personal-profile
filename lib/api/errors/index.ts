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

export { isUploadRejected, mappedErrorCode, type ErrorField, type ErrorScope, type MappedError, type MessageRule } from "./core"
export {
  FORBIDDEN_SCOPE_TABLE,
  forbiddenScopeFor,
  normalizeForbiddenPath,
  type ForbiddenLevel,
  type ForbiddenOwner,
  type ForbiddenPage,
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

/**
 * A read failure worth an automatic retry (human decision 2026-10-14, main's
 * `shouldRetryMyself`; used by `useMyself` only): a 5xx (incl. 503
 * `REFRESH_UNAVAILABLE`) or a network error. Never a 4xx (`SESSION_EXPIRED`,
 * 403, …) nor a client-side failure (`BAD_PATH`, an unknown key, an
 * unreadable body), nor anything that is not an `ApiResponseError`.
 */
export function isTransientReadFailure(error: unknown): boolean {
  if (!(error instanceof ApiResponseError)) return false
  const { statusCode, errorCode } = error.response
  if (statusCode !== undefined) return statusCode >= 500
  return errorCode === "NETWORK_ERROR"
}

/** Maps an SWR read error: an `ApiResponseError` by its response, anything else as generic. */
export function mapFetchError(sectionId: ErrorScope, error: unknown): MappedError {
  return error instanceof ApiResponseError ? mapApiError(sectionId, error.response) : { kind: "generic" }
}
