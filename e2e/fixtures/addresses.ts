import type { Page, Request } from "@playwright/test"
import { mockProxy, type ProxyAnswer } from "./core"

/** Addresses (Team A, Epic 4) mocks. Stories 4.1–4.4 add their write and Places mocks here. */

/** `GET v2/person/location/list` (Story 4.1); default no addresses. */
export async function mockAddresses(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/person/location/list?**", { status: answer.status ?? 200, body: answer.body ?? [] })
}

/** `GET v2/public/countries` (Story 4.2); default an empty list. */
export async function mockCountries(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/public/countries", { status: answer.status ?? 200, body: answer.body ?? [] })
}
