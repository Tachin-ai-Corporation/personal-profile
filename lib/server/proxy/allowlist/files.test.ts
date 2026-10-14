import { describe, expect, it } from "vitest"
import { buildUpstreamQuery, matchEntry } from "../match"
import { entries } from "./files"

const q = (s: string) => new URLSearchParams(s)
const seg = (path: string) => path.split("/")

describe("file download", () => {
  it("is an image entry for a numeric id that forces preview=true, not a Profile-module entry", () => {
    const match = matchEntry(entries, "GET", seg("v2/file/123/download"))
    expect(match.kind).toBe("matched")
    const [entry] = entries
    expect(entry.asImage).toBe(true)
    expect(entry.profile).toBeUndefined()
    expect(buildUpstreamQuery(entry, q(""))?.toString()).toBe("preview=true")
    expect(buildUpstreamQuery(entry, q("preview=false"))?.toString()).toBe("preview=true")
  })

  it("rejects any client query and a non-numeric id", () => {
    const [entry] = entries
    expect(buildUpstreamQuery(entry, q("x=1"))).toBeNull()
    expect(buildUpstreamQuery(entry, q("fromSKid=4"))).toBeNull()
    expect(matchEntry(entries, "GET", seg("v2/file/abc/download")).kind).toBe("not-allowed")
    expect(matchEntry(entries, "DELETE", seg("v2/file/1/download")).kind).toBe("method-not-allowed")
  })
})
