import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import {
  fetchInsurance,
  INSURANCE_CARD_RELATIONS,
  INSURANCE_CARD_SIDES,
  INSURANCE_DELETED_LABEL,
  INSURANCE_TYPE_KEY,
  insuranceCardDownloadPath,
  insuranceCardUploadPath,
  insuranceListPath,
  INSURER_PAGE_SIZE,
  keys,
  loadInsurance,
  swrFetcher,
  toInsurancePolicies,
  type InsurancePolicy,
} from "."

/** Insurance (Team A, Epic 5). Team A adds its own cases here. */

const LIST = "/api/1h/v2/health/patient/insurance"

/** A backend `ResponseInsuranceDTO` (Story 5.1 fields, plus ones the client ignores). */
const wire = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 55,
  memberIdNumber: "948221037",
  insuranceType: "MEDICAL",
  planEffectiveDate: "2025-01-01",
  insuranceOrganizationDTO: { insuranceCompanyName: "UnitedHealthcare", insuranceCompanyId: 7, naicCode: null, location: null },
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
})

const policy = (overrides: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  id: 55,
  type: "MEDICAL",
  precedence: "PRIMARY",
  relationship: "SELF",
  deleted: false,
  insurer: "UnitedHealthcare",
  subscriber: null,
  memberId: "948221037",
  groupId: "704512",
  effectiveDate: "2025-01-01",
  expirationDate: "2026-12-31",
  cancellationDate: "1970-01-01",
  cardFileIds: { front: 900, back: 901 },
  ...overrides,
})

const page = (content: unknown[]) => ({ content, last: true, totalElements: content.length, totalPages: 1, number: 0, size: 100 })

describe("insurance", () => {
  it("paths and constants", () => {
    expect(INSURANCE_TYPE_KEY).toBe("Insurance")
    expect(INSURER_PAGE_SIZE).toBe(20)
    expect(INSURANCE_DELETED_LABEL).toBe("Deleted")
    expect(INSURANCE_CARD_SIDES).toEqual(["front", "back"])
    expect(insuranceListPath()).toBe("/api/1h/v2/health/patient/insurance?page=0&size=100")
    expect(insuranceCardUploadPath(55, "back")).toBe(`/api/1h/v2/health/type/Insurance/55/relation/${INSURANCE_CARD_RELATIONS.back}/file/upload`)
  })
})

describe("insuranceCardDownloadPath (Story 5.1)", () => {
  it("builds the same-origin download of a side", () => {
    expect(insuranceCardDownloadPath(55, 900, "front")).toBe("/api/1h/v2/health/insurance/55/file/900/download?fileRelKey=InsuranceHasFrontSideCardFile")
    expect(insuranceCardDownloadPath(55, 901, "back")).toBe("/api/1h/v2/health/insurance/55/file/901/download?fileRelKey=InsuranceHasBackSideCardFile")
  })

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("refuses the id %d", (id) => {
    expect(insuranceCardDownloadPath(id, 900, "front")).toBeNull()
    expect(insuranceCardDownloadPath(55, id, "back")).toBeNull()
  })
})

describe("toInsurancePolicies (Story 5.1)", () => {
  it("maps a Spring Page's rows in platform order, Deleted ones included", () => {
    expect(
      toInsurancePolicies(
        page([
          wire(),
          wire({
            id: 56,
            insuranceType: "DENTAL",
            insurancePrecedence: "SECONDARY",
            relationshipToInsured: "SPOUSE",
            subscriber: { firstName: "Sam", lastName: "Lee", email: "sam@example.com" },
            frontSideCardFile: null,
            backSideCardFile: undefined,
          }),
          wire({ id: 57, label: INSURANCE_DELETED_LABEL, insuranceType: "VISION" }),
        ]),
      ),
    ).toEqual([
      policy(),
      policy({ id: 56, type: "DENTAL", precedence: "SECONDARY", relationship: "SPOUSE", subscriber: { firstName: "Sam", lastName: "Lee" }, cardFileIds: { front: null, back: null } }),
      policy({ id: 57, type: "VISION", deleted: true }),
    ])
  })

  it("accepts a bare list, and reads missing values as null", () => {
    expect(toInsurancePolicies([{}])).toEqual([
      {
        id: null,
        type: null,
        precedence: null,
        relationship: null,
        deleted: false,
        insurer: null,
        subscriber: null,
        memberId: null,
        groupId: null,
        effectiveDate: null,
        expirationDate: null,
        cancellationDate: null,
        cardFileIds: { front: null, back: null },
      },
    ])
    expect(
      toInsurancePolicies([{ insuranceOrganizationDTO: {}, subscriber: {}, frontSideCardFile: {}, backSideCardFile: { id: null } }])?.[0],
    ).toMatchObject({ insurer: null, subscriber: { firstName: null, lastName: null }, cardFileIds: { front: null, back: null } })
  })

  it("keeps the enums as constant names, N_A included; only label \"Deleted\" is deleted", () => {
    const [row] = toInsurancePolicies([wire({ insuranceType: "N_A", insurancePrecedence: "N_A", relationshipToInsured: "N_A", label: "deleted" })]) ?? []
    expect(row).toMatchObject({ type: "N_A", precedence: "N_A", relationship: "N_A", deleted: false })
  })

  it("reads an empty Page and an empty list as no policies", () => {
    expect(toInsurancePolicies(page([]))).toEqual([])
    expect(toInsurancePolicies([])).toEqual([])
  })

  it.each([
    ["an object without content", { totalElements: 0 }],
    ["a Page whose content is not a list", { content: null }],
    ["a row with a string id", [{ id: "1" }]],
    ["a row with a string file id", [{ frontSideCardFile: { id: "900" } }]],
    ["a row with a numeric date", [{ planEffectiveDate: 20250101 }]],
    ["a string", "nope"],
    ["null", null],
  ])("rejects %s", (_case, body) => {
    expect(toInsurancePolicies(body)).toBeNull()
  })
})

describe("fetchInsurance (Story 5.1)", () => {
  it("sends one GET for page 0 of 100 and returns the mapped rows", async () => {
    const seen: string[] = []
    server.use(
      http.get(LIST, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json(page([wire()]))
      }),
    )
    expect(await fetchInsurance()).toEqual({ success: true, data: [policy()], statusCode: 200 })
    expect(seen).toEqual(["?page=0&size=100"])
  })

  it("returns the error, or a shape error", async () => {
    server.use(http.get(LIST, () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    expect(await fetchInsurance()).toMatchObject({ success: false, errorCode: "UPSTREAM_ERROR", data: undefined })
    server.use(http.get(LIST, () => HttpResponse.json({ nope: true })))
    expect(await fetchInsurance()).toEqual({ success: false, statusCode: 200, error: "insurance/fetchInsurance returned an unexpected shape" })
  })

  it("is the loader of keys.insurance() behind the root SWR fetcher", async () => {
    server.use(http.get(LIST, () => HttpResponse.json([wire({ id: 3 })])))
    expect(await swrFetcher(keys.insurance())).toEqual([policy({ id: 3 })])
    expect(await loadInsurance()).toEqual([policy({ id: 3 })])
    server.use(http.get(LIST, () => HttpResponse.json({ message: "boom" }, { status: 500 })))
    await expect(swrFetcher(keys.insurance())).rejects.toMatchObject({ name: "ApiResponseError", response: { success: false, statusCode: 500 } })
  })
})
