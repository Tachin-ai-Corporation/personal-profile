/**
 * Insurance (Team A, Epic 5: Stories 5.1–5.5). Pre-created by spec F6-3
 * (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module owns (entries land with their stories in
 * `lib/server/proxy/allowlist/insurance.ts`):
 * - `GET v2/health/patient/insurance?page=0&size=100` under `keys.insurance()`
 *   (Story 5.1: `fetchInsurance`, registered below);
 * - `GET v2/health/insurance/organizations?name=&page=&size=` (insurer search, 5.2);
 * - `POST v2/health/patient/insurance`, `PUT v2/health/patient/insurance/{id}`,
 *   `DELETE v2/health/insurance/{id}` (5.2, 5.5);
 * - card uploads (entries exist, 5.3) and the card download
 *   `GET v2/health/insurance/{id}/file/{fileId}/download?fileRelKey=…`
 *   (Story 5.1: `insuranceCardDownloadPath`, an `<img src>`);
 * - `GET v2/type/key/Insurance` (entry exists; read through `type-keys.ts`).
 *
 * Live search does NOT use SWR (spec F6-3 decision): it loads through the
 * Combobox `load(query, page, signal)` callback, never through a `keys.ts`
 * key, and nothing is cached across searches (NPI results never, PNFR1). Do
 * not add search keys to `keys.ts`. (Insurer search, 5.2.)
 */

import { z } from "zod"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { registerFetcher, unwrap } from "./fetcher"
import type { TypeKey } from "./type-keys"
import type { ApiResponse } from "./types"

/** The type whose value lists the editor reads (`keys.typeKey(INSURANCE_TYPE_KEY)`). */
export const INSURANCE_TYPE_KEY = "Insurance" satisfies TypeKey

/** Insurer search page size (Story 5.2 combobox `pageSize`). */
export const INSURER_PAGE_SIZE = 20

/** The card sides and their relation keys (upload relation, Story 5.3; download `fileRelKey`, Story 5.1). */
export const INSURANCE_CARD_RELATIONS = {
  front: "InsuranceHasFrontSideCardFile",
  back: "InsuranceHasBackSideCardFile",
} as const

export type InsuranceCardSide = keyof typeof INSURANCE_CARD_RELATIONS

/** The sides in display order (Front, then Back). */
export const INSURANCE_CARD_SIDES: readonly InsuranceCardSide[] = ["front", "back"]

/** The platform's `label` of a deleted policy (`InsuranceConstants.Label.DELETED`). */
export const INSURANCE_DELETED_LABEL = "Deleted"

export function insuranceListPath(): string {
  return proxyPath("v2/health/patient/insurance?page=0&size=100")
}

/** The card upload of a saved policy (`insuranceId` only from a saved policy, never typed). */
export function insuranceCardUploadPath(insuranceId: number, side: InsuranceCardSide): string {
  return proxyPath(`v2/health/type/Insurance/${insuranceId}/relation/${INSURANCE_CARD_RELATIONS[side]}/file/upload`)
}

const isPositiveId = (value: number): boolean => Number.isSafeInteger(value) && value > 0

/**
 * A card image of a policy (Story 5.1), for an `<img src>` (same origin, so
 * the session cookie goes with it): `/api/1h/v2/health/insurance/{id}/file/
 * {fileId}/download?fileRelKey=InsuranceHas{Front|Back}SideCardFile`. Both
 * ids must be positive integers (the file id only from the policy's own
 * `frontSideCardFile` / `backSideCardFile`); `null` otherwise.
 */
export function insuranceCardDownloadPath(insuranceId: number, fileId: number, side: InsuranceCardSide): string | null {
  if (!isPositiveId(insuranceId) || !isPositiveId(fileId)) return null
  return proxyPath(`v2/health/insurance/${insuranceId}/file/${fileId}/download?fileRelKey=${INSURANCE_CARD_RELATIONS[side]}`)
}

/**
 * One policy as the client reads it (Story 5.1, backend `ResponseInsuranceDTO`).
 * Values are the platform's, unformatted: the enums are constant names
 * (`MEDICAL`, `PRIMARY`, `SELF`, `N_A` included), the dates `YYYY-MM-DD` (the
 * backend's `1970-01-01` "no date" included), `null` when missing. Display
 * rules live in `features/insurance`.
 */
