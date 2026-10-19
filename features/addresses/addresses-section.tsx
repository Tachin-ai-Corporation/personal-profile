"use client"

import { useMemo, useState } from "react"
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
import { keys, mapFetchError, type Address, type ApiResponseError, type MappedError } from "@/lib/api"
import { ADDRESS_MESSAGES, COMMON_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { formatAddressOneLine } from "./format"

/** One shown address: the row as read. */
interface AddressRow {
  /** The id, stable across revalidations; a repeated id adds its occurrence and an id-less row uses its position, so those two can change when the list does. */
  readonly key: string
  readonly address: Address
  /** The one-line address (`formatAddressOneLine`). */
  readonly oneLine: string
  /** The one Primary address: the first row with `primary: true`; a second one reads as a plain row. */
  readonly primary: boolean
}

/** Keys rows by id; a repeated id gets its occurrence, a row without an id its position. */
function rowKeyOf(address: Address, index: number, seen: Map<number, number>): string {
  if (address.id === null) return `none-${index}`
  const count = seen.get(address.id) ?? 0
  seen.set(address.id, count + 1)
  return count === 0 ? `id-${address.id}` : `id-${address.id}-${count}`
}

/** The shown addresses in API order (newest updated first); the first Primary moves to the top and is the only row shown as Primary. */
function addressRowsOf(addresses: readonly Address[]): AddressRow[] {
  const seen = new Map<number, number>()
  const rows = addresses.map((address, index) => ({ key: rowKeyOf(address, index, seen), address, oneLine: formatAddressOneLine(address), primary: false }))
  const first = rows.find((row) => row.address.primary)
  return first ? [{ ...first, primary: true }, ...rows.filter((row) => row !== first)] : rows
}

const [ADDRESS, LABEL, TYPE, STATUS] = SECTION_COLUMNS.addresses

/**
 * Address · Label · Type · Status. Below 768 px line 1 is the address and
 * line 2 (muted) the Primary chip, the type and Verified.
 */
const ADDRESS_READ_COLUMNS: SectionTableColumn<AddressRow>[] = [
  {
    key: "address",
    header: ADDRESS,
    width: "w-[50%]",
    mobileLine: 1,
    cell: (row) => <span className="cell-strong text-foreground">{row.oneLine || COMMON_MESSAGES.notProvided}</span>,
  },
  { key: "label", header: LABEL, cell: (row) => (row.primary ? <Chip variant="primary">{COMMON_MESSAGES.primary}</Chip> : null) },
  // The backend's type as received (Billing, Mailing and Temporary included).
  { key: "type", header: TYPE, cell: (row) => row.address.type },
  { key: "status", header: STATUS, cell: (row) => (row.address.validated ? <StatusBadge status="verified">{COMMON_MESSAGES.verified}</StatusBadge> : null) },
]

/** A read failure without cached data, mapped for the frame. */
const addressesLoadError = (failure: unknown): MappedError | undefined => (failure === undefined ? undefined : mapFetchError("addresses", failure))

/**
 * Addresses (Story 4.1, FR25, NG-9026): the user's addresses from
 * `keys.addresses()` (`GET v2/person/location/list?page=0&size=100`): the
 * Primary first, then the API order (newest updated first). The landmark
 * renders from the first render and is never remounted (F6-1); the header
 * and the Section index show the count.
 *
 * A read failure without cached data shows "Couldn't load addresses" with
 * Retry, which revalidates only the Addresses key; a 403 shows the Section's
 * no-access row and a session end is left to the shell. Once cached the
 * table stays, even if a background revalidation fails.
 *
 * Read only: "Add address", the empty-row action and the row kebab arrive
 * with Stories 4.2 and 4.4 (human decision 1a, 2026-10-19).
 */
export function AddressesSection() {
  const addresses = useSWR<Address[] | undefined, ApiResponseError>(keys.addresses())
  const { onReady } = useSectionFrame("addresses")

  const failure = addresses.data === undefined ? addresses.error : undefined
  // Each new failure (a new error object) is a new attempt, so a repeated failure is announced again
  // once it arrives. Adjusted while rendering, so the first error is not mounted twice.
  const [attempt, setAttempt] = useState(0)
  const [seen, setSeen] = useState<unknown>(failure)
  if (seen !== failure) {
    setSeen(failure)
    if (failure) setAttempt((count) => count + 1)
  }

  const rows = useMemo(() => (addresses.data ? addressRowsOf(addresses.data) : undefined), [addresses.data])
  const loadError = rows ? undefined : addressesLoadError(failure)
  const state: FrameState = rows ? "ready" : loadError ? { error: loadError } : "loading"
  useReportSectionCount("addresses", rows?.length)

  const headingId = sectionHeadingId("addresses")
  return (
    <section id="addresses" aria-labelledby={headingId} className="min-w-0">
      <SectionHeader id="addresses" title={SHELL_MESSAGES.sectionAddresses} count={rows?.length} editing={false} className="mb-2" />
      <StateFrame
        state={state}
        skeleton="table"
        columns={SECTION_COLUMNS.addresses}
        loadError={{ kind: "section", sectionId: "addresses" }}
        level="section"
        onRetry={() => void addresses.mutate()}
        attempt={attempt}
        onReady={onReady}
        // Once ready the Section container is the card.
        className={rows ? "overflow-visible rounded-none border-0 bg-transparent" : undefined}
      >
        {rows && (
          <SectionContainer editing={false}>
            <SectionTable
              rows={rows}
              columns={ADDRESS_READ_COLUMNS}
              getRowKey={(row) => row.key}
              labelledBy={headingId}
              empty={{ message: ADDRESS_MESSAGES.addressesEmpty }}
            />
          </SectionContainer>
        )}
      </StateFrame>
    </section>
  )
}
