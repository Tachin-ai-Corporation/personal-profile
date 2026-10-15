import * as React from "react"

import { formatMessage, SECTION_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

/**
 * DESIGN.md chips (F6-2): square (`rounded-sm`, 22 px, 12 px / 600) so they
 * sit in a ruled grid. This is the Ledger delta to the design system's pill
 * `Badge` (rounded-full), which stays for status pills outside tables.
 * - `label`: a Contact Label or insurance precedence ("Work", "Secondary").
 * - `primary`: Primary, the only filled chip.
 * - `deleted`: a deleted insurance policy.
 * - `overflow`: the bordered "+N" chip (use `OverflowChip` when it is focusable).
 */
const CHIP_VARIANTS = {
  label: "bg-muted text-secondary-foreground",
  primary: "bg-primary text-primary-foreground",
  deleted: "bg-muted text-muted-foreground",
  overflow: "border border-border bg-transparent text-secondary-foreground",
} as const

export type ChipVariant = keyof typeof CHIP_VARIANTS

export const CHIP_BASE = "inline-flex h-[22px] w-fit shrink-0 items-center rounded-sm px-2 text-caption font-semibold whitespace-nowrap"

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly variant?: ChipVariant
}

export function Chip({ variant = "label", className, ...props }: ChipProps): React.JSX.Element {
  return <span data-slot="chip" data-variant={variant} className={cn(CHIP_BASE, CHIP_VARIANTS[variant], className)} {...props} />
}

export interface OverflowChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** How many items are hidden ("+{count}"). */
  readonly count: number
  /** The accessible name listing the hidden items, e.g. "2 more types: Insurance, Population Health" (catalog copy). */
  readonly "aria-label": string
}

/**
 * The focusable "+N" chip (DESIGN.md `overflow-chip`; Story 10.2): a 44 px
 * button around the 22 px chip, named by `aria-label`. It forwards its ref
 * and props, so it can be a `Tooltip` trigger that shows the same list.
 */
export const OverflowChip = React.forwardRef<HTMLButtonElement, OverflowChipProps>(function OverflowChip({ count, className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      data-slot="overflow-chip"
      className={cn("focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-md outline-none", className)}
      {...props}
    >
      <span aria-hidden="true" className={cn(CHIP_BASE, CHIP_VARIANTS.overflow)}>
        {formatMessage(SECTION_MESSAGES.overflowCount, { count })}
      </span>
    </button>
  )
})
