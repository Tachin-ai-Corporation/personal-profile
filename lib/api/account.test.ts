import { describe, expect, it } from "vitest"
import { ACCOUNT_LOCALE, localePath, timeZonePath } from "."

/** Personal account settings (Team B, Epic 7). Team B adds its own cases here. */
describe("account", () => {
  it("paths and constants", () => {
    expect(ACCOUNT_LOCALE).toBe("en-US")
    expect(timeZonePath("America/Chicago")).toBe("/api/1h/v2/user/time-zone?timeZone=America%2FChicago")
    expect(localePath()).toBe("/api/1h/v2/user/locale?locale=en-US")
  })
})
