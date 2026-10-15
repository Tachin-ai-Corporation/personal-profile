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
import { proxyPath } from "./config"

/** Cards per page (FR117). */
export const ORGS_PAGE_SIZE = 12

export function organizationsPath(name: string, page: number): string {
  const query = new URLSearchParams({ name, page: String(page), size: String(ORGS_PAGE_SIZE) })
  return proxyPath(`v2/user/organization/portal?${query.toString()}`)
}

export function orgLogoPath(tenantId: number): string {
  return `${BFF_PATHS.orgLogoPrefix}${tenantId}`
}
