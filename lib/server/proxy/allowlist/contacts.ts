import "server-only"

import type { AllowlistEntry } from "../types"

/**
 * Contact Point reads shared by the header, Contacts (Epic 3) and `/account`
 * (Epic 7). One or more `type` params; `Social Media` is the backend
 * `ContactPointType` literal (spec F1, validated against agents.md).
 */
export const entries: readonly AllowlistEntry[] = [
  {
    method: "GET",
    template: "v2/user/contact-point/list",
    query: { type: { pattern: /^(Email|Mobile|Landline|Social Media)$/, repeatable: true } },
  },
]
