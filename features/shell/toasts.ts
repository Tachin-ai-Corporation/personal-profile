"use client"

import { createElement } from "react"

import { TOAST_DURATION_MS, ToastAction } from "@/components/ui/toast"
import { toast } from "@/hooks/use-toast"
import { COMMON_MESSAGES } from "@/lib/shared/messages"

/**
 * The app's only toast API (Story 1.12): the one module that imports
 * `hooks/use-toast` (lint rule). Text is catalog copy, already formatted
 * (e.g. `formatMessage(SECTION_MESSAGES.saved, { section: "Phone" })`).
 * Every toast is announced politely, sits bottom-right on desktop and
 * bottom-center on mobile, and shows at most three at a time. There is no
 * undo toast.
 */

/** Auto-dismiss of the success and partial toasts; hover or focus pauses it. */
export const SUCCESS_TOAST_MS = TOAST_DURATION_MS
export const PARTIAL_TOAST_MS = TOAST_DURATION_MS

/** A shown toast: `dismiss()` closes it early. */
export interface ShownToast {
  readonly id: string
  readonly dismiss: () => void
}

function shown({ id, dismiss }: { id: string; dismiss: () => void }): ShownToast {
  return { id, dismiss }
}

/** Success (check icon, success-strong): e.g. "Phone saved.". Auto-dismisses after 5 s. */
export function toastSuccess(text: string): ShownToast {
  return shown(toast({ tone: "success", description: text, duration: SUCCESS_TOAST_MS }))
}

/** Partial failure (alert icon, warning-strong): e.g. "2 saved, 1 failed". Auto-dismisses after 5 s. */
export function toastPartial(text: string): ShownToast {
  return shown(toast({ tone: "partial", description: text, duration: PARTIAL_TOAST_MS }))
}

export interface ToastErrorOptions {
  /** Re-runs the failed action; the toast closes when Retry is chosen. */
  readonly onRetry: () => void
}

/**
 * Error (alert icon, error-strong) with a "Retry" action; it persists until
 * dismissed or retried. Retry runs `onRetry` at most once per toast (a second
 * click during the exit animation does nothing) and always closes the toast,
 * even when `onRetry` throws.
 */
export function toastError(text: string, { onRetry }: ToastErrorOptions): ShownToast {
  let retried = false
  let dismiss = (): void => {}
  const retry = (): void => {
    if (retried) return
    retried = true
    try {
      onRetry()
    } finally {
      dismiss()
    }
  }
  const action = createElement(ToastAction, { altText: COMMON_MESSAGES.retry, onClick: retry }, COMMON_MESSAGES.retry)
  const shownToast = shown(toast({ tone: "error", description: text, duration: Number.POSITIVE_INFINITY, action }))
  dismiss = shownToast.dismiss
  return shownToast
}
