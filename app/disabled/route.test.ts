import { beforeEach, describe, expect, it } from "vitest"
import { stubServerEnv } from "@/test/env-fixture"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, dynamic } from "./route"

const req = (method = "GET") => new Request("http://localhost:3000/disabled", { method })

describe("/disabled route exports", () => {
  beforeEach(() => stubServerEnv({ PP_DISABLED: "1" }))

  it("is force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it.each([
    ["GET", GET],
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
    ["OPTIONS", OPTIONS],
  ])("%s answers the 503 disabled screen", async (method, handler) => {
    const response = await handler(req(method))
    expect(response.status).toBe(503)
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8")
    expect(await response.text()).toContain("<h1>")
  })

  it("HEAD answers 503 with no body", async () => {
    const response = await HEAD(req("HEAD"))
    expect(response.status).toBe(503)
    expect(await response.text()).toBe("")
  })

  it("is 404 while no switch is on", async () => {
    stubServerEnv({ PP_DISABLED: "" })
    expect((await GET(req())).status).toBe(404)
  })
})
