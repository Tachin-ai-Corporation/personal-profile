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
import { z } from "zod"
import { callApi } from "./client"
import { registerFetcher, unwrap } from "./fetcher"
import type { ApiResponse } from "./types"

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

const npiNumberSchema = z.number().int().min(1_000_000_000).max(9_999_999_999)
const npiIdSchema = z.number().int().positive().safe()
const npiRecordSchema = z.object({ id: npiIdSchema, npi: npiNumberSchema })
const userNpiSchema = z.object({
  providerNpi: npiRecordSchema.nullish(),
  practiceNpi: npiRecordSchema.nullish(),
  hieEndpoint: z.object({ id: npiIdSchema, name: z.string().nullish(), endpoint: z.string().nullish() }).nullish(),
})

export interface UserNpi {
  readonly registered: boolean
  readonly provider?: { readonly id: number; readonly npi: string }
  readonly practice?: { readonly id: number; readonly npi: string }
  readonly hie?: { readonly id: number; readonly name?: string | null; readonly endpoint?: string | null }
}

export interface NpiOption {
  readonly id: number
  readonly npi: string
  readonly name: string
  readonly addressLine1?: string
  readonly city: string
  readonly state: string
  readonly label: string
}

export interface NpiSearchPage {
  readonly items: readonly NpiOption[]
  readonly totalElements: number
  readonly hasMore: boolean
}

const npiOptionSchema = z.object({
  id: npiIdSchema,
  npi: npiNumberSchema,
  providerFirstName: z.string().nullish(),
  providerLastName: z.string().nullish(),
  providerOrganizationName: z.string().nullish(),
  providerBusinessMailingAddressCityName: z.string().nullish(),
  providerBusinessMailingAddressStateName: z.string().nullish(),
  providerFirstLineBusinessMailingAddress: z.string().nullish(),
})
const npiPageSchema = z.object({ data: z.array(npiOptionSchema).max(NPI_PAGE_SIZE), totalElements: z.number().int().nonnegative().safe() })
const NPI_MAX_SEARCH_PAGE = 9999
const npiSearchSchema = z.object({ searchText: z.string().trim().max(NPI_SEARCH_MAX_LENGTH), page: z.number().int().min(0).max(NPI_MAX_SEARCH_PAGE) })

/** Registration state alone is cached; a missing provider on a valid 200 is unregistered. */
export async function getUserNpi(): Promise<ApiResponse<UserNpi>> {
  const response = await callApi<unknown>("npi/getUserNpi", userNpiPath())
  if (!response.success) return { ...response, data: undefined }
  const parsed = userNpiSchema.safeParse(response.data)
  if (!parsed.success) return { success: false, statusCode: response.statusCode }
  const { providerNpi, practiceNpi, hieEndpoint } = parsed.data
  return { success: true, statusCode: response.statusCode, data: {
    registered: providerNpi != null,
    ...(providerNpi ? { provider: { id: providerNpi.id, npi: String(providerNpi.npi) } } : {}),
    ...(practiceNpi ? { practice: { id: practiceNpi.id, npi: String(practiceNpi.npi) } } : {}),
    ...(hieEndpoint ? { hie: hieEndpoint } : {}),
  } }
}

async function searchNpi(input: { readonly searchText: string; readonly page: number }, personal: boolean, signal?: AbortSignal): Promise<ApiResponse<NpiSearchPage>> {
  const params = npiSearchSchema.safeParse(input)
  if (!params.success) return { success: false, statusCode: 400 }
  const { searchText, page } = params.data
  const response = await callApi<unknown>(personal ? "npi/searchPersonalNpi" : "npi/searchPracticeNpi", personal ? personalNpiSearchPath(searchText, page) : practiceNpiSearchPath(searchText, page), { signal, userInitiated: true })
  if (!response.success) return { ...response, data: undefined }
  const parsed = npiPageSchema.safeParse(response.data)
  if (!parsed.success) return { success: false, statusCode: response.statusCode }
  const items = parsed.data.data.map((record): NpiOption => {
    const name = personal ? [record.providerFirstName, record.providerLastName].filter(Boolean).join(" ").trim() : (record.providerOrganizationName ?? "").trim()
    const city = (record.providerBusinessMailingAddressCityName ?? "").trim()
    const state = (record.providerBusinessMailingAddressStateName ?? "").trim()
    const addressLine1 = personal ? undefined : (record.providerFirstLineBusinessMailingAddress ?? "").trim()
    const npi = String(record.npi)
    return { id: record.id, npi, name, city, state, ...(addressLine1 ? { addressLine1 } : {}), label: [npi, name, addressLine1, city, state].filter(Boolean).join(", ") }
  })
  return { success: true, statusCode: response.statusCode, data: { items, totalElements: parsed.data.totalElements, hasMore: page < NPI_MAX_SEARCH_PAGE && (page + 1) * NPI_PAGE_SIZE < parsed.data.totalElements } }
}

/** Personal records only; input never controls the entity type. No SWR/search cache. */
export function searchPersonalNpi(input: { readonly searchText: string; readonly page: number }, signal?: AbortSignal): Promise<ApiResponse<NpiSearchPage>> {
  return searchNpi(input, true, signal)
}

/** Practice records only; registry record ids remain distinct from displayed NPIs. */
export function searchPracticeNpi(input: { readonly searchText: string; readonly page: number }, signal?: AbortSignal): Promise<ApiResponse<NpiSearchPage>> {
  return searchNpi(input, false, signal)
}

registerFetcher("npi", () => unwrap(getUserNpi()))
