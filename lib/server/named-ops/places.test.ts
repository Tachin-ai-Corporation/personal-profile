import { delay, http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setLogSink } from "@/lib/server/log"
import { stubServerEnv, testEnv, TEST_ENV } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { callOp, expectBffError, expectNoStore } from "@/test/named-op-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import {
  createPlacesAutocompleteHandler,
  createPlacesDetailsHandler,
  DETAILS_FIELD_MASK,
  placesSessionToken,
  toAddress,
  toSuggestions,
} from "./places"

const AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete"
const DETAILS = "https://places.googleapis.com/v1/places/:placeId"
const PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4"
const ENABLED = { PLACES_ENABLED: "1", GOOGLE_PLACES_KEY: "test-places-key" }
const autocomplete = createPlacesAutocompleteHandler({ env: testEnv(ENABLED), now: () => NOW })
const details = createPlacesDetailsHandler({ env: testEnv(ENABLED), now: () => NOW })
const LOOKUP = "0f8fad5b-d9cb-469f-a165-70867728950e"
/** Adds the per-lookup id unless the test sets (or deletes) it itself. */
const withLookup = (body: unknown): unknown =>
  body !== null && typeof body === "object" && !("lookupId" in body) ? { ...body, lookupId: LOOKUP } : body
const suggest = (body: unknown, extra: object = {}, h = autocomplete) =>
  callOp(h, { method: "POST", path: "/api/places/autocomplete", body: withLookup(body), ...extra })
const detail = (body: unknown, extra: object = {}, h = details) => callOp(h, { method: "POST", path: "/api/places/details", body: withLookup(body), ...extra })

function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const push = (line: string) => void lines.push(line)
  return { lines, restore: setLogSink({ info: push, warn: push, error: push }) }
}

const prediction = (placeId: string, main: string, secondary?: string) => ({
  placePrediction: {
    placeId,
    text: { text: `${main}, ${secondary ?? ""}` },
    structuredFormat: { mainText: { text: main, matches: [{ endOffset: 3 }, { startOffset: 4, endOffset: 6 }] }, ...(secondary ? { secondaryText: { text: secondary } } : {}) },
  },
})

const components = [
  { longText: "1600", shortText: "1600", types: ["street_number"] },
  { longText: "Amphitheatre Parkway", shortText: "Amphitheatre Pkwy", types: ["route"] },
  { longText: "Mountain View", shortText: "Mountain View", types: ["locality", "political"] },
  { longText: "Santa Clara County", shortText: "Santa Clara County", types: ["administrative_area_level_2", "political"] },
  { longText: "California", shortText: "CA", types: ["administrative_area_level_1", "political"] },
  { longText: "United States", shortText: "US", types: ["country", "political"] },
  { longText: "94043", shortText: "94043", types: ["postal_code"] },
]

beforeEach(() => stubServerEnv(ENABLED))

