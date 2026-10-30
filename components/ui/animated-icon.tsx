"use client"

import * as React from "react"
import { Check, type LucideIcon } from "lucide-react"

import { useConfirmationWindow } from "@/components/ui/use-confirmation-window"
import { cn } from "@/lib/utils"

/** How long the saved check stays (its pop, the hold and its fade; app/globals.css `.animate-icon-success`). */
export const ANIMATED_ICON_SUCCESS_MS = 1450

/**
 * The tile tints (saturated; glyph >= 4.1:1 light, >= 5.2:1 dark) and the
 * ring in the brand hue that fades in on hover or row focus.
 */
const TONES = {
  blue: "bg-tint-blue-tile text-tint-blue-strong-foreground after:ring-brand-primary/45",
  teal: "bg-tint-teal-tile text-tint-teal-strong-foreground after:ring-brand-secondary/45",
  mint: "bg-tint-mint-tile text-tint-mint-strong-foreground after:ring-brand-tertiary/60",
} as const

export type AnimatedIconTone = keyof typeof TONES

const SIZES = {
  /** 24 px tile, 14 px glyph. */
  sm: { tile: "size-6 rounded-sm", glyph: "size-3.5" },
  /** 28 px tile, 16 px glyph. */
  md: { tile: "size-7 rounded-md", glyph: "size-4" },
  /** 40 px tile, 20 px glyph (Section headers). */
  lg: { tile: "size-10 rounded-lg", glyph: "size-5" },
} as const

export type AnimatedIconSize = keyof typeof SIZES

export interface AnimatedIconProps {
  readonly icon: LucideIcon
  readonly tone?: AnimatedIconTone
  readonly size?: AnimatedIconSize
  /** Fade and scale in from 0.8 with a slight overshoot on mount, `stagger` × 70 ms late (app/globals.css `.animate-icon-enter`). */
  readonly entrance?: boolean
  /** The display index for the entrance delay (`--stagger`). */
  readonly stagger?: number
  /**
   * A success counter: each increase pops a check over the tile, which fades
   * after about 1.2 s. `0` (the default) shows none; a counter that drops to
   * `0` and counts again pops again.
   */
  readonly success?: number
  readonly className?: string
}

/**
 * A decorative icon on a strong brand tint (design refresh, PROPOSAL; DESIGN-SYSTEM.md
 * "Accent tints and motion"). Always `aria-hidden`: the text next to it names
 * the thing, and a save is announced by its toast. Motion is transform and
 * opacity only and off under reduced motion. The tile lifts 2 px and grows to
 * 1.12 (with a small spring overshoot) on hover or focus of the nearest
 * `group/icon-host` ancestor (e.g. the Section header row) or keyboard focus
 * inside it (`:focus-visible`, so a click that moves focus to the heading
 * doesn't), and a soft 2 px ring in its brand hue fades in (a ring, not a
 * glow: glow is for focus).
 * The entrance sits on the outer span and the hover on the inner one, so the
 * entrance animation never overrides the hover transform.
 */
export function AnimatedIcon({
  icon: Icon,
  tone = "blue",
  size = "md",
  entrance = false,
  stagger = 0,
  success = 0,
  className,
}: AnimatedIconProps): React.JSX.Element {
  // The check for success `n` hides once `n`'s window ends; a newer save restarts it.
  const showCheck = useConfirmationWindow(success, ANIMATED_ICON_SUCCESS_MS)
  const { tile, glyph } = SIZES[size]

  return (
    <span
      aria-hidden="true"
      data-slot="animated-icon"
      data-tone={tone}
      className={cn("relative inline-flex shrink-0", entrance && "animate-icon-enter", className)}
      style={entrance ? ({ "--stagger": stagger } as React.CSSProperties) : undefined}
    >
      <span
        data-slot="animated-icon-tile"
        className={cn(
          "relative inline-flex items-center justify-center transition-transform duration-200 ease-spring",
          // The hover ring: a pseudo-element whose opacity fades (no transition under reduced motion; the ring still shows).
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:opacity-0 after:ring-2",
          "motion-safe:after:transition-opacity motion-safe:after:duration-200",
          "hover:after:opacity-100 group-hover/icon-host:after:opacity-100 group-has-[:focus-visible]/icon-host:after:opacity-100",
          // motion-safe: a reduced-motion reset would lose to the group-hover selectors' specificity.
          "motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-112",
          "motion-safe:group-hover/icon-host:-translate-y-0.5 motion-safe:group-hover/icon-host:scale-112",
          "motion-safe:group-has-[:focus-visible]/icon-host:-translate-y-0.5 motion-safe:group-has-[:focus-visible]/icon-host:scale-112",
          tile,
          TONES[tone],
        )}
      >
        <Icon className={glyph} />
      </span>
      {showCheck ? (
        <span
          key={success}
          data-slot="animated-icon-success"
          // success-strong fill with card ink: 5.3:1 light, 6.3:1 dark (a white check on --success is 2.9:1).
          className={cn("bg-success-strong text-card animate-icon-success absolute inset-0 inline-flex items-center justify-center", tile)}
        >
          <Check className={glyph} strokeWidth={3} />
        </span>
      ) : null}
    </span>
  )
}
