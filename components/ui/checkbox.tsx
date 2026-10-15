"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /**
   * Shown but unavailable (like `Select ariaDisabled`): stays focusable with
   * `aria-disabled="true"`, a press does nothing (`onCheckedChange` is never
   * called) and it looks disabled. Pair it with a reason (e.g. `aria-describedby`).
   */
  readonly ariaDisabled?: boolean
}

/** A press or Space on an aria-disabled toggle does nothing (Radix skips its toggle on a prevented click). */
export function blockWhenAriaDisabled(ariaDisabled: boolean, onClick: React.MouseEventHandler<HTMLButtonElement> | undefined) {
  return (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (ariaDisabled) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }
}

/**
 * shadcn Checkbox on `@radix-ui/react-checkbox` (pinned; F6-2, e.g. the
 * address "Set as primary"). The 20 px box sits in a 44 × 44 target; its
 * boundary is `control-border`, checked fills `primary`, `aria-invalid`
 * gives the error border. Pair it with a `<label htmlFor>` (or `FormField`).
 */
const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, ariaDisabled = false, onClick, ...props }, ref) => (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      className={cn(
        "group/checkbox focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
        className,
      )}
      {...props}
      aria-disabled={ariaDisabled ? true : props["aria-disabled"]}
      onClick={blockWhenAriaDisabled(ariaDisabled, onClick)}
    >
      <span
        aria-hidden="true"
        className="border-control-border bg-card group-data-[state=checked]/checkbox:bg-primary group-data-[state=checked]/checkbox:border-primary group-data-[state=checked]/checkbox:text-primary-foreground group-aria-invalid/checkbox:border-error flex size-5 items-center justify-center rounded-sm border group-aria-invalid/checkbox:border-2"
      >
        <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex items-center justify-center">
          <CheckIcon className="size-3.5" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  ),
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