describe("POST /api/places/autocomplete", () => {
  it("calls Google server-side with the key, a sid-bound session token and the region fixed to the country; answers ≤ 5 suggestions", async () => {
    let seen: { headers: Headers; body: Record<string, unknown> } | undefined
    server.use(
      http.post(AUTOCOMPLETE, async ({ request }) => {
        seen = { headers: request.headers, body: (await request.json()) as Record<string, unknown> }
        return HttpResponse.json({ suggestions: Array.from({ length: 7 }, (_, i) => prediction(`place-${i}-xxxxxxxx`, `${i} Main St`, "Springfield, IL")) })
      }),
    )
    const session = makeSession({ sid: "c2lkLWFiY2RlZmdoaWprbG1ub3A" })
    const response = await suggest({ input: "  1 Main ", countryCode: "us" }, { session })
    expect(response.status).toBe(200)
    expectNoStore(response)
    const body = (await response.json()) as { enabled: boolean; suggestions: unknown[] }
    expect(body.enabled).toBe(true)
    expect(body.suggestions).toHaveLength(5)
    expect(body.suggestions[0]).toEqual({ placeId: "place-0-xxxxxxxx", mainText: "0 Main St", secondaryText: "Springfield, IL", matches: [{ start: 0, end: 3 }, { start: 4, end: 6 }] })
    expect(seen?.headers.get("X-Goog-Api-Key")).toBe("test-places-key")
    expect(seen?.headers.get("Cookie")).toBeNull()
    expect(seen?.body).toEqual({ input: "1 Main", includedRegionCodes: ["us"], sessionToken: placesSessionToken(session.sid, LOOKUP, TEST_ENV.SESSION_SECRET) })
  })

  it.each([
    ["Google 500", () => new HttpResponse(null, { status: 500 }), "google_status_500"],
    ["Google 429 (quota)", () => HttpResponse.json({ error: {} }, { status: 429 }), "google_status_429"],
    ["a network error", () => HttpResponse.error(), "google_network"],
    ["an unparsable body", () => new HttpResponse("{nope"), "google_parse"],
    ["a body over 256 KB", () => new HttpResponse(new Uint8Array(256 * 1024 + 1)), "google_too_large"],
    ["an unexpected shape", () => HttpResponse.json({ suggestions: "x" }), undefined],
  ])("%s → enabled with no suggestions, its outcome logged", async (_label, resolver, outcome) => {
    server.use(http.post(AUTOCOMPLETE, resolver))
    const { lines, restore } = captureLogs()
    const response = await suggest({ input: "1 Main", countryCode: "CA" })
    restore()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: true, suggestions: [] })
    expect(JSON.parse(lines[0]).outcome).toBe(outcome)
  })

  it("a body that errors → enabled with no suggestions, google_body_error logged", async () => {
    const realFetch = globalThis.fetch
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("https://places.googleapis.com")
        ? new Response(new ReadableStream({ start: (c) => c.error(new Error("reset")) }), { status: 200 })
        : realFetch(input, init),
    )
    const { lines, restore } = captureLogs()
    const response = await suggest({ input: "1 Main", countryCode: "US" })
    restore()
    expect(await response.json()).toEqual({ enabled: true, suggestions: [] })
    expect(JSON.parse(lines[0]).outcome).toBe("google_body_error")
  })

  it("GOOGLE_PLACES_KEY missing → no Google call, enabled with no suggestions, places_key_missing logged", async () => {
    const calls = trackAllRequests()
    const noKey = createPlacesAutocompleteHandler({ env: () => ({ ...testEnv(ENABLED)(), GOOGLE_PLACES_KEY: undefined }), now: () => NOW })
    const { lines, restore } = captureLogs()
    const response = await suggest({ input: "1 Main", countryCode: "US" }, {}, noKey)
    restore()
    expect(await response.json()).toEqual({ enabled: true, suggestions: [] })
    expect(JSON.parse(lines[0]).outcome).toBe("places_key_missing")
    expect(calls()).toBe(0)
  })

  it("a new lookupId gives a new session token, still bound to the sid", async () => {
    const tokens: unknown[] = []
    server.use(
      http.post(AUTOCOMPLETE, async ({ request }) => {
        tokens.push(((await request.json()) as { sessionToken: unknown }).sessionToken)
        return HttpResponse.json({ suggestions: [] })
      }),
    )
    await suggest({ input: "1 Main", countryCode: "US" })
    await suggest({ input: "1 Main S", countryCode: "US" })
    await suggest({ input: "1 Main", countryCode: "US", lookupId: "9b2c4f1e-3a5d-4e6f-8a7b-1c2d3e4f5a6b" })
    expect(tokens[0]).toBe(tokens[1])
    expect(tokens[2]).not.toBe(tokens[0])
  })

  it("a timeout → enabled with no suggestions", async () => {
    let reached = false
    server.use(
      http.post(AUTOCOMPLETE, async () => {
        reached = true
        await delay("infinite")
        return HttpResponse.json({})
      }),
    )
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const pending = suggest({ input: "1 Main", countryCode: "AU" })
    await vi.waitFor(() => expect(reached).toBe(true))
    await vi.advanceTimersByTimeAsync(5_000)
    const response = await pending
    vi.useRealTimers()
    expect(await response.json()).toEqual({ enabled: true, suggestions: [] })
  })

  it("a timeout while the body streams → enabled with no suggestions, google_timeout logged", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    let sent = false
    const stalls = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) controller.enqueue(new TextEncoder().encode('{"suggestions":'))
        sent = true
      },
    })
    const { lines, restore } = captureLogs()
    const realFetch = globalThis.fetch
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("https://places.googleapis.com") ? new Response(stalls, { status: 200 }) : realFetch(input, init),
    )
    const pending = suggest({ input: "1 Main", countryCode: "US" })
    await vi.waitFor(() => expect(sent).toBe(true))
    await vi.advanceTimersByTimeAsync(5_000)
    const response = await pending
    vi.useRealTimers()
    restore()
    expect(await response.json()).toEqual({ enabled: true, suggestions: [] })
    expect(JSON.parse(lines[0]).outcome).toBe("google_timeout")
  })

  it.each(["MX", "GB", "x"])("country %s → enabled, no suggestions, no Google call", async (countryCode) => {
    const calls = trackAllRequests()
    expect(await (await suggest({ input: "1 Main", countryCode })).json()).toEqual({ enabled: true, suggestions: [] })
    expect(calls()).toBe(0)
  })

  it("PLACES_ENABLED off → { enabled: false, suggestions: [] }, no Google call", async () => {
    const calls = trackAllRequests()
    const off = createPlacesAutocompleteHandler({ env: testEnv(), now: () => NOW })
    expect(await (await suggest({ input: "1 Main", countryCode: "US" }, {}, off)).json()).toEqual({ enabled: false, suggestions: [] })
    expect(calls()).toBe(0)
  })

  it.each([
    ["empty input", { input: "", countryCode: "US" }, {}, 400, "BAD_BODY"],
    ["whitespace-only input", { input: "   ", countryCode: "US" }, {}, 400, "BAD_BODY"],
    ["no lookupId", { input: "1 Main", countryCode: "US", lookupId: undefined }, {}, 400, "BAD_BODY"],
    ["a lookupId that is not a UUID v4", { input: "1 Main", countryCode: "US", lookupId: "0f8fad5b-d9cb-169f-a165-70867728950e" }, {}, 400, "BAD_BODY"],
    ["input over 120 characters", { input: "x".repeat(121), countryCode: "US" }, {}, 400, "BAD_BODY"],
    ["no country", { input: "1 Main" }, {}, 400, "BAD_BODY"],
    ["text/plain", "1 Main", { headers: { "Content-Type": "text/plain" } }, 415, "UNSUPPORTED_MEDIA"],
    ["no session", { input: "1 Main", countryCode: "US" }, { session: null }, 401, "SESSION_EXPIRED"],
    ["GET", undefined, { method: "GET" }, 405, "METHOD_NOT_ALLOWED"],
  ])("%s → %i %s, no Google call", async (_label, body, extra, status, errorCode) => {
    const calls = trackAllRequests()
    await expectBffError(await suggest(body, extra), status, errorCode)
    expect(calls()).toBe(0)
  })

  it("an expired access token does not matter (no 1health call)", async () => {
    server.use(http.post(AUTOCOMPLETE, () => HttpResponse.json({ suggestions: [] })))
    expect((await suggest({ input: "1 Main", countryCode: "US" }, { session: makeSession({ accessExpiresAt: NOW - 1 }) })).status).toBe(200)
  })

  it("drops match ranges outside the main text", async () => {
    expect(
      toSuggestions({
        suggestions: [
          {
            placePrediction: {
              placeId: "p",
              structuredFormat: { mainText: { text: "Main", matches: [{ startOffset: 0, endOffset: 4 }, { startOffset: 3, endOffset: 2 }, { startOffset: 1, endOffset: 9 }] } },
            },
          },
        ],
      })[0].matches,
    ).toEqual([{ start: 0, end: 4 }])
  })

  it("never logs the typed text", async () => {
    server.use(http.post(AUTOCOMPLETE, () => HttpResponse.json({ suggestions: [prediction("place-secret-1", "742 Evergreen Terrace")] })))
    const lines: string[] = []
    const restore = setLogSink({ info: (l) => void lines.push(l), warn: (l) => void lines.push(l), error: (l) => void lines.push(l) })
    await suggest({ input: "742 Evergreen", countryCode: "US" })
    restore()
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ method: "POST", routeTemplate: "/api/places/autocomplete", status: 200 })
    expect(lines[0]).not.toMatch(/Evergreen|place-secret/)
  })
})

