import { describe, expect, it } from "vitest"
import { orgLogoPath, organizationsPath, ORGS_PAGE_SIZE } from "."

/** My Organizations (Team B, Epic 10). Team B adds its own cases here. */
describe("organizations", () => {
  it("paths and constants", () => {
    expect(ORGS_PAGE_SIZE).toBe(12)
    expect(organizationsPath("a&b", 1)).toBe("/api/1h/v2/user/organization/portal?name=a%26b&page=1&size=12")
    expect(orgLogoPath(9)).toBe("/api/pp/org-logo/9")
  })
})

import { http, HttpResponse } from "msw"
import { server } from "@/test/msw-server"
import { ApiResponseError, keys, listOrganizations, mapApiError, swrFetcher } from "."

const organizationRoute = "/api/1h/v2/user/organization/portal"
const organizationRow = (tenantId: number | string = 7, name = "Zulu", shortOrganizationName: string | null = null) => ({
  tenantId, enabledInTenant: true, subdomain: "private-routing", tenantLogo: { publicUrl: "https://private-logo.example/logo.png" },
  organization: { id: 77, name, shortOrganizationName, type: ["Lab"], personContacts: [], privateConfiguration: "hidden-config" },
})
const organizationPage = (data: readonly unknown[] = []) => ({ data, totalElements: data.length, totalPages: data.length ? 1 : 0, pageNumber: 0, lastPage: true })

