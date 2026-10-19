/**
 * Contact Point writes (Team A, Epic 3: Stories 3.1–3.7): the Contact Point
 * write engine shared by the Phone, Email and Social media Sections. Pre-created
 * by spec F7-2 so Epic 3 adds code here without editing `lib/api/index.ts`
 * (re-exported with `export *`); its tests go in `contacts.test.ts`.
 *
 * Reads stay in `contact-points.ts` (`fetchContactPoints`, `keys.contactPoints`,
 * shared with the header and the `/account` pickers): never re-map a row
 * here. After a write, revalidate with `mutateContactPoints(...types)` and
 * `mutateMyself()` (`keys.ts`).
 *
 * Endpoints (backend `ContactPointResource`; each allowlist entry lands with
 * its story in `lib/server/proxy/allowlist/contacts.ts`): every write — add,
 * relabel, remove, notifications and the Primary switch — goes through one
 * `POST v2/health/contact-point` with a `ContactPointManageDTO` (Story 3.2),
 * and verification through `POST v2/health/contact-point/verify` (Story 3.3).
 * There are no separate create, update, delete, make-primary or notification
 * calls.
 *
 * Story 3.1 builds the pure engine: `contactPointsDiffToManageDTO` (the one
 * manage body from a Section's saved rows and its edited rows) and
 * `newUnverifiedContactPoints` (what to verify after a save). Story 3.2 adds
 * the manage call itself: `contactPointManagePath` and `saveContactPoints`.
 * Story 3.3 adds verification: `contactPointVerifyPath`, `verifyContactPoints`
 * (one call) and `sendContactVerification` (chunks, outcome per id).
 * Story 3.7 adds the engine's replace mode for Social media links
 * (`ContactPointsDiffOptions`).
 *
 * Export names carry the `contact` prefix: FOUNDATION.md §1, rule T6.
 */

import { CONTACT_LABEL_HOME, CONTACT_LABEL_OLD, CONTACT_PHONE_TYPES } from "@/lib/shared/contact-labels"
import { normalizeRegion } from "@/lib/shared/phone"
import type { TelemetryErrorCode } from "@/lib/shared/telemetry"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { PRIMARY_LABEL, type ContactPoint } from "./contact-points"
import { mapApiError, mappedErrorCode, type ErrorScope, type MappedError } from "./errors"
import type { ApiResponse } from "./types"

/** A row of a Section's edit view: a saved row (with its `id`), a new row (`id: null`), or a saved row struck through for removal. */
export type ContactPointEditRow = ContactPoint & { readonly removed?: true }

/** One `contactPointsToAdd` entry (backend `ContactPointToAddDTO`). */
export interface ContactPointAddDTO {
  readonly value: string
  readonly type: string
  readonly label: string
  readonly isNotificationEnabled: boolean
  /** Phones only (`Mobile`, `Landline`): the lower-case ISO region. */
  readonly phoneNumberRegion?: string
}

/** One `contactPointsToUpdate` entry (backend `ContactPointToUpdateDTO`): the backend needs `type` and `label`, and ignores `value`. */
export interface ContactPointUpdateDTO {
  readonly id: number
  readonly type: string
  readonly label: string
  readonly isNotificationEnabled: boolean
}

/**
 * The body of `POST v2/health/contact-point` (backend `ManageContactPointDTO`):
 * always all three lists, empty ones included (Story 3.2: the backend's
 * `validateContactPointsTypeSwap` iterates `contactPointsToUpdate` without a
 * null guard, so a body without it is a 500).
 */
export interface ContactPointManageDTO {
  readonly contactPointsToAdd: readonly ContactPointAddDTO[]
  readonly contactPointsToUpdate: readonly ContactPointUpdateDTO[]
  readonly contactPointsToRemove: readonly number[]
}

const PHONE_TYPES: ReadonlySet<string> = new Set(CONTACT_PHONE_TYPES)

/** The types whose saved value never changes, replace mode included (Phone, Email; a row with no type counts as Mobile). */
const LOCKED_VALUE_TYPES: ReadonlySet<string> = new Set(["Mobile", "Landline", "Email"])

/** The new-and-unverified types that get a verification link (Stories 3.3, 3.6). */
const VERIFIABLE_TYPES: ReadonlySet<string> = new Set(["Mobile", "Email"])

/**
 * The types whose saved Primary can't be removed or relabelled away without
 * another row of the type becoming Primary in the same body (the backend
 * rejects it; legacy Landline and Social Media Primaries are out of scope).
 */
