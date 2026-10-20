import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import {
  ADDRESS_CLEARED_VALUE,
  ADDRESS_FIELD_MAX_LENGTH,
  ADDRESS_LIST_PAGE_SIZE,
  ADDRESS_TYPES,
  addressCreateBody,
  addressCreatePath,
  addressDeletePath,
  addressesListPath,
  addressFullAddress,
  addressPrimaryBody,
  addressUpdateBody,
  addressUpdatePath,
  countriesPath,
  DEFAULT_ADDRESS_COUNTRY,
  deleteAddress,
  fetchAddresses,
  fetchCountries,
  isUnitedStatesName,
  keys,
  loadAddresses,
  loadCountries,
  PINNED_COUNTRY_CODES,
  PINNED_COUNTRY_NAMES,
  saveAddressCreate,
  saveAddressUpdate,
  swrFetcher,
  toAddresses,
  toCountries,
  type Address,
  type AddressFields,
} from "."
import { fetchMyself } from "./myself"

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

/** The backend's `PageImpl` (`com.sirma.bocore.common.repository.PageImpl`), as `GET v2/person/location/list` answers. */
const page = (data: unknown[]) => ({
  data,
  pageNumber: 0,
  pageSize: ADDRESS_LIST_PAGE_SIZE,
  offset: 0,
  emptyPage: data.length === 0,
  firstPage: true,
  lastPage: true,
  numberOfElements: data.length,
  totalElements: data.length,
  totalPages: data.length === 0 ? 0 : 1,
})

describe("addresses", () => {
  it("paths and constants", () => {
    expect(ADDRESS_LIST_PAGE_SIZE).toBe(100)
    expect(addressesListPath()).toBe("/api/1h/v2/person/location/list?page=0&size=100")
    expect(countriesPath()).toBe("/api/1h/v2/public/countries")
    expect(PINNED_COUNTRY_CODES).toEqual(["US", "CA", "AU"])
    expect(PINNED_COUNTRY_NAMES).toEqual(["United States", "Canada", "Australia"])
    expect(DEFAULT_ADDRESS_COUNTRY).toBe("United States")
    expect(ADDRESS_FIELD_MAX_LENGTH).toBe(255)
    expect(ADDRESS_TYPES).toEqual(["Home", "Main Work", "Other Work", "Vacation Home"])
    expect(ADDRESS_CLEARED_VALUE).toBe("n/a")
    expect(addressCreatePath()).toBe("/api/1h/v2/person/location")
    expect(addressUpdatePath(12)).toBe("/api/1h/v2/person/location/12")
    for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(addressUpdatePath(id)).toBeNull()
    expect(addressDeletePath(12)).toBe("/api/1h/v2/person/location/12")
    for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(addressDeletePath(id)).toBeNull()
  })
})

