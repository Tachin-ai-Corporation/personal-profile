"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { sessionEvents as defaultSessionEvents, type SessionEvents } from "@/lib/api"
import { saveLoginIntent } from "@/lib/shared/login-intent"
import { SESSION_EXPIRED_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { runBeforeSessionExpired } from "./exit-hooks"
import { confirmUnload } from "./leave"
import { usePortalUrl } from "./portal-url-provider"

const preventDismiss = (event: Event): void => event.preventDefault()

export interface SessionDialogProps {
  /** Test seams. */
  readonly events?: SessionEvents
  readonly assign?: (url: string) => void
}

/**
 * The session-expired dialog (Story 1.7), the only module that opens it. On
 * `session-expired` (already published on mount, or later) it runs the
 * before-session-expired callbacks, saves the login intent and opens a
 * non-dismissable dialog over the scrim; "Return to 1health" goes to the
 * portal in the same tab, without logout. A second publish opens nothing new.
 */
export function SessionDialog({ events = defaultSessionEvents, assign }: SessionDialogProps) {
  const portalUrl = usePortalUrl()
  const [open, setOpen] = useState(false)
  const handled = useRef(false)
  const returnRef = useRef<HTMLButtonElement>(null)

  const handleExpired = useEffectEvent(() => {
    if (handled.current) return
    handled.current = true
    runBeforeSessionExpired()
    saveLoginIntent(`${window.location.pathname}${window.location.search}`)
    setOpen(true)
  })

  useEffect(() => {
    if (events.hasPublished("session-expired")) handleExpired()
    return events.subscribe("session-expired", () => handleExpired())
  }, [events])

  function returnTo1health(): void {
    confirmUnload()
    ;(assign ?? ((url: string) => window.location.assign(url)))(portalUrl)
  }

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          role="alertdialog"
          data-slot="session-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            returnRef.current?.focus()
          }}
          onEscapeKeyDown={preventDismiss}
          onPointerDownOutside={preventDismiss}
          onInteractOutside={preventDismiss}
          className="bg-popover text-popover-foreground fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 [animation-duration:250ms] [animation-timing-function:var(--ease-premium)] motion-reduce:animate-none"
        >
          <DialogPrimitive.Title className="text-body font-semibold">{SESSION_EXPIRED_MESSAGES.title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-body-sm text-muted-foreground">{SESSION_EXPIRED_MESSAGES.body}</DialogPrimitive.Description>
          <div className="flex justify-end">
            <Button ref={returnRef} type="button" size="touch" onClick={returnTo1health}>
              {SHELL_MESSAGES.returnTo1health}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}
