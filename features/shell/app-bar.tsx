"use client"

import type { MouseEvent } from "react"
import { ExternalLink } from "lucide-react"
import { SHELL_COPY } from "@/lib/shared/messages"
import { returnToPortal } from "./leave"

/**
 * The app bar (Story 1.8): "1health" wordmark, a rule and the app title on the
 * left; "Return to 1health" on the right.
 *
 * The link's `href` is the session environment's portal URL, so it still works
 * without JS, but a click runs `returnToPortal()` (leave guard → logout →
 * navigate). It calls `requestLeave()` itself, so it is not asked here first.
 * The app is never framed (D10), so the link is always rendered.
 *
 * Below 768 px the wordmark and rule drop out (the mock's mobile app bar) so the
 * title and the link fit 360 px.
 */
export function AppBar({ portalUrl }: { portalUrl: string }) {
  const onReturn = (e: MouseEvent<HTMLAnchorElement>) => {
    // A modified or non-primary click keeps the browser's own behavior (new tab, ...).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void returnToPortal()
  }

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b bg-card px-4 md:px-6">
      <span className="hidden text-body font-bold text-primary md:inline dark:text-info-strong">1health</span>
      <span aria-hidden="true" className="hidden h-[18px] w-px bg-border md:block" />
      <span className="truncate text-body font-semibold">{SHELL_COPY.appTitle}</span>
      <a
        href={portalUrl}
        onClick={onReturn}
        className="focus-ring ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm text-body-sm font-medium text-link-text underline-offset-4 hover:underline"
      >
        {SHELL_COPY.returnToPortal}
        <ExternalLink className="size-4" aria-hidden="true" />
      </a>
    </header>
  )
}
