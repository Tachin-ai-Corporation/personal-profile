import { delay, http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { setLogSink } from "@/lib/server/log"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import type { SessionPayload } from "@/lib/server/session/types"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import {
  createNamedOp,
  NAMED_OP_MAX_BODY_BYTES,
  relayClientError,
  UPSTREAM_JSON_MAX_BYTES,
  type NamedOpConfig,
  type UpstreamJsonRequest,
  type UpstreamJsonResult,
} from "./named-op"

const UP = DEMO.apiBase
const NO_STORE = "private, no-store, max-age=0"

beforeEach(() => stubServerEnv())

interface Call {
  method?: string
  path?: string
  session?: SessionPayload | null
  headers?: Record<string, string>
  body?: string
  params?: Record<string, string>
}

async function call(handler: ReturnType<typeof createNamedOp>, { method = "GET", path = "/api/pp/x", session = makeSession(), headers = {}, body, params }: Call = {}) {
  const h: Record<string, string> = { ...headers }
  if (session) h.cookie = `${SESSION_COOKIE}=${await sealSession(session)}`
  const request = new Request(`http://localhost:3000${path}`, { method, headers: h, body })
  return params ? handler(request, { params: Promise.resolve(params) }) : handler(request)
}

async function expectError(response: Response, status: number, errorCode: string) {
  expect(response.status).toBe(status)
  expect(await response.json()).toEqual({ errorCode, source: "proxy" })
  expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
}

function op<B = undefined, P = undefined>(config: Partial<NamedOpConfig<B, P>> = {}, envOverrides: Record<string, string> = {}) {
  return createNamedOp<B, P>(
    {
      route: "/api/pp/x",
      killSwitch: "pp",
      method: "GET",
      upstream: "1health",
      handle: async () => Response.json({ ok: true }),
      ...config,
    },
    { env: testEnv(envOverrides), now: () => NOW },
  )
}

function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const push = (line: string) => void lines.push(line)
  return { lines, restore: setLogSink({ info: push, warn: push, error: push }) }
}

