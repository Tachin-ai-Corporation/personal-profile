import { describe, expect, it } from "vitest"
import { buildUpstreamQuery, matchEntry } from "../match"
import { IMAGE_UPLOAD_MAX_BYTES } from "./core"
import { entries } from "./insurance"

const seg = (path: string) => path.split("/")

describe("insurance card uploads (Story 5.3)", () => {
  it.each(["InsuranceHasFrontSideCardFile", "InsuranceHasBackSideCardFile"])(
    "%s: numeric id, isPublic=false forced, no client query, PNG/JPEG `file`, 4 MB",
    (relation) => {
      const match = matchEntry(entries, "POST", seg(`v2/health/type/Insurance/55/relation/${relation}/file/upload`))
      if (match.kind !== "matched") throw new Error("expected a match")
      expect(match.entry).toMatchObject({ upload: { part: "file", types: ["png", "jpeg"] }, maxBytes: IMAGE_UPLOAD_MAX_BYTES })
      expect(match.entry.profile).toBeUndefined()
      expect(buildUpstreamQuery(match.entry, new URLSearchParams("isPublic=true"))?.toString()).toBe("isPublic=false")
      expect(buildUpstreamQuery(match.entry, new URLSearchParams("fileName=x.png"))).toBeNull()
      expect(matchEntry(entries, "POST", seg(`v2/health/type/Insurance/me/relation/${relation}/file/upload`)).kind).toBe("not-allowed")
    },
  )
})
