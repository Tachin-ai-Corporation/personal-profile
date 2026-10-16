"use client"

import { useState, type ReactNode } from "react"
import useSWR from "swr"
import { Chip } from "@/components/ui/chip"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  SECTION_COLUMNS,
  SectionContainer,
  SectionHeader,
  SectionTable,
  StateFrame,
  sectionHeadingId,
  useReportSectionCount,
  useSectionFrame,
  type FrameState,
  type SectionTableColumn,
} from "@/features/shell"
import { findPrimary, keys, mapFetchError, type ApiResponseError, type ContactPoint, type MappedError } from "@/lib/api"
import { CONTACT_LABEL_HOME, type ContactPhoneType } from "@/lib/shared/contact-labels"
import { COMMON_MESSAGES, CONTACT_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { formatPhoneDisplay, isPhoneRegion, normalizeRegion, regionFlag } from "@/lib/shared/phone"

/** One shown phone: the row as read, and the list (key) it came from. */
interface PhoneRow {
  readonly key: string
  readonly type: ContactPhoneType
  readonly point: ContactPoint
  /** Its `value` (rows without one are never shown). */
  readonly value: string
  /** The one Primary phone (`findPrimary`): a legacy second Primary-labelled row is shown as a plain label. */
  readonly primary: boolean
}

const TYPE_LABELS: Readonly<Record<ContactPhoneType, string>> = {
  Mobile: CONTACT_MESSAGES.phoneTypeMobile,
  Landline: CONTACT_MESSAGES.phoneTypeLandline,
}

function toPhoneRows(type: ContactPhoneType, points: readonly ContactPoint[]): PhoneRow[] {
  // Keyed by type, id and position: a list may repeat an id.
  return points.flatMap((point, index) =>
    point.value ? [{ key: `${type}-${point.id ?? "new"}-${index}`, type, point, value: point.value, primary: false }] : [],
  )
}

/**
 * The shown phones: the Mobile rows, then the Landline rows, each in API
 * order, without the rows that have no value; the Primary phone
 * (`findPrimary`, a Mobile one first) moves to the top and is the only row
 * shown as Primary.
 */
function phoneRowsOf(mobile: readonly ContactPoint[], landline: readonly ContactPoint[]): PhoneRow[] {
  const rows = [...toPhoneRows("Mobile", mobile), ...toPhoneRows("Landline", landline)]
  const primary = findPrimary(rows.map((row) => row.point))
  const first = rows.find((row) => row.point === primary)
  return first ? [{ ...first, primary: true }, ...rows.filter((row) => row !== first)] : rows
}

/** The Number cell: the decorative flag of its region (only a region the phone helpers know), then the formatted number. */
function PhoneNumber({ row }: { readonly row: PhoneRow }) {
  const region = normalizeRegion(row.point.phoneNumberRegion)
  const flag = isPhoneRegion(region) ? regionFlag(region) : ""
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      {flag ? <span aria-hidden="true">{flag}</span> : null}
      <span className="cell-strong text-foreground">{formatPhoneDisplay(row.value, row.point.phoneNumberRegion)}</span>
    </span>
  )
}

function statusOf(row: PhoneRow): ReactNode {
  if (row.point.label === CONTACT_LABEL_HOME) return null
  return row.point.isVerified === true ? (
    <StatusBadge status="verified">{COMMON_MESSAGES.verified}</StatusBadge>
  ) : (
    <StatusBadge status="notVerified">{COMMON_MESSAGES.notVerified}</StatusBadge>
  )
}

function notificationsOf(row: PhoneRow): ReactNode {
  if (!row.primary)
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">{CONTACT_MESSAGES.notificationsNotApplicable}</span>
        <span className="sr-only">{CONTACT_MESSAGES.notificationsNotApplicableLabel}</span>
      </span>
    )
  return row.point.isNotificationEnabled === true ? (
    <span>{CONTACT_MESSAGES.notificationsOn}</span>
  ) : (
    <span className="text-muted-foreground">{CONTACT_MESSAGES.notificationsOff}</span>
  )
}

const [NUMBER, LABEL, TYPE, STATUS, NOTIFICATIONS] = SECTION_COLUMNS.phone

