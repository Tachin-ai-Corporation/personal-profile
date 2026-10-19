import type { Address } from "@/lib/api"
import { isNotProvided, joinProvided } from "@/lib/shared/display-value"

/** The names and codes that mean the United States, as compared (`comparable`: "U. S. A." → "usa", "United  States" → "unitedstates"). */
const US_NAMES: ReadonlySet<string> = new Set(["us", "usa", "unitedstates", "unitedstatesofamerica"])

/** A country name or code as compared: dots and all whitespace removed, lower-cased. */
const comparable = (value: string): string => value.replace(/[.\s]/g, "").toLowerCase()

/** `true` for a country name or code that means the United States ("United States", "USA", "U.S.A", "US", any case or spacing). */
export function isUnitedStatesName(value: string): boolean {
  return US_NAMES.has(comparable(value))
}

/**
 * The United States: its addresses show no country. The name decides when
 * there is one ("United States", "USA", "U.S.A", any case or spacing), so a
 * non-US name always shows even beside a "US" code; the code ("US", "USA")
 * decides only without a name.
 */
function isUnitedStates({ country, countryCode }: Pick<Address, "country" | "countryCode">): boolean {
  if (!isNotProvided(country)) return isUnitedStatesName(country as string)
  return !isNotProvided(countryCode) && isUnitedStatesName(countryCode as string)
}

/**
 * The one-line address of the read view (Story 4.1): `line 1, line 2, city,
 * state zip`, then the country unless it is the United States (by code or
 * name), e.g. "12 King St W, Toronto, ON M5H 1A1, Canada". Absent parts
 * (`null`, blank, `"n/a"`) are skipped with their separator; without a state
 * the zip follows the city ("1 Pine St, SF 94105"). The country is its name,
 * else its code in upper case. `""` when nothing is provided.
 */
export function formatAddressOneLine(address: Address): string {
  const { addressLine1, addressLine2, cityName, stateName, postalCode, country, countryCode } = address
  const locality = isNotProvided(stateName) ? joinProvided([cityName, postalCode]) : joinProvided([cityName, joinProvided([stateName, postalCode])], ", ")
  const countryPart = isUnitedStates(address) ? null : isNotProvided(country) ? (countryCode?.toUpperCase() ?? null) : country
  return joinProvided([addressLine1, addressLine2, locality, countryPart], ", ")
}
