import { describe, expect, it } from "vitest"
import { practiceSupportPath } from "."

/** Practice support contact (Team B, Story 9.3). Team B adds its own cases here. */
describe("practice-support", () => {
  it("path", () => {
    expect(practiceSupportPath()).toBe("/api/pp/practice-support")
  })
})
