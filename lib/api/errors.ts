/**
 * The one upstream → app error mapping (Story 1.12, AD-19, D5). This is the
 * only module outside `client.ts` and `errors-codes.ts` that reads `errorCode`
 * or `upstreamCode` (guarded by `errors.test.ts`). The UI decides what to show
 * from the `MappedError` kind alone.
 */

import type { ApiErrorCode } from "./errors-codes"
import { ApiResponseError } from "./fetcher"
import type { ApiResponse } from "./types"

export type MappedError =
  /** An upstream 403: the no-access panel (scope per the AD-23 owner table). */
  | { readonly kind: "forbidden" }
  /** Anything else: the generic error with Retry; `message` is the platform's own, only for a 4xx that sent one. */
  | { readonly kind: "generic"; readonly message?: string }
  /** No answer, or the proxy couldn't reach or refresh upstream. */
  | { readonly kind: "network" }
  /** The session ended: the session-expired dialog handles it, the surface shows nothing. */
  | { readonly kind: "session" }

/** Proxy and client codes that mean "couldn't get through", not "the platform said no". */
const NETWORK_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  "NETWORK_ERROR",
  "UPSTREAM_ERROR",
  "UPSTREAM_REDIRECT",
  "REFRESH_UNAVAILABLE",
  "SERVICE_DISABLED",
  "UPSTREAM_TIMEOUT",
])

const FORBIDDEN_STATUS = 403

/**
 * Maps a failed `ApiResponse` to what the UI shows. A proxy-originated code
 * (`NOT_ALLOWED` included) is never "no access"; only an upstream 403 is.
 */
export function mapApiError(response: ApiResponse<unknown>): MappedError {
  const { errorCode } = response
  if (errorCode === "SESSION_EXPIRED") return { kind: "session" }
  if (errorCode !== undefined && NETWORK_CODES.has(errorCode)) return { kind: "network" }
  if (errorCode !== undefined || response.source === "proxy") return { kind: "generic" }
  if (response.statusCode === undefined) return { kind: "network" }
  if (response.statusCode === FORBIDDEN_STATUS) return { kind: "forbidden" }
  // Only a 4xx message is meant for the user; 5xx text is raw server output.
  const isClientError = response.statusCode >= 400 && response.statusCode < 500
  return isClientError && response.platformMessage !== undefined
    ? { kind: "generic", message: response.platformMessage }
    : { kind: "generic" }
}

/** Maps an SWR read error: an `ApiResponseError` by its response, anything else as generic. */
export function mapFetchError(error: unknown): MappedError {
  return error instanceof ApiResponseError ? mapApiError(error.response) : { kind: "generic" }
}
