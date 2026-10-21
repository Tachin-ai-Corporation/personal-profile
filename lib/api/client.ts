/**
 * `callApi` — the single browser transport (AD-19). Same-origin `/api/...`
 * only; coordinates token refresh (AD-16); never throws. No session-binding
 * header (D5). Writes to the console only through the dev-only `logApiCall` (D6).
 *
 * User activity (Story 1.6, RC6): every method except GET/HEAD/OPTIONS, and
 * any call with `userInitiated: true`, carries `X-PP-Activity: user`; any caller-supplied
 * value is removed otherwise, and the refresh POST never carries it. A valid
 * `X-PP-Activity-At` echo is handed to `activity.note`.
 *
 * Save safeguard (D-A, spec NG-9027): before a write to 1health data (any
 * method but GET/HEAD/OPTIONS under `/api/1h/` or `/api/pp/`; never the
 * session, token or Places routes) it checks the page user with
 * `checkPageUser` and sends nothing on another user, a failed check, or when
 * no `myself` was ever pinned (that one answers like a network failure, so
 * the Section offers Retry). No per-write check inside a verified batch
 * (`runSaveAll`).
 */

import { ACTIVITY_AT_HEADER, ACTIVITY_HEADER, ACTIVITY_USER, BFF_PATHS } from "@/lib/shared/bff-contract"
import { activity as defaultActivity, type Activity } from "./activity"
import { parseErrorBody } from "./errors-codes"
import { bodyForLog, logApiCall } from "./log-api-call"
import { checkPageUser, pageUser as defaultPageUser, type PageUser } from "./page-user"
import {
  browserLocks,
  createRefreshCoordinator,
  type LockManagerLike,
  type RefreshCoordinator,
  type RefreshOutcome,
} from "./refresh-coordinator"
import { sessionEvents, type SessionEvents } from "./session-events"
import type { ApiResponse } from "./types"

export interface ApiClientConfig {
  /** The session environment's portal URL, embedded by the server page (Story 1.4, D4). */
  readonly portalUrl?: string
}

let portalUrl: string | undefined

/** Registered once by `PortalUrlProvider`. */
export function configureApiClient(config: ApiClientConfig): void {
  portalUrl = config.portalUrl
}

/** The registered portal URL (for exits that run outside React, Story 7.0b). */
export function getPortalUrl(): string | undefined {
  return portalUrl
}

interface Sent<T> {
  readonly response: ApiResponse<T>
  /** The failure carried a BFF envelope (`source: "proxy"`). */
  readonly fromProxy: boolean
}

/** `callApi`'s init: a `RequestInit` plus the user-initiated flag (never passed to `fetch`). */
export type CallApiInit = RequestInit & {
  /** A read the user explicitly asked for, so it counts as activity. Writes (POST/PUT/PATCH/DELETE) always do. */
  readonly userInitiated?: boolean
}

interface SendOptions {
  readonly activity: Activity
}

/** Reads: never activity unless `userInitiated`. */
const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"])

/** Where 1health data is written (D-A): the proxy and the named ops. */
const CHECKED_WRITE_PREFIXES: readonly string[] = [BFF_PATHS.proxyPrefix, "/api/pp/"]

