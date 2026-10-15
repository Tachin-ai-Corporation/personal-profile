"use client"

import * as React from "react"

import { EmptyState, EmptyStateLine, type EmptyStateAction } from "@/components/ui/empty-state"
import { SECTION_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { ROW_EDIT_STATE_CLASSES, type RowEditState } from "./row-removal"
import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query"

/** Where a column goes in the stacked mobile card: line 1 (value + status), line 2 (muted meta), or not at all. */
export type MobileLine = 1 | 2 | "none"

export interface SectionTableColumn<R> {
  readonly key: string
  /** The column header (catalog copy, e.g. `SHELL_MESSAGES.columnNumber`). */
  readonly header: string
  readonly cell: (row: R) => React.ReactNode
  /** Extra classes for the column's cells (e.g. `cell-number`, a width). */
  readonly className?: string
  /** Defaults to line 2. */
  readonly mobileLine?: MobileLine
}

export type SectionTableLayout = "table" | "card"

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
  /** Edit view: no hover fill, roomier top-aligned cells. */
  readonly editing?: boolean
  /** Edit view row states ("New · not saved", "Removed on save"). */
  readonly rowState?: (row: R) => RowEditState
  /** The empty state ("No phones yet · Add phone"), one row spanning every column. */
  readonly empty?: { readonly message: React.ReactNode; readonly action?: EmptyStateAction }
  /** An id on a row's element (deep links, or focusing a row). */
  readonly getRowId?: (row: R) => string | undefined
  readonly className?: string
}

const HEADER_CELL = "bg-muted text-muted-foreground h-9 px-3 text-left align-middle text-caption font-semibold tracking-[0.06em] uppercase"

/**
 * DESIGN.md Section table (F6-2; UX-DR21, UX-DR22, UX-DR49): sits inside
 * `SectionContainer`. From 768 px a real `<table>` with `th` column headers
 * (`column-header` type on `muted`), 44 px rows with hairline dividers (none
 * after the last), `accent` on hover and focus-within in read view, and a
 * right-aligned actions column (a visually hidden "Actions" header). Rows are
 * `group/row`, which `RowActions` uses to fade its inline actions in. Below
 * 768 px every row is a stacked card in a list: line 1 value + status, line
 * 2 muted meta (each value keeps its column name for screen readers), the
 * actions on the right. The layout is picked with `useMediaQuery`, never by
 * CSS-hidden twins. No rows → the empty state, one row spanning the columns.
 */
export function SectionTable<R>({
  rows,
  columns,
  getRowKey,
  labelledBy,
  actions,
  editing = false,
  rowState,
  empty,
  getRowId,
  className,
}: SectionTableProps<R>): React.JSX.Element {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const stateOf = (row: R): RowEditState => rowState?.(row) ?? "saved"

  if (!desktop) {
    return (
      <ul data-slot="section-table" data-layout="card" aria-labelledby={labelledBy} className={cn("tabular-nums", className)}>
        {rows.length === 0 && empty ? (
          <li className="px-3 py-0.5">
            <EmptyStateLine message={empty.message} action={empty.action} />
          </li>
        ) : null}
        {rows.map((row) => {
          const state = stateOf(row)
          const line = (which: 1 | 2) =>
            columns
              .filter((column) => (column.mobileLine ?? 2) === which)
              .map((column) => (
                <span key={column.key} data-column={column.key} className={cn("min-w-0 break-words", column.className)}>
                  <span className="sr-only">{column.header}: </span>
                  {column.cell(row)}
                </span>
              ))
          return (
            <li
              key={getRowKey(row)}
              id={getRowId?.(row)}
              data-slot="section-table-card"
              data-state={state}
              className={cn(
                "group/row border-border flex items-center gap-2 border-b p-3 last:border-b-0",
                state === "new" && "bg-background",
                state === "removed" && "text-muted-foreground",
              )}
            >
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
              {actions ? (
                <div data-slot="row-actions-cell" className="shrink-0 self-center">
                  {actions(row, "card")}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    )
  }

  const columnCount = columns.length + (actions ? 1 : 0)
  return (
    <table data-slot="section-table" data-layout="table" aria-labelledby={labelledBy} className={cn("w-full border-collapse tabular-nums", className)}>
      <thead>
        <tr className="border-border border-b">
          {columns.map((column) => (
            <th key={column.key} scope="col" className={cn(HEADER_CELL, "first:rounded-tl-md")}>
              {column.header}
            </th>
          ))}
          {actions ? (
            <th scope="col" className={cn(HEADER_CELL, "w-0 rounded-tr-md")}>
              <span className="sr-only">{SECTION_MESSAGES.actionsColumn}</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && empty ? <EmptyState variant="row" colSpan={columnCount} message={empty.message} action={empty.action} /> : null}
        {rows.map((row) => {
          const state = stateOf(row)
          return (
            <tr
              key={getRowKey(row)}
              id={getRowId?.(row)}
              data-state={state}
              className={cn(
                "group/row border-border text-body-sm border-b last:border-b-0",
                !editing && "hover:bg-accent focus-within:bg-accent",
                ROW_EDIT_STATE_CLASSES[state],
              )}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn("px-3", editing ? "py-4 align-top" : "h-11 py-1 align-middle", column.className)}>
                  {column.cell(row)}
                </td>
              ))}
              {actions ? (
                <td data-slot="row-actions-cell" className={cn("px-1 text-right whitespace-nowrap", editing ? "py-4 align-top" : "py-0 align-middle")}>
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
