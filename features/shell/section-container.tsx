"use client"

import type { CSSProperties, ReactNode } from "react"
import type { AnimatedIconTone } from "@/components/ui/animated-icon"
import { useConfirmationWindow } from "@/components/ui/use-confirmation-window"
import { cn } from "@/lib/utils"
import { SectionDraftNotice } from "./draft-banner"
import type { SectionId } from "./nav-types"
import { sectionStagger } from "./section-motion"
import { useSectionSavedCount } from "./section-registry"
import { SectionToneContext } from "./section-tone"
import { TONE_CLASSES } from "./section-tones"

/** The saved ring's pulse (app/globals.css `.animate-saved-flash`, 400 ms); it is unmounted after. */
export const SAVED_FLASH_MS = 400

export interface SectionContainerProps {
  /** Edit view: `table-container-editing` (primary border + 3 px accent halo). */
  readonly editing: boolean
  /**
   * The Section whose stored draft (Story 1.15) is offered at the top of the
   * container: the restore banner or the conflict compare. Omit for a
   * container that keeps no draft.
   */
  readonly sectionId?: SectionId
  /**
   * Opt-in (design refresh, PROPOSAL): the container fades and slides in when
   * it mounts (its content arrived), with `sectionId`'s stagger, and flashes a
   * success ring each time `sectionId` reports `saved`. Off under reduced
   * motion. Omitted: the container is unchanged.
   */
  readonly animated?: boolean
  /**
   * Opt-in (design refresh, PROPOSAL): a 4 px bar in the Section's brand hue
   * over the container's left border (the tone of its header icon). It
   * overlays the border, so the content doesn't move. The tone also reaches
   * the `SectionTable` inside (`SectionToneContext`): a tinted header row and
   * row hover. Omitted: no bar, and the table is unchanged.
   */
  readonly accent?: AnimatedIconTone
  readonly children: ReactNode
  readonly className?: string
}

/**
 * DESIGN.md `table-container` around a Section's table: card fill, border
 * hairline, `rounded-md`, flat. While editing, the border turns primary with
 * a 3 px accent halo (the editing state is never shown by elevation).
 */
export function SectionContainer({ editing, sectionId, animated = false, accent, children, className }: SectionContainerProps) {
  const saved = useSectionSavedCount(animated && sectionId ? sectionId : null)
  // The saved ring is unmounted once its pulse ends: a lasting absolutely positioned overlay that resizes with the
  // container would make Chrome suppress scroll anchoring (see `accent`).
  const flashing = useConfirmationWindow(saved, SAVED_FLASH_MS)
  return (
    <div
      data-slot="section-container"
      data-editing={editing ? "true" : undefined}
      className={cn(
        "bg-card rounded-md border",
        editing ? "border-primary ring-accent ring-[3px]" : "border-border",
        animated && "animate-section-enter relative",
        // A real 4 px left border, not a positioned pseudo-element: an absolutely positioned bar that grows with the
        // container made Chrome suppress scroll anchoring, so a field error appearing above a button (blur validation)
        // moved the button under the pointer mid-click (#62 CI, the 360 px edit card's Verify).
        accent && ["border-l-4", TONE_CLASSES[accent].containerBar],
        className,
      )}
      style={animated ? ({ "--stagger": sectionId ? sectionStagger(sectionId) : 0 } as CSSProperties) : undefined}
    >
      {sectionId ? <SectionDraftNotice sectionId={sectionId} /> : null}
      <SectionToneContext value={accent ?? null}>{children}</SectionToneContext>
      {flashing ? (
        // Restarted per save by its key; opacity 0 at rest, so it shows nothing under reduced motion.
        <span key={saved} aria-hidden="true" data-slot="section-saved-flash" className="animate-saved-flash ring-success pointer-events-none absolute -inset-px rounded-md ring-2" />
      ) : null}
    </div>
  )
}
