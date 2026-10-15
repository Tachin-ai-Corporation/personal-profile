import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { setLogSink } from "@/lib/server/log"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { callOp, expectBffError, expectNoStore } from "@/test/named-op-fixture"
import { NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import { createMfaValidateHandler } from "./mfa-validate"

const PATH = "/api/pp/mfa/validate"
const UPSTREAM = `${DEMO.apiBase}/v2/mfa/validate`
const handler = createMfaValidateHandler({ env: testEnv(), now: () => NOW })
const post = (body: unknown, extra: object = {}) => callOp(handler, { method: "POST", path: PATH, body, ...extra })

beforeEach(() => stubServerEnv())

describe("POST /api/pp/mfa/validate", () => {
  it.each([true, false])("moves the code into the upstream query and relays the boolean %s", async (valid) => {
    let seen: { search: string; body: string } | undefined
    server.use(
      http.post(UPSTREAM, async ({ request }) => {
        seen = { search: new URL(request.url).search, body: await request.text() }
        return HttpResponse.json(valid)
      }),
    )
    const response = await post({ code: "123456" })
    expect(response.status).toBe(200)
    expect(await response.json()).toBe(valid)
    expectNoStore(response)
    expect(seen).toEqual({ search: "?code=123456", body: "" })
  })

  it.each([
    ["403", 403, { message: "Forbidden", code: 3 }],
    ["400 MFA not enabled", 400, { message: "Mfa is not enabled for this user.", code: 1, trace: "x" }],
  ])("relays an upstream %s in the upstream envelope (message/code only)", async (_label, status, body) => {
    server.use(http.post(UPSTREAM, () => HttpResponse.json(body, { status })))
    const response = await post({ code: "123456" })
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ message: body.message, code: body.code })
  })

  it.each([
    ["a non-boolean 2xx", () => HttpResponse.json({ ok: true }), 502, "UPSTREAM_ERROR"],
    ["an upstream 5xx", () => new HttpResponse(null, { status: 503 }), 502, "UPSTREAM_ERROR"],
    ["an upstream 401", () => new HttpResponse(null, { status: 401 }), 401, "TOKEN_EXPIRED"],
  ])("%s → %i %s", async (_label, resolver, status, errorCode) => {
    server.use(http.post(UPSTREAM, resolver))
    await expectBffError(await post({ code: "123456" }), status, errorCode)
  })

  it.each([
    ["12345", { code: "12345" }, {}, 400, "BAD_BODY"],
    ["abcdef", { code: "abcdef" }, {}, 400, "BAD_BODY"],
    ["1234567", { code: "1234567" }, {}, 400, "BAD_BODY"],
    ["a number", { code: 123456 }, {}, 400, "BAD_BODY"],
    ["missing code", {}, {}, 400, "BAD_BODY"],
    ["non-JSON", "code=123456", { headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 415, "UNSUPPORTED_MEDIA"],
    ["the code in the URL", { code: "123456" }, { path: `${PATH}?code=123456` }, 400, "BAD_QUERY"],
    ["no session", { code: "123456" }, { session: null }, 401, "SESSION_EXPIRED"],
    ["GET", undefined, { method: "GET" }, 405, "METHOD_NOT_ALLOWED"],
  ])("%s → %i %s, no upstream call", async (_label, body, extra, status, errorCode) => {
    const calls = trackAllRequests()
    await expectBffError(await post(body, extra), status, errorCode)
    expect(calls()).toBe(0)
  })

  it.each<Record<string, string>>([{ PP_DISABLED: "1" }, { ACCOUNT_DISABLED: "1" }])("%o → 503 SERVICE_DISABLED, no upstream call", async (env) => {
    const calls = trackAllRequests()
    const h = createMfaValidateHandler({ env: testEnv(env), now: () => NOW })
    await expectBffError(await callOp(h, { method: "POST", path: PATH, body: { code: "123456" } }), 503, "SERVICE_DISABLED")
    expect(calls()).toBe(0)
  })

  it("never logs the code", async () => {
    server.use(http.post(UPSTREAM, () => HttpResponse.json(false)))
    const lines: string[] = []
    const restore = setLogSink({ info: (l) => void lines.push(l), warn: (l) => void lines.push(l), error: (l) => void lines.push(l) })
    await post({ code: "987123" })
    await post({ code: "98712" })
    restore()
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(JSON.parse(line)).toMatchObject({ method: "POST", routeTemplate: PATH })
      expect(line).not.toContain("98712")
    }
  })
})
