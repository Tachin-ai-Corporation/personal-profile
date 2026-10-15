import type { Page, Request } from "@playwright/test"
import { mockProxy, type ProxyAnswer } from "./core"

/** My Organizations (Team B, Epic 10) mocks. Stories 10.1–10.3 add org-logo and hand-off mocks here. */

/**
 * `GET v2/user/organization/portal` (Story 10.1). The default page shape is a
 * placeholder (an empty Spring page) until Story 10.1 confirms it.
 */
export async function mockOrganizations(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/user/organization/portal?**", {
    status: answer.status ?? 200,
    body: answer.body ?? { content: [], totalElements: 0, totalPages: 0, number: 0, size: 12 },
  })
}
