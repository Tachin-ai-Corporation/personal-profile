/**
 * Addresses (Team A, Epic 4: Stories 4.1–4.4). Pre-created by spec F6-3
 * (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module owns (entries land with their stories in
 * `lib/server/proxy/allowlist/addresses.ts`):
 * - `GET v2/person/location/list?page=0&size=100` under `keys.addresses()`
 *   (Story 4.1: `fetchAddresses`, registered below);
 * - `POST v2/person/location`, `PUT|DELETE v2/person/location/{id}` (4.2, 4.4);
 * - `GET v2/public/countries` under `keys.countries()` (Story 4.2 registers
 *   `registerFetcher("countries", …)` here).
 * Address suggestions are `places.ts`.
 */

import { z } from "zod"
import { providedOrNull } from "@/lib/shared/display-value"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { registerFetcher, unwrap } from "./fetcher"
import type { ApiResponse } from "./types"

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

/**
 * One saved address as the client reads it (Story 4.1). Every text part is
 * `null` when the platform has no value for it (`null`, missing, blank or
 * `"n/a"`, PM3 `isNotProvided`).
 */
export interface Address {
  readonly id: number | null
  /** The Address Type as the backend sends it (`personLocationType`: Home, Main Work, … also Billing, Mailing, Temporary). */
  readonly type: string | null
  readonly addressLine1: string | null
  readonly addressLine2: string | null
  readonly cityName: string | null
  readonly county: string | null
  readonly stateName: string | null
  readonly postalCode: string | null
  /** The country name (e.g. "Canada"). */
  readonly country: string | null
  /** The ISO 3166-1 alpha-2 code (e.g. "CA"), when the platform has one. */
  readonly countryCode: string | null
  readonly primary: boolean
  readonly validated: boolean
}

const text = z.string().nullish()
const flag = z.boolean().nullish()

/**
 * A row of the backend `PersonLocation` list. The code serializes the
 * booleans as `primary` / `validated`, the ai-agents-knowledge docs as
 * `isPrimary` / `isValidated`: both are read until demo confirms (epic 4
 * open decision 1). Unknown fields are ignored.
 */
const addressWireSchema = z.object({
  id: z.number().nullish(),
  personLocationType: text,
  addressLine1: text,
  addressLine2: text,
  cityName: text,
  county: text,
  stateName: text,
  postalCode: text,
  country: text,
  countryCode: text,
  primary: flag,
  isPrimary: flag,
  validated: flag,
  isValidated: flag,
  active: flag,
})

type AddressWire = z.infer<typeof addressWireSchema>

const addressListSchema = z.array(addressWireSchema)

/** The backend answers a Spring Page (`{ content, totalElements, … }`); a bare list is accepted too. */
const addressBodySchema = z.union([addressListSchema, z.object({ content: addressListSchema })])

const part = (value: string | null | undefined): string | null => {
  const provided = providedOrNull(value ?? null)
  return provided === null ? null : provided.trim()
}

function toAddress(wire: AddressWire): Address {
  return {
    id: wire.id ?? null,
    type: part(wire.personLocationType),
    addressLine1: part(wire.addressLine1),
    addressLine2: part(wire.addressLine2),
    cityName: part(wire.cityName),
    county: part(wire.county),
    stateName: part(wire.stateName),
    postalCode: part(wire.postalCode),
    country: part(wire.country),
    countryCode: part(wire.countryCode),
    primary: (wire.primary ?? wire.isPrimary) === true,
    validated: (wire.validated ?? wire.isValidated) === true,
  }
}

/**
 * The active addresses in API order (the backend's newest-updated first), or
 * `null` when the body is neither a Page of addresses nor a list of them. A
 * row with `active: false` is dropped.
 */
export function toAddresses(raw: unknown): Address[] | null {
  const parsed = addressBodySchema.safeParse(raw)
  if (!parsed.success) return null
  const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.content
  return rows.filter((wire) => wire.active !== false).map(toAddress)
}

export async function fetchAddresses(): Promise<ApiResponse<Address[]>> {
  const res = await callApi<unknown>("addresses/fetchAddresses", addressesListPath())
  if (!res.success) return { ...res, data: undefined }
  const rows = toAddresses(res.data)
  return rows
    ? { success: true, data: rows, statusCode: res.statusCode }
    : { success: false, statusCode: res.statusCode, error: "addresses/fetchAddresses returned an unexpected shape" }
}

/** The SWR loader of `keys.addresses()`. */
export function loadAddresses(): Promise<Address[] | undefined> {
  return unwrap(fetchAddresses())
}

registerFetcher("addresses", () => loadAddresses())
