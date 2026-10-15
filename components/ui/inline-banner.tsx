"use client"

import * as React from "react"
import { AlertCircle, Info } from "lucide-react"

import { cn } from "@/lib/utils"

const VARIANTS = {
  /** `inline-banner-error`: card fill, error-strong text, alert-circle. */
  error: { className: "bg-card text-error-strong", role: "alert", Icon: AlertCircle },
  /** `inline-banner-info`: accent fill, foreground text, info-circle. */
  info: { className: "bg-accent text-foreground", role: "status", Icon: Info },
} as const

export interface InlineBannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "role" | "children"> {
  readonly variant: keyof typeof VARIANTS
  /** The sentence; only it is the live region (`alert` for error, `status` for info). */
  readonly children: React.ReactNode
  /** An optional action (e.g. a Retry button), rendered outside the live region so it isn't re-announced. */
  readonly action?: React.ReactNode
  /** `tabIndex={-1}`, so the caller can move focus to the banner (e.g. a save error). */
  readonly focusable?: boolean
  /**
   * Remounts the live region when it changes, so the same sentence is
   * announced again (e.g. a retry that failed again).
   */
  readonly announceKey?: React.Key
}

/**
 * DESIGN.md Inline banner: a load error inside a table container, a Section
 * save error, or (info) the draft restore / conflict notice.
 */
/**
 * A banner focused by script after a mouse action matches `:focus` but not
 * `:focus-visible` in Chromium, so a focusable banner shows the focus-ring
 * look (2 px ring outline, 2 px offset, glow) on `:focus`.
 */
const FOCUSABLE_RING = "focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring focus:shadow-glow"

export const InlineBanner = React.forwardRef<HTMLDivElement, InlineBannerProps>(function InlineBanner(
  { variant, children, action, focusable = false, announceKey, className, ...props },
  ref,
) {
  const { className: variantClassName, role, Icon } = VARIANTS[variant]
  const { "data-slot": callerSlot, ...rest } = props as InlineBannerProps & { "data-slot"?: string }
  return (
    <div
      {...rest}
      ref={ref}
      // The caller's slot (e.g. "load-error") is added, never a replacement for "inline-banner".
      data-slot={["inline-banner", callerSlot].filter(Boolean).join(" ")}
      data-variant={variant}
      tabIndex={focusable ? -1 : undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-body-sm",
        focusable ? FOCUSABLE_RING : null,
        variantClassName,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <p key={announceKey} role={role} className="font-medium">
        {children}
      </p>
      {action}
    </div>
  )
})
