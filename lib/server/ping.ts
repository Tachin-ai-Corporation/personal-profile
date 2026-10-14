import "server-only"

import { randomUUID } from "node:crypto"
import { PP_DISABLED } from "./env"
import { clearSessionCookie, getSession, hasSessionCookie, sealSession } from "./session"
import { NO_STORE_HEADERS } from "./cache-headers"
import { checkCsrf } from "./csrf"
import { verifyBinding } from "./session-binding"
import { logError, logRoute } from "./log"

/**
 * =============================================================================
 * Activity ping — `POST /api/session/ping` (AD-16, Story 1.6)
 * =============================================================================
 *
 * The idle warning's "Stay signed in" calls this route. It records user activity
 * by re-sealing the session with `lastSeen = now` and nothing else. Pipeline,
 * first match wins:
 *
 *   PP_DISABLED → 503 SERVICE_DISABLED
 *   CSRF (same-origin + X-PP-Session present) → 403 CSRF
 *   no/unsealable/aged cookie → 401 SESSION_EXPIRED (+ clear, if a cookie was sent)
 *   X-PP-Session ≠ HMAC(sid) → 409 SESSION_CHANGED
 *   otherwise → re-seal lastSeen = now → 204 + `X-PP-Activity-At: <lastSeen>`
 *
 * The access token's expiry is irrelevant here: no upstream call is made, so the
 * read-to-write window is milliseconds. Logs carry only
 * `{requestId, routeTemplate, status, durationMs}`.
 * =============================================================================
 */

const ROUTE_TEMPLATE = "/api/session/ping"

/** The standard response headers: the no-store trio + `nosniff`. */
function baseHeaders(): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) headers.set(name, value)
  headers.set("X-Content-Type-Options", "nosniff")
  return headers
}

function json(status: number, body: Record<string, string>, setCookie?: string): Response {
  const headers = baseHeaders()
  headers.set("Content-Type", "application/json")
  if (setCookie) headers.append("Set-Cookie", setCookie)
  return new Response(JSON.stringify(body), { status, headers })
}

function errorResponse(status: number, code: string, setCookie?: string): Response {
  return json(status, { code }, setCookie)
}

async function run(request: Request): Promise<Response> {
  // 1. Kill switch.
  if (PP_DISABLED) return errorResponse(503, "SERVICE_DISABLED")

  // 2. CSRF: same-origin + X-PP-Session present.
  if (!checkCsrf(request, { requireBinding: true }).ok) return errorResponse(403, "CSRF")

  // 3. Session (aged → null).
  const session = await getSession()
  if (!session) {
    return errorResponse(401, "SESSION_EXPIRED", (await hasSessionCookie()) ? clearSessionCookie() : undefined)
  }

  // 4. Per-tab binding.
  if (!verifyBinding(request.headers.get("X-PP-Session"), session.sid)) {
    return errorResponse(409, "SESSION_CHANGED")
  }

  // 5. Record activity.
  const lastSeen = Date.now()
  const headers = baseHeaders()
  headers.append("Set-Cookie", await sealSession({ ...session, lastSeen }))
  headers.set("X-PP-Activity-At", String(lastSeen))
  return new Response(null, { status: 204, headers })
}

/** `POST /api/session/ping`. Never throws; an unhandled fault → 500 `{}`. */
export async function handlePing(request: Request): Promise<Response> {
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
