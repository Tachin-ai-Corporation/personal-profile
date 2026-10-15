import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { setLogSink } from "@/lib/server/log"
import { SESSION_COOKIE, unsealSession } from "@/lib/server/session/session"
import { LAUNCH_ERROR_MESSAGES } from "@/lib/shared/messages"
import { stubServerEnv, TEST_DEMO_SECRET, testEnv } from "@/test/env-fixture"
import { encryptLpl, launchPayload } from "@/test/lpl-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { fakeAccessToken } from "@/test/session-fixture"
import { DEMO, exchangeUrl, myselfUrl, tokenResponse } from "@/test/upstream-fixture"
import { createTokenHandler, launchErrorMessage } from "./token-handler"

/** The route's handler with the real env and clock. */
const POST = createTokenHandler()

const ACCESS = fakeAccessToken(1)

beforeEach(() => stubServerEnv())

function post(body: unknown, contentType = "application/json", cookie?: string): Request {
  return new Request("http://localhost:3000/api/token", {
    method: "POST",
    headers: { "Content-Type": contentType, ...(cookie ? { cookie } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const validLpl = () => encryptLpl(launchPayload(), TEST_DEMO_SECRET)

function happyUpstream() {
  server.use(
    http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json(tokenResponse({ accessToken: ACCESS, refreshToken: "refresh-xyz" }))),
    http.get(myselfUrl(DEMO.apiRoot), () => HttpResponse.json({ id: 42, personId: 4242 })),
  )
}

function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const push = (l: string) => void lines.push(l)
  return { lines, restore: setLogSink({ info: push, warn: push, error: push }) }
}

function expectNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  expect(response.headers.get("Pragma")).toBe("no-cache")
  expect(response.headers.get("Vary")).toBe("Cookie")
}

describe("POST /api/token", () => {
  it("a non-numeric Content-Length → 400 LAUNCH_INVALID, not retryable, with no exchange call", async () => {
    const calls = trackAllRequests()
    const request = new Request("http://localhost:3000/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "abc" },
      body: JSON.stringify({ lpl: validLpl() }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", retryable: false })
    expect(calls()).toBe(0)
  })

  it("seals tokens + environment and answers { ok: true, environment } only, setting onehealth_environment", async () => {
    happyUpstream()
    const { lines, restore } = captureLogs()
    const lpl = validLpl()
    // `environment` in the body is ignored: the key decides (D2).
    const response = await POST(post({ lpl, environment: "prod", extra: 1 }))
    restore()

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ ok: true, environment: "demo" })
    for (const secret of [ACCESS, "refresh-xyz", "one-time-code", "42"]) expect(text).not.toContain(secret)
    expectNoStore(response)

    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=.+; Path=/; HttpOnly; Secure; SameSite=Lax$`))
    expect(cookies[1]).toBe("onehealth_environment=demo; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000")
    const session = await unsealSession(cookies[0].split(";")[0].slice(SESSION_COOKIE.length + 1))
    expect(session).toMatchObject({ accessToken: ACCESS, refreshToken: "refresh-xyz", environment: "demo", userId: 42 })

    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ routeTemplate: "/api/token", status: 200, outcome: "ok", environment: "demo" })
    for (const secret of [lpl, ACCESS, "4242"]) expect(lines[0]).not.toContain(secret)
  })

  it.each([
    ["not JSON", "{oops"],
    ["empty", ""],
    ["no lpl", { environment: "demo" }],
    ["empty lpl", { lpl: "" }],
    ["oversized", "x".repeat(17 * 1024)],
    ["bad base64", { lpl: "%%%" }],
    ["non-string lpl (number)", { lpl: 12345 }],
    ["non-string lpl (object)", { lpl: { value: "x" } }],
    ["non-string lpl (array)", { lpl: ["x"] }],
    ["JSON array", [{ lpl: "x" }]],
    ["JSON null", null],
  ])("rejects a %s body: 400 LAUNCH_INVALID, retryable:false, cleared session, environment cookie untouched", async (_label, body) => {
    const calls = trackAllRequests()
    const response = await POST(post(body))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      errorCode: "LAUNCH_INVALID",
      source: "proxy",
      message: LAUNCH_ERROR_MESSAGES.expired,
      retryable: false,
    })
    expect(response.headers.getSetCookie()).toEqual([`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`])
    expectNoStore(response)
    expect(calls()).toBe(0)
  })

  it("measures the body cap in bytes, not UTF-16 characters", async () => {
    happyUpstream()
    // ~5.8K characters but ~16.6 KB: a valid launch that is too large in bytes.
    const response = await POST(post({ lpl: validLpl(), pad: "€".repeat(5400) }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ errorCode: "LAUNCH_INVALID", retryable: false })
  })

  it("rejects a declared Content-Length over the cap before reading the body", async () => {
    const request = new Request("http://localhost:3000/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(64 * 1024) },
      body: JSON.stringify({ lpl: validLpl() }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(request.bodyUsed).toBe(false)
  })

  it("treats an unreadable request body as a missing lpl", async () => {
    const broken = new ReadableStream({ start: (controller) => controller.error(new Error("reset")) })
    // Node needs `duplex` for a streamed request body; the DOM RequestInit type lacks it.
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: broken,
      duplex: "half",
    }
    const request = new Request("http://localhost:3000/api/token", init)
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ errorCode: "LAUNCH_INVALID", retryable: false })
  })

  it("answers 415 for a non-JSON content type", async () => {
    const response = await POST(post({ lpl: validLpl() }, "text/plain"))
    expect(response.status).toBe(415)
    expect(await response.json()).toMatchObject({ errorCode: "UNSUPPORTED_MEDIA", retryable: false })
  })

  it("keeps exchange failures retryable, with user-safe copy only", async () => {
    server.use(http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json({ message: "internal stack trace", code: 9 }, { status: 500 })))
    const response = await POST(post({ lpl: validLpl() }))
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body).toEqual({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: LAUNCH_ERROR_MESSAGES.expired })
  })

  it("answers 403 WRONG_TENANT with the module-neutral copy", async () => {
    server.use(http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json(tokenResponse({ tenantId: 5 }))))
    const response = await POST(post({ lpl: validLpl() }))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ errorCode: "WRONG_TENANT", message: LAUNCH_ERROR_MESSAGES.wrongTenant, retryable: false })
  })

  it("answers 503 SERVICE_DISABLED with PP_DISABLED=1, retryable:false, no upstream call", async () => {
    const calls = trackAllRequests()
    const response = await createTokenHandler({ env: testEnv({ PP_DISABLED: "1" }) })(post({ lpl: validLpl() }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      errorCode: "SERVICE_DISABLED",
      source: "proxy",
      message: LAUNCH_ERROR_MESSAGES.unavailable,
      retryable: false,
    })
    expect(calls()).toBe(0)
  })

  it.each([
    ["an Error", () => Promise.reject(new TypeError("boom with secret-detail"))],
    ["a non-Error", () => Promise.reject("raw")],
  ])("fails closed when the launch throws %s: 502 LAUNCH_INVALID, retryable, cookie cleared, logged by name only", async (_label, thrower) => {
    const { lines, restore } = captureLogs()
    const handler = createTokenHandler({ launch: thrower })
    const response = await handler(post({ lpl: validLpl() }, "application/json", `${SESSION_COOKIE}=previous`))
    restore()
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: LAUNCH_ERROR_MESSAGES.expired })
    expect(response.headers.getSetCookie()).toEqual([`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`])
    expectNoStore(response)
    const errorLine = lines.find((line) => line.includes('"status":502') && line.includes("errorName")) ?? ""
    expect(errorLine).toContain(_label === "an Error" ? "TypeError" : "UnknownError")
    for (const line of lines) expect(line).not.toContain("secret-detail")
  })

  it.each([
    [
      "the env read",
      createTokenHandler({
        env: () => {
          throw new RangeError("env")
        },
      }),
      () => post({ lpl: validLpl() }),
    ],
    [
      "the body read",
      createTokenHandler(),
      () => {
        const request = post({ lpl: validLpl() })
        Object.defineProperty(request, "body", {
          get: () => {
            throw new RangeError("body")
          },
        })
        return request
      },
    ],
  ])("fails closed when %s throws: 502 LAUNCH_INVALID, retryable, cookie cleared", async (_label, handler, build) => {
    const calls = trackAllRequests()
    const response = await handler(build())
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: LAUNCH_ERROR_MESSAGES.expired })
    expect(response.headers.getSetCookie()).toEqual([`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`])
    expect(calls()).toBe(0)
  })

  it("maps every error code to user-safe copy", () => {
    expect(launchErrorMessage("LAUNCH_CONFIG")).toBe(LAUNCH_ERROR_MESSAGES.unavailable)
    expect(launchErrorMessage("LAUNCH_USED")).toBe(LAUNCH_ERROR_MESSAGES.expired)
    expect(launchErrorMessage("WRONG_TENANT")).toBe(LAUNCH_ERROR_MESSAGES.wrongTenant)
  })
})
