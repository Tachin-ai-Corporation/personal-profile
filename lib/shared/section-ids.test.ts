import { describe, expect, it } from "vitest"
import { SECTION_IDS } from "./section-ids"

describe("section ids", () => {
  it("lists every Section once", () => {
    expect(SECTION_IDS).toEqual(["personal", "phone", "email", "social", "addresses", "insurance", "account"])
  })
})
