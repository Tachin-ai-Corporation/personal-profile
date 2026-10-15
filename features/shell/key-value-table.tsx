"use client"

import { useId, type ReactNode } from "react"
import { FieldError, FormField, type FieldControlProps } from "@/components/ui/form-field"
import { isNotProvided } from "@/lib/shared/display-value"
import { COMMON_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query"

/** One read-view pair. */
export interface KeyValueRow {
  /** Stable React key. */
  readonly key: string
  /** The field name (catalog copy), e.g. "First name". */
  readonly label: string
  /**
   * Reads "Not provided" when `false` or not provided by the PM3 rule
   * (`lib/shared/display-value#isNotProvided`: null, undefined, blank,
   * `"n/a"` any case, `-1`, `"-1"`, an empty list).
   */
  readonly value?: ReactNode
  /** An anchor id on the row's key cell (e.g. `signature` for `#signature` deep links). */
  readonly rowId?: string
}

export interface KeyValueTableProps {
  readonly rows: readonly KeyValueRow[]
  /** The id of the element naming the table (usually the Section `h2`). */
  readonly labelledBy?: string
  readonly className?: string
}

const isEmpty = (node: ReactNode): boolean => node === undefined || node === null || node === false || node === ""

const KEY_CELL = "text-muted-foreground text-body-sm px-3 py-2.5 text-left align-top font-normal"
const VALUE_CELL = "text-foreground text-body-sm px-3 py-2.5 align-top font-medium break-words"
const ROW = "border-border border-b last:border-b-0"

function Value({ value }: { readonly value: ReactNode }) {
  if (value === false || isNotProvided(value)) return <span className="text-muted-foreground font-normal">{COMMON_MESSAGES.notProvided}</span>
  return <>{value}</>
}

/** The key cell's id: the row anchor when given, else a generated one (the value cell's `headers`). */
function keyId(baseId: string, row: KeyValueRow): string {
  return row.rowId ?? `${baseId}-${row.key}`
}

function KeyCell({ row, id, className }: { readonly row: KeyValueRow; readonly id: string; readonly className?: string }) {
  return (
    <th scope="row" id={id} className={cn(KEY_CELL, className)}>
      {row.label}
    </th>
  )
}

/** A value cell tied to exactly its own key (`headers`): in four columns `scope="row"` alone would name both keys. */
function ValueCell({ row, keyCellId }: { readonly row: KeyValueRow; readonly keyCellId: string }) {
  return (
    <td headers={keyCellId} className={VALUE_CELL}>
      <Value value={row.value} />
    </td>
  )
}

/** Pairs of rows for the desktop four-column layout (filled row by row). */
function pairs<R>(rows: readonly R[]): (readonly [R, R | undefined])[] {
  const result: (readonly [R, R | undefined])[] = []
  for (let index = 0; index < rows.length; index += 2) result.push([rows[index], rows[index + 1]])
  return result
}

/**
 * DESIGN.md Key/value table, read view (Personal information, Account
 * settings, Registered view): desktop four columns key | value | key | value,
 * filled row by row, with a vertical hairline between the pairs; below 768 px
 * one Field | Value pair per row (key 44 %). Keys are `th scope="row"`. The
 * layout is picked with `useMediaQuery`, never by CSS-hidden twins.
 */
export function KeyValueTable({ rows, labelledBy, className }: KeyValueTableProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const baseId = useId()
  return (
    <table data-slot="key-value-table" aria-labelledby={labelledBy} className={cn("w-full table-fixed border-collapse", className)}>
      {desktop ? (
        <>
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[34%]" />
            <col className="w-[16%]" />
            <col className="w-[34%]" />
          </colgroup>
          <tbody>
            {pairs(rows).map(([first, second]) => (
              <tr key={first.key} className={ROW}>
                <KeyCell row={first} id={keyId(baseId, first)} />
                <ValueCell row={first} keyCellId={keyId(baseId, first)} />
                {second ? (
                  <>
                    <KeyCell row={second} id={keyId(baseId, second)} className="border-border border-l" />
                    <ValueCell row={second} keyCellId={keyId(baseId, second)} />
                  </>
                ) : (
                  <td colSpan={2} className="border-border border-l" />
                )}
              </tr>
            ))}
          </tbody>
        </>
      ) : (
        <>
          <colgroup>
            <col className="w-[44%]" />
            <col className="w-[56%]" />
          </colgroup>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={ROW}>
                <KeyCell row={row} id={keyId(baseId, row)} />
                <ValueCell row={row} keyCellId={keyId(baseId, row)} />
              </tr>
            ))}
          </tbody>
        </>
      )}
    </table>
  )
}

