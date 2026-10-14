import "server-only"

import { APP_ENV } from "./env"

/**
 * =============================================================================
 * PHI-free server logging (AD-15)
 * =============================================================================
 *
 * Proxy and BFF logs record ONLY the upstream path TEMPLATE (e.g.
 * `/v2/person/{personId}/ssn/expose`) — never the concrete path, the substituted
 * ids, query values, tokens, or bodies. Request/response bodies are logged only
 * when `APP_ENV=dev`, and even then tokens, SSN-shaped values and secrets are
 * redacted.
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

/**
 * Redact tokens, SSN-shaped values, and secret-ish key/values from a text body so
 * the dev body logger never emits them even in `dev`.
 */
export function redactBody(text: string): string {
  return (
    text
      // Bearer tokens.
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      // JWT-shaped values (three base64url segments).
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
      // SSN-shaped values (###-##-#### or 9 consecutive digits).
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]")
      .replace(/\b\d{9}\b/g, "[REDACTED_SSN]")
      // Token/secret/password JSON fields.
      .replace(
        /("(?:[a-z_]*(?:token|secret|password|signature)[a-z_]*)"\s*:\s*)"[^"]*"/gi,
        '$1"[REDACTED]"',
      )
  )
}

/**
 * Dev-only body logger: emits a redacted body ONLY when `APP_ENV=dev`. A no-op in
 * demo/prod, so bodies never reach logs there (AD-15).
 */
export function logBody(label: string, text: string): void {
  if (APP_ENV !== "dev") return
  console.debug(JSON.stringify({ label, body: redactBody(text) }))
}
