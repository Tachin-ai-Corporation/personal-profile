import { describe, expect, it } from "vitest"
import { buildUpstreamQuery, matchEntry } from "../match"
import { entries, IMAGE_UPLOAD_MAX_BYTES } from "./core"

const seg = (path: string) => path.split("/")
const q = (query: string) => new URLSearchParams(query)
const PICTURE = "v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload"

describe("core entries", () => {
  it("ships GET v2/user/myself and the picture upload, none a Profile-module entry", () => {
    expect(entries.map((e) => `${e.method} ${e.template}`)).toEqual([
      "GET v2/user/myself",
      "POST v2/health/type/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload",
    ])
    expect(entries.every((e) => e.profile === undefined)).toBe(true)
  })

  it("Profile Picture upload (Story 1.10): me only, no client query, isPublic=true forced, PNG/JPEG/BMP `file`, 4 MB", () => {
    const match = matchEntry(entries, "POST", seg(PICTURE))
    if (match.kind !== "matched") throw new Error("expected a match")
    expect(match.entry).toMatchObject({ upload: { part: "file", types: ["png", "jpeg", "bmp"] }, maxBytes: IMAGE_UPLOAD_MAX_BYTES })
    expect(IMAGE_UPLOAD_MAX_BYTES).toBe(4 * 1024 * 1024)
    expect(buildUpstreamQuery(match.entry, q("isPublic=false"))?.toString()).toBe("isPublic=true")
    // The name comes only from the server-sanitized multipart part, never a client query.
    expect(buildUpstreamQuery(match.entry, q("fileName=me.jpg"))).toBeNull()
    expect(buildUpstreamQuery(match.entry, q("fileName=..png"))).toBeNull()
    expect(matchEntry(entries, "POST", seg(PICTURE.replace("/me/", "/4242/"))).kind).toBe("not-allowed")
  })
})
