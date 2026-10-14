import "server-only"

import { BFF_ERROR_SOURCE, type BffErrorBody, type BffErrorCode } from "@/lib/shared/bff-contract"
import { withNoStore } from "./cache-headers"

/** A no-store, nosniff JSON response. */
export function jsonResponse(status: number, body: unknown, headers?: Headers): Response {
  const out = withNoStore(headers ?? new Headers())
  out.set("Content-Type", "application/json")
  out.set("X-Content-Type-Options", "nosniff")
  return new Response(JSON.stringify(body), { status, headers: out })
}

/** The one builder for BFF-originated errors: `{ errorCode, source: "proxy" }`, no-store. */
export function jsonError(status: number, errorCode: BffErrorCode, headers?: Headers): Response {
  const body: BffErrorBody = { errorCode, source: BFF_ERROR_SOURCE }
  return jsonResponse(status, body, headers)
}

/** A no-store JSON success body. */
export function jsonOk(body: unknown, headers?: Headers): Response {
  return jsonResponse(200, body, headers)
}

/** A no-store 204. */
export function noContent(headers?: Headers): Response {
  return new Response(null, { status: 204, headers: withNoStore(headers ?? new Headers()) })
}

/**
 * 303 See Other with an absolute `Location` (AD-4). The URL must already be
 * absolute; relative or non-http(s) targets throw, so a bug never becomes an
 * open redirect.
 */
export function seeOther(url: string, headers?: Headers): Response {
  const target = new URL(url)
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("seeOther: only http(s) targets are allowed")
  }
  const out = withNoStore(headers ?? new Headers())
  out.set("Location", target.toString())
  return new Response(null, { status: 303, headers: out })
}

/** The shared explicit 405 for methods a route does not serve (so Next never auto-implements them). */
export async function methodNotAllowed(): Promise<Response> {
  return jsonError(405, "METHOD_NOT_ALLOWED")
}
