import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { server, trackAllRequests } from "@/test/msw-server"
import {
  isPlacesCountry,
  newPlacesLookupId,
  PLACES_COUNTRIES,
  PLACES_INPUT_MAX_LENGTH,
  placesAutocomplete,
  placesAutocompletePath,
  placesCountryCodeOf,
  placesCountryNameOf,
  placesDetails,
  placesDetailsPath,
} from "."

/** Address suggestions (Team A, Story 4.3): the client of the F2 named ops `POST /api/places/{autocomplete,details}`. */

const AUTOCOMPLETE = "/api/places/autocomplete"
const DETAILS = "/api/places/details"
const LOOKUP = "0b7c3f4e-8a1d-4c2b-9e5f-1a2b3c4d5e6f"

const SUGGESTION = { placeId: "ChIJ-pine-street-1", mainText: "1 Pine St", secondaryText: "San Francisco, CA, USA", matches: [{ start: 0, end: 5 }] }

const ADDRESS = {
  addressLine1: "1 Pine St",
  cityName: "San Francisco",
  county: "San Francisco County",
  stateName: "California",
  postalCode: "94105",
  countryCode: "US",
  country: "United States",
  fullAddress: "1 Pine St, San Francisco, CA 94105, USA",
  complete: true,
}

/** Records each request body sent to `path` and answers with `answer`. */
function answering(path: string, answer: () => Response) {
  const bodies: unknown[] = []
  server.use(
    http.post(path, async ({ request }) => {
      bodies.push(await request.json())
      return answer()
    }),
  )
  return bodies
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("places", () => {
  it("paths and countries", () => {
    expect(placesAutocompletePath()).toBe("/api/places/autocomplete")
    expect(placesDetailsPath()).toBe("/api/places/details")
    expect(PLACES_COUNTRIES).toEqual(["US", "CA", "AU"])
    expect(PLACES_INPUT_MAX_LENGTH).toBe(120)
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

  it.each([
    ["United States", "US"],
    ["USA", "US"],
    ["u.s.a.", "US"],
    ["United States of America", "US"],
    ["Canada", "CA"],
    [" canada ", "CA"],
    ["Australia", "AU"],
    ["Germany", null],
    ["CA", null],
    ["", null],
    [null, null],
    [undefined, null],
  ] as const)("placesCountryCodeOf(%j) is %j (the pinned names, any US spelling)", (name, code) => {
    expect(placesCountryCodeOf(name)).toBe(code)
  })

  it.each([
    ["US", "United States"],
    ["ca", "Canada"],
    ["AU", "Australia"],
    ["DE", null],
    ["", null],
    [null, null],
  ] as const)("placesCountryNameOf(%j) is %j", (code, name) => {
    expect(placesCountryNameOf(code)).toBe(name)
  })

  it("newPlacesLookupId: a fresh UUID v4 each time", () => {
    const first = newPlacesLookupId()
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newPlacesLookupId()).not.toBe(first)
  })
})

describe("placesAutocomplete", () => {
  it("POSTs { input, countryCode, lookupId } and answers the suggestions", async () => {
    const bodies = answering(AUTOCOMPLETE, () => HttpResponse.json({ enabled: true, suggestions: [SUGGESTION] }))
    expect(await placesAutocomplete({ input: "1 Pin", countryCode: "US", lookupId: LOOKUP })).toEqual({ enabled: true, suggestions: [SUGGESTION] })
    expect(bodies).toEqual([{ input: "1 Pin", countryCode: "US", lookupId: LOOKUP }])
  })

  it("sends only the three request fields", async () => {
    const bodies = answering(AUTOCOMPLETE, () => HttpResponse.json({ enabled: true, suggestions: [] }))
    await placesAutocomplete({ input: "1 Pin", countryCode: "CA", lookupId: LOOKUP, extra: "x" } as never)
    expect(bodies).toEqual([{ input: "1 Pin", countryCode: "CA", lookupId: LOOKUP }])
  })

  it("answers enabled: false while PLACES_ENABLED is off", async () => {
    answering(AUTOCOMPLETE, () => HttpResponse.json({ enabled: false, suggestions: [] }))
    expect(await placesAutocomplete({ input: "1 Pin", countryCode: "US", lookupId: LOOKUP })).toEqual({ enabled: false, suggestions: [] })
  })

  it.each([
    ["a 400", () => HttpResponse.json({ errorCode: "BAD_BODY", source: "proxy" }, { status: 400 })],
    ["a 502", () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })],
    ["a network failure", () => HttpResponse.error()],
    ["an unexpected body", () => HttpResponse.json({ enabled: true, suggestions: [{ placeId: 1 }] })],
  ])("%s answers no suggestions, enabled (never throws)", async (_case, answer) => {
    answering(AUTOCOMPLETE, answer)
    expect(await placesAutocomplete({ input: "1 Pin", countryCode: "US", lookupId: LOOKUP })).toEqual({ enabled: true, suggestions: [] })
  })

  it("an aborted search answers no suggestions", async () => {
    answering(AUTOCOMPLETE, () => HttpResponse.json({ enabled: true, suggestions: [SUGGESTION] }))
    const controller = new AbortController()
    controller.abort()
    expect(await placesAutocomplete({ input: "1 Pin", countryCode: "US", lookupId: LOOKUP }, controller.signal)).toEqual({ enabled: true, suggestions: [] })
  })

  it("an input over 120 characters makes no call", async () => {
    const requests = trackAllRequests()
    expect(await placesAutocomplete({ input: "x".repeat(121), countryCode: "US", lookupId: LOOKUP })).toEqual({ enabled: true, suggestions: [] })
    expect(requests()).toBe(0)
  })
})

describe("placesDetails", () => {
  it("POSTs { placeId, lookupId } and answers the address", async () => {
    const bodies = answering(DETAILS, () => HttpResponse.json({ enabled: true, ...ADDRESS }))
    expect(await placesDetails({ placeId: SUGGESTION.placeId, lookupId: LOOKUP })).toEqual({ enabled: true, address: ADDRESS })
    expect(bodies).toEqual([{ placeId: SUGGESTION.placeId, lookupId: LOOKUP }])
  })

  it("keeps complete: false (an incomplete address)", async () => {
    answering(DETAILS, () => HttpResponse.json({ enabled: true, ...ADDRESS, postalCode: "", complete: false }))
    expect(await placesDetails({ placeId: SUGGESTION.placeId, lookupId: LOOKUP })).toEqual({ enabled: true, address: { ...ADDRESS, postalCode: "", complete: false } })
  })

  it("answers enabled: false while PLACES_ENABLED is off", async () => {
    answering(DETAILS, () => HttpResponse.json({ enabled: false }))
    expect(await placesDetails({ placeId: SUGGESTION.placeId, lookupId: LOOKUP })).toEqual({ enabled: false, address: null })
  })

  it.each([
    ["a 504", () => HttpResponse.json({ errorCode: "UPSTREAM_TIMEOUT", source: "proxy" }, { status: 504 })],
    ["a 502", () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })],
    ["a network failure", () => HttpResponse.error()],
    ["an unexpected body", () => HttpResponse.json({ enabled: true, addressLine1: "1 Pine St" })],
  ])("%s answers null (never throws)", async (_case, answer) => {
    answering(DETAILS, answer)
    expect(await placesDetails({ placeId: SUGGESTION.placeId, lookupId: LOOKUP })).toBeNull()
  })
})
