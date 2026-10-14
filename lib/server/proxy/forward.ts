import "server-only"

import { withNoStore } from "@/lib/server/http/cache-headers"
import { discardBody, fetchWithTimeout } from "@/lib/server/http/fetch-with-timeout"
import { jsonError } from "@/lib/server/http/responses"
import type { ProxyMethod } from "./types"

/** Request headers the browser may pass upstream (AD-2). */
const FORWARDED_REQUEST_HEADERS = ["Content-Type", "Accept", "Accept-Language"]
/**
 * Upstream response headers the browser may see (AD-2). `Content-Length` is
 * never forwarded: Node's fetch transparently decompresses gzip/br, so the
 * upstream length would not match the relayed body.
 */
const FORWARDED_RESPONSE_HEADERS = ["Content-Type", "X-Request-Id"]

function encodeQuery(query: URLSearchParams): string {
  return [...query].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")
}

/**
 * `apiBase + "/" + segments.map(encodeURIComponent)` — never
 * `new URL(input, base)`. The result is re-parsed and must keep the origin and
 * decode back to the same segments, else `null`.
 */
export function buildUpstreamUrl(apiRoot: string, segments: readonly string[], query: URLSearchParams): string | null {
  const path = `/api/${segments.map(encodeURIComponent).join("/")}`
  const search = encodeQuery(query)
  const url = `${apiRoot}${path}${search ? `?${search}` : ""}`

  const parsed = new URL(url)
  if (parsed.origin !== apiRoot || parsed.pathname !== path) return null
  return url
}

export interface ForwardInput {
  readonly url: string
  readonly method: ProxyMethod
  readonly request: Request
  readonly body: string | undefined
  readonly accessToken: string
  readonly requestId: string
}

export type ForwardResult =
  | { readonly kind: "response"; readonly response: Response }
  /** Upstream said 401: the client refreshes and replays (AD-16). */
  | { readonly kind: "token-expired" }

/** Sends one upstream request and maps the outcome to the browser response. */
export async function forward(input: ForwardInput): Promise<ForwardResult> {
  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = input.request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  headers.set("Authorization", `Bearer ${input.accessToken}`)
  headers.set("X-Request-Id", input.requestId)

  const outcome = await fetchWithTimeout(input.url, { method: input.method, headers, body: input.body })
  if (outcome.kind === "timeout") return { kind: "response", response: jsonError(504, "UPSTREAM_TIMEOUT") }
  if (outcome.kind === "network") return { kind: "response", response: jsonError(502, "UPSTREAM_ERROR") }

  const upstream = outcome.response
  const discard = (): void => discardBody(upstream)
  if (upstream.status === 401) {
    discard()
    return { kind: "token-expired" }
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    discard()
    return { kind: "response", response: jsonError(502, "UPSTREAM_REDIRECT") }
  }
  if (upstream.status >= 500) {
    discard()
    return { kind: "response", response: jsonError(502, "UPSTREAM_ERROR") }
  }

  const out = new Headers()
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value !== null) out.set(name, value)
  }
  out.set("X-Content-Type-Options", "nosniff")
  withNoStore(out)
  const body = upstream.status === 204 || upstream.status === 205 ? null : upstream.body
  return { kind: "response", response: new Response(body, { status: upstream.status, headers: out }) }
}