const PRIMARY_REQUIRED_TYPES: ReadonlySet<string> = new Set(["Mobile", "Email"])

/** How `contactPointsDiffToManageDTO` treats a saved row whose `value` changed. */
export interface ContactPointsDiffOptions {
  /**
   * `"locked"` (the default; Phone and Email): a changed value is a caller
   * bug and throws. `"replace"` (Story 3.7, Social media only): it is sent as
   * a remove of the saved id plus an add of the new value, in one body; a
   * Mobile, Landline or Email value still throws.
   */
  readonly valueChange?: "locked" | "replace"
}

/** A caller bug (a Section offered something the backend rejects): never shown to the user. */
function programmerError(message: string): Error {
  return new Error(`contactPointsDiffToManageDTO: ${message}`)
}

function required(row: ContactPoint, field: "value" | "type" | "label"): string {
  const value = row[field]
  if (value === null || value.trim() === "") throw programmerError(`row ${row.id ?? "(new)"} has no ${field}`)
  return value
}

const notificationsOn = (row: ContactPoint): boolean => row.isNotificationEnabled === true

function toAdd(row: ContactPoint): ContactPointAddDTO {
  const type = required(row, "type")
  const label = required(row, "label")
  if (label === PRIMARY_LABEL) throw programmerError("a new row can't be Primary")
  const add: ContactPointAddDTO = { value: required(row, "value"), type, label, isNotificationEnabled: notificationsOn(row) }
  return PHONE_TYPES.has(type) && row.phoneNumberRegion ? { ...add, phoneNumberRegion: normalizeRegion(row.phoneNumberRegion) } : add
}

function toUpdate(row: ContactPoint, id: number): ContactPointUpdateDTO {
  return { id, type: required(row, "type"), label: required(row, "label"), isNotificationEnabled: notificationsOn(row) }
}

/**
 * The one manage body that turns `before` (the saved rows, as read) into
 * `after` (the Section's edited rows), or `null` when nothing changed. The
 * body always holds all three lists, empty ones included (Story 3.2):
 *
 * - a row without an `id` → `contactPointsToAdd` (`phoneNumberRegion`,
 *   lower-case, for phones only);
 * - a saved id missing from `after`, or marked `removed` →
 *   `contactPointsToRemove`;
 * - a saved row whose `label` or `isNotificationEnabled` changed →
 *   `contactPointsToUpdate`; unchanged rows are never sent.
 *
 * Primary switch (AD-9): a saved row newly labelled Primary is sent with
 * notifications on, and the type's old Primary, when `after` leaves it
 * labelled Primary, is relabelled "Old" (its other fields as in `after`), in
 * the same body.
 *
 * Replace mode (Story 3.7, Social media only: `options.valueChange:
 * "replace"`): a saved row whose `value` changed (same type) is sent as a
 * remove of its id plus an add of its new value (with its `label` and
 * notifications as in `after`), in the same body; the backend deletes before
 * it creates, so the same value can come back in one request.
 *
 * Throws a programmer error (a Section bug, never shown) when a saved row's
 * `type` changed, when its `value` changed outside replace mode or is a
 * Mobile, Landline or Email value (Phone and Email values are locked), when an id repeats in `before` or in `after`, when an `after` id
 * isn't in `before`, when a sent row has no value, type or label (blank
 * counts as none), when the body would hold a Primary in `contactPointsToAdd`
 * or two Primary rows of one type, and when the saved Mobile or Email Primary
 * is removed or relabelled with no other row of its type made Primary (the
 * backend rejects each).
 */
