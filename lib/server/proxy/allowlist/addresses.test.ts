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
import { ADDRESS_FULL_ADDRESS_MAX_LENGTH, ADDRESS_TEXT_MAX_LENGTH, ADDRESS_WRITE_MAX_BYTES, addressCreateBodySchema, addressUpdateBodySchema, entries, PERSON_LOCATION_TYPES } from "./addresses"

/**
 * Addresses (Team A, Epic 4) allowlist rows. Pre-created by spec F7-1 so each
 * story adds its rows here, in its own area file, never in a shared table.
 * Add each new entry to the list below in the same change.
 */

const q = (s: string) => new URLSearchParams(s)
const seg = (path: string) => path.split("/")

describe("addresses allowlist area", () => {
  it("has its entries, all aggregated into the shipped allowlist", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual([
      "GET v2/person/location/list",
      "GET v2/public/countries",
      "POST v2/person/location",
      "PUT v2/person/location/{locationId}",
      "DELETE v2/person/location/{locationId}",
    ])
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

/** Story 4.2: the countries read. */
describe("GET v2/public/countries entry", () => {
  const match = matchEntry(ALLOWLIST, "GET", seg("v2/public/countries"))
  if (match.kind !== "matched") throw new Error("expected a match")
  const { entry } = match

  it("GET only, no query, no body, nothing forced", () => {
    expect(entry.body).toBeUndefined()
    expect(entry.fixedQuery).toBeUndefined()
    expect(buildUpstreamQuery(entry, q(""))?.toString()).toBe("")
    expect(buildUpstreamQuery(entry, q("name=Canada"))).toBeNull()
    for (const method of ["POST", "PUT", "DELETE"] as const) expect(matchEntry(ALLOWLIST, method, seg("v2/public/countries")).kind).toBe("method-not-allowed")
  })
})

/** Story 4.2: the write bodies (backend `PersonLocationRequestDTO`, decision 1a). */
describe("POST v2/person/location and PUT v2/person/location/{id} bodies", () => {
  const CREATE = {
    personLocationType: "Home",
    addressLine1: "1 Pine St",
    cityName: "SF",
    stateName: "CA",
    postalCode: "94105",
    country: "United States",
    primary: false,
    validated: false,
  }
  const UPDATE = { ...CREATE, addressLine2: "n/a", county: "n/a", fullAddress: "1 Pine St, SF, 94105, United States" }
  const create = (value: unknown): boolean => addressCreateBodySchema.safeParse(value).success
  const update = (value: unknown): boolean => addressUpdateBodySchema.safeParse(value).success

  it("the entries: JSON bodies capped at 24 KB, numeric ids only, shared (not profile)", () => {
    expect(ADDRESS_WRITE_MAX_BYTES).toBe(24 * 1024)
    const post = matchEntry(ALLOWLIST, "POST", seg("v2/person/location"))
    const put = matchEntry(ALLOWLIST, "PUT", seg("v2/person/location/12"))
    if (post.kind !== "matched" || put.kind !== "matched") throw new Error("expected matches")
    expect(post.entry.body).toBe(addressCreateBodySchema)
    expect(put.entry.body).toBe(addressUpdateBodySchema)
    for (const entry of [post.entry, put.entry]) {
      expect(entry.maxBytes).toBe(ADDRESS_WRITE_MAX_BYTES)
      expect(entry.fixedQuery).toBeUndefined()
      expect(entry.upload).toBeUndefined()
      expect(buildUpstreamQuery(entry, q("personId=4"))).toBeNull()
    }
    expect(matchEntry(ALLOWLIST, "PUT", seg("v2/person/location/9999999999999999999")).kind).toBe("matched")
    for (const id of ["abc", "-1", "1.5", "me", "", "12345678901234567890"]) expect(matchEntry(ALLOWLIST, "PUT", seg(`v2/person/location/${id}`)).kind).not.toBe("matched")
    expect(matchEntry(ALLOWLIST, "GET", seg("v2/person/location")).kind).toBe("method-not-allowed")
    expect(matchEntry(ALLOWLIST, "DELETE", seg("v2/person/location")).kind).toBe("method-not-allowed")
  })

  it("accepts the create body and the update body (with fullAddress), the flags required", () => {
    expect(create(CREATE)).toBe(true)
    expect(update(UPDATE)).toBe(true)
    expect(create({ primary: true, validated: false })).toBe(true)
    expect(create({ ...CREATE, primary: undefined })).toBe(false)
    expect(update({ ...UPDATE, validated: undefined })).toBe(false)
  })

  it.each(PERSON_LOCATION_TYPES)("accepts the backend type %s", (type) => {
    expect(create({ ...CREATE, personLocationType: type })).toBe(true)
    expect(update({ ...UPDATE, personLocationType: type })).toBe(true)
  })

  it.each(["home", "Work", "", "Other"])("refuses the type %j", (type) => {
    expect(create({ ...CREATE, personLocationType: type })).toBe(false)
  })

  it.each(["isPrimary", "isValidated", "countryCode", "lat", "lon", "id", "personId", "name"])("refuses %s", (key) => {
    expect(create({ ...CREATE, [key]: key === "lat" || key === "lon" || key.endsWith("Id") || key === "id" ? 1 : key.startsWith("is") ? true : "US" })).toBe(false)
    expect(update({ ...UPDATE, [key]: key.startsWith("is") ? true : "US" })).toBe(false)
  })

  it("refuses fullAddress on create", () => {
    expect(create({ ...CREATE, fullAddress: "1 Pine St, SF, 94105, United States" })).toBe(false)
  })

  it.each(["addressLine1", "addressLine2", "cityName", "county", "stateName", "postalCode", "country"])(`caps %s at ${ADDRESS_TEXT_MAX_LENGTH} characters and refuses a non-string`, (key) => {
    expect(create({ ...CREATE, [key]: "x".repeat(ADDRESS_TEXT_MAX_LENGTH) })).toBe(true)
    expect(create({ ...CREATE, [key]: "x".repeat(ADDRESS_TEXT_MAX_LENGTH + 1) })).toBe(false)
    expect(update({ ...UPDATE, [key]: "x".repeat(ADDRESS_TEXT_MAX_LENGTH + 1) })).toBe(false)
    expect(create({ ...CREATE, [key]: 7 })).toBe(false)
    expect(create({ ...CREATE, [key]: null })).toBe(false)
  })

  it("caps fullAddress at 1,100 characters (four 255-character parts fit), and refuses non-boolean flags and non-objects", () => {
    expect(ADDRESS_FULL_ADDRESS_MAX_LENGTH).toBe(1100)
    expect(update({ ...UPDATE, fullAddress: "x".repeat(ADDRESS_FULL_ADDRESS_MAX_LENGTH) })).toBe(true)
    expect(update({ ...UPDATE, fullAddress: ["x".repeat(255), "y".repeat(255), "9".repeat(255), "z".repeat(255)].join(", ") })).toBe(true)
    expect(update({ ...UPDATE, fullAddress: "x".repeat(ADDRESS_FULL_ADDRESS_MAX_LENGTH + 1) })).toBe(false)
    expect(create({ ...CREATE, primary: "true" })).toBe(false)
    expect(create({ ...CREATE, validated: 0 })).toBe(false)
    expect(create([CREATE])).toBe(false)
    expect(create(null)).toBe(false)
  })
})

/** The write entries through the real proxy handler (shipped allowlist). */
describe("POST and PUT v2/person/location through the proxy (Story 4.2)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })
  const CREATE = { personLocationType: "Home", addressLine1: "1 Pine St", cityName: "SF", postalCode: "94105", country: "United States", primary: false, validated: false }
  const UPDATE = { ...CREATE, fullAddress: "1 Pine St, SF, 94105, United States" }

  async function send(
    options: { readonly path?: string; readonly method?: string; readonly body?: string; readonly contentType?: string | null } = {},
  ): Promise<Response> {
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    const headers: Record<string, string> = { cookie }
    const contentType = options.contentType === undefined ? "application/json" : options.contentType
    if (contentType !== null) headers["Content-Type"] = contentType
    const method = options.method ?? "POST"
    return proxy(
      new Request(`http://localhost:3000/api/1h/${options.path ?? "v2/person/location"}`, {
        method,
        headers,
        body: method === "GET" ? undefined : (options.body ?? JSON.stringify(method === "PUT" ? UPDATE : CREATE)),
      }),
    )
  }

  beforeEach(() => stubServerEnv())

  it("forwards a POST as sent and relays the created row", async () => {
    let seen: { path: string; search: string; body: unknown } | undefined
    server.use(
      http.post(`${DEMO.apiBase}/v2/person/location`, async ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search, body: await request.json() }
        return HttpResponse.json({ id: 31, primary: false })
      }),
    )
    const response = await send()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 31, primary: false })
    expect(seen).toEqual({ path: "/api/v2/person/location", search: "", body: CREATE })
  })

  it("forwards a PUT to the numeric id as sent", async () => {
    let seen: { path: string; body: unknown } | undefined
    server.use(
      http.put(`${DEMO.apiBase}/v2/person/location/12`, async ({ request }) => {
        seen = { path: new URL(request.url).pathname, body: await request.json() }
        return HttpResponse.json({ id: 12 })
      }),
    )
    const response = await send({ method: "PUT", path: "v2/person/location/12" })
    expect(response.status).toBe(200)
    expect(seen).toEqual({ path: "/api/v2/person/location/12", body: UPDATE })
  })

  it("forwards the countries GET and relays the list", async () => {
    server.use(http.get(`${DEMO.apiBase}/v2/public/countries`, () => HttpResponse.json([{ id: 1, name: "Canada" }])))
    const response = await send({ method: "GET", path: "v2/public/countries" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: 1, name: "Canada" }])
  })

  it.each<[string, Parameters<typeof send>[0], number, string]>([
    ["a text body", { contentType: "text/plain" }, 415, "UNSUPPORTED_MEDIA"],
    ["no content type", { contentType: null }, 415, "UNSUPPORTED_MEDIA"],
    ["a query", { path: "v2/person/location?personId=4" }, 400, "BAD_QUERY"],
    ["isPrimary", { body: JSON.stringify({ ...CREATE, isPrimary: true }) }, 400, "BAD_BODY"],
    ["isValidated on a PUT", { method: "PUT", path: "v2/person/location/12", body: JSON.stringify({ ...UPDATE, isValidated: true }) }, 400, "BAD_BODY"],
    ["countryCode", { body: JSON.stringify({ ...CREATE, countryCode: "US" }) }, 400, "BAD_BODY"],
    ["an unknown field on a PUT", { method: "PUT", path: "v2/person/location/12", body: JSON.stringify({ ...UPDATE, personId: 4 }) }, 400, "BAD_BODY"],
    ["a PUT without primary", { method: "PUT", path: "v2/person/location/12", body: JSON.stringify({ ...UPDATE, primary: undefined }) }, 400, "BAD_BODY"],
    ["a 256-character city", { body: JSON.stringify({ ...CREATE, cityName: "x".repeat(256) }) }, 400, "BAD_BODY"],
    ["malformed JSON", { body: "{" }, 400, "BAD_BODY"],
    ["a non-numeric id", { method: "PUT", path: "v2/person/location/abc" }, 403, "NOT_ALLOWED"],
    ["a DELETE without an id", { method: "DELETE", path: "v2/person/location" }, 405, "METHOD_NOT_ALLOWED"],
    ["a countries query", { method: "GET", path: "v2/public/countries?all=1" }, 400, "BAD_QUERY"],
    ["a body over 24 KB", { body: JSON.stringify({ ...CREATE, pad: "x".repeat(ADDRESS_WRITE_MAX_BYTES) }) }, 413, "TOO_LARGE"],
  ])("refuses %s before upstream", async (_name, options, status, errorCode) => {
    const upstreamCalls = trackAllRequests()
    const response = await send(options)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    expect(upstreamCalls()).toBe(0)
  })
})

