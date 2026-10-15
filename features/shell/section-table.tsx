"use client"

import * as React from "react"

import { EmptyState, EmptyStateLine, type EmptyStateAction } from "@/components/ui/empty-state"
import { SECTION_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { ROW_EDIT_STATE_CLASSES, type RowEditState } from "./row-removal"
import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query"

/** Where a column goes in the stacked mobile card (read view): line 1 (value + status), line 2 (muted meta), or not at all. */
export type MobileLine = 1 | 2 | "none"

export type SectionTableLayout = "table" | "card"

/** What a cell renderer gets besides the row. */
export interface SectionTableCellContext {
  readonly layout: SectionTableLayout
  /** The id of the visible header naming this cell (desktop `th`, or the edit card's label): `aria-labelledby` for an edit control. */
  readonly headerId: string
}

export interface SectionTableColumn<R> {
  readonly key: string
  /** The column header (catalog copy, e.g. `SHELL_MESSAGES.columnNumber`). */
  readonly header: string
  readonly cell: (row: R, context: SectionTableCellContext) => React.ReactNode
  /** Extra classes for the column's cells (e.g. `cell-number`). */
  readonly className?: string
  /** The column's width on desktop, as a class on its `<col>` (e.g. `w-[30%]`); columns without one share what is left. */
  readonly width?: string
  /** Defaults to line 2. */
  readonly mobileLine?: MobileLine
}

export interface SectionTableProps<R> {
  readonly rows: readonly R[]
  readonly columns: readonly SectionTableColumn<R>[]
  readonly getRowKey: (row: R) => string
  /** The id of the element naming the table (the Section `h2`). */
  readonly labelledBy?: string
  /**
   * The row's actions cell, usually `RowActions` (read view) or `RowRemoval`
   * (edit view). The card layout passes `"card"`: give `RowActions`
   * `showInline={false}` there (touch relies on the kebab).
   */
  readonly actions?: (row: R, layout: SectionTableLayout) => React.ReactNode
  /** The actions column's width class (default `w-60` in read view, `w-32` in edit view). */
  readonly actionsWidth?: string
  /** Edit view: no hover fill, roomier top-aligned cells; below 768 px each column is a labelled block. */
  readonly editing?: boolean
  /** Edit view row states ("New · not saved", "Removed on save"). */
  readonly rowState?: (row: R) => RowEditState
  /**
   * An expanded row (Story 4.2 address, 3.x new rows): when it returns
   * content, the row is one full-width cell (desktop `colSpan`) or the card's
   * body (mobile) holding it, in place of the column cells.
   */
  readonly renderExpanded?: (row: R) => React.ReactNode
  /** The empty state ("No phones yet · Add phone"), one row spanning every column. */
  readonly empty?: { readonly message: React.ReactNode; readonly action?: EmptyStateAction }
  /** An id on a row's element (deep links, or focusing a row). */
  readonly getRowId?: (row: R) => string | undefined
  readonly className?: string
}

const HEADER_CELL = "bg-muted text-muted-foreground h-9 px-3 text-left align-middle text-caption font-semibold tracking-[0.06em] uppercase"
/** Long values (links, emails, addresses) wrap inside their cell instead of widening the table. */
const WRAP = "min-w-0 [overflow-wrap:anywhere]"

const isEmptyNode = (node: React.ReactNode): boolean => node === undefined || node === null || node === false

/**
 * DESIGN.md Section table (F6-2; UX-DR21, UX-DR22, UX-DR49): sits inside
 * `SectionContainer`. From 768 px a real fixed-layout `<table>` with `th`
 * column headers (`column-header` type on `muted`), 44 px rows with hairline
 * dividers (none after the last), wrapping cells, `accent` on hover and
 * focus-within in read view, and a right-aligned actions column (a visually
 * hidden "Actions" header). Rows are `group/row`, which `RowActions` uses to
 * fade its inline actions in. Below 768 px every row is a card in a list:
 * in read view line 1 value + status and line 2 muted meta (each value keeps
 * its column name for screen readers); in edit view one full-width block per
 * column under its visible header. An expanded row (`renderExpanded`) is one
 * full-width cell or the card body. The layout is picked with
 * `useMediaQuery`, never by CSS-hidden twins, so a breakpoint change
 * remounts the cells: keep per-row state in the Section, not in cells.
 */
export function SectionTable<R>({
  rows,
  columns,
  getRowKey,
  labelledBy,
  actions,
  actionsWidth,
  editing = false,
  rowState,
  renderExpanded,
  empty,
  getRowId,
  className,
}: SectionTableProps<R>): React.JSX.Element {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const baseId = React.useId()
  const stateOf = (row: R): RowEditState => rowState?.(row) ?? "saved"
  const columnHeaderId = (column: SectionTableColumn<R>): string => `${baseId}-col-${column.key}`

  if (!desktop) {
    return (
      <ul data-slot="section-table" data-layout="card" aria-labelledby={labelledBy} className={cn("tabular-nums", className)}>
        {rows.length === 0 && empty ? (
          <li className="px-3 py-0.5">
            <EmptyStateLine message={empty.message} action={empty.action} />
          </li>
        ) : null}
        {rows.map((row) => {
          const key = getRowKey(row)
          const state = stateOf(row)
          const expanded = renderExpanded?.(row)
          const actionsCell = actions ? (
            <div data-slot="row-actions-cell" className="shrink-0 self-center">
              {actions(row, "card")}
            </div>
          ) : null
          let body: React.ReactNode
          if (!isEmptyNode(expanded)) {
            body = <div className={cn("flex min-w-0 flex-1 flex-col gap-3", WRAP)}>{expanded}</div>
          } else if (editing) {
            body = (
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                {columns.map((column) => {
                  const headerId = `${baseId}-${key}-${column.key}`
                  return (
                    <div key={column.key} data-column={column.key} className={cn("flex flex-col gap-1", WRAP, column.className)}>
                      <span id={headerId} className="text-muted-foreground text-caption font-semibold tracking-[0.06em] uppercase">
                        {column.header}
                      </span>
                      <div className={cn("text-body-sm", state === "removed" && "line-through")}>{column.cell(row, { layout: "card", headerId })}</div>
                    </div>
                  )
                })}
              </div>
            )
          } else {
            const line = (which: 1 | 2) =>
              columns
                .filter((column) => (column.mobileLine ?? 2) === which)
                .map((column) => (
                  <span key={column.key} data-column={column.key} className={cn(WRAP, column.className)}>
                    <span className="sr-only">{column.header}: </span>
                    {column.cell(row, { layout: "card", headerId: columnHeaderId(column) })}
                  </span>
                ))
            body = (
              <div className={cn("flex min-w-0 flex-1 flex-col gap-1", state === "removed" && "line-through")}>
                <div
                  className={cn(
                    "text-body-sm flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold",
                    state === "removed" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {line(1)}
                </div>
                <div className="text-muted-foreground text-body-sm flex flex-wrap items-center gap-x-3 gap-y-1">{line(2)}</div>
              </div>
            )
          }
          return (
            <li
              key={key}
              id={getRowId?.(row)}
              data-slot="section-table-card"
              data-state={state}
              className={cn(
                "group/row border-border flex gap-2 border-b p-3 last:border-b-0",
                editing ? "items-start" : "items-center",
                state === "new" && "bg-background",
                state === "removed" && "text-muted-foreground",
              )}
            >
              {body}
              {actionsCell}
            </li>
          )
        })}
      </ul>
    )
  }

  const columnCount = columns.length + (actions ? 1 : 0)
  return (
    <table
      data-slot="section-table"
      data-layout="table"
      aria-labelledby={labelledBy}
      className={cn("w-full table-fixed border-collapse tabular-nums", className)}
    >
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} className={column.width} />
        ))}
        {actions ? <col className={actionsWidth ?? (editing ? "w-32" : "w-60")} /> : null}
      </colgroup>
      <thead>
        <tr className="border-border border-b">
          {columns.map((column) => (
            <th key={column.key} id={columnHeaderId(column)} scope="col" className={cn(HEADER_CELL, "first:rounded-tl-md")}>
              {column.header}
            </th>
          ))}
          {actions ? (
            <th scope="col" className={cn(HEADER_CELL, "rounded-tr-md")}>
              <span className="sr-only">{SECTION_MESSAGES.actionsColumn}</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && empty ? <EmptyState variant="row" colSpan={columnCount} message={empty.message} action={empty.action} /> : null}
        {rows.map((row) => {
          const state = stateOf(row)
          const expanded = renderExpanded?.(row)
          const rowClass = cn(
            "group/row border-border text-body-sm border-b last:border-b-0",
            !editing && "hover:bg-accent focus-within:bg-accent",
            ROW_EDIT_STATE_CLASSES[state],
          )
          if (!isEmptyNode(expanded)) {
            return (
              <tr key={getRowKey(row)} id={getRowId?.(row)} data-state={state} data-expanded="true" className={rowClass}>
                <td colSpan={columnCount} className={cn("px-3 py-4 align-top", WRAP)}>
                  {expanded}
                </td>
              </tr>
            )
          }
          return (
            <tr key={getRowKey(row)} id={getRowId?.(row)} data-state={state} className={rowClass}>
              {columns.map((column) => (
                <td key={column.key} className={cn("px-3", WRAP, editing ? "py-4 align-top" : "h-11 py-1 align-middle", column.className)}>
                  {column.cell(row, { layout: "table", headerId: columnHeaderId(column) })}
                </td>
              ))}
              {actions ? (
                <td data-slot="row-actions-cell" className={cn("px-1 text-right", editing ? "py-4 align-top" : "py-0 align-middle")}>
                  {actions(row, "table")}
                </td>
              ) : null}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
