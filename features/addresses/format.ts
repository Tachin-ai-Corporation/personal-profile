import { isUnitedStatesName, type Address } from "@/lib/api"
import { isNotProvided, joinProvided } from "@/lib/shared/display-value"

/** "United States", "USA", "U.S.A", "US", any case or spacing (Story 4.2; it lives in `lib/api/addresses.ts` since Story 4.3, which maps it to "US"). */
export { isUnitedStatesName }

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