/** One edit-view field. */
export interface KeyValueEditRow {
  readonly key: string
  readonly label: string
  /** Adds the muted "(optional)" suffix; required fields carry no marker. */
  readonly optional?: boolean
  /** Marks the control required for assistive tech (no visible marker). */
  readonly required?: boolean
  readonly help?: ReactNode
  /** The field's error (catalog copy): `aria-invalid` + the error line under the control. */
  readonly error?: ReactNode
  /** An extra after the label (e.g. an `InfoIconButton`). */
  readonly labelAddon?: ReactNode
  /** The control id; generated when omitted. */
  readonly controlId?: string
  readonly rowId?: string
  /** Renders the control with the wiring (`id`, `aria-describedby`, `aria-invalid`, `required`). */
  readonly render: (control: FieldControlProps) => ReactNode
}

export interface KeyValueEditTableProps {
  readonly rows: readonly KeyValueEditRow[]
  readonly labelledBy?: string
  readonly className?: string
}

/**
 * The wiring `FormField` gives its control, for the desktop table cells,
 * minus native `required` (there is no `<form>`; `aria-required` stays).
 */
function controlWiring(controlId: string, row: KeyValueEditRow): FieldControlProps {
  const describedBy = [isEmpty(row.help) ? null : `${controlId}-help`, isEmpty(row.error) ? null : `${controlId}-error`].filter(Boolean).join(" ")
  return {
    id: controlId,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": isEmpty(row.error) ? undefined : true,
    required: undefined,
    "aria-required": row.required ? true : undefined,
  }
}

function DesktopEditRow({ row, controlId }: { readonly row: KeyValueEditRow; readonly controlId: string }) {
  return (
    <tr className={ROW}>
      <th scope="row" id={row.rowId} className="w-60 px-3 py-4 text-left align-top font-normal">
        {/* Top-aligned to the 44 px control: 12 px down centres the 20 px label line. */}
        <div className="flex min-h-11 items-center gap-1">
          <label htmlFor={controlId} className="text-body-sm text-foreground font-medium">
            {row.label}
            {row.optional ? (
              <>
                {" "}
                <span className="text-muted-foreground font-normal">{COMMON_MESSAGES.optionalSuffix}</span>
              </>
            ) : null}
          </label>
          {row.labelAddon}
        </div>
      </th>
      <td className="px-3 py-4 align-top">
        <div className="flex max-w-[480px] flex-col gap-1.5">
          {row.render(controlWiring(controlId, row))}
          {isEmpty(row.help) ? null : (
            <p id={`${controlId}-help`} data-slot="field-help" className="text-muted-foreground text-body-sm">
              {row.help}
            </p>
          )}
          <div aria-live="polite">{isEmpty(row.error) ? null : <FieldError id={`${controlId}-error`}>{row.error}</FieldError>}</div>
        </div>
      </td>
    </tr>
  )
}

/**
 * DESIGN.md Key/value table, edit view: desktop two columns Field | Value
 * with a 240 px key column (label top-aligned to the control), controls
 * capped at 480 px and help or error under the control; below 768 px each
 * label stacks above a full-width control, with a hairline between fields.
 */
export function KeyValueEditTable({ rows, labelledBy, className }: KeyValueEditTableProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const baseId = useId()
  const idOf = (row: KeyValueEditRow): string => row.controlId ?? `${baseId}-${row.key}`

  if (desktop) {
    return (
      <table data-slot="key-value-edit-table" aria-labelledby={labelledBy} className={cn("w-full border-collapse", className)}>
        <tbody>
          {rows.map((row) => (
            <DesktopEditRow key={row.key} row={row} controlId={idOf(row)} />
          ))}
        </tbody>
      </table>
    )
  }
  return (
    <div data-slot="key-value-edit-table" role="group" aria-labelledby={labelledBy} className={cn("divide-border flex flex-col divide-y", className)}>
      {rows.map((row) => (
        <div key={row.key} id={row.rowId} className="px-3 py-4">
          <FormField
            id={idOf(row)}
            label={row.label}
            optional={row.optional}
            required={row.required}
            help={row.help}
            error={row.error}
            labelAddon={row.labelAddon}
          >
            {(control) => row.render({ ...control, required: undefined })}
          </FormField>
        </div>
      ))}
    </div>
  )
}