/** A write the page user is checked before (D-A): a non-read method to the proxy or a named op. */
function isDataWrite(method: string, path: string): boolean {
  if (READ_METHODS.has(method)) return false
  // `/api//1h/…` reaches the proxy too: compare with repeated slashes collapsed.
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/")
  return CHECKED_WRITE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/** An echo is the server's clock in epoch ms: digits only. */
const ACTIVITY_AT = /^\d{1,16}$/

/**
 * The `fetch` init: the activity header set or stripped, JSON defaults, and
 * `credentials: "same-origin"` whatever the caller passed. Throws on invalid
 * caller headers (`callApi` turns that into `NETWORK_ERROR`).
 */
function buildInit(init: RequestInit, userActivity: boolean): RequestInit {
  const headers = new Headers(init.headers)
  if (userActivity) headers.set(ACTIVITY_HEADER, ACTIVITY_USER)
  else headers.delete(ACTIVITY_HEADER)
  if (!headers.has("Accept")) headers.set("Accept", "application/json")
  if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  return { ...init, headers, credentials: "same-origin" }
}

/** Resolves dot segments the way `fetch` would; the result must still be under `/api/`. */
const GUARD_BASE = "http://pp.invalid"

/** A `.` / `..` segment, plain or percent-encoded (`%2e`, any case). */
const DOT_SEGMENT = /^(\.|%2e){1,2}$/i

function isApiPath(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/api/") || path.includes("\\")) return false
  // `/api/1h/../session/logout` would normalise to another BFF route: never send a dot segment.
  const pathname = path.split(/[?#]/, 1)[0]
  if (pathname.split("/").some((segment) => DOT_SEGMENT.test(segment))) return false
  try {
    return new URL(path, GUARD_BASE).pathname.startsWith("/api/")
  } catch {
    /* v8 ignore next -- defensive: a "/api/…" string always parses against the base; the guard must never throw */
    return false
  }
}

const networkError = <T>(context: string): Sent<T> => ({
  response: { success: false, errorCode: "NETWORK_ERROR", error: `${context} failed (network)` },
  fromProxy: false,
})

async function send<T>(context: string, path: string, init: RequestInit, options: SendOptions): Promise<Sent<T>> {
  const method = (init.method ?? "GET").toUpperCase()
  const requestBody = bodyForLog(typeof init.body === "string" ? init.body : undefined)
  const started = Date.now()
  const log = (status: number | undefined, text?: string): void =>
    logApiCall({ method, path, status, durationMs: Date.now() - started, requestBody, responseBody: bodyForLog(text) })

  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    log(undefined)
    return networkError(context)
  }

  // The server re-sealed `lastSeen`: follow what it actually recorded.
  const activityAt = response.headers.get(ACTIVITY_AT_HEADER)
  if (activityAt !== null && ACTIVITY_AT.test(activityAt)) options.activity.note(Number(activityAt))

  let text: string
  try {
    text = await response.text()
  } catch {
    // The connection dropped mid-body: same as a network failure.
    log(response.status)
    return networkError(context)
  }
  log(response.status, text)

  if (response.ok) {
    if (!text) return { response: { success: true, statusCode: response.status }, fromProxy: false }
    try {
      // The caller's type parameter is the declared contract of the endpoint.
      const data: T = JSON.parse(text)
      return { response: { success: true, data, statusCode: response.status }, fromProxy: false }
    } catch {
      return { response: { success: false, statusCode: response.status, error: `${context} returned an unreadable body` }, fromProxy: false }
    }
  }

  const parsed = parseErrorBody(text, `${context} failed (${response.status})`)
  return {
    response: {
      success: false,
      statusCode: response.status,
      error: parsed.error,
      errorCode: parsed.errorCode,
      upstreamCode: parsed.upstreamCode,
      ...(parsed.platformMessage === undefined ? {} : { platformMessage: parsed.platformMessage }),
      ...(parsed.fromProxy ? { source: "proxy" as const } : {}),
      details: parsed.details,
      ...(parsed.retryable === false ? { retryable: false } : {}),
      ...(parsed.userMessage === undefined ? {} : { userMessage: parsed.userMessage }),
    },
    fromProxy: parsed.fromProxy,
  }
}

export interface ApiClientDeps {
  readonly events?: SessionEvents
  readonly locks?: () => LockManagerLike | undefined
  readonly activity?: Activity
  /** The pinned page user (D-A); defaults to the page-lifetime `pageUser`. */
  readonly pageUser?: PageUser
}

export type CallApi = <T = unknown>(context: string, path: string, init?: CallApiInit) => Promise<ApiResponse<T>>

const SESSION_EXPIRED: ApiResponse<never> = { success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" }
const REFRESH_UNAVAILABLE: ApiResponse<never> = { success: false, statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" }

/** Cancel only this caller's wait; other requests still need the shared refresh. */
function waitForRefresh(refresh: Promise<RefreshOutcome>, signal: AbortSignal | null | undefined): Promise<RefreshOutcome | undefined> {
  if (!signal) return refresh
  if (signal.aborted) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const abort = (): void => { signal.removeEventListener("abort", abort); resolve(undefined) }
    signal.addEventListener("abort", abort, { once: true })
    void refresh.then((outcome) => {
      signal.removeEventListener("abort", abort)
      resolve(outcome)
    })
  })
}

/** Builds a `callApi` (tests inject events and locks; the app uses the default). */
export function createCallApi(deps: ApiClientDeps = {}): CallApi {
  const events = deps.events ?? sessionEvents
  const activity = deps.activity ?? defaultActivity
  const pageUser = deps.pageUser ?? defaultPageUser

  /** The refresh POST is never user activity. */
  async function runRefresh(): Promise<RefreshOutcome> {
    const { response } = await send<unknown>("session/refresh", BFF_PATHS.sessionRefresh, buildInit({ method: "POST" }, false), { activity })
    if (response.success) return { kind: "refreshed" }
    if (response.errorCode === "SESSION_EXPIRED") return { kind: "expired" }
    return { kind: "unavailable" }
  }

  const coordinator: RefreshCoordinator = createRefreshCoordinator(runRefresh, deps.locks ?? browserLocks)

  const publishFor = <T>(sent: Sent<T>): ApiResponse<T> => {
    if (sent.fromProxy && sent.response.errorCode === "SESSION_EXPIRED") events.publish("session-expired")
    return sent.response
  }

  const callApi: CallApi = async function callApi<T = unknown>(context: string, path: string, callerInit: CallApiInit = {}): Promise<ApiResponse<T>> {
    if (!isApiPath(path)) {
      return { success: false, errorCode: "BAD_PATH", error: `${context}: only same-origin /api/ paths are allowed` }
    }

    const { userInitiated, ...callerRest } = callerInit
    if (callerRest.signal?.aborted) return networkError<T>(context).response
    const method = (callerRest.method ?? "GET").toUpperCase()
    // The first send and the replay carry the same init (and activity header).
    let init: RequestInit
    try {
      init = buildInit(callerRest, userInitiated === true || !READ_METHODS.has(method))
    } catch {
      // Invalid caller headers: fail like a network error, never throw.
      return networkError<T>(context).response
    }
    // D-A: a write goes out only for the page user (fail closed); a verified batch checked once already.
    if (isDataWrite(method, path) && !pageUser.isVerified()) {
      const identityCall: CallApi = (checkContext, checkPath, checkInit) => callApi(checkContext, checkPath, { ...checkInit, signal: init.signal })
      const check = await checkPageUser(identityCall, { pageUser, events })
      if (init.signal?.aborted) return networkError<T>(context).response
      // Another user: the session-ended answer (`session-expired` already published once by the check).
      if (check.kind === "other") return SESSION_EXPIRED
      if (check.kind === "failed") {
        // This is the identity read's status, not an acknowledgement of the
        // blocked mutation. Resource wrappers accept unreadable write 2xx.
        const { statusCode, ...failure } = check.response
        return statusCode !== undefined && statusCode >= 200 && statusCode < 300 ? failure : check.response
      }
      // No `myself` ever loaded, so no page user to check against: blocked like a failed check (network error, Retry).
      if (check.kind === "unpinned") return networkError<T>(context).response
    }
    const options: SendOptions = { activity }
    const first = await send<T>(context, path, init, options)
    // Only a proxy-originated TOKEN_EXPIRED is refreshed and replayed (AD-16):
    // a non-GET is never replayed after a 5xx, timeout or network error.
    if (!(first.fromProxy && first.response.errorCode === "TOKEN_EXPIRED")) return publishFor(first)

    const outcome = await waitForRefresh(coordinator.refresh(), init.signal)
    if (!outcome || init.signal?.aborted) return networkError<T>(context).response
    if (outcome.kind === "expired") {
      events.publish("session-expired")
      return SESSION_EXPIRED
    }
    if (outcome.kind === "unavailable") return REFRESH_UNAVAILABLE

    const replay = await send<T>(context, path, init, options)
    if (replay.fromProxy && replay.response.errorCode === "TOKEN_EXPIRED") {
      events.publish("session-expired")
      return { ...replay.response, errorCode: "SESSION_EXPIRED" }
    }
    return publishFor(replay)
  }
  return callApi
}

/** The app's transport. Always import it from `@/lib/api`. */
export const callApi: CallApi = createCallApi()
