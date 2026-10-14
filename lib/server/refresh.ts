import "server-only"

import { randomUUID } from "node:crypto"
import { environments, type Environment } from "@/lib/shared/environments"
import { PP_DISABLED } from "./env"
import {
  ACCESS_TOKEN_SKEW_MS,
  clearSessionCookie,
  getSession,
  hasSessionCookie,
  sealSession,
  type SessionData,
} from "./session"
import { NO_STORE_HEADERS } from "./cache-headers"
import { checkCsrf } from "./csrf"
import { verifyBinding } from "./session-binding"
import { logError, logRoute } from "./log"

/**
 * =============================================================================
 * Client-coordinated token refresh — `POST /api/session/refresh` (AD-16)
 * =============================================================================
 *
 * The proxy never refreshes; it answers `401 TOKEN_EXPIRED`. `callApi` then runs
 * ONE refresh (single-flighted in the tab and across tabs via `navigator.locks`)
 * against this route. Pipeline, first match wins:
 *
 *   PP_DISABLED → 503 SERVICE_DISABLED
 *   CSRF (same-origin + X-PP-Session present) → 403 CSRF
 *   no/unsealable/aged cookie → 401 SESSION_EXPIRED (+ clear, if a cookie was sent)
 *   X-PP-Session ≠ HMAC(sid) → 409 SESSION_CHANGED
 *   not forced, token still valid beyond the skew → 200 (no IdP call, no Set-Cookie)
 *   forced (`?force=1`), refreshedAt < 10 s ago → 200 (no IdP call, no Set-Cookie)
 *   otherwise → exactly one IdP refresh-grant call:
 *     ok        → re-seal (gen+1, refreshedAt=now, same sid) → 200
 *     rejected  → clear cookie → 401 SESSION_EXPIRED
 *     otherwise → cookie unchanged → 503 REFRESH_UNAVAILABLE
 *
 * The "still valid" short-circuit is what makes a second tab — which waited on
 * the lock while the first refreshed — skip the IdP: its request already carries
 * the new cookie. No body ever carries a token; logs carry only
 * `{requestId, routeTemplate, status, durationMs}`.
 *
 * Refresh is not user activity: it never touches `lastSeen` (AD-16, Story 1.6).
 * =============================================================================
 */

const ROUTE_TEMPLATE = "/api/session/refresh"

/** IdP timeout; exceeding it → 503 `REFRESH_UNAVAILABLE`. */
const IDP_TIMEOUT_MS = 25_000

/** Fallback lifetime when the IdP omits or sends a non-positive `expires_in`. */
const FALLBACK_EXPIRES_IN_S = 300

/**
 * A forced refresh within this many ms of the session's last successful refresh
 * answers 200 without the IdP: concurrent forced refreshes across tabs collapse
 * to one, and a looping client reaches the IdP at most once per window.
 */
const FORCED_REFRESH_GUARD_MS = 10_000

/** OAuth client id used for the refresh grant (pre-Story-1.1 client refresh). */
const CLIENT_ID = "public-client"

type IdpResult =
  | { kind: "ok"; accessToken: string; refreshToken?: string; expiresIn?: number }
  | { kind: "rejected" }
  | { kind: "unavailable" }

/** The standard response headers: the no-store trio + `nosniff`. */
function baseHeaders(): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) headers.set(name, value)
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("Content-Type", "application/json")
  return headers
}

function json(status: number, body: Record<string, string>, setCookie?: string): Response {
  const headers = baseHeaders()
  if (setCookie) headers.append("Set-Cookie", setCookie)
  return new Response(JSON.stringify(body), { status, headers })
}

function errorResponse(status: number, code: string, setCookie?: string): Response {
  return json(status, { code }, setCookie)
}

/** Read `error` from a JSON body, or `undefined`. Never logged or returned. */
async function readOAuthError(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body?.error === "string" ? body.error : undefined
  } catch {
    return undefined
  }
}

/**
 * Exactly one refresh-grant call to the IdP. Network error, timeout, 3xx, 5xx,
 * any 4xx other than 401 / 400 `invalid_grant`, and a 2xx without a string
 * `access_token` are all "unavailable" (session kept).
 */
