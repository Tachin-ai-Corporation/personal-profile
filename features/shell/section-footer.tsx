"use client"

import { forwardRef, type Key } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DisabledAction } from "@/components/ui/disabled-action"
import { InlineBanner } from "@/components/ui/inline-banner"
import { COMMON_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

/** A Section-level save error (catalog copy) with its Retry. */
export interface SectionFooterError {
  readonly message: string
  readonly onRetry: () => void
  /** Changes on every failure, so the same sentence is announced again. */
  readonly announceKey?: Key
}

/** The optional ghost "Add row" action (e.g. "Add phone"); `disabledReason` makes it a DisabledAction. */
export interface SectionFooterAddRow {
  readonly label: string
  readonly onClick: () => void
  readonly disabledReason?: string
}

export interface SectionFooterProps {
  /** Shows the "Unsaved changes" indicator (polite live region). */
  readonly dirty: boolean
  /** Save in flight: Save is busy ("Saving…", one send), Cancel is inert. */
  readonly saving: boolean
  /** A polite Section status, e.g. "There are no changes". */
  readonly status?: string | null
  readonly error?: SectionFooterError | null
  readonly addRow?: SectionFooterAddRow
  /** The Save button's id (Retry moves focus there while the error banner unmounts). */
  readonly saveButtonId?: string
  readonly onCancel: () => void
  readonly onSave: () => void
  readonly className?: string
}

/**
 * DESIGN.md Section table footer (Stories 1.11, 1.12): the Section-level
 * error (InlineBanner + Retry, focusable through the forwarded ref) above a
 * row with the unsaved-changes indicator (8 px warning dot + "Unsaved
 * changes", warning-strong) on the left and "Add row" (ghost), Cancel
 * (secondary) and Save (primary) on the right. Every button is
 * `type="button"`, so nothing here submits a form.
 */
export const SectionFooter = forwardRef<HTMLDivElement, SectionFooterProps>(function SectionFooter(
  { dirty, saving, status, error, addRow, saveButtonId, onCancel, onSave, className },
  errorRef,
) {
  return (
    <div data-slot="section-footer" className={cn("border-border flex flex-col gap-2 border-t px-3 py-2", className)}>
      {error ? (
        <InlineBanner
          ref={errorRef}
          variant="error"
          focusable
          announceKey={error.announceKey}
          action={
            <Button type="button" variant="link" size="touch" className="px-2" onClick={error.onRetry}>
              {COMMON_MESSAGES.retry}
            </Button>
          }
        >
          {error.message}
        </InlineBanner>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div aria-live="polite" className="min-w-0">
          {dirty ? (
            <span data-slot="unsaved-indicator" className="text-warning-strong text-body-sm flex items-center gap-2 font-medium">
              <span aria-hidden="true" className="bg-warning size-2 shrink-0 rounded-full" />
              {SECTION_MESSAGES.unsavedChanges}
            </span>
          ) : null}
        </div>
        <p role="status" className="text-muted-foreground text-body-sm">
          {status ?? ""}
        </p>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {addRow ? <AddRow {...addRow} /> : null}
          <Button type="button" variant="secondary" size="touch" aria-disabled={saving || undefined} onClick={onCancel}>
            {COMMON_MESSAGES.cancel}
          </Button>
          <Button id={saveButtonId} type="button" size="touch" busy={saving} busyLabel={SECTION_MESSAGES.saving} onClick={onSave}>
            {COMMON_MESSAGES.save}
          </Button>
        </div>
      </div>
    </div>
  )
})

function AddRow({ label, onClick, disabledReason }: SectionFooterAddRow) {
  if (disabledReason) {
    return (
      <DisabledAction reason={disabledReason}>
        <Plus aria-hidden="true" />
        {label}
      </DisabledAction>
    )
  }
  return (
    <Button type="button" variant="ghost" size="touch" className="text-primary-text" onClick={onClick}>
      <Plus aria-hidden="true" />
      {label}
    </Button>
  )
}
