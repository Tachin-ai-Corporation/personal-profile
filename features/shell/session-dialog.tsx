"use client"

import { TimerOff } from "lucide-react"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
 * Laid out like the idle warning (`DialogHeader` / `DialogFooter`, a brand-blue
 * icon tile; redesign 2026-11): Escape and an outside press do nothing.
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
    <Dialog open={open}>
      <DialogContent
        role="alertdialog"
        data-slot="session-dialog"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          returnRef.current?.focus()
        }}
        onEscapeKeyDown={preventDismiss}
        onPointerDownOutside={preventDismiss}
        onInteractOutside={preventDismiss}
      >
        <DialogHeader className="gap-3 pr-6 pb-5">
          <span aria-hidden="true" className="bg-tint-blue-strong text-tint-blue-strong-foreground inline-flex size-12 items-center justify-center rounded-full">
            <TimerOff className="size-6" />
          </span>
          <DialogTitle>{SESSION_EXPIRED_MESSAGES.title}</DialogTitle>
          <DialogDescription className="text-body">{SESSION_EXPIRED_MESSAGES.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="max-sm:flex-col max-sm:items-stretch">
          <Button ref={returnRef} type="button" size="touch" onClick={returnTo1health}>
            {SHELL_MESSAGES.returnTo1health}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
