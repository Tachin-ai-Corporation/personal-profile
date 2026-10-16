import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import { createProxyHandler } from "../handler"
import { buildUpstreamQuery, matchEntry } from "../match"
import { ALLOWLIST } from "."
import { CONTACT_POINT_MANAGE_MAX_BYTES, CONTACT_POINT_MANAGE_MAX_ROWS, contactPointManageBodySchema, entries } from "./contacts"

const q = (s: string) => new URLSearchParams(s)
const seg = (path: string) => path.split("/")
const [entry] = entries

describe("contact-point list", () => {
  it("is the one shared GET, not a Profile-module entry; every entry is aggregated", () => {
    expect(entries.map((e) => `${e.method} ${e.template}`)).toEqual([
      "GET v2/user/contact-point/list",
      "GET v2/type/key/ContactPoint",
      "POST v2/health/contact-point",
    ])
    expect(entries.every((e) => e.profile === undefined)).toBe(true)
    for (const e of entries) expect(ALLOWLIST).toContain(e)
  })

  it("accepts repeatable types, Social Media included", () => {
    expect(buildUpstreamQuery(entry, q("type=Email&type=Mobile&type=Landline&type=Social+Media"))?.getAll("type")).toEqual([
      "Email",
      "Mobile",
      "Landline",
      "Social Media",
    ])
    expect(buildUpstreamQuery(entry, q("type=Social%20Media"))?.get("type")).toBe("Social Media")
  })

  it.each(["Fax", "Social", "social media", "Social  Media", "Email,Mobile"])("rejects type %j", (type) => {
    expect(buildUpstreamQuery(entry, q(`type=${encodeURIComponent(type)}`))).toBeNull()
  })
})