describe("POST /api/places/details", () => {
  it("calls Place Details with the server field mask and session token; answers the normalized address", async () => {
    let seen: { url: URL; headers: Headers } | undefined
    server.use(
      http.get(DETAILS, ({ request }) => {
        seen = { url: new URL(request.url), headers: request.headers }
        return HttpResponse.json({ formattedAddress: "1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA", addressComponents: components })
      }),
    )
    const session = makeSession()
    const response = await detail({ placeId: PLACE_ID }, { session })
    expect(response.status).toBe(200)
    expectNoStore(response)
    expect(await response.json()).toEqual({
      enabled: true,
      addressLine1: "1600 Amphitheatre Parkway",
      cityName: "Mountain View",
      county: "Santa Clara County",
      stateName: "California",
      postalCode: "94043",
      countryCode: "US",
      country: "United States",
      fullAddress: "1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA",
      complete: true,
    })
    expect(seen?.url.pathname).toBe(`/v1/places/${PLACE_ID}`)
    expect(seen?.url.searchParams.get("sessionToken")).toBe(placesSessionToken(session.sid, LOOKUP, TEST_ENV.SESSION_SECRET))
    expect(seen?.headers.get("X-Goog-FieldMask")).toBe(DETAILS_FIELD_MASK)
    expect(seen?.headers.get("X-Goog-Api-Key")).toBe("test-places-key")
  })

  it.each([
    ["Google 500", () => new HttpResponse(null, { status: 500 }), 502, "UPSTREAM_ERROR", "google_status_500"],
    ["a network error", () => HttpResponse.error(), 502, "UPSTREAM_ERROR", "google_network"],
    ["an unexpected shape", () => HttpResponse.json({ addressComponents: "x" }), 502, "UPSTREAM_ERROR", "google_shape"],
  ])("%s → %i %s, outcome %s logged", async (_label, resolver, status, errorCode, outcome) => {
    server.use(http.get(DETAILS, resolver))
    const { lines, restore } = captureLogs()
    const response = await detail({ placeId: PLACE_ID })
    restore()
    await expectBffError(response, status, errorCode)
    expect(JSON.parse(lines[0]).outcome).toBe(outcome)
  })

  it("GOOGLE_PLACES_KEY missing → 502, no Google call, places_key_missing logged", async () => {
    const calls = trackAllRequests()
    const noKey = createPlacesDetailsHandler({ env: () => ({ ...testEnv(ENABLED)(), GOOGLE_PLACES_KEY: undefined }), now: () => NOW })
    const { lines, restore } = captureLogs()
    const response = await detail({ placeId: PLACE_ID }, {}, noKey)
    restore()
    await expectBffError(response, 502, "UPSTREAM_ERROR")
    expect(JSON.parse(lines[0]).outcome).toBe("places_key_missing")
    expect(calls()).toBe(0)
  })

  it("a Google timeout → 504 UPSTREAM_TIMEOUT", async () => {
    let reached = false
    server.use(
      http.get(DETAILS, async () => {
        reached = true
        await delay("infinite")
        return HttpResponse.json({})
      }),
    )
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const pending = detail({ placeId: PLACE_ID })
    await vi.waitFor(() => expect(reached).toBe(true))
    await vi.advanceTimersByTimeAsync(5_000)
    const response = await pending
    vi.useRealTimers()
    await expectBffError(response, 504, "UPSTREAM_TIMEOUT")
  })

  it("PLACES_ENABLED off → { enabled: false }, no Google call", async () => {
    const calls = trackAllRequests()
    const off = createPlacesDetailsHandler({ env: testEnv(), now: () => NOW })
    expect(await (await detail({ placeId: PLACE_ID }, {}, off)).json()).toEqual({ enabled: false })
    expect(calls()).toBe(0)
  })

  it.each([
    ["too short", "abc"],
    ["a slash", "ChIJN1t/tDeuEmsRUsoyG83frY4"],
    ["a dot segment", "..%2F..%2Fadmin"],
    ["too long", "a".repeat(301)],
  ])("placeId %s → 400 BAD_BODY, no Google call", async (_label, placeId) => {
    const calls = trackAllRequests()
    await expectBffError(await detail({ placeId }), 400, "BAD_BODY")
    expect(calls()).toBe(0)
  })

  it.each([{ PP_DISABLED: "1" }])("%o → 503 on both routes, no Google call", async (env) => {
    const calls = trackAllRequests()
    const a = createPlacesAutocompleteHandler({ env: testEnv({ ...ENABLED, ...env }), now: () => NOW })
    const d = createPlacesDetailsHandler({ env: testEnv({ ...ENABLED, ...env }), now: () => NOW })
    await expectBffError(await suggest({ input: "1 Main", countryCode: "US" }, {}, a), 503, "SERVICE_DISABLED")
    await expectBffError(await detail({ placeId: PLACE_ID }, {}, d), 503, "SERVICE_DISABLED")
    expect(calls()).toBe(0)
  })

  it("ACCOUNT_DISABLED=1 leaves Places working", async () => {
    server.use(http.get(DETAILS, () => HttpResponse.json({ addressComponents: components })))
    const d = createPlacesDetailsHandler({ env: testEnv({ ...ENABLED, ACCOUNT_DISABLED: "1" }), now: () => NOW })
    expect((await detail({ placeId: PLACE_ID }, {}, d)).status).toBe(200)
  })
})