it("loads through the registered key, trims names, sorts renderable organizations and whitelists nested fields", async () => {
  server.use(http.get(organizationRoute, ({ request }) => {
    expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({ name: "clinic", page: "2", size: "12" })
    expect(request.headers.get("X-PP-Activity")).toBeNull()
    return HttpResponse.json({ ...organizationPage([
      organizationRow(7, "Zulu"), { ...organizationRow(2), organization: null },
      { ...organizationRow("9223372036854775807", "Full Name", "alpha"), organization: { ...organizationRow().organization,
        name: "Full Name", shortOrganizationName: "alpha", type: ["Supplier"], personContacts: [{ firstName: "Ann", middleName: "n/a", lastName: "Lee", email: "ann@example.test", phoneNumber: "4155552125", phoneNumberRegion: "us", contactTypes: ["Primary"], secret: "hidden-contact" }] } },
      organizationRow(8, "beta", "n/a"),
    ]), totalElements: 49, totalPages: 5, pageNumber: 2 })
  }))
  const result = await listOrganizations({ name: "  clinic  ", page: 2 })
  expect(result).toMatchObject({ success: true, statusCode: 200, data: { totalElements: 49, totalPages: 5, pageNumber: 2 } })
  expect(result.data?.items.map((item) => [item.tenantId, item.shortName, item.name])).toEqual([
    ["9223372036854775807", "alpha", "Full Name"], ["8", null, "beta"], ["7", null, "Zulu"],
  ])
  expect(result.data?.items[0].personContacts).toEqual([{ firstName: "Ann", middleName: "n/a", lastName: "Lee", email: "ann@example.test", phoneNumber: "4155552125", phoneNumberRegion: "us", contactTypes: ["Primary"] }])
  expect(JSON.stringify(result.data)).not.toMatch(/private-routing|private-logo|hidden-config|hidden-contact|tenantLogo|subdomain/)
  expect(await swrFetcher(keys.orgs("clinic", 2))).toEqual(result.data)
})
it("sorts by displayed names after trimming surrounding whitespace", async () => {
  server.use(http.get(organizationRoute, () => HttpResponse.json(organizationPage([
    organizationRow(1, " Zebra "), organizationRow(2, "Alpha"), organizationRow(3, "Omega", "  beta "),
  ]))))
  expect((await listOrganizations({ name: "", page: 0 })).data?.items.map((item) => item.tenantId)).toEqual(["2", "3", "1"])
})
it.each([
  { type: null, personContacts: null }, {},
  { type: [], personContacts: [{ contactTypes: null }] },
  { type: [], personContacts: [{}] },
])("normalizes optional lists and requires explicit enabled membership: %j", async (fields) => {
  server.use(http.get(organizationRoute, () => HttpResponse.json(organizationPage([{ tenantId: "00007", organization: { name: "Clinic", ...fields } }]))))
  expect((await listOrganizations({ name: "", page: 0 })).data?.items[0]).toMatchObject({ tenantId: "00007", enabledInTenant: false, shortName: null, types: [], personContacts: "personContacts" in fields && Array.isArray(fields.personContacts) ? [{ contactTypes: [] }] : [] })
})
it("normalizes null enabled membership and retains server totals for an entirely null organization page", async () => {
  server.use(http.get(organizationRoute, () => HttpResponse.json({ ...organizationPage([{ tenantId: 7, enabledInTenant: null, organization: null }]), totalElements: 13, totalPages: 2 })))
  expect((await listOrganizations({ name: "", page: 0 })).data).toEqual({ items: [], totalElements: 13, totalPages: 2, pageNumber: 0 })
})
it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "0", "000", "-1", "1x", "1".repeat(20)])("rejects unsafe or unusable tenant id %s", async (tenantId) => {
  server.use(http.get(organizationRoute, () => HttpResponse.json(organizationPage([organizationRow(tenantId)]))))
  expect(await listOrganizations({ name: "", page: 0 })).toEqual({ success: false, statusCode: 200 })
})
it.each([null, {}, { content: [], totalElements: 0, totalPages: 0, pageNumber: 0 },
  { ...organizationPage(), totalElements: -1 }, { ...organizationPage(), totalPages: "1" },
  { ...organizationPage(), pageNumber: -1 }, organizationPage(Array.from({ length: 13 }, () => organizationRow())),
  organizationPage([{ tenantId: 7, organization: { name: "Clinic", type: [1] } }]),
])("rejects malformed organization page %j", async (body) => {
  server.use(http.get(organizationRoute, () => HttpResponse.json(body)))
  expect(await listOrganizations({ name: "", page: 0 })).toEqual({ success: false, statusCode: 200 })
  await expect(swrFetcher(keys.orgs("", 0))).rejects.toBeInstanceOf(ApiResponseError)
})
it.each([{ name: "a".repeat(101), page: 0 }, { name: "", page: -1 }, { name: "", page: 10000 }, { name: "", page: 0.5 }])("rejects invalid arguments before transport: %j", async (input) => {
  expect(await listOrganizations(input)).toEqual({ success: false, statusCode: 400 })
})
it.each([["pp", "orgs", 1, 0], ["pp", "orgs", "", "0"]])("rejects malformed registry arguments: %j", async (...key) => {
  await expect(swrFetcher(key)).rejects.toBeInstanceOf(ApiResponseError)
})
it.each([403, 409, 500])("preserves failed responses and maps only upstream 403 to no access: %i", async (status) => {
  server.use(http.get(organizationRoute, () => HttpResponse.json({ message: "Rejected", code: status }, { status })))
  const result = await listOrganizations({ name: "", page: 0 })
  expect(result).toMatchObject({ success: false, statusCode: status, platformMessage: "Rejected", upstreamCode: status })
  expect(mapApiError("organizations", result).kind).toBe(status === 403 ? "forbidden" : "generic")
})
it("preserves network/proxy failures without converting them to an empty list", async () => {
  server.use(http.get(organizationRoute, () => HttpResponse.error()))
  expect((await listOrganizations({ name: "", page: 0 })).success).toBe(false)
  server.use(http.get(organizationRoute, () => HttpResponse.json({ source: "proxy", errorCode: "NOT_ALLOWED" }, { status: 403 })))
  expect(mapApiError("organizations", await listOrganizations({ name: "", page: 0 }))).toEqual({ kind: "generic" })
  expect(orgLogoPath("9223372036854775807")).toBe("/api/pp/org-logo/9223372036854775807")
})
