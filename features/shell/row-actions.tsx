"use client"

import * as React from "react"
import { MoreVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DisabledAction } from "@/components/ui/disabled-action"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { COMMON_MESSAGES, formatMessage } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

/** One row action (catalog copy). The kebab menu lists every action; `inline` ones also show in the row on desktop. */
export interface RowAction {
  /** Stable key, e.g. `"verify"`. */
  readonly id: string
  readonly label: string
  readonly onSelect: () => void
  /** Also shown as an inline ghost button on desktop (Verify, Make primary, Edit). */
  readonly inline?: boolean
  /** "Remove": `error-strong` text in the menu. */
  readonly destructive?: boolean
  /** Unavailable: shown aria-disabled with this reason, focusable, activation does nothing. */
  readonly disabledReason?: string
}

export interface RowActionsProps {
  readonly actions: readonly RowAction[]
  /** What the row is, for the kebab's name: "More actions for {name}" (e.g. "+1 (415) 551-2125"). */
  readonly name: string
  /** Inline actions show (desktop, on row hover/focus-within); `false` keeps only the kebab (stacked mobile cards). */
  readonly showInline?: boolean
  /** Called with the kebab button, e.g. to return focus to it. */
  readonly kebabRef?: React.Ref<HTMLButtonElement>
  readonly className?: string
}

/** Sets a callback or object ref. */
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value)
  else if (ref) (ref as React.RefObject<T | null>).current = value
}

/** An action with a handler: the menu never shows an item that does nothing by accident (UX-DR26). */
const hasHandler = (action: RowAction): boolean => typeof action.onSelect === "function"

/**
 * DESIGN.md Row actions + kebab (F6-2; Story 1.11, UX-DR26): right-aligned.
 * On desktop the `inline` actions are 44 px ghost buttons that fade in
 * (150 ms, none under reduced motion) while the row (`group/row`, set by
 * `SectionTable`) is hovered or holds focus; a focused inline action is
 * always visible. The 44 × 44 kebab is always shown and named "More actions
 * for {name}"; its `row-menu` repeats every action, the destructive one in
 * `error-strong`. An aria-disabled action stays focusable in both places
 * and does nothing: inline it is a `DisabledAction` (tooltip), in the menu
 * its reason is a muted second line (a tooltip can't live inside a menu).
 * A menu item runs only after the menu has closed and focus is back on the
 * kebab, so a dialog or sheet it opens returns focus to the kebab. On touch
 * screens from 768 px (no hover) the inline actions are always visible, never
 * invisible but tappable. No usable action → nothing is rendered.
 */
export function RowActions({ actions, name, showInline = true, kebabRef, className }: RowActionsProps): React.JSX.Element | null {
  const usable = actions.filter(hasHandler)
  const inline = showInline ? usable.filter((action) => action.inline) : []
  const reasonBase = React.useId()
  const ownKebabRef = React.useRef<HTMLButtonElement | null>(null)
  const pendingRef = React.useRef<RowAction | null>(null)
  const setKebabRef = React.useCallback(
    (element: HTMLButtonElement | null) => {
      ownKebabRef.current = element
      assignRef(kebabRef, element)
    },
    [kebabRef],
  )

  if (usable.length === 0) return null

  return (
    <div data-slot="row-actions" className={cn("flex items-center justify-end gap-1", className)}>
      {inline.length > 0 ? (
        <div
          data-slot="row-actions-inline"
          // Hidden until row hover/focus only with a fine pointer; touch (coarse) keeps them visible.
          className="flex items-center gap-1 transition-opacity duration-150 ease-standard motion-reduce:transition-none max-md:hidden md:pointer-fine:opacity-0 md:pointer-fine:group-hover/row:opacity-100 md:pointer-fine:group-focus-within/row:opacity-100 md:pointer-fine:focus-within:opacity-100"
        >
          {inline.map((action) =>
            action.disabledReason ? (
              <DisabledAction key={action.id} reason={action.disabledReason} className="text-body-sm">
                {action.label}
              </DisabledAction>
            ) : (
              <Button key={action.id} type="button" variant="ghost" size="touch" className="text-body-sm" onClick={action.onSelect}>
                {action.label}
              </Button>
            ),
          )}
        </div>
      ) : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={setKebabRef}
            type="button"
            variant="ghost"
            size="touch"
            data-slot="row-actions-kebab"
            aria-label={formatMessage(COMMON_MESSAGES.moreActionsFor, { name })}
            className="text-secondary-foreground hover:bg-muted w-11 px-0"
          >
            <MoreVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={(event) => {
            // Focus the kebab first, then run the picked action: what it opens returns focus here.
            event.preventDefault()
            ownKebabRef.current?.focus()
            const picked = pendingRef.current
            pendingRef.current = null
            picked?.onSelect()
          }}
        >
          {usable.map((action, index) => {
            const reasonId = `${reasonBase}-${index}`
            return (
              <DropdownMenuItem
                key={action.id}
                variant={action.destructive ? "destructive" : "default"}
                aria-disabled={action.disabledReason ? true : undefined}
                aria-describedby={action.disabledReason ? reasonId : undefined}
                onSelect={(event) => {
                  if (action.disabledReason) {
                    // Stays open: activation does nothing and the reason stays readable.
                    event.preventDefault()
                    return
                  }
                  pendingRef.current = action
                }}
              >
                <span className="flex flex-col">
                  <span>{action.label}</span>
                  {action.disabledReason ? (
                    <span id={reasonId} className="text-muted-foreground text-caption">
                      {action.disabledReason}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
