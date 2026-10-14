import "server-only"

/**
 * =============================================================================
 * PHI-free server logging (AD-15)
 * =============================================================================
 *
 * Proxy and BFF logs record ONLY the upstream path TEMPLATE (e.g.
 * `/v2/person/{personId}/ssn/expose`) — never the concrete path, the substituted
 * ids, query values, tokens, or bodies. Server logs NEVER contain request or
 * response bodies, in any environment and also under local `next dev` (D6).
 * =============================================================================
 */

/** One proxied request's structured log line — the only fields allowed (AD-15). */
export interface ProxyLogFields {
  requestId: string
  method: string
  /** The upstream path TEMPLATE, never the concrete path or substituted ids. */
  template: string
  status: number
  durationMs: number
}

/** Log a proxied request. Carries only method/template/status/duration/request-id. */
export function logProxy(fields: ProxyLogFields): void {
  console.info(
    JSON.stringify({
      requestId: fields.requestId,
      method: fields.method,
      template: fields.template,
      status: fields.status,
      durationMs: fields.durationMs,
    }),
  )
}

/** One BFF route request's structured log line (non-proxy routes, e.g. `/api/session/refresh`). */
export interface RouteLogFields {
  requestId: string
  /** The route TEMPLATE, e.g. `/api/session/refresh`. */
  routeTemplate: string
  status: number
  durationMs: number
}

/** Log a BFF route request. Carries only request-id/route/status/duration — never tokens or bodies (AD-15). */
export function logRoute(fields: RouteLogFields): void {
  console.info(
    JSON.stringify({
      requestId: fields.requestId,
      routeTemplate: fields.routeTemplate,
      status: fields.status,
      durationMs: fields.durationMs,
    }),
  )
}

/** An unhandled-error log line — never carries upstream data (AD-15). */
export interface ErrorLogFields {
  requestId: string
  routeTemplate: string
  status: number
  errorName: string
}

/** Log an unhandled error. Carries only request-id/route/status/error-name. */
export function logError(fields: ErrorLogFields): void {
  console.error(
    JSON.stringify({
      requestId: fields.requestId,
      routeTemplate: fields.routeTemplate,
      status: fields.status,
      errorName: fields.errorName,
    }),
  )
}

/** The `/api/token` launch log line (Story 1.2): never `lpl`, code, tokens, ids or upstream text. */
export interface LaunchLogFields {
  requestId: string
  /** `OK` or the `errorCode` answered. */
  outcome: string
  /** The detected environment, once known. */
  environment?: string
  durationMs: number
}

/** Log one launch outcome. Carries only request-id/route/outcome/environment/duration. */
export function logLaunch(fields: LaunchLogFields): void {
  const line: Record<string, unknown> = {
    requestId: fields.requestId,
    routeTemplate: "/api/token",
    outcome: fields.outcome,
  }
  if (fields.environment) line.environment = fields.environment
  line.durationMs = fields.durationMs
  console.info(JSON.stringify(line))
}
