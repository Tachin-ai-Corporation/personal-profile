import { describe, expect, it } from "vitest"
import { NPI_PAGE_SIZE, NPI_SEARCH_MAX_LENGTH, npiIsRegisteredPath, personalNpiSearchPath, practiceNpiSearchPath, registerNpiPath, userNpiPath } from "."

/** Provider registration (Team B, Epic 9). Team B adds its own cases here. */
describe("npi", () => {
  it("paths and constants", () => {
    expect(NPI_PAGE_SIZE).toBe(10)
    expect(NPI_SEARCH_MAX_LENGTH).toBe(100)
    expect(personalNpiSearchPath("ann lee", 0)).toBe("/api/1h/v2/public/npi/list?entityTypeCode=1&searchText=ann+lee&page=0&limit=10")
    expect(practiceNpiSearchPath("", 3)).toBe("/api/1h/v2/public/npi/list?entityTypeCode=2&searchText=&page=3&limit=10")
    expect(userNpiPath()).toBe("/api/1h/v2/user/npi")
    expect(npiIsRegisteredPath(77)).toBe("/api/1h/v2/health/npi/77/is-registered")
    expect(registerNpiPath()).toBe("/api/1h/v2/user/register/npi")
  })
})

import { http, HttpResponse } from "msw"
import { server } from "@/test/msw-server"
import { ApiResponseError, getUserNpi, keys, mapApiError, searchPersonalNpi, searchPracticeNpi, swrFetcher } from "."

const individual = { id: 77, npi: 1234567890, providerFirstName: "Ann", providerLastName: "Lee", providerBusinessMailingAddressCityName: "Austin", providerBusinessMailingAddressStateName: "TX" }
const practice = { id: 88, npi: 1987654321, providerOrganizationName: "Sample Clinic", providerFirstLineBusinessMailingAddress: "1 Main St", providerBusinessMailingAddressCityName: "Austin", providerBusinessMailingAddressStateName: "TX" }
const searchPath = "/api/1h/v2/public/npi/list"

