/**
 * Individual Provider Registration (Team B, Epic 9: Stories 9.1–9.3).
 * Pre-created by spec F6-3 (re-exported from `lib/api/index.ts` with
 * `export *`).
 *
 * Endpoints this module will own (`profile: true` entries land with their
 * stories in `lib/server/proxy/allowlist/npi.ts`):
 * - `GET v2/user/npi` under `keys.npi()` (9.1 registers `registerFetcher("npi", …)` here);
 * - `GET v2/public/npi/list` (`entityTypeCode` `1|2` with `required: true`,
 *   `searchText` ≤ 100, `page` `^\d{1,4}$`, `limit` 1–10; 9.1);
 * - `GET v2/health/npi/{n}/is-registered` and `POST v2/user/register/npi` (9.2).
 * AD-23: components never pass the entity type, so only the two fixed-type
 * search paths are exported.
 *
 * Live search does NOT use SWR (spec F6-3 decision): it loads through the
 * Combobox `load(query, page, signal)` callback, never through a `keys.ts`
 * key, and nothing is cached across searches (NPI results never, PNFR1). Do
 * not add search keys to `keys.ts`. (NPI search, 9.1.)
 */

import { proxyPath } from "./config"

/** NPI search page size (FR114). */
export const NPI_PAGE_SIZE = 10

/** Upper bound of the NPI search text (the proxy rule). */
export const NPI_SEARCH_MAX_LENGTH = 100

function npiSearchPath(entityTypeCode: 1 | 2, searchText: string, page: number): string {
  const query = new URLSearchParams({ entityTypeCode: String(entityTypeCode), searchText, page: String(page), limit: String(NPI_PAGE_SIZE) })
  return proxyPath(`v2/public/npi/list?${query.toString()}`)
}

/** Individuals (entity type 1) only: the personal NPI search. */
export function personalNpiSearchPath(searchText: string, page: number): string {
  return npiSearchPath(1, searchText, page)
}

/** Organizations (entity type 2) only: the practice NPI search. */
export function practiceNpiSearchPath(searchText: string, page: number): string {
  return npiSearchPath(2, searchText, page)
}

export function userNpiPath(): string {
  return proxyPath("v2/user/npi")
}

/** `npiRecordId` is the record id (`NpiOption.id`), never the 10-digit NPI (AD-23). */
export function npiIsRegisteredPath(npiRecordId: number): string {
  return proxyPath(`v2/health/npi/${npiRecordId}/is-registered`)
}

export function registerNpiPath(): string {
  return proxyPath("v2/user/register/npi")
}
