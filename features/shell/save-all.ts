import { formatMessage, SECTION_MESSAGES } from "@/lib/shared/messages"
import { telemetry } from "@/lib/shared/telemetry"
import { isCancelled, isSessionExpired, type SectionId } from "./nav-types"
import type { RegisteredSection, SectionRegistry } from "./section-registry"

export interface SaveAllOptions {
  /**
   * The save order by id (Team A's `SAVE_ORDER` on `/`); Sections it doesn't
   * list follow in `displayOrder`. Defaults to `displayOrder`.
   */
  readonly order?: readonly SectionId[]
  /**
   * The leave guard (Story 1.13): also validate the dirty guard-only
   * participants (`saveAll: false`) up front, and save them after the
   * Save-all Sections.
   */
  readonly includeGuardOnly?: boolean
  /** Fires `save_all` telemetry (default `true`); the leave guard's Save passes `false`: it isn't a Save-all run. */
  readonly trackTelemetry?: boolean
}

export interface SectionRef {
  readonly id: SectionId
  readonly label: string
}

export interface InvalidSection extends SectionRef {
  readonly invalidCount: number
}

export type SaveAllOutcome =
  /** Nothing dirty: nothing validated or sent. */
  | { readonly kind: "clean" }
  /** At least one dirty Section is invalid: nothing sent. `invalid` is in page (`displayOrder`) order. */
  | { readonly kind: "invalid"; readonly invalid: readonly InvalidSection[]; readonly focusFirstInvalid: () => void }
  /** A save hit `SESSION_EXPIRED`: the run stopped there (no summary; the session dialog takes over). */
  | { readonly kind: "session"; readonly saved: readonly SectionRef[]; readonly failed: readonly SectionRef[]; readonly cancelled: readonly SectionRef[] }
  /**
   * Every dirty Section was attempted. `cancelled`: the user declined a step
   * of that Section's save (`CANCELLED`, F6-1): not saved, but not a failure.
   */
  | { readonly kind: "done"; readonly saved: readonly SectionRef[]; readonly failed: readonly SectionRef[]; readonly cancelled: readonly SectionRef[] }

const ref = ({ id, label }: RegisteredSection): SectionRef => ({ id, label })

function inSaveOrder(sections: readonly RegisteredSection[], order: readonly SectionId[]): RegisteredSection[] {
  const rank = (section: RegisteredSection): number => {
    const index = order.indexOf(section.id)
    return index === -1 ? order.length : index
  }
  // `sections` is already in displayOrder and the sort is stable, so unlisted Sections keep it.
  return sections.toSorted((a, b) => rank(a) - rank(b))
}

/**
 * The Save-all runner (Stories 1.13, 1.14; AD-8). Validates every dirty
 * participant first and sends nothing if any is invalid; then saves the
 * dirty Save-all Sections one at a time in `order` (each awaited fully),
 * continuing after ordinary failures and stopping at once on
 * `SESSION_EXPIRED`. Sections don't toast from here (only their own Save
 * does). `save_all` telemetry fires once when anything was sent (unless
 * `trackTelemetry: false`). Participants without `save` are never queued.
 */
export async function runSaveAll(
  registry: SectionRegistry,
  { order = [], includeGuardOnly = false, trackTelemetry = true }: SaveAllOptions = {},
): Promise<SaveAllOutcome> {
  const dirty = registry.getDirty().filter((section) => section.saveAll || includeGuardOnly)
  if (dirty.length === 0) return { kind: "clean" }

  const invalid: InvalidSection[] = []
  let focusFirstInvalid: (() => void) | null = null
  for (const section of dirty) {
    const result = await section.validate()
    if (result.valid) continue
    invalid.push({ ...ref(section), invalidCount: result.invalidCount })
    focusFirstInvalid ??= result.focusFirstInvalid
  }
  if (focusFirstInvalid) return { kind: "invalid", invalid, focusFirstInvalid }

  const queue = [
    ...inSaveOrder(
      dirty.filter((section) => section.saveAll),
      order,
    ),
    ...dirty.filter((section) => !section.saveAll && section.canSave),
  ]
  const saved: SectionRef[] = []
  const failed: SectionRef[] = []
  const cancelled: SectionRef[] = []
  let sessionEnded = false
  for (const section of queue) {
    const result = await section.save()
    if (result.ok) {
      saved.push(ref(section))
      continue
    }
    if (isCancelled(result)) {
      cancelled.push(ref(section))
      continue
    }
    failed.push(ref(section))
    if (isSessionExpired(result)) {
      sessionEnded = true
      break
    }
  }
  // `failed` excludes cancels (a user's choice, not a failure).
  if (trackTelemetry && queue.length > 0) telemetry.track("save_all", { saved: saved.length, failed: failed.length })
  return { kind: sessionEnded ? "session" : "done", saved, failed, cancelled }
}

export type SaveAllSummary =
  /** The one toast of a run: `success` (check icon) or `partial` (warning alert icon). */
  | { readonly tone: "success" | "partial"; readonly text: string }
  /** The Save all bar's sub-line: one line per invalid Section, in page order. */
  | { readonly tone: "invalid"; readonly lines: readonly string[] }

/**
 * The copy for a run's outcome (Story 1.14): "{Section} saved." for one,
 * "All saved." for several (only when nothing failed), "{S} saved, {F}
 * failed" otherwise, "{Section} has 1 field to fix" / "… {n} fields to fix"
 * when invalid. `null` when nothing is shown (clean, or the session ended).
 */
export function saveAllSummary(outcome: SaveAllOutcome): SaveAllSummary | null {
  switch (outcome.kind) {
    case "clean":
    case "session":
      return null
    case "invalid":
      return {
        tone: "invalid",
        lines: outcome.invalid.map(({ label, invalidCount }) =>
          invalidCount === 1
            ? formatMessage(SECTION_MESSAGES.invalidOne, { section: label })
            : formatMessage(SECTION_MESSAGES.invalidMany, { section: label, count: invalidCount }),
        ),
      }
    case "done": {
      const { saved, failed, cancelled } = outcome
      if (failed.length > 0) {
        return { tone: "partial", text: formatMessage(SECTION_MESSAGES.partialSaved, { saved: saved.length, failed: failed.length }) }
      }
      // A cancel is the user's choice: never "failed" copy; only what was saved, or nothing.
      if (saved.length === 0) return null
      if (saved.length === 1) return { tone: "success", text: formatMessage(SECTION_MESSAGES.saved, { section: saved[0].label }) }
      return {
        tone: "success",
        text: cancelled.length > 0 ? formatMessage(SECTION_MESSAGES.savedCount, { saved: saved.length }) : SECTION_MESSAGES.allSaved,
      }
    }
  }
}
