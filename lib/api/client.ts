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
 * On `401 TOKEN_EXPIRED` it runs one refresh (single-flighted in the tab and
 * across tabs via `navigator.locks`) and replays the call; if the replay is
 * `TOKEN_EXPIRED` again it forces one refresh and replays a last time (AD-16,
 * Story 1.5).
 *
 * User activity (Story 1.6): every non-GET, and a GET flagged
 * `userInitiated: true`, carries `X-PP-Activity: user` (a caller-supplied value
 * is removed otherwise; the refresh POST never carries it). A response echoing
 * `X-PP-Activity-At` is handed to `noteActivity`.
 *
 * Error-message mapping (Story 1.12) is not here yet. Response bodies are
 * never logged — only `context` + status.
 * =============================================================================
 */

import { publish } from "./session-events"
import { noteActivity } from "./activity"

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

const ACTIVITY_HEADER = "X-PP-Activity"
const ACTIVITY_AT_HEADER = "X-PP-Activity-At"

/** `callApi`'s init: a `RequestInit` plus the user-initiated flag (stripped before `fetch`). */
export type CallApiInit = RequestInit & { userInitiated?: boolean }

const GUARD_BASE = "http://pp.invalid"

/**
 * True only for a same-origin path that still lies under `/api/` after URL
 * normalization (so `/api/../auth` and `/api/%2e%2e/x` are rejected).
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
  if ("details" in obj) return { errorCode, details: obj.details }
  // A BFF body's user-safe `message` and `retryable` flag (e.g. `/api/token`, D9)
  // are kept in `details`; an upstream body's message is not.
  if (obj.source === "proxy" && ("message" in obj || "retryable" in obj)) {
    const details: { message?: unknown; retryable?: unknown } = {}
    if ("message" in obj) details.message = obj.message
    if ("retryable" in obj) details.retryable = obj.retryable
    return { errorCode, details }
  }
  return { errorCode }
}

/** Send one request and parse the result. Never throws; publishes nothing. */
async function send<T>(context: string, path: string, init: RequestInit): Promise<ApiResponse<T>> {
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

  // The server re-sealed `lastSeen`: follow what it actually recorded.
  const activityAt = response.headers.get(ACTIVITY_AT_HEADER)
  if (activityAt !== null && /^\d{1,16}$/.test(activityAt.trim())) noteActivity(Number(activityAt.trim()))

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

/**
 * The single place session events are published (AD-19). `publish` itself is
 * once-per-page-lifetime, so a replayed or refresh-derived `SESSION_EXPIRED` /
 * `SESSION_CHANGED` still reaches subscribers at most once.
 */
function signal<T>(res: ApiResponse<T>): ApiResponse<T> {
  if (!res.success) {
    if (res.statusCode === 401 && res.errorCode === "SESSION_EXPIRED") publish("session-expired")
    else if (res.statusCode === 409 && res.errorCode === "SESSION_CHANGED") publish("session-changed")
  }
  return res
}

function isTokenExpired(res: ApiResponse<unknown>): boolean {
  return !res.success && res.statusCode === 401 && res.errorCode === "TOKEN_EXPIRED"
}

// ---------------------------------------------------------------------------
// Token refresh (AD-16)
// ---------------------------------------------------------------------------

const REFRESH_PATH = "/api/session/refresh"
const FORCED_REFRESH_PATH = "/api/session/refresh?force=1"
const REFRESH_LOCK = "pp-refresh"

type RefreshResult = ApiResponse<never> | { success: true }

/**
 * The in-tab single flights: one shared promise per kind (normal / forced),
 * each cleared when it settles.
 */
const inflight: { normal: Promise<RefreshResult> | null; forced: Promise<RefreshResult> | null } = {
  normal: null,
  forced: null,
}

/** One `POST /api/session/refresh[?force=1]`. Goes through `send`, never `callApi`, so it has no refresh handling of its own. */
async function postRefresh(forced: boolean): Promise<RefreshResult> {
  const res = await send<never>("session/refresh", forced ? FORCED_REFRESH_PATH : REFRESH_PATH, { method: "POST" })
  return res.success ? { success: true } : res
}

/** Run the refresh under the cross-tab `navigator.locks` mutex when available. */
async function runRefresh(forced: boolean): Promise<RefreshResult> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined
  if (locks && typeof locks.request === "function") {
    let ran = false
    let result: RefreshResult | undefined
    try {
      return await locks.request(REFRESH_LOCK, async () => {
        ran = true
        result = await postRefresh(forced)
        return result
      })
    } catch (error) {
      // The lock itself failed (postRefresh never rejects): refresh unlocked,
      // or keep the result of a refresh that already ran under the lock.
      if (!ran) return postRefresh(forced)
      if (result) return result
      return err(error, "session/refresh", undefined, "NETWORK_ERROR")
    }
  }
  return postRefresh(forced)
}

