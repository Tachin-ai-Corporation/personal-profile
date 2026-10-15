import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { LAUNCH_ERROR_MESSAGES } from "@/lib/shared/messages"
import { stubServerEnv, TEST_DEMO_SECRET } from "@/test/env-fixture"
import { encryptLpl, launchPayload } from "@/test/lpl-fixture"
import { server } from "@/test/msw-server"
import { DEMO, exchangeUrl, logoutAllUrl, myselfUrl, tokenResponse } from "@/test/upstream-fixture"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, dynamic } from "./route"

beforeEach(() => stubServerEnv())

const CLEARED = "__Host-pp_s=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/token route exports", () => {
  it("is force-dynamic (never cached or prerendered)", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it("POST is the guarded launch handler", async () => {
    const response = await POST(post({ lpl: "%%%" }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, errorCode: "LAUNCH_INVALID", retryable: false })
  })

  it("an over-budget session answers 500 LAUNCH_CONFIG (not retryable), clears the cookie and revokes once", async () => {
    let revokes = 0
    server.use(
      http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json(tokenResponse({ refreshToken: "r".repeat(4000) }))),
      http.get(myselfUrl(DEMO.apiRoot), () => HttpResponse.json({ id: 42, personId: 4242 })),
      http.post(logoutAllUrl(DEMO.apiRoot), () => {
        revokes += 1
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const response = await POST(post({ lpl: encryptLpl(launchPayload(), TEST_DEMO_SECRET) }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      ok: false,
      errorCode: "LAUNCH_CONFIG",
      source: "proxy",
      message: LAUNCH_ERROR_MESSAGES.unavailable,
      retryable: false,
    })
    expect(response.headers.getSetCookie()).toEqual([CLEARED])
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(revokes).toBe(1)
  })

  it.each([
    ["GET", GET],
    ["HEAD", HEAD],
    ["OPTIONS", OPTIONS],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("%s answers 405 in the launch envelope with no-store", async (_method, handler) => {
    const response = await handler()
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({
      ok: false,
      errorCode: "METHOD_NOT_ALLOWED",
      source: "proxy",
      message: LAUNCH_ERROR_MESSAGES.expired,
      retryable: false,
    })
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  })
})
