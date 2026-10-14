import { beforeEach, describe, expect, it } from "vitest"
import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { stubServerEnv } from "@/test/env-fixture"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, dynamic } from "./route"

beforeEach(() => stubServerEnv())

const NO_STORE = "private, no-store, max-age=0"
const HANDLERS = { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS }

describe("/api/pp/practice-support route exports", () => {
  it("is force-dynamic at the contract path", () => {
    expect(dynamic).toBe("force-dynamic")
    expect(BFF_PATHS.practiceSupport).toBe("/api/pp/practice-support")
  })

  it("GET is the named op: no cookie → 401 SESSION_EXPIRED, no-store", async () => {
    const response = await GET(new Request("http://localhost:3000/api/pp/practice-support", { method: "GET" }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const)("%s answers 405 (explicit, so Next never auto-implements it)", async (method) => {
    const response = await HANDLERS[method](new Request("http://localhost:3000/api/pp/practice-support", { method }))
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ errorCode: "METHOD_NOT_ALLOWED", source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })

  it("HEAD answers 405 with no-store", async () => {
    const response = await HEAD(new Request("http://localhost:3000/api/pp/practice-support", { method: "HEAD" }))
    expect(response.status).toBe(405)
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })
})
