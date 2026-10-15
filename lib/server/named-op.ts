import "server-only"

import type { z } from "zod"
import type { BffErrorCode } from "@/lib/shared/bff-contract"
import { environmentConfig } from "@/lib/shared/environments"
import { serverEnv, type ServerEnv } from "@/lib/server/env"
import { withNoStore } from "@/lib/server/http/cache-headers"
import { isJsonRequest } from "@/lib/server/http/content-type"
import { discardBody, fetchWithTimeout } from "@/lib/server/http/fetch-with-timeout"
import { readCapped, readStreamCapped } from "@/lib/server/http/read-capped"
import { jsonError, jsonResponse } from "@/lib/server/http/responses"
import { buildUpstreamUrl } from "@/lib/server/http/upstream-url"
import { isSwitchedOff, type KillSwitch } from "@/lib/server/kill-switch"
import { logError, logRequest, newRequestId } from "@/lib/server/log"
import { validateQuery } from "@/lib/server/proxy/match"
import type { QueryParamRule } from "@/lib/server/proxy/types"
import { isAccessTokenFresh } from "@/lib/server/session/refresh"
import { getSession } from "@/lib/server/session/session"
import { sessionExpiredResponse } from "@/lib/server/session/session-routes"
import type { SessionPayload } from "@/lib/server/session/types"

/**
 * The named-operation wrapper (AD-2, F2) for `/api/pp/**` and `/api/places/**`:
 * session-scoped server work the allowlisted proxy cannot express. Named ops
 * never go through the proxy allowlist or deny list; each one is a fixed
 * server-side program whose upstream ids come only from the session.
 *
 * Fixed order: kill switch → method → session → query → params → JSON body
 * → token freshness (1health upstream only) → `handle(ctx)`. Every response
 * is no-store + nosniff, one request id is used for the upstream call and the
 * one template-only log line, and an error thrown by `handle` is a PHI-free
 * 500. There is no CSRF or session-binding check (D5).
 */

/** Default JSON body cap of a named operation. */
export const NAMED_OP_MAX_BODY_BYTES = 16 * 1024
/** Upstream JSON answers larger than this are an upstream error (nothing is buffered past it). */
export const UPSTREAM_JSON_MAX_BYTES = 2 * 1024 * 1024

export type NamedOpMethod = "GET" | "POST" | "DELETE"
export type RouteParams = Readonly<Record<string, string | string[] | undefined>>

/** The Next route-handler context (`params` is a promise in Next 16). */
export interface RouteContextLike {
  readonly params?: Promise<RouteParams>
}

export interface NamedOpFailure {
  readonly status: number
  readonly errorCode: BffErrorCode
}

export interface UpstreamJsonRequest {
  readonly method: NamedOpMethod
  /** Path segments relative to the upstream `/api` (each encoded on its own). */
  readonly segments: readonly string[]
  readonly query?: URLSearchParams
  /** JSON-serialised as the request body. */
  readonly body?: unknown
}

export type UpstreamJsonResult =
  /** 2xx with a JSON (or empty → `null`) body. */
  | { readonly kind: "ok"; readonly status: number; readonly data: unknown }
  /** 4xx other than 401: the route decides to relay or mask it. */
  | { readonly kind: "client-error"; readonly status: number; readonly data: unknown }
  /** Mapped already: 401 `TOKEN_EXPIRED`, 502 `UPSTREAM_REDIRECT`/`UPSTREAM_ERROR`, 504 `UPSTREAM_TIMEOUT`. */
  | { readonly kind: "failed"; readonly failure: NamedOpFailure }

export interface UpstreamClient {
  /** One 1health call with the session's Bearer and the request id, via the proxy's URL builder and timeouts. */
  json(request: UpstreamJsonRequest): Promise<UpstreamJsonResult>
}

export interface NamedOpContext<B, P> {
  readonly request: Request
  readonly requestId: string
  readonly session: SessionPayload
  readonly env: ServerEnv
  readonly now: number
  /** The validated client query (empty unless the op declares `query` rules). */
  readonly query: URLSearchParams
  readonly params: P
  readonly body: B
  readonly upstream: UpstreamClient
  /** Records a PHI-free reason code (e.g. `google_timeout`) on this request's log line. */
  readonly setOutcome: (code: string) => void
}

