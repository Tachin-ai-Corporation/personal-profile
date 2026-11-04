"use client"

import * as React from "react"

import { EmptyState, EmptyStateLine, type EmptyStateAction } from "@/components/ui/empty-state"
import { SECTION_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { ROW_EDIT_STATE_CLASSES, type RowEditState } from "./row-removal"
import { useSectionTone } from "./section-tone"
import { TONE_CLASSES } from "./section-tones"
import { columnsFit, measureLength, measureMinContent, sharedWidths, type FitColumn } from "./table-fit"
import { ContainerWidthContext, useElementWidth, useFontLoads } from "./use-element-width"
import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query"

/** Where a column goes in the stacked mobile card (read view): line 1 (value + status), line 2 (muted meta), or not at all. */
export type MobileLine = 1 | 2 | "none"

/**
 * `compact` (#63 review): the table, too narrow for the inline row actions;
 * its actions cell gets only the kebab (`RowActions` with `showInline={false}`,
 * as in a card). Compare with `"table"` to decide on inline actions.
 */
export type SectionTableLayout = "table" | "card" | "compact"

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
   * (edit view). The card layout passes `"card"` and a compact table
   * `"compact"`: give `RowActions` `showInline={layout === "table"}` (touch
   * and narrow tables rely on the kebab).
   */
  readonly actions?: (row: R, layout: SectionTableLayout) => React.ReactNode
  /**
   * The actions column's width class (default `w-60` in read view, `w-32` in
   * edit view). Only the read view's default narrows to the kebab
   * (`compact`); a Section's own width is kept.
   */
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

const HEADER_CELL = "h-9 px-3 text-left align-middle text-caption font-semibold tracking-[0.06em] uppercase"
/** Long values (links, emails, addresses) wrap inside their cell instead of widening the table. */
const WRAP = "min-w-0 [overflow-wrap:anywhere]"
/** The kebab-only actions column of a compact table. */
const COMPACT_ACTIONS_WIDTH = "w-14"
/** The least width of a column, so short values ("Landline", "Not verified") keep whole words. */
const MIN_COLUMN_PX = 96
/** The same in edit view, with room for a control. */
const MIN_EDIT_COLUMN_PX = 128

interface Fit {
  readonly layout: "table" | "compact" | "card"
  /** Table layouts: the px width of each unsized column (`null` for sized ones); unmeasured: none (equal shares). */
  readonly widths?: readonly (number | null)[]
  /** The width those were computed for. */
  readonly width?: number
}

/**
 * The widest layout whose columns all fit `width` (#63 review): the table,
 * else (read view, default actions column) the table with kebab-only actions,
 * else cards. Each column needs its header's longest word and the floor; the
 * unsized columns get their need first, then equal parts of the rest. An
 * unmeasured width (server render, jsdom) keeps the table with equal shares.
 */
function fitOf<R>(width: number, columns: readonly SectionTableColumn<R>[], hasActions: boolean, actionsWidth: string | undefined, editing: boolean): Fit {
  if (width <= 0) return { layout: "table" }
  const floor = editing ? MIN_EDIT_COLUMN_PX : MIN_COLUMN_PX
  const fit: FitColumn[] = columns.map((column) => ({
    length: column.width ? measureLength(column.width) : null,
    min: Math.max(floor, measureMinContent(column.header, HEADER_CELL)),
  }))
  const actions = hasActions ? [measureLength(actionsWidth ?? (editing ? "w-32" : "w-60"))] : []
  if (columnsFit(width, fit, actions)) return { layout: "table", widths: sharedWidths(width, fit, actions), width }
  const compact = [measureLength(COMPACT_ACTIONS_WIDTH)]
  if (hasActions && !editing && actionsWidth === undefined && columnsFit(width, fit, compact)) {
    return { layout: "compact", widths: sharedWidths(width, fit, compact), width }
  }
  return { layout: "card" }
}

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
 * full-width cell or the card body. From 768 px the table is used only
 * while its columns fit the width it has (its `SectionContainer`'s, or its
 * parent's): each column gets its header's longest word and 96 px (128 px in edit
 * view), the unsized ones that need first and equal parts of the rest; else
 * a read view with the default actions column keeps only the kebab there
 * (`compact`); else the rows are cards (#63 review: at tablet widths the
 * Contacts columns shrank to ~25 px). The layout is picked with
 * `useMediaQuery` and the measured width, never by CSS-hidden twins, so a
 * layout change remounts the cells: keep per-row state in the Section, not
 * in cells.
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
  const containerWidth = React.useContext(ContainerWidthContext)
  // The parent's width, not the table's: column widths can stretch a fixed-layout table past it.
  const [ownWidth, measure] = useElementWidth(true)
  // Re-renders (and re-measures the headers) when the web font arrives.
  useFontLoads()
  const fit: Fit = desktop ? fitOf(ownWidth ?? containerWidth, columns, actions !== undefined, actionsWidth, editing) : { layout: "card" }
  const baseId = React.useId()
  const stateOf = (row: R): RowEditState => rowState?.(row) ?? "saved"
  const columnHeaderId = (column: SectionTableColumn<R>): string => `${baseId}-col-${column.key}`
  // An accented container's tone (design refresh, opt-in): the header row and row hover take its surface tint.
  const tone = useSectionTone()
  const headerFill = tone ? TONE_CLASSES[tone].tableHeader : "bg-muted text-muted-foreground"

  if (fit.layout === "card") {
    return (
      <ul ref={measure} data-slot="section-table" data-layout="card" aria-labelledby={labelledBy} className={cn("tabular-nums", className)}>
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
      ref={measure}
      data-slot="section-table"
      data-layout={fit.layout}
      aria-labelledby={labelledBy}
      className={cn("w-full table-fixed border-collapse tabular-nums", className)}
    >
      <colgroup>
        {columns.map((column, index) => {
          // A share of the table, not px: on a resize the columns still add up until the next measurement.
          const shared = fit.widths?.[index]
          return <col key={column.key} className={column.width} style={shared == null || !fit.width ? undefined : { width: `${((shared / fit.width) * 100).toFixed(3)}%` }} />
        })}
        {actions ? <col className={fit.layout === "compact" ? COMPACT_ACTIONS_WIDTH : (actionsWidth ?? (editing ? "w-32" : "w-60"))} /> : null}
      </colgroup>
      <thead>
        <tr className="border-border border-b">
          {columns.map((column) => (
            <th key={column.key} id={columnHeaderId(column)} scope="col" className={cn(HEADER_CELL, headerFill, "first:rounded-tl-md")}>
              {column.header}
            </th>
          ))}
          {actions ? (
            <th scope="col" className={cn(HEADER_CELL, headerFill, "rounded-tr-md")}>
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
            !editing && (tone ? TONE_CLASSES[tone].rowHover : "hover:bg-accent focus-within:bg-accent"),
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
                  {actions(row, fit.layout)}
                </td>
              ) : null}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
