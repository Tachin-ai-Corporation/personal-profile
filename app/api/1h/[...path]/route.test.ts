import { beforeEach, describe, expect, it } from "vitest"
import { stubServerEnv } from "@/test/env-fixture"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "./route"

beforeEach(() => stubServerEnv())

const NO_STORE = "private, no-store, max-age=0"
const req = (method: string, path: string) => new Request(`http://localhost:3000/api/1h/${path}`, { method })

describe("/api/1h/[...path] route exports", () => {
  it.each([
    ["GET", GET, "v2/user/myself"],
    ["PUT", PUT, "v2/user/edit"],
  ])("%s is the proxy: no cookie → 401 SESSION_EXPIRED", async (method, handler, path) => {
    const response = await handler(req(method, path))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })

  it.each([
    ["POST", POST],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("%s is the proxy: no shipped entry for it on a known template → 405 envelope", async (method, handler) => {
    const response = await handler(req(method, "v2/user/edit"))
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ errorCode: "METHOD_NOT_ALLOWED", source: "proxy" })
  })

  it.each([
    ["HEAD", HEAD],
    ["OPTIONS", OPTIONS],
  ])("%s answers 405 so Next never auto-implements it", async (_method, handler) => {
    const response = await handler()
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ errorCode: "METHOD_NOT_ALLOWED", source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })
})
