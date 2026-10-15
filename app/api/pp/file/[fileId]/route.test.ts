import { beforeEach, describe, expect, it } from "vitest"
import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { stubServerEnv } from "@/test/env-fixture"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, dynamic } from "./route"

beforeEach(() => stubServerEnv())

const NO_STORE = "private, no-store, max-age=0"
const HANDLERS = { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS }
const URL = "http://localhost:3000/api/pp/file/7"
const context = { params: Promise.resolve({ fileId: "7" }) }

describe("/api/pp/file/[fileId] route exports (spec F7-2)", () => {
  it("is force-dynamic at the contract path", () => {
    expect(dynamic).toBe("force-dynamic")
    expect(`${BFF_PATHS.fileDeletePrefix}7`).toBe("/api/pp/file/7")
  })

  it("DELETE is the named op: no cookie → 401 SESSION_EXPIRED, no-store", async () => {
    const response = await DELETE(new Request(URL, { method: "DELETE" }), context)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })

  it.each(["GET", "POST", "PUT", "PATCH", "OPTIONS", "HEAD"] as const)("%s answers 405 (explicit, so Next never auto-implements it)", async (method) => {
    const response = await HANDLERS[method](new Request(URL, { method }), context)
    expect(response.status).toBe(405)
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })
})
