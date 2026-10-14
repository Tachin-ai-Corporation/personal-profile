"use client"

import { Lock } from "lucide-react"
import { useEffect, useRef, type JSX, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { InlineBanner } from "@/components/ui/inline-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { recordUserActivity, type MappedError } from "@/lib/api"
import { COMMON_MESSAGES, formatMessage, SECTION_LOAD_NOUNS, STATE_MESSAGES, type LoadNounSection } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

/**
 * =============================================================================
 * StateFrame (F3-3): one read-state frame for both pages
 * =============================================================================
 *
 * A Section's or tab's loading, error and no-access states (FR103, UX-DR33,
 * UX-DR-P26/P27/P28, EXPERIENCE.md Skeleton / Inline banner):
 *
 * - `loading`: a skeleton variant (`table`, `kv`, `tiles`, `bars`, `cards`)
 *   marked `aria-busy`, the whole skeleton `aria-hidden` (column headers
 *   included) and named by a visually hidden "Loading {noun}", the shimmer
 *   static under reduced motion.
 * - `{ error }`, by `MappedError` kind: `session` → nothing (the session
 *   dialog owns it); `forbidden` → `NoAccess` (tab: centred bordered panel,
 *   Section: one row); anything else → the load-error banner with Retry, which
 *   calls only this frame's `onRetry` (revalidate only this frame's keys).
 * - `ready`: `children`; `onReady` fires once per transition into ready (deep
 *   links re-scroll then, `useHashAnchors`).
 *
 * Load-error copy: `/` Sections "Couldn't load {noun}" (`SECTION_LOAD_NOUNS`),
 * `/account` "Something went wrong while loading profile information".
 * A Section-level frame is the bordered table container itself; a tab-level
 * frame has no container of its own.
 * =============================================================================
 */

export type FrameState = "loading" | "ready" | { readonly error: MappedError }

export type SkeletonVariant = "table" | "kv" | "tiles" | "bars" | "cards"

export type FrameLevel = "section" | "tab"

/** Which load-error sentence the frame shows. */
export type LoadErrorCopy = { readonly kind: "section"; readonly sectionId: LoadNounSection } | { readonly kind: "page" }

/** The My Organizations card grid (DESIGN.md Organization card: 4 / 3 / 2 / 1 columns, 16 px gaps). */
export const ORG_GRID_CLASSES = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"

/** The visually hidden name of a loading frame: "Loading {noun}". */
export function loadingLabel(copy: LoadErrorCopy): string {
  return formatMessage(STATE_MESSAGES.frameLoading, {
    noun: copy.kind === "page" ? STATE_MESSAGES.loadNounPage : SECTION_LOAD_NOUNS[copy.sectionId],
  })
}

/** The load-error sentence for a frame. */
export function loadErrorMessage(copy: LoadErrorCopy): string {
  return copy.kind === "page"
    ? STATE_MESSAGES.loadError
    : formatMessage(STATE_MESSAGES.sectionLoadError, { section: SECTION_LOAD_NOUNS[copy.sectionId] })
}

// --- Load error ---------------------------------------------------------------

export interface LoadErrorProps {
  /** Revalidates only the failed tab's or Section's keys. */
  readonly onRetry: () => void
  readonly className?: string
  /**
   * The failed-load count (or any value that changes per failure): a new value
   * re-announces the alert, so a retry that fails again is heard.
   */
  readonly attempt?: number
  /** The sentence; defaults to the `/account` page copy. */
  readonly message?: string
}

/** `inline-banner-error`: the load-error sentence plus a separate Retry button (Story 7.1, FR103, UX-DR33). */
export function LoadError({ onRetry, className, attempt, message = STATE_MESSAGES.loadError }: LoadErrorProps): JSX.Element {
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
      {message}
    </InlineBanner>
  )
}

// --- No access ----------------------------------------------------------------

export interface NoAccessProps {
  readonly className?: string
  /** `tab` (default): the centred bordered panel; `section`: one row inside the Section's container. */
  readonly level?: FrameLevel
}

