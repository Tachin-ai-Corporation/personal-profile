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
  expect(await swrFetcher(keys.npi())).toEqual({ registered: true, provider: { id: 77, npi: "1234567890" }, practice: { id: 88, npi: "1987654321" }, hie: { id: 99, name: "Exchange", endpoint: "sample" } })
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