export function contactPointsDiffToManageDTO(
  before: readonly ContactPoint[],
  after: readonly ContactPointEditRow[],
  options: ContactPointsDiffOptions = {},
): ContactPointManageDTO | null {
  const saved = new Map<number, ContactPoint>()
  for (const row of before) {
    if (row.id === null) continue
    if (saved.has(row.id)) throw programmerError(`saved row ${row.id} is listed twice`)
    saved.set(row.id, row)
  }

  const added: ContactPointAddDTO[] = []
  /** The saved rows `after` keeps, with their saved state. */
  const kept = new Map<number, { readonly row: ContactPointEditRow; readonly was: ContactPoint }>()
  const seen = new Set<number>()
  for (const row of after) {
    if (row.id === null) {
      // A new row struck through is simply not added.
      if (!row.removed) added.push(toAdd(row))
      continue
    }
    const was = saved.get(row.id)
    if (seen.has(row.id)) throw programmerError(`row ${row.id} is listed twice`)
    seen.add(row.id)
    if (!was) throw programmerError(`row ${row.id} is not a saved row`)
    if (row.type !== was.type || (row.value !== was.value && (options.valueChange !== "replace" || LOCKED_VALUE_TYPES.has(was.type ?? "Mobile")))) {
      throw programmerError(`the value or type of saved row ${row.id} changed`)
    }
    if (row.removed) continue
    // Replace mode: the saved id goes (it isn't kept), and the new value comes in as an add.
    if (row.value !== was.value) added.push(toAdd(row))
    else kept.set(row.id, { row, was })
  }
  const toRemove = [...saved.keys()].filter((id) => !kept.has(id))

  const becomesPrimary = (row: ContactPoint, was: ContactPoint): boolean => row.label === PRIMARY_LABEL && was.label !== PRIMARY_LABEL
  // The Primary switch: the types that get a new Primary, whose old Primary is relabelled Old.
  const switchedTypes = new Set([...kept.values()].filter(({ row, was }) => becomesPrimary(row, was)).map(({ row }) => row.type))

  const updated: ContactPointUpdateDTO[] = []
  /** The types that hold a Primary once the body is applied. */
  const primaryAfter = new Set<string | null>()
  for (const [id, { row, was }] of kept) {
    let next: ContactPoint = row
    if (becomesPrimary(row, was)) next = { ...row, isNotificationEnabled: true }
    else if (row.label === PRIMARY_LABEL && switchedTypes.has(row.type)) next = { ...row, label: CONTACT_LABEL_OLD }
    if (next.label === PRIMARY_LABEL) primaryAfter.add(next.type)
    if (next.label !== was.label || notificationsOn(next) !== notificationsOn(was)) updated.push(toUpdate(next, id))
  }
  for (const was of saved.values()) {
    if (was.label === PRIMARY_LABEL && PRIMARY_REQUIRED_TYPES.has(was.type ?? "") && !primaryAfter.has(was.type)) {
      throw programmerError(`the ${was.type} Primary ${was.id} needs another ${was.type} made Primary in the same body`)
    }
  }

  const primaryTypes = updated.filter((row) => row.label === PRIMARY_LABEL).map((row) => row.type)
  if (new Set(primaryTypes).size !== primaryTypes.length) throw programmerError("two rows of one type would be Primary")

  if (added.length === 0 && updated.length === 0 && toRemove.length === 0) return null
  return { contactPointsToAdd: added, contactPointsToUpdate: updated, contactPointsToRemove: toRemove }
}

/**
 * The rows to send a verification link after a save (Stories 3.3, 3.6): the
 * ids in `after` (the refetched rows) that `before` (the rows before the
 * save) didn't hold, still unverified (`isVerified === false`), of type
 * Mobile or Email (a row with no type counts as Mobile, as in the Mobile
 * list, `primaryPhoneRegion`), and not labelled Home. Landline and Social Media rows are
 * never verified.
 */
export function newUnverifiedContactPoints(before: readonly ContactPoint[], after: readonly ContactPoint[]): number[] {
  const known = new Set(before.map((row) => row.id))
  return after.flatMap((row) =>
    row.id !== null && !known.has(row.id) && row.isVerified === false && VERIFIABLE_TYPES.has(row.type ?? "Mobile") && row.label !== CONTACT_LABEL_HOME ? [row.id] : [],
  )
}

/** `POST /api/1h/v2/health/contact-point` (Story 3.2: entry in `allowlist/contacts.ts`): the one manage call. */
export function contactPointManagePath(): string {
  return proxyPath("v2/health/contact-point")
}

/**
 * A manage call's outcome, shaped like the Section's `SaveResult`: ok, or the
 * mapped failure (`code` for `section_save` telemetry, `mapped` for what the
 * Section shows).
 */
export type ContactPointSaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly code: TelemetryErrorCode; readonly mapped: MappedError } }

/**
 * Story 3.2 (FR16): sends `dto` (from `contactPointsDiffToManageDTO`, all
 * three lists) in exactly one `POST /api/1h/v2/health/contact-point`. The
 * backend answers 200 with no body, so any 2xx is a success (even one whose
 * body can't be read). A failure is mapped with `mapApiError(scope, …)`
 * (`phone` by default; the contacts table names the field). Never throws and
 * revalidates nothing: the caller mutates its Contact Point keys and `myself`.
 */