/** Story 3.2: the one manage call (backend `ManageContactPointDTO`). */
describe("POST v2/health/contact-point entry", () => {
  const ADD = { value: "+14155550101", type: "Mobile", label: "Personal", isNotificationEnabled: false, phoneNumberRegion: "us" }
  const UPDATE = { id: 7, type: "Mobile", label: "Work", isNotificationEnabled: false }
  const body = (overrides: Record<string, unknown> = {}) => ({ contactPointsToAdd: [], contactPointsToUpdate: [], contactPointsToRemove: [], ...overrides })
  const valid = (value: unknown): boolean => contactPointManageBodySchema.safeParse(value).success

  it("POST only, no query, a JSON body capped at 64 KB, nothing forced, shared (not profile)", () => {
    const match = matchEntry(entries, "POST", seg("v2/health/contact-point"))
    if (match.kind !== "matched") throw new Error("expected a match")
    expect(match.entry.maxBytes).toBe(CONTACT_POINT_MANAGE_MAX_BYTES)
    expect(CONTACT_POINT_MANAGE_MAX_BYTES).toBe(64 * 1024)
    expect(match.entry.fixedQuery).toBeUndefined()
    expect(match.entry.upload).toBeUndefined()
    expect(buildUpstreamQuery(match.entry, q(""))?.toString()).toBe("")
    expect(buildUpstreamQuery(match.entry, q("x=1"))).toBeNull()
    for (const method of ["GET", "PUT", "DELETE"] as const) expect(matchEntry(ALLOWLIST, method, seg("v2/health/contact-point")).kind).toBe("method-not-allowed")
  })

  it("accepts the three lists, empty or full (not all empty)", () => {
    expect(valid(body({ contactPointsToRemove: [8] }))).toBe(true)
    expect(valid(body({ contactPointsToAdd: [ADD], contactPointsToUpdate: [UPDATE], contactPointsToRemove: [8, 9] }))).toBe(true)
    // The optional fields may be left out.
    expect(valid(body({ contactPointsToAdd: [{ value: "ann@example.com", type: "Email", label: "Work" }], contactPointsToUpdate: [{ id: 3, type: "Email", label: "Primary" }] }))).toBe(true)
  })

  it.each(["contactPointsToAdd", "contactPointsToUpdate", "contactPointsToRemove"])("requires %s as an array", (key) => {
    const rest: Record<string, unknown> = body({ contactPointsToAdd: [ADD], contactPointsToUpdate: [UPDATE], contactPointsToRemove: [8] })
    delete rest[key]
    expect(valid(rest)).toBe(false)
    expect(valid(body({ contactPointsToRemove: [8], [key]: null }))).toBe(false)
    expect(valid(body({ contactPointsToRemove: [8], [key]: {} }))).toBe(false)
  })

  it("rejects an unknown key at every level", () => {
    expect(valid({ ...body({ contactPointsToRemove: [8] }), extra: [] })).toBe(false)
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, id: 3 }] }))).toBe(false)
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, isVerified: true }] }))).toBe(false)
    expect(valid(body({ contactPointsToUpdate: [{ ...UPDATE, value: "+14155550101" }] }))).toBe(false)
  })

  it.each(["Email", "Mobile", "Landline", "Social Media"])("accepts the type %s", (type) => {
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, type }], contactPointsToUpdate: [{ ...UPDATE, type }] }))).toBe(true)
  })

  it.each(["Fax", "Home", "mobile", "", "Other"])("rejects the type %j", (type) => {
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, type }] }))).toBe(false)
    expect(valid(body({ contactPointsToUpdate: [{ ...UPDATE, type }] }))).toBe(false)
  })

  it.each(["Primary", "Home", "Main", "Old", "Personal", "Mailing List", "Work"])("accepts the label %s", (label) => {
    // A Primary may be added only for a type other than Email and Mobile.
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, type: "Landline", label }], contactPointsToUpdate: [{ ...UPDATE, label }] }))).toBe(true)
  })

  it.each<[string, Record<string, unknown>]>([
    ["an empty request", {}],
    ["an id updated twice", { contactPointsToUpdate: [UPDATE, { ...UPDATE, label: "Home" }] }],
    ["an id removed twice", { contactPointsToRemove: [8, 8] }],
    ["an id updated and removed", { contactPointsToUpdate: [UPDATE], contactPointsToRemove: [UPDATE.id] }],
    ["a Primary Mobile in an add", { contactPointsToAdd: [{ ...ADD, label: "Primary" }] }],
    ["a Primary Email in an add", { contactPointsToAdd: [{ value: "ann@example.com", type: "Email", label: "Primary" }] }],
  ])("refuses %s", (_case, lists) => {
    expect(valid(body(lists))).toBe(false)
  })

  it.each(["Partnership Organization", "work", "", "Other"])("rejects the label %j", (label) => {
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, label }] }))).toBe(false)
    expect(valid(body({ contactPointsToUpdate: [{ ...UPDATE, label }] }))).toBe(false)
  })

  it("checks the add value (1–2048), notifications (boolean) and region (two lower-case letters)", () => {
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, value: "x".repeat(2048) }] }))).toBe(true)
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, value: "x".repeat(2049) }] }))).toBe(false)
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, value: "" }] }))).toBe(false)
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, value: 4155550101 }] }))).toBe(false)
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, isNotificationEnabled: "false" }] }))).toBe(false)
    for (const region of ["US", "usa", "u", "", "1a"]) expect(valid(body({ contactPointsToAdd: [{ ...ADD, phoneNumberRegion: region }] }))).toBe(false)
    expect(valid(body({ contactPointsToAdd: [{ ...ADD, phoneNumberRegion: "gb" }] }))).toBe(true)
  })

  it("checks the ids: positive integers only", () => {
    for (const id of [0, -1, 1.5, "7", null]) {
      expect(valid(body({ contactPointsToUpdate: [{ ...UPDATE, id }] }))).toBe(false)
      expect(valid(body({ contactPointsToUpdate: [UPDATE], contactPointsToRemove: [id] }))).toBe(false)
    }
    expect(valid(body({ contactPointsToUpdate: [{ ...UPDATE, isNotificationEnabled: 1 }] }))).toBe(false)
  })

  it(`holds at most ${CONTACT_POINT_MANAGE_MAX_ROWS} rows per list`, () => {
    const many = <T>(item: (index: number) => T, count: number): T[] => Array.from({ length: count }, (_, index) => item(index))
    expect(valid(body({ contactPointsToRemove: many((index) => index + 1, 100) }))).toBe(true)
    expect(valid(body({ contactPointsToRemove: many((index) => index + 1, 101) }))).toBe(false)
    expect(valid(body({ contactPointsToAdd: many(() => ADD, 101) }))).toBe(false)
    expect(valid(body({ contactPointsToUpdate: many((index) => ({ ...UPDATE, id: index + 1 }), 101) }))).toBe(false)
  })
})

