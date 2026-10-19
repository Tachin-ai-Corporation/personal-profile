import "server-only"

import { z } from "zod"
import { CONTACT_LABELS } from "@/lib/shared/contact-labels"
import type { AllowlistEntry } from "../types"

/** The backend `ContactPointType` literals a Section may write (never `Fax`, `Home`, `Work` or `Other`). */
export const CONTACT_POINT_MANAGE_TYPES = ["Email", "Mobile", "Landline", "Social Media"] as const

/** Rows per list a manage body may hold (the backend allows 20 per type, so 100 is never a real limit). */
export const CONTACT_POINT_MANAGE_MAX_ROWS = 100

/** A JSON body cap of 64 KB (100 rows of 2 KB values fit). */
export const CONTACT_POINT_MANAGE_MAX_BYTES = 64 * 1024

const type = z.enum(CONTACT_POINT_MANAGE_TYPES)
/** The backend `ContactPointLabel` names without "Partnership Organization" (`CONTACT_LABELS`). */
const label = z.enum(CONTACT_LABELS)
const id = z.number().int().positive()

/**
 * The body of `POST v2/health/contact-point` (backend `ManageContactPointDTO`,
 * Story 3.2): all three lists, each an array (empty ones included: the
 * backend's `validateContactPointsTypeSwap` iterates `contactPointsToUpdate`
 * without a null guard). Strict at every level: anything else is 400
 * `BAD_BODY`. A phone region is the lower-case ISO code. Also refused, as
 * the backend would: an empty request (all three lists empty), an id twice in
 * `contactPointsToUpdate` or in `contactPointsToRemove`, an id both updated
 * and removed, and a Primary Email or Mobile in `contactPointsToAdd`
 * (`CREATION_OF_PRIMARY_CONTACT_POINT_FROM_TYPES_IS_NOT_ALLOWED_ERROR`).
 */
export const contactPointManageBodySchema = z
  .strictObject({
  contactPointsToAdd: z
    .array(
      z.strictObject({
        value: z.string().min(1).max(2048),
        type,
        label,
        isNotificationEnabled: z.boolean().optional(),
        phoneNumberRegion: z
          .string()
          .regex(/^[a-z]{2}$/)
          .optional(),
      }),
    )
    .max(CONTACT_POINT_MANAGE_MAX_ROWS),
  contactPointsToUpdate: z
    .array(z.strictObject({ id, type, label, isNotificationEnabled: z.boolean().optional() }))
    .max(CONTACT_POINT_MANAGE_MAX_ROWS),
  contactPointsToRemove: z.array(id).max(CONTACT_POINT_MANAGE_MAX_ROWS),
  })
  .superRefine(({ contactPointsToAdd: add, contactPointsToUpdate: update, contactPointsToRemove: remove }, context) => {
    const refuse = (message: string) => context.addIssue({ code: "custom", message })
    const updated = update.map((row) => row.id)
    if (add.length + updated.length + remove.length === 0) refuse("empty request")
    if (new Set(updated).size !== updated.length) refuse("an id is updated twice")
    if (new Set(remove).size !== remove.length) refuse("an id is removed twice")
    if (updated.some((rowId) => remove.includes(rowId))) refuse("an id is updated and removed")
    if (add.some((row) => row.label === "Primary" && (row.type === "Email" || row.type === "Mobile"))) refuse("a Primary Email or Mobile in an add")
  })

/** Ids per verify request: the backend's limit (Story 3.3; the client sends larger sets in chunks of this size). */
export const CONTACT_POINT_VERIFY_MAX_IDS = 10

/** A JSON body cap of 1 KB (ten 16-digit ids, the most a safe-integer id has, fit). */
export const CONTACT_POINT_VERIFY_MAX_BYTES = 1024

/**
 * The body of `POST v2/health/contact-point/verify` (backend
 * `RequestCPVerificationDTO`, Story 3.3): `contactPointIds`, 1 to 10 unique
 * positive integer ids. Strict: anything else is 400 `BAD_BODY`.
 */
export const contactPointVerifyBodySchema = z.strictObject({
  contactPointIds: z
    .array(id)
    .min(1)
    .max(CONTACT_POINT_VERIFY_MAX_IDS)
    .refine((ids) => new Set(ids).size === ids.length, { message: "an id is listed twice" }),
})

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
  /** Contact Label values (Story 3.1), read by the shared `type-key` loader (spec F6-3). */
  { method: "GET", template: "v2/type/key/ContactPoint" },
  /**
   * The one Contact Point manage call (Story 3.2): adds, relabels and removes
   * the caller's rows and switches the Primary. No query (400 `BAD_QUERY`),
   * JSON only (415 `UNSUPPORTED_MEDIA`), nothing forced; it answers 200 with
   * no body (new ids come from the refetch).
   */
  { method: "POST", template: "v2/health/contact-point", body: contactPointManageBodySchema, maxBytes: CONTACT_POINT_MANAGE_MAX_BYTES },
  /**
   * Sends a verification link to the caller's own Contact Points (Story 3.3;
   * Story 3.6 for emails). No query (400 `BAD_QUERY`), JSON only (415
   * `UNSUPPORTED_MEDIA`), nothing forced; it answers `{ success,
   * contactPointIdsWithSendError }`.
   */
  { method: "POST", template: "v2/health/contact-point/verify", body: contactPointVerifyBodySchema, maxBytes: CONTACT_POINT_VERIFY_MAX_BYTES },
]
