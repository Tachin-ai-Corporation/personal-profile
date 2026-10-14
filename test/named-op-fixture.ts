import { expect } from "vitest"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import type { SessionPayload } from "@/lib/server/session/types"
import { makeSession } from "./session-fixture"

export type RouteHandler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>

export interface NamedOpCall {
  readonly method?: string
  readonly path: string
  readonly session?: SessionPayload | null
  readonly headers?: Record<string, string>
  readonly body?: unknown
  readonly params?: Record<string, string>
}

/** Calls a named-op handler as Next would (sealed session cookie, JSON body, route params). */
export async function callOp(handler: RouteHandler, { method = "GET", path, session = makeSession(), headers = {}, body, params }: NamedOpCall): Promise<Response> {
  const h: Record<string, string> = { ...headers }
  if (session) h.cookie = `${SESSION_COOKIE}=${await sealSession(session)}`
  if (body !== undefined) h["Content-Type"] ??= "application/json"
  const request = new Request(`http://localhost:3000${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  return handler(request, params ? { params: Promise.resolve(params) } : undefined)
}

/** A BFF error with the AD-18 headers. */
export async function expectBffError(response: Response, status: number, errorCode: string): Promise<void> {
  expect(response.status).toBe(status)
  expect(await response.json()).toEqual({ errorCode, source: "proxy" })
  expectNoStore(response)
}

export function expectNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  expect(response.headers.get("Pragma")).toBe("no-cache")
  expect(response.headers.get("Vary")).toBe("Cookie")
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
}
