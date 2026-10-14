import "server-only"

import type { AllowlistEntry } from "../types"

/** Provider registration (Epic 9, `profile: true`) entries; each lands with the story that calls it. */
export const entries: readonly AllowlistEntry[] = []