describe("named op: the fixed order, before handle()", () => {
  let upstreamCalls: () => number
  let handled: boolean
  const handle = async () => {
    handled = true
    return Response.json({ ok: true })
  }

  beforeEach(() => {
    upstreamCalls = trackAllRequests()
    handled = false
  })
  afterEach(() => {
    expect(upstreamCalls()).toBe(0)
    expect(handled).toBe(false)
  })

  it.each([
    ["pp", { PP_DISABLED: "1" }],
    ["account", { PP_DISABLED: "1" }],
    ["account", { ACCOUNT_DISABLED: "1" }],
  ] as const)("kill switch %s with %o → 503 SERVICE_DISABLED, even without a session or with a wrong method", async (killSwitch, env) => {
    const handler = op({ killSwitch, handle }, env)
    const response = await call(handler, { session: null, method: "DELETE" })
    expect(response.headers.get("Retry-After")).toBe("300")
    await expectError(response, 503, "SERVICE_DISABLED")
  })

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("%s on a GET op → 405", async (method) => {
    await expectError(await call(op({ handle }), { method }), 405, "METHOD_NOT_ALLOWED")
  })

  it("HEAD on a GET op → 405 without a body", async () => {
    const response = await call(op({ handle }), { method: "HEAD" })
    expect(response.status).toBe(405)
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })

  it("no session → 401 SESSION_EXPIRED; an unsealable cookie is cleared", async () => {
    await expectError(await call(op({ handle }), { session: null }), 401, "SESSION_EXPIRED")
    const response = await op({ handle })(new Request("http://localhost:3000/api/pp/x", { headers: { cookie: `${SESSION_COOKIE}=junk` } }))
    await expectError(response, 401, "SESSION_EXPIRED")
    expect(response.headers.get("Set-Cookie")).toMatch(/Max-Age=0$/)
  })

  it.each(["?x=1", "?constructor=1", "?code=123456"])("any query by default (%s) → 400 BAD_QUERY", async (query) => {
    await expectError(await call(op({ handle }), { path: `/api/pp/x${query}` }), 400, "BAD_QUERY")
  })

  it("a query outside the op's rules → 400 BAD_QUERY", async () => {
    await expectError(await call(op({ handle, query: { page: { pattern: /^\d$/ } } }), { path: "/api/pp/x?page=12" }), 400, "BAD_QUERY")
  })

  it("bad params → 400 BAD_PATH by default, or the op's own failure; missing params count as {}", async () => {
    const params = (raw: Readonly<Record<string, unknown>>) => (raw.id === "1" ? "1" : null)
    await expectError(await call(op({ handle, params }), { params: { id: "x" } }), 400, "BAD_PATH")
    await expectError(await call(op({ handle, params })), 400, "BAD_PATH")
    const custom = op({ handle, params, failures: { badParams: { status: 404, errorCode: "NO_LOGO" } } })
    await expectError(await call(custom, { params: { id: "x" } }), 404, "NO_LOGO")
  })

  describe("JSON body", () => {
    const post = op({ handle, method: "POST", body: z.strictObject({ code: z.string().regex(/^\d{6}$/) }) })
    const json = { "Content-Type": "application/json" }

    it.each([
      ["text/plain", { "Content-Type": "text/plain" }, '{"code":"123456"}', 415, "UNSUPPORTED_MEDIA"],
      ["no content type", {}, undefined, 415, "UNSUPPORTED_MEDIA"],
      ["unparsable JSON", json, "{nope", 400, "BAD_BODY"],
      ["empty body", json, "", 400, "BAD_BODY"],
      ["a 5-digit code", json, '{"code":"12345"}', 400, "BAD_BODY"],
      ["letters", json, '{"code":"abcdef"}', 400, "BAD_BODY"],
      ["an extra field", json, '{"code":"123456","x":1}', 400, "BAD_BODY"],
      ["over the cap", { ...json, "Content-Length": String(NAMED_OP_MAX_BODY_BYTES + 1) }, '{"code":"123456"}', 413, "TOO_LARGE"],
      ["a NaN Content-Length", { ...json, "Content-Length": "x" }, '{"code":"123456"}', 400, "BAD_BODY"],
    ])("%s → %i %s", async (_label, headers, body, status, errorCode) => {
      await expectError(await call(post, { method: "POST", headers, body }), status, errorCode)
    })

    it("a custom cap applies", async () => {
      const small = op({ handle, method: "POST", body: z.object({ a: z.string() }), maxBodyBytes: 8 })
      await expectError(await call(small, { method: "POST", headers: json, body: JSON.stringify({ a: "too long" }) }), 413, "TOO_LARGE")
    })
  })

  it("a token within 30 s of expiry → 401 TOKEN_EXPIRED (1health ops), or the op's own failure", async () => {
    const session = makeSession({ accessExpiresAt: NOW + 29_000 })
    await expectError(await call(op({ handle }), { session }), 401, "TOKEN_EXPIRED")
    const custom = op({ handle, failures: { tokenExpired: { status: 404, errorCode: "NO_LOGO" } } })
    await expectError(await call(custom, { session }), 404, "NO_LOGO")
  })
})

