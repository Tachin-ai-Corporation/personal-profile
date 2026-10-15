import "server-only"

import type { BffErrorCode } from "@/lib/shared/bff-contract"
import { UpstreamBodyTimeoutError } from "./fetch-with-timeout"

export type StreamRead =
  | { readonly kind: "ok"; readonly bytes: Uint8Array<ArrayBuffer> }
  /** More than `maxBytes` arrived; the rest of the stream was cancelled. */
  | { readonly kind: "too-large" }
  /** A guarded upstream body was cut off by its timer (→ 504 for the caller). */
  | { readonly kind: "timeout" }
  /** The stream errored otherwise (client abort, upstream reset). */
  | { readonly kind: "error" }

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/**
 * Reads a stream with a running byte counter and stops as soon as it passes
 * `maxBytes` (nothing past the cap is ever buffered). Never throws.
 */
export async function readStreamCapped(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<StreamRead> {
  if (stream === null) return { kind: "ok", bytes: new Uint8Array(0) }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return { kind: "ok", bytes: concat(chunks, total) }
      total += value.byteLength
      if (total > maxBytes) {
        /* v8 ignore next -- the rejection handler only runs if cancelling the source fails */
        reader.cancel().catch(() => undefined)
        return { kind: "too-large" }
      }
      chunks.push(value)
    }
  } catch (error) {
    return error instanceof UpstreamBodyTimeoutError ? { kind: "timeout" } : { kind: "error" }
  }
}

export type CappedRead =
  | { readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly status: 400 | 413; readonly errorCode: Extract<BffErrorCode, "BAD_BODY" | "TOO_LARGE"> }

const DIGITS = /^\d+$/

/**
 * The one request-body reader of the BFF: a declared `Content-Length` that is
 * not a number → 400 `BAD_BODY`, over `maxBytes` → 413 `TOO_LARGE`, both
 * before reading; then the body streams through a byte counter (a chunked
 * body without `Content-Length` over the cap → 413). A body that errors while
 * reading → 400 `BAD_BODY`.
 */
export async function readCapped(request: Request, maxBytes: number): Promise<CappedRead> {
  const declared = request.headers.get("Content-Length")
  if (declared !== null) {
    if (!DIGITS.test(declared.trim())) return { ok: false, status: 400, errorCode: "BAD_BODY" }
    if (Number(declared) > maxBytes) return { ok: false, status: 413, errorCode: "TOO_LARGE" }
  }
  const read = await readStreamCapped(request.body, maxBytes)
  if (read.kind === "too-large") return { ok: false, status: 413, errorCode: "TOO_LARGE" }
  if (read.kind !== "ok") return { ok: false, status: 400, errorCode: "BAD_BODY" }
  return { ok: true, bytes: read.bytes }
}
