"use client"

import * as React from "react"

import { Button, type ButtonProps } from "@/components/ui/button"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** DESIGN.md `button-aria-disabled`: muted fill, muted-foreground text, border, not-allowed cursor (no fade). */
export const DISABLED_ACTION_STYLES =
  "bg-muted text-muted-foreground border border-border shadow-none hover:bg-muted hover:text-muted-foreground dark:bg-muted dark:border-border dark:hover:bg-muted active:scale-100 aria-disabled:opacity-100 aria-disabled:cursor-not-allowed"

export interface DisabledActionProps extends Omit<ButtonProps, "onClick" | "busy" | "busyLabel" | "disabled" | "asChild" | "variant" | "type"> {
  /** Why the action is unavailable, e.g. "Verify this number first" (catalog copy). */
  readonly reason: string
  /** Lets the reason tooltip wrap (max 320 px) when it runs past one line. */
  readonly wideReason?: boolean
}

/**
 * An action that can't run right now (UX-DR28, UX-DR55): it looks disabled
 * but stays in the tab order (`aria-disabled="true"`), click, Enter and Space
 * do nothing (it is always `type="button"`), and the reason is in a Tooltip
 * (hover, focus, tap; a press keeps it open) and in an
 * always-rendered visually hidden line referenced by `aria-describedby`.
 */
export const DisabledAction = React.forwardRef<HTMLButtonElement, DisabledActionProps>(function DisabledAction(
  { reason, wideReason = false, className, size = "touch", children, "aria-describedby": describedBy, ...props },
  ref,
) {
  const reasonId = React.useId()

  return (
    <>
      {/* A press does nothing here, so it must not close the reason either. */}
      <Tooltip content={reason} wide={wideReason} keepOpenOnPress>
        <Button
          ref={ref}
          size={size}
          variant="outline"
          data-slot="disabled-action"
          {...props}
          // Always "button": a submit-type control could block a form's implicit submit.
          type="button"
          className={cn(DISABLED_ACTION_STYLES, className)}
          // aria-disabled makes the Button inert: click, Enter and Space do nothing.
          aria-disabled="true"
          aria-describedby={[describedBy, reasonId].filter(Boolean).join(" ")}
        >
          {children}
        </Button>
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </>
  )
})
