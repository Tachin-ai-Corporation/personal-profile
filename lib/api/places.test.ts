import { describe, expect, it } from "vitest"
import { isPlacesCountry, PLACES_COUNTRIES, placesAutocompletePath, placesDetailsPath } from "."

/** Address suggestions (Team A, Story 4.3). Team A adds its own cases here. */
describe("places", () => {
  it("paths and countries", () => {
    expect(placesAutocompletePath()).toBe("/api/places/autocomplete")
    expect(placesDetailsPath()).toBe("/api/places/details")
    expect(PLACES_COUNTRIES).toEqual(["US", "CA", "AU"])
  })

  it.each([
    ["US", true],
    ["ca", true],
    ["AU", true],
    ["GB", false],
    ["", false],
    [null, false],
    [undefined, false],
  ] as const)("isPlacesCountry(%j) is %s", (code, expected) => {
    expect(isPlacesCountry(code)).toBe(expected)
  })
})