/**
 * Single-flighted refresh: every caller that hits `TOKEN_EXPIRED` while a
 * refresh of the same kind is in flight in this tab awaits the same promise.
 * Across tabs, the lock serializes refreshes; the second tab's request then
 * carries the first tab's new cookie and the route answers 200 without calling
 * the IdP (normal: the token is valid; forced: the 10 s `refreshedAt` guard).
 */
function refreshSession(forced = false): Promise<RefreshResult> {
  const slot = forced ? "forced" : "normal"
  let pending = inflight[slot]
  if (!pending) {
    pending = runRefresh(forced).finally(() => {
      inflight[slot] = null
    })
    inflight[slot] = pending
  }
  return pending
}

/** A per-caller copy of a refresh failure (the `error` text uses the caller's context). */
function refreshFailure<T>(context: string, refreshed: ApiResponse<never>): ApiResponse<T> {
  return {
    success: false,
    error: `${context} failed (session refresh ${refreshed.statusCode ?? refreshed.errorCode ?? "error"})`,
    errorCode: refreshed.errorCode,
    statusCode: refreshed.statusCode,
  }
}

/**
 * Normalize the caller's init: strip `userInitiated` and set `X-PP-Activity:
 * user` on every non-GET and on user-initiated GETs, removing it otherwise.
 * The same prepared init is used for the first send and every replay.
 */
function prepareInit(init: CallApiInit): RequestInit {
  const { userInitiated, ...rest } = init
  const headers = new Headers(rest.headers)
  const method = (rest.method ?? "GET").toUpperCase()
  if (method !== "GET" || userInitiated === true) headers.set(ACTIVITY_HEADER, "user")
  else headers.delete(ACTIVITY_HEADER)
  return { ...rest, headers }
}

/**
 * The canonical JSON call to a same-origin `/api/...` path.
 *
 * On `401 TOKEN_EXPIRED` it awaits one shared refresh, then replays the
 * original request (AD-16). If that replay is `TOKEN_EXPIRED` again (the
 * upstream rejected a locally-valid token), it runs one forced refresh and
 * replays a second and last time; a second `TOKEN_EXPIRED` becomes
 * `SESSION_EXPIRED`. A call is therefore replayed at most twice.
 *
 * @example
 * const res = await callApi<Myself>("user/fetchMyself", "/api/1h/v2/user/myself")
 * if (res.success) use(res.data)
 */
export async function callApi<T = unknown>(
  context: string,
  path: string,
  callerInit: CallApiInit = {},
): Promise<ApiResponse<T>> {
  if (!isApiPath(path)) {
    return err(new Error(`${context}: path must be a same-origin /api/ path`), context, undefined, "BAD_PATH")
  }
  let init: RequestInit
  try {
    init = prepareInit(callerInit)
  } catch (error) {
    // Invalid caller headers: fail like `send` does, never throw.
    return err(error, context, undefined, "NETWORK_ERROR")
  }

  const first = await send<T>(context, path, init)
  if (!isTokenExpired(first)) return signal(first)

  const refreshed = await refreshSession()
  if (!refreshed.success) return signal(refreshFailure<T>(context, refreshed))

  const replay = await send<T>(context, path, init)
  if (!isTokenExpired(replay)) return signal(replay)

  // The upstream still rejects the token: force one refresh, replay once more.
  const forced = await refreshSession(true)
  if (!forced.success) return signal(refreshFailure<T>(context, forced))

  const lastReplay = await send<T>(context, path, init)
  if (isTokenExpired(lastReplay)) {
    return signal<T>({
      success: false,
      error: `${context} failed (401)`,
      errorCode: "SESSION_EXPIRED",
      statusCode: 401,
    })
  }
  return signal(lastReplay)
}
