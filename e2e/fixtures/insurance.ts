import type { Page, Request } from "@playwright/test"
import { mockProxy, type ProxyAnswer } from "./core"

/** Insurance (Team A, Epic 5) mocks. Stories 5.1–5.5 add their search, write and card mocks here. */

/** `GET v2/health/patient/insurance` (Story 5.1); default no policies. */
export async function mockInsurance(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/health/patient/insurance?**", { status: answer.status ?? 200, body: answer.body ?? [] })
}
