import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { sealData, unsealData } from "iron-session"
import { isEnvironment, type Environment } from "@/lib/shared/environments"
import { SESSION_SECRET, SESSION_SECRET_PREVIOUS } from "./env"

/**
 * =============================================================================
 * Sealed session cookie (AD-1)
 * =============================================================================
 *
 * All session state lives in ONE AEAD-sealed cookie, `__Host-pp_s`. Tokens never
 * reach the browser as readable values and no response body carries a token.
 *
 * Cookie attributes are exactly: `HttpOnly; Secure; SameSite=Lax; Path=/` — no
 * `Domain`, no `Max-Age`, no `Expires` (a session cookie). The app is never
 * framed (D10), so the cookie is first-party only. The `__Host-` prefix pins it
 * to this host with `Secure` + `Path=/` + no `Domain`.
 *
 * The session holds the 1health `environment` its launch payload was sealed for
 * (D2). Every upstream origin derives from it through `lib/shared/environments.ts`;
 * the API root itself is never stored. A cookie without a valid `environment`
 * (e.g. sealed before D1) counts as no session.
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

/** Upstream timeout for proxied 1health calls; exceeding it → 504 `UPSTREAM_TIMEOUT` (AD-2). */
export const UPSTREAM_TIMEOUT_MS = 25_000

/** Idle limit: no user-initiated request for longer than this ends the session (AD-16). */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000

/** Absolute limit: a session never outlives this much time after launch (AD-16). */
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000

/** The exact attribute string appended to the sealed cookie (AD-1). */
const COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Lax; Path=/"

/** Everything the session holds. The API origin and `id_token` are never stored. */
export interface SessionData {
  accessToken: string
  refreshToken: string
  /** Access-token expiry as epoch milliseconds. */
  accessTokenExpiresAt: number
  /** The 1health environment whose key decrypted the launch payload (D2). */
  environment: Environment
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
    // A seal without a valid environment has no known upstream root (D2).
    if (!isEnvironment(data.environment)) return null
    return data
  } catch {
    return null
  }
}

/**
 * True when the session has been idle for longer than `IDLE_TIMEOUT_MS` or has
 * lived longer than `ABSOLUTE_TIMEOUT_MS` since launch (both strictly greater).
 * A missing or non-numeric `iat`/`lastSeen` counts as aged.
 */
export function isSessionAged(session: Pick<SessionData, "iat" | "lastSeen">, now: number): boolean {
  const { iat, lastSeen } = session
  if (typeof iat !== "number" || !Number.isFinite(iat)) return true
  if (typeof lastSeen !== "number" || !Number.isFinite(lastSeen)) return true
  return now - lastSeen > IDLE_TIMEOUT_MS || now - iat > ABSOLUTE_TIMEOUT_MS
}

/**
 * Read and unseal the current request's session cookie, or `null`. An aged
 * session (idle or absolute limit passed) is `null` exactly like a missing or
 * unsealable cookie, so every caller treats it as no session (AD-16).
 */
export async function getSession(): Promise<SessionData | null> {
  const store = await cookies()
  const session = await unsealSession(store.get(SESSION_COOKIE_NAME)?.value)
  if (!session || isSessionAged(session, Date.now())) return null
  return session
}

/**
 * Whether the current request carried a session cookie at all (valid or not).
 * Routes answering `SESSION_EXPIRED` clear the cookie only when one was sent.
 */
export async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies()
  return Boolean(store.get(SESSION_COOKIE_NAME)?.value)
}

/**
 * Require a valid session; redirect to `/auth` (no query) when there is none.
 * There is no login form (D1).
 */
export async function requireSession(): Promise<SessionData> {
  const session = await getSession()
  if (!session) {
    redirect("/auth")
  }
  return session
}
