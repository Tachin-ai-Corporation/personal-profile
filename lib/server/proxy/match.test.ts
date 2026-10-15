import { describe, expect, it } from "vitest"
import { buildUpstreamQuery, logTemplate, matchEntry, upstreamSegments, validateQuery } from "./match"
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

  describe("required params (spec F6-3)", () => {
    // Shapes of the planned rules: NPI search (Story 9.1) and time zone / locale (Story 7.5).
    const NPI_SEARCH: AllowlistEntry = {
      method: "GET",
      template: "v2/public/npi/list",
      query: {
        entityTypeCode: { pattern: /^[12]$/, required: true },
        searchText: { pattern: /^[^]{0,100}$/ },
        page: { pattern: /^\d{1,4}$/ },
        limit: { pattern: /^([1-9]|10)$/ },
      },
    }
    const TIME_ZONE: AllowlistEntry = {
      method: "POST",
      template: "v2/user/time-zone",
      query: { timeZone: { pattern: /^America\/Chicago$/, required: true } },
    }

    it("accepts a request carrying every required param", () => {
      expect(buildUpstreamQuery(NPI_SEARCH, q("entityTypeCode=1&searchText=&page=0&limit=10"))?.get("entityTypeCode")).toBe("1")
      expect(buildUpstreamQuery(TIME_ZONE, q("timeZone=America%2FChicago"))?.toString()).toBe("timeZone=America%2FChicago")
    })

    it.each(["", "searchText=ann&page=0&limit=10", "entityTypeCode=3", "entityTypeCode="])("rejects NPI search %j (missing or bad entityTypeCode)", (query) => {
      expect(buildUpstreamQuery(NPI_SEARCH, q(query))).toBeNull()
    })

    it("rejects a time-zone call without timeZone, or with another zone", () => {
      expect(buildUpstreamQuery(TIME_ZONE, q(""))).toBeNull()
      expect(buildUpstreamQuery(TIME_ZONE, q("timeZone=Europe%2FParis"))).toBeNull()
    })

    it("keeps optional params optional, and a required name filled by a fixed param never satisfies itself", () => {
      expect(validateQuery({ page: { pattern: /^\d$/ } }, {}, q(""))?.toString()).toBe("")
      expect(validateQuery({ locale: { pattern: /^en-US$/, required: true } }, { locale: "en-US" }, q("locale=en-US"))).toBeNull()
    })
  })
})
