"use client"

import * as React from "react"
import { CircleHelp, Info } from "lucide-react"

import { cn } from "@/lib/utils"

export interface InfoIconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  /** The button's name, e.g. "About birth date" (catalog copy). Required: the button shows only an icon. */
  readonly "aria-label": string
  /** `help` shows "?" (`CircleHelp`), `info` shows "(i)" (`Info`). Defaults to `help`. */
  readonly icon?: "help" | "info"
}

/**
 * DESIGN.md `info-icon-button`: a 44 px target around an 18 px
 * `muted-foreground` icon, `muted` hover, `rounded-md`. It forwards its ref
 * and props, so it can be the trigger of a Tooltip (now) or a Popover (F5).
 */
export const InfoIconButton = React.forwardRef<HTMLButtonElement, InfoIconButtonProps>(function InfoIconButton(
  { icon = "help", className, type = "button", ...props },
  ref,
) {
  const Icon = icon === "info" ? Info : CircleHelp
  return (
    <button
      ref={ref}
      type={type}
      data-slot="info-icon-button"
      className={cn(
        "text-muted-foreground hover:bg-muted inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none transition-colors duration-150 ease-standard motion-reduce:transition-none focus-ring",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-[18px]" />
    </button>
  )
})
