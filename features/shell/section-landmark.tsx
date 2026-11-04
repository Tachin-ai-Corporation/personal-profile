"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { AccountSectionId } from "./anchors"
import { sectionHeadingId, type SectionId } from "./nav-types"
import { SectionHeader, type SectionHeaderIcon } from "./section-header"

export interface SectionLandmarkProps {
  /** The Section id or `/account` landmark (`authenticator`, or `provider` which is no deep-link anchor): the `<section id>`. */
  readonly id: SectionId | AccountSectionId
  readonly title: string
  /** Right-aligned header tools (Edit, Add …), from the Section. */
  readonly tools?: ReactNode
  /** Opt-in (design refresh, PROPOSAL): `SectionHeader icon`, the header's icon tile and accent. */
  readonly icon?: SectionHeaderIcon
  readonly className?: string
  readonly children?: ReactNode
}

/**
 * A Section landmark (Story 1.8B, AD-7): `<section id aria-labelledby>` with
 * the 44 px `SectionHeader` row whose `h2` (`#<id>-heading`) is focusable by
 * script only, so Section navigation and deep links can move focus to it.
 * The card around the Section's table is `SectionContainer` (F3-2).
 */
export function SectionLandmark({ id, title, tools, icon, className, children }: SectionLandmarkProps) {
  return (
    <section id={id} aria-labelledby={sectionHeadingId(id)} className={cn("min-w-0", className)}>
      <SectionHeader id={id} title={title} editing={false} actions={tools} icon={icon} className="mb-2" />
      {children}
    </section>
  )
}
