import "server-only"

import type { AllowlistEntry } from "../types"

/** My Organizations (Epic 10, `profile: true`) entries; each lands with the story that calls it. */
export const entries: readonly AllowlistEntry[] = [
  { method: "GET", template: "v2/user/organization/portal", profile: true, query: {
    name: { pattern: /^[\s\S]{0,100}$/, required: true },
    page: { pattern: /^\d{1,4}$/, required: true },
    size: { pattern: /^(?:[1-9]|1[0-2])$/, required: true },
  } },
]
