/**
 * Phone display, shared by the header, Contacts (Story 3.1) and `/account`
 * (Stories 7.4, 9.3). Every +1 (NANP) number — US, Canada, Puerto Rico,
 * toll-free — reads `+1 (415) 551-2125`; others use the
 * libphonenumber-js international format. A value that can't be parsed is
 * shown as stored.
 */

import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js"

/** The platform's default region (`PhoneUtil.getDefaultPhoneRegionIfEmpty`). */
export const DEFAULT_PHONE_REGION = "us"

/** A Contact Point's `phoneNumberRegion`, lower-case; empty, missing or `"n/a"` → `"us"`. */
export function normalizeRegion(region: string | null | undefined): string {
  const trimmed = (region ?? "").trim().toLowerCase()
  return trimmed === "" || trimmed === "n/a" ? DEFAULT_PHONE_REGION : trimmed
}

function countryOf(region: string): CountryCode | undefined {
  const upper = region.toUpperCase()
  return isSupportedCountry(upper) ? upper : undefined
}

export function formatPhoneDisplay(value: string, region: string | null | undefined): string {
  const parsed = parsePhoneNumberFromString(value, countryOf(normalizeRegion(region)))
  if (!parsed?.isPossible()) return value
  if (parsed.countryCallingCode === "1") return `+1 ${parsed.formatNational()}`
  return parsed.formatInternational()
}
