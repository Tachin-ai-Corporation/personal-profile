import "server-only"

import { withNoStore } from "@/lib/server/http/cache-headers"
import { discardBody, fetchWithTimeout, isOpaqueRedirect, UPSTREAM_BODY_IDLE_MS } from "@/lib/server/http/fetch-with-timeout"
import { IMAGE_CONTENT_TYPES, peekStream, sniffImage, type ImageKind } from "@/lib/server/http/image-sniff"
import { jsonError } from "@/lib/server/http/responses"
import type { ProxyMethod } from "./types"

/** Request headers the browser may pass upstream (AD-2). */
const FORWARDED_REQUEST_HEADERS = ["Content-Type", "Accept", "Accept-Language"]
/**
 * Upstream response headers the browser may see (AD-2). `Content-Length` is
 * never forwarded: Node's fetch transparently decompresses gzip/br, so the
 * upstream length would not match the relayed body. `Set-Cookie`,
 * `Content-Disposition` and caching headers are never forwarded either.
 */
const FORWARDED_RESPONSE_HEADERS = ["Content-Type", "X-Request-Id"]

/** Image entries are served inline only for these kinds (AD-13); WebP is for organization logos only. */
const INLINE_IMAGES: readonly ImageKind[] = ["png", "jpeg", "bmp"]

export interface ForwardInput {
  readonly url: string
  readonly method: ProxyMethod
  readonly request: Request
  /** A validated JSON string, or the rebuilt multipart form of an upload entry. */
  readonly body: string | FormData | undefined
  readonly accessToken: string
  readonly requestId: string
  /** An `asImage` entry: the leading bytes decide `inline` vs `attachment` (AD-13). */
  readonly asImage?: boolean
}

export type ForwardResult =
  | { readonly kind: "response"; readonly response: Response }
  /** Upstream said 401: the client refreshes and replays (AD-16). */
  | { readonly kind: "token-expired" }

/**
 * Image hardening (AD-13): upstream declares `image/jpeg` for every preview,
 * so only the leading bytes count. PNG/JPEG/BMP → `inline` with the type of
 * the bytes; anything else → `attachment; filename="file"` as
 * `application/octet-stream`. The body still streams (only the head is read).
 */
async function hardenImage(upstream: Response, out: Headers): Promise<Response> {
  /* v8 ignore next -- defensive: a 2xx image answer without a body is served as an empty attachment */
  const source = upstream.body ?? new ReadableStream<Uint8Array>({ start: (controller) => controller.close() })
  const peek = await peekStream(source)
  if (peek.kind === "error") return jsonError(502, "UPSTREAM_ERROR")
  const kind = sniffImage(peek.head)
  if (kind !== null && INLINE_IMAGES.includes(kind)) {
    out.set("Content-Type", IMAGE_CONTENT_TYPES[kind])
    out.set("Content-Disposition", "inline")
  } else {
    out.set("Content-Type", "application/octet-stream")
    out.set("Content-Disposition", 'attachment; filename="file"')
  }
  return new Response(peek.body, { status: upstream.status, headers: out })
}

/** Sends one upstream request and maps the outcome to the browser response. */
export async function forward(input: ForwardInput): Promise<ForwardResult> {
  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    // A rebuilt multipart body gets its own Content-Type (new boundary) from fetch.
    if (name === "Content-Type" && input.body instanceof FormData) continue
    const value = input.request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  headers.set("Authorization", `Bearer ${input.accessToken}`)
  headers.set("X-Request-Id", input.requestId)

  const outcome = await fetchWithTimeout(input.url, { method: input.method, headers, body: input.body }, { bodyIdleMs: UPSTREAM_BODY_IDLE_MS })
  if (outcome.kind === "timeout") return { kind: "response", response: jsonError(504, "UPSTREAM_TIMEOUT") }
  if (outcome.kind === "network") return { kind: "response", response: jsonError(502, "UPSTREAM_ERROR") }

  const upstream = outcome.response
  const discard = (): void => discardBody(upstream)
  if (upstream.status === 401) {
    discard()
    return { kind: "token-expired" }
  }
  if (isOpaqueRedirect(upstream) || (upstream.status >= 300 && upstream.status < 400)) {
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
  if (upstream.status === 204 || upstream.status === 205) {
    discard()
    return { kind: "response", response: new Response(null, { status: upstream.status, headers: out }) }
  }
  if (input.asImage && upstream.status >= 200 && upstream.status < 300) {
    return { kind: "response", response: await hardenImage(upstream, out) }
  }
  return { kind: "response", response: new Response(upstream.body, { status: upstream.status, headers: out }) }
}