/** `no-access-panel`: a 20 px lock and one line, no action, no raw error (UX-DR-P26). */
export function NoAccess({ className, level = "tab" }: NoAccessProps): JSX.Element {
  return (
    <div
      role="status"
      data-slot="no-access"
      data-level={level}
      className={cn(
        "text-muted-foreground text-body-sm",
        level === "tab"
          ? "bg-card flex flex-col items-center gap-2 rounded-md border px-4 py-6 text-center"
          : "flex min-h-11 items-center gap-2 px-3 py-3",
        className,
      )}
    >
      <Lock aria-hidden="true" className="size-5 shrink-0" />
      <p>{STATE_MESSAGES.noAccess}</p>
    </div>
  )
}

// --- Error picker -------------------------------------------------------------

export interface ReadStateForProps {
  /** A read failure, from `mapApiError` / `mapFetchError`. */
  readonly error: MappedError
  readonly onRetry: () => void
  readonly className?: string
  /** Passed to `LoadError`: changes per failure, so a repeated failure is re-announced. */
  readonly attempt?: number
  /** Defaults to the `/account` page copy. */
  readonly loadError?: LoadErrorCopy
  /** Defaults to `tab`. */
  readonly level?: FrameLevel
}

/**
 * Picks the read state for a mapped error: an upstream 403 shows no access;
 * a session end shows nothing (the session dialog owns it); everything else,
 * proxy refusals included, shows the load error with Retry.
 */
export function ReadStateFor({
  error,
  onRetry,
  className,
  attempt,
  loadError = { kind: "page" },
  level = "tab",
}: ReadStateForProps): JSX.Element | null {
  switch (error.kind) {
    case "session":
      return null
    case "forbidden":
      return <NoAccess className={className} level={level} />
    // A read has no field to show `field`/`coded` at: the load error with Retry.
    case "generic":
    case "network":
    case "field":
    case "coded":
      return <LoadError onRetry={onRetry} className={className} attempt={attempt} message={loadErrorMessage(loadError)} />
  }
}

// --- Skeletons ----------------------------------------------------------------

/** A shimmer bar: `muted`, static under reduced motion. */
function Bar({ className }: { readonly className?: string }) {
  return <Skeleton className={cn("bg-muted motion-reduce:animate-none rounded-sm", className)} />
}

const TABLE_ROWS = 3
const KV_ROWS = 4
const TILES = 5
const BARS = 2
const CARDS = 12

const repeat = (count: number): number[] => Array.from({ length: count }, (_, i) => i)

export interface FrameSkeletonProps {
  readonly variant: SkeletonVariant
  /** `table` only: the real column headers (the 36 px header row is left out when empty). */
  readonly columns?: readonly string[]
}