it.each([{}, { providerNpi: null, practiceNpi: null, hieEndpoint: null }])("loads absent/null registration without inventing credentials", async (body) => {
  const activityHeaders: (string | null)[] = []
  server.use(http.get(userNpiPath(), ({ request }) => {
    activityHeaders.push(request.headers.get("X-PP-Activity"))
    return HttpResponse.json(body)
  }))
  expect(await getUserNpi()).toEqual({ success: true, statusCode: 200, data: { registered: false } })
  expect(await swrFetcher(keys.npi())).toEqual({ registered: false })
  expect(activityHeaders).toEqual([null, null])
})
it("maps registered credentials and optional practice/HIE through the registered SWR loader", async () => {
  server.use(http.get(userNpiPath(), () => HttpResponse.json({ providerNpi: individual, practiceNpi: practice, hieEndpoint: { id: 99, name: "Exchange", endpoint: "sample" } })))
  expect(await swrFetcher(keys.npi())).toEqual({ registered: true, provider: { id: 77, npi: "1234567890" }, practice: { id: 88, npi: "1987654321", providerOrganizationName: "Sample Clinic" }, hie: { id: 99, name: "Exchange", endpoint: "sample" } })
})
it.each([null, [], "bad", { message: "Service unavailable" }, { unexpected: true }, { providerNpi: {} }, { providerNpi: { id: 77, npi: "1234567890" } }, { practiceNpi: false }, { hieEndpoint: { id: "bad" } }])("rejects malformed user payload %j", async (body) => {
  server.use(http.get(userNpiPath(), () => HttpResponse.json(body)))
  expect(await getUserNpi()).toEqual({ success: false, statusCode: 200 })
  await expect(swrFetcher(keys.npi())).rejects.toBeInstanceOf(ApiResponseError)
})
it.each([403, 404, 500])("preserves user read failure %i", async (status) => {
  server.use(http.get(userNpiPath(), () => HttpResponse.json({ message: "Rejected", code: status }, { status })))
  expect(await getUserNpi()).toMatchObject({ success: false, statusCode: status, platformMessage: "Rejected", upstreamCode: status })
})
it.each([
  [searchPersonalNpi, 1, individual, "1234567890, Ann Lee, Austin, TX", undefined],
  [searchPracticeNpi, 2, practice, "1987654321, Sample Clinic, 1 Main St, Austin, TX", "1 Main St"],
] as const)("locks search function type %i, trims and maps record ids and labels", async (search, type, record, label, addressLine1) => {
  server.use(http.get(searchPath, ({ request }) => {
    expect(request.headers.get("X-PP-Activity")).toBe("user")
    const query = new URL(request.url).searchParams
    expect(Object.fromEntries(query)).toEqual({ entityTypeCode: String(type), searchText: "1987654321", page: "2", limit: "10" })
    return HttpResponse.json({ data: [record], totalElements: 31 })
  }))
  const result = await search({ searchText: " 1987654321 ", page: 2 })
  expect(result).toMatchObject({ success: true, data: { totalElements: 31, hasMore: true, items: [{ id: record.id, npi: String(record.npi), label, city: "Austin", state: "TX" }] } })
  expect(result.data?.items[0].addressLine1).toBe(addressLine1)
})
it.each([searchPersonalNpi, searchPracticeNpi])("handles null/absent optional strings and speculative end totals", async (search) => {
  server.use(http.get(searchPath, () => HttpResponse.json({ data: [{ id: 77, npi: 1234567890, providerFirstName: null, providerLastName: null, providerOrganizationName: null, providerFirstLineBusinessMailingAddress: null, providerBusinessMailingAddressCityName: null, providerBusinessMailingAddressStateName: null }], totalElements: 1 })))
  expect(await search({ searchText: "", page: 0 })).toMatchObject({ success: true, data: { hasMore: false, items: [{ id: 77, npi: "1234567890", name: "", city: "", state: "", label: "1234567890" }] } })
  server.use(http.get(searchPath, () => HttpResponse.json({ data: [{ id: 77, npi: 1234567890 }], totalElements: 1 })))
  expect((await search({ searchText: "", page: 0 })).data?.items[0].label).toBe("1234567890")
  server.use(http.get(searchPath, () => HttpResponse.json({ data: [], totalElements: 10 })))
  expect((await search({ searchText: "", page: 1 })).data).toEqual({ items: [], totalElements: 10, hasMore: false })
})
it.each([{}, { data: [] }, { data: [], totalElements: -1 }, { data: [{}], totalElements: 1 }, { data: [{ id: 1, npi: "1234567890" }], totalElements: 1 }, { data: Array(11).fill(individual), totalElements: 11 }])("rejects malformed search payload %j", async (body) => {
  server.use(http.get(searchPath, () => HttpResponse.json(body)))
  expect(await searchPersonalNpi({ searchText: "", page: 0 })).toEqual({ success: false, statusCode: 200 })
})
it.each([{ searchText: "x".repeat(101), page: 0 }, { searchText: "", page: -1 }, { searchText: "", page: 10000 }])("rejects invalid search arguments without transport", async (input) => {
  expect(await searchPracticeNpi(input)).toEqual({ success: false, statusCode: 400 })
})
it("forwards the AbortSignal and never converts failed or aborted reads into results", async () => {
  const controller = new AbortController()
  controller.abort()
  expect((await searchPersonalNpi({ searchText: "", page: 0 }, controller.signal)).success).toBe(false)
  server.use(http.get(searchPath, () => HttpResponse.json({ message: "Forbidden", code: 403 }, { status: 403 })))
  expect(mapApiError("provider", await searchPersonalNpi({ searchText: "", page: 0 }))).toEqual({ kind: "forbidden" })
})

it.each([searchPersonalNpi, searchPracticeNpi])("ends supported pagination at page9999 despite speculative totals", async (search) => {
  server.use(http.get(searchPath, () => HttpResponse.json({ data: Array.from({ length: 10 }, (_, id) => ({ ...individual, id: id + 1 })), totalElements: 100010 })))
  expect((await search({ searchText: "", page: 9998 })).data?.hasMore).toBe(true)
  expect((await search({ searchText: "", page: 9999 })).data).toMatchObject({ hasMore: false, totalElements: 100010 })
})

