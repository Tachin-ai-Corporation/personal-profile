import "server-only"

import { z } from "zod"
import { environmentConfig } from "@/lib/shared/environments"
import { discardBody, fetchWithTimeout, UPSTREAM_TIMEOUT_MS } from "@/lib/server/http/fetch-with-timeout"
import { EXPIRY_SKEW_MS, expiresInSchema } from "./expires-in"
import type { SessionPayload } from "./types"

export { EXPIRY_SKEW_MS, FALLBACK_EXPIRES_IN_S } from "./expires-in"

export function isAccessTokenFresh(session: SessionPayload, now: number): boolean {
  return session.accessExpiresAt - now > EXPIRY_SKEW_MS
}

/**
 * Activity re-seal race guard (Story 1.6): the token must outlive skew +
 * upstream timeout (55 s). No normal refresh (in any tab) can then rotate the
 * tokens while this request is in flight, so its late `Set-Cookie` never
 * writes back pre-rotation tokens.
 */
export const ACTIVITY_RESEAL_MIN_MS = EXPIRY_SKEW_MS + UPSTREAM_TIMEOUT_MS

export function canRenewLastSeen(session: SessionPayload, now: number): boolean {
  return session.accessExpiresAt - now > ACTIVITY_RESEAL_MIN_MS
}

/**
 * A usable access token is never dropped for a bad `expires_in` (fallback),
 * and a rotated `refresh_token` is always kept.
 */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: expiresInSchema,
  refresh_token: z.string().min(1).optional(),
})

/** Decision (c), 2026-10-14: only these IdP answers end the session. */
async function isTerminalRejection(response: Response): Promise<boolean> {
  if (response.status === 401) {
    discardBody(response)
    return true
  }
  if (response.status !== 400) {
    discardBody(response)
    return false
  }
  try {
    const body: unknown = await response.json()
    return typeof body === "object" && body !== null && "error" in body && body.error === "invalid_grant"
  } catch {
    return false
  }
}

export type RefreshResult =
  | { readonly kind: "refreshed"; readonly session: SessionPayload }
  /** The IdP answered 401 or 400 `invalid_grant`: the session is over. */
  | { readonly kind: "rejected" }
  /** Network error, timeout, 5xx, 3xx, 403, any other 400 or an unreadable 2xx answer: keep the session. */
  | { readonly kind: "unavailable" }

/**
 * One refresh-token grant against `<apiRoot>/auth/oauth2/token` (ported from
 * the template's `lib/auth-client.ts`). Returns the re-stamped session with
 * `gen + 1` and the same `sid`.
 */
export async function refreshSession(session: SessionPayload, now: number): Promise<RefreshResult> {
  const url = `${environmentConfig(session.environment).apiRoot}/auth/oauth2/token`
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
    client_id: "public-client",
  })
  const outcome = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  })
  if (outcome.kind !== "response") return { kind: "unavailable" }

  const { response } = outcome
  if (!response.ok) return (await isTerminalRejection(response)) ? { kind: "rejected" } : { kind: "unavailable" }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { kind: "unavailable" }
  }
  const parsed = tokenResponseSchema.safeParse(json)
  if (!parsed.success) return { kind: "unavailable" }

  return {
    kind: "refreshed",
    session: {
      ...session,
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token ?? session.refreshToken,
      accessExpiresAt: now + Math.floor(parsed.data.expires_in * 1000),
      gen: session.gen + 1,
    },
  }
}
