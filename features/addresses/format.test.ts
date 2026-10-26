import { describe, expect, it } from "vitest"
import type { Address } from "@/lib/api"
import { addressMapsHref, formatAddressOneLine, isUnitedStatesName } from "./format"

const address = (overrides: Partial<Address> = {}): Address => ({
  id: 1,
  type: "Home",
  addressLine1: null,
  addressLine2: null,
  cityName: null,
  county: null,
  stateName: null,
  postalCode: null,
  country: null,
  countryCode: null,
  primary: false,
  validated: false,
  ...overrides,
})

const US = { addressLine1: "1 Pine St", cityName: "SF", stateName: "CA", postalCode: "94105", country: "United States", countryCode: "US" }

describe("formatAddressOneLine (Story 4.1)", () => {
  it("joins line 1, line 2, city, state zip; no country for the United States", () => {
    expect(formatAddressOneLine(address(US))).toBe("1 Pine St, SF, CA 94105")
    expect(formatAddressOneLine(address({ ...US, addressLine2: "Apt 4" }))).toBe("1 Pine St, Apt 4, SF, CA 94105")
  })

  it("appends any other country (the I/O matrix's non-US row)", () => {
    expect(
      formatAddressOneLine(address({ addressLine1: "12 King St W", cityName: "Toronto", stateName: "ON", postalCode: "M5H 1A1", country: "Canada", countryCode: "CA" })),
    ).toBe("12 King St W, Toronto, ON M5H 1A1, Canada")
  })

  it("skips absent parts: line 2 \"n/a\" and a blank state put the zip after the city (the sparse row)", () => {
    expect(formatAddressOneLine(address({ ...US, addressLine2: "n/a", stateName: " " }))).toBe("1 Pine St, SF 94105")
    expect(formatAddressOneLine(address({ ...US, cityName: null }))).toBe("1 Pine St, CA 94105")
    expect(formatAddressOneLine(address({ ...US, postalCode: "" }))).toBe("1 Pine St, SF, CA")
    expect(formatAddressOneLine(address({ ...US, cityName: null, stateName: null }))).toBe("1 Pine St, 94105")
    expect(formatAddressOneLine(address({ ...US, addressLine1: null }))).toBe("SF, CA 94105")
  })

  it.each([
    ["the code US (any case)", { country: null, countryCode: "us" }],
    ["the code USA (any case)", { country: null, countryCode: "Usa" }],
    ["the name United States", { country: "united states", countryCode: null }],
    ["the name United States of America", { country: " UNITED STATES OF AMERICA ", countryCode: "n/a" }],
    ["the name USA", { country: "USA", countryCode: null }],
    ["the name U.S.", { country: "U.S.", countryCode: null }],
    ["the name U.S.A.", { country: "U.S.A.", countryCode: null }],
    ["the name us", { country: "us", countryCode: null }],
    ["the name usa", { country: "usa", countryCode: null }],
    ["the name U.S.A (no final dot)", { country: "U.S.A", countryCode: null }],
    ["the name U. S. A. (spaced)", { country: "U. S. A.", countryCode: null }],
    ["the name United  States (double space)", { country: "United  States", countryCode: "US" }],
    ["the name United States of America (mixed case)", { country: "United States Of America", countryCode: "US" }],
  ])("omits the country for %s", (_case, country) => {
    expect(formatAddressOneLine(address({ ...US, ...country }))).toBe("1 Pine St, SF, CA 94105")
  })

  it.each([
    ["Canada beside a US code (the name decides)", { country: "Canada", countryCode: "US" }, "Canada"],
    ["Australia with no code", { country: "Australia", countryCode: null }, "Australia"],
    ["United Kingdom (not a US name)", { country: "United Kingdom", countryCode: "GB" }, "United Kingdom"],
    ["Mexico beside a USA code", { country: "Mexico", countryCode: "usa" }, "Mexico"],
  ])("always shows a non-US country: %s", (_case, country, shown) => {
    expect(formatAddressOneLine(address({ ...US, ...country }))).toBe(`1 Pine St, SF, CA 94105, ${shown}`)
  })

  it("falls back to the country code, upper-cased, without a name; nothing without either", () => {
    expect(formatAddressOneLine(address({ addressLine1: "1 Main Rd", cityName: "Sydney", countryCode: "au" }))).toBe("1 Main Rd, Sydney, AU")
    expect(formatAddressOneLine(address({ addressLine1: "1 Main Rd", cityName: "Sydney", stateName: "NSW", postalCode: "2000", country: "n/a", countryCode: "AU" }))).toBe(
      "1 Main Rd, Sydney, NSW 2000, AU",
    )
    expect(formatAddressOneLine(address({ addressLine1: "1 Main Rd", cityName: "Sydney" }))).toBe("1 Main Rd, Sydney")
  })

  it("is empty when nothing is provided", () => {
    expect(formatAddressOneLine(address())).toBe("")
    expect(formatAddressOneLine(address({ country: "United States" }))).toBe("")
  })
})

describe("isUnitedStatesName (Story 4.2)", () => {
  it.each(["United States", "united  states", "USA", "U.S.A.", "US", "United States of America"])("%j is the United States", (name) => {
    expect(isUnitedStatesName(name)).toBe(true)
  })

  it.each(["Canada", "", "United Kingdom", "U.S. Virgin Islands"])("%j is not", (name) => {
    expect(isUnitedStatesName(name)).toBe(false)
  })
})

describe("addressMapsHref (1health-fe LocationAddressCard.tsx:22-26,41-53)", () => {
  it("a Verified address with stored coordinates links to its Google Maps pin", () => {
    expect(addressMapsHref({ validated: true, mapPoint: { lat: 37.79, lon: -122.39 } })).toBe("https://maps.google.com/?ll=37.79,-122.39")
    expect(addressMapsHref({ validated: true, mapPoint: { lat: 0, lon: 0 } })).toBe("https://maps.google.com/?ll=0,0")
  })

  it("no link for an unverified address or one without coordinates (legacy shows no pin link then)", () => {
    expect(addressMapsHref({ validated: false, mapPoint: { lat: 37.79, lon: -122.39 } })).toBeUndefined()
    expect(addressMapsHref({ validated: true })).toBeUndefined()
  })
})
