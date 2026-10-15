/**
 * Addresses (Team A, Epic 4: Stories 4.1–4.4). Pre-created by spec F6-3
 * (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module will own (entries land with their stories in
 * `lib/server/proxy/allowlist/addresses.ts`):
 * - `GET v2/person/location/list?page=0&size=100` under `keys.addresses()`
 *   (Story 4.1 registers `registerFetcher("addresses", …)` here);
 * - `POST v2/person/location`, `PUT|DELETE v2/person/location/{id}` (4.2, 4.4);
 * - `GET v2/public/countries` under `keys.countries()` (Story 4.2 registers
 *   `registerFetcher("countries", …)` here).
 * Address suggestions are `places.ts`.
 */

import { proxyPath } from "./config"

/** One page holds every address (the backend default page is too small). */
export const ADDRESS_LIST_PAGE_SIZE = 100

/** Countries pinned first in the Country select (Story 4.2), in this order; the rest alphabetical. */
export const PINNED_COUNTRY_CODES = ["US", "CA", "AU"] as const

export function addressesListPath(): string {
  return proxyPath(`v2/person/location/list?page=0&size=${ADDRESS_LIST_PAGE_SIZE}`)
}

export function countriesPath(): string {
  return proxyPath("v2/public/countries")
}
