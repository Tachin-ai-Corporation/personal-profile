/**
 * Phone display, shared by the header, Contacts (Story 3.1) and `/account`
 * (Stories 7.4, 9.3). Every +1 (NANP) number — US, Canada, Puerto Rico,
 * toll-free — reads `+1 (415) 551-2125`; others use the
 * libphonenumber-js international format. A value that can't be parsed is
 * shown as stored.
 *
 * F6-2 adds the phone input's pure helpers (Stories 3.1, 3.2, 5.2): the
 * region list (every libphonenumber region, as in 1health-fe), flags, dial
 * codes, the typing limit, validation and E.164 conversion. Regions are the
 * platform's lower-case ISO 3166 codes (`phoneNumberRegion`).
 */

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js"

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

/** A region as libphonenumber's country code; an unknown one falls back to the default (US). */
function countryOrDefault(region: string | null | undefined): CountryCode {
  return countryOf(normalizeRegion(region)) ?? "US"
}

export function formatPhoneDisplay(value: string, region: string | null | undefined): string {
  const parsed = parsePhoneNumberFromString(value, countryOf(normalizeRegion(region)))
  if (!parsed?.isPossible()) return value
  if (parsed.countryCallingCode === "1") return `+1 ${parsed.formatNational()}`
  return parsed.formatInternational()
}

/** One entry of the phone input's country picker. */
export interface PhoneRegion {
  /** Lower-case ISO code, e.g. `"us"`. */
  readonly region: string
  /** Calling code without `+`, e.g. `"1"`. */
  readonly dialCode: string
  /** The country's name in the display locale (the upper-case code when the locale has none). */
  readonly name: string
  /** The flag emoji (decorative). */
  readonly flag: string
}

/** The flag emoji of a two-letter region (regional indicator symbols); `""` for anything else. */
export function regionFlag(region: string): string {
  const upper = region.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return ""
  return String.fromCodePoint(...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65))
}

/** The calling code (no `+`) of a region; an unknown region uses the default region's. */
export function dialCodeOf(region: string | null | undefined): string {
  return getCountryCallingCode(countryOrDefault(region))
}

/** Whether libphonenumber knows the region (`"us"`, `"GB"`); empty or `"n/a"` count as the default. */
export function isPhoneRegion(region: string | null | undefined): boolean {
  return countryOf(normalizeRegion(region)) !== undefined
}

const regionCache = new Map<string, readonly PhoneRegion[]>()

/** Every region libphonenumber supports, sorted by name in `locale` (1health-fe lists them all too). Cached per locale. */
export function phoneRegions(locale = "en-US"): readonly PhoneRegion[] {
  const cached = regionCache.get(locale)
  if (cached) return cached
  const names = new Intl.DisplayNames([locale], { type: "region", fallback: "code" })
  const list = getCountries()
    .map((country) => ({
      region: country.toLowerCase(),
      dialCode: getCountryCallingCode(country),
      // `fallback: "code"` makes `of()` always return a string.
      name: names.of(country) as string,
      flag: regionFlag(country),
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name, locale))
  regionCache.set(locale, list)
  return list
}

/** The digits of a typed number (spaces, dashes, dots, parentheses dropped). */
export function phoneDigits(text: string): string {
  return text.replace(/\D/g, "")
}

/** Whether `text` has more digits than the region allows (typing past it is ignored, as in 1health-fe). */
export function isPhoneTooLong(text: string, region: string | null | undefined): boolean {
  const digits = phoneDigits(text)
  return digits !== "" && validatePhoneNumberLength(digits, countryOrDefault(region)) === "TOO_LONG"
}

/** The national number formatted for the region (`(415) 555-2125`); the trimmed text when it has no digits. */
export function formatPhoneInput(text: string, region: string | null | undefined): string {
  const digits = phoneDigits(text)
  if (digits === "") return text.trim()
  const country = countryOrDefault(region)
  // A whole number formats nationally (GB "2071838750" → "020 7183 8750"); a partial one as typed so far.
  const parsed = parsePhoneNumberFromString(digits, country)
  if (parsed?.isPossible()) return parsed.formatNational()
  return new AsYouType(country).input(digits)
}

/** What the phone input holds: the picked region and the national number as typed. */
export interface PhoneInputValue {
  readonly region: string
  readonly national: string
}

/** An empty phone input in the default region. */
export const EMPTY_PHONE_INPUT: PhoneInputValue = Object.freeze({ region: DEFAULT_PHONE_REGION, national: "" })

/** Text starting with `+` (an international number) as a region and national number; `null` when it names no single region. */
export function parseInternationalPhone(text: string): PhoneInputValue | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith("+")) return null
  const parsed = parsePhoneNumberFromString(trimmed)
  if (!parsed?.country) return null
  return { region: parsed.country.toLowerCase(), national: parsed.formatNational() }
}

/**
 * A saved number (E.164 or national) and its `phoneNumberRegion` as the
 * phone input's value: the number's own region when it parses to one, else
 * the given region, with the national number formatted.
 */
export function phoneInputFrom(value: string | null | undefined, region: string | null | undefined): PhoneInputValue {
  const text = (value ?? "").trim()
  const fallback = isPhoneRegion(region) ? normalizeRegion(region) : DEFAULT_PHONE_REGION
  if (text === "") return { region: fallback, national: "" }
  const parsed = parsePhoneNumberFromString(text, countryOrDefault(fallback))
  if (!parsed) return { region: fallback, national: text }
  return { region: parsed.country?.toLowerCase() ?? fallback, national: parsed.formatNational() }
}

/** Why a phone input value is invalid. */
export type PhoneIssue = "required" | "tenDigits" | "invalid"

/**
 * 1health-fe's rule: a +1 region needs exactly 10 national digits
 * ("Enter a 10-digit US number"); any other region must be a valid number
 * for that country ("Enter a valid phone number"). No digits is `required`
 * (an optional field checks emptiness itself first). `null` when valid.
 */
export function phoneIssue({ region, national }: PhoneInputValue): PhoneIssue | null {
  const digits = phoneDigits(national)
  if (digits === "") return "required"
  const country = countryOrDefault(region)
  if (getCountryCallingCode(country) === "1") return digits.length === 10 ? null : "tenDigits"
  return isValidPhoneNumber(digits, country) ? null : "invalid"
}

/** The E.164 form (`+14155552125`) sent as a Contact Point `value`; `null` when there are no digits or they form no number. */
export function toE164({ region, national }: PhoneInputValue): string | null {
  const digits = phoneDigits(national)
  if (digits === "") return null
  return parsePhoneNumberFromString(digits, countryOrDefault(region))?.number ?? null
}
