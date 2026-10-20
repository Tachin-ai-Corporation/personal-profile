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
 * not add search keys to `keys.ts`. (Insurer search, 5.2: `searchInsurers`.)
 */

import { z } from "zod"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { registerFetcher, unwrap } from "./fetcher"
import { valueListOptions, type TypeInfo, type TypeKey } from "./type-keys"
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

const isPositiveId = (value: number): boolean => Number.isSafeInteger(value) && value > 0

export function insuranceListPath(): string {
  return proxyPath("v2/health/patient/insurance?page=0&size=100")
}

/** Add a policy (Story 5.2, `POST`). */
export function insuranceCreatePath(): string {
  return proxyPath("v2/health/patient/insurance")
}

/** Edit a saved policy (Story 5.2, `PUT`); `null` unless the id is a positive integer. */
export function insuranceUpdatePath(insuranceId: number): string | null {
  return isPositiveId(insuranceId) ? proxyPath(`v2/health/patient/insurance/${insuranceId}`) : null
}

/** One page of the insurer search (Story 5.2): `name` as typed (trimmed by the Combobox), `size` the editor's 20. */
export function insurerSearchPath(name: string, page: number): string {
  const query = new URLSearchParams({ name, page: String(page), size: String(INSURER_PAGE_SIZE) })
  return proxyPath(`v2/health/insurance/organizations?${query.toString()}`)
}

/** The card upload of a saved policy (`insuranceId` only from a saved policy, never typed). */
export function insuranceCardUploadPath(insuranceId: number, side: InsuranceCardSide): string {
  return proxyPath(`v2/health/type/Insurance/${insuranceId}/relation/${INSURANCE_CARD_RELATIONS[side]}/file/upload`)
}

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
  /** `insuranceOrganizationDTO.insuranceCompanyId` (Story 5.2: an Edit keeps the saved insurer by id). */
  readonly insurerId: number | null
  /** The policyholder when the relationship isn't Self (Story 5.2 sends it back unchanged on an Edit). */
  readonly subscriber: InsuranceSubscriber | null
  readonly memberId: string | null
  readonly groupId: string | null
  readonly effectiveDate: string | null
  readonly expirationDate: string | null
  readonly cancellationDate: string | null
  /** The newest card file of each side (`frontSideCardFile.id` / `backSideCardFile.id`). */
  readonly cardFileIds: Readonly<Record<InsuranceCardSide, number | null>>
}

