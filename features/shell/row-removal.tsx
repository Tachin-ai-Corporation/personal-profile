"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { DisabledAction } from "@/components/ui/disabled-action"
import { LinkTextButton } from "@/components/ui/link-text-button"
import { COMMON_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

/**
 * A row's place in the edit view (UX-DR22, UX-DR54): `saved` as loaded,
 * `new` (added in this edit, "New · not saved"), `removed` (a saved row
 * struck through until Save, "Removed on save" + Restore).
 */
export type RowEditState = "saved" | "new" | "removed"

/** Row classes per state (DESIGN.md `table-row-new`, `table-row-removed`); `SectionTable` applies them. */
export const ROW_EDIT_STATE_CLASSES: Readonly<Record<RowEditState, string>> = {
  saved: "",
  new: "bg-background",
  // The value cells are struck through and muted; the actions cell (Restore) is not.
  removed: "text-muted-foreground [&>td:not([data-slot=row-actions-cell])]:line-through",
}

/** The status-cell text: "New · not saved", "Removed on save", or nothing for a saved row. */
export function RowEditStatus({ state, className }: { readonly state: RowEditState; readonly className?: string }): React.JSX.Element | null {
  if (state === "saved") return null
  return (
    // inline-block: a struck-through row's line-through doesn't reach the status text.
    <span data-slot="row-edit-status" className={cn("text-muted-foreground text-body-sm inline-block font-normal", className)}>
      {state === "new" ? SECTION_MESSAGES.newNotSaved : SECTION_MESSAGES.removedOnSave}
    </span>
  )
}

export interface RowRemovalProps {
  readonly state: RowEditState
  /** Remove: the Section marks a saved row `removed`, and deletes a `new` row outright. */
  readonly onRemove: () => void
  readonly onRestore: () => void
  /** Remove is unavailable (last entry, Primary): aria-disabled with this reason. */
  readonly disabledReason?: string
  /** An accessible name for Remove/Restore when the visible word isn't enough (e.g. in a list of rows). */
  readonly "aria-label"?: string
}

/**
 * The edit-view Remove / Restore action (F6-2; Story 1.11 `RowRemoval`,
 * UX-DR54): Remove on a saved or new row, "Restore" (a `link-text` button)
 * on a removed one. No toast, no confirm, no undo: nothing is deleted until
 * Save. The ref reaches whichever button is shown, so a Section that removes
 * a row from the read-view menu can focus its Restore.
 */
export const RowRemoval = React.forwardRef<HTMLButtonElement, RowRemovalProps>(function RowRemoval(
  { state, onRemove, onRestore, disabledReason, "aria-label": ariaLabel },
  ref,
) {
  if (state === "removed") {
    return (
      <LinkTextButton ref={ref} data-slot="row-restore" aria-label={ariaLabel} className="px-2" onClick={onRestore}>
        {COMMON_MESSAGES.restore}
      </LinkTextButton>
    )
  }
  if (disabledReason) {
    return (
      <DisabledAction ref={ref} reason={disabledReason} aria-label={ariaLabel} className="text-body-sm">
        {SECTION_MESSAGES.remove}
      </DisabledAction>
    )
  }
  return (
    <Button ref={ref} type="button" variant="ghost" size="touch" data-slot="row-remove" aria-label={ariaLabel} className="text-body-sm" onClick={onRemove}>
      {SECTION_MESSAGES.remove}
    </Button>
  )
})
