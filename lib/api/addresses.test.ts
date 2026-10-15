import { describe, expect, it } from "vitest"
import { ADDRESS_LIST_PAGE_SIZE, addressesListPath, countriesPath, PINNED_COUNTRY_CODES } from "."

/** Addresses (Team A, Epic 4). Team A adds its own cases here. */
describe("addresses", () => {
  it("paths and constants", () => {
    expect(ADDRESS_LIST_PAGE_SIZE).toBe(100)
    expect(addressesListPath()).toBe("/api/1h/v2/person/location/list?page=0&size=100")
    expect(countriesPath()).toBe("/api/1h/v2/public/countries")
    expect(PINNED_COUNTRY_CODES).toEqual(["US", "CA", "AU"])
  })
})
