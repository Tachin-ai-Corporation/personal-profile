/**
 * My Organizations (Team B, Epic 10: Stories 10.1–10.3). Pre-created by spec
 * F6-3 (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module will own:
 * - `GET v2/user/organization/portal?name=&page=&size=12` under
 *   `keys.orgs(name, page)` (10.1 adds the `profile: true` entry in
 *   `lib/server/proxy/allowlist/orgs.ts` and registers `registerFetcher("orgs", …)` here);
 * - the org logo `GET /api/pp/org-logo/<tenantId>` (named op, built in F2), used as an `<img src>`.
 * Checkout URL and internal domains: `lib/shared/profile-constants.ts`.
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { providedOrNull } from "@/lib/shared/display-value"
import { COMMON_MESSAGES } from "@/lib/shared/messages/common"
import { z } from "zod"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { registerFetcher, unwrap } from "./fetcher"
import type { ApiResponse } from "./types"

/** Cards per page (FR117). */
export const ORGS_PAGE_SIZE = 12

export function organizationsPath(name: string, page: number): string {
  const query = new URLSearchParams({ name, page: String(page), size: String(ORGS_PAGE_SIZE) })
  return proxyPath(`v2/user/organization/portal?${query.toString()}`)
}

export function orgLogoPath(tenantId: number | string): string {
  return `${BFF_PATHS.orgLogoPrefix}${tenantId}`
}

const organizationTenantId = z.union([
  z.number().int().positive().safe().transform(String),
  z.string().regex(/^(?=.*[1-9])\d{1,19}$/),
])
const organizationContactSchema = z.object({
  firstName: z.string().nullish(), middleName: z.string().nullish(), lastName: z.string().nullish(),
  email: z.string().nullish(), phoneNumber: z.string().nullish(), phoneNumberRegion: z.string().nullish(),
  contactTypes: z.array(z.string()).nullish().transform((value) => value ?? []),
})
const organizationRowSchema = z.object({
  tenantId: organizationTenantId,
  enabledInTenant: z.boolean().nullish().transform((value) => value === true),
  organization: z.object({
    name: z.string(),
    shortOrganizationName: z.string().nullish(),
    type: z.array(z.string()).nullish().transform((value) => value ?? []),
    personContacts: z.array(organizationContactSchema).nullish().transform((value) => value ?? []),
  }).nullable(),
})
const organizationPageSchema = z.object({
  data: z.array(organizationRowSchema).max(ORGS_PAGE_SIZE),
  totalElements: z.number().int().nonnegative().safe(),
  totalPages: z.number().int().nonnegative().safe(),
  pageNumber: z.number().int().nonnegative().safe(),
})
const organizationQuerySchema = z.object({ name: z.string().trim().max(100), page: z.number().int().min(0).max(9999) })

export interface OrganizationPortalContact {
  readonly firstName?: string | null
  readonly middleName?: string | null
  readonly lastName?: string | null
  readonly email?: string | null
  readonly phoneNumber?: string | null
  readonly phoneNumberRegion?: string | null
  readonly contactTypes: readonly string[]
}

export interface OrganizationPortalItem {
  readonly tenantId: string
  readonly enabledInTenant: boolean
  readonly name: string
  readonly shortName?: string | null
  readonly types: readonly string[]
  readonly personContacts: readonly OrganizationPortalContact[]
}

export interface OrganizationPortalPage {
  readonly items: readonly OrganizationPortalItem[]
  readonly totalElements: number
  readonly totalPages: number
  readonly pageNumber: number
}

/** Only the UI domain projection enters SWR; never expose tenant URLs/configuration. */
export async function listOrganizations(input: { readonly name: string; readonly page: number }): Promise<ApiResponse<OrganizationPortalPage>> {
  const query = organizationQuerySchema.safeParse(input)
  if (!query.success) return { success: false, statusCode: 400 }
  const response = await callApi<unknown>("organizations/list", organizationsPath(query.data.name, query.data.page))
  if (!response.success) return { ...response, data: undefined }
  const parsed = organizationPageSchema.safeParse(response.data)
  if (!parsed.success) return { success: false, statusCode: response.statusCode }
  const items: OrganizationPortalItem[] = []
  for (const row of parsed.data.data) {
    if (row.organization === null) continue
    const organization = row.organization
    items.push({ tenantId: row.tenantId, enabledInTenant: row.enabledInTenant, name: organization.name,
      shortName: providedOrNull(organization.shortOrganizationName), types: organization.type, personContacts: organization.personContacts })
  }
  items.sort((left, right) => {
    const leftName = providedOrNull(left.shortName) ?? providedOrNull(left.name) ?? COMMON_MESSAGES.notProvided
    const rightName = providedOrNull(right.shortName) ?? providedOrNull(right.name) ?? COMMON_MESSAGES.notProvided
    return leftName.trim().toLowerCase().localeCompare(rightName.trim().toLowerCase())
  })
  return { success: true, statusCode: response.statusCode, data: { items, totalElements: parsed.data.totalElements, totalPages: parsed.data.totalPages, pageNumber: parsed.data.pageNumber } }
}

registerFetcher("orgs", (key) => unwrap(
  typeof key[2] === "string" && typeof key[3] === "number"
    ? listOrganizations({ name: key[2], page: key[3] })
    : Promise.resolve({ success: false, statusCode: 400 }),
))
