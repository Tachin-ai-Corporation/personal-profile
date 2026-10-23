import "server-only"

import { z } from "zod"
import type { AllowlistEntry } from "../types"

/**
 * The registry's NPI row id in `is-registered` (Story 9.2): a positive safe
 * integer, so `0` and ids past 2^53 − 1 are 400 `BAD_PATH` (spec F-proxy
 * path ids, PR #42), matching the register body's ids.
 */
const npiRowId = z.string().regex(/^[1-9]\d{0,15}$/).refine((value) => Number.isSafeInteger(Number(value)))

/** Provider registration (Epic 9, `profile: true`) entries; each lands with the story that calls it. */
export const entries: readonly AllowlistEntry[] = [
  { method: "GET", template: "v2/user/npi", profile: true },
  { method: "GET", template: "v2/public/npi/list", profile: true, query: {
    entityTypeCode: { pattern: /^[12]$/, required: true },
    searchText: { pattern: /^[\s\S]{0,100}$/ },
    page: { pattern: /^\d{1,4}$/ },
    limit: { pattern: /^(?:[1-9]|10)$/ },
  } },
  { method: "GET", template: "v2/health/npi/{n}/is-registered", profile: true, pathParams: { n: npiRowId } },
  { method: "POST", template: "v2/user/register/npi", profile: true, body: z.strictObject({
    providerNpiId: z.number().int().positive().safe(),
    practiceNpiId: z.number().int().positive().safe().optional(),
  }) },
]
