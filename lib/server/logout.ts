import "server-only"

import { randomUUID } from "node:crypto"
import { cookies } from "next/headers"
import { after } from "next/server"
import { environments, type Environment } from "@/lib/shared/environments"
import { PP_DISABLED } from "./env"
import { clearSessionCookie, SESSION_COOKIE_NAME, unsealSession } from "./session"
import { NO_STORE_HEADERS } from "./cache-headers"
import { checkCsrf } from "./csrf"
import { verifyBinding } from "./session-binding"
import { logError, logRoute } from "./log"

/**
 * =============================================================================
 * Logout — `POST /api/session/logout` (AD-16, Story 1.7)
 * =============================================================================
 *
 * The app-bar "Return to 1health" (via `returnToPortal()`) calls this route
 * before navigating to the portal. Pipeline, first match wins:
 *
 *   CSRF (same-origin + X-PP-Session present) → 403 CSRF, cookie untouched
 *   cookie unseals AND X-PP-Session ≠ HMAC(sid) → 204, no Set-Cookie, no revoke
 *     (a stale tab never signs out the account now in this browser)
 *   otherwise → 204 + clear cookie (whether or not a session existed)
 *
 * The raw cookie is unsealed WITHOUT the idle/absolute age check, so an aged
 * session's still-valid access token is revoked too.
 *
 * Revoke runs AFTER the response (`after()`), only when a session unsealed, its
 * access token has not expired, `PP_DISABLED` is off and `REVOKE_PATH` is set:
 * `POST <apiRoot><REVOKE_PATH>` (the session environment's root) with the Bearer
 * access token, aborted at 5 s.
 * The 204 goes out first, so a client navigating away after its 3 s wait can
 * never lose the cookie-clearing `Set-Cookie`. Any revoke failure is swallowed
 * and logged with only `{requestId, routeTemplate, status, errorName}`.
 *
 * `/auth/user/logout` invalidates the access token only; the refresh token lived
 * only inside the sealed cookie that was just cleared.
 *
 * Logs carry only `{requestId, routeTemplate, status, durationMs}` (AD-15).
 * =============================================================================
 */

const ROUTE_TEMPLATE = "/api/session/logout"

/** The auth server's access-token logout (`TokenController` `POST /user/logout`). `null` = no revoke. */
export const REVOKE_PATH: string | null = "/auth/user/logout"

/** Revoke timeout. */
export const REVOKE_TIMEOUT_MS = 5_000

/** The standard response headers: the no-store trio + `nosniff`. */
function baseHeaders(): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) headers.set(name, value)
  headers.set("X-Content-Type-Options", "nosniff")
  return headers
}

function json(status: number, body: Record<string, string>): Response {
  const headers = baseHeaders()
  headers.set("Content-Type", "application/json")
  return new Response(JSON.stringify(body), { status, headers })
}

function noContent(setCookie?: string): Response {
  const headers = baseHeaders()
  if (setCookie) headers.append("Set-Cookie", setCookie)
  return new Response(null, { status: 204, headers })
}

/** Best-effort upstream revoke of the access token. Never throws; logs only the error name. */
async function revoke(
  environment: Environment,
  accessToken: string,
  revokePath: string,
  requestId: string,
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REVOKE_TIMEOUT_MS)
  try {
    const res = await fetch(`${environments[environment].apiRoot}${revokePath}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    })
    // The body is never read or logged.
    try {
      await res.body?.cancel()
    } catch {
      // ignore
    }
    if (res.type === "opaqueredirect" || res.status < 200 || res.status >= 300) {
      logError({ requestId, routeTemplate: ROUTE_TEMPLATE, status: res.status, errorName: "RevokeFailed" })
    }
  } catch (error) {
    logError({
      requestId,
      routeTemplate: ROUTE_TEMPLATE,
      status: 0,
      errorName: error instanceof Error ? error.name : "Error",
    })
  } finally {
    clearTimeout(timer)
  }
}

async function run(request: Request, revokePath: string | null, requestId: string): Promise<Response> {
  // 1. CSRF: same-origin + X-PP-Session present. The cookie is left untouched.
  if (!checkCsrf(request, { requireBinding: true }).ok) return json(403, { code: "CSRF" })

  // 2. The raw cookie, ignoring idle/absolute age.
  const store = await cookies()
  const session = await unsealSession(store.get(SESSION_COOKIE_NAME)?.value)

  // 3. A stale tab (binding for another sid) never signs out the current account.
  if (session && !verifyBinding(request.headers.get("X-PP-Session"), session.sid)) {
    return noContent()
  }

  // 4. Revoke after the response, only for a live token.
  if (session && session.accessTokenExpiresAt > Date.now() && !PP_DISABLED && revokePath !== null) {
    const { accessToken, environment } = session
    after(() => revoke(environment, accessToken, revokePath, requestId))
  }

  // 5. Clear the cookie whether or not a session existed.
  return noContent(clearSessionCookie())
}

/**
 * `POST /api/session/logout`. Never throws; an unhandled fault → 500 `{}`.
 *
 * @param revokePath the revoke endpoint; defaults to `REVOKE_PATH` (tests pass `null`).
 */
export async function handleLogout(request: Request, revokePath: string | null = REVOKE_PATH): Promise<Response> {
  const startedAt = Date.now()
  const requestId = randomUUID()
  let response: Response
  try {
    response = await run(request, revokePath, requestId)
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
