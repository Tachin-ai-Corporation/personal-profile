import { describe, expect, it } from "vitest"
import { buildUpstreamQuery, matchEntry } from "../match"
import { ALLOWLIST } from "."
import { entries as contacts } from "./contacts"
import { entries as insurance } from "./insurance"
import { entries as personal } from "./personal"

const seg = (path: string) => path.split("/")

/** `GET v2/type/key/{Type}` (spec F6-3): one literal entry per type, each in its own area file (Stories 2.1, 3.1, 5.2). */
describe("type-key entries", () => {
  it.each([
    ["Person", personal],
    ["ContactPoint", contacts],
    ["Insurance", insurance],
  ] as const)("GET v2/type/key/%s lives in its area file: no query, no body, shared (not profile)", (type, area) => {
    const match = matchEntry(area, "GET", seg(`v2/type/key/${type}`))
    if (match.kind !== "matched") throw new Error("expected a match")
    expect(match.entry.body).toBeUndefined()
    expect(match.entry.profile).toBeUndefined()
    expect(buildUpstreamQuery(match.entry, new URLSearchParams(""))?.toString()).toBe("")
    expect(buildUpstreamQuery(match.entry, new URLSearchParams("x=1"))).toBeNull()
    expect(matchEntry(ALLOWLIST, "PUT", seg(`v2/type/key/${type}`)).kind).toBe("method-not-allowed")
  })

  it.each(["Organization", "person", "User", "1", "Person/extra"])("any other type key (%s) is not allowed", (type) => {
    expect(matchEntry(ALLOWLIST, "GET", seg(`v2/type/key/${type}`)).kind).toBe("not-allowed")
  })
})
