import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import {
  ADDRESS_LIST_PAGE_SIZE,
  addressesListPath,
  countriesPath,
  fetchAddresses,
  keys,
  loadAddresses,
  PINNED_COUNTRY_CODES,
  swrFetcher,
  toAddresses,
  type Address,
} from "."

/** Addresses (Team A, Epic 4). Team A adds its own cases here. */

const LIST = "/api/1h/v2/person/location/list"

const address = (overrides: Partial<Address> = {}): Address => ({
  id: 1,
  type: "Home",
  addressLine1: "1 Pine St",
  addressLine2: null,
  cityName: "SF",
  county: null,
  stateName: "CA",
  postalCode: "94105",
  country: "United States",
  countryCode: "US",
  primary: false,
  validated: false,
  ...overrides,
})

/** A backend `PersonLocation` row (Story 4.1 fields, plus ones the client ignores). */
const wire = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  name: "Home",
  type: "Person Location",
  fullAddress: "1 Pine St, SF, CA 94105",
  personLocationType: "Home",
  addressLine1: "1 Pine St",
  addressLine2: null,
  cityName: "SF",
  county: null,
  stateName: "CA",
  postalCode: "94105",
  country: "United States",
  countryCode: "US",
  lat: 37.79,
  lon: -122.39,
  primary: false,
  validated: false,
  active: true,
  ...overrides,
})

const page = (content: unknown[]) => ({ content, totalElements: content.length, totalPages: 1, number: 0, size: ADDRESS_LIST_PAGE_SIZE })

describe("addresses", () => {
  it("paths and constants", () => {
    expect(ADDRESS_LIST_PAGE_SIZE).toBe(100)
    expect(addressesListPath()).toBe("/api/1h/v2/person/location/list?page=0&size=100")
    expect(countriesPath()).toBe("/api/1h/v2/public/countries")
    expect(PINNED_COUNTRY_CODES).toEqual(["US", "CA", "AU"])
  })
})

describe("toAddresses (Story 4.1)", () => {
  it("maps a Spring Page's rows in API order: the type from personLocationType, the booleans from primary / validated", () => {
    expect(
      toAddresses(
        page([
          wire({ id: 2, personLocationType: "Main Work", validated: true }),
          wire({ id: 1, primary: true, addressLine2: "Apt 4", county: "San Francisco" }),
        ]),
      ),
    ).toEqual([
      address({ id: 2, type: "Main Work", validated: true }),
      address({ id: 1, primary: true, addressLine2: "Apt 4", county: "San Francisco" }),
    ])
  })

  it("accepts a bare list and the legacy isPrimary / isValidated names", () => {
    expect(toAddresses([wire({ primary: undefined, validated: undefined, isPrimary: true, isValidated: true })])).toEqual([address({ primary: true, validated: true })])
    // The code's names win when both are present.
    expect(toAddresses([wire({ primary: false, isPrimary: true, validated: null, isValidated: false })])).toEqual([address()])
  })

  it("treats null, missing, blank and \"n/a\" parts as absent, and trims the rest", () => {
    expect(toAddresses([{ id: 9, addressLine1: " 1 Pine St ", addressLine2: "n/a", cityName: "", stateName: "  ", postalCode: "N/A", country: null, personLocationType: "Billing" }])).toEqual([
      {
        id: 9,
        type: "Billing",
        addressLine1: "1 Pine St",
        addressLine2: null,
        cityName: null,
        county: null,
        stateName: null,
        postalCode: null,
        country: null,
        countryCode: null,
        primary: false,
        validated: false,
      },
    ])
    expect(toAddresses([{}])).toEqual([
      {
        id: null,
        type: null,
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
      },
    ])
  })

  it("drops inactive rows (active: false only)", () => {
    expect(toAddresses(page([wire({ id: 1, active: false }), wire({ id: 2, active: null }), wire({ id: 3, active: undefined })]))?.map((row) => row.id)).toEqual([2, 3])
  })

  it("reads an empty Page and an empty list as no addresses", () => {
    expect(toAddresses(page([]))).toEqual([])
    expect(toAddresses([])).toEqual([])
  })

  it.each([
    ["an object without content", { totalElements: 0 }],
    ["a Page whose content is not a list", { content: null }],
    ["a row with a string id", [{ id: "1" }]],
    ["a row with a string flag", [{ primary: "true" }]],
    ["a string", "nope"],
    ["null", null],
  ])("rejects %s", (_case, body) => {
    expect(toAddresses(body)).toBeNull()
  })
})

describe("fetchAddresses (Story 4.1)", () => {
  it("sends one GET for page 0 of 100 and returns the mapped rows", async () => {
    const seen: string[] = []
    server.use(
      http.get(LIST, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json(page([wire({ id: 7 })]))
      }),
    )
    expect(await fetchAddresses()).toEqual({ success: true, data: [address({ id: 7 })], statusCode: 200 })
    expect(seen).toEqual(["?page=0&size=100"])
  })

  it("returns the error, or a shape error", async () => {
    server.use(http.get(LIST, () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    expect(await fetchAddresses()).toMatchObject({ success: false, errorCode: "UPSTREAM_ERROR", data: undefined })
    server.use(http.get(LIST, () => HttpResponse.json({ nope: true })))
    expect(await fetchAddresses()).toEqual({ success: false, statusCode: 200, error: "addresses/fetchAddresses returned an unexpected shape" })
  })

  it("is the loader of keys.addresses() behind the root SWR fetcher", async () => {
    server.use(http.get(LIST, () => HttpResponse.json([wire({ id: 3, primary: true })])))
    expect(await swrFetcher(keys.addresses())).toEqual([address({ id: 3, primary: true })])
    expect(await loadAddresses()).toEqual([address({ id: 3, primary: true })])
    server.use(http.get(LIST, () => HttpResponse.json({ message: "boom" }, { status: 500 })))
    await expect(swrFetcher(keys.addresses())).rejects.toMatchObject({ name: "ApiResponseError", response: { success: false, statusCode: 500 } })
  })
})