describe("toAddresses (Story 4.1)", () => {
  it("maps a PageImpl's rows in API order: the type from personLocationType, the booleans from primary / validated", () => {
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

  it("reads the real backend body: PageImpl<PersonLocationResponseDTO> with the rows under data", () => {
    const body = {
      data: [wire({ id: 5, primary: true, validated: true })],
      pageNumber: 0,
      pageSize: 100,
      offset: 0,
      emptyPage: false,
      firstPage: true,
      lastPage: true,
      numberOfElements: 1,
      totalElements: 1,
      totalPages: 1,
    }
    expect(toAddresses(body)).toEqual([address({ id: 5, primary: true, validated: true })])
  })

  it("reads an empty Page and an empty list as no addresses", () => {
    expect(toAddresses(page([]))).toEqual([])
    expect(toAddresses([])).toEqual([])
  })

  it.each([
    ["an object without data", { totalElements: 0 }],
    ["a Page whose data is not a list", { data: null }],
    ["a Spring Page (content, not the backend's data)", { content: [], totalElements: 0 }],
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

const COUNTRIES = "/api/1h/v2/public/countries"

describe("toCountries (Story 4.2)", () => {
  it("pins United States, Canada, Australia by name, then the rest alphabetically; drops blank and n/a; keeps a name once", () => {
    expect(
      toCountries([
        { id: 1, name: "Germany" },
        { id: 2, name: "australia" },
        { id: 3, name: "n/a" },
        { id: 4, name: " Canada " },
        { id: 5, name: "" },
        { id: 6, name: null },
        { id: 7, name: "Belgium" },
        { id: 8, name: "United States" },
        { id: 9, name: "Ålands" },
        { id: 10, name: "Germany" },
        { id: 11 },
        { id: 12, name: "N/A" },
      ]),
    ).toEqual(["United States", "Canada", "australia", "Ålands", "Belgium", "Germany"])
    expect(toCountries([])).toEqual([])
    expect(toCountries([{ name: "France" }, { name: "Canada" }])).toEqual(["Canada", "France"])
  })

  it.each([
    ["an object", { content: [] }],
    ["a string name list", ["Canada"]],
    ["a numeric name", [{ name: 4 }]],
    ["null", null],
  ])("rejects %s", (_case, body) => {
    expect(toCountries(body)).toBeNull()
  })
})

describe("fetchCountries (Story 4.2)", () => {
  it("sends one GET with no query and returns the ordered names; it is the keys.countries() loader", async () => {
    const seen: string[] = []
    server.use(
      http.get(COUNTRIES, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json([{ id: 1, name: "Canada" }, { id: 2, name: "United States" }])
      }),
    )
    expect(await fetchCountries()).toEqual({ success: true, data: ["United States", "Canada"], statusCode: 200 })
    expect(seen).toEqual([""])
    expect(await swrFetcher(keys.countries())).toEqual(["United States", "Canada"])
    expect(await loadCountries()).toEqual(["United States", "Canada"])
  })

  it("returns the error, or a shape error", async () => {
    server.use(http.get(COUNTRIES, () => HttpResponse.json({ message: "boom" }, { status: 500 })))
    expect(await fetchCountries()).toMatchObject({ success: false, statusCode: 500, data: undefined })
    await expect(swrFetcher(keys.countries())).rejects.toMatchObject({ name: "ApiResponseError" })
    server.use(http.get(COUNTRIES, () => HttpResponse.json({ nope: true })))
    expect(await fetchCountries()).toEqual({ success: false, statusCode: 200, error: "addresses/fetchCountries returned an unexpected shape" })
  })
})

/** A saved validated US Home address (the spec's row 2). */
const fields = (overrides: Partial<AddressFields> = {}): AddressFields => ({
  type: "Home",
  country: "United States",
  line1: "1 Pine St",
  line2: "",
  city: "SF",
  county: "",
  state: "CA",
  zip: "94105",
  primary: false,
  validated: true,
  ...overrides,
})

const LISTED = new Set(["United States", "Canada"])

describe("address write bodies (Story 4.2)", () => {
  it("builds the create body: trimmed, empty fields left out, the flags always sent (the Add row)", () => {
    expect(addressCreateBody(fields({ line1: " 1 Pine St ", validated: false }))).toEqual({
      personLocationType: "Home",
      addressLine1: "1 Pine St",
      cityName: "SF",
      stateName: "CA",
      postalCode: "94105",
      country: "United States",
      primary: false,
      validated: false,
    })
    expect(addressCreateBody(fields({ type: "", line2: "Apt 4", county: "Marin", primary: true, validated: false }))).toEqual({
      addressLine1: "1 Pine St",
      addressLine2: "Apt 4",
      cityName: "SF",
      county: "Marin",
      stateName: "CA",
      postalCode: "94105",
      country: "United States",
      primary: true,
      validated: false,
    })
  })

  it("rebuilds fullAddress the backend's way", () => {
    expect(addressFullAddress(fields({ line1: " 1 Pine St", zip: "94105 " }))).toBe("1 Pine St, SF, 94105, United States")
  })

  it("an address part changed by hand: every field, validated false (as the form holds it), primary as saved, fullAddress rebuilt (the Edit row)", () => {
    expect(addressUpdateBody(fields({ city: "Oakland", validated: false }), fields(), { listedCountries: LISTED })).toEqual({
      personLocationType: "Home",
      addressLine1: "1 Pine St",
      cityName: "Oakland",
      stateName: "CA",
      postalCode: "94105",
      country: "United States",
      primary: false,
      validated: false,
      fullAddress: "1 Pine St, Oakland, 94105, United States",
    })
  })

  it("sends the form's validated as is (Story 4.3): a picked address is true even with its parts changed, a manual new one false", () => {
    expect(addressUpdateBody(fields({ line1: "2 Pine St", city: "Oakland", validated: true }), fields({ validated: false }), { listedCountries: LISTED })).toMatchObject({
      addressLine1: "2 Pine St",
      cityName: "Oakland",
      validated: true,
    })
    expect(addressCreateBody(fields({ validated: true }))).toMatchObject({ validated: true })
    expect(addressCreateBody(fields({ validated: false }))).toMatchObject({ validated: false })
  })

  it("only the type changed: validated stays true (the Label only row); an unvalidated address stays false", () => {
    expect(addressUpdateBody(fields({ type: "Main Work" }), fields(), { listedCountries: LISTED })).toMatchObject({ personLocationType: "Main Work", validated: true })
    expect(addressUpdateBody(fields({ type: "Main Work", validated: false }), fields({ validated: false }), { listedCountries: LISTED })).toMatchObject({ validated: false })
  })

  it("sends a cleared optional part as n/a, leaves out one that stays empty, and trims the rest", () => {
    const saved = fields({ line2: "Apt 4", county: "Marin", state: "" })
    expect(addressUpdateBody(fields({ line2: " ", county: "", state: "", primary: true, validated: false }), saved, { listedCountries: LISTED })).toEqual({
      personLocationType: "Home",
      addressLine1: "1 Pine St",
      addressLine2: "n/a",
      cityName: "SF",
      county: "n/a",
      postalCode: "94105",
      country: "United States",
      primary: true,
      validated: false,
      fullAddress: "1 Pine St, SF, 94105, United States",
    })
  })

  it("never re-sends an unlisted type or country unless changed (the Unlisted row)", () => {
    const saved = fields({ type: "Billing", country: "U.S.A.", validated: false })
    const unchanged = addressUpdateBody(fields({ type: "Billing", country: "U.S.A.", validated: false, city: "Oakland" }), saved, { listedCountries: LISTED })
    expect(unchanged).not.toHaveProperty("personLocationType")
    expect(unchanged).not.toHaveProperty("country")
    expect(unchanged.fullAddress).toBe("1 Pine St, Oakland, 94105, U.S.A.")
    const changed = addressUpdateBody(fields({ type: "Home", country: "Canada", validated: false }), saved, { listedCountries: LISTED })
    expect(changed).toMatchObject({ personLocationType: "Home", country: "Canada" })
    // A listed country is sent even unchanged; an unknown list sends only a change.
    expect(addressUpdateBody(fields({ city: "Oakland" }), fields(), { listedCountries: new Set() })).not.toHaveProperty("country")
    // An empty required part is left out (the backend keeps its value).
    expect(addressUpdateBody(fields({ zip: " " }), fields(), { listedCountries: LISTED })).not.toHaveProperty("postalCode")
  })
})

describe("saveAddressCreate / saveAddressUpdate (Story 4.2)", () => {
  const CREATE = "/api/1h/v2/person/location"

  // D-A: a write goes out only once the page user is pinned.
  beforeEach(async () => {
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  it("POSTs the JSON body and returns the created id (null without one)", async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(CREATE, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(bodies.length === 1 ? { id: 31, primary: false } : { name: "x" })
      }),
    )
    const body = addressCreateBody(fields({ validated: false }))
    expect(await saveAddressCreate(body)).toMatchObject({ success: true, data: { id: 31 } })
    expect(await saveAddressCreate(body)).toMatchObject({ success: true, data: { id: null } })
    expect(bodies).toEqual([body, body])
  })

  it("returns a failed POST without data", async () => {
    server.use(http.post(CREATE, () => HttpResponse.json({ message: "Operation failed. Location zip is not provided.", code: 400 }, { status: 400 })))
    expect(await saveAddressCreate({ primary: false, validated: false })).toMatchObject({ success: false, statusCode: 400, data: undefined })
  })

  it("PUTs the JSON body to the id; refuses a bad id without a request", async () => {
    const seen: { path: string; body: unknown }[] = []
    server.use(
      http.put(`${CREATE}/:id`, async ({ request }) => {
        seen.push({ path: new URL(request.url).pathname, body: await request.json() })
        return HttpResponse.json({ id: 2 })
      }),
    )
    const body = addressUpdateBody(fields({ city: "Oakland" }), fields(), { listedCountries: LISTED })
    expect(await saveAddressUpdate(2, body)).toMatchObject({ success: true })
    expect(seen).toEqual([{ path: "/api/1h/v2/person/location/2", body }])
    expect(await saveAddressUpdate(0, body)).toEqual({ success: false, error: "addresses/saveAddressUpdate needs a positive integer id" })
    expect(seen).toHaveLength(1)
  })
})

describe("Make primary and removal (Story 4.4)", () => {
  const ADDRESS = "/api/1h/v2/person/location"

  beforeEach(async () => {
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  it("the Make primary body holds only the two flags", () => {
    expect(addressPrimaryBody(true, false)).toEqual({ primary: true, validated: false })
    expect(addressPrimaryBody(true, true)).toEqual({ primary: true, validated: true })
  })

  it("a Make primary PUTs only the flags", async () => {
    const seen: unknown[] = []
    server.use(
      http.put(`${ADDRESS}/:id`, async ({ request }) => {
        seen.push(await request.json())
        return HttpResponse.json({ id: 2 })
      }),
    )
    expect(await saveAddressUpdate(2, addressPrimaryBody(true, true))).toMatchObject({ success: true })
    expect(seen).toEqual([{ primary: true, validated: true }])
  })

  it("DELETEs the id with no body; refuses a bad id without a request; never throws", async () => {
    const seen: { path: string; method: string; body: string }[] = []
    server.use(
      http.delete(`${ADDRESS}/:id`, async ({ request }) => {
        seen.push({ path: new URL(request.url).pathname, method: request.method, body: await request.text() })
        return seen.length === 1 ? new HttpResponse(null, { status: 204 }) : HttpResponse.json({ message: "nope", code: 400 }, { status: 400 })
      }),
    )
    expect(await deleteAddress(12)).toMatchObject({ success: true })
    expect(seen).toEqual([{ path: "/api/1h/v2/person/location/12", method: "DELETE", body: "" }])
    expect(await deleteAddress(12)).toMatchObject({ success: false, statusCode: 400 })
    expect(await deleteAddress(-1)).toEqual({ success: false, error: "addresses/deleteAddress needs a positive integer id" })
    expect(seen).toHaveLength(2)
  })
})

describe("isUnitedStatesName (Story 4.2, moved here by Story 4.3)", () => {
  it.each(["United States", "united  states", "USA", "U.S.A.", "US", "United States of America"])("%j is the United States", (name) => {
    expect(isUnitedStatesName(name)).toBe(true)
  })

  it.each(["Canada", "", "United Kingdom", "U.S. Virgin Islands"])("%j is not", (name) => {
    expect(isUnitedStatesName(name)).toBe(false)
  })
})
