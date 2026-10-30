"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { AnimatedIcon, type AnimatedIconTone } from "@/components/ui/animated-icon"
import { SECTION_MESSAGES } from "@/lib/shared/messages"
import { SECTION_IDS } from "@/lib/shared/section-ids"
import { cn } from "@/lib/utils"
import type { AccountSectionId } from "./anchors"
import { sectionHeadingId, type SectionId } from "./nav-types"
import { sectionStagger } from "./section-motion"
import { useSectionSavedCount } from "./section-registry"
import { TONE_CLASSES } from "./section-tones"

/**
 * The heading is focused by script (after Save, Cancel, a Section jump), often
 * right after a mouse action, when Chromium doesn't match `:focus-visible`;
 * so it shows the focus-ring look on `:focus` (as the focusable InlineBanner).
 */
const HEADING_FOCUS = "rounded-sm outline-none focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring focus:shadow-glow"

/**
 * With `icon` (the design refresh's opt-in, PROPOSAL): the ring only on
 * `:focus-visible`. Focus still moves to the heading, but after a mouse click
 * (a Section menu item, Save, Cancel) Chromium doesn't match `:focus-visible`,
 * so no box shows; after the keyboard it does. WCAG 2.4.7 asks for a visible
 * indicator in keyboard use only.
 */
const HEADING_FOCUS_VISIBLE =
  "rounded-sm outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:shadow-glow"

/** A registry Section (its saves are observable); `/account`'s `authenticator` and `provider` landmarks aren't. */
function isRegistrySection(id: SectionId | AccountSectionId): id is SectionId {
  return (SECTION_IDS as readonly string[]).includes(id)
}

/** The opt-in icon tile before the title (design refresh, PROPOSAL). */
export interface SectionHeaderIcon {
  readonly icon: LucideIcon
  readonly tone: AnimatedIconTone
}

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
  /**
   * Opt-in: a decorative tinted icon tile before the `h2` (from 640 px) that
   * enters with the Section's stagger, lifts on hover or focus of the row and
   * shows a check each time the Section reports `saved`, plus a short accent
   * line in the tone's hue under the title (all widths) and the actions'
   * outline in the tone, filling with its surface tint on hover. The heading's
   * focus ring then shows only on `:focus-visible` (keyboard), not after a
   * mouse click moves focus to it. Omitted: the header is unchanged.
   */
  readonly icon?: SectionHeaderIcon
  readonly className?: string
}

/**
 * DESIGN.md Section header (UX-DR20): a 44 px row with the `h2`
 * (`id = sectionHeadingId(id)`, `tabIndex=-1`, section-title type), the count
 * or "Editing" in muted text, and the actions on the right.
 */
export function SectionHeader({ id, title, count, editing, actions, icon, className }: SectionHeaderProps) {
  const meta = editing ? SECTION_MESSAGES.editing : count
  const saved = useSectionSavedCount(icon && isRegistrySection(id) ? id : null)
  return (
    <div data-slot="section-header" className={cn("flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1", icon && "group/icon-host", className)}>
      {/* Hidden below 640 px: at 360 px the tile would push "Edit" / "Add …" onto a second row. */}
      {icon ? <AnimatedIcon icon={icon.icon} tone={icon.tone} size="lg" entrance stagger={sectionStagger(id)} success={saved} className="max-sm:hidden" /> : null}
      <h2
        id={sectionHeadingId(id)}
        tabIndex={-1}
        className={cn(
          "text-body text-foreground font-semibold",
          icon ? HEADING_FOCUS_VISIBLE : HEADING_FOCUS,
          // A 24 × 2 px line under the title's start: a pseudo-element, so the row's height never changes.
          icon && ["relative after:pointer-events-none after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-6 after:rounded-full", TONE_CLASSES[icon.tone].titleAccent],
        )}
      >
        {title}
      </h2>
      {meta !== undefined && meta !== null ? (
        <span data-slot="section-meta" className="text-muted-foreground text-body-sm">
          {meta}
        </span>
      ) : null}
      {actions ? <div className={cn("ml-auto flex items-center gap-2", icon && TONE_CLASSES[icon.tone].headerActions)}>{actions}</div> : null}
    </div>
  )
}
