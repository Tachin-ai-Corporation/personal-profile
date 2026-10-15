import { describe, expect, it } from "vitest"
import { buildUpstreamQuery, matchEntry } from "../match"
import type { ProxyMethod } from "../types"
import { entries } from "./files"

const q = (s: string) => new URLSearchParams(s)
const seg = (path: string) => path.split("/")

function matched(method: ProxyMethod, path: string) {
  const match = matchEntry(entries, method, seg(path))
  if (match.kind !== "matched") throw new Error(`${method} ${path} did not match`)
  return match.entry
}

describe("file download", () => {
  it("is an image entry for a numeric id that forces preview=true, not a Profile-module entry", () => {
    const entry = matched("GET", "v2/file/123/download")
    expect(entry.asImage).toBe(true)
    expect(entry.profile).toBeUndefined()
    expect(buildUpstreamQuery(entry, q(""))?.toString()).toBe("preview=true")
    expect(buildUpstreamQuery(entry, q("preview=false"))?.toString()).toBe("preview=true")
  })

  it("rejects any client query and a non-numeric id", () => {
    const entry = matched("GET", "v2/file/123/download")
    expect(buildUpstreamQuery(entry, q("x=1"))).toBeNull()
    expect(buildUpstreamQuery(entry, q("fromSKid=4"))).toBeNull()
    expect(matchEntry(entries, "GET", seg("v2/file/abc/download")).kind).toBe("not-allowed")
    expect(matchEntry(entries, "DELETE", seg("v2/file/1/download")).kind).toBe("method-not-allowed")
  })
})

/** Spec F7-2: the one hard-delete entry Stories 1.10, 2.4 and 5.3 share. */
describe("file delete", () => {
  it("forces hardDelete=true, with no body and not a Profile-module entry", () => {
    const entry = matched("DELETE", "v2/file/42")
    expect(entry.asImage).toBeUndefined()
    expect(entry.body).toBeUndefined()
    expect(entry.upload).toBeUndefined()
    expect(entry.profile).toBeUndefined()
    expect(buildUpstreamQuery(entry, q(""))?.toString()).toBe("hardDelete=true")
  })

  it("ignores a client hardDelete (false still reaches upstream as true)", () => {
    const entry = matched("DELETE", "v2/file/42")
    expect(buildUpstreamQuery(entry, q("hardDelete=false"))?.toString()).toBe("hardDelete=true")
  })

  it("rejects any other query, a non-numeric id, an id list and other methods", () => {
    const entry = matched("DELETE", "v2/file/42")
    expect(buildUpstreamQuery(entry, q("x=1"))).toBeNull()
    expect(buildUpstreamQuery(entry, q("hardDelete=false&x=1"))).toBeNull()
    expect(matchEntry(entries, "DELETE", seg("v2/file/abc")).kind).toBe("not-allowed")
    expect(matchEntry(entries, "DELETE", seg("v2/file/1,2")).kind).toBe("not-allowed")
    expect(matchEntry(entries, "DELETE", seg("v2/file/me")).kind).toBe("not-allowed")
    expect(matchEntry(entries, "GET", seg("v2/file/42")).kind).toBe("method-not-allowed")
    expect(matchEntry(entries, "PUT", seg("v2/file/42")).kind).toBe("method-not-allowed")
  })
})
