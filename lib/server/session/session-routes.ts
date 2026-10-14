import "server-only"

import { environmentConfig } from "@/lib/shared/environments"
import { serverEnv, type ServerEnv } from "@/lib/server/env"
import { jsonError, jsonOk, noContent } from "@/lib/server/http/responses"
import { logRequest, newRequestId } from "@/lib/server/log"
import { isAccessTokenFresh, refreshSession } from "./refresh"
import { REVOKE_TIMEOUT_MS, revokeAllDevices } from "./revoke"
import { buildSessionSetCookie, clearSessionSetCookie, getSession } from "./session"

export interface SessionRouteDeps {
  readonly env?: () => ServerEnv
  readonly now?: () => number
  /** Logout only: the platform revocation timeout (default 5 s, D3). */
  readonly revokeTimeoutMs?: number
}

const REFRESH_ROUTE = "/api/session/refresh"
const LOGOUT_ROUTE = "/api/session/logout"

/**
 * POST /api/session/refresh (Story 1.5, AD-16). A still-valid token answers
 * 200 without calling the IdP (another tab already refreshed). An IdP
 * rejection clears the cookie (401 `SESSION_EXPIRED`); anything else keeps it
 * (503 `REFRESH_UNAVAILABLE`). The body never carries a token. No CSRF or
 * session-binding check (D5).
 */
export function createRefreshHandler(deps: SessionRouteDeps = {}): (request: Request) => Promise<Response> {
  const getEnv = deps.env ?? serverEnv
  const now = deps.now ?? Date.now

  return async function handleRefresh(request: Request): Promise<Response> {
    const requestId = newRequestId()
    const started = now()
    const done = (response: Response): Response => {
      logRequest({ requestId, method: "POST", routeTemplate: REFRESH_ROUTE, status: response.status, durationMs: now() - started })
      return response
    }

    const env = getEnv()
    if (env.PP_DISABLED) return done(jsonError(503, "SERVICE_DISABLED"))

    const session = await getSession(request)
    if (!session) return done(jsonError(401, "SESSION_EXPIRED"))

    if (isAccessTokenFresh(session, now())) return done(jsonOk({ ok: true }))

    const result = await refreshSession(session, now())
    if (result.kind === "rejected") {
      return done(jsonError(401, "SESSION_EXPIRED", new Headers({ "Set-Cookie": clearSessionSetCookie() })))
    }
    if (result.kind === "unavailable") return done(jsonError(503, "REFRESH_UNAVAILABLE"))
    let cookie: string
    try {
      cookie = await buildSessionSetCookie(result.session)
    } catch {
      // The refreshed tokens no longer fit the cookie budget. Keeping the old
      // cookie could keep a rotated-away refresh token, so the session ends.
      return done(jsonError(401, "SESSION_EXPIRED", new Headers({ "Set-Cookie": clearSessionSetCookie() })))
    }
    return done(jsonOk({ ok: true }, new Headers({ "Set-Cookie": cookie })))
  }
}

/**
 * POST or GET /api/session/logout (Story 1.7, D3, D5). With a session, first a
 * best-effort `POST <apiRoot>/auth/user/logout/all-devices` with the session's
 * Bearer; any failure is swallowed and logged without the token. Then always
 * 204 clearing `__Host-pp_s`. No session → no upstream call.
 */
export function createLogoutHandler(deps: SessionRouteDeps = {}): (request: Request) => Promise<Response> {
  const now = deps.now ?? Date.now
  const revokeTimeoutMs = deps.revokeTimeoutMs ?? REVOKE_TIMEOUT_MS

  return async function handleLogout(request: Request): Promise<Response> {
    const requestId = newRequestId()
    const started = now()

    const session = await getSession(request)
    if (session) {
      await revokeAllDevices(environmentConfig(session.environment).apiRoot, session.accessToken, {
        requestId,
        routeTemplate: LOGOUT_ROUTE,
        timeoutMs: revokeTimeoutMs,
      })
    }

    const response = noContent(new Headers({ "Set-Cookie": clearSessionSetCookie() }))
    logRequest({ requestId, method: request.method, routeTemplate: LOGOUT_ROUTE, status: response.status, durationMs: now() - started })
    return response
  }
}
