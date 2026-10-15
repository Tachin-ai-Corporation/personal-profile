"use client"

import { useId } from "react"
import { COMMON_MESSAGES, DRAFT_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import type { DraftDiffRow } from "./nav-types"
import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query"

export interface DraftCompareProps {
  /** One row per changed field (the Section's `describeDraftDiff`). */
  readonly rows: readonly DraftDiffRow[]
  /** Space-separated ids of the elements naming the compare (the Section `h2` and the conflict banner). */
  readonly labelledBy?: string
  readonly className?: string
}

/** `{typography.column-header}`. */
const COLUMN_HEADER = "text-muted-foreground text-caption px-3 py-2 text-left align-bottom font-semibold tracking-[0.06em] uppercase"
/** `{components.kv-key}`. */
const KEY = "text-muted-foreground text-body-sm px-3 py-2.5 text-left align-top font-normal"
/** `{components.kv-value}`. */
const VALUE = "text-foreground text-body-sm px-3 py-2.5 align-top font-medium break-words"
const ROW = "border-border border-b last:border-b-0"

function Value({ value }: { readonly value: string }) {
  if (value === "") return <span className="text-muted-foreground font-normal">{COMMON_MESSAGES.notProvided}</span>
  return <>{value}</>
}

/**
 * DESIGN.md Draft conflict compare (UX-DR41): one row per changed field, the
 * field name in kv-key style, "Your version" and "Current" side by side
 * (column-header type); empty values read "Not provided". Below 768 px each
 * row stacks the two values under the field name, "Your version" first.
 * The layout is picked with `useMediaQuery`, never by CSS-hidden twins.
 */
export function DraftCompare({ rows, labelledBy, className }: DraftCompareProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const baseId = useId()

  if (desktop) {
    return (
      <table data-slot="draft-compare" aria-labelledby={labelledBy} className={cn("w-full table-fixed border-collapse", className)}>
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[38%]" />
          <col className="w-[38%]" />
        </colgroup>
        <thead>
          <tr className="border-border border-b">
            <td />
            <th scope="col" className={COLUMN_HEADER}>
              {DRAFT_MESSAGES.yourVersion}
            </th>
            <th scope="col" className={COLUMN_HEADER}>
              {DRAFT_MESSAGES.current}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className={ROW}>
              <th scope="row" className={KEY}>
                {row.label}
              </th>
              <td className={VALUE}>
                <Value value={row.mine} />
              </td>
              <td className={VALUE}>
                <Value value={row.current} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div data-slot="draft-compare" role="group" aria-labelledby={labelledBy} className={cn("divide-border flex flex-col divide-y", className)}>
      {rows.map((row) => {
        const labelId = `${baseId}-${row.field}`
        return (
          <div key={row.field} role="group" aria-labelledby={labelId} className="flex flex-col gap-1 px-3 py-2.5">
            <p id={labelId} className="text-muted-foreground text-body-sm">
              {row.label}
            </p>
            <dl className="grid grid-cols-1 gap-1">
              <div>
                <dt className="text-muted-foreground text-caption font-semibold tracking-[0.06em] uppercase">{DRAFT_MESSAGES.yourVersion}</dt>
                <dd className="text-foreground text-body-sm font-medium break-words">
                  <Value value={row.mine} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-caption font-semibold tracking-[0.06em] uppercase">{DRAFT_MESSAGES.current}</dt>
                <dd className="text-foreground text-body-sm font-medium break-words">
                  <Value value={row.current} />
                </dd>
              </div>
            </dl>
          </div>
        )
      })}
    </div>
  )
}
