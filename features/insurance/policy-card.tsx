"use client"

import { useId, useRef, useState, type JSX } from "react"
import { Chip } from "@/components/ui/chip"
import { FallbackImage } from "@/components/ui/fallback-image"
import { KeyValueTable, labelChipTone, RowActions, type RowAction } from "@/features/shell"
import { INSURANCE_CARD_SIDES, insuranceCardDownloadPath, type InsuranceCardSide, type InsurancePolicy, type Myself } from "@/lib/api"
import { COMMON_MESSAGES, formatMessage, INSURANCE_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { InsuranceImageMissing } from "./card-image"
import { InsuranceCardRetry } from "./card-retry"
import { InsuranceCardViewer } from "./card-viewer"
import { insuranceChip, insuranceGridRows, insurancePolicyName, insurancePolicyTitle, insuranceSideLabel } from "./format"
import { useInsurancePendingCard } from "./pending-cards"

/** A thumbnail's box: 120×76, `rounded-sm`. */
const THUMB_BOX = "h-19 w-30 rounded-sm"

/** The image of a side: the policy's own file id only, else `null`. */
function sourceOf(policy: InsurancePolicy, side: InsuranceCardSide): string | null {
  const fileId = policy.cardFileIds[side]
  return policy.id === null || fileId === null ? null : insuranceCardDownloadPath(policy.id, fileId, side)
}

interface ThumbnailProps {
  readonly side: InsuranceCardSide
  /** `null`: no file, or the image failed (the tile). */
  readonly src: string | null
  readonly policyName: string
  /** Active card: the thumbnail is a button that opens the viewer. */
  readonly onOpen?: () => void
  readonly onFailed: () => void
  readonly buttonRef: (element: HTMLButtonElement | null) => void
  /** Story 5.3: "Retry upload" under the tile (an upload of this side failed in this session). */
  readonly retry?: JSX.Element
}

/** One captioned thumbnail ("Front" / "Back"): the image (a button on an active card) or the dashed tile, maybe with "Retry upload". */
function Thumbnail({ side, src, policyName, onOpen, onFailed, buttonRef, retry }: ThumbnailProps): JSX.Element {
  const label = insuranceSideLabel(side)
  const missing = (
    <InsuranceImageMissing
      name={formatMessage(INSURANCE_MESSAGES.imageMissingName, { side: label })}
      text={INSURANCE_MESSAGES.imageMissing}
      className={THUMB_BOX}
    />
  )
  const image = (
    <FallbackImage
      src={src}
      alt={formatMessage(INSURANCE_MESSAGES.imageAlt, { side: label, policy: policyName })}
      fallback={missing}
      onFallback={onFailed}
      className="size-full object-cover"
    />
  )
  let content: JSX.Element
  if (src === null) content = missing
  else if (onOpen)
    content = (
      <button
        ref={buttonRef}
        type="button"
        data-slot="insurance-thumbnail"
        onClick={onOpen}
        className={cn(THUMB_BOX, "bg-background border-border focus-ring block shrink-0 cursor-zoom-in overflow-hidden border outline-none")}
      >
        {image}
      </button>
    )
  else
    content = (
      <div data-slot="insurance-thumbnail" className={cn(THUMB_BOX, "bg-background border-border shrink-0 overflow-hidden border")}>
        {image}
      </div>
    )
  return (
    <figure data-side={side} className="m-0 flex flex-col items-center gap-1">
      {content}
      <figcaption className="text-caption text-muted-foreground">{label}</figcaption>
      {retry}
    </figure>
  )
}

/** The kebab's items: Edit and Delete (destructive, Story 5.5; unavailable with `deleteDisabledReason`) for a saved (id) policy. */
function cardActions(policy: InsurancePolicy, onEdit: () => void, onDelete: () => void, deleteDisabledReason: string | undefined): RowAction[] {
  if (policy.id === null) return []
  return [
    { id: "edit", label: SECTION_MESSAGES.edit, onSelect: onEdit },
    { id: "delete", label: COMMON_MESSAGES.delete, onSelect: onDelete, destructive: true, disabledReason: deleteDisabledReason },
  ]
}

export interface InsurancePolicyCardProps {
  readonly policy: InsurancePolicy
  readonly myself: Myself | undefined
  /** The kebab's "Edit" (Story 5.2): opens the editor on this policy. */
  readonly onEdit: () => void
  /** The kebab's "Delete" (Story 5.5): opens the delete confirm for this policy. */
  readonly onDelete: () => void
  /** Story 5.5: why "Delete" is unavailable (a delete of this policy is in flight), else `undefined`. */
  readonly deleteDisabledReason?: string
  /** Story 5.5: the kebab button (focus lands there when the card before it is deleted). */
  readonly kebabRef?: (element: HTMLButtonElement | null) => void
  /** Story 5.3: a "Retry upload" succeeded; revalidates the list. */
  readonly onCardUploaded: () => void
}

/**
 * One policy (Story 5.1, DESIGN.md Insurance card): a flat bordered
 * `rounded-md` card. The title row (≥ 52 px, bottom hairline) holds
 * "{Type} Insurance", the chip and the kebab ("More actions for {Insurer}
 * {Type} Insurance": Edit, Story 5.2; Delete, Story 5.5). A Deleted card
 * has no kebab (the backend would accept a `PUT` to it), and a policy
 * without an id has nothing to edit or delete. Below: the key/value grid, and the
 * Front/Back thumbnails behind a left hairline (under the grid below
 * 768 px). A Deleted card is muted, with no kebab and no thumbnail action.
 */
export function InsurancePolicyCard({ policy, myself, onEdit, onDelete, deleteDisabledReason, kebabRef, onCardUploaded }: InsurancePolicyCardProps): JSX.Element {
  const titleId = useId()
  const title = insurancePolicyTitle(policy)
  const name = insurancePolicyName(policy)
  const chip = insuranceChip(policy)
  // The src that failed per side: a new src for that side (a new file id) is tried again.
  const [failed, setFailed] = useState<Readonly<Record<InsuranceCardSide, string | null>>>({ front: null, back: null })
  const [viewer, setViewer] = useState<{ readonly open: boolean; readonly side: InsuranceCardSide; readonly opener: InsuranceCardSide }>({
    open: false,
    side: "front",
    opener: "front",
  })
  const thumbnails = useRef<Partial<Record<InsuranceCardSide, HTMLButtonElement | null>>>({})
  // Story 5.3: a side whose upload failed in this session gets "Retry upload" (an active, saved policy only), under its
  // still-saved image (a failed replace) or under the "Image not uploaded" tile when nothing is saved for that side.
  const retryId = policy.deleted ? null : policy.id
  const pending = { front: useInsurancePendingCard(retryId, "front"), back: useInsurancePendingCard(retryId, "back") }

  const usable = (side: InsuranceCardSide): string | null => {
    const src = sourceOf(policy, side)
    return src !== null && src === failed[side] ? null : src
  }
  const sources = { front: usable("front"), back: usable("back") }

  return (
    <article
      aria-labelledby={titleId}
      data-slot="insurance-card"
      data-deleted={policy.deleted ? "true" : undefined}
      // A Deleted card: every text muted (the chip already is).
      // Design refresh (PROPOSAL): a 4 px rule along the top in the Section's blue, and an active card lifts 2 px on hover or focus inside
      // it, its raised shadow fading in on a pseudo-element (transform and opacity only; under reduced motion the shadow alone).
      className={cn(
        "bg-card relative min-w-0 rounded-md border",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-md",
        policy.deleted
          ? "before:bg-border [&_*]:text-muted-foreground!"
          : "before:bg-brand-primary after:pointer-events-none after:absolute after:inset-0 after:rounded-md after:opacity-0 after:shadow-md after:transition-opacity after:duration-150 transition-transform duration-150 ease-standard motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5 hover:after:opacity-100 focus-within:after:opacity-100",
      )}
    >
      <div data-slot="insurance-card-title" className="border-border flex min-h-13 flex-wrap items-center gap-x-2.5 gap-y-1 border-b py-1 pr-1 pl-4">
        <h3 id={titleId} className="text-body text-foreground font-semibold">
          {title}
        </h3>
        {chip ? <Chip variant={chip.variant} tone={labelChipTone(chip.label)}>{chip.label}</Chip> : null}
        {policy.deleted ? null : <RowActions actions={cardActions(policy, onEdit, onDelete, deleteDisabledReason)} name={name} kebabRef={kebabRef} className="ml-auto" />}
      </div>
      <div className="flex flex-col md:flex-row">
        <div className="min-w-0 flex-1">
          <KeyValueTable rows={insuranceGridRows(policy, myself)} labelledBy={titleId} />
        </div>
        <div data-slot="insurance-thumbnails" className="border-border flex shrink-0 flex-wrap gap-3 border-t px-4 py-3 md:border-t-0 md:border-l">
          {INSURANCE_CARD_SIDES.map((side) => (
            <Thumbnail
              key={side}
              side={side}
              src={sources[side]}
              policyName={name}
              onOpen={policy.deleted ? undefined : () => setViewer({ open: true, side, opener: side })}
              onFailed={() => {
                const src = sources[side]
                setFailed((current) => ({ ...current, [side]: src }))
              }}
              buttonRef={(element) => {
                thumbnails.current[side] = element
              }}
              retry={retryId !== null && pending[side] ? <InsuranceCardRetry policyId={retryId} side={side} onUploaded={onCardUploaded} /> : undefined}
            />
          ))}
        </div>
      </div>
      {policy.deleted ? null : (
        <InsuranceCardViewer
          open={viewer.open}
          side={viewer.side}
          sources={sources}
          policyName={name}
          onSideChange={(side) => setViewer((current) => ({ ...current, side }))}
          onClose={() => setViewer((current) => ({ ...current, open: false }))}
          returnFocus={() => {
            const opener = thumbnails.current[viewer.opener]
            if (!opener?.isConnected) return false
            opener.focus()
            return true
          }}
        />
      )}
    </article>
  )
}
