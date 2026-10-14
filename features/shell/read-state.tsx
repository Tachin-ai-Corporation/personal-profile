"use client"

import { Lock } from "lucide-react"
import type { JSX } from "react"

import { Button } from "@/components/ui/button"
import { InlineBanner } from "@/components/ui/inline-banner"
import { recordUserActivity, type MappedError } from "@/lib/api"
import { COMMON_MESSAGES, STATE_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

export interface LoadErrorProps {
  /** Revalidates only the failed tab's or Section's keys. */
  readonly onRetry: () => void
  readonly className?: string
  /**
   * The failed-load count (or any value that changes per failure): a new value
   * re-announces the alert, so a retry that fails again is heard.
   */
  readonly attempt?: number
}

/** `inline-banner-error`: the load-error sentence plus a separate Retry button (Story 7.1, FR103). */
export function LoadError({ onRetry, className, attempt }: LoadErrorProps): JSX.Element {
  return (
    <InlineBanner
      variant="error"
      data-slot="load-error"
      className={className}
      announceKey={attempt}
      // Only the sentence is the live region; Retry sits outside it so it isn't re-announced.
      action={
        <Button
          type="button"
          variant="link"
          size="touch"
          className="px-2"
          onClick={() => {
            // Retrying is the user acting: record it, so reading alone isn't idled out (Story 1.6).
            void recordUserActivity()
            onRetry()
          }}
        >
          {COMMON_MESSAGES.retry}
        </Button>
      }
    >
      {STATE_MESSAGES.loadError}
    </InlineBanner>
  )
}

export interface NoAccessProps {
  readonly className?: string
}

/** `no-access-panel`: a 20 px lock and one line, no action, no raw error (UX-DR-P26). */
export function NoAccess({ className }: NoAccessProps): JSX.Element {
  return (
    <div
      role="status"
      data-slot="no-access"
      className={cn(
        "bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-md border px-4 py-8 text-center text-body-sm",
        className,
      )}
    >
      <Lock aria-hidden="true" className="size-5" />
      <p>{STATE_MESSAGES.noAccess}</p>
    </div>
  )
}

export interface ReadStateForProps {
  /** A read failure, from `mapApiError` / `mapFetchError`. */
  readonly error: MappedError
  readonly onRetry: () => void
  readonly className?: string
  /** Passed to `LoadError`: changes per failure, so a repeated failure is re-announced. */
  readonly attempt?: number
}

/**
 * Picks the read state for a mapped error: an upstream 403 shows no access;
 * a session end shows nothing (the session dialog owns it); everything else,
 * proxy refusals included, shows the load error with Retry.
 */
export function ReadStateFor({ error, onRetry, className, attempt }: ReadStateForProps): JSX.Element | null {
  switch (error.kind) {
    case "session":
      return null
    case "forbidden":
      return <NoAccess className={className} />
    // A read has no field to show `field`/`coded` at: the load error with Retry.
    case "generic":
    case "network":
    case "field":
    case "coded":
      return <LoadError onRetry={onRetry} className={className} attempt={attempt} />
  }
}