describe("named op: handle() and the response", () => {
  it("passes the validated context; an external op skips the token check", async () => {
    let seen: { body: unknown; params: unknown; query: string; userId: number; external: boolean } | undefined
    const handler = op<{ code: string }, string>({
      method: "POST",
      upstream: "external",
      query: { v: { pattern: /^\d+$/ } },
      params: (raw) => (typeof raw.id === "string" ? raw.id : null),
      body: z.object({ code: z.string() }),
      handle: async (ctx) => {
        seen = { body: ctx.body, params: ctx.params, query: ctx.query.toString(), userId: ctx.session.userId, external: ctx.now === NOW }
        return Response.json({ ok: true })
      },
    })
    const response = await call(handler, {
      method: "POST",
      path: "/api/pp/x?v=3",
      session: makeSession({ accessExpiresAt: NOW - 1 }),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1" }),
      params: { id: "abc" },
    })
    expect(response.status).toBe(200)
    expect(seen).toEqual({ body: { code: "1" }, params: "abc", query: "v=3", userId: 42, external: true })
  })

  it("overwrites caching headers and adds nosniff on whatever handle returns", async () => {
    const handler = op({ handle: async () => new Response("x", { status: 200, headers: { "Cache-Control": "public, max-age=60", ETag: "e", "Content-Type": "text/plain" } }) })
    const response = await call(handler)
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
    expect(response.headers.get("Pragma")).toBe("no-cache")
    expect(response.headers.get("Vary")).toBe("Cookie")
    expect(response.headers.get("ETag")).toBeNull()
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("Content-Type")).toBe("text/plain")
    expect(await response.text()).toBe("x")
  })

  it("logs one template-only line per request, without the path, query or body", async () => {
    const { lines, restore } = captureLogs()
    const handler = op({ route: "/api/pp/org-logo/[tenantId]", params: (raw) => raw.tenantId as string })
    await call(handler, { path: "/api/pp/org-logo/987654", params: { tenantId: "987654" } })
    restore()
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ kind: "request", method: "GET", routeTemplate: "/api/pp/org-logo/[tenantId]", status: 200 })
    expect(lines[0]).not.toContain("987654")
  })

  it("adds the outcome code handle() recorded to the log line", async () => {
    const { lines, restore } = captureLogs()
    await call(
      op({
        handle: async (ctx) => {
          ctx.setOutcome("google_timeout")
          return Response.json({})
        },
      }),
    )
    await call(op())
    restore()
    expect(JSON.parse(lines[0])).toMatchObject({ routeTemplate: "/api/pp/x", outcome: "google_timeout" })
    expect(JSON.parse(lines[1]).outcome).toBeUndefined()
  })

  it.each([
    ["an Error", new TypeError("secret detail"), "TypeError"],
    ["a non-Error", "secret detail", "UnknownError"],
  ])("handle throwing %s → 500 INTERNAL_ERROR, logged by name only", async (_label, thrown, errorName) => {
    const { lines, restore } = captureLogs()
    const response = await call(
      op({
        handle: async () => {
          throw thrown
        },
      }),
    )
    restore()
    await expectError(response, 500, "INTERNAL_ERROR")
    const error = lines.find((line) => line.includes('"kind":"error"')) ?? ""
    expect(JSON.parse(error)).toMatchObject({ routeTemplate: "/api/pp/x", status: 500, errorName })
    expect(lines.join("\n")).not.toContain("secret detail")
  })

  it("a misconfigured env is a 500, not a crash", async () => {
    const handler = createNamedOp(
      { route: "/api/pp/x", killSwitch: "pp", method: "GET", upstream: "1health", handle: async () => new Response(null) },
      {
        env: () => {
          throw new Error("env")
        },
      },
    )
    await expectError(await handler(new Request("http://localhost:3000/api/pp/x")), 500, "INTERNAL_ERROR")
  })

  it("uses the real env and clock by default", async () => {
    const handler = createNamedOp({ route: "/api/pp/x", killSwitch: "pp", method: "GET", upstream: "external", handle: async () => Response.json(1) })
    const at = Date.now()
    const response = await call(handler, { session: makeSession({ iat: at, lastSeen: at }) })
    expect(response.status).toBe(200)
  })
})

