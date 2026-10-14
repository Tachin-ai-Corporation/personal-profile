"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface SectionContainerProps {
  /** Edit view: `table-container-editing` (primary border + 3 px accent halo). */
  readonly editing: boolean
  readonly children: ReactNode
  readonly className?: string
}

/**
 * DESIGN.md `table-container` around a Section's table: card fill, border
 * hairline, `rounded-md`, flat. While editing, the border turns primary with
 * a 3 px accent halo (the editing state is never shown by elevation).
 */
export function SectionContainer({ editing, children, className }: SectionContainerProps) {
  return (
    <div
      data-slot="section-container"
      data-editing={editing ? "true" : undefined}
      className={cn("bg-card rounded-md border", editing ? "border-primary ring-accent ring-[3px]" : "border-border", className)}
    >
      {children}
    </div>
  )
}
