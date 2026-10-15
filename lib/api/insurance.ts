/**
 * Insurance (Team A, Epic 5: Stories 5.1–5.5). Pre-created by spec F6-3
 * (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module will own (entries land with their stories in
 * `lib/server/proxy/allowlist/insurance.ts`):
 * - `GET v2/health/patient/insurance?page=0&size=100` under `keys.insurance()`
 *   (Story 5.1 registers `registerFetcher("insurance", …)` here);
 * - `GET v2/health/insurance/organizations?name=&page=&size=` (insurer search, 5.2);
 * - `POST v2/health/patient/insurance`, `PUT v2/health/patient/insurance/{id}`,
 *   `DELETE v2/health/insurance/{id}` (5.2, 5.5);
 * - card uploads (entries exist) and `GET v2/health/insurance/{id}/file/{fileId}/download` (5.1, 5.3);
 * - `GET v2/type/key/Insurance` (entry exists; read through `type-keys.ts`).
 */

import { proxyPath } from "./config"
import type { TypeKey } from "./type-keys"

/** The type whose value lists the editor reads (`keys.typeKey(INSURANCE_TYPE_KEY)`). */
export const INSURANCE_TYPE_KEY = "Insurance" satisfies TypeKey

/** Insurer search page size (Story 5.2 combobox `pageSize`). */
export const INSURER_PAGE_SIZE = 20

/** The card sides and their upload relation keys (Story 5.3). */
export const INSURANCE_CARD_RELATIONS = {
  front: "InsuranceHasFrontSideCardFile",
  back: "InsuranceHasBackSideCardFile",
} as const

export type InsuranceCardSide = keyof typeof INSURANCE_CARD_RELATIONS

export function insuranceListPath(): string {
  return proxyPath("v2/health/patient/insurance?page=0&size=100")
}

/** The card upload of a saved policy (`insuranceId` only from a saved policy, never typed). */
export function insuranceCardUploadPath(insuranceId: number, side: InsuranceCardSide): string {
  return proxyPath(`v2/health/type/Insurance/${insuranceId}/relation/${INSURANCE_CARD_RELATIONS[side]}/file/upload`)
}
