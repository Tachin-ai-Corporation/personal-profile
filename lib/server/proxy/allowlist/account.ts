import "server-only"

import { ACCOUNT_TIME_ZONES } from "@/lib/shared/time-zones"
import type { AllowlistEntry } from "../types"

const timeZonePattern = new RegExp(`^(?:${ACCOUNT_TIME_ZONES.map(({ value }) => RegExp.escape(value)).join("|")})$`)

/**
 * `/account` entries (Team B, Epics 7–10). Each single-story entry, tagged
 * `profile: true`, lands with its story; the shared `PUT v2/user/edit` lives in
 * `personal.ts`.
 */
export const entries: readonly AllowlistEntry[] = [
  { method: "POST", template: "v2/user/time-zone", profile: true,
    query: { timeZone: { required: true, pattern: timeZonePattern } } },
  { method: "POST", template: "v2/user/locale", profile: true,
    query: { locale: { required: true, pattern: /^en-US$/ } } },
]
