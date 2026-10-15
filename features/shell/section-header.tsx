"use client"

import type { ReactNode } from "react"
import { SECTION_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import type { AccountSectionId } from "./anchors"
import { sectionHeadingId, type SectionId } from "./nav-types"

/**
 * The heading is focused by script (after Save, Cancel, a Section jump), often
 * right after a mouse action, when Chromium doesn't match `:focus-visible`;
 * so it shows the focus-ring look on `:focus` (as the focusable InlineBanner).
 */
const HEADING_FOCUS = "rounded-sm outline-none focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring focus:shadow-glow"

export interface SectionHeaderProps {
  /** A Section id, or an `/account` anchor container (e.g. `authenticator`). */
  readonly id: SectionId | AccountSectionId
  /** The Section title (catalog copy), e.g. "Phone". */
  readonly title: string
  /** Read view: the count of saved entries (e.g. `3`); omitted when the Section shows none. */
  readonly count?: ReactNode
  /** Edit view: shows muted "Editing" in place of the count. */
  readonly editing: boolean
  /** Right-aligned tools: "Edit" or "Add {thing}" in read view (none while editing). */
  readonly actions?: ReactNode
  readonly className?: string
}

/**
 * DESIGN.md Section header (UX-DR20): a 44 px row with the `h2`
 * (`id = sectionHeadingId(id)`, `tabIndex=-1`, section-title type), the count
 * or "Editing" in muted text, and the actions on the right.
 */
export function SectionHeader({ id, title, count, editing, actions, className }: SectionHeaderProps) {
  const meta = editing ? SECTION_MESSAGES.editing : count
  return (
    <div data-slot="section-header" className={cn("flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <h2 id={sectionHeadingId(id)} tabIndex={-1} className={cn("text-body text-foreground font-semibold", HEADING_FOCUS)}>
        {title}
      </h2>
      {meta !== undefined && meta !== null ? (
        <span data-slot="section-meta" className="text-muted-foreground text-body-sm">
          {meta}
        </span>
      ) : null}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
