/** Story 7.4's approved options, reused by the Account edit view and allowlist. */
import { ACCOUNT_MESSAGES } from "./messages/account"

export const ACCOUNT_TIME_ZONES = [
  { value: "Pacific/Honolulu", label: ACCOUNT_MESSAGES.zoneHawaiian },
  { value: "America/Anchorage", label: ACCOUNT_MESSAGES.zoneAlaska },
  { value: "America/Los_Angeles", label: ACCOUNT_MESSAGES.zonePacific },
  { value: "America/Denver", label: ACCOUNT_MESSAGES.zoneMountain },
  { value: "America/Chicago", label: ACCOUNT_MESSAGES.zoneCentral },
  { value: "America/New_York", label: ACCOUNT_MESSAGES.zoneEastern },
] as const
