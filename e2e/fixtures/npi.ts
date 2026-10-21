import type { Page, Request } from "@playwright/test"
import { mockProxy, type ProxyAnswer } from "./core"

/** Individual Provider Registration (Team B, Epic 9) mocks. Stories 9.1–9.3 add search, is-registered and register mocks here. */

/**
 * `GET v2/user/npi`: PersonWithNpiDTO has no provider on an unregistered user.
 */
export async function mockUserNpi(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/user/npi", { status: answer.status ?? 200, body: answer.body ?? { providerNpi: null, practiceNpi: null, hieEndpoint: null } })
}

/** Uncached registry reads; an empty valid page is the Account default. */
export async function mockNpiSearch(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/public/npi/list?**", { status: answer.status ?? 200, body: answer.body ?? { data: [], totalElements: 0 } })
}

/** `GET /api/pp/practice-support` (Story 9.3); default 404 `NO_PRACTICE`. Not a proxy call. */
export async function mockPracticeSupport(page: Page, answer: ProxyAnswer = {}): Promise<void> {
  await page.route("**/api/pp/practice-support", (route) =>
    route.fulfill({
      status: answer.status ?? 404,
      contentType: "application/json",
      body: JSON.stringify(answer.body ?? { errorCode: "NO_PRACTICE", source: "proxy" }),
    }),
  )
}

/** Explicit uncached availability; record ids are distinct from displayed NPIs. */
export async function mockNpiAvailability(page: Page, recordId: number, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, `v2/health/npi/${recordId}/is-registered`, { status: answer.status ?? 200, body: answer.body === undefined ? false : answer.body })
}

/** The real registration endpoint acknowledges with an empty200. */
export async function mockRegisterNpi(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  const seen: Request[] = []
  await page.route("**/api/1h/v2/user/register/npi", (route) => {
    seen.push(route.request())
    return route.fulfill({ status: answer.status ?? 200, contentType: "application/json", body: answer.body === undefined ? "" : JSON.stringify(answer.body) })
  })
  return () => [...seen]
}

/** Synthetic registered credentials, with all nine view rows supplied. */
export const REGISTERED_PROVIDER_NPI = {
  providerNpi: {
    id: 77, npi: 1234567890, taxonomy: { name: "Family Medicine" },
    providerLicenseNumber: "TEST-LICENSE-01",
    providerFirstLineBusinessPracticeLocationAddress: "1 Test Street",
    providerSecondLineBusinessPracticeLocationAddress: "Suite 2",
  },
  practiceNpi: {
    id: 88, npi: 1987654321, providerOrganizationName: "Sample Clinic",
    providerFirstLineBusinessPracticeLocationAddress: "2 Test Avenue",
    verified: true, organization: { tenantId: 202 },
  },
  hieEndpoint: { id: 99, endpoint: "Sample Exchange" },
} as const