async function callIdp(environment: Environment, refreshToken: string): Promise<IdpResult> {
  // The session's own environment decides the IdP root (D2).
  const url = `${environments[environment].apiRoot}/auth/oauth2/token`
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  }).toString()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IDP_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    })
  } catch {
    // Network error, timeout/abort.
    return { kind: "unavailable" }
  } finally {
    clearTimeout(timer)
  }

  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) return { kind: "unavailable" }
  if (res.status === 401) return { kind: "rejected" }
  if (res.status === 400) {
    return (await readOAuthError(res)) === "invalid_grant" ? { kind: "rejected" } : { kind: "unavailable" }
  }
  if (res.status < 200 || res.status >= 300) return { kind: "unavailable" }

  let data: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown }
  try {
    data = (await res.json()) as typeof data
  } catch {
    return { kind: "unavailable" }
  }
  if (!data || typeof data.access_token !== "string") return { kind: "unavailable" }

  return {
    kind: "ok",
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresIn: parseExpiresIn(data.expires_in),
  }
}

/** `expires_in` as a number (a finite numeric string is accepted), else `undefined`. */
function parseExpiresIn(value: unknown): number | undefined {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/** Forced = the query param `force` is present exactly once with value `1`; anything else is ignored. */
function isForced(request: Request): boolean {
  let values: string[]
  try {
    values = new URL(request.url).searchParams.getAll("force")
  } catch {
    return false
  }
  return values.length === 1 && values[0] === "1"
}

async function run(request: Request): Promise<Response> {
  // 1. Kill switch.
  if (PP_DISABLED) return errorResponse(503, "SERVICE_DISABLED")

  // 2. CSRF: same-origin + X-PP-Session present.
  if (!checkCsrf(request, { requireBinding: true }).ok) return errorResponse(403, "CSRF")

  // 3. Session.
  const session = await getSession()
  if (!session) {
    // Aged sessions land here too (idle / absolute limit); clear a sent cookie.
    return errorResponse(401, "SESSION_EXPIRED", (await hasSessionCookie()) ? clearSessionCookie() : undefined)
  }

  // 4. Per-tab binding.
  if (!verifyBinding(request.headers.get("X-PP-Session"), session.sid)) {
    return errorResponse(409, "SESSION_CHANGED")
  }

  const now = Date.now()
  if (isForced(request)) {
    // 5a. Forced (upstream rejected a locally-valid token): skip only the
    // still-valid check, but collapse forced refreshes within the guard window
    // (another tab just refreshed; or a looping client) → no IdP call, no cookie.
    if (typeof session.refreshedAt === "number" && now - session.refreshedAt < FORCED_REFRESH_GUARD_MS) {
      return json(200, {})
    }
  } else if (session.accessTokenExpiresAt - now > ACCESS_TOKEN_SKEW_MS) {
    // 5b. Still valid (e.g. another tab already refreshed) → no IdP call, no cookie.
    return json(200, {})
  }

  // 6. Exactly one IdP call.
  const result = await callIdp(session.environment, session.refreshToken)
  if (result.kind === "rejected") return errorResponse(401, "SESSION_EXPIRED", clearSessionCookie())
  if (result.kind === "unavailable") return errorResponse(503, "REFRESH_UNAVAILABLE")

  const expiresIn =
    typeof result.expiresIn === "number" && Number.isFinite(result.expiresIn) && result.expiresIn > 0
      ? result.expiresIn
      : FALLBACK_EXPIRES_IN_S
  const refreshedAt = Date.now()
  const next: SessionData = {
    ...session,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? session.refreshToken,
    accessTokenExpiresAt: refreshedAt + expiresIn * 1000,
    gen: session.gen + 1,
    refreshedAt,
  }
  return json(200, {}, await sealSession(next))
}

/** `POST /api/session/refresh` (AD-16). Never throws; an unhandled fault → 500 `{}`. */
export async function handleRefresh(request: Request): Promise<Response> {
  const startedAt = Date.now()
  const requestId = randomUUID()
  let response: Response
  try {
    response = await run(request)
  } catch (error) {
    logError({
      requestId,
      routeTemplate: ROUTE_TEMPLATE,
      status: 500,
      errorName: error instanceof Error ? error.name : "Error",
    })
    response = json(500, {})
  }
  logRoute({ requestId, routeTemplate: ROUTE_TEMPLATE, status: response.status, durationMs: Date.now() - startedAt })
  return response
}
