import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { sealData, unsealData } from "iron-session"
import { SESSION_SECRET, SESSION_SECRET_PREVIOUS } from "./env"

/**
 * =============================================================================
 * Sealed session cookie (AD-1)
 * =============================================================================
 *
 * All session state lives in ONE AEAD-sealed cookie, `__Host-pp_s`. Tokens never
 * reach the browser as readable values and no response body carries a token.
 *
 * Cookie attributes are exactly: `HttpOnly; Secure; SameSite=None; Partitioned;
 * Path=/` — no `Domain`, no `Max-Age`, no `Expires` (a session cookie). The
 * `__Host-` prefix pins it to this host with `Secure` + `Path=/` + no `Domain`.
 *
 * Rotation (AD-20): the highest-id password seals; all are accepted for unseal.
 * `SESSION_SECRET` is id `2`; `SESSION_SECRET_PREVIOUS`, when set, is id `1`.
 * =============================================================================
 */

/** The single session cookie name. */
export const SESSION_COOKIE_NAME = "__Host-pp_s"

/**
 * Treat the access token as expired this many ms before its real expiry. Shared
 * by the proxy (→ `TOKEN_EXPIRED`) and the refresh route (→ refresh only when
 * within the skew), so both agree on "expired" (AD-2, AD-16).
 */
export const ACCESS_TOKEN_SKEW_MS = 30_000

/** The exact attribute string appended to the sealed cookie (AD-1). */
const COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=None; Partitioned; Path=/"

/** Everything the session holds. The environment and API origin are never stored. */
export interface SessionData {
  accessToken: string
  refreshToken: string
  /** Access-token expiry as epoch milliseconds. */
  accessTokenExpiresAt: number
  userId: number
  personId: number
  tenantId: number
  /** Random per-launch session id (≥ 128 bits). */
  sid: string
  /** Refresh generation; `0` at launch (AD-16 increments it). */
  gen: number
  /** Launch time (epoch ms). */
  iat: number
  /** Last-seen time (epoch ms). */
  lastSeen: number
  /**
   * Time of the last successful refresh (epoch ms). Absent until the first
   * refresh; launch leaves it unset. Guards forced refreshes (AD-16).
   */
  refreshedAt?: number
}

/**
 * The iron-session password map. The highest numeric id seals; every entry is
 * accepted for unseal, so a cookie sealed under the previous secret still opens
 * during a rotation overlap and is rejected once the previous var is removed.
 */
function passwords(): Record<string, string> {
  const map: Record<string, string> = { "2": SESSION_SECRET }
  if (SESSION_SECRET_PREVIOUS) {
    map["1"] = SESSION_SECRET_PREVIOUS
  }
  return map
}

/** `ttl: 0` — the seal never self-expires; lifetime is the browser session + the embedded token expiry. */
const SEAL_OPTS = { ttl: 0 } as const

/** Seal the session and return the full `Set-Cookie` header string. */
export async function sealSession(data: SessionData): Promise<string> {
  const sealed = await sealData(data, { password: passwords(), ...SEAL_OPTS })
  return `${SESSION_COOKIE_NAME}=${sealed}; ${COOKIE_ATTRIBUTES}`
}

/** A `Set-Cookie` string that clears the session cookie (clear-first on launch, AD-4). */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`
}

/**
 * Unseal a raw cookie value into `SessionData`, or `null` when it is absent,
 * tampered, or sealed under a no-longer-accepted password. A cookie that fails
 * to unseal is treated as no session (AD-1).
 */
export async function unsealSession(raw: string | undefined): Promise<SessionData | null> {
  if (!raw) return null
  try {
    const data = await unsealData<SessionData>(raw, { password: passwords(), ...SEAL_OPTS })
    // An empty object comes back when unseal silently fails; require a sid.
    if (!data || typeof data.sid !== "string" || data.sid.length === 0) return null
    return data
  } catch {
    return null
  }
}

/** Read and unseal the current request's session cookie, or `null`. */
export async function getSession(): Promise<SessionData | null> {
  const store = await cookies()
  return unsealSession(store.get(SESSION_COOKIE_NAME)?.value)
}

/**
 * Require a valid session; redirect to the session-expired launch-error screen
 * when there is none. There is no login page (AD-4).
 */
export async function requireSession(): Promise<SessionData> {
  const session = await getSession()
  if (!session) {
    redirect("/launch-error?reason=expired")
  }
  return session
}
