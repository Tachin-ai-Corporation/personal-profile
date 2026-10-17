import { describe, expect, it } from "vitest"
import { ACCOUNT_TIME_ZONES } from "./time-zones"

describe("Account time zones (Story 7.4)", () => {
  it("preserves the six approved ids and display labels in west-to-east order for read and edit views", () => {
    expect(ACCOUNT_TIME_ZONES).toEqual([
      { value: "Pacific/Honolulu", label: "Hawaiian" },
      { value: "America/Anchorage", label: "Alaska" },
      { value: "America/Los_Angeles", label: "Pacific" },
      { value: "America/Denver", label: "Mountain" },
      { value: "America/Chicago", label: "Central" },
      { value: "America/New_York", label: "Eastern" },
    ])
  })
})
