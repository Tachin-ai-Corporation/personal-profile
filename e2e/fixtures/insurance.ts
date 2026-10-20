import type { Page, Request } from "@playwright/test"
import { mockProxy, PNG_1X1, type FileAnswer, type ProxyAnswer } from "./core"

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

/** The list's Spring Page (`PageImpl`) around `rows`, as the backend answers `?page=0&size=100`. */
export function insurancePage(rows: readonly Record<string, unknown>[] = []): Record<string, unknown> {
  return { content: rows, last: true, first: true, empty: rows.length === 0, totalElements: rows.length, totalPages: 1, number: 0, size: 100, numberOfElements: rows.length }
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