describe("normalizers", () => {
  it("toSuggestions drops predictions without a place prediction or main text", () => {
    expect(toSuggestions({})).toEqual([])
    expect(toSuggestions({ suggestions: [{ queryPrediction: {} }, { placePrediction: { placeId: "p" } }, prediction("p2", "Main")] })).toEqual([
      { placeId: "p2", mainText: "Main", secondaryText: "", matches: [{ start: 0, end: 3 }] },
    ])
    expect(
      toSuggestions({ suggestions: [{ placePrediction: { placeId: "p3", structuredFormat: { mainText: { text: "X" } } } }] }),
    ).toEqual([{ placeId: "p3", mainText: "X", secondaryText: "", matches: [] }])
  })

  it("toAddress marks incomplete addresses and falls back for the city", () => {
    expect(toAddress({})).toEqual({
      addressLine1: "",
      cityName: "",
      county: "",
      stateName: "",
      postalCode: "",
      countryCode: "",
      country: "",
      fullAddress: "",
      complete: false,
    })
    const london = toAddress({
      addressComponents: [
        { longText: "10", types: ["street_number"] },
        { longText: "Downing Street", types: ["route"] },
        { longText: "London", types: ["postal_town"] },
        { longText: "SW1A 2AA", types: ["postal_code"] },
        { longText: "United Kingdom", shortText: "GB", types: ["country"] },
        { longText: "no types" },
      ],
    })
    expect(london).toMatchObject({ addressLine1: "10 Downing Street", cityName: "London", complete: true })
    expect(toAddress({ addressComponents: components.filter((c) => !c.types.includes("street_number")) })?.complete).toBe(false)
  })

  it("placesSessionToken is stable per sid + lookup, 36 base64url characters, and differs per sid and per lookup", () => {
    const secret = "s".repeat(32)
    const a = placesSessionToken("sid-a", LOOKUP, secret)
    expect(a).toMatch(/^[A-Za-z0-9_-]{36}$/)
    expect(placesSessionToken("sid-a", LOOKUP.toUpperCase(), secret)).toBe(a)
    expect(placesSessionToken("sid-b", LOOKUP, secret)).not.toBe(a)
    expect(placesSessionToken("sid-a", "9b2c4f1e-3a5d-4e6f-8a7b-1c2d3e4f5a6b", secret)).not.toBe(a)
  })
})
