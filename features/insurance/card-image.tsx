"use client"

import { ImageOff } from "lucide-react"
import type { JSX } from "react"
import { cn } from "@/lib/utils"

export interface InsuranceImageMissingProps {
  /** The tile's accessible name, e.g. "Back image not uploaded". */
  readonly name: string
  /** The visible line ("Image not uploaded"). */
  readonly text: string
  readonly className?: string
}

/**
 * The dashed "Image not uploaded" tile (DESIGN.md Insurance card): a side
 * without a file, or whose image failed to load. One `role="img"` with one
 * name either way, so the two cases read the same.
 */
export function InsuranceImageMissing({ name, text, className }: InsuranceImageMissingProps): JSX.Element {
  return (
    <div
      role="img"
      aria-label={name}
      data-slot="insurance-image-missing"
      className={cn(
        "bg-background border-border text-muted-foreground text-caption flex flex-col items-center justify-center gap-1 rounded-sm border-[1.5px] border-dashed px-2 text-center",
        className,
      )}
    >
      <ImageOff aria-hidden="true" className="size-4 shrink-0" />
      <span>{text}</span>
    </div>
  )
}