/** Number · Label · Type · Status · Notifications; below 768 px line 1 is the number and status, line 2 the rest (muted). */
const PHONE_COLUMNS: readonly SectionTableColumn<PhoneRow>[] = [
  { key: "number", header: NUMBER, width: "w-[34%]", mobileLine: 1, cell: (row) => <PhoneNumber row={row} /> },
  {
    key: "label",
    header: LABEL,
    cell: (row) => (row.point.label ? <Chip variant={row.primary ? "primary" : "label"}>{row.point.label}</Chip> : null),
  },
  { key: "type", header: TYPE, cell: (row) => TYPE_LABELS[row.type] },
  { key: "status", header: STATUS, mobileLine: 1, cell: statusOf },
  { key: "notifications", header: NOTIFICATIONS, cell: notificationsOf },
]

/** A read failure without cached data (the session end first, then a 403, then any other). */
function phoneLoadError(failures: readonly unknown[]): MappedError | undefined {
  const mapped = failures.filter((failure) => failure !== undefined).map((failure) => mapFetchError("phone", failure))
  return mapped.find((error) => error.kind === "session") ?? mapped.find((error) => error.kind === "forbidden") ?? mapped[0]
}

/**
 * Phone (Story 3.1, FR15, NG-9023): the user's Mobile and Landline numbers
 * from the shared per-type keys `keys.contactPoints("Mobile")` and
 * `("Landline")` (also read by the header and the `/account` pickers),
 * merged in one read view: Primary first, then the API order. The landmark
 * renders from the first render and is never remounted (F6-1); the header
 * and the Section index show the saved count.
 *
 * Either read failing without cached data shows "Couldn't load phones" with
 * Retry, which revalidates only the two Phone keys; a 403 shows the Section's
 * no-access row and a session end is left to the shell. Once both lists are
 * cached the table stays, even if a background revalidation fails.
 *
 * No row actions, kebab or "Add phone" yet: Story 3.2 adds the first action
 * (an action without a handler is never shown).
 */
export function PhoneSection() {
  const mobile = useSWR<ContactPoint[] | undefined, ApiResponseError>(keys.contactPoints("Mobile"))
  const landline = useSWR<ContactPoint[] | undefined, ApiResponseError>(keys.contactPoints("Landline"))
  const { onReady } = useSectionFrame("phone")

  const mobileFailure = mobile.data === undefined ? mobile.error : undefined
  const landlineFailure = landline.data === undefined ? landline.error : undefined
  // Each new failure (a new error object) is a new attempt, so a repeated failure is announced again
  // once it arrives. Adjusted while rendering, so the first error is not mounted twice.
  const [attempt, setAttempt] = useState(0)
  const [seen, setSeen] = useState<readonly [unknown, unknown]>([mobileFailure, landlineFailure])
  if (seen[0] !== mobileFailure || seen[1] !== landlineFailure) {
    setSeen([mobileFailure, landlineFailure])
    if ((mobileFailure && mobileFailure !== seen[0]) || (landlineFailure && landlineFailure !== seen[1])) setAttempt((count) => count + 1)
  }

  const rows = mobile.data && landline.data ? phoneRowsOf(mobile.data, landline.data) : undefined
  const loadError = rows ? undefined : phoneLoadError([mobileFailure, landlineFailure])
  const state: FrameState = rows ? "ready" : loadError ? { error: loadError } : "loading"
  useReportSectionCount("phone", rows?.length)

  const retry = () => {
    void mobile.mutate()
    void landline.mutate()
  }

  const headingId = sectionHeadingId("phone")
  return (
    <section id="phone" aria-labelledby={headingId} className="min-w-0">
      <SectionHeader id="phone" title={SHELL_MESSAGES.sectionPhone} count={rows?.length} editing={false} className="mb-2" />
      <StateFrame
        state={state}
        skeleton="table"
        columns={SECTION_COLUMNS.phone}
        loadError={{ kind: "section", sectionId: "phone" }}
        level="section"
        onRetry={retry}
        attempt={attempt}
        onReady={onReady}
        // Once ready the Section container is the card.
        className={rows ? "overflow-visible rounded-none border-0 bg-transparent" : undefined}
      >
        {rows && (
          <SectionContainer editing={false}>
            <SectionTable
              rows={rows}
              columns={PHONE_COLUMNS}
              getRowKey={(row) => row.key}
              labelledBy={headingId}
              empty={{ message: CONTACT_MESSAGES.phonesEmpty }}
            />
          </SectionContainer>
        )}
      </StateFrame>
    </section>
  )
}
