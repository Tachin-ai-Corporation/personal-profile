import type { Page, Request } from "@playwright/test"
import { mockProxy, type ProxyAnswer } from "./core"

/** Individual Provider Registration (Team B, Epic 9) mocks. Stories 9.1–9.3 add search, is-registered and register mocks here. */

/**
 * `GET v2/user/npi` (Story 9.1). The default (404, not registered) is a
 * placeholder until Story 9.1 confirms the unregistered answer on demo.
 */
export async function mockUserNpi(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/user/npi", { status: answer.status ?? 404, body: answer.body ?? { message: "Not found", code: 404 } })
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
