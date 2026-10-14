import "server-only"

import { discardBody, fetchWithTimeout } from "@/lib/server/http/fetch-with-timeout"
import { logError } from "@/lib/server/log"

/** D3: platform revocation is best effort and must not hold a response up for long. */
export const REVOKE_TIMEOUT_MS = 5_000

export interface RevokeContext {
  readonly requestId: string
  readonly routeTemplate: string
  readonly timeoutMs?: number
}

/**
 * Best-effort `POST <apiRoot>/auth/user/logout/all-devices` with the given
 * access token (D3, A11): no-store, 5 s timeout. Never throws; a failure, 401
 * or timeout is logged as `{ requestId, routeTemplate, status | errorName }`,
 * never with the token.
 */
export async function revokeAllDevices(apiRoot: string, accessToken: string, context: RevokeContext): Promise<void> {
  const outcome = await fetchWithTimeout(
    `${apiRoot}/auth/user/logout/all-devices`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    context.timeoutMs ?? REVOKE_TIMEOUT_MS,
  )
  const { requestId, routeTemplate } = context
  if (outcome.kind !== "response") {
    logError({ requestId, routeTemplate, errorName: outcome.kind === "timeout" ? "RevokeTimeout" : "RevokeNetworkError" })
    return
  }
  discardBody(outcome.response)
  if (!outcome.response.ok) logError({ requestId, routeTemplate, status: outcome.response.status })
}
