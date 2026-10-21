"use client"

import { useId, useRef, type JSX } from "react"
import { Button } from "@/components/ui/button"
import { FallbackImage } from "@/components/ui/fallback-image"
import { FieldError } from "@/components/ui/form-field"
import { INSURANCE_CARD_SIDES, insuranceCardDownloadPath, type InsuranceCardSide, type InsurancePolicy } from "@/lib/api"
import { COMMON_MESSAGES, formatMessage, INSURANCE_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { INSURANCE_CARD_ACCEPT, insuranceChosenFileMeta } from "./card-file"
import { InsuranceImageMissing } from "./card-image"
import { insurancePolicyName, insuranceSideLabel } from "./format"
import type { InsuranceEditor } from "./use-insurance-editor"

/** A slot's image box: 120:76, `rounded-sm` (the card's thumbnail size). */
const SLOT_BOX = "h-19 w-30 shrink-0 rounded-sm"

/** The saved image of a side (Edit): the policy's own file id only, else `null`. */
function savedSource(policy: InsurancePolicy | null, side: InsuranceCardSide): string | null {
  const fileId = policy?.cardFileIds[side] ?? null
  return policy === null || policy.id === null || fileId === null ? null : insuranceCardDownloadPath(policy.id, fileId, side)
}

interface CardSlotProps {
  readonly editor: InsuranceEditor
  readonly side: InsuranceCardSide
}

/**
 * One side's slot (Story 5.3): a chosen file's preview with "{name} · {size}"
 * and ghost Replace / Remove; else the saved image (Edit) with Replace; else
 * the dashed "No image chosen" tile with "Choose {side} image". The first
 * button stays the same element across the three states, so focus stays on
 * it after a choice; Remove moves focus back to it. A rejected file shows an
 * inline error naming it, and the slot keeps its previous state.
 */
function CardSlot({ editor, side }: CardSlotProps): JSX.Element {
  const captionId = useId()
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  const action = useRef<HTMLButtonElement>(null)
  const label = insuranceSideLabel(side)
  const sideWord = label.toLowerCase()
  const image = editor.images[side]
  const saved = savedSource(editor.policy, side)
  const error = editor.imageErrors[side]
  const checking = editor.imageChecking[side]
  const inert = editor.saving || checking

  const missing = <InsuranceImageMissing name={INSURANCE_MESSAGES.noImageChosen} text={INSURANCE_MESSAGES.noImageChosen} className={SLOT_BOX} />
  let preview: JSX.Element
  if (image) {
    preview = (
      // eslint-disable-next-line @next/next/no-img-element -- an object URL preview; next/image can't serve it
      <img
        src={image.previewUrl}
        alt={formatMessage(INSURANCE_MESSAGES.chosenImageAlt, { side: sideWord })}
        data-slot="insurance-card-slot-preview"
        className={cn(SLOT_BOX, "bg-background border-border border object-cover")}
      />
    )
  } else if (saved !== null && editor.policy) {
    preview = (
      <div data-slot="insurance-card-slot-saved" className={cn(SLOT_BOX, "bg-background border-border overflow-hidden border")}>
        <FallbackImage
          src={saved}
          alt={formatMessage(INSURANCE_MESSAGES.imageAlt, { side: label, policy: insurancePolicyName(editor.policy) })}
          fallback={missing}
          className="size-full object-cover"
        />
      </div>
    )
  } else preview = missing

  const replaceName = formatMessage(INSURANCE_MESSAGES.replaceImage, { side: sideWord })
  return (
    <div role="group" aria-labelledby={captionId} data-slot="insurance-card-slot" data-side={side} className="flex min-w-0 flex-col gap-2">
      <span id={captionId} className="text-body-sm text-foreground font-medium">
        {label}
      </span>
      <div className="flex min-w-0 flex-col items-start gap-2">
        {preview}
        <div className="flex w-full min-w-0 flex-col items-start gap-1">
          {image ? (
            <p data-slot="insurance-card-slot-file" className="text-body-sm text-muted-foreground w-full truncate">
              {insuranceChosenFileMeta(image.name, image.size)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            <Button
              ref={(element) => {
                action.current = element
                editor.registerImageAction(side)(element)
              }}
              type="button"
              variant={image ? "ghost" : "outline"}
              size="touch"
              busy={checking}
              aria-disabled={editor.saving || undefined}
              aria-label={image || saved !== null ? replaceName : undefined}
              aria-describedby={error ? errorId : undefined}
              onClick={() => {
                if (!inert) input.current?.click()
              }}
            >
              {image || saved !== null ? COMMON_MESSAGES.replace : formatMessage(INSURANCE_MESSAGES.chooseImage, { side: sideWord })}
            </Button>
            {image ? (
              <Button
                type="button"
                variant="ghost"
                size="touch"
                aria-disabled={inert || undefined}
                aria-label={formatMessage(INSURANCE_MESSAGES.removeImage, { side: sideWord })}
                onClick={() => {
                  if (inert) return
                  editor.removeImage(side)
                  action.current?.focus()
                }}
              >
                {COMMON_MESSAGES.remove}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={INSURANCE_CARD_ACCEPT}
        hidden
        tabIndex={-1}
        data-testid={`insurance-card-input-${side}`}
        onChange={(event) => {
          const chosen = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (chosen) editor.chooseImage(side, chosen)
        }}
      />
      <div role="alert">
        {error ? (
          <FieldError id={errorId} className="[overflow-wrap:anywhere]">
            {error}
          </FieldError>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The editor's Card images group (Story 5.3, FR29), below the Subscriber
 * group: a top hairline, the heading "Card images", the rules line, and the
 * Front and Back slots side by side from 768 px (stacked below). Images
 * upload after the policy saves.
 */
export function InsuranceCardImages({ editor }: { readonly editor: InsuranceEditor }): JSX.Element {
  const headingId = useId()
  return (
    <div role="group" aria-labelledby={headingId} data-slot="insurance-card-images" className="border-border flex flex-col gap-4 border-t pt-5">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-body text-foreground font-semibold">
          {INSURANCE_MESSAGES.cardImages}
        </h3>
        <p className="text-muted-foreground text-body-sm">{INSURANCE_MESSAGES.cardImagesRules}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {INSURANCE_CARD_SIDES.map((side) => (
          <CardSlot key={side} editor={editor} side={side} />
        ))}
      </div>
    </div>
  )
}
