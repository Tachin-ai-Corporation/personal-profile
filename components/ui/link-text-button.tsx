import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A `link-text` styled button (e.g. the Practice name trigger, "Try again."):
 * 44 px tall target, underline on hover, the shared `focus-ring`.
 */
export const LinkTextButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function LinkTextButton(
  { className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-slot="link-text-button"
      className={cn(
        "text-link-text inline-flex min-h-11 items-center rounded-md text-left font-medium underline-offset-4 outline-none hover:underline focus-ring",
        className,
      )}
      {...props}
    />
  )
})
