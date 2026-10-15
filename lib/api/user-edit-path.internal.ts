/**
 * `PUT /api/1h/v2/user/edit` (partial `PersonalInformationDTO`), shared by
 * Personal information (`personal.ts`, Team A, Story 2.2) and Account
 * settings (`account.ts`, Team B, Stories 7.5–7.6), so neither team owns it
 * (spec F6-3 review). Internal (`*.internal.ts`): never re-exported from
 * `lib/api/index.ts`; each module imports it when it writes its first call.
 */

import { proxyPath } from "./config"

export function userEditPath(): string {
  return proxyPath("v2/user/edit")
}
