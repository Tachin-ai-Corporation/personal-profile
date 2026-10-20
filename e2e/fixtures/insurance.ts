import type { Page, Request } from "@playwright/test"
import { mockProxy, mockTypeKey, PNG_1X1, type FileAnswer, type ProxyAnswer, type ProxyResponder } from "./core"

/** Insurance (Team A, Epic 5) mocks. Stories 5.1–5.5 add their search, write and card mocks here. */

/**
 * One `ResponseInsuranceDTO` as the list returns it (Story 5.1): by default
 * an active Primary Medical policy of the user (Self) with front and back card
 * images (files 900 and 901). Override any field.
 */
export function insurancePolicy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 55,
    memberIdNumber: "948221037",
    insuranceType: "MEDICAL",
    planEffectiveDate: "2025-01-01",
    insuranceOrganizationDTO: { insuranceCompanyName: "UnitedHealthcare", insuranceCompanyId: 7, location: null, naicCode: null },
    insuranceGroupId: "704512",
    expirationDate: "2026-12-31",
    cancellationDate: "1970-01-01",
    subscriber: null,
    owner: null,
    insurancePrecedence: "PRIMARY",
    relationshipToInsured: "SELF",
    label: "Active",
    frontSideCardFile: { id: 900, name: "front.jpg", publicURL: null },
    backSideCardFile: { id: 901, name: "back.jpg", publicURL: null },
    ...overrides,
  }
}

/**
 * The list's page around `rows`, as the backend answers `?page=0&size=100`:
 * its own `PageImpl` (`common/repository/PageImpl.java`: `data`, `lastPage`, …).
 */
export function insurancePage(rows: readonly Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    data: rows,
    pageNumber: 0,
    pageSize: 100,
    offset: 0,
    emptyPage: rows.length === 0,
    firstPage: true,
    lastPage: true,
    numberOfElements: rows.length,
    totalElements: rows.length,
    totalPages: 1,
  }
}

/** `GET v2/health/patient/insurance?page=0&size=100` (Story 5.1); default an empty Page (no policies). */
export async function mockInsurance(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/health/patient/insurance?**", { status: answer.status ?? 200, body: answer.body ?? insurancePage() })
}

/**
 * `GET v2/health/insurance/{insuranceId}/file/{fileId}/download?fileRelKey=…`
 * (Story 5.1 thumbnails and viewer, the proxy's `asImage` entry). Both ids
 * default to any id; the answer defaults to `PNG_1X1`. Returns the requests
 * it answered, in order.
 */
export async function mockInsuranceCard(
  page: Page,
  insuranceId: number | "*" = "*",
  fileId: number | "*" = "*",
  answer: FileAnswer = {},
): Promise<() => Request[]> {
  const seen: Request[] = []
  await page.route(`**/api/1h/v2/health/insurance/${insuranceId}/file/${fileId}/download?**`, (route) => {
    seen.push(route.request())
    return route.fulfill({ status: answer.status ?? 200, contentType: answer.contentType ?? "image/png", body: answer.body ?? PNG_1X1 })
  })
  return () => [...seen]
}

/**
 * The Insurance type key with its value lists (Story 5.2): Type on the type,
 * Precedence and Relationship on the `InsuranceBelongsToPerson` relation
 * (decision 1A), each with the backend's `n/a`.
 */
export const INSURANCE_TYPE_KEY_BODY = Object.freeze({
  boKey: "Insurance",
  attributes: [
    {
      attrKey: "insuranceType",
      name: "Insurance Type",
      type: "VALUE_LIST",
      attributeValues: ["n/a", "Dental", "Medical", "Drug", "Vision", "Hospice"].map((name, id) => ({ id: id + 1, name })),
    },
  ],
  relationships: [
    {
      relKey: "InsuranceBelongsToPerson",
      attributes: [
        {
          attrKey: "insurancePrecedence",
          type: "VALUE_LIST",
          attributeValues: ["n/a", "Primary", "Secondary", "Supplemental", "Other"].map((name, id) => ({ id: id + 10, name })),
        },
        {
          attrKey: "relationshipToInsured",
          name: "Relationship to insured",
          type: "VALUE_LIST",
          attributeValues: ["n/a", "Self", "Spouse", "Child", "Dependent", "Parent"].map((name, id) => ({ id: id + 20, name })),
        },
      ],
    },
  ],
})

/** `GET v2/type/key/Insurance` with the editor's value lists (Story 5.2); pass `{ status: 500 }` for the options error. */
export async function mockInsuranceTypeKey(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockTypeKey(page, "Insurance", { status: answer.status ?? 200, body: answer.body ?? INSURANCE_TYPE_KEY_BODY })
}

/** Insurers the search knows by default (Story 5.2). */
export const INSURERS = Object.freeze([
  { id: 7, name: "Blue Shield" },
  { id: 8, name: "Blue Cross" },
  { id: 9, name: "Delta Dental" },
  { id: 11, name: "UnitedHealthcare" },
])

/**
 * `GET v2/health/insurance/organizations?name=&page=&size=20` (Story 5.2
 * insurer search): the backend `PageImpl` of the insurers whose name contains
 * `name` (case-insensitive), one page. Returns the requests it answered.
 */
export async function mockInsurers(page: Page, insurers: readonly { readonly id: number; readonly name: string }[] = INSURERS): Promise<() => Request[]> {
  return mockProxy(page, "v2/health/insurance/organizations?**", (request) => {
    const name = (new URL(request.url()).searchParams.get("name") ?? "").toLowerCase()
    const data = insurers.filter((insurer) => insurer.name.toLowerCase().includes(name))
    return { body: { data, lastPage: true, pageNumber: 0, pageSize: 20, totalElements: data.length } }
  })
}

export type InsuranceSaveBody = Record<string, unknown>

/** Records each body of `method` on `glob` and answers it (default 200 with the body and id 60). */
async function recordInsuranceWrites(page: Page, method: "POST" | "PUT", glob: string, answer: ProxyResponder): Promise<() => { readonly url: string; readonly body: InsuranceSaveBody }[]> {
  const seen: { url: string; body: InsuranceSaveBody }[] = []
  await page.route(`**/api/1h/${glob}`, (route) => {
    const request = route.request()
    if (request.method() !== method) return route.fallback()
    const body = (request.postDataJSON() ?? {}) as InsuranceSaveBody
    seen.push({ url: new URL(request.url()).pathname, body })
    const { status = 200, body: reply = { id: 60, ...body } } = typeof answer === "function" ? answer(request) : answer
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(reply) })
  })
  return () => [...seen]
}

/** `POST v2/health/patient/insurance` (Story 5.2 Add); returns the bodies sent. */
export async function mockInsuranceCreate(page: Page, answer: ProxyResponder = {}): Promise<() => InsuranceSaveBody[]> {
  const seen = await recordInsuranceWrites(page, "POST", "v2/health/patient/insurance", answer)
  return () => seen().map((write) => write.body)
}

/** `PUT v2/health/patient/insurance/{id}` (Story 5.2 Edit); returns each `{ url, body }` sent. */
export async function mockInsuranceUpdate(page: Page, answer: ProxyResponder = {}): Promise<() => { readonly url: string; readonly body: InsuranceSaveBody }[]> {
  return recordInsuranceWrites(page, "PUT", "v2/health/patient/insurance/*", answer)
}
