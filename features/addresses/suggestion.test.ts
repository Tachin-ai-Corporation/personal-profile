import { describe, expect, it } from "vitest"
import type { PlaceAddress } from "@/lib/shared/bff-contract"
import { placeAddressFill, suggestionLabel, suggestionStreet } from "./suggestion"

/** Story 4.3 (NG-9026): a suggestion's label and what a pick fills. */

const COUNTRIES = ["United States", "Canada", "Australia", "Germany"]
/** The picked suggestion's street (line 1 while its details load). */
const STREET = "1 Pine St"

const place = (overrides: Partial<PlaceAddress> = {}): PlaceAddress => ({
  addressLine1: "1 Pine St",
  cityName: "San Francisco",
  county: "San Francisco County",
  stateName: "California",
  postalCode: "94105",
  countryCode: "US",
  country: "United States",
  fullAddress: "1 Pine St, San Francisco, CA 94105, USA",
  complete: true,
  ...overrides,
})

describe("suggestionLabel", () => {
  it("joins the main and secondary text; an empty secondary text is left out", () => {
    expect(suggestionLabel({ placeId: "p", mainText: "1 Pine St", secondaryText: "San Francisco, CA, USA", matches: [] })).toBe("1 Pine St, San Francisco, CA, USA")
    expect(suggestionLabel({ placeId: "p", mainText: " 1 Pine St ", secondaryText: " ", matches: [] })).toBe("1 Pine St")
  })
})

describe("suggestionStreet", () => {
  it("is the main text, else the label", () => {
    expect(suggestionStreet({ placeId: "p", mainText: " 1 Pine St ", secondaryText: "San Francisco, CA, USA", matches: [] })).toBe("1 Pine St")
    expect(suggestionStreet({ placeId: "p", mainText: " ", secondaryText: "San Francisco, CA, USA", matches: [] })).toBe("San Francisco, CA, USA")
  })
})

describe("placeAddressFill", () => {
  it("a complete address fills every part, the listed country and validated", () => {
    expect(placeAddressFill(place(), COUNTRIES, STREET)).toEqual({
      line1: "1 Pine St",
      city: "San Francisco",
      county: "San Francisco County",
      state: "California",
      zip: "94105",
      country: "United States",
      validated: true,
    })
  })

  it("a complete address empties a part Google didn't return", () => {
    expect(placeAddressFill(place({ county: "", stateName: " " }), COUNTRIES, STREET)).toMatchObject({ county: "", state: "", validated: true })
  })

  it("an incomplete address fills only the parts it returns and stays unvalidated", () => {
    expect(placeAddressFill(place({ postalCode: "", county: "", complete: false }), COUNTRIES, STREET)).toEqual({
      line1: "1 Pine St",
      city: "San Francisco",
      state: "California",
      country: "United States",
      validated: false,
    })
  })

  it("the country: the pinned name of the code as the list spells it, else the listed name, else unchanged", () => {
    expect(placeAddressFill(place({ countryCode: "CA", country: "Kanada" }), ["united states", "canada"], STREET).country).toBe("canada")
    expect(placeAddressFill(place({ countryCode: "AU", country: "Australia" }), COUNTRIES, STREET).country).toBe("Australia")
    expect(placeAddressFill(place({ countryCode: "DE", country: "germany" }), COUNTRIES, STREET).country).toBe("Germany")
    expect(placeAddressFill(place({ countryCode: "FR", country: "France" }), COUNTRIES, STREET)).not.toHaveProperty("country")
    expect(placeAddressFill(place({ countryCode: "", country: "" }), COUNTRIES, STREET)).not.toHaveProperty("country")
    // The countries list didn't load: nothing is listed.
    expect(placeAddressFill(place(), [], STREET)).not.toHaveProperty("country")
  })

  it("a complete address whose country the Select can't show stays unvalidated", () => {
    expect(placeAddressFill(place({ countryCode: "FR", country: "France" }), COUNTRIES, STREET)).toMatchObject({ zip: "94105", validated: false })
    expect(placeAddressFill(place(), [], STREET).validated).toBe(false)
  })

  it("an answer without a line 1 keeps the suggestion's street", () => {
    expect(placeAddressFill(place({ addressLine1: " ", complete: false }), COUNTRIES, "1 Pine Street").line1).toBe("1 Pine Street")
  })
})
