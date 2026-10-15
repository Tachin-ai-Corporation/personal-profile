/**
 * Address line 1 suggestions (Team A, Story 4.3). Pre-created by spec F6-3
 * (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module will own: the named ops `POST /api/places/autocomplete`
 * and `POST /api/places/details` (built in F2; contract types in
 * `lib/shared/bff-contract.ts`). Google is never called from the browser.
 */

import { BFF_PATHS, PLACES_COUNTRIES, type PlacesCountry } from "@/lib/shared/bff-contract"

export { PLACES_COUNTRIES, type PlacesCountry }

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
