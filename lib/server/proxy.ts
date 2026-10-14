import "server-only"

import { randomUUID } from "node:crypto"
import type { NextRequest } from "next/server"
import { API_ORIGIN, PP_DISABLED } from "./env"
import { ACCESS_TOKEN_SKEW_MS, getSession, type SessionData } from "./session"
import { applyNoStore } from "./cache-headers"
import { checkCsrf } from "./csrf"
import { verifyBinding } from "./session-binding"
import { logProxy, logError } from "./log"
import {
  ID_SEGMENT,
  findMatch,
  isDeniedPath,
  type AllowlistEntry,
  type TemplateSegment,
} from "./proxy-allowlist"

/**
 * =============================================================================
 * The 1health BFF proxy (AD-2, AD-15, AD-17, AD-18)
 * =============================================================================
 *
 * `createProxy(allowlist)` returns the per-method route handlers for
 * `app/api/1h/[...path]`. The allowlist is injected so tests can drive fixture
 * entries. The pipeline (first reject wins; no upstream call happens on any
 * reject) is:
 *
 *   PP_DISABLED → method (override/`_method` ignored) → path-normalize (BAD_PATH)
 *   → session unseal (SESSION_EXPIRED) → denied-prefix + allowlist match
 *   (NOT_ALLOWED / 405) → owner-id + id-shape (NOT_ALLOWED) → query (BAD_QUERY)
 *   + server-fixed params → CSRF (CSRF / UNSUPPORTED_MEDIA) → session binding
 *   (SESSION_CHANGED / GET-without-binding gate) → token-expiry (TOKEN_EXPIRED)
 *   → build + assert URL → forward → map upstream → filter headers → log.
 *
 * This is NOT the root `proxy.ts` request interceptor (AD-21 headers); this is
 * the server-only BFF proxy under `lib/server/`.
 * =============================================================================
 */

/** Upstream timeout; exceeding it → 504 `UPSTREAM_TIMEOUT` (AD-2). */
const UPSTREAM_TIMEOUT_MS = 25_000

/** Request-header path marker; everything after it is the raw upstream sub-path. */
const PATH_MARKER = "/api/1h/"

/** Request headers forwarded upstream; nothing else (AD-2). */
const FORWARDED_REQUEST_HEADERS = ["Content-Type", "Content-Length", "Accept", "Accept-Language"] as const

/**
 * Response headers forwarded from upstream; nothing else (AD-2). `Content-Length`
 * is deliberately NOT forwarded: Node's `fetch` auto-decompresses gzip but leaves
 * the stale compressed `Content-Length` on the response, which would truncate the
 * streamed (decompressed) body. The streamed `Response` frames its own length.
 */
const FORWARDED_RESPONSE_HEADERS = ["Content-Type"] as const

/** A segment is rejected if it is `.`/`..` or contains any of these (AD-2). */
const FORBIDDEN_SEGMENT_CHARS = /[/\\;%@:\s\u0000-\u001f\u007f]/

/** Every proxy response carries the no-store trio + `nosniff` (AD-18, AD-13). */
function baseHeaders(requestId: string): Headers {
  const headers = new Headers()
  headers.set("X-Request-Id", requestId)
  applyNoStore(headers)
  headers.set("X-Content-Type-Options", "nosniff")
  return headers
}

/** A JSON `{ code }` error response with the standard no-store + nosniff headers. */
function errorResponse(status: number, code: string, requestId: string): Response {
  const headers = baseHeaders(requestId)
  headers.set("Content-Type", "application/json")
  return new Response(JSON.stringify({ code }), { status, headers })
}

type NormalizeResult = { ok: true; segments: string[] } | { ok: false }

/**
 * Normalize + validate the raw sub-path (AD-2). Returns the concrete (decoded)
 * path segments, or rejects (→ `BAD_PATH`). Rejects when the raw path contains
 * `//`, `%2F`, `%5C`, or `%25`, or any raw-or-decoded segment is empty, `.`, `..`,
 * or contains `/ \ ; % @ :`, whitespace, or a control character.
 */
