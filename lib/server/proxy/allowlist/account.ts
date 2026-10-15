import "server-only"

import type { AllowlistEntry } from "../types"

/**
 * `/account` entries (Team B, Epics 7–10). Each single-story entry, tagged
 * `profile: true`, lands with its story; the shared `PUT v2/user/edit` lives in
 * `personal.ts`.
 */
export const entries: readonly AllowlistEntry[] = []
