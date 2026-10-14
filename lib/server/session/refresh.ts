import "server-only"

import { z } from "zod"
import { environmentConfig } from "@/lib/shared/environments"
import { discardBody, fetchWithTimeout } from "@/lib/server/http/fetch-with-timeout"
import type { SessionPayload } from "./types"

/** AD-2/AD-16: an access token this close to expiry counts as expired. */
export const EXPIRY_SKEW_MS = 30_000

export function isAccessTokenFresh(session: SessionPayload, now: number): boolean {
  return session.accessExpiresAt - now > EXPIRY_SKEW_MS
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
})

export type RefreshResult =
  | { readonly kind: "refreshed"; readonly session: SessionPayload }
  /** The IdP answered 4xx (e.g. 401, `invalid_grant`, 403): the session is over. */
  | { readonly kind: "rejected" }
  /** Network error, timeout, 5xx, 3xx or an unreadable 2xx answer: keep the session. */
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
  if (!response.ok) {
    discardBody(response)
    // Any 4xx means the refresh token can no longer be used; retrying would loop forever.
    return response.status >= 400 && response.status < 500 ? { kind: "rejected" } : { kind: "unavailable" }
  }

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