export function normalizePath(requestUrl: string): NormalizeResult {
  const queryStart = requestUrl.indexOf("?")
  const pathPart = queryStart === -1 ? requestUrl : requestUrl.slice(0, queryStart)
  const marker = pathPart.indexOf(PATH_MARKER)
  if (marker === -1) return { ok: false }
  const rawPath = pathPart.slice(marker + PATH_MARKER.length)
  if (rawPath.length === 0) return { ok: false }

  // Raw-level traversal / double-encoding guards (case-insensitive for %-escapes).
  if (
    rawPath.includes("//") ||
    /%2f/i.test(rawPath) ||
    /%5c/i.test(rawPath) ||
    /%25/i.test(rawPath)
  ) {
    return { ok: false }
  }

  const rawSegments = rawPath.split("/")
  const segments: string[] = []
  for (const raw of rawSegments) {
    if (raw.length === 0) return { ok: false }
    let decoded: string
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      return { ok: false }
    }
    for (const candidate of [raw, decoded]) {
      if (candidate === "" || candidate === "." || candidate === "..") return { ok: false }
      if (FORBIDDEN_SEGMENT_CHARS.test(candidate)) return { ok: false }
    }
    segments.push(decoded)
  }
  return { ok: true, segments }
}

type OwnerResult = { ok: true; segments: string[] } | { ok: false }

/**
 * Validate placeholder positions against the matched template and substitute
 * owner ids from the session. Owner positions require the literal `me`; id
 * positions require `^\d{1,19}$`; anything else → `NOT_ALLOWED`.
 */
function resolveSegments(
  template: TemplateSegment[],
  pathSegments: string[],
  session: SessionData,
): OwnerResult {
  const out: string[] = []
  for (let i = 0; i < template.length; i++) {
    const seg = template[i]
    const value = pathSegments[i]
    if (seg.type === "literal") {
      out.push(seg.value)
    } else if (seg.type === "owner") {
      if (value !== "me") return { ok: false }
      out.push(String(seg.key === "personId" ? session.personId : session.userId))
    } else {
      if (!ID_SEGMENT.test(value)) return { ok: false }
      out.push(value)
    }
  }
  return { ok: true, segments: out }
}

/** Re-match the FINAL (substituted) segments against the template before fetching. */
function rematches(template: TemplateSegment[], finalSegments: string[]): boolean {
  if (template.length !== finalSegments.length) return false
  for (let i = 0; i < template.length; i++) {
    const seg = template[i]
    const value = finalSegments[i]
    if (seg.type === "literal") {
      if (seg.value !== value) return false
    } else if (!ID_SEGMENT.test(value)) {
      return false
    }
  }
  return true
}

type QueryResult = { ok: true; params: URLSearchParams } | { ok: false }

/**
 * Validate query params against the entry and apply server-fixed values (AD-2).
 * Unknown param or a client value failing its regex → `BAD_QUERY`. Server-fixed
 * params are always set by the server; any client-sent value is ignored.
 */
function resolveQuery(entry: AllowlistEntry, searchParams: URLSearchParams): QueryResult {
  const out = new URLSearchParams()
  for (const [name, value] of searchParams.entries()) {
    const rule = entry.query[name]
    if (!rule) return { ok: false }
    if (rule.kind === "client") {
      if (!rule.pattern.test(value)) return { ok: false }
      out.append(name, value)
    }
    // "server" params: client value ignored.
  }
  for (const [name, rule] of Object.entries(entry.query)) {
    if (rule.kind === "server") out.set(name, rule.value)
  }
  return { ok: true, params: out }
}

/** Build the upstream URL from final segments; never `new URL(input, base)` (AD-2). */
function buildUpstreamUrl(finalSegments: string[], params: URLSearchParams): string {
  const path = finalSegments.map(encodeURIComponent).join("/")
  const qs = params.toString()
  return `${API_ORIGIN}/api/${path}${qs ? `?${qs}` : ""}`
}

type ForwardResult =
  | { kind: "ok"; response: Response }
  | { kind: "timeout" }
  | { kind: "neterror" }