it("trims each individual name part before composing the display label", async () => {
  server.use(http.get(searchPath, () => HttpResponse.json({ data: [{ ...individual, providerFirstName: " Ann ", providerLastName: " Lee " }], totalElements: 1 })))
  expect((await searchPersonalNpi({ searchText: "Ann", page: 0 })).data?.items[0]).toMatchObject({ name: "Ann Lee", label: "1234567890, Ann Lee, Austin, TX" })
})

import { fetchMyself, isNpiRegistered, registerNpi, type NpiRegistrationInput } from "."
import { trackAllRequests } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"

it("whitelists every registered display field without retaining unrelated credential/contact data", async () => {
  server.use(http.get(userNpiPath(), () => HttpResponse.json({
    providerNpi: { ...individual, taxonomy: { name: "Family medicine", id: 1, secret: "omit" }, providerLicenseNumber: "TEST-123", providerFirstLineBusinessPracticeLocationAddress: "1 Test St", providerSecondLineBusinessPracticeLocationAddress: "Suite 2", email: "omit@example.com" },
    practiceNpi: { ...practice, verified: true, organization: { tenantId: "0", id: 99, name: "omit" }, providerFirstLineBusinessPracticeLocationAddress: "2 Practice St", contact: "omit" },
    hieEndpoint: { id: 99, name: "Exchange", endpoint: "test endpoint", secret: "omit" },
  })))
  expect((await getUserNpi()).data).toEqual({ registered: true,
    provider: { id: 77, npi: "1234567890", taxonomy: { name: "Family medicine" }, providerLicenseNumber: "TEST-123", providerFirstLineBusinessPracticeLocationAddress: "1 Test St", providerSecondLineBusinessPracticeLocationAddress: "Suite 2" },
    practice: { id: 88, npi: "1987654321", verified: true, organization: { tenantId: 0 }, providerOrganizationName: "Sample Clinic", providerFirstLineBusinessPracticeLocationAddress: "2 Practice St" },
    hie: { id: 99, name: "Exchange", endpoint: "test endpoint" },
  })
})
it.each([undefined, null, "", "  ", " n/A ", -1, "-1"])("keeps provider presence independent of display NPI sentinel %j", async (npi) => {
  server.use(http.get(userNpiPath(), () => HttpResponse.json({ providerNpi: { id: 77, npi, taxonomy: { name: -1 }, providerLicenseNumber: -1, providerFirstLineBusinessPracticeLocationAddress: null, providerSecondLineBusinessPracticeLocationAddress: " n/a " }, practiceNpi: { id: 88, npi }, hieEndpoint: { id: 99, endpoint: -1 } })))
  expect((await getUserNpi()).data).toMatchObject({ registered: true, provider: { npi: npi == null ? "" : String(npi), taxonomy: { name: "-1" }, providerLicenseNumber: "-1", providerFirstLineBusinessPracticeLocationAddress: null, providerSecondLineBusinessPracticeLocationAddress: " n/a " }, practice: { npi: npi == null ? "" : String(npi) }, hie: { endpoint: "-1" } })
})
it.each([
  [{}, null], [{ tenantId: null }, null], [{ tenantId: "bad" }, null], [{ tenantId: -1 }, null], [{ tenantId: Number.MAX_SAFE_INTEGER + 1 }, null], [{ tenantId: "9007199254740992" }, null], [{ tenantId: "1.2" }, null], [{ tenantId: "" }, null], [{ tenantId: 0 }, 0], [{ tenantId: "42" }, 42], [{ tenantId: 42 }, 42],
] as const)("preserves organization presence for %j while normalizing tenant to %j", async (organization, tenantId) => {
  server.use(http.get(userNpiPath(), () => HttpResponse.json({ providerNpi: individual, practiceNpi: { ...practice, organization } })))
  expect((await getUserNpi()).data?.practice?.organization).toEqual({ tenantId })
})
it.each([
  { providerNpi: { ...individual, taxonomy: { name: 42 } } }, { providerNpi: { ...individual, providerLicenseNumber: {} } }, { providerNpi: { ...individual, id: 0 } },
  { practiceNpi: { ...practice, organization: false } }, { practiceNpi: { ...practice, verified: "true" } },
])("rejects invalid optional registered fields rather than qualifying eligibility: %j", async (body) => {
  server.use(http.get(userNpiPath(), () => HttpResponse.json(body)))
  expect(await getUserNpi()).toEqual({ success: false, statusCode: 200 })
})
it.each([false, null, undefined])("preserves the actual verified flag %j and absent organization", async (verified) => {
  server.use(http.get(userNpiPath(), () => HttpResponse.json({ practiceNpi: { ...practice, verified, organization: null } })))
  expect((await getUserNpi()).data).toMatchObject({ registered: false, practice: { organization: null, ...(verified === undefined ? {} : { verified }) } })
})

