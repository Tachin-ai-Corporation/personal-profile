import "server-only"

import { z } from "zod"
import type { AllowlistEntry } from "../types"
import { IMAGE_UPLOAD_MAX_BYTES } from "./core"

/** The two card relations (`InsuranceConstants`): a card file's `fileRelKey`, and its upload relation. */
const CARD_RELATIONS = ["InsuranceHasFrontSideCardFile", "InsuranceHasBackSideCardFile"] as const

/** The backend's enum constants a policy may be saved with (`InsuranceConstants`, `N_A` left out). */
export const INSURANCE_TYPES = ["MEDICAL", "DENTAL", "HOSPICE", "VISION", "DRUG"] as const
export const INSURANCE_PRECEDENCES = ["PRIMARY", "SECONDARY", "SUPPLEMENTAL", "OTHER"] as const
export const INSURANCE_RELATIONSHIPS = ["SELF", "SPOUSE", "PARENT", "CHILD", "DEPENDENT"] as const

/** A text field of the body (the backend trims and checks the lengths it cares about). */
const text = z.string().max(255)
/** A backend `LocalDate`: `YYYY-MM-DD` only (an empty optional date is left out, never `""`). */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** The insurer: a listed one by id, or a new one by its (trimmed, never blank) name. */
const insurerSchema = z.union([
  z.strictObject({ insuranceCompanyId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
  z.strictObject({ insuranceCompanyName: text.regex(/\S/) }),
])

/** The policyholder when the relationship isn't Self (backend `SubscriberDTO`, the fields the editor sends). */
const subscriberSchema = z.strictObject({
  firstName: text,
  lastName: text,
  email: text,
  phoneNumber: text.optional(),
  phoneNumberRegion: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  birthDate: date.optional(),
})

/**
 * A backend `InsuranceDTO` (Story 5.2) as the editor sends it on `POST` and
 * on `PUT`. A `PUT` replaces the whole record: an empty optional field is
 * left out, which the backend's full replace clears (Group ID → "n/a",
 * dates → 1970-01-01). Strict: anything else (an id, a label, the card files,
 * `N_A`) is 400 `BAD_BODY`.
 */
export const insuranceBodySchema = z.strictObject({
  insuranceOrganizationDTO: insurerSchema,
  insuranceType: z.enum(INSURANCE_TYPES),
  insurancePrecedence: z.enum(INSURANCE_PRECEDENCES),
  relationshipToInsured: z.enum(INSURANCE_RELATIONSHIPS),
  memberIdNumber: text,
  insuranceGroupId: text.optional(),
  planEffectiveDate: date,
  expirationDate: date.optional(),
  cancellationDate: date.optional(),
  subscriber: subscriberSchema.optional(),
})

/** A policy body is a few hundred bytes; 16 KiB is ample. */
const POLICY_MAX_BYTES = 16 * 1024

/** Insurance card image upload (Story 5.3): private, one `file` part, PNG/JPEG bytes, 4 MB, no client query. */
const cardUpload = (relation: string): AllowlistEntry => ({
  method: "POST",
  template: `v2/health/type/Insurance/{insuranceId}/relation/${relation}/file/upload`,
  fixedQuery: { isPublic: "false" },
  upload: { part: "file", types: ["png", "jpeg"] },
  maxBytes: IMAGE_UPLOAD_MAX_BYTES,
})

/** Insurance (Epic 5) entries; each lands with the story that calls it (card uploads: F2 for Story 5.3). */
export const entries: readonly AllowlistEntry[] = [
  ...CARD_RELATIONS.map(cardUpload),
  /** Insurance value lists (Story 5.2: type, precedence, relationship), read by the shared `type-key` loader (spec F6-3). */
  { method: "GET", template: "v2/type/key/Insurance" },
  /**
   * The caller's policies (Story 5.1, `keys.insurance()`): a Spring Page of
   * `ResponseInsuranceDTO`. The client always asks for one page of 100, so
   * the query is exactly `page=0&size=100` (both required); anything else is
   * 400 `BAD_QUERY`.
   */
  {
    method: "GET",
    template: "v2/health/patient/insurance",
    query: { page: { pattern: /^0$/, required: true }, size: { pattern: /^100$/, required: true } },
  },
  /**
   * A card image of one of the caller's policies (Story 5.1 thumbnails and
   * viewer, AD-13): numeric policy and file ids, `fileRelKey` (required) one
   * of the two card relations and nothing else. `asImage`: `preview=true` is
   * forced (the backend ignores it) and only PNG/JPEG/BMP leading bytes are
   * served `inline`.
   */
  {
    method: "GET",
    template: "v2/health/insurance/{insuranceId}/file/{fileId}/download",
    asImage: true,
    query: { fileRelKey: { pattern: new RegExp(`^(${CARD_RELATIONS.join("|")})$`), required: true } },
  },
  /**
   * The insurer search (Story 5.2, the editor's Combobox `load`; never SWR):
   * a backend `PageImpl` (`{ data: [{ id, name }], lastPage }`). `name` is the
   * typed text (1–100 characters), `page` 0–9999, `size` the editor's 20.
   */
  {
    method: "GET",
    template: "v2/health/insurance/organizations",
    query: {
      name: { pattern: /^[^\p{Cc}]{1,100}$/u, required: true },
      page: { pattern: /^(0|[1-9]\d{0,3})$/, required: true },
      size: { pattern: /^20$/, required: true },
    },
  },
  /** Add a policy (Story 5.2): a full `InsuranceDTO`, JSON only. */
  { method: "POST", template: "v2/health/patient/insurance", body: insuranceBodySchema, maxBytes: POLICY_MAX_BYTES },
  /** Edit a policy (Story 5.2): the whole record again (numeric id; empty optionals left out, which clears them), JSON only. */
  { method: "PUT", template: "v2/health/patient/insurance/{insuranceId}", body: insuranceBodySchema, maxBytes: POLICY_MAX_BYTES },
]