/** Forward upstream with a filtered header set, 25 s timeout, no-store + manual redirect. */
async function forward(
  request: Request,
  method: string,
  url: string,
  accessToken: string,
  requestId: string,
  forwardBody: boolean,
): Promise<ForwardResult> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, UPSTREAM_TIMEOUT_MS)

  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  headers.set("Authorization", `Bearer ${accessToken}`)
  headers.set("X-Request-Id", requestId)

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    cache: "no-store",
    redirect: "manual",
    signal: controller.signal,
  }
  // Stream the request body (never buffered) only when the entry declares one.
  if (forwardBody && method !== "GET" && request.body) {
    init.body = request.body
    init.duplex = "half"
  }

  try {
    const response = await fetch(url, init)
    return { kind: "ok", response }
  } catch {
    return timedOut ? { kind: "timeout" } : { kind: "neterror" }
  } finally {
    clearTimeout(timer)
  }
}

/** Map an upstream outcome to the client response (AD-2). */
function mapUpstream(result: ForwardResult, requestId: string): Response {
  if (result.kind === "timeout") return errorResponse(504, "UPSTREAM_TIMEOUT", requestId)
  if (result.kind === "neterror") return errorResponse(502, "UPSTREAM_ERROR", requestId)

  const upstream = result.response
  if (upstream.type === "opaqueredirect" || (upstream.status >= 300 && upstream.status < 400)) {
    return errorResponse(502, "UPSTREAM_REDIRECT", requestId)
  }
  if (upstream.status === 401) return errorResponse(401, "TOKEN_EXPIRED", requestId)
  if (upstream.status >= 500) return errorResponse(502, "UPSTREAM_ERROR", requestId)

  // 2xx and 4xx (≠401): pass through status + body (streamed) with filtered headers.
  const headers = baseHeaders(requestId)
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return new Response(upstream.body, { status: upstream.status, headers })
}

/** Run the full pipeline for one request + concrete method. */
async function handle(request: NextRequest, method: string, allowlist: readonly AllowlistEntry[]): Promise<Response> {
  const startedAt = Date.now()
  const requestId = randomUUID()
  let template = "-"

  const finish = (response: Response): Response => {
    logProxy({ requestId, method, template, status: response.status, durationMs: Date.now() - startedAt })
    return response
  }

  try {
    // 1. Kill switch.
    if (PP_DISABLED) return finish(errorResponse(503, "SERVICE_DISABLED", requestId))

    // 2. Path normalization.
    const norm = normalizePath(request.url)
    if (!norm.ok) return finish(errorResponse(400, "BAD_PATH", requestId))
    const pathSegments = norm.segments

    // 3. Session.
    const session = await getSession()
    if (!session) return finish(errorResponse(401, "SESSION_EXPIRED", requestId))

    // 4. Denied prefixes + allowlist match.
    if (isDeniedPath(pathSegments)) return finish(errorResponse(403, "NOT_ALLOWED", requestId))
    const match = findMatch(allowlist, method, pathSegments)
    if (match.kind === "none") return finish(errorResponse(403, "NOT_ALLOWED", requestId))
    if (match.kind === "wrong-method") return finish(errorResponse(405, "METHOD_NOT_ALLOWED", requestId))
    const { entry, segments } = match
    template = entry.template

    // 5. Owner-id substitution + id shape.
    const resolved = resolveSegments(segments, pathSegments, session)
    if (!resolved.ok) return finish(errorResponse(403, "NOT_ALLOWED", requestId))
    const finalSegments = resolved.segments

    // 6. Query allowlist + server-fixed params.
    const query = resolveQuery(entry, new URL(request.url).searchParams)
    if (!query.ok) return finish(errorResponse(400, "BAD_QUERY", requestId))

    // 7. CSRF (non-GET) + JSON content-type.
    if (method !== "GET") {
      const csrf = checkCsrf(request, { requireBinding: true })
      if (!csrf.ok) return finish(errorResponse(403, "CSRF", requestId))
      if (entry.body === "json") {
        const contentType = request.headers.get("Content-Type") ?? ""
        if (!contentType.toLowerCase().startsWith("application/json")) {
          return finish(errorResponse(415, "UNSUPPORTED_MEDIA", requestId))
        }
      }
    }

    // 8. Session binding + GET-without-binding gate.
    const binding = request.headers.get("X-PP-Session")
    if (binding) {
      if (!verifyBinding(binding, session.sid)) {
        return finish(errorResponse(409, "SESSION_CHANGED", requestId))
      }
    } else if (!(method === "GET" && entry.asImage)) {
      // Non-GET without the header was already rejected by CSRF; this is the
      // GET-without-binding gate: allowed only on asImage entries.
      return finish(errorResponse(403, "CSRF", requestId))
    }

    // 9. Token expiry (no refresh here; AD-16 owns refresh).
    // `<=`: the refresh route treats a token as valid only when `> skew`, so both agree at the boundary.
    if (session.accessTokenExpiresAt - Date.now() <= ACCESS_TOKEN_SKEW_MS) {
      return finish(errorResponse(401, "TOKEN_EXPIRED", requestId))
    }

    // 10. Build + assert the upstream URL.
    const upstreamUrl = buildUpstreamUrl(finalSegments, query.params)
    if (new URL(upstreamUrl).origin !== API_ORIGIN) throw new Error("UpstreamOriginAssertion")
    if (!rematches(segments, finalSegments)) throw new Error("UpstreamTemplateAssertion")

    // 11. Forward + map.
    const result = await forward(request, method, upstreamUrl, session.accessToken, requestId, entry.body === "json")
    return finish(mapUpstream(result, requestId))
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "Error"
    logError({ requestId, routeTemplate: template, status: 500, errorName })
    return errorResponse(500, "INTERNAL", requestId)
  }
}

