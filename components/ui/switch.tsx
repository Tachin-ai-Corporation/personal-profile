"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { blockWhenAriaDisabled } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  /** Shown but unavailable: focusable, `aria-disabled="true"`, a press does nothing, disabled look (see `Checkbox`). */
  readonly ariaDisabled?: boolean
}

/**
 * shadcn Switch on `@radix-ui/react-switch` (pinned; F6-2, e.g. phone and
 * email notifications, Stories 3.4 and 3.6). A 44 × 24 track inside a 44 px
 * tall target: off is `muted` with a `control-border` boundary, on fills
 * `primary`; the thumb slides (no motion under reduced motion). Pair it
 * with a `<label htmlFor>`; its state is read as on/off by assistive tech.
 */
const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(({ className, ariaDisabled = false, onClick, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    data-slot="switch"
    className={cn(
      "group/switch focus-ring inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-md outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
      className,
    )}
    {...props}
    aria-disabled={ariaDisabled ? true : props["aria-disabled"]}
    onClick={blockWhenAriaDisabled(ariaDisabled, onClick)}
  >
    <span
      aria-hidden="true"
      className="border-control-border bg-muted group-data-[state=checked]/switch:bg-primary group-data-[state=checked]/switch:border-primary relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-150 motion-reduce:transition-none"
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-card pointer-events-none block size-5 translate-x-0.5 rounded-full shadow-xs transition-transform duration-150 ease-standard data-[state=checked]:translate-x-[1.25rem] motion-reduce:transition-none"
      />
    </span>
  </SwitchPrimitive.Root>
))
Switch.displayName = "Switch"

export { Switch }
