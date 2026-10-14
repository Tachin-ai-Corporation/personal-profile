/**
 * =============================================================================
 * callApi — the single browser transport (AD-19)
 * =============================================================================
 *
 * The browser talks ONLY to this app's own origin, and only through `callApi`
 * (bare `fetch` is lint-banned elsewhere). Every call:
 *   - must target a same-origin `/api/...` path (anything else → `BAD_PATH`,
 *     no network call);
 *   - is sent with `credentials: "same-origin"` and the page-embedded
 *     `X-PP-Session` binding (AD-17) — no other module sets that header;
 *   - resolves an `ApiResponse<T>` and NEVER throws or rejects;
 *   - parses an error body once into `errorCode` / `details`;
 *   - publishes `session-expired` / `session-changed` on
 *     `lib/api/session-events.ts` (once per page lifetime).
 *
 * Token refresh (Story 1.5) and error-message mapping (Story 1.12) are not here
 * yet. Response bodies are never logged — only `context` + status.
 * =============================================================================
 */

import { publish } from "./session-events"

/** Standard result envelope returned by every API module function. */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  /** Generic, non-PHI description of the failure (never the response body). */
  error?: string
  /** Proxy code (e.g. `UPSTREAM_ERROR`) or backend code (e.g. `INVALID_ENUM_VALUE`). */
  errorCode?: string
  /** The error body's `details`, when present. */
  details?: unknown
  /** HTTP status of the underlying call, when there was one. */
  statusCode?: number
}

/** An `Error` carrying a failed `ApiResponse`, thrown by the SWR fetcher only. */
export class ApiError extends Error {
  readonly response: ApiResponse<unknown>
  readonly errorCode?: string
  readonly statusCode?: number
  readonly details?: unknown

  constructor(response: ApiResponse<unknown>) {
    super(response.error ?? "Request failed")
    this.name = "ApiError"
    this.response = response
    this.errorCode = response.errorCode
    this.statusCode = response.statusCode
    this.details = response.details
  }
}

// ---------------------------------------------------------------------------
// Page-level configuration (registered by features/shell/client-config.tsx)
// ---------------------------------------------------------------------------

let sessionBinding: string | undefined
let portalUrl: string | undefined

/**
 * Register the page-embedded session binding and portal URL. Called
 * synchronously during render by `ClientConfig`, before any child can call
 * `callApi`. Idempotent.
 */
export function configureClient(config: { sessionBinding?: string; portalUrl?: string }): void {
  sessionBinding = config.sessionBinding || undefined
  portalUrl = config.portalUrl || undefined
}

/** The constant "Return to 1health" target registered by the page (AD-5). */
export function getPortalUrl(): string | undefined {
  return portalUrl
}

// ---------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------

/** Build a success envelope. */
export function ok<T>(data: T, statusCode?: number): ApiResponse<T> {
  return { success: true, data, statusCode }
}

/**
 * Build an error envelope and log it with a `"<module>/<fn>"` context tag.
 * Only the context and the error's message are logged, never a response body.
 */
export function err(error: unknown, context: string, statusCode?: number, errorCode?: string): ApiResponse<never> {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[pp API] ${context}:`, errorCode ?? statusCode ?? message)
  return { success: false, error: message, errorCode, statusCode }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const SESSION_HEADER = "X-PP-Session"

const GUARD_BASE = "http://pp.invalid"

/**
 * True only for a same-origin path that still lies under `/api/` after URL
 * normalization (so `/api/../launch` and `/api/%2e%2e/x` are rejected).
 */
function isApiPath(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/api/")) return false
  try {
    const url = new URL(path, GUARD_BASE)
    return url.origin === GUARD_BASE && url.pathname.startsWith("/api/")
  } catch {
    return false
  }
}

/** Extract `{ errorCode, details }` from an already-read error body. */
function parseErrorBody(text: string): { errorCode?: string; details?: unknown } {
  if (!text) return {}
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return {}
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return {}
  const obj = body as Record<string, unknown>
  // Only a STRING code becomes errorCode; a numeric `code` is ignored.
  const errorCode =
    typeof obj.code === "string" ? obj.code : typeof obj.errorCode === "string" ? obj.errorCode : undefined
  return "details" in obj ? { errorCode, details: obj.details } : { errorCode }
}

/**
 * The canonical JSON call to a same-origin `/api/...` path.
 *
 * @example
 * const res = await callApi<Myself>("user/fetchMyself", "/api/1h/v2/user/myself")
 * if (res.success) use(res.data)
 */
export async function callApi<T = unknown>(
  context: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  if (!isApiPath(path)) {
    return err(new Error(`${context}: path must be a same-origin /api/ path`), context, undefined, "BAD_PATH")
  }

  let response: Response
  try {
    const headers = new Headers(init.headers)
    headers.delete(SESSION_HEADER)
    if (sessionBinding) headers.set(SESSION_HEADER, sessionBinding)
    if (!headers.has("Accept")) headers.set("Accept", "application/json")
    response = await fetch(path, { ...init, headers, credentials: "same-origin" })
  } catch (error) {
    return err(error, context, undefined, "NETWORK_ERROR")
  }

  const statusCode = response.status
  let text: string
  try {
    text = await response.text()
  } catch (error) {
    return err(error, context, statusCode, "NETWORK_ERROR")
  }

  if (!response.ok) {
    const { errorCode, details } = parseErrorBody(text)
    console.error(`[pp API] ${context}:`, statusCode, errorCode ?? "")

    if (statusCode === 401 && errorCode === "SESSION_EXPIRED") publish("session-expired")
    else if (statusCode === 409 && errorCode === "SESSION_CHANGED") publish("session-changed")

    const res: ApiResponse<T> = { success: false, error: `${context} failed (${statusCode})`, errorCode, statusCode }
    if (details !== undefined) res.details = details
    return res
  }

  // Success may carry JSON, a bare string, or nothing at all.
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { success: true, data: data as T, statusCode }
}
