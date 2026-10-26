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
 *
 * Story 4.2 adds the writes: the body builders (`addressCreateBody`,
 * `addressUpdateBody`, decisions 1a–3a), `saveAddressCreate` /
 * `saveAddressUpdate` (never throw) and the countries loader. Story 4.3
 * sends the form's `validated` as is. Story 4.4 adds `deleteAddress` and the
 * Make primary body (`addressPrimaryBody`).
 */

import { z } from "zod"
import { isNotProvided, providedOrNull } from "@/lib/shared/display-value"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { registerFetcher, unwrap } from "./fetcher"
import type { ApiResponse } from "./types"

/** One page holds every address (the backend default page is too small). */
export const ADDRESS_LIST_PAGE_SIZE = 100

/** Countries pinned first in the Country select (Story 4.2), in this order; the rest alphabetical. */
export const PINNED_COUNTRY_CODES = ["US", "CA", "AU"] as const

/**
 * The same three countries by name (Story 4.2, decision 3a): the countries
 * list carries no ISO code, so the Country select pins them by name.
 */
export const PINNED_COUNTRY_NAMES = ["United States", "Canada", "Australia"] as const

/** The names and codes that mean the United States, as compared (`comparable`: "U. S. A." → "usa", "United  States" → "unitedstates"). */
const US_NAMES: ReadonlySet<string> = new Set(["us", "usa", "unitedstates", "unitedstatesofamerica"])

/** A country name or code as compared: dots and all whitespace removed, lower-cased. */
const comparableCountry = (value: string): string => value.replace(/[.\s]/g, "").toLowerCase()

/**
 * `true` for a country name or code that means the United States ("United
 * States", "USA", "U.S.A", "US", any case or spacing). Story 4.2; moved here
 * by Story 4.3 so `places.ts` maps every US spelling to "US".
 */
export function isUnitedStatesName(value: string): boolean {
  return US_NAMES.has(comparableCountry(value))
}

/** The longest text an address field may hold (Story 4.2; the proxy refuses more). */
export const ADDRESS_FIELD_MAX_LENGTH = 255

/** A new address row's country (Story 4.2). */
export const DEFAULT_ADDRESS_COUNTRY = "United States"

/**
 * The Address Types the edit view offers (Story 4.2, decision 2a), in this
 * order. The backend also allows Billing, Mailing and Temporary, which other
 * clients may have saved: such a row keeps its type unless the user changes it.
 */
export const ADDRESS_TYPES = ["Home", "Main Work", "Other Work", "Vacation Home"] as const

export function addressesListPath(): string {
  return proxyPath(`v2/person/location/list?page=0&size=${ADDRESS_LIST_PAGE_SIZE}`)
}

export function countriesPath(): string {
  return proxyPath("v2/public/countries")
}

/** `POST v2/person/location` (Story 4.2). */
export function addressCreatePath(): string {
  return proxyPath("v2/person/location")
}

/** `PUT v2/person/location/{id}` (Story 4.2), for a positive integer id; `null` for anything else. */
export function addressUpdatePath(id: number): string | null {
  return Number.isSafeInteger(id) && id > 0 ? proxyPath(`v2/person/location/${id}`) : null
}

/** `DELETE v2/person/location/{id}` (Story 4.4), for a positive integer id; `null` for anything else. */
export function addressDeletePath(id: number): string | null {
  return addressUpdatePath(id)
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
  /**
   * The stored coordinates (`lat`, `lon`), only when both are real ones: finite,
   * in range and not the backend's "no value" `999.9`. The read view's Google
   * Maps link uses them (1health-fe LocationAddressCard.tsx:22-26,41-53).
   */
  readonly mapPoint?: AddressMapPoint
}

/** A stored address's coordinates (see `Address.mapPoint`). */
export interface AddressMapPoint {
  readonly lat: number
  readonly lon: number
}

/** The backend's "no value" for a number (`BO_CORE_DEFAULT_NUMBER_VALUE`; a new location's lat and lon). */
const ADDRESS_NO_COORDINATE = 999.9

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
  // Read leniently: a malformed coordinate only drops the map link, never the row.
  lat: z.unknown().optional(),
  lon: z.unknown().optional(),
  primary: flag,
  isPrimary: flag,
  validated: flag,
  isValidated: flag,
  active: flag,
})

type AddressWire = z.infer<typeof addressWireSchema>

const addressListSchema = z.array(addressWireSchema)

/**
 * The backend answers its own page type, `PageImpl<PersonLocationResponseDTO>`
 * (`{ data, pageNumber, pageSize, lastPage, totalElements, … }`; not a Spring
 * Page, so never `content`); a bare list is accepted too.
 */
const addressBodySchema = z.union([addressListSchema, z.object({ data: addressListSchema })])

const part = (value: string | null | undefined): string | null => {
  const provided = providedOrNull(value ?? null)
  return provided === null ? null : provided.trim()
}

