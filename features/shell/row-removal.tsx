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

/** Sets a callback or object ref. */
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value)
  else if (ref) (ref as React.RefObject<T | null>).current = value
}

/** The status-cell text: "New · not saved", "Removed on save", or nothing for a saved row. */
export function RowEditStatus({ state, id, className }: { readonly state: RowEditState; readonly id?: string; readonly className?: string }): React.JSX.Element | null {
  if (state === "saved") return null
  return (
    // inline-block: a struck-through row's line-through doesn't reach the status text.
    <span id={id} data-slot="row-edit-status" className={cn("text-muted-foreground text-body-sm inline-block font-normal", className)}>
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
  /** The id of the row's `RowEditStatus`: Restore is described by "Removed on save". */
  readonly statusId?: string
}

/**
 * The edit-view Remove / Restore action (F6-2; Story 1.11 `RowRemoval`,
 * UX-DR54): Remove on a saved or new row, "Restore" (a `link-text` button)
 * on a removed one, described by the row's "Removed on save" status
 * (`statusId`). No toast, no confirm, no undo: nothing is deleted until
 * Save. Focus stays on the action when Remove and Restore swap. The ref
 * reaches whichever button is shown, so a Section that removes a row from
 * the read-view menu can focus its Restore.
 */
export const RowRemoval = React.forwardRef<HTMLButtonElement, RowRemovalProps>(function RowRemoval(
  { state, onRemove, onRestore, disabledReason, "aria-label": ariaLabel, statusId },
  ref,
) {
  const ownRef = React.useRef<HTMLButtonElement | null>(null)
  const setRef = React.useCallback(
    (element: HTMLButtonElement | null) => {
      ownRef.current = element
      assignRef(ref, element)
    },
    [ref],
  )
  // The pressed button unmounts when Remove and Restore swap: hand focus to the new one.
  const keepFocusRef = React.useRef(false)
  const swap = (run: () => void) => () => {
    keepFocusRef.current = ownRef.current !== null && document.activeElement === ownRef.current
    run()
  }
  React.useLayoutEffect(() => {
    if (!keepFocusRef.current) return
    keepFocusRef.current = false
    ownRef.current?.focus()
  }, [state])

  if (state === "removed") {
    return (
      <LinkTextButton ref={setRef} data-slot="row-restore" aria-label={ariaLabel} aria-describedby={statusId} className="px-2" onClick={swap(onRestore)}>
        {COMMON_MESSAGES.restore}
      </LinkTextButton>
    )
  }
  if (disabledReason) {
    return (
      <DisabledAction ref={setRef} reason={disabledReason} aria-label={ariaLabel} className="text-body-sm">
        {COMMON_MESSAGES.remove}
      </DisabledAction>
    )
  }
  return (
    <Button ref={setRef} type="button" variant="ghost" size="touch" data-slot="row-remove" aria-label={ariaLabel} className="text-body-sm" onClick={swap(onRemove)}>
      {COMMON_MESSAGES.remove}
    </Button>
  )
})
