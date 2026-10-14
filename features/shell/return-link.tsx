"use client"

import { ExternalLink } from "lucide-react"
import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { useNavigate } from "./navigate"
import { isPlainClick } from "./page-nav"
import { usePortalUrl } from "./portal-url-provider"

/**
 * "Return to 1health" (Stories 1.7, 1.8): always shown, never framed (AD-5).
 * Activation goes through `navigate({ external: "portal" })`: leave guard,
 * before-exit callbacks, logout, then the portal in the same tab. A
 * modified click (new tab or window) is left to the browser.
 */
export function ReturnLink({ className }: { readonly className?: string }) {
  const navigate = useNavigate()
  const portalUrl = usePortalUrl()

  return (
    <a
      href={portalUrl}
      onClick={(event) => {
        // Modified clicks keep the browser default (the portal in a new tab, no logout), as in PageNav.
        if (!isPlainClick(event)) return
        event.preventDefault()
        void navigate({ external: "portal" })
      }}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-body-sm font-medium text-link-text underline-offset-4 hover:underline",
        "outline-none focus-ring",
        className,
      )}
    >
      {SHELL_MESSAGES.returnTo1health}
      <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
    </a>
  )
}
