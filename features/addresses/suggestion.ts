import { placesCountryNameOf } from "@/lib/api"
import type { PlaceAddress, PlaceSuggestion } from "@/lib/shared/bff-contract"
import type { AddressEditRow } from "./schema"

/**
 * The pure parts of the address suggestions (Story 4.3, FR26, NG-9026): how
 * a suggestion is named and what a picked one fills in its row.
 */

/** A suggestion's option label (its accessible name): "{main text}, {secondary text}", e.g. "1 Pine St, San Francisco, CA, USA". */
export function suggestionLabel(suggestion: PlaceSuggestion): string {
  return [suggestion.mainText, suggestion.secondaryText]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(", ")
}

/** What line 1 shows for a picked suggestion: its street (main text), else its label. */
export function suggestionStreet(suggestion: PlaceSuggestion): string {
  return suggestion.mainText.trim() || suggestionLabel(suggestion)
}

/** The fields a pick may fill. */
export type PlaceFill = Partial<Pick<AddressEditRow, "line1" | "line2" | "city" | "county" | "state" | "zip" | "country" | "validated">>

/** The Country select's entry with this name (case-insensitive, trimmed), as the list spells it; `null` when unlisted. */
function listed(countries: readonly string[], name: string): string | null {
  const key = name.trim().toLowerCase()
  if (key === "") return null
  return countries.find((country) => country.trim().toLowerCase() === key) ?? null
}

/**
 * What a picked suggestion's details fill in its row:
 * - line 1 is the answer's, else the suggestion's `street` (its main text);
 * - line 2 is emptied, as 1health-fe does on a pick (LocationAddressWrapper.tsx:271-325);
 * - a complete address fills city, county, state/province and zip (a part
 *   Google didn't return is emptied) and sets `validated`, unless its country
 *   can't be shown in the Select (then `validated` stays false);
 * - an incomplete one fills only the parts it returns and leaves `validated`
 *   false (the missing required fields show their errors on Save);
 * - the country is the list entry of the answer's code (US/CA/AU → the pinned
 *   names), else the answer's country name if listed, else left unchanged.
 */
export function placeAddressFill(address: PlaceAddress, countries: readonly string[], street: string): PlaceFill {
  const fill: PlaceFill = { line1: address.addressLine1.trim() || street, line2: "" }
  const parts = [
    ["city", address.cityName],
    ["county", address.county],
    ["state", address.stateName],
    ["zip", address.postalCode],
  ] as const
  for (const [field, value] of parts) {
    if (address.complete || value.trim() !== "") fill[field] = value.trim()
  }
  const pinned = placesCountryNameOf(address.countryCode)
  const country = (pinned === null ? null : listed(countries, pinned)) ?? listed(countries, address.country)
  if (country !== null) fill.country = country
  fill.validated = address.complete && fill.country !== undefined
  return fill
}
