import { beforeEach, describe, expect, it } from "vitest"
import { stubServerEnv } from "@/test/env-fixture"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, dynamic } from "./route"

beforeEach(() => stubServerEnv())

describe("/api/session/refresh route exports", () => {
  it("is force-dynamic (never cached or prerendered)", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it("POST is the refresh handler: no cookie → 401 SESSION_EXPIRED", async () => {
    const response = await POST(new Request("http://localhost:3000/api/session/refresh", { method: "POST" }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
  })

  it.each([
    ["GET", GET],
    ["HEAD", HEAD],
    ["OPTIONS", OPTIONS],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("%s answers the 405 envelope with no-store", async (_method, handler) => {
    const response = await handler()
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ errorCode: "METHOD_NOT_ALLOWED", source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  })
})