/** The coordinate pair when both are real (see `Address.mapPoint`), else `undefined`. */
function mapPointOf(lat: unknown, lon: unknown): AddressMapPoint | undefined {
  const real = (value: unknown, limit: number): value is number =>
    typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit && value !== ADDRESS_NO_COORDINATE
  return real(lat, 90) && real(lon, 180) ? { lat, lon } : undefined
}

function toAddress(wire: AddressWire): Address {
  const mapPoint = mapPointOf(wire.lat, wire.lon)
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
    ...(mapPoint ? { mapPoint } : {}),
  }
}

/**
 * The active addresses in API order (the backend's newest-updated first), or
 * `null` when the body is neither a `PageImpl` of addresses nor a list of them. A
 * row with `active: false` is dropped.
 */
export function toAddresses(raw: unknown): Address[] | null {
  const parsed = addressBodySchema.safeParse(raw)
  if (!parsed.success) return null
  const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.data
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

// --- Countries (Story 4.2) -------------------------------------------------------------------------

const countriesSchema = z.array(z.object({ name: z.string().nullish() }))

/** A country name as the pinned order compares it: trimmed, lower-cased. */
const countryKey = (name: string): string => name.trim().toLowerCase()

/**
 * The Country select's names (Story 4.2): United States, Canada and Australia
 * first (by name, decision 3a), then the rest alphabetically; blank and
 * `"n/a"` entries are dropped and a repeated name is kept once. `null` when
 * the body is not a list of `{ name }`.
 */
export function toCountries(raw: unknown): string[] | null {
  const parsed = countriesSchema.safeParse(raw)
  if (!parsed.success) return null
  const seen = new Set<string>()
  const names: string[] = []
  for (const { name } of parsed.data) {
    if (isNotProvided(name)) continue
    const trimmed = (name as string).trim()
    if (seen.has(countryKey(trimmed))) continue
    seen.add(countryKey(trimmed))
    names.push(trimmed)
  }
  const pinned = PINNED_COUNTRY_NAMES.map(countryKey)
  const rank = (name: string): number => {
    const index = pinned.indexOf(countryKey(name))
    return index < 0 ? pinned.length : index
  }
  return names.toSorted((a, b) => rank(a) - rank(b) || a.localeCompare(b, "en"))
}

export async function fetchCountries(): Promise<ApiResponse<string[]>> {
  const res = await callApi<unknown>("addresses/fetchCountries", countriesPath())
  if (!res.success) return { ...res, data: undefined }
  const names = toCountries(res.data)
  return names
    ? { success: true, data: names, statusCode: res.statusCode }
    : { success: false, statusCode: res.statusCode, error: "addresses/fetchCountries returned an unexpected shape" }
}

/** The SWR loader of `keys.countries()` (read only in the Addresses edit view). */
export function loadCountries(): Promise<string[] | undefined> {
  return unwrap(fetchCountries())
}

registerFetcher("countries", () => loadCountries())

// --- Writes (Story 4.2) ----------------------------------------------------------------------------

/** One address as the edit view holds it: every text part a string (`""` when empty), as typed. */
export interface AddressFields {
  readonly type: string
  readonly country: string
  readonly line1: string
  readonly line2: string
  readonly city: string
  readonly county: string
  readonly state: string
  readonly zip: string
  readonly primary: boolean
  readonly validated: boolean
}

/** The body of `POST v2/person/location` (backend `PersonLocationRequestDTO`; never `countryCode`, decision 3a). */
export interface AddressCreateBody {
  readonly personLocationType?: string
  readonly addressLine1?: string
  readonly addressLine2?: string
  readonly cityName?: string
  readonly county?: string
  readonly stateName?: string
  readonly postalCode?: string
  readonly country?: string
  /** Always sent, never `isPrimary` (decision 1a). */
  readonly primary: boolean
  /** Always sent, never `isValidated` (decision 1a); the backend stores `true` when it is missing. */
  readonly validated: boolean
}

/** The body of `PUT v2/person/location/{id}`: the create fields plus `fullAddress`, which the backend doesn't rebuild on PUT. */
export interface AddressUpdateBody extends AddressCreateBody {
  readonly fullAddress: string
}

/** The body of a Make primary `PUT v2/person/location/{id}` (Story 4.4): only the two flags, every other part left as saved. */
export interface AddressPrimaryBody {
  readonly primary: boolean
  readonly validated: boolean
}

/**
 * The Make primary body (Story 4.4, decision 1B): `primary` and the row's
 * saved `validated` (always sent: a missing one would change it). The
 * backend leaves the parts it isn't sent unchanged and demotes the old
 * Primary itself when `primary` is `true`.
 */
export function addressPrimaryBody(primary: boolean, validated: boolean): AddressPrimaryBody {
  return { primary, validated }
}

/** What a cleared optional part of a saved address is sent as (decision 2a): the backend reads `""` as "unchanged". */
export const ADDRESS_CLEARED_VALUE = "n/a"

/** `fullAddress` the way the backend builds it on create (`OneHealthUtil.buildFullAddress`): `"{line 1}, {city}, {zip}, {country}"`. */
export function addressFullAddress(fields: Pick<AddressFields, "line1" | "city" | "zip" | "country">): string {
  return [fields.line1, fields.city, fields.zip, fields.country].map((part) => part.trim()).join(", ")
}

/** The trimmed value, or `undefined` (left out) when empty. */
const filled = (value: string): string | undefined => value.trim() || undefined

/**
 * The POST body of a new address (Story 4.2): text trimmed, empty fields left
 * out (the backend names a missing required one), `primary` and `validated`
 * always sent.
 */
export function addressCreateBody(fields: AddressFields): AddressCreateBody {
  const body = {
    personLocationType: filled(fields.type),
    addressLine1: filled(fields.line1),
    addressLine2: filled(fields.line2),
    cityName: filled(fields.city),
    county: filled(fields.county),
    stateName: filled(fields.state),
    postalCode: filled(fields.zip),
    country: filled(fields.country),
    primary: fields.primary,
    validated: fields.validated,
  }
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as unknown as AddressCreateBody
}

/** `addressUpdateBody` options. */
export interface AddressUpdateOptions {
  /** The Country select's names: an unchanged saved country is sent only when listed (else the backend keeps it). */
  readonly listedCountries: ReadonlySet<string>
}

/**
 * The PUT body of a changed saved address (Story 4.2), against its saved
 * values:
 * - text trimmed; a cleared optional part (line 2, county, state) that had a
 *   value is sent as `"n/a"` (decision 2a), one that stays empty is left out;
 * - the type only when changed or one of `ADDRESS_TYPES` (a saved Billing,
 *   Mailing or Temporary is never re-sent), the country only when changed or
 *   listed;
 * - `primary` always (a missing one demotes the current Primary), and
 *   `validated` always, as the form holds it (Story 4.3: true only after a
 *   complete suggestion pick or as saved, cleared by any manual edit of an
 *   address part but line 2);
 * - `fullAddress` rebuilt (`addressFullAddress`).
 */
export function addressUpdateBody(next: AddressFields, saved: AddressFields, options: AddressUpdateOptions): AddressUpdateBody {
  const optional = (value: string, before: string): string | undefined => filled(value) ?? (filled(before) ? ADDRESS_CLEARED_VALUE : undefined)
  const typeListed = (ADDRESS_TYPES as readonly string[]).includes(next.type)
  const countryChanged = next.country.trim() !== saved.country.trim()
  const body = {
    personLocationType: next.type !== saved.type || typeListed ? filled(next.type) : undefined,
    addressLine1: filled(next.line1),
    addressLine2: optional(next.line2, saved.line2),
    cityName: filled(next.city),
    county: optional(next.county, saved.county),
    stateName: optional(next.state, saved.state),
    postalCode: filled(next.zip),
    country: countryChanged || options.listedCountries.has(next.country.trim()) ? filled(next.country) : undefined,
    primary: next.primary,
    validated: next.validated,
    fullAddress: addressFullAddress(next),
  }
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as unknown as AddressUpdateBody
}

const createdSchema = z.object({ id: z.number() })

/** A created address: its id when the backend's answer holds one. */
export interface AddressCreated {
  readonly id: number | null
}

/** Sends one new address (`POST v2/person/location`); never throws. The answer's `id` names the created row. */
export async function saveAddressCreate(body: AddressCreateBody): Promise<ApiResponse<AddressCreated>> {
  const res = await callApi<unknown>("addresses/saveAddressCreate", addressCreatePath(), { method: "POST", body: JSON.stringify(body) })
  if (!res.success) return { ...res, data: undefined }
  const created = createdSchema.safeParse(res.data)
  return { ...res, data: { id: created.success ? created.data.id : null } }
}

/** Sends one changed address (`PUT v2/person/location/{id}`), or a Make primary; never throws. A bad id is refused without a request. */
export async function saveAddressUpdate(id: number, body: AddressUpdateBody | AddressPrimaryBody): Promise<ApiResponse<unknown>> {
  const path = addressUpdatePath(id)
  if (path === null) return { success: false, error: "addresses/saveAddressUpdate needs a positive integer id" }
  return callApi<unknown>("addresses/saveAddressUpdate", path, { method: "PUT", body: JSON.stringify(body) })
}

/** Removes one saved address (`DELETE v2/person/location/{id}`, a soft delete; Story 4.4); never throws. A bad id is refused without a request. */
export async function deleteAddress(id: number): Promise<ApiResponse<unknown>> {
  const path = addressDeletePath(id)
  if (path === null) return { success: false, error: "addresses/deleteAddress needs a positive integer id" }
  return callApi<unknown>("addresses/deleteAddress", path, { method: "DELETE" })
}
