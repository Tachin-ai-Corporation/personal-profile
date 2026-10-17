import { primaryPhoneRegion, type ContactPoint, type Myself } from "@/lib/api"
import { wireToDisplayDate } from "@/lib/shared/dates"
import { providedOrNull } from "@/lib/shared/display-value"
import { ACCOUNT_MESSAGES } from "@/lib/shared/messages"
import { isBirthDateInRange } from "@/lib/shared/person-rules"
import { formatPhoneDisplay } from "@/lib/shared/phone"
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

function provided(value: string | null | undefined): string | null {
  return providedOrNull((value ?? "").trim())
}

/** A read-only display model; dates and phone rules have a single shared owner. */
export function toAccountView(myself: Myself, mobileRows?: readonly ContactPoint[], today: Date = new Date()): AccountView {
  const phone = provided(myself.phoneNumber)
  const language = provided(myself.preferredLanguage)
  const zone = provided(myself.timeZone)
  const locale = provided(myself.locale)
  return {
    firstName: provided(myself.firstName),
    lastName: provided(myself.lastName),
    username: provided(myself.username),
    password: "********",
    primaryEmail: provided(myself.email),
    primaryPhone: phone === null ? null : formatPhoneDisplay(phone, primaryPhoneRegion(mobileRows, myself)),
    birthDate: isBirthDateInRange(myself.birthDate, myself.roles, today) ? wireToDisplayDate(myself.birthDate) : null,
    preferredLanguage: language === "en" ? ACCOUNT_MESSAGES.english : language,
    timeZone: ACCOUNT_TIME_ZONES.find((entry) => entry.value === zone)?.label ?? zone,
    locale: locale === null || locale === "en-US" ? ACCOUNT_MESSAGES.localeEnglishUS : locale,
  }
}