describe("uncached NPI availability", () => {
  it.each([true, false])("accepts only a raw %j and defaults to passive activity on every request", async (answer) => {
    const activity: (string | null)[] = []
    server.use(http.get(npiIsRegisteredPath(77), ({ request }) => { activity.push(request.headers.get("X-PP-Activity")); return HttpResponse.json(answer) }))
    expect(await isNpiRegistered(77)).toEqual({ success: true, statusCode: 200, data: answer })
    expect(await isNpiRegistered(77, { userInitiated: true })).toEqual({ success: true, statusCode: 200, data: answer })
    expect(activity).toEqual([null, "user"])
  })
  it.each([null, 0, "false", { registered: false }, [], undefined])("rejects malformed or empty successful body %j", async (body) => {
    server.use(http.get(npiIsRegisteredPath(77), () => body === undefined ? new HttpResponse(null, { status: 200 }) : HttpResponse.json(body)))
    expect(await isNpiRegistered(77)).toEqual({ success: false, statusCode: 200 })
  })
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid record id %j without transport", async (id) => {
    const calls = trackAllRequests()
    expect(await isNpiRegistered(id)).toEqual({ success: false, statusCode: 400 })
    expect(calls()).toBe(0)
  })
  it.each([403, 409, 502, 504])("preserves failure metadata %i without claiming availability", async (status) => {
    server.use(http.get(npiIsRegisteredPath(77), () => HttpResponse.json({ message: "Rejected", code: status }, { status })))
    expect(await isNpiRegistered(77)).toMatchObject({ success: false, statusCode: status, platformMessage: "Rejected", upstreamCode: status, data: undefined })
  })
  it("does not retry network failure and forwards an already-aborted signal", async () => {
    let calls = 0
    server.use(http.get(npiIsRegisteredPath(77), () => { calls++; return HttpResponse.error() }))
    expect((await isNpiRegistered(77)).success).toBe(false)
    expect(calls).toBe(1)
    const controller = new AbortController()
    controller.abort()
    expect((await isNpiRegistered(77, { signal: controller.signal })).success).toBe(false)
    expect(calls).toBe(1)
  })
})

async function pinNpiUser() {
  server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
  expect((await fetchMyself()).success).toBe(true)
}