/** A policy's subscriber (backend `SubscriberDTO`): `birthDate` `YYYY-MM-DD`, the phone as saved with its region. */
export interface InsuranceSubscriber {
  readonly firstName: string | null
  readonly lastName: string | null
  readonly email: string | null
  readonly phoneNumber: string | null
  readonly phoneNumberRegion: string | null
  readonly birthDate: string | null
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
  insuranceOrganizationDTO: z.object({ insuranceCompanyName: text, insuranceCompanyId: z.number().nullish() }).nullish(),
  subscriber: z.object({ firstName: text, lastName: text, email: text, phoneNumber: text, phoneNumberRegion: text, birthDate: text }).nullish(),
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

/**
 * The backend answers its `PageImpl` (`{ data, lastPage, … }`, `common/repository/PageImpl.java`);
 * a Spring Page (`{ content, last, … }`) and a bare list are accepted too.
 */
const insuranceBodySchema = z.union([insuranceListSchema, z.object({ content: insuranceListSchema }), z.object({ data: insuranceListSchema })])

function toInsurancePolicy(wire: InsuranceWire): InsurancePolicy {
  return {
    id: wire.id ?? null,
    type: wire.insuranceType ?? null,
    precedence: wire.insurancePrecedence ?? null,
    relationship: wire.relationshipToInsured ?? null,
    deleted: wire.label === INSURANCE_DELETED_LABEL,
    insurer: wire.insuranceOrganizationDTO?.insuranceCompanyName ?? null,
    insurerId: wire.insuranceOrganizationDTO?.insuranceCompanyId ?? null,
    subscriber: wire.subscriber
      ? {
          firstName: wire.subscriber.firstName ?? null,
          lastName: wire.subscriber.lastName ?? null,
          email: wire.subscriber.email ?? null,
          phoneNumber: wire.subscriber.phoneNumber ?? null,
          phoneNumberRegion: wire.subscriber.phoneNumberRegion ?? null,
          birthDate: wire.subscriber.birthDate ?? null,
        }
      : null,
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
  const body = parsed.data
  const rows = Array.isArray(body) ? body : "content" in body ? body.content : body.data
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

// ---------------------------------------------------------------------------
// Story 5.2: the editor's value lists, the insurer search and the saves.
// ---------------------------------------------------------------------------

/** `insuranceType` values a policy is saved with (`InsuranceConstants.InsuranceType`, `N_A` left out), in display order. */
export const INSURANCE_TYPES = ["MEDICAL", "DENTAL", "HOSPICE", "VISION", "DRUG"] as const
/** `insurancePrecedence` values (`InsuranceConstants.InsurancePrecedence`, `N_A` left out). */
export const INSURANCE_PRECEDENCES = ["PRIMARY", "SECONDARY", "SUPPLEMENTAL", "OTHER"] as const
/** `relationshipToInsured` values (`InsuranceConstants.RelationshipToInsured`, `N_A` left out). */
export const INSURANCE_RELATIONSHIPS = ["SELF", "SPOUSE", "PARENT", "CHILD", "DEPENDENT"] as const

/** The relationship whose subscriber is the user: no `subscriber` is sent. */
export const INSURANCE_SELF = "SELF"

export type InsuranceType = (typeof INSURANCE_TYPES)[number]
export type InsurancePrecedence = (typeof INSURANCE_PRECEDENCES)[number]
export type InsuranceRelationship = (typeof INSURANCE_RELATIONSHIPS)[number]

/** The editor's three value lists. */
export type InsuranceValueList = "type" | "precedence" | "relationship"

/**
 * Each list's type key attribute (Type is an attribute of `Insurance`;
 * Precedence and Relationship are attributes of its `InsuranceBelongsToPerson`
 * relation, decision 1A) and the constants it may offer.
 */
const VALUE_LISTS: Readonly<Record<InsuranceValueList, { readonly attrKey: string; readonly values: readonly string[] }>> = {
  type: { attrKey: "insuranceType", values: INSURANCE_TYPES },
  precedence: { attrKey: "insurancePrecedence", values: INSURANCE_PRECEDENCES },
  relationship: { attrKey: "relationshipToInsured", values: INSURANCE_RELATIONSHIPS },
}

/** A type key value name (`"Medical"`, `"Supplemental"`) as its enum constant (`MEDICAL`). */
const toConstant = (name: string): string => name.trim().toUpperCase().replaceAll(/\s+/g, "_")

/**
 * The constants one list offers (`keys.typeKey("Insurance")`, Story 5.2): the
 * type key's VALUE_LIST values (`n/a` dropped by `valueListOptions`) as enum
 * constants, kept only when the backend accepts them, in the constants'
 * order. The backend's constants when the type key has no such list; empty
 * while there is no type key (loading or failed).
 */
export function insuranceValueOptions(info: TypeInfo | null | undefined, list: InsuranceValueList): string[] {
  if (!info) return []
  const { attrKey, values } = VALUE_LISTS[list]
  const offered = new Set(valueListOptions(info, attrKey).map((value) => toConstant(value.name)))
  const listed = values.filter((value) => offered.has(value))
  // A type key without the list (or none the backend takes) falls back to the backend's own constants.
  return listed.length > 0 ? listed : [...values]
}

/** One insurer of the search (backend `OrganizationInsuranceTypeDTO`). */
export interface InsurerOption {
  readonly id: number
  readonly name: string
}

/**
 * One page of the insurer search, in the shape of the Combobox `load` result
 * (`components/ui/use-combobox.ts` `ComboboxLoadResult`), or `{ error: true }`.
 */
export type InsurerSearchResult =
  | { readonly items: readonly InsurerOption[]; readonly hasMore: boolean; readonly exactMatch: boolean }
  | { readonly error: true }

/** The search answer: the backend `PageImpl` (`{ data, lastPage }`); rows without an id or a name are dropped. */
const insurerPageSchema = z.object({
  data: z.array(z.unknown()),
  lastPage: z.boolean(),
})
const insurerRowSchema = z.object({ id: z.number().int().positive(), name: z.string().regex(/\S/) })

/**
 * The insurer search (Story 5.2): the editor's Combobox `load`, never SWR and
 * never cached. `hasMore` is `!lastPage`; `exactMatch` says whether a loaded
 * row's name equals the query (trimmed, case-insensitive), so "Add “{name}”"
 * shows whenever none does. Never throws: a failure is `{ error: true }`.
 */
export async function searchInsurers(name: string, page: number, signal?: AbortSignal): Promise<InsurerSearchResult> {
  const res = await callApi<unknown>("insurance/searchInsurers", insurerSearchPath(name, page), { signal })
  if (!res.success) return { error: true }
  const parsed = insurerPageSchema.safeParse(res.data)
  if (!parsed.success) return { error: true }
  const items = parsed.data.data.flatMap((row) => {
    const item = insurerRowSchema.safeParse(row)
    return item.success ? [{ id: item.data.id, name: item.data.name.trim() }] : []
  })
  const query = name.trim().toLowerCase()
  return { items, hasMore: !parsed.data.lastPage, exactMatch: items.some((item) => item.name.toLowerCase() === query) }
}

/** The insurer of a save: a listed one by id, or a new one by name ("Add “{name}”"). */
export type InsuranceInsurerInput = { readonly id: number } | { readonly name: string }

/** The subscriber of a save, as the backend takes it (`phoneNumber` E.164, `birthDate` `YYYY-MM-DD`). */
export interface InsuranceSubscriberInput {
  readonly firstName: string
  readonly lastName: string
  readonly email: string
  readonly phoneNumber?: string
  readonly phoneNumberRegion?: string
  readonly birthDate?: string
}

/** A policy as the editor saves it (Story 5.2): platform values, dates `YYYY-MM-DD` or `""`. */
export interface InsurancePolicyInput {
  readonly insurer: InsuranceInsurerInput
  readonly type: InsuranceType
  readonly precedence: InsurancePrecedence
  readonly relationship: InsuranceRelationship
  readonly memberId: string
  /** `""` when blank: left out (the backend refuses an empty string). */
  readonly groupId: string
  readonly effectiveDate: string
  readonly expirationDate: string
  readonly cancellationDate: string
  /** Sent only when the relationship isn't Self. */
  readonly subscriber: InsuranceSubscriberInput | null
}

/** The `InsuranceDTO` body of a `POST` or `PUT` (the proxy's strict `insuranceBodySchema`). */
export interface InsuranceSaveBody {
  readonly insuranceOrganizationDTO: { readonly insuranceCompanyId: number } | { readonly insuranceCompanyName: string }
  readonly insuranceType: InsuranceType
  readonly insurancePrecedence: InsurancePrecedence
  readonly relationshipToInsured: InsuranceRelationship
  readonly memberIdNumber: string
  readonly insuranceGroupId?: string
  readonly planEffectiveDate: string
  readonly expirationDate?: string
  readonly cancellationDate?: string
  readonly subscriber?: InsuranceSubscriberInput
}

/** Keeps only the keys whose value isn't `undefined` (so `JSON.stringify` and the strict proxy schema agree). */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

/**
 * The `InsuranceDTO` (Story 5.2): uppercase enums, trimmed Member ID and
 * Group ID (a blank Group ID left out), dates as given (an empty optional one
 * left out; on a `PUT` the backend's full replace then clears it), the
 * insurer by id or by its trimmed name, and the subscriber only when the
 * relationship isn't Self.
 */
function insuranceBody(input: InsurancePolicyInput): InsuranceSaveBody {
  const groupId = input.groupId.trim()
  const subscriber = input.relationship !== INSURANCE_SELF && input.subscriber ? defined({ ...input.subscriber }) : undefined
  return defined({
    insuranceOrganizationDTO: "id" in input.insurer ? { insuranceCompanyId: input.insurer.id } : { insuranceCompanyName: input.insurer.name.trim() },
    insuranceType: input.type,
    insurancePrecedence: input.precedence,
    relationshipToInsured: input.relationship,
    memberIdNumber: input.memberId.trim(),
    insuranceGroupId: groupId === "" ? undefined : groupId,
    planEffectiveDate: input.effectiveDate,
    expirationDate: input.expirationDate === "" ? undefined : input.expirationDate,
    cancellationDate: input.cancellationDate === "" ? undefined : input.cancellationDate,
    subscriber,
  })
}

/** The body of a new policy's `POST`. */
export function insuranceCreateBody(input: InsurancePolicyInput): InsuranceSaveBody {
  return insuranceBody(input)
}

/**
 * The body of an edit's `PUT`: the whole record, as for a `POST`. An empty
 * optional field is left out, which the backend's full replace clears
 * (Group ID → `"n/a"`, Expiration / Cancellation → `1970-01-01`).
 */
export function insuranceUpdateBody(input: InsurancePolicyInput): InsuranceSaveBody {
  return insuranceBody(input)
}

/** Adds a policy (`POST v2/health/patient/insurance`). Never throws. */
export function saveInsuranceCreate(input: InsurancePolicyInput): Promise<ApiResponse<unknown>> {
  return callApi<unknown>("insurance/saveInsuranceCreate", insuranceCreatePath(), { method: "POST", body: JSON.stringify(insuranceCreateBody(input)) })
}

/**
 * Replaces a saved policy (`PUT v2/health/patient/insurance/{id}`). Never
 * throws: an id that isn't a positive integer has no path, which `callApi`
 * refuses without a request (`BAD_PATH`).
 */
export function saveInsuranceUpdate(insuranceId: number, input: InsurancePolicyInput): Promise<ApiResponse<unknown>> {
  return callApi<unknown>("insurance/saveInsuranceUpdate", insuranceUpdatePath(insuranceId) ?? "", { method: "PUT", body: JSON.stringify(insuranceUpdateBody(input)) })
}
