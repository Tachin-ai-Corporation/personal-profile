"use client"

import type { JSX } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FallbackImage } from "@/components/ui/fallback-image"
import { INSURANCE_CARD_SIDES, type InsuranceCardSide } from "@/lib/api"
import { formatMessage, INSURANCE_MESSAGES } from "@/lib/shared/messages"
import { InsuranceImageMissing } from "./card-image"
import { insuranceSideLabel } from "./format"

export interface InsuranceCardViewerProps {
  readonly open: boolean
  /** The side shown (kept while the viewer closes). */
  readonly side: InsuranceCardSide
  /** The image of each side, or `null` for a side with no usable image (its toggle is disabled). */
  readonly sources: Readonly<Record<InsuranceCardSide, string | null>>
  /** "{Insurer} {Type} Insurance": the title and the image names. */
  readonly policyName: string
  readonly onSideChange: (side: InsuranceCardSide) => void
  readonly onClose: () => void
  /** Focuses the thumbnail that opened the viewer (Escape, Close): `true` when it did. */
  readonly returnFocus: () => boolean
}

/**
 * The card image viewer (Story 5.1, FR31): a large Dialog (`rounded-lg`,
 * full screen below 768 px) titled after the policy, a Front/Back toggle
 * (two `aria-pressed` buttons; a side without an image is aria-disabled),
 * the image fit to the viewport on a card surface, and Close. Escape and
 * Close return focus to the thumbnail that opened it.
 */
export function InsuranceCardViewer({ open, side, sources, policyName, onSideChange, onClose, returnFocus }: InsuranceCardViewerProps): JSX.Element {
  const sideLabel = insuranceSideLabel(side)
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        size="lg"
        fullScreenOnMobile
        className="rounded-lg"
        aria-describedby={undefined}
        data-slot="insurance-card-viewer"
        onCloseAutoFocus={(event) => {
          if (returnFocus()) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{formatMessage(INSURANCE_MESSAGES.viewerTitle, { policy: policyName })}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div role="group" aria-label={INSURANCE_MESSAGES.viewerSides} className="flex gap-2">
            {INSURANCE_CARD_SIDES.map((option) => {
              const pressed = option === side
              const missing = sources[option] === null
              return (
                <Button
                  key={option}
                  type="button"
                  size="touch"
                  variant={pressed ? "default" : "outline"}
                  aria-pressed={pressed}
                  aria-disabled={missing || undefined}
                  onClick={() => onSideChange(option)}
                >
                  {insuranceSideLabel(option)}
                </Button>
              )
            })}
          </div>
          <div data-slot="insurance-card-viewer-image" className="bg-card flex min-h-0 items-center justify-center rounded-md border p-2">
            <FallbackImage
              src={sources[side]}
              alt={formatMessage(INSURANCE_MESSAGES.imageAlt, { side: sideLabel, policy: policyName })}
              className="h-auto max-h-[calc(100dvh-16rem)] w-full rounded-sm object-contain"
              fallback={
                <InsuranceImageMissing
                  name={formatMessage(INSURANCE_MESSAGES.imageMissingName, { side: sideLabel })}
                  text={INSURANCE_MESSAGES.imageMissing}
                  className="aspect-[120/76] w-full max-w-[480px]"
                />
              }
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
