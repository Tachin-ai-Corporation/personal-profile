"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { SectionDraftNotice } from "./draft-banner"
import type { SectionId } from "./nav-types"

export interface SectionContainerProps {
  /** Edit view: `table-container-editing` (primary border + 3 px accent halo). */
  readonly editing: boolean
  /**
   * The Section whose stored draft (Story 1.15) is offered at the top of the
   * container: the restore banner or the conflict compare. Omit for a
   * container that keeps no draft.
   */
  readonly sectionId?: SectionId
  readonly children: ReactNode
  readonly className?: string
}

/**
 * DESIGN.md `table-container` around a Section's table: card fill, border
 * hairline, `rounded-md`, flat. While editing, the border turns primary with
 * a 3 px accent halo (the editing state is never shown by elevation).
 */
export function SectionContainer({ editing, sectionId, children, className }: SectionContainerProps) {
  return (
    <div
      data-slot="section-container"
      data-editing={editing ? "true" : undefined}
      className={cn("bg-card rounded-md border", editing ? "border-primary ring-accent ring-[3px]" : "border-border", className)}
    >
      {sectionId ? <SectionDraftNotice sectionId={sectionId} /> : null}
      {children}
    </div>
  )
}
