import "server-only"

import type { AllowlistEntry } from "../types"

/** Provider registration (Epic 9, `profile: true`) entries; each lands with the story that calls it. */
export const entries: readonly AllowlistEntry[] = [
  { method: "GET", template: "v2/user/npi", profile: true },
  { method: "GET", template: "v2/public/npi/list", profile: true, query: {
    entityTypeCode: { pattern: /^[12]$/, required: true },
    searchText: { pattern: /^[\s\S]{0,100}$/ },
    page: { pattern: /^\d{1,4}$/ },
    limit: { pattern: /^(?:[1-9]|10)$/ },
  } },
]
