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
 * `newUnverifiedContactPoints` (what to verify after a save).
 *
 * Export names carry the `contact` prefix: FOUNDATION.md §1, rule T6.
 */

import { CONTACT_LABEL_HOME, CONTACT_LABEL_OLD, CONTACT_PHONE_TYPES } from "@/lib/shared/contact-labels"
import { normalizeRegion } from "@/lib/shared/phone"
import { PRIMARY_LABEL, type ContactPoint } from "./contact-points"

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

/** The body of `POST v2/health/contact-point` (backend `ManageContactPointDTO`); an empty list is left out. */
export interface ContactPointManageDTO {
  readonly contactPointsToAdd?: readonly ContactPointAddDTO[]
  readonly contactPointsToUpdate?: readonly ContactPointUpdateDTO[]
  readonly contactPointsToRemove?: readonly number[]
}

const PHONE_TYPES: ReadonlySet<string> = new Set(CONTACT_PHONE_TYPES)

/** The new-and-unverified types that get a verification link (Stories 3.3, 3.6). */
const VERIFIABLE_TYPES: ReadonlySet<string> = new Set(["Mobile", "Email"])

/**
 * The types whose saved Primary can't be removed or relabelled away without
 * another row of the type becoming Primary in the same body (the backend
 * rejects it; legacy Landline and Social Media Primaries are out of scope).
 */
const PRIMARY_REQUIRED_TYPES: ReadonlySet<string> = new Set(["Mobile", "Email"])

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
 * `after` (the Section's edited rows), or `null` when nothing changed:
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
 * Throws a programmer error (a Section bug, never shown) when a saved row's
 * `value` or `type` changed (saved values are locked; Story 3.7 adds Social's
 * replace), when an id repeats in `before` or in `after`, when an `after` id
 * isn't in `before`, when a sent row has no value, type or label (blank
 * counts as none), when the body would hold a Primary in `contactPointsToAdd`
 * or two Primary rows of one type, and when the saved Mobile or Email Primary
 * is removed or relabelled with no other row of its type made Primary (the
 * backend rejects each).
 */
export function contactPointsDiffToManageDTO(before: readonly ContactPoint[], after: readonly ContactPointEditRow[]): ContactPointManageDTO | null {
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
    if (row.value !== was.value || row.type !== was.type) throw programmerError(`the value or type of saved row ${row.id} changed`)
    if (!row.removed) kept.set(row.id, { row, was })
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
  return {
    ...(added.length > 0 ? { contactPointsToAdd: added } : {}),
    ...(updated.length > 0 ? { contactPointsToUpdate: updated } : {}),
    ...(toRemove.length > 0 ? { contactPointsToRemove: toRemove } : {}),
  }
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
