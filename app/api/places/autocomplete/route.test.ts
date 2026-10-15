import { beforeEach, describe, expect, it } from "vitest"
import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { stubServerEnv } from "@/test/env-fixture"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, dynamic } from "./route"

beforeEach(() => stubServerEnv())

const NO_STORE = "private, no-store, max-age=0"
const HANDLERS = { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS }

describe("/api/places/autocomplete route exports", () => {
  it("is force-dynamic at the contract path", () => {
    expect(dynamic).toBe("force-dynamic")
    expect(BFF_PATHS.placesAutocomplete).toBe("/api/places/autocomplete")
  })

  it("POST is the named op: no cookie → 401 SESSION_EXPIRED, no-store", async () => {
    const response = await POST(new Request("http://localhost:3000/api/places/autocomplete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })

  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const)("%s answers 405 (explicit, so Next never auto-implements it)", async (method) => {
    const response = await HANDLERS[method](new Request("http://localhost:3000/api/places/autocomplete", { method }))
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ errorCode: "METHOD_NOT_ALLOWED", source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })

  it("HEAD answers 405 with no-store", async () => {
    const response = await HEAD(new Request("http://localhost:3000/api/places/autocomplete", { method: "HEAD" }))
    expect(response.status).toBe(405)
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE)
  })
})
