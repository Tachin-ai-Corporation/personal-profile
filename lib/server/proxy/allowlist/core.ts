import "server-only"

import type { AllowlistEntry } from "../types"

/** Shell entries used by every page: the Launching user (Stories 1.4, 1.9). */
export const entries: readonly AllowlistEntry[] = [{ method: "GET", template: "v2/user/myself" }]
