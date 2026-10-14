"use client"

import { AlertCircle, Lock } from "lucide-react"
import type { JSX } from "react"

import { Button } from "@/components/ui/button"
import type { MappedError } from "@/lib/api"
import { COMMON_MESSAGES, STATE_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

export interface LoadErrorProps {
  /** Revalidates only the failed tab's or Section's keys. */
  readonly onRetry: () => void
  readonly className?: string
}

/** `inline-banner-error`: the load-error sentence plus a separate Retry button (Story 7.1, FR103). */
export function LoadError({ onRetry, className }: LoadErrorProps): JSX.Element {
  return (
    <div
      data-slot="load-error"
      className={cn("bg-card text-error-strong flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-body-sm", className)}
    >
      <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
      {/* Only the sentence is the live region; Retry sits outside it so it isn't re-announced. */}
      <p role="alert" className="font-medium">
        {STATE_MESSAGES.loadError}
      </p>
      <Button type="button" variant="link" size="touch" className="px-2" onClick={onRetry}>
        {COMMON_MESSAGES.retry}
      </Button>
    </div>
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
}

/**
 * Picks the read state for a mapped error: an upstream 403 shows no access;
 * a session end shows nothing (the session dialog owns it); everything else,
 * proxy refusals included, shows the load error with Retry.
 */
export function ReadStateFor({ error, onRetry, className }: ReadStateForProps): JSX.Element | null {
  switch (error.kind) {
    case "session":
      return null
    case "forbidden":
      return <NoAccess className={className} />
    case "generic":
    case "network":
      return <LoadError onRetry={onRetry} className={className} />
  }
}