/** The entry through the real proxy handler (shipped allowlist). */
describe("POST v2/health/contact-point through the proxy (Story 3.2)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })
  const BODY = {
    contactPointsToAdd: [{ value: "+14155550101", type: "Mobile", label: "Personal", isNotificationEnabled: false, phoneNumberRegion: "us" }],
    contactPointsToUpdate: [],
    contactPointsToRemove: [7],
  }

  async function post(options: { readonly path?: string; readonly method?: string; readonly body?: string; readonly contentType?: string | null } = {}): Promise<Response> {
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    const headers: Record<string, string> = { cookie }
    const contentType = options.contentType === undefined ? "application/json" : options.contentType
    if (contentType !== null) headers["Content-Type"] = contentType
    const method = options.method ?? "POST"
    return proxy(
      new Request(`http://localhost:3000/api/1h/${options.path ?? "v2/health/contact-point"}`, {
        method,
        headers,
        body: method === "GET" ? undefined : (options.body ?? JSON.stringify(BODY)),
      }),
    )
  }

  beforeEach(() => stubServerEnv())

  it("forwards the body as sent to upstream /api/v2/health/contact-point and relays the 200", async () => {
    let seen: { path: string; search: string; body: unknown } | undefined
    server.use(
      http.post(`${DEMO.apiBase}/v2/health/contact-point`, async ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search, body: await request.json() }
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const response = await post()
    expect(response.status).toBe(200)
    expect(seen).toEqual({ path: "/api/v2/health/contact-point", search: "", body: BODY })
  })

  it.each<[string, Parameters<typeof post>[0], number, string]>([
    ["a text body", { contentType: "text/plain" }, 415, "UNSUPPORTED_MEDIA"],
    ["no content type", { contentType: null }, 415, "UNSUPPORTED_MEDIA"],
    ["a GET", { method: "GET" }, 405, "METHOD_NOT_ALLOWED"],
    ["a PUT", { method: "PUT" }, 405, "METHOD_NOT_ALLOWED"],
    ["a query", { path: "v2/health/contact-point?personId=4" }, 400, "BAD_QUERY"],
    ["a missing list", { body: JSON.stringify({ contactPointsToAdd: [], contactPointsToUpdate: [] }) }, 400, "BAD_BODY"],
    ["an unknown key", { body: JSON.stringify({ ...BODY, personId: 4 }) }, 400, "BAD_BODY"],
    ["a bad type", { body: JSON.stringify({ ...BODY, contactPointsToAdd: [{ ...BODY.contactPointsToAdd[0], type: "Fax" }] }) }, 400, "BAD_BODY"],
    ["a bad label", { body: JSON.stringify({ ...BODY, contactPointsToAdd: [{ ...BODY.contactPointsToAdd[0], label: "Partnership Organization" }] }) }, 400, "BAD_BODY"],
    ["too many rows", { body: JSON.stringify({ ...BODY, contactPointsToRemove: Array.from({ length: 101 }, (_, index) => index + 1) }) }, 400, "BAD_BODY"],
    ["an empty request", { body: JSON.stringify({ contactPointsToAdd: [], contactPointsToUpdate: [], contactPointsToRemove: [] }) }, 400, "BAD_BODY"],
    ["an id removed twice", { body: JSON.stringify({ ...BODY, contactPointsToRemove: [7, 7] }) }, 400, "BAD_BODY"],
    ["an id updated twice", { body: JSON.stringify({ ...BODY, contactPointsToUpdate: [{ id: 3, type: "Mobile", label: "Work" }, { id: 3, type: "Mobile", label: "Home" }] }) }, 400, "BAD_BODY"],
    ["an id updated and removed", { body: JSON.stringify({ ...BODY, contactPointsToUpdate: [{ id: 7, type: "Mobile", label: "Work" }] }) }, 400, "BAD_BODY"],
    ["a Primary Mobile in an add", { body: JSON.stringify({ ...BODY, contactPointsToAdd: [{ ...BODY.contactPointsToAdd[0], label: "Primary" }] }) }, 400, "BAD_BODY"],
    ["malformed JSON", { body: "{" }, 400, "BAD_BODY"],
    ["a body over 64 KB", { body: JSON.stringify({ ...BODY, pad: "x".repeat(CONTACT_POINT_MANAGE_MAX_BYTES) }) }, 413, "TOO_LARGE"],
  ])("refuses %s before upstream", async (_name, options, status, errorCode) => {
    const upstreamCalls = trackAllRequests()
    const response = await post(options)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    expect(upstreamCalls()).toBe(0)
  })
})
