/**
 * The wire contract between the browser (`lib/api`) and the BFF (`lib/server`,
 * `app/api`). Both sides import these names so they can never drift.
 */

import type { Environment } from "./environments"

/** Every error the BFF itself produces (never an upstream error). No CSRF or session-change codes (D5). */
export const BFF_ERROR_CODES = [
  "BAD_PATH",
  "BAD_QUERY",
  "BAD_BODY",
  "NOT_ALLOWED",
  "METHOD_NOT_ALLOWED",
  "TOO_LARGE",
  "UNSUPPORTED_MEDIA",
  "TOKEN_EXPIRED",
  "SESSION_EXPIRED",
  "UPSTREAM_REDIRECT",
  "UPSTREAM_ERROR",
  "UPSTREAM_TIMEOUT",
  "REFRESH_UNAVAILABLE",
  "SERVICE_DISABLED",
  "INTERNAL_ERROR",
  "LAUNCH_INVALID",
  "LAUNCH_EXPIRED",
  "LAUNCH_USED",
  "LAUNCH_CONFIG",
  "WRONG_TENANT",
  /** Organization logo route (Story 10.2): any failure → 404. */
  "NO_LOGO",
  /** Practice support route (Story 9.3): no practice NPI organization → 404. */
  "NO_PRACTICE",
] as const

export type BffErrorCode = (typeof BFF_ERROR_CODES)[number]

/** Marks a BFF-originated error body, so it is never confused with an upstream one. */
export const BFF_ERROR_SOURCE = "proxy"

export interface BffErrorBody {
  readonly errorCode: BffErrorCode
  readonly source: typeof BFF_ERROR_SOURCE
}

export function isBffErrorCode(value: unknown): value is BffErrorCode {
  return typeof value === "string" && (BFF_ERROR_CODES as readonly string[]).includes(value)
}

/** Same-origin paths of the BFF. */
export const BFF_PATHS = {
  proxyPrefix: "/api/1h/",
  token: "/api/token",
  sessionRefresh: "/api/session/refresh",
  sessionLogout: "/api/session/logout",
  sessionPing: "/api/session/ping",
} as const

/**
 * User activity (AD-16, RC6). `callApi` sends `X-PP-Activity: user` on
 * user-initiated calls; a response that re-sealed `lastSeen` echoes it as
 * `X-PP-Activity-At: <epoch ms>`.
 */
export const ACTIVITY_HEADER = "X-PP-Activity"
export const ACTIVITY_USER = "user"
export const ACTIVITY_AT_HEADER = "X-PP-Activity-At"

/** What a page embeds for the idle warning (Story 1.6). Times are epoch ms, server time. */
export interface PageIdleTiming {
  /** The server idle limit in seconds (900). */
  readonly idleTimeoutSec: number
  /** The session's `lastSeen` when the page rendered. */
  readonly lastSeen: number
  /** `iat + ABSOLUTE_TIMEOUT_MS`. */
  readonly absoluteExpiresAt: number
  /** The server's clock when the page rendered. */
  readonly serverNow: number
}

/** `POST /api/token` success: the session cookie is set. Nothing else is in the body (D2). */
export interface LaunchOkBody {
  readonly ok: true
  readonly environment: Environment
}

/** `POST /api/token` failure (D9): a user-safe `message`, never upstream text. */
export interface LaunchErrorBody extends BffErrorBody {
  readonly ok: false
  readonly message: string
  /** `false` stops the client's retries at once. Absent = retryable. */
  readonly retryable?: false
}
