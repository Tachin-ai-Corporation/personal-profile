"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"

import { useAnnounce } from "@/components/ui/live-status"
import { COMMON_MESSAGES, formatMessage } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

/** How long the ✓ "Copied" confirmation stays after a copy. */
export const COPY_CONFIRM_MS = 1500

export interface CopyButtonProps {
  /** The text written to the clipboard. */
  readonly value: string
  /** How the value is named in the button's name and the announcements; defaults to `value`. */
  readonly label?: string
  readonly className?: string
}

/**
 * A copy-to-clipboard icon button (design refresh, PROPOSAL; DESIGN-SYSTEM.md
 * "Accent tints and motion"), placed after a phone number or email address.
 *
 * - Shown on hover or keyboard focus of the nearest `group/row` (a Section
 *   table row), on its own focus, and always where there is no hover (touch).
 *   While hidden it stays in the Tab order: focusing it shows it.
 * - Named "Copy {label}". A 28 px icon whose hit area is 44 × 44 (a
 *   pseudo-element), so the row keeps its height.
 * - A click writes `value` to the clipboard, swaps the icon for a ✓ with a
 *   decorative "Copied" bubble above it in the tooltip colors (both pop in; no motion under reduced
 *   motion) for `COPY_CONFIRM_MS`, and announces "{label} copied" in a polite
 *   live region. If the clipboard refuses, it announces how to copy by hand.
 */
export function CopyButton({ value, label = value, className }: CopyButtonProps): React.JSX.Element {
  // Each copy bumps `copies`; its confirmation hides once that copy's timer ends (a newer copy restarts it).
  const [copies, setCopies] = React.useState(0)
  const [doneFor, setDoneFor] = React.useState(0)
  const { message, announce } = useAnnounce({ clearAfterMs: 5000 })
  React.useEffect(() => {
    if (copies === 0) return
    const timer = setTimeout(() => setDoneFor(copies), COPY_CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [copies])
  const confirming = copies > 0 && doneFor !== copies

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopies((count) => count + 1)
      announce(formatMessage(COMMON_MESSAGES.copiedValue, { value: label }))
    } catch {
      announce(formatMessage(COMMON_MESSAGES.copyFailed, { value: label }))
    }
  }

  return (
    <span data-slot="copy" className="relative inline-flex shrink-0 items-center">
      <button
        type="button"
        data-slot="copy-button"
        data-copied={confirming ? "true" : undefined}
        aria-label={formatMessage(COMMON_MESSAGES.copyValue, { value: label })}
        onClick={() => void copy()}
        className={cn(
          "focus-ring text-muted-foreground hover:text-foreground relative inline-flex size-7 items-center justify-center rounded-sm outline-none",
          // The 44 × 44 hit area.
          "after:absolute after:-inset-2",
          "opacity-0 group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
          "motion-safe:transition-opacity motion-safe:duration-150",
          confirming && "opacity-100",
          className,
        )}
      >
        {confirming ? (
          <Check key={copies} aria-hidden="true" strokeWidth={3} className="text-success-strong animate-icon-pop size-3.5" />
        ) : (
          <Copy aria-hidden="true" className="size-3.5" />
        )}
      </button>
      {confirming ? (
        // Decorative (the live region says it): a tooltip-style bubble above the icon, absolute so the row never reflows.
        <span
          key={copies}
          aria-hidden="true"
          data-slot="copy-confirmation"
          className="bg-tooltip text-tooltip-foreground animate-icon-pop text-caption pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-sm px-1.5 py-0.5 font-semibold whitespace-nowrap"
        >
          {COMMON_MESSAGES.copied}
        </span>
      ) : null}
      {/* Its own polite region (not `LiveStatus`): a Section's announcer stays the Section's first `live-status`. */}
      <span role="status" aria-live="polite" aria-atomic="true" data-slot="copy-status" className="sr-only">
        {message}
      </span>
    </span>
  )
}
