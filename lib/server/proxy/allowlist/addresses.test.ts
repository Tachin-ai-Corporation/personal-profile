import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import { createProxyHandler } from "../handler"
import { buildUpstreamQuery, matchEntry } from "../match"
import { ALLOWLIST } from "./index"
import { entries } from "./addresses"

/**
 * Addresses (Team A, Epic 4) allowlist rows. Pre-created by spec F7-1 so each
 * story adds its rows here, in its own area file, never in a shared table.
 * Add each new entry to the list below in the same change.
 */

const q = (s: string) => new URLSearchParams(s)
const seg = (path: string) => path.split("/")

describe("addresses allowlist area", () => {
  it("has its entries, all aggregated into the shipped allowlist", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual(["GET v2/person/location/list"])
    for (const entry of entries) expect(ALLOWLIST).toContain(entry)
  })

  it("no entry is tagged `profile` (`/` entries stay on when ACCOUNT_DISABLED is set)", () => {
    expect(entries.filter((entry) => entry.profile !== undefined)).toEqual([])
  })
})

/** Story 4.1: the list read. */
describe("GET v2/person/location/list entry", () => {
  const match = matchEntry(ALLOWLIST, "GET", seg("v2/person/location/list"))
  if (match.kind !== "matched") throw new Error("expected a match")
  const { entry } = match

  it("GET only, no body, nothing forced", () => {
    expect(entry.body).toBeUndefined()
    expect(entry.fixedQuery).toBeUndefined()
    expect(entry.asImage).toBeUndefined()
    for (const method of ["POST", "PUT", "DELETE"] as const) expect(matchEntry(ALLOWLIST, method, seg("v2/person/location/list")).kind).toBe("method-not-allowed")
  })

  it("passes page (0–9999) and size (1–100) through as sent; both are optional", () => {
    expect(buildUpstreamQuery(entry, q("page=0&size=100"))?.toString()).toBe("page=0&size=100")
    expect(buildUpstreamQuery(entry, q("page=9999&size=1"))?.toString()).toBe("page=9999&size=1")
    expect(buildUpstreamQuery(entry, q("page=10&size=99"))?.toString()).toBe("page=10&size=99")
    expect(buildUpstreamQuery(entry, q("size=50"))?.toString()).toBe("size=50")
    expect(buildUpstreamQuery(entry, q(""))?.toString()).toBe("")
  })

  it.each([
    ["another param", "page=0&size=100&sort=x"],
    ["an owner param", "page=0&personId=4"],
    ["a repeated page", "page=0&page=1"],
    ["a repeated size", "size=100&size=100"],
    ["a negative page", "page=-1"],
    ["a non-digit size", "size=1e2"],
    ["an empty size", "size="],
    ["a size of 0", "size=0"],
    ["a size over 100", "size=101"],
    ["a size with a leading zero", "size=0100"],
    ["a page with a leading zero", "page=01"],
    ["a five-digit page", "page=10000"],
  ])("refuses %s", (_case, query) => {
    expect(buildUpstreamQuery(entry, q(query))).toBeNull()
  })
})

/** The entry through the real proxy handler (shipped allowlist). */
describe("GET v2/person/location/list through the proxy (Story 4.1)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })

  async function get(path: string, method = "GET"): Promise<Response> {
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    return proxy(new Request(`http://localhost:3000/api/1h/${path}`, { method, headers: { cookie } }))
  }

  beforeEach(() => stubServerEnv())

  it("forwards page 0 of 100 to upstream /api/v2/person/location/list and relays the Page", async () => {
    let seen: { path: string; search: string } | undefined
    server.use(
      http.get(`${DEMO.apiBase}/v2/person/location/list`, ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search }
        return HttpResponse.json({ content: [], totalElements: 0 })
      }),
    )
    const response = await get("v2/person/location/list?page=0&size=100")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ content: [], totalElements: 0 })
    expect(seen).toEqual({ path: "/api/v2/person/location/list", search: "?page=0&size=100" })
  })

  it.each<[string, string, string, number, string]>([
    ["another param", "GET", "v2/person/location/list?page=0&size=100&sort=x", 400, "BAD_QUERY"],
    ["a repeated param", "GET", "v2/person/location/list?page=0&page=1&size=100", 400, "BAD_QUERY"],
    ["a non-digit size", "GET", "v2/person/location/list?page=0&size=all", 400, "BAD_QUERY"],
    ["a POST", "POST", "v2/person/location/list", 405, "METHOD_NOT_ALLOWED"],
  ])("refuses %s before upstream", async (_name, method, path, status, errorCode) => {
    const upstreamCalls = trackAllRequests()
    const response = await get(path, method)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    expect(upstreamCalls()).toBe(0)
  })
})
