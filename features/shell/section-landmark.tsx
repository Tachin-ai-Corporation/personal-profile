"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { AccountAnchor } from "./anchors"
import { sectionHeadingId, type SectionId } from "./nav-types"
import { SectionHeader } from "./section-header"

export interface SectionLandmarkProps {
  /** The Section id or `/account` anchor (e.g. `authenticator`): the `<section id>` and URL hash. */
  readonly id: SectionId | AccountAnchor
  readonly title: string
  /** Right-aligned header tools (Edit, Add …), from the Section. */
  readonly tools?: ReactNode
  readonly className?: string
  readonly children?: ReactNode
}

/**
 * A Section landmark (Story 1.8B, AD-7): `<section id aria-labelledby>` with
 * the 44 px `SectionHeader` row whose `h2` (`#<id>-heading`) is focusable by
 * script only, so Section navigation and deep links can move focus to it.
 * The card around the Section's table is `SectionContainer` (F3-2).
 */
export function SectionLandmark({ id, title, tools, className, children }: SectionLandmarkProps) {
  return (
    <section id={id} aria-labelledby={sectionHeadingId(id)} className={cn("min-w-0", className)}>
      <SectionHeader id={id} title={title} editing={false} actions={tools} className="mb-2" />
      {children}
    </section>
  )
}
