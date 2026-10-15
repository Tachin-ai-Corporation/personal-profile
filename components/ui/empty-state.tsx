import * as React from "react"

import { Button } from "@/components/ui/button"
import { DisabledAction } from "@/components/ui/disabled-action"
import { LinkTextButton } from "@/components/ui/link-text-button"
import { cn } from "@/lib/utils"

/** The empty state's one action (catalog copy), e.g. "Add phone" or "Add insurance". */
export interface EmptyStateAction {
  readonly label: string
  readonly onClick: () => void
  /** Shown aria-disabled with this reason (e.g. the limit), never hidden. */
  readonly disabledReason?: string
}

interface EmptyStateBaseProps {
  /** The one line of copy, e.g. "No phones yet". */
  readonly message: React.ReactNode
  readonly action?: EmptyStateAction
  readonly className?: string
}

export interface EmptyStateCardProps extends EmptyStateBaseProps {
  readonly variant: "card"
  /** An optional heading line above the message (`section-title`), e.g. the organizations empty state. */
  readonly title?: React.ReactNode
  /** The title's element: a heading level that fits the page outline (e.g. `"h3"` inside a Section); defaults to `"p"`. */
  readonly titleAs?: "p" | "h2" | "h3" | "h4"
  /** Extra content between the message and the action (e.g. feature rows). */
  readonly children?: React.ReactNode
}

export interface EmptyStateRowProps extends EmptyStateBaseProps {
  readonly variant: "row"
  /** How many table columns the row spans. */
  readonly colSpan: number
}

export type EmptyStateProps = EmptyStateCardProps | EmptyStateRowProps

function CardAction({ action }: { readonly action: EmptyStateAction }) {
  if (action.disabledReason) return <DisabledAction reason={action.disabledReason}>{action.label}</DisabledAction>
  return (
    <Button type="button" size="touch" onClick={action.onClick}>
      {action.label}
    </Button>
  )
}

function RowAction({ action }: { readonly action: EmptyStateAction }) {
  if (action.disabledReason) return <DisabledAction reason={action.disabledReason}>{action.label}</DisabledAction>
  return <LinkTextButton onClick={action.onClick}>{action.label}</LinkTextButton>
}

/** The `empty-row` line on its own (muted copy · link action), e.g. as a stacked mobile card. */
export function EmptyStateLine({ message, action, className }: EmptyStateBaseProps): React.JSX.Element {
  return (
    <span data-slot="empty-state-line" className={cn("text-muted-foreground text-body-sm flex min-h-11 flex-wrap items-center gap-x-2", className)}>
      <span>{message}</span>
      {action ? (
        <>
          <span aria-hidden="true">·</span>
          <RowAction action={action} />
        </>
      ) : null}
    </span>
  )
}

/**
 * DESIGN.md empty states (F6-2):
 * - `row` (`empty-row`): one table row spanning every column, muted copy and a
 *   `link-text` action ("No phones yet · Add phone"). Render it inside `<tbody>`
 *   (`SectionTable` does).
 * - `card` (`empty-card`): a dashed card with the copy and a primary action
 *   ("No insurance on file…" + "Add insurance"), optional title and children.
 */
export function EmptyState(props: EmptyStateProps): React.JSX.Element {
  if (props.variant === "row") {
    const { message, action, colSpan, className } = props
    return (
      <tr data-slot="empty-state" data-variant="row" className={className}>
        <td colSpan={colSpan} className="px-3 py-0.5">
          <EmptyStateLine message={message} action={action} />
        </td>
      </tr>
    )
  }
  const { message, action, title, titleAs: Title = "p", children, className } = props
  return (
    <div
      data-slot="empty-state"
      data-variant="card"
      className={cn("bg-card border-border flex flex-col items-start gap-3 rounded-md border border-dashed p-6", className)}
    >
      {title ? <Title className="section-title text-foreground">{title}</Title> : null}
      <p className="text-muted-foreground text-body-sm">{message}</p>
      {children}
      {action ? <CardAction action={action} /> : null}
    </div>
  )
}
