"use client"

import type { ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { SHELL_COPY } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { sectionHeadingId } from "./sections"

/**
 * =============================================================================
 * SectionFrame (Story 1.8, UX-DR "table container" / skeleton / error banner)
 * =============================================================================
 *
 * One Section on the page: a `<section id aria-labelledby>` with a 44 px header
 * row (the `h2`, focusable via `tabIndex={-1}` so the Section menu can move
 * focus to it) and the bordered table container.
 *
 * - `loading`: three 44 px skeleton rows under the real column headers, with the
 *   container `aria-busy="true"`. The shimmer stops under reduced motion (the
 *   `@layer base` rule in `app/globals.css`).
 * - `error`: the rows are replaced by an inline banner, "Couldn't load {title} ·
 *   Retry"; Retry calls only this frame's `onRetry`.
 * - `ready`: renders `children`.
 *
 * `anchors` holds deep-link targets that must exist before the Section is ready
 * (Personal information's `#signature` row); they render under the skeleton or
 * the banner and give way to `children` once ready.
 * =============================================================================
 */

export type SectionFrameState = "loading" | "error" | "ready"

export interface SectionFrameProps {
  id: string
  title: string
  /** Column headers; empty for the key/value table and the Insurance cards. */
  columns: readonly string[]
  state: SectionFrameState
  onRetry?: () => void
  anchors?: ReactNode
  children?: ReactNode
}

const SKELETON_ROWS = 3

export function SectionFrame({ id, title, columns, state, onRetry, anchors, children }: SectionFrameProps) {
  const headingId = sectionHeadingId(id)
  return (
    <section id={id} aria-labelledby={headingId} className="min-w-0">
      <div className="mb-2 flex min-h-11 items-center gap-2">
        <h2 id={headingId} tabIndex={-1} className="focus-ring rounded-sm text-body font-semibold">
          {title}
        </h2>
      </div>
      <div
        data-slot="section-frame"
        data-state={state}
        aria-busy={state === "loading" ? "true" : undefined}
        className="overflow-hidden rounded-md border bg-card"
      >
        {state === "ready" ? (
          children
        ) : (
          <>
            {columns.length > 0 && (
              <div
                data-slot="section-frame-header"
                className="flex h-9 items-center gap-4 bg-muted px-3 text-caption font-semibold uppercase tracking-[0.06em] text-muted-foreground"
              >
                {columns.map((column) => (
                  <span key={column} className="min-w-0 flex-1 truncate">
                    {column}
                  </span>
                ))}
              </div>
            )}
            {state === "loading" ? (
              <div aria-hidden="true">
                {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <div
                    key={i}
                    data-slot="section-frame-skeleton-row"
                    className={cn("flex h-11 items-center px-3", i > 0 && "border-t")}
                  >
                    <Skeleton className="h-3 w-full rounded-sm bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              <div
                data-slot="section-frame-error"
                role="alert"
                className="flex min-h-11 flex-wrap items-center gap-x-1 px-3 text-body-sm text-error-strong"
              >
                <AlertCircle className="mr-1 size-4 shrink-0" aria-hidden="true" />
                <span>{SHELL_COPY.loadError(title)} · </span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm font-medium text-link-text underline-offset-4 hover:underline"
                >
                  {SHELL_COPY.retry}
                </button>
              </div>
            )}
            {anchors}
          </>
        )}
      </div>
    </section>
  )
}
