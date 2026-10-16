import { reencodeImage } from "@/components/ui/image-reencode"
import { runSaveSteps, type SaveResult, type SaveStep } from "@/features/shell"
import {
  deleteSignatureFile,
  fetchMyself,
  isFileId,
  isSignatureFileGone,
  mapApiError,
  sendPersonalInformation,
  uploadSignature,
  type ApiResponse,
  type Myself,
} from "@/lib/api"
import { personalDiff, newSignatureKey, toPersonalValues, type PersonalValues } from "./schema"
import { SIGNATURE_REENCODE } from "./signature-file"

/**
 * The Personal-information save (Stories 2.2–2.4, FR12–FR14): the
 * `PUT v2/user/edit` of the changed fields, then the Signature step, run by
 * `runSaveSteps` in `stop` mode. A replace is an upload, then the
 * ownership-checked delete of the old file; a removal deletes the saved file
 * and any older one `myself` still shows (human decision 2026-10-16: no
 * `v2/file/{id}/version`). Signature file ids come only from `myself`.
 */

/** The parts of a Personal-information save, in order. */
export type PersonalSavePart = "user-edit" | "signature"

/** A new Signature waiting for Save: an accepted upload (already re-encoded) or the pad's drawing. */
export type PendingSignature = { readonly kind: "upload"; readonly blob: Blob } | { readonly kind: "drawing" }

/** What the Signature step does: nothing, upload a new one (replacing a saved one), or remove the saved one. */
export type SignatureChange = "none" | "upload" | "remove"

/** Leftover Signature relations a removal deletes after the saved one, at most. */
export const SIGNATURE_REMOVE_ROUNDS = 5

/** The Signature step for a form value against its baseline token. */
export function signatureChange(value: string, baseline: string): SignatureChange {
  if (value === baseline) return "none"
  if (newSignatureKey(value) !== null) return "upload"
  return value === "cleared" && baseline === "saved" ? "remove" : "none"
}

/** The saved Signature's file id from `myself` (never from input, the URL or an upload response), or `null`. */
export function savedSignatureId(myself: Myself | null | undefined): number | null {
  const id = myself?.signature?.id
  return isFileId(id) ? Number(id) : null
}

export interface PersonalSaveInput {
  readonly values: PersonalValues
  readonly baseline: PersonalValues
  /** The `myself` the save starts from: the only source of the old Signature id. */
  readonly myself: Myself | null | undefined
  /** The pending Signature of a `new:<n>` token. */
  readonly pendingSignature: (key: number) => PendingSignature | undefined
  /** The pad's drawing as a PNG (`null` when the pad is empty or can't export). */
  readonly exportDrawing: () => Promise<Blob | null>
  /** Revalidates `myself` and resolves the fresh value (the shared SWR key). */
  readonly refreshMyself: () => Promise<Myself | undefined>
  /** Resets the form baseline to fresh server values, keeping the user's edits. */
  readonly rebase: (fresh: PersonalValues) => void
}

/** The save's outcome for `useSectionForm`, plus the parts that weren't saved (for `describeError`). */
export interface PersonalSaveOutcome {
  readonly result: SaveResult
  readonly failedParts: readonly PersonalSavePart[]
}

const OK: ApiResponse<unknown> = { success: true }

/** A failure that ends the session: the only one a best-effort request still reports. */
function isSessionFailure(res: ApiResponse<unknown>): boolean {
  return !res.success && mapApiError("personal", res).kind === "session"
}

/**
 * The PNG to upload: an accepted upload as is (the pad already re-encoded it
 * when it was chosen), or the pad's drawing through the same `reencodeImage`
 * call (PNG, ≤ 1 MB, 2× the pad's size). Throws when there is nothing to send
 * or the drawing can't be brought to 1 MB (`runSaveSteps` counts a throw as a
 * failure of the step).
 */
async function signaturePng(input: PersonalSaveInput): Promise<Blob> {
  const key = newSignatureKey(input.values.signature)
  const pending = key === null ? undefined : input.pendingSignature(key)
  if (pending?.kind === "upload") return pending.blob
  const source = pending === undefined ? null : await input.exportDrawing()
  if (source === null) throw new Error("personal/signature: nothing to upload")
  const encoded = await reencodeImage(source, SIGNATURE_REENCODE)
  if (!encoded.ok) throw new Error("personal/signature: re-encode failed")
  return encoded.blob
}

