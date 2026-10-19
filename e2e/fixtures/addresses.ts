import type { Page, Request } from "@playwright/test"
import { mockProxy, type ProxyAnswer } from "./core"

/** Addresses (Team A, Epic 4) mocks. Stories 4.1–4.4 add their write and Places mocks here. */

/** A backend `PersonLocation` row (Story 4.1): a US Home address, neither Primary nor verified, unless overridden. */
export function addressRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    personLocationType: "Home",
    addressLine1: "1 Pine St",
    addressLine2: null,
    cityName: "SF",
    county: null,
    stateName: "CA",
    postalCode: "94105",
    country: "United States",
    countryCode: "US",
    primary: false,
    validated: false,
    active: true,
    ...overrides,
  }
}

/** A Spring Page of address rows, as `GET v2/person/location/list` answers. */
export function addressesPage(rows: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { content: rows, totalElements: rows.length, totalPages: rows.length === 0 ? 0 : 1, number: 0, size: 100 }
}

/**
 * `GET v2/person/location/list` (Story 4.1); default no addresses (an empty
 * Page). Rows are wrapped in a Page; a `ProxyAnswer` (an error, a bare list)
 * is sent as given.
 */
export async function mockAddresses(page: Page, answer: readonly Record<string, unknown>[] | ProxyAnswer = []): Promise<() => Request[]> {
  if (Array.isArray(answer)) return mockProxy(page, "v2/person/location/list?**", { status: 200, body: addressesPage(answer) })
  const given = answer as ProxyAnswer
  return mockProxy(page, "v2/person/location/list?**", { status: given.status ?? 200, body: given.body ?? addressesPage([]) })
}

/** `GET v2/public/countries` (Story 4.2); default an empty list. */
export async function mockCountries(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/public/countries", { status: answer.status ?? 200, body: answer.body ?? [] })
}
