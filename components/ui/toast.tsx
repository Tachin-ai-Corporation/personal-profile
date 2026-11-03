"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { AlertCircle, CheckCircle, X } from "lucide-react"

import { COMMON_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

/**
 * The exit animation length; `hooks/use-toast` removes a dismissed toast after
 * exactly this long, so it never lingers in the DOM.
 */
export const TOAST_EXIT_MS = 200

/** The default auto-dismiss (EXPERIENCE.md Toast: 5 s, paused on hover or focus); a toast may set its own `duration`. */
export const TOAST_DURATION_MS = 5000

/**
 * DESIGN.md `toast`: popover surface, `rounded-md`, elevation-2 (`shadow-lg`).
 * Enters from the bottom, leaves with a fade; no motion under reduced motion.
 */
const baseStyles =
  "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-md border bg-popover p-4 pr-12 text-popover-foreground shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-bottom-full [animation-duration:200ms] motion-reduce:animate-none motion-reduce:transition-none"

/** Toast tones (DESIGN.md Toast): the icon carries the tone; the surface stays neutral. */
const TONES = {
  default: { Icon: null, iconClassName: "" },
  // Design refresh (PROPOSAL): the success icon pops in once (300 ms; none under reduced motion).
  success: { Icon: CheckCircle, iconClassName: "text-success-strong animate-icon-pop" },
  partial: { Icon: AlertCircle, iconClassName: "text-warning-strong" },
  error: { Icon: AlertCircle, iconClassName: "text-error-strong" },
} as const

export type ToastTone = keyof typeof TONES

const ToastProvider = ToastPrimitives.Provider

/**
 * Bottom-center on mobile, bottom-right from 768 px (DESIGN.md Toast). The
 * bottom edge is raised by `--toast-bottom-offset` (app/globals.css; 0 by
 * default) so toasts sit above the mobile Save all pill. The list itself lets
 * pointers through (only the toasts take them), so it never blocks the page.
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "pointer-events-none fixed bottom-[var(--toast-bottom-offset)] left-1/2 z-[100] flex max-h-screen w-full max-w-[420px] -translate-x-1/2 flex-col gap-2 p-4 outline-none md:left-auto md:right-0 md:translate-x-0",
      className,
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

interface ToastProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> {
  tone?: ToastTone
}

const Toast = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Root>, ToastProps>(
  ({ className, tone = "default", children, ...props }, ref) => {
    const { Icon, iconClassName } = TONES[tone]
    return (
      <ToastPrimitives.Root ref={ref} data-tone={tone} className={cn(baseStyles, className)} {...props}>
        {Icon ? <Icon aria-hidden="true" data-slot="toast-icon" className={cn("mt-0.5 size-5 shrink-0", iconClassName)} /> : null}
        {children}
      </ToastPrimitives.Root>
    )
  },
)
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "text-link-text inline-flex h-11 shrink-0 items-center justify-center self-center rounded-md px-3 text-body-sm font-medium underline-offset-4 outline-none transition-colors hover:underline focus-ring disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

/** The 44 px close button, always visible (a hidden close would hide the only way to dismiss an error toast by touch). */
const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    aria-label={COMMON_MESSAGES.dismissNotification}
    className={cn(
      "text-muted-foreground hover:text-foreground hover:bg-muted absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-md outline-none transition-colors focus-ring",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X aria-hidden="true" className="size-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn("text-body-sm font-semibold", className)} {...props} />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description ref={ref} className={cn("text-body-sm font-medium", className)} {...props} />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps2 = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<React.ComponentPropsWithoutRef<typeof ToastAction>>

export {
  type ToastProps2 as ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
