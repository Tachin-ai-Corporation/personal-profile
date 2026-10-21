import "server-only"

import { BFF_PATHS, type BffErrorCode } from "@/lib/shared/bff-contract"
import { environmentConfig } from "@/lib/shared/environments"
import { serverEnv, type ServerEnv } from "@/lib/server/env"
import { jsonError } from "@/lib/server/http/responses"
import { isJsonRequest } from "@/lib/server/http/content-type"
import { readCapped } from "@/lib/server/http/read-capped"
import { buildUpstreamUrl } from "@/lib/server/http/upstream-url"
import { logRequest, newRequestId } from "@/lib/server/log"
import { isAccessTokenFresh } from "@/lib/server/session/refresh"
import { getSession } from "@/lib/server/session/session"
import { sessionExpiredResponse } from "@/lib/server/session/session-routes"
import { recordSessionActivity } from "@/lib/server/session/activity"
import { ALLOWLIST } from "./allowlist"
import { DENY_RULES, isDenied } from "./deny-list"
import { forward } from "./forward"
import { buildUpstreamQuery, logTemplate, matchEntry, upstreamSegments } from "./match"
import { normalizeProxyPath } from "./normalize"
import { PROXY_METHODS, type AllowlistEntry, type DenyRule, type ProxyMethod } from "./types"
import { readUpload } from "./upload"

/** Default request-body cap for JSON entries. */
const DEFAULT_MAX_BYTES = 64 * 1024
const UNMATCHED = "(unmatched)"

export interface ProxyHandlerDeps {
  readonly allowlist?: readonly AllowlistEntry[]
  readonly denyRules?: readonly DenyRule[]
  readonly env?: () => ServerEnv
  readonly now?: () => number
}

type BodyResult =
  | { readonly ok: true; readonly body: string | FormData | undefined }
  | { readonly ok: false; readonly status: number; readonly errorCode: BffErrorCode }

function isProxyMethod(method: string): method is ProxyMethod {
  return (PROXY_METHODS as readonly string[]).includes(method)
}

/**
 * Validates the request body against the entry. Bodies are read only for
 * non-GET entries, always through the byte-capped reader; upload entries
 * through the multipart validator (AD-13).
 */
async function readEntryBody(request: Request, method: ProxyMethod, entry: AllowlistEntry): Promise<BodyResult> {
  if (method === "GET") return { ok: true, body: undefined }
  if (entry.upload) {
    const upload = await readUpload(request, entry.upload, entry.maxBytes)
    return upload.ok ? { ok: true, body: upload.form } : upload
  }

  const read = await readCapped(request, entry.maxBytes ?? DEFAULT_MAX_BYTES)
  if (!read.ok) return read
  const text = new TextDecoder().decode(read.bytes)

  if (!entry.body) {
    return text === "" ? { ok: true, body: undefined } : { ok: false, status: 400, errorCode: "BAD_BODY" }
  }
  if (!isJsonRequest(request)) return { ok: false, status: 415, errorCode: "UNSUPPORTED_MEDIA" }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, status: 400, errorCode: "BAD_BODY" }
  }
  const parsed = entry.body.safeParse(json)
  return parsed.success ? { ok: true, body: JSON.stringify(parsed.data) } : { ok: false, status: 400, errorCode: "BAD_BODY" }
}

/**
 * Story 1.3 proxy, built by a factory so tests can inject fixture allowlists.
 * Order: kill switch → method → path → deny → allowlist → Profile switch →
 * session → query → body (415/413/400, uploads per AD-13) → token expiry →
 * owner substitution → deny re-check on the upstream segments → upstream
 * (image entries sniffed) → activity re-seal. There is no CSRF or session-binding check (D5); bodies are never
 * logged (D6). `X-PP-Activity` is never forwarded upstream.
 */
export function createProxyHandler(deps: ProxyHandlerDeps = {}): (request: Request) => Promise<Response> {
  const allowlist = deps.allowlist ?? ALLOWLIST
  const denyRules = deps.denyRules ?? DENY_RULES
  const getEnv = deps.env ?? serverEnv
  const now = deps.now ?? Date.now

  return async function handleProxy(request: Request): Promise<Response> {
    const requestId = newRequestId()
    const started = now()
    let template = UNMATCHED
    const done = (response: Response): Response => {
      logRequest({ requestId, method: request.method, routeTemplate: template, status: response.status, durationMs: now() - started })
      return response
    }
    const fail = (status: number, errorCode: BffErrorCode): Response => done(jsonError(status, errorCode))

    const env = getEnv()
    if (env.PP_DISABLED) return fail(503, "SERVICE_DISABLED")

    const method = request.method
    if (!isProxyMethod(method)) return fail(405, "METHOD_NOT_ALLOWED")

    const url = new URL(request.url)
    if (!url.pathname.startsWith(BFF_PATHS.proxyPrefix)) return fail(400, "BAD_PATH")
    const segments = normalizeProxyPath(url.pathname.slice(BFF_PATHS.proxyPrefix.length))
    if (!segments) return fail(400, "BAD_PATH")
    if (isDenied(method, segments, denyRules)) return fail(403, "NOT_ALLOWED")

    const match = matchEntry(allowlist, method, segments)
    if (match.kind === "method-not-allowed") return fail(405, "METHOD_NOT_ALLOWED")
    if (match.kind === "not-allowed") return fail(403, "NOT_ALLOWED")
    const { entry } = match
    template = logTemplate(entry)

    if (entry.profile && env.ACCOUNT_DISABLED) return fail(503, "SERVICE_DISABLED")

    const session = await getSession(request, now())
    if (!session) return done(sessionExpiredResponse(request))

    const query = buildUpstreamQuery(entry, url.searchParams)
    if (!query) return fail(400, "BAD_QUERY")

    const body = await readEntryBody(request, method, entry)
    if (!body.ok) return fail(body.status, body.errorCode)

    const checkedAt = now()
    if (!isAccessTokenFresh(session, checkedAt)) return fail(401, "TOKEN_EXPIRED")

    // The session's ids replace `me`: the result must still clear the deny list.
    const upstream = upstreamSegments(entry, segments, session)
    if (isDenied(method, upstream, denyRules)) return fail(403, "NOT_ALLOWED")

    const upstreamUrl = buildUpstreamUrl(environmentConfig(session.environment).apiRoot, upstream, query)
    /* v8 ignore next -- defensive: normalized segments always rebuild to the same path */
    if (!upstreamUrl) return fail(400, "BAD_PATH")

    const result = await forward({
      url: upstreamUrl,
      method,
      request,
      body: body.body,
      accessToken: session.accessToken,
      requestId,
      asImage: entry.asImage === true,
    })
    if (result.kind === "token-expired") return fail(401, "TOKEN_EXPIRED")
    return done(await recordSessionActivity(request, result.response, session, checkedAt, now()))
  }
}
