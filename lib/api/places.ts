/**
 * Address line 1 suggestions (Team A, Story 4.3). Pre-created by spec F6-3
 * (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module owns: the named ops `POST /api/places/autocomplete`
 * and `POST /api/places/details` (built in F2; contract types in
 * `lib/shared/bff-contract.ts`). Google is never called from the browser.
 *
 * Live search does NOT use SWR (spec F6-3 decision): it loads through the
 * Combobox `load(query, page, signal)` callback, never through a `keys.ts`
 * key, and nothing is cached across searches. Do not add search keys to
 * `keys.ts`. Typed text, place ids and addresses are never logged here.
 *
 * Neither call throws: a failed autocomplete answers no suggestions and a
 * failed details call answers `null`, so manual entry always works.
 */

import { z } from "zod"
import {
  BFF_PATHS,
  PLACES_COUNTRIES,
  type PlaceAddress,
  type PlacesAutocompleteRequest,
  type PlacesCountry,
  type PlacesDetailsRequest,
  type PlaceSuggestion,
} from "@/lib/shared/bff-contract"
import { isUnitedStatesName, PINNED_COUNTRY_CODES, PINNED_COUNTRY_NAMES } from "./addresses"
import { callApi } from "./client"

export { PLACES_COUNTRIES, type PlacesCountry }

/** The longest input the autocomplete route accepts (the server answers 400 above it, so no call is made). */
export const PLACES_INPUT_MAX_LENGTH = 120

/** `true` for a country the suggestions serve; any other country turns the address combobox's search off. */
export function isPlacesCountry(code: string | null | undefined): code is PlacesCountry {
  return typeof code === "string" && (PLACES_COUNTRIES as readonly string[]).includes(code.toUpperCase())
}

export function placesAutocompletePath(): string {
  return BFF_PATHS.placesAutocomplete
}

export function placesDetailsPath(): string {
  return BFF_PATHS.placesDetails
}

/** A country name as compared: trimmed, lower-cased. */
const nameKey = (name: string): string => name.trim().toLowerCase()

/**
 * The suggestions' country code of a country name (Story 4.3, decision 3a of
 * Story 4.2: the countries list has no codes): the three pinned names give
 * US / CA / AU, any United States spelling counts (`isUnitedStatesName`), and
 * any other country gives `null` (suggestions off).
 */
export function placesCountryCodeOf(countryName: string | null | undefined): PlacesCountry | null {
  if (typeof countryName !== "string") return null
  if (isUnitedStatesName(countryName)) return "US"
  const index = PINNED_COUNTRY_NAMES.findIndex((name) => nameKey(name) === nameKey(countryName))
  return index < 0 ? null : PINNED_COUNTRY_CODES[index]
}

/** The pinned country name of a suggestions country code ("CA" → "Canada"), or `null` for any other code. */
export function placesCountryNameOf(code: string | null | undefined): string | null {
  if (!isPlacesCountry(code)) return null
  return PINNED_COUNTRY_NAMES[PINNED_COUNTRY_CODES.indexOf(code.toUpperCase() as PlacesCountry)]
}

/** A new lookup id (UUID v4): one per address lookup, reused for every keystroke until its details call. */
export function newPlacesLookupId(): string {
  return crypto.randomUUID()
}

const suggestionSchema = z.object({
  placeId: z.string(),
  mainText: z.string(),
  secondaryText: z.string(),
  matches: z.array(z.object({ start: z.number(), end: z.number() })),
})

const autocompleteBodySchema = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({ enabled: z.literal(true), suggestions: z.array(suggestionSchema) }),
])

const detailsBodySchema = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    addressLine1: z.string(),
    cityName: z.string(),
    county: z.string(),
    stateName: z.string(),
    postalCode: z.string(),
    countryCode: z.string(),
    country: z.string(),
    fullAddress: z.string(),
    complete: z.boolean(),
  }),
])

/** An autocomplete answer: `enabled: false` while `PLACES_ENABLED` is off (suggestions never show then). */
export interface PlacesAutocompleteResult {
  readonly enabled: boolean
  readonly suggestions: readonly PlaceSuggestion[]
}

/** A details answer: the normalized address, or `enabled: false` while `PLACES_ENABLED` is off. */
export type PlacesDetailsResult = { readonly enabled: false; readonly address: null } | { readonly enabled: true; readonly address: PlaceAddress }

const NO_SUGGESTIONS: PlacesAutocompleteResult = { enabled: true, suggestions: [] }

/**
 * `POST /api/places/autocomplete`: up to 5 suggestions for the typed line 1.
 * Any failure (network, 4xx, 5xx, abort, an unexpected body) answers
 * `{ enabled: true, suggestions: [] }`; an input over 120 characters makes no
 * call. Never throws.
 */
export async function placesAutocomplete(request: PlacesAutocompleteRequest, signal?: AbortSignal): Promise<PlacesAutocompleteResult> {
  if (request.input.length > PLACES_INPUT_MAX_LENGTH) return NO_SUGGESTIONS
  const body: PlacesAutocompleteRequest = { input: request.input, countryCode: request.countryCode, lookupId: request.lookupId }
  const res = await callApi<unknown>("places/autocomplete", placesAutocompletePath(), { method: "POST", body: JSON.stringify(body), signal })
  if (!res.success) return NO_SUGGESTIONS
  const parsed = autocompleteBodySchema.safeParse(res.data)
  if (!parsed.success) return NO_SUGGESTIONS
  return parsed.data.enabled ? { enabled: true, suggestions: parsed.data.suggestions } : { enabled: false, suggestions: [] }
}

/**
 * `POST /api/places/details`: the address of one picked suggestion, ending
 * its lookup (send the lookup's `lookupId`). Any failure (network, 502, 504,
 * an unexpected body) answers `null`. Never throws.
 */
export async function placesDetails(request: PlacesDetailsRequest): Promise<PlacesDetailsResult | null> {
  const body: PlacesDetailsRequest = { placeId: request.placeId, lookupId: request.lookupId }
  const res = await callApi<unknown>("places/details", placesDetailsPath(), { method: "POST", body: JSON.stringify(body) })
  if (!res.success) return null
  const parsed = detailsBodySchema.safeParse(res.data)
  if (!parsed.success) return null
  const answer = parsed.data
  if (!answer.enabled) return { enabled: false, address: null }
  return {
    enabled: true,
    address: {
      addressLine1: answer.addressLine1,
      cityName: answer.cityName,
      county: answer.county,
      stateName: answer.stateName,
      postalCode: answer.postalCode,
      countryCode: answer.countryCode,
      country: answer.country,
      fullAddress: answer.fullAddress,
      complete: answer.complete,
    },
  }
}
