"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { Button } from "@/components/ui/button"
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { COMMON_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

export interface ConfirmDialogExtraAction {
  readonly label: string
  readonly onClick: () => void
}

export interface ConfirmDialogProps {
  readonly open: boolean
  readonly title: string
  readonly body: React.ReactNode
  readonly confirmLabel: string
  /** `destructive` fills the confirm button with `bg-destructive-fill` (D13). */
  readonly variant: "standard" | "destructive"
  readonly onConfirm: () => void
  /** Cancel, Escape and an overlay click all call this (never `onConfirm`). */
  readonly onCancel: () => void
  /** An outline button between Cancel and confirm (the leave guard's "Discard"). */
  readonly extraAction?: ConfirmDialogExtraAction
  /** While true the confirm button shows a spinner and nothing closes the dialog. */
  readonly busy?: boolean
  /** The busy confirm's label (e.g. "Turning off…"); defaults to "Saving…". */
  readonly busyLabel?: string
  /** Defaults to "Cancel"; the leave guard passes "Keep editing". */
  readonly cancelLabel?: string
  /** `false` leaves the confirm button out (the leave guard when a participant can't save). Defaults to `true`. */
  readonly showConfirm?: boolean
  /**
   * Called as the dialog closes, before focus returns to the trigger. Return
   * `true` when it moved focus itself (e.g. to a first invalid field).
   */
  readonly onCloseFocus?: () => boolean
}

/**
 * The app's only confirm dialog (Story 1.11, UX-DR36): an `alertdialog` over
 * the `scrim` token. Focus starts on Cancel and returns, on close, to the
 * element that was focused when it opened.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  variant,
  onConfirm,
  onCancel,
  extraAction,
  busy = false,
  busyLabel = SECTION_MESSAGES.saving,
  cancelLabel = COMMON_MESSAGES.cancel,
  showConfirm = true,
  onCloseFocus,
}: ConfirmDialogProps): React.JSX.Element {
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const returnFocusRef = React.useRef<HTMLElement | null>(null)

  // Runs before Radix moves focus into the dialog (its focus scope uses a passive effect).
  React.useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement
  }, [open])

  const cancel = (): void => {
    if (!busy) onCancel()
  }
  const blockWhileBusy = (event: Event): void => {
    if (busy) event.preventDefault()
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => {
        if (!next) cancel()
      }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          role="alertdialog"
          data-slot="confirm-dialog"
          aria-busy={busy || undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cancelRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            const target = returnFocusRef.current
            returnFocusRef.current = null
            if (onCloseFocus?.()) {
              event.preventDefault()
              return
            }
            // A trigger removed while the dialog was open is skipped; Radix's default applies.
            if (target?.isConnected) {
              event.preventDefault()
              target.focus()
            }
          }}
          onEscapeKeyDown={blockWhileBusy}
          onPointerDownOutside={blockWhileBusy}
          onInteractOutside={blockWhileBusy}
          className={cn(
            "bg-popover text-popover-foreground fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg",
            // ease-premium entrance, 250 ms (none under reduced motion).
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 [animation-duration:250ms] [animation-timing-function:var(--ease-premium)] motion-reduce:animate-none",
          )}
        >
          <DialogPrimitive.Title className="text-body font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div className="text-body-sm text-muted-foreground">{body}</div>
          </DialogPrimitive.Description>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              ref={cancelRef}
              type="button"
              variant="secondary"
              size="touch"
              aria-disabled={busy || undefined}
              onClick={onCancel}
            >
              {cancelLabel}
            </Button>
            {extraAction ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                aria-disabled={busy || undefined}
                onClick={extraAction.onClick}
              >
                {extraAction.label}
              </Button>
            ) : null}
            {showConfirm ? (
              <Button
                type="button"
                variant={variant === "destructive" ? "destructive" : "default"}
                size="touch"
                busy={busy}
                busyLabel={busyLabel}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}