describe("named op: ctx.upstream.json", () => {
  async function upstreamResult(request: UpstreamJsonRequest, session = makeSession()): Promise<{ result: UpstreamJsonResult; requestId: string }> {
    let out: { result: UpstreamJsonResult; requestId: string } | undefined
    const handler = op({
      handle: async (ctx) => {
        out = { result: await ctx.upstream.json(request), requestId: ctx.requestId }
        return Response.json({})
      },
    })
    await call(handler, { session })
    if (!out) throw new Error("handle did not run")
    return out
  }

  it("sends the session's Bearer, the request id and a JSON body to the session's environment, query encoded", async () => {
    let seen: { url: string; headers: Headers; body: unknown } | undefined
    server.use(
      http.post(`${UP}/v2/thing`, async ({ request }) => {
        seen = { url: request.url, headers: request.headers, body: await request.json() }
        return HttpResponse.json({ ok: 1 })
      }),
    )
    const session = makeSession()
    const { result, requestId } = await upstreamResult({ method: "POST", segments: ["v2", "thing"], query: new URLSearchParams([["Tenant IDs", "7"]]), body: { a: 1 } }, session)
    expect(result).toEqual({ kind: "ok", status: 200, data: { ok: 1 } })
    expect(seen?.url).toBe(`${UP}/v2/thing?Tenant%20IDs=7`)
    expect(seen?.headers.get("Authorization")).toBe(`Bearer ${session.accessToken}`)
    expect(seen?.headers.get("X-Request-Id")).toBe(requestId)
    expect(seen?.headers.get("Content-Type")).toBe("application/json")
    expect(seen?.headers.get("Cookie")).toBeNull()
    expect(seen?.body).toEqual({ a: 1 })
  })

  it("sends no body or Content-Type without one, and reads an empty 2xx as null", async () => {
    let contentType: string | null = "unset"
    server.use(
      http.get(`${UP}/v2/empty`, ({ request }) => {
        contentType = request.headers.get("Content-Type")
        return new HttpResponse(null, { status: 200 })
      }),
    )
    expect((await upstreamResult({ method: "GET", segments: ["v2", "empty"] })).result).toEqual({ kind: "ok", status: 200, data: null })
    expect(contentType).toBeNull()
  })

  it.each([
    ["4xx JSON → client-error with the body", () => HttpResponse.json({ message: "No", code: 9 }, { status: 403 }), { kind: "client-error", status: 403, data: { message: "No", code: 9 } }],
    ["4xx non-JSON → client-error with null", () => new HttpResponse("<html>", { status: 404 }), { kind: "client-error", status: 404, data: null }],
    ["401 → TOKEN_EXPIRED", () => new HttpResponse(null, { status: 401 }), { kind: "failed", failure: { status: 401, errorCode: "TOKEN_EXPIRED" } }],
    ["3xx → UPSTREAM_REDIRECT", () => new HttpResponse(null, { status: 302, headers: { Location: "https://x.test" } }), { kind: "failed", failure: { status: 502, errorCode: "UPSTREAM_REDIRECT" } }],
    ["5xx → UPSTREAM_ERROR", () => HttpResponse.json({ trace: "x" }, { status: 500 }), { kind: "failed", failure: { status: 502, errorCode: "UPSTREAM_ERROR" } }],
    ["network → UPSTREAM_ERROR", () => HttpResponse.error(), { kind: "failed", failure: { status: 502, errorCode: "UPSTREAM_ERROR" } }],
    ["unparsable 2xx → UPSTREAM_ERROR", () => new HttpResponse("{nope", { status: 200 }), { kind: "failed", failure: { status: 502, errorCode: "UPSTREAM_ERROR" } }],
    ["2xx over the cap → UPSTREAM_ERROR", () => new HttpResponse(new Uint8Array(UPSTREAM_JSON_MAX_BYTES + 1), { status: 200 }), { kind: "failed", failure: { status: 502, errorCode: "UPSTREAM_ERROR" } }],
  ])("%s", async (_label, resolver, expected) => {
    server.use(http.get(`${UP}/v2/x`, resolver))
    expect((await upstreamResult({ method: "GET", segments: ["v2", "x"] })).result).toEqual(expected)
  })

  it("a timeout → 504 UPSTREAM_TIMEOUT", async () => {
    let reached = false
    server.use(
      http.get(`${UP}/v2/slow`, async () => {
        reached = true
        await delay("infinite")
        return HttpResponse.json({})
      }),
    )
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const pending = upstreamResult({ method: "GET", segments: ["v2", "slow"] })
    await vi.waitFor(() => expect(reached).toBe(true))
    await vi.advanceTimersByTimeAsync(25_000)
    const { result } = await pending
    vi.useRealTimers()
    expect(result).toEqual({ kind: "failed", failure: { status: 504, errorCode: "UPSTREAM_TIMEOUT" } })
  })
})

describe("named op: a timeout while the upstream body streams", () => {
  it("→ 504 UPSTREAM_TIMEOUT, not 502", async () => {
    let sent = false
    const stalls = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) controller.enqueue(new TextEncoder().encode('{"a":'))
        sent = true
      },
    })
    let result: UpstreamJsonResult | undefined
    const handler = op({
      handle: async (ctx) => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        vi.stubGlobal("fetch", async () => new Response(stalls, { status: 200 }))
        const pending = ctx.upstream.json({ method: "GET", segments: ["v2", "x"] })
        await vi.advanceTimersByTimeAsync(25_000)
        result = await pending
        vi.useRealTimers()
        vi.unstubAllGlobals()
        return Response.json({})
      },
    })
    await call(handler)
    expect(result).toEqual({ kind: "failed", failure: { status: 504, errorCode: "UPSTREAM_TIMEOUT" } })
  })
})

describe("relayClientError", () => {
  it("relays only message and code, in the upstream envelope, no-store", async () => {
    const response = relayClientError(403, { message: "Forbidden", code: 12, stack: "x", source: "proxy" })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: "Forbidden", code: 12 })
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })

  it.each([
    [null, {}],
    ["text", {}],
    [{ message: 1, code: true }, {}],
    [{ code: "E_X" }, { code: "E_X" }],
  ])("%j → %j", async (data, body) => {
    expect(await relayClientError(400, data).json()).toEqual(body)
  })
})
