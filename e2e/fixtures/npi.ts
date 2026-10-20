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