describe("NPI registration guarded mutation", () => {
  it.each([{ providerNpiId: 77 }, { providerNpiId: 77, practiceNpiId: 88 }])("sends exact numeric registry ids %j and acknowledges backend void200", async (body) => {
    await pinNpiUser()
    let posts = 0
    let preflights = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => { preflights++; return HttpResponse.json(myselfWire()) }),
      http.post(registerNpiPath(), async ({ request }) => {
        posts++
        expect(await request.json()).toEqual(body)
        expect(new URL(request.url).search).toBe("")
        expect(request.headers.get("X-PP-Activity")).toBe("user")
        expect(request.headers.get("Content-Type")).toContain("application/json")
        return new HttpResponse(null, { status: 200 })
      }),
    )
    expect(await registerNpi(body)).toEqual({ success: true, statusCode: 200 })
    expect(posts).toBe(1)
    expect(preflights).toBe(1)
  })
  it.each([{}, null, { providerNpiId: "77" }, { providerNpiId: 0 }, { providerNpiId: -1 }, { providerNpiId: 1.5 }, { providerNpiId: Number.MAX_SAFE_INTEGER + 1 }, { providerNpiId: 77, practiceNpiId: null }, { providerNpiId: 77, practiceNpiId: "88" }, { providerNpiId: 77, practiceNpiId: 0 }, { providerNpiId: 77, extra: true }])("rejects invalid registration body %j before identity or mutation traffic", async (body) => {
    const calls = trackAllRequests()
    expect(await registerNpi(body as NpiRegistrationInput)).toEqual({ success: false, statusCode: 400 })
    expect(calls()).toBe(0)
  })
  it("blocks an unpinned write without any network request", async () => {
    const calls = trackAllRequests()
    expect((await registerNpi({ providerNpiId: 77 })).success).toBe(false)
    expect(calls()).toBe(0)
  })
  it.each(["mismatch", "missing id", "unreadable", "missing response"])("does not infer write success from %s identity preflight", async (answer) => {
    await pinNpiUser()
    let posts = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => answer === "mismatch" ? HttpResponse.json(myselfWire({ id: 9999 })) : answer === "missing id" ? HttpResponse.json({}) : answer === "unreadable" ? new HttpResponse("bad json") : new HttpResponse(null, { status: 200 })),
      http.post(registerNpiPath(), () => { posts++; return new HttpResponse(null, { status: 200 }) }),
    )
    const result = await registerNpi({ providerNpiId: 77 })
    expect(result.success).toBe(false)
    if (answer === "mismatch") expect(result).toMatchObject({ statusCode: 401, errorCode: "SESSION_EXPIRED" })
    else expect(result.statusCode).toBeUndefined()
    expect(posts).toBe(0)
  })
  it("aborts a held identity check without sending registration", async () => {
    await pinNpiUser()
    const controller = new AbortController()
    let release!: () => void
    const started = new Promise<void>((resolve) => { release = resolve })
    let finish!: () => void
    const held = new Promise<void>((resolve) => { finish = resolve })
    let posts = 0
    server.use(http.get("/api/1h/v2/user/myself", async () => { release(); await held; return HttpResponse.json(myselfWire()) }), http.post(registerNpiPath(), () => { posts++; return new HttpResponse(null, { status: 200 }) }))
    const pending = registerNpi({ providerNpiId: 77 }, controller.signal)
    await started
    controller.abort()
    expect((await pending).success).toBe(false)
    finish()
    expect(posts).toBe(0)
  })
  it.each([403, 409, 502, 504, "network", "unreadable"])("preserves %s failure without automatically replaying the mutation", async (status) => {
    await pinNpiUser()
    let posts = 0
    server.use(http.post(registerNpiPath(), () => {
      posts++
      return status === "network" ? HttpResponse.error() : status === "unreadable" ? new HttpResponse("invalid json") : HttpResponse.json({ message: "Registration rejected", code: status }, { status: Number(status) })
    }))
    const result = await registerNpi({ providerNpiId: 77 })
    expect(result.success).toBe(false)
    if (typeof status === "number") expect(result).toMatchObject({ statusCode: status, platformMessage: "Registration rejected", upstreamCode: status })
    if (status === "unreadable") expect(result.statusCode).toBe(200)
    expect(posts).toBe(1)
  })
  it("replays only after proxy TOKEN_EXPIRED and one successful refresh", async () => {
    await pinNpiUser()
    let posts = 0
    let refreshes = 0
    server.use(http.post(registerNpiPath(), () => ++posts === 1 ? HttpResponse.json({ errorCode: "TOKEN_EXPIRED", source: "proxy" }, { status: 401 }) : new HttpResponse(null, { status: 200 })), http.post("/api/session/refresh", () => { refreshes++; return HttpResponse.json({ ok: true }) }))
    expect(await registerNpi({ providerNpiId: 77 })).toEqual({ success: true, statusCode: 200 })
    expect(posts).toBe(2)
    expect(refreshes).toBe(1)
  })
})
