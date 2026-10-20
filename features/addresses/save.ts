import { isAddressRowChanged, isAddressRowRemoved, isAddressRowSent, type AddressEditRow } from "./schema"

/**
 * The pure parts of the Addresses save (Stories 4.2, 4.4): which rows are
 * written or deleted and in what order, and how the form rows are rebuilt
 * after a step fails so a Retry sends only what is left.
 */

/** `true` when the row's "Set as primary" is newly checked: a new row, or a saved row that wasn't the Primary. */
const isNewlyPrimary = (row: AddressEditRow, saved: AddressEditRow | undefined): boolean => row.primary && (row.isNew || saved?.primary !== true)

/**
 * The rows Save writes (`isAddressRowSent`: new rows, changed saved rows with
 * an id; never a removed row), in order: the row whose "Set as primary" is
 * newly checked first, then the others in table order (Story 4.4's order:
 * the backend unsets the old Primary when the new one is written, so the old
 * one is written after it, and only when another of its fields changed).
 * The deletes (`addressRowsToDelete`) come after all of these.
 */
export function addressRowsToSend(rows: readonly AddressEditRow[], saved: readonly AddressEditRow[]): AddressEditRow[] {
  const savedByKey = new Map(saved.map((row) => [row.key, row]))
  const sent = rows.filter((row) => isAddressRowSent(row, savedByKey.get(row.key)))
  const first = sent.filter((row) => isNewlyPrimary(row, savedByKey.get(row.key)))
  return [...first, ...sent.filter((row) => !first.includes(row))]
}

/** The rows Save deletes (Story 4.4), in table order, after every write: saved rows with an id that are struck through. */
export function addressRowsToDelete(rows: readonly AddressEditRow[]): AddressEditRow[] {
  return rows.filter((row) => !row.isNew && row.id !== null && isAddressRowRemoved(row))
}

/**
 * The fields a user edits (each merged on its own; `validated` follows a
 * suggestion pick or a manual edit, Story 4.3; `removed` a Remove or
 * Restore, Story 4.4).
 */
const EDITED_FIELDS = ["type", "country", "line1", "line2", "city", "county", "state", "zip", "primary", "validated", "removed"] as const

const sameValue = (a: string | boolean | undefined, b: string | boolean | undefined): boolean =>
  typeof a === "string" && typeof b === "string" ? a.trim() === b.trim() : Boolean(a) === Boolean(b)

/**
 * A saved row the save didn't write, three-way merged: each field the user
 * changed keeps the user's value, every other field takes the fresh one
 * (e.g. `primary: false` on the old Primary once another row became
 * Primary), so a Retry never re-sends what the server already holds.
 */
function mergeUnsent(row: AddressEditRow, before: AddressEditRow | undefined, fresh: AddressEditRow): AddressEditRow {
  if (!before || !isAddressRowChanged(row, before)) return fresh
  const merged: AddressEditRow = { ...fresh }
  for (const field of EDITED_FIELDS) {
    if (!sameValue(row[field], before[field])) (merged as Record<string, unknown>)[field] = row[field]
  }
  return merged
}

export interface MergeAddressRowsInput {
  /** The form rows that were saved (in table order). */
  readonly rows: readonly AddressEditRow[]
  /** The saved rows the save was diffed against. */
  readonly before: readonly AddressEditRow[]
  /** The saved rows just refetched. */
  readonly fresh: readonly AddressEditRow[]
  /** The keys of the rows whose request succeeded. */
  readonly succeeded: ReadonlySet<string>
  /** The ids the backend gave the new rows it created, by row key (`null` when its answer had none). */
  readonly created: ReadonlyMap<string, number | null>
  /** The keys of the removed rows whose DELETE succeeded (or found the address already gone), Story 4.4. */
  readonly deleted?: ReadonlySet<string>
}

/**
 * The form rows after a failed step (Stories 4.2, 4.4, `runSaveSteps`
 * `stop`), so Retry sends only what is left:
 * - a row whose request succeeded becomes its refetched row (a created one
 *   by its new id; one whose id is unknown is dropped and comes back as a
 *   refetched row);
 * - a removed row whose DELETE succeeded leaves the form;
 * - a saved row that wasn't sent becomes its refetched row, keeping the
 *   fields the user changed (`mergeUnsent`; an unsent removal stays struck
 *   through); one the refetch no longer has (removed elsewhere, decision
 *   2A) leaves the form, so Retry never sends it;
 * - a new row that wasn't created stays as typed;
 * - refetched rows the form doesn't hold yet are appended.
 */
export function mergeAddressRows({ rows, before, fresh, succeeded, created, deleted = new Set() }: MergeAddressRowsInput): AddressEditRow[] {
  const beforeByKey = new Map(before.map((row) => [row.key, row]))
  const freshByKey = new Map(fresh.map((row) => [row.key, row]))
  const merged = rows.flatMap((row): AddressEditRow[] => {
    if (row.isNew) {
      if (!succeeded.has(row.key)) return [row]
      const id = created.get(row.key) ?? null
      if (id === null) return []
      return [fresh.find((candidate) => candidate.id === id) ?? { ...row, key: `id-${id}`, id, isNew: false }]
    }
    const now = freshByKey.get(row.key)
    if (!now || deleted.has(row.key)) return []
    return [succeeded.has(row.key) ? now : mergeUnsent(row, beforeByKey.get(row.key), now)]
  })
  const held = new Set(merged.map((row) => row.key))
  return [...merged, ...fresh.filter((row) => !held.has(row.key) && !deleted.has(row.key))]
}
