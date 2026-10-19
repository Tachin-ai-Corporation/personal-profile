import type { Page, Request } from "@playwright/test"
import { json, mockProxy, type ProxyAnswer, type ProxyResponder } from "./core"

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

/** One address write body (`POST v2/person/location`, `PUT v2/person/location/{id}`; backend `PersonLocationRequestDTO`, Story 4.2). */
export type AddressWriteBody = Record<string, unknown>

/**
 * Mocks `POST v2/person/location` (Story 4.2): 200 with a created row (id
 * 31) by default, as the backend answers its `PersonLocationResponseDTO`.
 * Returns the bodies it answered, in order. Pair it with a fresh
 * `mockAddresses` for the refetch that follows a save.
 */
export async function mockAddressCreate(page: Page, answer: ProxyResponder = { body: { id: 31 } }): Promise<() => AddressWriteBody[]> {
  const bodies: AddressWriteBody[] = []
  await page.route("**/api/1h/v2/person/location", (route) => {
    const request = route.request()
    if (request.method() !== "POST") return route.fallback()
    bodies.push(request.postDataJSON() as AddressWriteBody)
    const { status = 200, body = {} } = typeof answer === "function" ? answer(request) : answer
    return json(route, status, body)
  })
  return () => [...bodies]
}

/**
 * Mocks `PUT v2/person/location/{id}` (Story 4.2, numeric ids only): 200 with
 * `{ id }` by default. Returns each `{ id, body }` it answered, in order.
 */
export async function mockAddressUpdate(page: Page, answer: ProxyResponder = {}): Promise<() => { readonly id: number; readonly body: AddressWriteBody }[]> {
  const seen: { readonly id: number; readonly body: AddressWriteBody }[] = []
  await page.route(
    (url) => /^\/api\/1h\/v2\/person\/location\/\d+$/.test(url.pathname),
    (route) => {
      const request = route.request()
      if (request.method() !== "PUT") return route.fallback()
      const id = Number(new URL(request.url()).pathname.split("/").pop())
      seen.push({ id, body: request.postDataJSON() as AddressWriteBody })
      const { status = 200, body = { id } } = typeof answer === "function" ? answer(request) : answer
      return json(route, status, body)
    },
  )
  return () => [...seen]
}