export interface NamedOpConfig<B, P> {
  /** Route template for the log line and the error wrapper, e.g. `/api/pp/org-logo/[tenantId]`. */
  readonly route: string
  readonly killSwitch: KillSwitch
  readonly method: NamedOpMethod
  /** `"1health"` checks the access token's freshness before `handle` (401 `TOKEN_EXPIRED`). */
  readonly upstream: "1health" | "external"
  /** Allowed client query params; by default none (any → 400 `BAD_QUERY`). */
  readonly query?: Readonly<Record<string, QueryParamRule>>
  /** Validates the route params; `null` → `failures.badParams`. */
  readonly params?: (raw: RouteParams) => P | null
  /** JSON body schema (POST only): non-JSON → 415, unparsable or invalid → 400 `BAD_BODY`. */
  readonly body?: z.ZodType<B>
  readonly maxBodyBytes?: number
  /** Overrides for routes that answer every failure the same way (org logos: 404 `NO_LOGO`). */
  readonly failures?: { readonly badParams?: NamedOpFailure; readonly tokenExpired?: NamedOpFailure }
  readonly handle: (ctx: NamedOpContext<B, P>) => Promise<Response>
}

export interface NamedOpDeps {
  readonly env?: () => ServerEnv
  readonly now?: () => number
}

const BAD_PARAMS: NamedOpFailure = { status: 400, errorCode: "BAD_PATH" }
const TOKEN_EXPIRED: NamedOpFailure = { status: 401, errorCode: "TOKEN_EXPIRED" }

export function failureResponse(failure: NamedOpFailure): Response {
  return jsonError(failure.status, failure.errorCode)
}

/**
 * Relays an upstream 4xx in the upstream envelope (`{ message?, code? }` only,
 * never other fields, never `source`), so `lib/api/errors` derives its code
 * (e.g. 403 → `FORBIDDEN`, AD-19).
 */
export function relayClientError(status: number, data: unknown): Response {
  const body: Record<string, unknown> = {}
  if (data !== null && typeof data === "object") {
    const { message, code } = data as Record<string, unknown>
    if (typeof message === "string") body.message = message
    if (typeof code === "number" || typeof code === "string") body.code = code
  }
  return jsonResponse(status, body)
}

