import { mapApiError, mappedErrorCode, type ApiResponse, type ErrorScope, type MappedError } from "@/lib/api"
import { SESSION_EXPIRED_CODE, type SaveErrorCode } from "./nav-types"

/**
 * One request of a multi-request Section save (Stories 1.11, 7.5). Steps are
 * built from the diff against the Section's baseline, so after a rebase an
 * unchanged part is `skip`ped and a retry sends only what is left.
 */
export interface SaveStep<P extends string = string> {
  /** The part this step saves (e.g. `"details"`); reported in `failedParts`. */
  readonly part: P
  /** Nothing to send for this part: not run, never counted as failed. */
  readonly skip?: boolean
  /** Sends the request (through `callApi`); a throw counts as an `UNEXPECTED` failure. */
  readonly run: () => Promise<ApiResponse<unknown>>
}

export interface RunSaveStepsOptions<F, P extends string = string> {
  /** The error-mapping scope of the Section (`mapApiError(scope, …)`). */
  readonly scope: ErrorScope
  /**
   * `stop`: the first failure skips the later steps (AD-7). `attemptAll`:
   * every non-skipped step runs whatever the earlier results (the `/account`
   * Account settings exception). A session error stops either at once.
   */
  readonly mode: "stop" | "attemptAll"
  /** After a (non-session) failure: revalidates the Section's keys and resolves the fresh server data. */
  readonly refetch?: () => Promise<F>
  /** After `refetch`: resets the form baseline to the fresh data, keeping the user's remaining edits. */
  readonly rebase?: (fresh: F) => void
  /**
   * Without `refetch`: the baseline with the succeeded parts applied (e.g.
   * `{ ...baseline, ...savedFieldsOf(parts) }`), passed to `rebase`, so a
   * retry never re-sends a part that already succeeded.
   */
  readonly applySucceeded?: (succeeded: readonly P[]) => F
}

export interface SaveStepsError<P extends string> {
  readonly code: SaveErrorCode
  /** The first failure, mapped for the Section (field or Section-level error). */
  readonly mapped: MappedError
  /** The parts that weren't saved: failed ones and, in `stop` mode, the ones never run. */
  readonly failedParts: readonly P[]
}

export type SaveStepsResult<P extends string> =
  | { readonly ok: true; readonly succeeded: readonly P[] }
  | { readonly ok: false; readonly succeeded: readonly P[]; readonly error: SaveStepsError<P> }

interface StepFailure {
  readonly code: SaveErrorCode
  readonly mapped: MappedError
}

async function runStep(step: SaveStep, scope: ErrorScope): Promise<StepFailure | null> {
  try {
    const response = await step.run()
    if (response.success) return null
    const mapped = mapApiError(scope, response)
    return { code: mappedErrorCode(mapped), mapped }
  } catch {
    return { code: "UNEXPECTED", mapped: { kind: "generic" } }
  }
}

/**
 * Runs a Section's save steps in order and maps failures through
 * `mapApiError(scope, …)`. Never throws. After a non-session failure it
 * refetches and rebases (when given), so the next Save sends only the
 * remaining diff; a session failure stops at once with no refetch (the
 * session-expired dialog takes over).
 */
export async function runSaveSteps<P extends string, F = unknown>(
  steps: readonly SaveStep<P>[],
  { scope, mode, refetch, rebase, applySucceeded }: RunSaveStepsOptions<F, P>,
): Promise<SaveStepsResult<P>> {
  const pending = steps.filter((step) => !step.skip)
  const succeeded: P[] = []
  const failedParts: P[] = []
  let first: StepFailure | null = null

  for (const [index, step] of pending.entries()) {
    const failure = await runStep(step, scope)
    if (!failure) {
      succeeded.push(step.part)
      continue
    }
    first ??= failure
    failedParts.push(step.part)
    if (failure.code === SESSION_EXPIRED_CODE) {
      return { ok: false, succeeded, error: { ...failure, failedParts: [...failedParts, ...partsOf(pending.slice(index + 1))] } }
    }
    if (mode === "stop") {
      failedParts.push(...partsOf(pending.slice(index + 1)))
      break
    }
  }

  if (!first) return { ok: true, succeeded }
  if (refetch) await refresh(refetch, rebase)
  else if (applySucceeded && succeeded.length > 0) rebase?.(applySucceeded(succeeded))
  return { ok: false, succeeded, error: { ...first, failedParts } }
}

function partsOf<P extends string>(steps: readonly SaveStep<P>[]): P[] {
  return steps.map((step) => step.part)
}

/** A failing refetch leaves the baseline as it was; the save result is unchanged. */
async function refresh<F>(refetch: () => Promise<F>, rebase: ((fresh: F) => void) | undefined): Promise<void> {
  try {
    const fresh = await refetch()
    rebase?.(fresh)
  } catch {
    // The next Save recomputes its diff against the old baseline: at worst it re-sends a saved part.
  }
}
