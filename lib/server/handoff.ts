import "server-only"

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { environmentConfig, type Environment } from "@/lib/shared/environments"
import { serverEnv, type ServerEnv } from "@/lib/server/env"
import { jsonError, seeOther } from "@/lib/server/http/responses"
import { isSwitchedOff } from "@/lib/server/kill-switch"
import { logRequest, newRequestId } from "@/lib/server/log"
import { ENVIRONMENT_COOKIE, parseEnvironmentCookie } from "@/lib/server/session/environment-cookie"
import { readCookie, SESSION_COOKIE, unsealSession } from "@/lib/server/session/session"

export type TenantHandoffShape = "root" | "ctx"

/** OQ1 is unresolved: retain the approved portal-root fallback (R-A). */
export const TENANT_HANDOFF_SHAPE: TenantHandoffShape = "root"

/** D4: read-only environment resolution; an aged, still unsealable session counts. */
export async function resolveHandoffEnvironment(
  request: Request,
  configured: readonly Environment[] = serverEnv().configuredEnvironments,
): Promise<Environment> {
  const cookies = request.headers.get("cookie")
  let session = null
  try {
    session = await unsealSession(readCookie(cookies, SESSION_COOKIE))
  } catch {
    // An unreadable seal cannot determine the destination; use remembered environment.
  }
  return session?.environment ?? parseEnvironmentCookie(readCookie(cookies, ENVIRONMENT_COOKIE), configured) ?? "prod"
}

function isTenantId(value: string): boolean {
  return /^\d{1,19}$/.test(value) && /[1-9]/.test(value)
}

/** Only server configuration chooses the shape; no request input controls it. */
export function buildTenantPortalUrl(environment: Environment, tenantId: string, shape: TenantHandoffShape = TENANT_HANDOFF_SHAPE): string {
  const portal = environmentConfig(environment).portalUrl
  if (!isTenantId(tenantId) || shape === "root") return portal
  const target = new URL(portal)
  target.searchParams.set("ctx", tenantId)
  return target.toString()
}

function handoffDestination(url: URL, environment: Environment): string {
  const portal = environmentConfig(environment).portalUrl
  const destinations = url.searchParams.getAll("to")
  if (destinations.length !== 1) return portal
  if (destinations[0] === "create-org") return new URL("/organizations/create", portal).toString()
  if (destinations[0] !== "tenant" || url.searchParams.getAll("tenantId").length !== 1) return portal
  // URLSearchParams alone accepts percent-encoded digits. The contract requires
  // the literal ASCII value too; decoded cardinality catches encoded duplicate keys.
  const tenantId = /(?:^|&)tenantId=(\d{1,19})(?:&|$)/.exec(url.search.slice(1))?.[1]
  return tenantId === undefined ? portal : buildTenantPortalUrl(environment, tenantId)
}

export interface HandoffDeps {
  readonly env?: () => ServerEnv
  readonly now?: () => number
}

/** AD-22: no session requirement, upstream work, cookie writes or query logging. */
export function createHandoffHandler(deps: HandoffDeps = {}): (request: Request) => Promise<Response> {
  const getEnv = deps.env ?? serverEnv
  const now = deps.now ?? Date.now
  return async function handleHandoff(request: Request): Promise<Response> {
    const requestId = newRequestId()
    const started = now()
    const env = getEnv()
    let response: Response
    if (isSwitchedOff("account", env)) {
      response = jsonError(503, "SERVICE_DISABLED")
    } else if (request.method !== "GET") {
      response = jsonError(405, "METHOD_NOT_ALLOWED")
    } else {
      const environment = await resolveHandoffEnvironment(request, env.configuredEnvironments)
      response = seeOther(handoffDestination(new URL(request.url), environment))
    }
    logRequest({ requestId, method: request.method, routeTemplate: BFF_PATHS.handoffPortal, status: response.status, durationMs: now() - started })
    return response
  }
}
