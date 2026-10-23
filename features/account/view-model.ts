import { ACCOUNT_LOCALE, primaryPhoneRegion, type ContactPoint, type Myself } from "@/lib/api"
import { wireToDisplayDate } from "@/lib/shared/dates"
import { providedOrNull } from "@/lib/shared/display-value"
import { ACCOUNT_MESSAGES } from "@/lib/shared/messages"
import { isBirthDateInRange } from "@/lib/shared/person-rules"
import { formatPhoneDisplay, phoneDigits } from "@/lib/shared/phone"
import { ACCOUNT_TIME_ZONES } from "@/lib/shared/time-zones"

export interface AccountView {
  readonly firstName: string | null
  readonly lastName: string | null
  readonly username: string | null
  readonly password: string
  readonly primaryEmail: string | null
  readonly primaryPhone: string | null
  readonly birthDate: string | null
  readonly preferredLanguage: string | null
  readonly timeZone: string | null
  readonly locale: string
}

/**
 * `en-US` for any spelling of it (`en-us`, `EN-US`, `en_US`), else the value
 * unchanged. Legacy 1health-fe writes `en-us` (PersonalAccountUtils.ts:88-90);
 * the backend validates a locale case-insensitively and stores it as sent
 * (1h-ng-bo-core-be StringUtil.isValidLocale), so these are the same locale.
 */
export function canonicalAccountLocale(value: string): string {
  return value.replace("_", "-").toLowerCase() === ACCOUNT_LOCALE.toLowerCase() ? ACCOUNT_LOCALE : value
}

function provided(value: string | null | undefined): string | null {
  return providedOrNull((value ?? "").trim())
}

/** A read-only display model; dates and phone rules have a single shared owner. */
export function toAccountView(myself: Myself, mobileRows?: readonly ContactPoint[], today: Date = new Date()): AccountView {
  const phone = provided(myself.phoneNumber)
  // Contact labels may lag a confirmed identity update. The current number's
  // matching Mobile row owns its region before falling back to shared lookup.
  const matchingPhone = phone ? mobileRows?.find((row) => (row.type === "Mobile" || row.type === null) && phoneDigits(row.value ?? "") === phoneDigits(phone)) : undefined
  const phoneRegion = matchingPhone ? matchingPhone.phoneNumberRegion : primaryPhoneRegion(mobileRows, myself)
  const language = provided(myself.preferredLanguage)
  const zone = provided(myself.timeZone)
  const locale = provided(myself.locale)
  return {
    firstName: provided(myself.firstName),
    lastName: provided(myself.lastName),
    username: provided(myself.username),
    password: "********",
    primaryEmail: provided(myself.email),
    primaryPhone: phone === null ? null : formatPhoneDisplay(phone, phoneRegion),
    birthDate: isBirthDateInRange(myself.birthDate, myself.roles, today) ? wireToDisplayDate(myself.birthDate) : null,
    preferredLanguage: language === "en" ? ACCOUNT_MESSAGES.english : language,
    timeZone: ACCOUNT_TIME_ZONES.find((entry) => entry.value === zone)?.label ?? zone,
    locale: locale === null || canonicalAccountLocale(locale) === ACCOUNT_LOCALE ? ACCOUNT_MESSAGES.localeEnglishUS : locale,
  }
}
