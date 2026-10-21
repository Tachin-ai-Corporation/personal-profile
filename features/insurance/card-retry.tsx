"use client"

import { useId, useRef, useState, type JSX } from "react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/form-field"
import { toastError, toastPartial, toastSuccess, type ShownToast } from "@/features/shell"
import type { InsuranceCardSide } from "@/lib/api"
import { COMMON_MESSAGES, formatMessage, INSURANCE_MESSAGES } from "@/lib/shared/messages"
import { checkInsuranceCardFile, INSURANCE_CARD_ACCEPT } from "./card-file"
import { insuranceImageNotUploaded, uploadInsuranceCardImage, type InsuranceCardUpload } from "./card-upload"
import { insuranceSideLabel } from "./format"
import { insurancePendingCard } from "./pending-cards"

export interface InsuranceCardRetryProps {
  /** The saved policy (from the user's own list). */
  readonly policyId: number
  readonly side: InsuranceCardSide
  /** Revalidates the policy list once the image uploaded. */
  readonly onUploaded: () => void
}

/**
 * "Retry upload" under a side whose upload failed in this session (Story
 * 5.3, decision 2A), a `link-text` button. With the image still in memory,
 * only that upload is sent again: success → "Card image uploaded." and the
 * list refetch (the thumbnail); failure → the tile stays and an error toast
 * offers Retry; a rejection (413/415) drops the image. With the image gone,
 * it opens that side's file picker: the chosen file goes through the same
 * checks (an inline error names a refused file), then uploads directly.
 */
export function InsuranceCardRetry({ policyId, side, onUploaded }: InsuranceCardRetryProps): JSX.Element {
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sideWord = insuranceSideLabel(side).toLowerCase()

  /** One upload (or picker check + upload) at a time: a second trigger (the button, the toast's Retry) does nothing. */
  const inFlight = useRef(false)
  /** The last failure's error toast: dismissed when an upload starts (or succeeds). */
  const failureToast = useRef<ShownToast | null>(null)

  /** Runs `work` unless another is in flight; busy while it runs. */
  async function exclusive(work: () => Promise<void>): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await work()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function upload(image: InsuranceCardUpload, oldFileId: number | null): Promise<void> {
    setError(null)
    failureToast.current?.dismiss()
    failureToast.current = null
    const outcome = await uploadInsuranceCardImage(policyId, side, image, oldFileId)
    if (outcome === "uploaded") {
      toastSuccess(INSURANCE_MESSAGES.imageUploaded)
      onUploaded()
    } else if (outcome === "rejected") toastPartial(formatMessage(COMMON_MESSAGES.uploadRejected, { fileName: image.name }))
    // A session failure is the shell's (its dialog takes over): no toast.
    else if (outcome === "failed") failureToast.current = toastError(insuranceImageNotUploaded(side), { onRetry: () => void retry() })
  }

  async function retry(): Promise<void> {
    const pending = insurancePendingCard(policyId, side)
    if (!pending || inFlight.current) return
    if (pending.blob === null) {
      input.current?.click()
      return
    }
    const { blob, name, oldFileId } = pending
    await exclusive(() => upload({ blob, name }, oldFileId))
  }

  async function chosen(file: File): Promise<void> {
    await exclusive(async () => {
      setError(null)
      const result = await checkInsuranceCardFile(file)
      if (!result.ok) {
        setError(result.message)
        return
      }
      await upload(result.image, insurancePendingCard(policyId, side)?.oldFileId ?? null)
    })
  }

  return (
    <div data-slot="insurance-card-retry" className="flex flex-col items-center">
      <Button
        type="button"
        variant="link"
        size="touch"
        busy={busy}
        aria-label={formatMessage(INSURANCE_MESSAGES.retryUploadName, { side: sideWord })}
        aria-describedby={error ? errorId : undefined}
        className="px-2"
        onClick={() => void retry()}
      >
        {INSURANCE_MESSAGES.retryUpload}
      </Button>
      <input
        ref={input}
        type="file"
        accept={INSURANCE_CARD_ACCEPT}
        hidden
        tabIndex={-1}
        data-testid={`insurance-card-retry-input-${side}`}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) void chosen(file)
        }}
      />
      <div role="alert" className="max-w-30">
        {error ? (
          <FieldError id={errorId} className="[overflow-wrap:anywhere]">
            {error}
          </FieldError>
        ) : null}
      </div>
    </div>
  )
}
