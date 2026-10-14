"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const variantStyles = {
  default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
  // D13: the fill is the destructive-fill token (white text 5.93:1 in both themes).
  destructive:
    "bg-destructive-fill text-destructive-foreground shadow-xs hover:bg-destructive-fill/90",
  outline:
    "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
  secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
  // Text links read the link-text token (D13), never text-info-strong.
  link: "text-link-text underline-offset-4 hover:underline",
}

const sizeStyles = {
  default: "h-9 px-4 py-2 has-[>svg]:px-3",
  sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
  lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
  icon: "size-9",
  /** 44 px target (DESIGN.md touch-target) for profile surfaces. */
  touch: "h-11 rounded-md px-4 py-2 has-[>svg]:px-3",
}

const baseStyles =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 ease-standard active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-ring aria-disabled:opacity-50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles
  size?: keyof typeof sizeStyles
  asChild?: boolean
  /**
   * In flight: shows a spinner (and `busyLabel`, when given, in place of the
   * children), sets `aria-busy` and `aria-disabled` and a progress cursor.
   * The button keeps focus and stays in the tab order (never `disabled`).
   */
  busy?: boolean
  /**
   * The label shown while `busy` (e.g. "Saving…"); defaults to the children.
   * When given, a visually hidden polite status beside the button announces it
   * while busy (the region is always rendered, so the change is heard).
   */
  busyLabel?: string
}

/** `aria-disabled` as a prop value: `true` or `"true"`. */
function isAriaDisabled(value: ButtonProps["aria-disabled"]): boolean {
  return value === true || value === "true"
}

/**
 * A busy or `aria-disabled` button is inert: click, Enter and Space do
 * nothing, including a form submit, and with `asChild` the child's own
 * onClick is suppressed too.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "default", asChild = false, busy = false, busyLabel, onClick, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"
    const inert = busy || isAriaDisabled(props["aria-disabled"])
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
      if (inert) {
        event.preventDefault()
        return
      }
      onClick?.(event)
    }
    let content: React.ReactNode = children
    if (asChild) {
      // Slot runs the child's onClick before ours: drop it while inert.
      if (inert && React.isValidElement<{ onClick?: unknown }>(children)) content = React.cloneElement(children, { onClick: undefined })
    } else if (busy) {
      content = (
        <>
          <Loader2 aria-hidden="true" data-slot="button-spinner" className="animate-spin motion-reduce:animate-none" />
          {busyLabel ?? children}
        </>
      )
    }
    const button = (
      <Comp
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          busy ? "cursor-progress" : "aria-disabled:cursor-not-allowed",
          className,
        )}
        ref={ref}
        {...props}
        aria-disabled={inert || undefined}
        aria-busy={busy || props["aria-busy"] || undefined}
        onClick={handleClick}
      >
        {content}
      </Comp>
    )
    if (busyLabel === undefined) return button
    return (
      <>
        {button}
        <span role="status" data-slot="button-busy-status" className="sr-only">
          {busy ? busyLabel : ""}
        </span>
      </>
    )
  },
)
Button.displayName = "Button"

// For backward compatibility
function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: keyof typeof variantStyles
  size?: keyof typeof sizeStyles
  className?: string
} = {}) {
  return cn(baseStyles, variantStyles[variant], sizeStyles[size], className)
}

export { Button, buttonVariants }