export interface InsurancePolicy {
  readonly id: number | null
  /** `insuranceType`: MEDICAL, DENTAL, HOSPICE, VISION, DRUG or N_A. */
  readonly type: string | null
  /** `insurancePrecedence`: PRIMARY, SECONDARY, SUPPLEMENTAL, OTHER or N_A. */
  readonly precedence: string | null
  /** `relationshipToInsured`: SELF, SPOUSE, PARENT, CHILD, DEPENDENT or N_A. */
  readonly relationship: string | null
  /** `label === "Deleted"`. */
  readonly deleted: boolean
  /** `insuranceOrganizationDTO.insuranceCompanyName`. */
  readonly insurer: string | null
  readonly subscriber: { readonly firstName: string | null; readonly lastName: string | null } | null
  readonly memberId: string | null
  readonly groupId: string | null
  readonly effectiveDate: string | null
  readonly expirationDate: string | null
  readonly cancellationDate: string | null
  /** The newest card file of each side (`frontSideCardFile.id` / `backSideCardFile.id`). */
  readonly cardFileIds: Readonly<Record<InsuranceCardSide, number | null>>
}

const text = z.string().nullish()
const fileSchema = z.object({ id: z.number().nullish() }).nullish()

/** A row of the list (`ResponseInsuranceDTO`); unknown fields are ignored. */
const insuranceWireSchema = z.object({
  id: z.number().nullish(),
  insuranceType: text,
  insurancePrecedence: text,
  relationshipToInsured: text,
  label: text,
  insuranceOrganizationDTO: z.object({ insuranceCompanyName: text }).nullish(),
  subscriber: z.object({ firstName: text, lastName: text }).nullish(),
  memberIdNumber: text,
  insuranceGroupId: text,
  planEffectiveDate: text,
  expirationDate: text,
  cancellationDate: text,
  frontSideCardFile: fileSchema,
  backSideCardFile: fileSchema,
})

type InsuranceWire = z.infer<typeof insuranceWireSchema>

const insuranceListSchema = z.array(insuranceWireSchema)

/** The backend answers a Spring Page (`{ content, last, … }`); a bare list is accepted too. */
const insuranceBodySchema = z.union([insuranceListSchema, z.object({ content: insuranceListSchema })])

function toInsurancePolicy(wire: InsuranceWire): InsurancePolicy {
  return {
    id: wire.id ?? null,
    type: wire.insuranceType ?? null,
    precedence: wire.insurancePrecedence ?? null,
    relationship: wire.relationshipToInsured ?? null,
    deleted: wire.label === INSURANCE_DELETED_LABEL,
    insurer: wire.insuranceOrganizationDTO?.insuranceCompanyName ?? null,
    subscriber: wire.subscriber ? { firstName: wire.subscriber.firstName ?? null, lastName: wire.subscriber.lastName ?? null } : null,
    memberId: wire.memberIdNumber ?? null,
    groupId: wire.insuranceGroupId ?? null,
    effectiveDate: wire.planEffectiveDate ?? null,
    expirationDate: wire.expirationDate ?? null,
    cancellationDate: wire.cancellationDate ?? null,
    cardFileIds: { front: wire.frontSideCardFile?.id ?? null, back: wire.backSideCardFile?.id ?? null },
  }
}

/**
 * The policies in platform order, or `null` when the body is neither a Page
 * of policies nor a list of them. Deleted policies are kept (the card shows
 * them muted).
 */
export function toInsurancePolicies(raw: unknown): InsurancePolicy[] | null {
  const parsed = insuranceBodySchema.safeParse(raw)
  if (!parsed.success) return null
  const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.content
  return rows.map(toInsurancePolicy)
}

export async function fetchInsurance(): Promise<ApiResponse<InsurancePolicy[]>> {
  const res = await callApi<unknown>("insurance/fetchInsurance", insuranceListPath())
  if (!res.success) return { ...res, data: undefined }
  const rows = toInsurancePolicies(res.data)
  return rows
    ? { success: true, data: rows, statusCode: res.statusCode }
    : { success: false, statusCode: res.statusCode, error: "insurance/fetchInsurance returned an unexpected shape" }
}

/** The SWR loader of `keys.insurance()`. */
export function loadInsurance(): Promise<InsurancePolicy[] | undefined> {
  return unwrap(fetchInsurance())
}

registerFetcher("insurance", () => loadInsurance())