function parseJson(bytes: Uint8Array): { readonly ok: true; readonly data: unknown } | { readonly ok: false } {
  const text = new TextDecoder().decode(bytes)
  if (text.trim() === "") return { ok: true, data: null }
  try {
    return { ok: true, data: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

const UPSTREAM_ERROR: UpstreamJsonResult = { kind: "failed", failure: { status: 502, errorCode: "UPSTREAM_ERROR" } }
const UPSTREAM_TIMEOUT: UpstreamJsonResult = { kind: "failed", failure: { status: 504, errorCode: "UPSTREAM_TIMEOUT" } }

function createUpstreamClient(session: SessionPayload, requestId: string): UpstreamClient {
  return {
    async json(input) {
      const url = buildUpstreamUrl(environmentConfig(session.environment).apiRoot, input.segments, input.query)
      /* v8 ignore next -- defensive: named ops pass fixed literal segments and numeric ids */
      if (!url) throw new Error("Named op built an unsafe upstream URL")

      const headers = new Headers({ Accept: "application/json", Authorization: `Bearer ${session.accessToken}`, "X-Request-Id": requestId })
      let body: string | undefined
      if (input.body !== undefined) {
        headers.set("Content-Type", "application/json")
        body = JSON.stringify(input.body)
      }
      const outcome = await fetchWithTimeout(url, { method: input.method, headers, body })
      if (outcome.kind === "timeout") return UPSTREAM_TIMEOUT
      if (outcome.kind === "network") return UPSTREAM_ERROR

      const response = outcome.response
      if (response.status === 401) {
        discardBody(response)
        return { kind: "failed", failure: TOKEN_EXPIRED }
      }
      if (response.status >= 300 && response.status < 400) {
        discardBody(response)
        return { kind: "failed", failure: { status: 502, errorCode: "UPSTREAM_REDIRECT" } }
      }
      if (response.status >= 500) {
        discardBody(response)
        return UPSTREAM_ERROR
      }

      const read = await readStreamCapped(response.body, UPSTREAM_JSON_MAX_BYTES)
      if (read.kind === "timeout") return UPSTREAM_TIMEOUT
      if (read.kind !== "ok") return UPSTREAM_ERROR
      const parsed = parseJson(read.bytes)
      if (response.status >= 400) return { kind: "client-error", status: response.status, data: parsed.ok ? parsed.data : null }
      return parsed.ok ? { kind: "ok", status: response.status, data: parsed.data } : UPSTREAM_ERROR
    },
  }
}

type BodyResult<B> = { readonly ok: true; readonly body: B } | { readonly ok: false; readonly failure: NamedOpFailure }

async function readJsonBody<B>(request: Request, schema: z.ZodType<B>, maxBytes: number): Promise<BodyResult<B>> {
  if (!isJsonRequest(request)) return { ok: false, failure: { status: 415, errorCode: "UNSUPPORTED_MEDIA" } }
  const read = await readCapped(request, maxBytes)
  if (!read.ok) return { ok: false, failure: { status: read.status, errorCode: read.errorCode } }
  const parsed = parseJson(read.bytes)
  if (!parsed.ok) return { ok: false, failure: { status: 400, errorCode: "BAD_BODY" } }
  const result = schema.safeParse(parsed.data)
  return result.success ? { ok: true, body: result.data } : { ok: false, failure: { status: 400, errorCode: "BAD_BODY" } }
}

/** Overwrites caching headers and adds nosniff on whatever `handle` returned (AD-18). */
function finalize(response: Response): Response {
  const headers = withNoStore(new Headers(response.headers))
  headers.set("X-Content-Type-Options", "nosniff")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/**
 * Builds the route handler of one named operation. Export it for the
 * operation's method and for every other method (they answer 405 after the
 * kill switch), so Next never auto-implements HEAD or OPTIONS.
 */
export function createNamedOp<B = undefined, P = undefined>(
  config: NamedOpConfig<B, P>,
  deps: NamedOpDeps = {},
): (request: Request, context?: RouteContextLike) => Promise<Response> {
  const getEnv = deps.env ?? serverEnv
  const clock = deps.now ?? Date.now
  const badParams = config.failures?.badParams ?? BAD_PARAMS
  const tokenExpired = config.failures?.tokenExpired ?? TOKEN_EXPIRED

  return async function handleNamedOp(request: Request, context?: RouteContextLike): Promise<Response> {
    const requestId = newRequestId()
    const started = clock()
    let outcome: string | undefined
    const setOutcome = (code: string): void => {
      outcome = code
    }
    const done = (response: Response): Response => {
      const final = finalize(response)
      logRequest({ requestId, method: request.method, routeTemplate: config.route, status: final.status, durationMs: clock() - started, outcome })
      return final
    }
    const fail = (failure: NamedOpFailure): Response => done(failureResponse(failure))

    try {
      const env = getEnv()
      if (isSwitchedOff(config.killSwitch, env)) return fail({ status: 503, errorCode: "SERVICE_DISABLED" })
      if (request.method !== config.method) return fail({ status: 405, errorCode: "METHOD_NOT_ALLOWED" })

      const session = await getSession(request, clock())
      if (!session) return done(sessionExpiredResponse(request))

      const query = validateQuery(config.query, {}, new URL(request.url).searchParams)
      if (!query) return fail({ status: 400, errorCode: "BAD_QUERY" })

      let params = undefined as P
      if (config.params) {
        const parsed = config.params((await context?.params) ?? {})
        if (parsed === null) return fail(badParams)
        params = parsed
      }

      let body = undefined as B
      if (config.body) {
        const read = await readJsonBody(request, config.body, config.maxBodyBytes ?? NAMED_OP_MAX_BODY_BYTES)
        if (!read.ok) return fail(read.failure)
        body = read.body
      }

      const now = clock()
      if (config.upstream === "1health" && !isAccessTokenFresh(session, now)) return fail(tokenExpired)

      const upstream = createUpstreamClient(session, requestId)
      return done(await config.handle({ request, requestId, session, env, now, query, params, body, upstream, setOutcome }))
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError"
      logError({ requestId, routeTemplate: config.route, status: 500, errorName })
      return done(jsonError(500, "INTERNAL_ERROR"))
    }
  }
}
