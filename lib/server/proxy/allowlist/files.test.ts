import { describe, expect, it } from "vitest"
import { isDenied } from "../deny-list"
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

/** Spec F7-2 review: deletes go only through the named op `/api/pp/file/{fileId}`. */
describe("file delete", () => {
  it("has no proxy entry, and the deny list refuses it before any allowlist", () => {
    expect(matchEntry(entries, "DELETE", seg("v2/file/42")).kind).toBe("not-allowed")
    expect(entries.some((entry) => entry.method === "DELETE")).toBe(false)
    expect(isDenied("DELETE", seg("v2/file/42"))).toBe(true)
  })
})

/** Spec F7-2 review: the Story 1.9 avatar image, pre-added so the story edits no foundation file. */
describe("profile picture preview", () => {
  it("is an image entry (preview=true forced) that accepts only a numeric v", () => {
    const entry = matched("GET", "v2/user/profile-picture/preview")
    expect(entry.asImage).toBe(true)
    expect(entry.profile).toBeUndefined()
    expect(buildUpstreamQuery(entry, q("v=321"))?.toString()).toBe("v=321&preview=true")
    expect(buildUpstreamQuery(entry, q(""))?.toString()).toBe("preview=true")
    expect(buildUpstreamQuery(entry, q("v=abc"))).toBeNull()
    expect(buildUpstreamQuery(entry, q("v=12345678901234567890"))).toBeNull()
    expect(buildUpstreamQuery(entry, q("v=1&x=2"))).toBeNull()
  })

  it("answers GET only", () => {
    expect(matchEntry(entries, "POST", seg("v2/user/profile-picture/preview")).kind).toBe("method-not-allowed")
    expect(matchEntry(entries, "GET", seg("v2/user/profile-picture/preview/x")).kind).toBe("not-allowed")
  })
})