/**
 * Upload (a new or replacing Signature): the re-encoded PNG as part `file`.
 * After a replace, `myself` is re-read and, once it shows a different id,
 * the old file is deleted through `DELETE /api/pp/file/{oldId}`. That
 * re-read and delete are best effort (Story 1.10's rule): only a session
 * failure fails them; a leftover old file stays behind `myself`'s newest. A
 * re-read that still shows the old id fails the step (the read view would
 * keep the old Signature), so the Signature error and Retry show.
 */
async function uploadStep(input: PersonalSaveInput, oldId: number | null): Promise<ApiResponse<unknown>> {
  const uploaded = await uploadSignature(await signaturePng(input))
  if (!uploaded.success || oldId === null) return uploaded
  const fresh = await fetchMyself()
  if (!fresh.success) return isSessionFailure(fresh) ? fresh : OK
  if (savedSignatureId(fresh.data) === oldId) {
    return { success: false, statusCode: fresh.statusCode, error: "personal/uploadSignature: myself still shows the old Signature" }
  }
  const deleted = await deleteSignatureFile(oldId)
  return isSessionFailure(deleted) ? deleted : OK
}

/**
 * Removal (after the confirm): deletes the saved file, then re-reads
 * `myself` and deletes any older Signature it still shows, up to
 * `SIGNATURE_REMOVE_ROUNDS` more, so a removal never reveals an older one.
 * A 404 `NO_FILE` is a file already gone (e.g. removed in another tab): the
 * re-read decides. Any other failure (or one still left after the last
 * round) fails the step.
 */
async function removeStep(oldId: number): Promise<ApiResponse<unknown>> {
  let id: number | null = oldId
  for (let round = 0; id !== null; round += 1) {
    if (round > SIGNATURE_REMOVE_ROUNDS) throw new Error("personal/signature: a Signature is still left")
    const deleted = await deleteSignatureFile(id)
    if (!deleted.success && !isSignatureFileGone(deleted)) return deleted
    const fresh = await fetchMyself()
    if (!fresh.success) return fresh
    id = savedSignatureId(fresh.data)
  }
  return OK
}

/** The steps of one save, built from the diff against `baseline`: a part with nothing to send is skipped. */
export function personalSaveSteps(input: PersonalSaveInput): SaveStep<PersonalSavePart>[] {
  const diff = personalDiff(input.values, input.baseline)
  const change = signatureChange(input.values.signature, input.baseline.signature)
  const oldId = input.baseline.signature === "saved" ? savedSignatureId(input.myself) : null
  return [
    { part: "user-edit", skip: Object.keys(diff).length === 0, run: () => sendPersonalInformation(diff) },
    {
      part: "signature",
      skip: change === "none" || (change === "remove" && oldId === null),
      run: () => (change === "remove" && oldId !== null ? removeStep(oldId) : uploadStep(input, oldId)),
    },
  ]
}

/**
 * Runs the save. On success `myself` is revalidated (the header, the
 * thumbnail's new file id). On a failure after a saved part, `myself` is
 * refetched and the baseline rebased, so the saved fields are clean and a
 * Retry sends only what is left. Never throws.
 */
export async function savePersonal(input: PersonalSaveInput): Promise<PersonalSaveOutcome> {
  const outcome = await runSaveSteps<PersonalSavePart, PersonalValues>(personalSaveSteps(input), {
    scope: "personal",
    mode: "stop",
    refetch: async () => {
      const fresh = await input.refreshMyself()
      if (!fresh) throw new Error("personal: no fresh myself")
      return toPersonalValues(fresh)
    },
    rebase: input.rebase,
  })
  if (!outcome.ok) {
    return { result: { ok: false, error: { code: outcome.error.code, mapped: outcome.error.mapped } }, failedParts: outcome.error.failedParts }
  }
  try {
    await input.refreshMyself()
  } catch {
    // Saved; the next revalidation shows it.
  }
  return { result: { ok: true }, failedParts: [] }
}