/**
 * A disallowed method (`HEAD`/`OPTIONS`/`TRACE`) answered explicitly → 405 (AD-2).
 * The kill switch still takes precedence: every proxy request → 503 when disabled.
 */
function methodNotAllowed(method: string): Response {
  const requestId = randomUUID()
  if (PP_DISABLED) {
    logProxy({ requestId, method, template: "-", status: 503, durationMs: 0 })
    return errorResponse(503, "SERVICE_DISABLED", requestId)
  }
  logProxy({ requestId, method, template: "-", status: 405, durationMs: 0 })
  return errorResponse(405, "METHOD_NOT_ALLOWED", requestId)
}

export interface ProxyHandlers {
  GET: (request: NextRequest) => Promise<Response>
  POST: (request: NextRequest) => Promise<Response>
  PUT: (request: NextRequest) => Promise<Response>
  PATCH: (request: NextRequest) => Promise<Response>
  DELETE: (request: NextRequest) => Promise<Response>
  HEAD: (request: NextRequest) => Promise<Response>
  OPTIONS: (request: NextRequest) => Promise<Response>
  TRACE: (request: NextRequest) => Promise<Response>
}

/**
 * Build the proxy route handlers over an injectable allowlist (AD-2). The real
 * `ALLOWLIST` is wired in `app/api/1h/[...path]/route.ts`; tests inject fixtures.
 * `HEAD`/`OPTIONS`/`TRACE` answer 405 explicitly so Next does not auto-implement
 * them, and `X-HTTP-Method-Override` / `_method` are never honored (the method is
 * taken only from the handler and `_method` is just an unknown query param).
 */
export function createProxy(allowlist: readonly AllowlistEntry[]): ProxyHandlers {
  return {
    GET: (request) => handle(request, "GET", allowlist),
    POST: (request) => handle(request, "POST", allowlist),
    PUT: (request) => handle(request, "PUT", allowlist),
    PATCH: (request) => handle(request, "PATCH", allowlist),
    DELETE: (request) => handle(request, "DELETE", allowlist),
    HEAD: async () => methodNotAllowed("HEAD"),
    OPTIONS: async () => methodNotAllowed("OPTIONS"),
    TRACE: async () => methodNotAllowed("TRACE"),
  }
}
