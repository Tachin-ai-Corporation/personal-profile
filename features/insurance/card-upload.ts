import { deleteInsuranceCardFile, INSURANCE_CARD_SIDES, isUploadRejected, mapApiError, uploadInsuranceCard, type InsuranceCardSide } from "@/lib/api"
import { COMMON_MESSAGES, formatMessage, INSURANCE_MESSAGES, SECTION_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { insuranceSideLabel } from "./format"
import { dropInsurancePendingCard, setInsurancePendingCard } from "./pending-cards"

/**
 * One card image's upload (Story 5.3), shared by the editor's save and the
 * card's "Retry upload": the upload, then, for a replaced card, the quiet
 * delete of the old file (AD-13: replace, then delete). The pending store is
 * kept in step: an upload that failed is kept for Retry, one that uploaded or
 * was rejected (413/415) is forgotten.
 */

/** What became of one side's image (`session`: the session ended; the shell's dialog takes over, so no toast). */
export type InsuranceCardOutcome = "uploaded" | "rejected" | "failed" | "session"

/** An image to upload: the re-encoded JPEG and the chosen file's name. */
export interface InsuranceCardUpload {
  readonly blob: Blob
  readonly name: string
}

/**
 * Uploads `image` as `side` of the saved policy `policyId` (from the policy
 * just saved or the user's own list, never typed). After it uploads, the
 * replaced card's `oldFileId` (from the edited policy) is deleted through the
 * named op: a refused or failed delete is quiet (the new image stays); a
 * session failure is the shell's (`callApi` already told it). Never throws.
 */
export async function uploadInsuranceCardImage(
  policyId: number,
  side: InsuranceCardSide,
  image: InsuranceCardUpload,
  oldFileId: number | null,
): Promise<InsuranceCardOutcome> {
  const res = await uploadInsuranceCard(policyId, side, image.blob, image.name)
  if (!res.success) {
    const mapped = mapApiError("insurance", res)
    if (isUploadRejected(mapped)) {
      dropInsurancePendingCard(policyId, side)
      return "rejected"
    }
    setInsurancePendingCard(policyId, side, { blob: image.blob, name: image.name, oldFileId })
    return mapped.kind === "session" ? "session" : "failed"
  }
  dropInsurancePendingCard(policyId, side)
  if (oldFileId !== null) await deleteInsuranceCardFile(oldFileId)
  return "uploaded"
}

/** A side's outcome with the chosen file's name (a rejection names the file). */
export interface InsuranceCardResult {
  readonly outcome: InsuranceCardOutcome
  readonly name: string
}

/** "{Side} image not uploaded." ("Back image not uploaded."). */
export function insuranceImageNotUploaded(side: InsuranceCardSide): string {
  return formatMessage(INSURANCE_MESSAGES.imageNotUploaded, { side: insuranceSideLabel(side) })
}

/**
 * The toast after a save with images: `null` when every image uploaded (the
 * plain "Insurance saved."; the caller shows no toast at all when an upload
 * ended the session), else "Insurance saved." followed by what didn't
 * upload: "Card images not uploaded." (both failed), "{Side} image not
 * uploaded." (one), and "{file} couldn't be used. Choose another file." for
 * each rejected file.
 */
export function insurancePartialToast(results: Partial<Record<InsuranceCardSide, InsuranceCardResult>>): string | null {
  const failed = INSURANCE_CARD_SIDES.filter((side) => results[side]?.outcome === "failed")
  const rejected = INSURANCE_CARD_SIDES.flatMap((side) => {
    const result = results[side]
    return result?.outcome === "rejected" ? [formatMessage(COMMON_MESSAGES.uploadRejected, { fileName: result.name })] : []
  })
  if (failed.length === 0 && rejected.length === 0) return null
  const notUploaded = failed.length === INSURANCE_CARD_SIDES.length ? [INSURANCE_MESSAGES.imagesNotUploaded] : failed.map(insuranceImageNotUploaded)
  return [formatMessage(SECTION_MESSAGES.saved, { section: SHELL_MESSAGES.profileTabInsurance }), ...notUploaded, ...rejected].join(" ")
}