/** The loading placeholders of one frame (DESIGN.md Skeleton / Skeletons (/account)). */
export function FrameSkeleton({ variant, columns = [] }: FrameSkeletonProps): JSX.Element {
  switch (variant) {
    case "table":
      return (
        // aria-hidden as a whole: the real column headers are visuals here, not a table.
        <div data-slot="frame-skeleton" data-variant="table" aria-hidden="true">
          {columns.length > 0 && (
            <div
              data-slot="frame-skeleton-header"
              className="bg-muted text-muted-foreground flex h-9 items-center gap-4 px-3 text-caption font-semibold tracking-[0.06em] uppercase"
            >
              {columns.map((column) => (
                <span key={column} className="min-w-0 flex-1 truncate">
                  {column}
                </span>
              ))}
            </div>
          )}
          {repeat(TABLE_ROWS).map((i) => (
            <div key={i} data-slot="frame-skeleton-row" className={cn("flex h-11 items-center px-3", i > 0 && "border-t")}>
              <Bar className="h-3 w-full" />
            </div>
          ))}
        </div>
      )
    case "kv":
      return (
        <div data-slot="frame-skeleton" data-variant="kv" aria-hidden="true">
          {repeat(KV_ROWS).map((i) => (
            <div key={i} data-slot="frame-skeleton-row" className={cn("grid h-11 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-4 px-3", i > 0 && "border-t")}>
              <Bar className="h-3 w-full max-w-32" />
              <Bar className="h-3 w-full" />
            </div>
          ))}
        </div>
      )
    case "tiles":
      return (
        <div data-slot="frame-skeleton" data-variant="tiles" aria-hidden="true" className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
          {repeat(TILES).map((i) => (
            <Bar key={i} className="h-28 w-full rounded-md" />
          ))}
        </div>
      )
    case "bars":
      return (
        <div data-slot="frame-skeleton" data-variant="bars" aria-hidden="true" className="flex flex-col gap-3 p-3">
          {repeat(BARS).map((i) => (
            <Bar key={i} className="h-11 w-full max-w-[480px] rounded-md" />
          ))}
        </div>
      )
    case "cards":
      return (
        <div data-slot="frame-skeleton" data-variant="cards" aria-hidden="true" className={ORG_GRID_CLASSES}>
          {repeat(CARDS).map((i) => (
            <div key={i} data-slot="frame-skeleton-card" className="bg-card flex flex-col gap-3 rounded-md border p-4">
              <Bar className="size-18 rounded-md" />
              <Bar className="h-4 w-3/4" />
              <Bar className="h-11 w-full rounded-md" />
            </div>
          ))}
        </div>
      )
  }
}

// --- StateFrame ---------------------------------------------------------------

export interface StateFrameProps {
  readonly state: FrameState
  readonly skeleton: SkeletonVariant
  /** `table` skeleton column headers. */
  readonly columns?: readonly string[]
  readonly loadError: LoadErrorCopy
  readonly level: FrameLevel
  /** Revalidates only this frame's keys. */
  readonly onRetry: () => void
  /** Changes per failure, so a repeated failure is re-announced. */
  readonly attempt?: number
  /**
   * Deep-link targets that must exist before the frame is ready (e.g. the
   * `#signature` row); rendered under the skeleton, banner or no-access row,
   * then replaced by `children`.
   */
  readonly anchors?: ReactNode
  /** Called once each time the frame becomes ready. */
  readonly onReady?: () => void
  readonly className?: string
  readonly children?: ReactNode
}

type FrameStatus = "loading" | "ready" | "error" | "forbidden" | "session"

function statusOf(state: FrameState): FrameStatus {
  if (state === "loading" || state === "ready") return state
  switch (state.error.kind) {
    case "session":
      return "session"
    case "forbidden":
      return "forbidden"
    default:
      return "error"
  }
}

/** One read-state frame (see the file header). */
export function StateFrame({
  state,
  skeleton,
  columns,
  loadError,
  level,
  onRetry,
  attempt,
  anchors,
  onReady,
  className,
  children,
}: StateFrameProps): JSX.Element | null {
  const status = statusOf(state)
  const latestOnReady = useRef(onReady)
  useEffect(() => {
    latestOnReady.current = onReady
  })
  useEffect(() => {
    if (status === "ready") latestOnReady.current?.()
  }, [status])

  if (status === "session") return null

  let body: ReactNode
  if (status === "ready") body = children
  else if (status === "loading")
    body = (
      <>
        {/* The skeleton is aria-hidden: this is what a screen reader meets in the busy frame. */}
        <span data-slot="frame-loading-label" className="sr-only">
          {loadingLabel(loadError)}
        </span>
        <FrameSkeleton variant={skeleton} columns={columns} />
      </>
    )
  else if (typeof state === "object")
    body = <ReadStateFor error={state.error} onRetry={onRetry} attempt={attempt} loadError={loadError} level={level} />

  return (
    <div
      data-slot="state-frame"
      data-state={status}
      data-level={level}
      aria-busy={status === "loading" ? "true" : undefined}
      className={cn(level === "section" && "bg-card overflow-hidden rounded-md border", className)}
    >
      {body}
      {status !== "ready" && anchors}
    </div>
  )
}
