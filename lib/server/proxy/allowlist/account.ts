import "server-only"

import type { AllowlistEntry } from "../types"

/**
 * `/account` entries (Team B, Epics 7–10). Each single-story entry, tagged
 * `profile: true`, lands with its story; the shared `PUT v2/user/edit` lives in
 * `personal.ts`.
 */
export const entries: readonly AllowlistEntry[] = [
  { method: "POST", template: "v2/user/time-zone", profile: true,
    query: { timeZone: { required: true, pattern: /^(Pacific\/Honolulu|America\/(Anchorage|Los_Angeles|Denver|Chicago|New_York))$/ } } },
  { method: "POST", template: "v2/user/locale", profile: true,
    query: { locale: { required: true, pattern: /^en-US$/ } } },
]
