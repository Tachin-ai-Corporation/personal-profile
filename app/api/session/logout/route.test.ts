import { beforeEach, describe, expect, it } from "vitest"
import { stubServerEnv } from "@/test/env-fixture"
import { trackAllRequests } from "@/test/msw-server"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "./route"

beforeEach(() => stubServerEnv())

const CLEARED = "__Host-pp_s=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"

describe("/api/session/logout route exports", () => {
  it.each([
    ["POST", POST],
    ["GET", GET],
  ])("%s logs out identically: 204, cookie cleared (no session → no upstream call)", async (method, handler) => {
    const calls = trackAllRequests()
    const response = await handler(new Request("http://localhost:3000/api/session/logout", { method }))
    expect(response.status).toBe(204)
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
    expect(calls()).toBe(0)
  })

  it.each([
    ["HEAD", HEAD],
    ["OPTIONS", OPTIONS],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("%s answers the 405 envelope (HEAD never runs a logout)", async (_method, handler) => {
    const response = await handler()
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ errorCode: "METHOD_NOT_ALLOWED", source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })
})
