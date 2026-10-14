import { describe, expect, it } from "vitest"
import { ALLOWLIST, userEditBodySchema } from "./allowlist"
import { buildUpstreamQuery, logTemplate, matchEntry, upstreamSegments } from "./match"
import type { AllowlistEntry } from "./types"

const FIXTURES: AllowlistEntry[] = [
  { method: "GET", template: "v2/person/{personId}/ssn/expose" },
  { method: "PUT", template: "v2/person/location/{id}" },
  { method: "GET", template: "v2/user/{userId}/things", query: { page: { pattern: /^\d{1,4}$/ } } },
  { method: "POST", template: "v2/file/upload", fixedQuery: { isPublic: "false" }, query: { name: { pattern: /^\w+$/ } } },
  { method: "GET", template: "v2/file/{id}/download", asImage: true },
]
const seg = (path: string) => path.split("/")
const owner = { personId: 4242, userId: 42 }

describe("matchEntry", () => {
  it("matches METHOD + template exactly", () => {
    expect(matchEntry(FIXTURES, "GET", seg("v2/person/me/ssn/expose"))).toEqual({ kind: "matched", entry: FIXTURES[0] })
    expect(matchEntry(FIXTURES, "PUT", seg("v2/person/location/77"))).toEqual({ kind: "matched", entry: FIXTURES[1] })
  })

  it.each([
    ["an owner id other than me", "GET", "v2/person/4242/ssn/expose", "not-allowed"],
    ["a non-numeric id", "PUT", "v2/person/location/abc", "not-allowed"],
    ["a 20-digit id", "PUT", "v2/person/location/12345678901234567890", "not-allowed"],
    ["mixed case", "GET", "V2/User/Myself", "not-allowed"],
    ["an unknown path", "GET", "v2/unknown", "not-allowed"],
    ["a known template with another method", "DELETE", "v2/person/location/7", "method-not-allowed"],
  ] as const)("rejects %s", (_label, method, path, kind) => {
    expect(matchEntry(FIXTURES, method, seg(path)).kind).toBe(kind)
  })

  it("substitutes owner ids from the session", () => {
    expect(upstreamSegments(FIXTURES[0], seg("v2/person/me/ssn/expose"), owner)).toEqual(seg("v2/person/4242/ssn/expose"))
    expect(upstreamSegments(FIXTURES[2], seg("v2/user/me/things"), owner)).toEqual(seg("v2/user/42/things"))
    expect(logTemplate(FIXTURES[0])).toBe("/v2/person/{personId}/ssn/expose")
  })
})

describe("buildUpstreamQuery", () => {
  const q = (s: string) => new URLSearchParams(s)

  it("passes allowlisted params and rejects others", () => {
    expect(buildUpstreamQuery(FIXTURES[2], q("page=3"))?.toString()).toBe("page=3")
    expect(buildUpstreamQuery(FIXTURES[2], q("page=abc"))).toBeNull()
    expect(buildUpstreamQuery(FIXTURES[2], q("size=3"))).toBeNull()
    expect(buildUpstreamQuery(FIXTURES[2], q("_method=DELETE"))).toBeNull()
    expect(buildUpstreamQuery(FIXTURES[2], q("page=1&page=2"))).toBeNull()
    expect(buildUpstreamQuery(FIXTURES[0], q(""))?.toString()).toBe("")
  })

  it("fixes server params, ignoring client values", () => {
    expect(buildUpstreamQuery(FIXTURES[3], q("isPublic=true&name=a"))?.toString()).toBe("name=a&isPublic=false")
  })

  it("forces preview=true on image entries", () => {
    expect(buildUpstreamQuery(FIXTURES[4], q("preview=false"))?.toString()).toBe("preview=true")
  })

  it("accepts repeatable contact-point types from the shipped allowlist", () => {
    const entry = ALLOWLIST[1]
    expect(buildUpstreamQuery(entry, q("type=Email&type=Mobile&type=Landline"))?.getAll("type")).toEqual(["Email", "Mobile", "Landline"])
    expect(buildUpstreamQuery(entry, q("type=Fax"))).toBeNull()
  })
})

describe("shipped allowlist", () => {
  it("ships exactly myself, contact-point/list and user/edit", () => {
    expect(ALLOWLIST.map((e) => `${e.method} ${e.template}`)).toEqual([
      "GET v2/user/myself",
      "GET v2/user/contact-point/list",
      "PUT v2/user/edit",
    ])
  })

  it.each(["email", "phoneNumber", "phoneNumberRegion", "locale", "roleId", "receiveNotifications"])("user/edit rejects %s", (field) => {
    expect(userEditBodySchema.safeParse({ firstName: "Ann", [field]: "x" }).success).toBe(false)
  })

  it("user/edit accepts personal fields", () => {
    expect(userEditBodySchema.safeParse({ firstName: "Ann", lastName: "Lee", birthDate: "1990-01-31" }).success).toBe(true)
  })

  it.each([
    [{ firstName: "A" }, true],
    [{ firstName: "x".repeat(24) }, true],
    [{ firstName: "" }, false],
    [{ firstName: "x".repeat(25) }, false],
    [{ lastName: "" }, false],
    [{ lastName: "y".repeat(25) }, false],
    [{ middleName: "n/a" }, true],
    [{ middleName: "z".repeat(25) }, false],
    [{ birthDate: "1990-01-31" }, true],
    [{ birthDate: "n/a" }, false],
    [{ birthDate: "01/31/1990" }, false],
    [{ socialSecurityNumber: "123-45-6789" }, true],
    [{ socialSecurityNumber: "123456789" }, true],
    [{ socialSecurityNumber: "n/a" }, true],
    [{ socialSecurityNumber: "12-345-6789" }, false],
    [{ socialSecurityNumber: "12345678" }, false],
    [{ socialSecurityNumber: "123-45-678x" }, false],
  ])("user/edit %j → valid: %s", (body, expected) => {
    expect(userEditBodySchema.safeParse(body).success).toBe(expected)
  })
})