export async function saveContactPoints(dto: ContactPointManageDTO, scope: ErrorScope = "phone"): Promise<ContactPointSaveResult> {
  const res = await callApi<unknown>("contacts/saveContactPoints", contactPointManagePath(), { method: "POST", body: JSON.stringify(dto) })
  if (res.success || (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300)) return { ok: true }
  const mapped = mapApiError(scope, res)
  return { ok: false, error: { code: mappedErrorCode(mapped), mapped } }
}

/** Ids per verify request: the backend's limit (Story 3.3). Larger sets go in chunks of this size. */
export const CONTACT_VERIFY_MAX_IDS = 10

/** `POST /api/1h/v2/health/contact-point/verify` (Story 3.3: entry in `allowlist/contacts.ts`): sends verification links. */
export function contactPointVerifyPath(): string {
  return proxyPath("v2/health/contact-point/verify")
}

/**
 * The verify answer (backend `RequestCPVerificationResponse`): `success`
 * false when a link couldn't be sent, with the ids it couldn't send (the
 * backend reports only the last one; `deferred-work.md`).
 */
export interface ContactVerifyAnswer {
  readonly success: boolean
  readonly contactPointIdsWithSendError: readonly number[]
}

/**
 * Story 3.3 (FR17): one `POST /api/1h/v2/health/contact-point/verify` with
 * `{ contactPointIds: ids }` (at most `CONTACT_VERIFY_MAX_IDS`, unique: the
 * proxy refuses anything else). An empty list sends nothing and resolves a
 * success with no send errors. Never throws.
 */
export async function verifyContactPoints(ids: readonly number[]): Promise<ApiResponse<ContactVerifyAnswer>> {
  if (ids.length === 0) return { success: true, data: { success: true, contactPointIdsWithSendError: [] } }
  return callApi<ContactVerifyAnswer>("contacts/verifyContactPoints", contactPointVerifyPath(), { method: "POST", body: JSON.stringify({ contactPointIds: ids }) })
}

/**
 * What `sendContactVerification` did, per id: `sent` (a link went out),
 * `failed` (it couldn't be sent: listed in `contactPointIdsWithSendError`, or
 * its request failed), `cooldown` (the backend refused a resend within its
 * cooldown); `network` when a request couldn't get through (its ids are in
 * `failed`), `session` when the session ended (left to the shell; its ids
 * and any later ones are in no list).
 */
export interface ContactVerifyOutcome {
  readonly sent: readonly number[]
  readonly failed: readonly number[]
  readonly cooldown: readonly number[]
  readonly network: boolean
  readonly session: boolean
}

/** The send errors of a 2xx verify answer (none when the body can't be read). */
function sendErrorsOf(answer: ContactVerifyAnswer | undefined): ReadonlySet<number> {
  const listed: unknown = answer?.contactPointIdsWithSendError
  return new Set(Array.isArray(listed) ? listed.filter((id): id is number => typeof id === "number") : [])
}

/**
 * Story 3.3 (Story 3.6 for emails): sends verification links to `ids`,
 * de-duplicated, in chunks of at most `CONTACT_VERIFY_MAX_IDS` (one call for
 * ten or fewer), one after another. A failed chunk is mapped with
 * `mapApiError(scope, …)`: the cooldown rule puts its ids in `cooldown`, a
 * network failure sets `network` and a session end sets `session` (no later
 * chunk is sent); any other failure puts its ids in `failed`. Never throws.
 */
export async function sendContactVerification(ids: readonly number[], scope: ErrorScope = "phone"): Promise<ContactVerifyOutcome> {
  const unique = [...new Set(ids)]
  const sent: number[] = []
  const failed: number[] = []
  const cooldown: number[] = []
  let network = false
  for (let start = 0; start < unique.length; start += CONTACT_VERIFY_MAX_IDS) {
    const chunk = unique.slice(start, start + CONTACT_VERIFY_MAX_IDS)
    const res = await verifyContactPoints(chunk)
    if (res.success || (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300)) {
      const errors = sendErrorsOf(res.data)
      for (const id of chunk) (errors.has(id) ? failed : sent).push(id)
      continue
    }
    const mapped = mapApiError(scope, res)
    if (mapped.kind === "session") return { sent, failed, cooldown, network, session: true }
    if (mapped.kind === "field" && mapped.field === "verify") {
      cooldown.push(...chunk)
      continue
    }
    if (mapped.kind === "network") network = true
    failed.push(...chunk)
  }
  return { sent, failed, cooldown, network, session: false }
}