/** Story 4.4: the soft delete. */
describe("DELETE v2/person/location/{id} entry", () => {
  const match = matchEntry(ALLOWLIST, "DELETE", seg("v2/person/location/12"))
  if (match.kind !== "matched") throw new Error("expected a match")
  const { entry } = match

  it("numeric ids only, no query, no body, nothing forced, shared (not profile)", () => {
    expect(entry.body).toBeUndefined()
    expect(entry.query).toBeUndefined()
    expect(entry.fixedQuery).toBeUndefined()
    expect(entry.upload).toBeUndefined()
    expect(entry.asImage).toBeUndefined()
    expect(entry.profile).toBeUndefined()
    expect(buildUpstreamQuery(entry, q(""))?.toString()).toBe("")
    expect(buildUpstreamQuery(entry, q("personId=4"))).toBeNull()
    expect(matchEntry(ALLOWLIST, "DELETE", seg("v2/person/location/9999999999999999999")).kind).toBe("matched")
    for (const id of ["abc", "-1", "1.5", "me", "", "12345678901234567890"]) expect(matchEntry(ALLOWLIST, "DELETE", seg(`v2/person/location/${id}`)).kind).not.toBe("matched")
  })
})

describe("DELETE v2/person/location/{id} through the proxy (Story 4.4)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })

  async function remove(options: { readonly path?: string; readonly body?: string; readonly contentType?: string } = {}): Promise<Response> {
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    const headers: Record<string, string> = { cookie }
    if (options.contentType) headers["Content-Type"] = options.contentType
    return proxy(new Request(`http://localhost:3000/api/1h/${options.path ?? "v2/person/location/12"}`, { method: "DELETE", headers, body: options.body }))
  }

  beforeEach(() => stubServerEnv())

  it("forwards the DELETE to the numeric id with no query and no body, and relays the answer", async () => {
    let seen: { path: string; search: string; body: string } | undefined
    server.use(
      http.delete(`${DEMO.apiBase}/v2/person/location/12`, async ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search, body: await request.text() }
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const response = await remove()
    expect(response.status).toBe(204)
    expect(seen).toEqual({ path: "/api/v2/person/location/12", search: "", body: "" })
  })

  it.each<[string, Parameters<typeof remove>[0], number, string]>([
    ["a non-numeric id", { path: "v2/person/location/abc" }, 403, "NOT_ALLOWED"],
    ["a negative id", { path: "v2/person/location/-1" }, 403, "NOT_ALLOWED"],
    ["a query", { path: "v2/person/location/12?personId=4" }, 400, "BAD_QUERY"],
    ["a JSON body", { body: JSON.stringify({ id: 12 }), contentType: "application/json" }, 400, "BAD_BODY"],
    ["a text body", { body: "12", contentType: "text/plain" }, 400, "BAD_BODY"],
  ])("refuses %s before upstream", async (_name, options, status, errorCode) => {
    const upstreamCalls = trackAllRequests()
    const response = await remove(options)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    expect(upstreamCalls()).toBe(0)
  })
})
