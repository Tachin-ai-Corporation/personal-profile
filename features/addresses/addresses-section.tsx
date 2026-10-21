"use client"

import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { useWatch, type Path, type PathValue, type UseFormReturn } from "react-hook-form"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Chip } from "@/components/ui/chip"
import { Combobox, type ComboboxLoadResult } from "@/components/ui/combobox"
import { FieldError, FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { LiveStatus, useAnnounce } from "@/components/ui/live-status"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import { Tooltip } from "@/components/ui/tooltip"
import {
  RowActions,
  RowEditStatus,
  RowRemoval,
  runSaveSteps,
  SECTION_COLUMNS,
  SectionContainer,
  SectionFooter,
  SectionHeader,
  SectionTable,
  StateFrame,
  sectionHeadingId,
  toastError,
  toastSuccess,
  useReportSectionCount,
  useSectionForm,
  useSectionFrame,
  type FrameState,
  type RowEditState,
  type SaveResult,
  type SectionDataStatus,
  type SectionForm,
  type SectionTableColumn,
} from "@/features/shell"
import {
  ADDRESS_TYPES,
  addressCreateBody,
  addressPrimaryBody,
  addressUpdateBody,
  deleteAddress,
  fetchAddresses,
  keys,
  mapApiError,
  mapFetchError,
  newPlacesLookupId,
  placesAutocomplete,
  placesCountryCodeOf,
  placesDetails,
  saveAddressCreate,
  saveAddressUpdate,
  type Address,
  type ApiResponseError,
  type ErrorField,
  type MappedError,
} from "@/lib/api"
import type { PlaceSuggestion } from "@/lib/shared/bff-contract"
import { deepEqual } from "@/lib/shared/deep-equal"
import { ADDRESS_MESSAGES, COMBOBOX_MESSAGES, COMMON_MESSAGES, formatMessage, messageFor, PLACES_MESSAGES, SECTION_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { formatAddressOneLine } from "./format"
import { addressRowsToDelete, addressRowsToSend, mergeAddressRows } from "./save"
import {
  addressDraftDiff,
  addressEditRowOf,
  addressesSchemaWith,
  addressRowOneLine,
  isAddressRowRemoved,
  isAddressRowSendable,
  newAddressEditRow,
  withAddressRemoved,
  withAutoPrimary,
  type AddressEditRow,
  type AddressValues,
} from "./schema"
import { placeAddressFill, suggestionLabel, suggestionStreet } from "./suggestion"

/** One shown address: the row as read. */
interface AddressRow {
  /** The id, stable across revalidations; a repeated id adds its occurrence and an id-less row uses its position, so those two can change when the list does. */
  readonly key: string
  readonly address: Address
  /** The one-line address (`formatAddressOneLine`). */
  readonly oneLine: string
  /** The one Primary address: the first row with `primary: true`; a second one reads as a plain row. */
  readonly primary: boolean
  /** A repeated id's later occurrence: shown, but never edited (only the first one can change). */
  readonly repeat: boolean
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
  const rows = addresses.map((address, index) => {
    const key = rowKeyOf(address, index, seen)
    return { key, address, oneLine: formatAddressOneLine(address), primary: false, repeat: address.id !== null && key !== `id-${address.id}` }
  })
  const first = rows.find((row) => row.address.primary)
  return first ? [{ ...first, primary: true }, ...rows.filter((row) => row !== first)] : rows
}

/**
 * The edit rows of the shown addresses: "Set as primary" checked only on the
 * one row shown as Primary (a second `primary: true` row reads as plain), and
 * a repeated id's later occurrence holds no id, so it is never sent.
 */
function editRowsOf(rows: readonly AddressRow[]): AddressEditRow[] {
  return rows.map((row) => addressEditRowOf(row.key, { ...row.address, id: row.repeat ? null : row.address.id, primary: row.primary }))
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

/** The backend's "not related" answer (Story 4.4, decision 2A): the address was removed elsewhere (`lib/api/errors/addresses.ts`). */
const isRemovedElsewhere = (mapped: MappedError): boolean => mapped.kind === "field" && mapped.messageKey === "addresses.removedElsewhere"

/**
 * Why a row's Remove is unavailable, if it is (Story 4.4), against the rows
 * as they stand (the form's while editing, so a Primary moved in the draft
 * frees the old one): the last address left ("You need at least one
 * address"; only when the person had saved addresses, so a first new row can
 * still go), else the Primary ("Make another address primary first").
 */
function removeReasonOf(primary: boolean, remaining: number, hadSaved: boolean): string | undefined {
  if (remaining <= 1) return hadSaved ? ADDRESS_MESSAGES.onlyAddress : undefined
  return primary ? ADDRESS_MESSAGES.makeAnotherPrimaryFirst : undefined
}

// --- Edit view --------------------------------------------------------------------------------

type AddressSectionForm = SectionForm<AddressValues>

/** A row of the edit table with its index in the form's `rows` (its field paths). */
interface EditItem {
  readonly row: AddressEditRow
  readonly index: number
}

/** The form path of a row's field. */
const fieldPath = (index: number, field: keyof AddressEditRow) => `rows.${index}.${field}` as Path<AddressValues>

/** The row's chevron (focus only: the header Edit's first stop, and focus kept across a toggle). */
const togglePath = (index: number) => fieldPath(index, "key")

/** The row's Remove / Restore (focus only: Restore after a Remove, Story 4.4). */
const removalPath = (index: number) => fieldPath(index, "removed")

/** The DOM id of a row's chevron. */
const toggleId = (key: string) => `addresses-toggle-${key}`

/** The id of a row's edit status ("New · not saved", "Removed on save"): its Restore is described by it. */
const statusIdOf = (key: string) => `addresses-row-${key}-status`

/** A row that can be removed (Story 4.4): a new row, or a saved row with an id (an id-less row or a repeat has nothing to send). */
const isRemovable = (row: AddressEditRow): boolean => isAddressRowSendable(row)

/** A row that can be expanded and edited: a removable row that isn't struck through. */
const isExpandable = (row: AddressEditRow): boolean => isRemovable(row) && !isAddressRowRemoved(row)

/** The row's place in the edit view: new, struck through or saved. */
const rowStateOf = (row: AddressEditRow): RowEditState => (row.isNew ? "new" : isAddressRowRemoved(row) ? "removed" : "saved")

/** The fields an expanded row holds (a collapsed row is expanded to show one of them). */
const EXPANDED_FIELDS: ReadonlySet<string> = new Set(["type", "country", "primary", "line1", "line2", "city", "county", "state", "zip"])

/** The server field errors the table names (`lib/api/errors/addresses.ts`). */
const ADDRESS_ERROR_FIELDS = ["type", "country", "line1", "city", "zip", "primary"] as const

/** The Address Types offered (decision 2a). */
const ADDRESS_TYPE_LABELS: Readonly<Record<(typeof ADDRESS_TYPES)[number], string>> = {
  Home: ADDRESS_MESSAGES.typeHome,
  "Main Work": ADDRESS_MESSAGES.typeMainWork,
  "Other Work": ADDRESS_MESSAGES.typeOtherWork,
  "Vacation Home": ADDRESS_MESSAGES.typeVacationHome,
}
const ADDRESS_TYPE_OPTIONS: readonly SelectOption[] = ADDRESS_TYPES.map((value) => ({ value, label: ADDRESS_TYPE_LABELS[value] }))

const EMPTY_KEYS: ReadonlySet<string> = new Set()

/** A new row key (`new-<n>`) no row holds yet; `counter` is the Section's, kept across renders. */
function nextNewKey(rows: readonly AddressEditRow[], counter: { current: number }): string {
  let key: string
  do {
    counter.current += 1
    key = `new-${counter.current}`
  } while (rows.some((row) => row.key === key))
  return key
}

/** The server field errors' target: the row whose request failed last. */
interface FailedRowTarget {
  /** `useSectionForm` `errorFields`: each server field error at the failed row's field, read when the failure is shown. */
  readonly errorFields: Partial<Record<ErrorField, Path<AddressValues>>>
  /** Names the failed row (its index in the form rows), or none: its errors then show at Section level. */
  readonly setRow: (index: number | null) => void
}

/** The Section's failed-row target (`ADDRESS_ERROR_FIELDS`, `lib/api/errors/addresses.ts`), kept for its lifetime. */
function createFailedRowTarget(): FailedRowTarget {
  let failed: number | null = null
  const errorFields: Partial<Record<ErrorField, Path<AddressValues>>> = {}
  for (const field of ADDRESS_ERROR_FIELDS) {
    Object.defineProperty(errorFields, field, { enumerable: true, get: () => (failed === null ? undefined : fieldPath(failed, field)) })
  }
  return {
    errorFields,
    setRow: (index) => {
      failed = index
    },
  }
}

type AddressForm = UseFormReturn<AddressValues, unknown, AddressValues>

/** Sets a row field the way a suggestion pick does: dirty and validated, but not a user change. */
function setRowField<K extends keyof AddressEditRow>(form: AddressForm, index: number, field: K, value: AddressEditRow[K]): void {
  const path = fieldPath(index, field)
  form.setValue(path, value as PathValue<AddressValues, typeof path>, { shouldDirty: true, shouldValidate: true })
}

/** A manual edit of an address part (line 1, city, county, state, zip, country; never line 2, decision 2a) clears the row's "Verified" (Story 4.3). */
function clearVerified(form: AddressForm, index: number): void {
  const path = fieldPath(index, "validated")
  if (form.getValues(path) === true) form.setValue(path, false as PathValue<AddressValues, typeof path>, { shouldDirty: true })
}

/** A row's typed line 1 and "Verified" before a pick (a failed pick puts them back); never a pending pick's street. */
interface Line1Snapshot {
  readonly line1: string
  readonly validated: boolean
}

/**
 * The address lookups (Story 4.3): one lookup id per row, reused for every
 * keystroke until its details call (a pick), until line 1 is emptied or the
 * row's Places country changes; and the row's pending pick (its details call
 * not answered yet).
 */
interface PlacesLookups {
  /** The row's current lookup id (a new one when it has none). */
  readonly lookupFor: (rowKey: string) => string
  /** Ends the row's lookup: its next search starts a new one. */
  readonly end: (rowKey: string) => void
  /** A pick's details call starts: returns its token (a newer pick in the row supersedes it). */
  readonly startPick: (rowKey: string, street: string, before: Line1Snapshot) => number
  /** The pending pick's snapshot while line 1 still shows its street (`text`), else none. */
  readonly pendingBefore: (rowKey: string, text: string) => Line1Snapshot | undefined
  /** The pick's details answered: `true` when it is still the row's latest pick (then it is no longer pending). */
  readonly finishPick: (rowKey: string, token: number) => boolean
  /** Ends every lookup and pending pick (the edit ended). */
  readonly clear: () => void
}

/** The Section's lookups, kept for its lifetime. */
function createPlacesLookups(): PlacesLookups {
  const ids = new Map<string, string>()
  const picks = new Map<string, { readonly token: number; readonly street: string; readonly before: Line1Snapshot }>()
  let tokens = 0
  return {
    lookupFor: (rowKey) => {
      const existing = ids.get(rowKey)
      if (existing !== undefined) return existing
      const id = newPlacesLookupId()
      ids.set(rowKey, id)
      return id
    },
    end: (rowKey) => {
      ids.delete(rowKey)
    },
    startPick: (rowKey, street, before) => {
      tokens += 1
      picks.set(rowKey, { token: tokens, street, before })
      return tokens
    },
    pendingBefore: (rowKey, text) => {
      const pick = picks.get(rowKey)
      return pick && pick.street === text ? pick.before : undefined
    },
    finishPick: (rowKey, token) => {
      if (picks.get(rowKey)?.token !== token) return false
      picks.delete(rowKey)
      return true
    },
    clear: () => {
      ids.clear()
      picks.clear()
    },
  }
}

/** What the server said about suggestions in this Section: nothing yet, `enabled: true` seen, or `enabled: false` (off for the Section's lifetime). */
type PlacesStatus = "unknown" | "on" | "off"

/** What line 1's suggestions need from the Section. */
interface PlacesState {
  readonly status: PlacesStatus
  /** An answer said `enabled: true` (the help line shows from now on, unless suggestions are off). */
  readonly markOn: () => void
  /** An answer said `enabled: false` (`PLACES_ENABLED` off): suggestions stay off for the Section's lifetime. */
  readonly markOff: () => void
  readonly lookups: PlacesLookups
  /** A suggestion was picked in the row: line 1 shows its street, then its details fill the row (`before` is put back when they fail). */
  readonly onPick: (rowKey: string, suggestion: PlaceSuggestion, before: Line1Snapshot) => void
}

/** The countries the Country select offers, and their load state (read only in edit view). */
interface CountriesState {
  readonly names: readonly string[]
  readonly loading: boolean
  readonly failed: boolean
  readonly retry: () => void
}

interface SelectOption {
  readonly value: string
  readonly label: string
}

interface RowToggleProps {
  readonly section: AddressSectionForm
  readonly item: EditItem
  /** How the row is named: its saved one-line address, or "New address". */
  readonly name: string
  readonly expanded: boolean
  readonly onToggle: (key: string) => void
}

/** The 44 px chevron that expands or collapses a row: "Expand {address}" / "Collapse {address}", `aria-expanded`. */
function RowToggle({ section, item, name, expanded, onToggle }: RowToggleProps) {
  const { ref } = section.control(togglePath(item.index))
  return (
    <Button
      ref={ref}
      id={toggleId(item.row.key)}
      type="button"
      variant="ghost"
      size="icon"
      className="size-11 shrink-0"
      aria-expanded={expanded}
      aria-label={formatMessage(expanded ? ADDRESS_MESSAGES.collapseAddress : ADDRESS_MESSAGES.expandAddress, { address: name })}
      onClick={() => onToggle(item.row.key)}
    >
      {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </Button>
  )
}

interface FieldProps {
  readonly section: AddressSectionForm
  readonly index: number
  readonly className?: string
}

interface TextFieldProps extends FieldProps {
  readonly field: "line2" | "city" | "county" | "state" | "zip"
  readonly label: string
  readonly optional?: boolean
  readonly autoComplete: string
}

/**
 * A text field (44 px, 16 px text), labelled, validated on blur; optional
 * ones end in "(optional)". Typing in any but line 2 clears "Verified".
 */
function AddressTextField({ section, index, field, label, optional = false, autoComplete, className }: TextFieldProps) {
  const path = fieldPath(index, field)
  const registered = section.field(path)
  return (
    <FormField label={label} optional={optional} required={!optional} error={section.errorFor(path)} className={cn("min-w-0", className)}>
      {(control) => (
        <Input
          {...control}
          {...registered}
          onChange={(event) => {
            const changed = registered.onChange(event)
            if (field !== "line2") clearVerified(section.form, index)
            return changed
          }}
          autoComplete={autoComplete}
        />
      )}
    </FormField>
  )
}

interface Line1FieldProps extends FieldProps {
  readonly row: AddressEditRow
  readonly places: PlacesState
}

const NO_SUGGESTIONS: ComboboxLoadResult<PlaceSuggestion> = { items: [], hasMore: false }

/**
 * Address line 1 (Story 4.3): the address `Combobox` variant. Free text
 * (Tab keeps it), suggestions from 3 characters after 250 ms, at most 5,
 * the typed text in 600, no loading or error rows, "Powered by Google" under
 * them. Search is on only for a US/CA/AU row while the server hasn't answered
 * `enabled: false`; then the help line shows too. Typing is a user change
 * (drafts, dirty) and clears "Verified"; a pick hands the suggestion to the
 * Section (`places.onPick`). Read-only while saving.
 */
function AddressLine1Field({ section, index, row, places, className }: Line1FieldProps) {
  const path = fieldPath(index, "line1")
  const { ref, ...binding } = section.control(path)
  const text = String(binding.value ?? "")
  const countryCode = placesCountryCodeOf(row.country)
  const searchOn = countryCode !== null && places.status !== "off"
  // Unknown → hidden: with Places off (production until the BAA) the help line never shows.
  const helpOn = countryCode !== null && places.status === "on"
  /** The row before the latest text change: a pick's own text change is undone from it when its details fail. */
  const before = useRef<Line1Snapshot>({ line1: text, validated: row.validated })
  const input = useRef<HTMLInputElement | null>(null)
  // The form's ref (first invalid field, mapped errors) plus our own, for the read-only state below.
  const inputRef = (element: HTMLInputElement | null): void => {
    input.current = element
    ref(element)
  }
  // The Combobox has no read-only state and turns autofill off: the input is made read-only while saving, as the
  // other fields are, and keeps its `address-line1` autofill purpose (WCAG 1.3.5).
  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    element.setAttribute("autocomplete", "address-line1")
    element.readOnly = binding.readOnly
    if (binding.readOnly) element.setAttribute("aria-readonly", "true")
    else element.removeAttribute("aria-readonly")
  })

  async function load(query: string, _page: number, signal: AbortSignal): Promise<ComboboxLoadResult<PlaceSuggestion>> {
    if (countryCode === null) return NO_SUGGESTIONS
    const answer = await placesAutocomplete({ input: query, countryCode, lookupId: places.lookups.lookupFor(row.key) }, signal)
    if (answer.enabled) places.markOn()
    else places.markOff()
    return { items: answer.suggestions, hasMore: false }
  }

  return (
    <Combobox<PlaceSuggestion>
      // A new Places country starts over: no suggestions of the old one stay pickable.
      key={countryCode ?? "none"}
      label={ADDRESS_MESSAGES.line1Label}
      required
      help={helpOn ? COMBOBOX_MESSAGES.addressHelp : undefined}
      error={section.errorFor(path)}
      className={cn("min-w-0", className)}
      inputRef={inputRef}
      mode="free-text"
      minChars={3}
      debounceMs={250}
      maxResults={5}
      quiet
      highlightMatch
      searchDisabled={!searchOn || binding.readOnly}
      endMessage={PLACES_MESSAGES.poweredByGoogle}
      load={load}
      getKey={(suggestion) => suggestion.placeId}
      getLabel={suggestionLabel}
      text={text}
      onTextChange={(next) => {
        if (binding.readOnly) return
        // A pick's own text change starts from a pending pick's street: keep that pick's typed snapshot instead.
        before.current = places.lookups.pendingBefore(row.key, text) ?? { line1: text, validated: section.form.getValues(fieldPath(index, "validated")) === true }
        binding.onChange(next as PathValue<AddressValues, Path<AddressValues>>)
        clearVerified(section.form, index)
        if (next.trim() === "") places.lookups.end(row.key)
      }}
      onSelect={(selection) => {
        if (selection?.type === "option") places.onPick(row.key, selection.item, before.current)
      }}
      onBlur={binding.onBlur}
    />
  )
}

interface SelectFieldProps extends FieldProps {
  readonly field: "type" | "country"
  readonly label: string
  readonly options: readonly SelectOption[]
  readonly placeholder: string
  readonly loading?: boolean
  readonly helper?: ReactNode
  /** A user change of the value (after the form holds it). */
  readonly onUserChange?: (value: string) => void
}

/**
 * A required Select (Address Type, Country). A saved value the list doesn't
 * offer still shows on the trigger (`unlistedValue`) until changed.
 * Read-only while saving: it doesn't open and ignores changes.
 */
function AddressSelectField({ section, index, field, label, options, placeholder, loading = false, helper, onUserChange, className }: SelectFieldProps) {
  const path = fieldPath(index, field)
  const { ref, ...binding } = section.control(path)
  // Opening the list moves focus off the trigger: validate when the list closes (or the trigger loses focus while closed),
  // so a pick never leaves a stale "Choose…" error behind.
  const [open, setOpen] = useState(false)
  const value = String(binding.value ?? "")
  const unlisted = value !== "" && !options.some((option) => option.value === value) ? { value } : undefined
  return (
    <FormField label={label} required error={section.errorFor(path)} className={cn("min-w-0", className)}>
      {(control) => (
        <Select
          value={value}
          open={binding.readOnly ? false : open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) binding.onBlur()
          }}
          onValueChange={(next) => {
            if (binding.readOnly) return
            binding.onChange(next as PathValue<AddressValues, Path<AddressValues>>)
            if (field === "country") clearVerified(section.form, index)
            onUserChange?.(next)
          }}
          placeholder={placeholder}
          unlistedValue={unlisted}
          loading={loading}
          helper={helper}
        >
          <SelectTrigger
            ref={ref}
            id={control.id}
            aria-describedby={control["aria-describedby"]}
            aria-invalid={control["aria-invalid"]}
            aria-required
            aria-readonly={binding.readOnly || undefined}
            onBlur={() => {
              if (!open) binding.onBlur()
            }}
            className="w-full min-w-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  )
}

interface PrimaryFieldProps extends FieldProps {
  /** The box was checked: every other row's box is unchecked (Story 4.4). */
  readonly onChecked: (index: number) => void
  /** This is the only sendable row left: its locked box says so instead of "Set another address as primary first". */
  readonly onlyRow: boolean
}

/**
 * "Set as primary" (Story 4.4): a 44 px checkbox with its label after it,
 * sent as `primary`. Exclusive: checking it unchecks every other row's box
 * (`onChecked`). A checked box can't be unchecked (another row is made
 * Primary instead): it is aria-disabled, stays focusable and is described
 * by its reason, "Set another address as primary first" ("Your only
 * address is your primary address" for the only row left), also in a
 * Tooltip that a press keeps open. Read-only while saving.
 */
function PrimaryField({ section, index, onChecked, onlyRow, className }: PrimaryFieldProps) {
  const path = fieldPath(index, "primary")
  const { ref, ...binding } = section.control(path)
  const id = useId()
  const errorId = `${id}-error`
  const reasonId = `${id}-reason`
  const error = section.errorFor(path)
  const locked = binding.value === true
  const reason = onlyRow ? ADDRESS_MESSAGES.onlyAddressPrimary : ADDRESS_MESSAGES.primaryFirst
  const describedBy = [locked ? reasonId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined
  return (
    <div data-slot="address-primary" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center">
        {/* Always wrapped (an empty, hidden tooltip while unlocked), so the box never remounts and keeps focus when checked. */}
        <Tooltip content={locked ? reason : <></>} contentClassName={locked ? undefined : "hidden"} keepOpenOnPress>
          <Checkbox
            ref={ref}
            id={id}
            checked={locked}
            ariaDisabled={locked}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            aria-readonly={binding.readOnly || undefined}
            onCheckedChange={(next) => {
              if (binding.readOnly || next !== true) return
              binding.onChange(true as PathValue<AddressValues, Path<AddressValues>>)
              onChecked(index)
            }}
            onBlur={binding.onBlur}
            className="-ml-3"
          />
        </Tooltip>
        <label htmlFor={id} className="text-body-sm text-foreground font-medium">
          {ADDRESS_MESSAGES.setAsPrimary}
        </label>
        {locked ? (
          <span id={reasonId} className="sr-only">
            {reason}
          </span>
        ) : null}
      </div>
      <div aria-live="polite">{error ? <FieldError id={errorId}>{error}</FieldError> : null}</div>
    </div>
  )
}

interface ExpandedRowProps {
  readonly section: AddressSectionForm
  readonly item: EditItem
  readonly name: string
  readonly onToggle: (key: string) => void
  readonly countries: CountriesState
  readonly places: PlacesState
  /** The row's Remove (Story 4.4; an expanded row is one full-width cell, so it sits in the row's header line). */
  readonly removal: ReactNode
  readonly onPrimaryChecked: (index: number) => void
  /** The row is the only sendable row left (its Primary box's reason). */
  readonly onlyRow: boolean
}

/**
 * An expanded row (EXPERIENCE.md Address edit row): the chevron and "New
 * address · New · not saved" (or the saved one-line address), then the
 * 4-column grid [Address Type][Country][Set as primary ×2] / [Address line 1
 * ×2][Address line 2 ×2] / [City][County][State/Province][Zip] with 16 px
 * gaps; below 768 px every field is full width.
 */
function AddressExpandedRow({ section, item, name, onToggle, countries, places, removal, onPrimaryChecked, onlyRow }: ExpandedRowProps) {
  const { row, index } = item
  const countryOptions = countries.names.map((country) => ({ value: country, label: country }))
  const countriesHelper = countries.failed ? (
    <span data-slot="countries-error" className="inline-flex flex-wrap items-center gap-x-1">
      {ADDRESS_MESSAGES.countriesLoadError}
      <span aria-hidden="true">·</span>
      <Button type="button" variant="link" size="touch" className="px-1" onClick={countries.retry}>
        {COMMON_MESSAGES.retry}
      </Button>
    </span>
  ) : undefined
  return (
    <div data-slot="address-expanded" className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <RowToggle section={section} item={item} name={name} expanded onToggle={onToggle} />
        {row.isNew ? (
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span className="cell-strong text-foreground">{ADDRESS_MESSAGES.newAddress}</span>
            <span className="text-muted-foreground">
              <span aria-hidden="true">· </span>
              {SECTION_MESSAGES.newNotSaved}
            </span>
          </span>
        ) : (
          <span className="cell-strong text-foreground min-w-0">{name}</span>
        )}
        {removal ? <div className="ml-auto shrink-0">{removal}</div> : null}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-4">
        <AddressSelectField
          section={section}
          index={index}
          field="type"
          label={ADDRESS_MESSAGES.typeLabel}
          options={ADDRESS_TYPE_OPTIONS}
          placeholder={ADDRESS_MESSAGES.chooseType}
        />
        <AddressSelectField
          section={section}
          index={index}
          field="country"
          label={ADDRESS_MESSAGES.countryLabel}
          options={countryOptions}
          placeholder={ADDRESS_MESSAGES.chooseCountry}
          loading={countries.loading}
          helper={countriesHelper}
          onUserChange={(next) => {
            // Another Places country: the row's lookup ends (its suggestions belong to the old country).
            if (placesCountryCodeOf(next) !== placesCountryCodeOf(row.country)) places.lookups.end(row.key)
          }}
        />
        <PrimaryField section={section} index={index} onChecked={onPrimaryChecked} onlyRow={onlyRow} className="md:col-span-2 md:pt-7" />
        <AddressLine1Field section={section} index={index} row={row} places={places} className="md:col-span-2" />
        <AddressTextField section={section} index={index} field="line2" label={ADDRESS_MESSAGES.line2Label} optional autoComplete="address-line2" className="md:col-span-2" />
        <AddressTextField section={section} index={index} field="city" label={ADDRESS_MESSAGES.cityLabel} autoComplete="address-level2" />
        <AddressTextField section={section} index={index} field="county" label={ADDRESS_MESSAGES.countyLabel} optional autoComplete="off" />
        <AddressTextField section={section} index={index} field="state" label={ADDRESS_MESSAGES.stateLabel} optional autoComplete="address-level1" />
        <AddressTextField section={section} index={index} field="zip" label={ADDRESS_MESSAGES.zipLabel} autoComplete="postal-code" />
      </div>
    </div>
  )
}

interface EditColumnsInput {
  readonly section: AddressSectionForm
  readonly expanded: ReadonlySet<string>
  readonly onToggle: (key: string) => void
  /** How each row is named (`nameOf`). */
  readonly nameOf: (row: AddressEditRow) => string
}

/** A collapsed row in edit view: the chevron, then the read columns with the form's current values. */
function addressEditColumns({ section, expanded, onToggle, nameOf }: EditColumnsInput): SectionTableColumn<EditItem>[] {
  return [
    {
      key: "address",
      header: ADDRESS,
      width: "w-[50%]",
      cell: (item) => (
        <div className="flex min-w-0 items-center gap-2">
          {isExpandable(item.row) ? (
            <RowToggle section={section} item={item} name={nameOf(item.row)} expanded={expanded.has(item.row.key)} onToggle={onToggle} />
          ) : null}
          <span className="cell-strong text-foreground min-w-0">{addressRowOneLine(item.row) || (item.row.isNew ? ADDRESS_MESSAGES.newAddress : COMMON_MESSAGES.notProvided)}</span>
        </div>
      ),
    },
    { key: "label", header: LABEL, cell: ({ row }) => (row.primary ? <Chip variant="primary">{COMMON_MESSAGES.primary}</Chip> : null) },
    { key: "type", header: TYPE, cell: ({ row }) => row.type },
    {
      key: "status",
      header: STATUS,
      // The row's form "Verified" (Story 4.3): as saved, set by a complete pick, cleared by a manual edit; "New · not saved" or "Removed on save" (Story 4.4).
      cell: ({ row }) => {
        const state = rowStateOf(row)
        if (state !== "saved") return <RowEditStatus state={state} id={statusIdOf(row.key)} />
        return row.validated ? <StatusBadge status="verified">{COMMON_MESSAGES.verified}</StatusBadge> : null
      },
    },
  ]
}

/**
 * Addresses (Stories 4.1–4.4, FR25–FR27, NG-9026): the user's addresses from
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
 * Edit (Story 4.2) runs on `useSectionForm` (registered as `addresses`,
 * order 5, drafts of `rows`). It is entered from the header Edit (every row
 * collapsed, focus on the first chevron), a row kebab's Edit (that row
 * expanded, focus on its Address Type) or "Add address" (header, empty row,
 * footer: one new row, expanded, focus on its Address Type). A collapsed row
 * is its chevron and the read columns; an expanded row holds the field grid.
 * The expanded rows live here, by row key (the 768 px swap remounts cells).
 * Countries (`keys.countries()`) load only in edit view.
 *
 * Save sends one request per new row (POST) or changed saved row (PUT), the
 * newly Primary row first, through `runSaveSteps` (`stop`); a failure
 * refetches, rebuilds the rows from the fresh data (`mergeAddressRows`) and
 * shows the error at the failed row's field (`createFailedRowTarget`,
 * `failedRow.errorFields`) or at
 * Section level, so Retry sends only what is left.
 *
 * Primary and removal (Story 4.4): "Set as primary" is exclusive, the
 * checked box can't be unchecked, and the one row left is always the
 * Primary. A read-view kebab offers Make primary (a non-Primary row: one PUT
 * at once, no confirm; decision 1B), Edit and Remove; Remove (and the edit
 * view's Remove / Restore) strikes a saved row through until Save, which
 * deletes it after every write, and deletes a new row outright. Remove is
 * aria-disabled on the Primary and on the last address, checked against the
 * draft. An address removed elsewhere (the backend's "not related" answer)
 * shows its own message and leaves the form, so Retry sends only the rest.
 *
 * Suggestions (Story 4.3): line 1 of an expanded row is the address
 * `Combobox` (`AddressLine1Field`) on `POST /api/places/autocomplete`, for a
 * US/CA/AU row only; a pick fills the row from `/api/places/details` and a
 * complete address sets its `validated`, which any later manual edit of an
 * address part (never line 2) clears. Save sends `validated` as the form
 * holds it. An `enabled: false` answer (`PLACES_ENABLED` off) turns
 * suggestions and their help line off for the Section's lifetime.
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
  const dataStatus: SectionDataStatus = rows ? "loaded" : loadError ? "error" : "loading"
  useReportSectionCount("addresses", rows?.length)

  const baseline = useMemo<AddressValues>(() => ({ rows: editRowsOf(rows ?? []) }), [rows])
  // A failed recovery read cannot undo acknowledged writes. Use the same saved
  // rows for validation and retry diffs until the server list changes or edit ends.
  const [recovery, setRecovery] = useState<{ source: AddressValues; value: AddressValues } | null>(null)
  if (recovery && !deepEqual(recovery.source, baseline)) setRecovery(null)
  const editBaseline = recovery?.value ?? baseline

  // Countries load only in edit view (`wantCountries` follows the edit mode, adjusted while rendering below).
  const [wantCountries, setWantCountries] = useState(false)
  const countries = useSWR<string[] | undefined, ApiResponseError>(wantCountries ? keys.countries() : null)
  const countriesFailed = wantCountries && countries.data === undefined && countries.error !== undefined
  const schema = useMemo(() => addressesSchemaWith({ saved: editBaseline.rows, countriesFailed }), [editBaseline.rows, countriesFailed])

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(EMPTY_KEYS)
  const newKeys = useRef(0)
  const [failedRow] = useState(createFailedRowTarget)
  const [placesStatus, setPlacesStatus] = useState<PlacesStatus>("unknown")
  const { message: placesMessage, announce: announcePlaces } = useAnnounce()
  /** The edit state when a details answer arrives (it applies only while editing and not saving). */
  const editState = useRef({ editing: false, saving: false })
  const [lookups] = useState(createPlacesLookups)
  // The latest render's form, rebase, countries and rows: the save, `revealField` and kebab items run later.
  const formRef = useRef<AddressForm | null>(null)
  const rebaseRef = useRef<(next: AddressValues) => void>(() => undefined)
  const latestCountries = useRef<readonly string[]>([])
  const latestRows = useRef<readonly AddressEditRow[]>(baseline.rows)
  const latestSaved = useRef<readonly AddressEditRow[]>(baseline.rows)
  /** The shown (read view) rows of the latest render: Make primary and its toast's Retry run later. */
  const latestShown = useRef<readonly AddressRow[] | undefined>(rows)
  /** A Make primary in flight: a second one meanwhile (a repeated press or Retry) does nothing. */
  const sendingPrimary = useRef(false)
  /** A new row was deleted outright: the next commit focuses the Section h2. */
  const focusHeadingAfterRender = useRef(false)
  const [, setFocusTick] = useState(0)
  useEffect(() => {
    if (!focusHeadingAfterRender.current) return
    focusHeadingAfterRender.current = false
    document.getElementById(sectionHeadingId("addresses"))?.focus()
  })

  /** Refetches the list into the cache; throws when it fails (the save's baseline then stays). */
  async function refetchAddresses(): Promise<Address[]> {
    const res = await fetchAddresses()
    if (!res.success || !res.data) throw new Error("addresses refetch failed")
    await addresses.mutate(res.data, { revalidate: false })
    return res.data
  }

  async function save(values: AddressValues, before: AddressValues): Promise<SaveResult> {
    failedRow.setRow(null)
    // The one row left is the Primary (Story 4.4), e.g. a legacy sole non-Primary address, fixed on its next save.
    const rows = withAutoPrimary(values.rows)
    if (rows !== values.rows) formRef.current?.setValue("rows", rows)
    const savedByKey = new Map(before.rows.map((row) => [row.key, row]))
    // The newly Primary row first, then the other writes, then the deletes (Story 4.4).
    const queue = addressRowsToSend(rows, before.rows)
    const removals = addressRowsToDelete(rows)
    if (queue.length === 0 && removals.length === 0) return { ok: true }
    const listedCountries = new Set(latestCountries.current)
    const succeeded = new Set<string>()
    const created = new Map<string, number | null>()
    const deleted = new Set<string>()
    /** The row whose request went out last: with `stop`, the failed one when the save fails. */
    let attempted: AddressEditRow | undefined
    let current = rows
    /** The refetch after a failure ran and rebuilt the rows (`mergeAddressRows`). */
    let rebased = false
    const result = await runSaveSteps<string, Address[]>(
      [
        ...queue.map((row) => ({
          part: row.key,
          run: async () => {
            attempted = row
            if (row.isNew) {
              // `validated` as the form holds it: true only after a complete suggestion pick (Story 4.3).
              const res = await saveAddressCreate(addressCreateBody(row))
              if (res.success) {
                succeeded.add(row.key)
                created.set(row.key, res.data?.id ?? null)
              }
              return res
            }
            const res = await saveAddressUpdate(row.id as number, addressUpdateBody(row, savedByKey.get(row.key) as AddressEditRow, { listedCountries }))
            if (res.success) succeeded.add(row.key)
            return res
          },
        })),
        ...removals.map((row) => ({
          part: row.key,
          run: async () => {
            attempted = row
            const res = await deleteAddress(row.id as number)
            if (res.success) deleted.add(row.key)
            // Already gone (removed elsewhere, decision 2A): the delete is done.
            else if (isRemovedElsewhere(mapApiError("addresses", res))) {
              deleted.add(row.key)
              return { success: true }
            }
            return res
          },
        })),
      ],
      {
        scope: "addresses",
        mode: "stop",
        refetch: refetchAddresses,
        rebase: (fresh) => {
          const freshRows = editRowsOf(addressRowsOf(fresh))
          current = mergeAddressRows({ rows, before: before.rows, fresh: freshRows, succeeded, created, deleted })
          formRef.current?.setValue("rows", current)
          rebaseRef.current({ rows: freshRows })
          rebased = true
        },
      },
    )
    // No rebuild (a session end, or the refetch failed): the created rows are saved all the same, so Retry must never
    // POST them again. Each becomes a saved row with its new id; one whose id is unknown leaves the form. A deleted row
    // leaves the form too, and so does the failed row when it was removed elsewhere (Retry never re-sends it).
    const gone = !result.ok && isRemovedElsewhere(result.error.mapped) ? attempted?.key : undefined
    if (!rebased && (succeeded.size > 0 || deleted.size > 0 || gone !== undefined)) {
      current = rows.flatMap((row) => {
        if (deleted.has(row.key) || row.key === gone) return []
        if (!row.isNew || !created.has(row.key)) return [row]
        const id = created.get(row.key) ?? null
        return id === null ? [] : [{ ...row, key: `id-${id}`, id, isNew: false }]
      })
      formRef.current?.setValue("rows", current)
      const createdIds = new Set([...created.values()].filter((id) => id !== null))
      const acknowledged = current.filter((row) => !row.isNew && (succeeded.has(row.key) || (row.id !== null && createdIds.has(row.id))))
      const primary = acknowledged.find((row) => row.primary)
      const acknowledgedByKey = new Map(acknowledged.map((row) => [row.key, row]))
      const saved = before.rows
        .filter((row) => !deleted.has(row.key) && row.key !== gone)
        .map((row) => acknowledgedByKey.get(row.key) ?? row)
      const savedKeys = new Set(saved.map((row) => row.key))
      const next = {
        rows: [...saved, ...acknowledged.filter((row) => !savedKeys.has(row.key))]
          .map((row) => primary && row.key !== primary.key && row.primary ? { ...row, primary: false } : row),
      }
      setRecovery({ source: baseline, value: next })
      rebaseRef.current(next)
    }
    if (result.ok) {
      try {
        await refetchAddresses()
      } catch {
        // Saved: the read view catches up with the next revalidation.
        void addresses.mutate()
      }
      return { ok: true }
    }
    // `stop`: the last request sent is the one that failed. A failed DELETE (a struck-through row, never expanded) and a
    // row that left the form (removed elsewhere) show their error at Section level.
    const failed = attempted
    const index = failed && !isAddressRowRemoved(failed) ? current.findIndex((row) => row.key === failed.key) : -1
    failedRow.setRow(index < 0 ? null : index)
    return { ok: false, error: { code: result.error.code, mapped: result.error.mapped } }
  }

  /**
   * A picked suggestion (Story 4.3): line 1 shows its street (so a Save
   * meanwhile sends the street, never the whole label), then its details
   * (same lookup id; the row's next search starts a new lookup) fill the row
   * (`placeAddressFill`), with `validated` true only for a complete address
   * whose country the Select can show, and a polite announcement. The answer
   * applies only to the row's latest pick, while the Section is editing and
   * not saving and no address part has changed since the pick; a failure then puts the
   * typed text back silently, and `enabled: false` turns suggestions off.
   */
  async function pickSuggestion(rowKey: string, suggestion: PlaceSuggestion, before: Line1Snapshot): Promise<void> {
    const form = formRef.current
    const at = form?.getValues("rows").findIndex((row) => row.key === rowKey) ?? -1
    if (!form || at < 0) return
    const street = suggestionStreet(suggestion)
    const lookupId = lookups.lookupFor(rowKey)
    lookups.end(rowKey)
    const token = lookups.startPick(rowKey, street, before)
    setRowField(form, at, "line1", street)
    // Keep billing-session handling above unchanged. A details answer belongs
    // to this address snapshot, including parts that Places does not fill.
    const picked = { ...form.getValues("rows")[at] }
    const answer = await placesDetails({ placeId: suggestion.placeId, lookupId })
    if (!lookups.finishPick(rowKey, token)) return
    const latest = formRef.current
    const index = latest?.getValues("rows").findIndex((row) => row.key === rowKey) ?? -1
    const { editing, saving } = editState.current
    if (!latest || index < 0 || !editing || saving) return
    const current = latest.getValues("rows")[index]
    const parts = ["line1", "line2", "city", "county", "state", "zip", "country", "validated"] as const
    if (parts.some((part) => current[part] !== picked[part])) return
    if (answer === null || !answer.enabled) {
      if (answer !== null) setPlacesStatus("off")
      setRowField(latest, index, "line1", before.line1)
      setRowField(latest, index, "validated", before.validated)
      return
    }
    const fill = placeAddressFill(answer.address, latestCountries.current, street)
    for (const field of ["line1", "city", "county", "state", "zip", "country", "validated"] as const) {
      const value = fill[field]
      if (value !== undefined) setRowField(latest, index, field, value)
    }
    announcePlaces(fill.validated ? PLACES_MESSAGES.addressFilledVerified : PLACES_MESSAGES.addressFilled)
  }

  const [toggleOrder, setToggleOrder] = useState<readonly Path<AddressValues>[]>([])

  const section = useSectionForm<AddressValues>({
    id: "addresses",
    label: SHELL_MESSAGES.sectionAddresses,
    displayOrder: 5,
    schema,
    baseline: editBaseline,
    save,
    onNoChanges: "close",
    cancelFocus: "heading",
    // The header Edit focuses the first chevron.
    fieldOrder: toggleOrder,
    errorFields: failedRow.errorFields,
    draftFields: ["rows"],
    describeDraftDiff: addressDraftDiff,
    dataStatus,
    revealField: (path) => {
      const match = /^rows\.(\d+)\.(\w+)$/.exec(path)
      if (!match) return false
      const row = latestRows.current[Number(match[1])]
      if (!row || !isExpandable(row) || !EXPANDED_FIELDS.has(match[2])) return false
      setExpanded((previous) => (previous.has(row.key) ? previous : new Set([...previous, row.key])))
      return true
    },
  })
  const { form, isEditing, isSaving, rebase } = section
  const watchedRows = useWatch({ control: form.control, name: "rows" })
  const formRows = useMemo(() => watchedRows ?? [], [watchedRows])
  const rowsControl = section.control("rows")

  // Kept in step while rendering: the countries read and the expanded rows follow the edit mode; the first chevron is the header Edit's focus.
  if (wantCountries !== isEditing) setWantCountries(isEditing)
  if (!isEditing && expanded.size > 0) setExpanded(EMPTY_KEYS)
  const firstToggle = formRows.findIndex(isExpandable)
  const nextOrder = firstToggle < 0 ? [] : [togglePath(firstToggle)]
  if (nextOrder.join() !== toggleOrder.join()) setToggleOrder(nextOrder)

  useLayoutEffect(() => {
    formRef.current = form
    rebaseRef.current = rebase
    editState.current = { editing: isEditing, saving: isSaving }
    latestCountries.current = countries.data ?? []
    latestRows.current = formRows
    latestSaved.current = baseline.rows
    latestShown.current = rows
  })

  // Back in read view (saved or cancelled): the baseline is the server's again (no stale saved-values override).
  const wasEditing = useRef(false)
  useEffect(() => {
    const leftEdit = wasEditing.current && !isEditing
    wasEditing.current = isEditing
    if (!leftEdit) return
    setRecovery(null)
    rebase(baseline)
    lookups.clear()
  }, [isEditing, baseline, rebase, lookups])

  /** A chevron: the row swaps between its cells and its expanded body (a new chevron), and focus follows it. */
  function toggleRow(key: string): void {
    flushSync(() =>
      setExpanded((previous) => {
        const next = new Set(previous)
        if (!next.delete(key)) next.add(key)
        return next
      }),
    )
    document.getElementById(toggleId(key))?.focus()
  }

  /**
   * "Add address" (header, empty row, footer): one new row, expanded, focus
   * on its Address Type. The first address (the only row left) is the
   * Primary (Story 4.4).
   */
  function addAddress(): void {
    // Never while a Make primary is in flight (its success would toast and focus the h2 over the edit view).
    if (isSaving || sendingPrimary.current) return
    const current = isEditing ? form.getValues("rows") : latestSaved.current
    const key = nextNewKey(current, newKeys)
    setExpanded((previous) => new Set([...(isEditing ? previous : []), key]))
    section.startEdit({ focus: fieldPath(current.length, "type") })
    rowsControl.onChange(withAutoPrimary([...current, newAddressEditRow(key)]))
  }

  /** "Set as primary" checked on a row: every other row's box is unchecked (Story 4.4). */
  function uncheckOtherPrimaries(index: number): void {
    form.getValues("rows").forEach((row, at) => {
      if (at !== index && row.primary) setRowField(form, at, "primary", false)
    })
  }

  /**
   * Remove / Restore in edit view (Story 4.4): a saved row is struck through
   * (collapsed, "Removed on save") until Save, Restore undoes it; a new row
   * is deleted outright. No confirm, toast or undo. The one row left is the
   * Primary. Focus lands on the row's Restore (its Remove may have been in
   * the expanded row, which collapses).
   */
  function setRemoved(key: string, removed: boolean): void {
    if (isSaving) return
    const current = form.getValues("rows")
    const index = current.findIndex((row) => row.key === key)
    if (index < 0) return
    const target = current[index]
    if (target.isNew) {
      // A new row goes outright; errors are re-read from the schema, never left on a shifted index.
      form.clearErrors("rows")
      rowsControl.onChange(withAutoPrimary(current.filter((row) => row.key !== key)))
      // Its Remove is gone: focus the Section h2 (never <body>) once the row has unmounted, so none of its fields blurs
      // (and validates) after it left the form.
      focusHeadingAfterRender.current = true
      setFocusTick((tick) => tick + 1)
      return
    }
    if (removed) {
      setExpanded((previous) => {
        if (!previous.has(key)) return previous
        const next = new Set(previous)
        next.delete(key)
        return next
      })
      form.clearErrors(`rows.${index}` as Path<AddressValues>)
    }
    rowsControl.onChange(withAutoPrimary(current.map((row) => (row.key === key ? withAddressRemoved(row, removed) : row))))
    if (removed) section.startEdit({ focus: removalPath(index) })
  }

  /** The read-view kebab's Remove (Story 4.4): edit view with that row struck through, focus on its Restore (never while a Make primary is in flight). */
  function removeRow(key: string): void {
    const saved = latestSaved.current
    const index = saved.findIndex((row) => row.key === key)
    // A revalidation between the kebab press and the item run may have dropped the row; the reasons are re-checked.
    if (sendingPrimary.current || index < 0 || saved[index].id === null || saved.filter(isRemovable).length <= 1 || saved[index].primary) return
    setExpanded(EMPTY_KEYS)
    section.startEdit({ focus: removalPath(index) })
    rowsControl.onChange(withAutoPrimary(saved.map((row) => (row.key === key ? withAddressRemoved(row, true) : row))))
  }

  /** The Make primary error toast's text: its catalog message for a mapped field rule, else the Section's save failure. */
  function makePrimaryFailureText(mapped: MappedError): string {
    if (mapped.kind === "field") return messageFor(mapped.messageKey)
    const sectionName = SHELL_MESSAGES.sectionAddresses.toLowerCase()
    return formatMessage(mapped.kind === "network" ? SECTION_MESSAGES.networkFailure : SECTION_MESSAGES.saveFailed, { section: sectionName })
  }

  /** Revalidates the list; when the refetch fails, it revalidates through SWR instead. */
  async function refreshAddresses(): Promise<void> {
    try {
      await refetchAddresses()
    } catch {
      void addresses.mutate()
    }
  }

  /**
   * Sends the Make primary on the row keyed `key` against the latest rows:
   * `true` once it is the Primary (nothing is sent when it already is).
   * Read view only, one at a time. One PUT of the row with `primary: true`
   * (decision 1B: the backend demotes the old Primary), then the list is
   * refetched whatever the outcome. A failure toasts with Retry (this again,
   * `reread`: the list is re-read first, so only what is still needed is
   * sent); an address removed elsewhere (or gone from the list) toasts its own
   * text, whose Retry only reloads the list; a session end shows nothing.
   */
  async function sendMakePrimary(key: string, reread: boolean): Promise<boolean> {
    if (sendingPrimary.current || editState.current.editing) return false
    sendingPrimary.current = true
    try {
      let shown = latestShown.current
      if (reread) {
        try {
          shown = addressRowsOf(await refetchAddresses())
        } catch {
          void addresses.mutate()
        }
      }
      const target = shown?.find((row) => row.key === key)
      if (!target || target.address.id === null || target.repeat) {
        toastError(ADDRESS_MESSAGES.removedElsewhere, { onRetry: () => void refreshAddresses() })
        return false
      }
      if (target.primary) return true
      const res = await saveAddressUpdate(target.address.id, addressPrimaryBody(true, target.address.validated))
      await refreshAddresses()
      if (res.success) return true
      const mapped = mapApiError("addresses", res)
      if (mapped.kind === "session") return false
      if (isRemovedElsewhere(mapped)) toastError(ADDRESS_MESSAGES.removedElsewhere, { onRetry: () => void refreshAddresses() })
      else toastError(makePrimaryFailureText(mapped), { onRetry: () => void makePrimary(key, true) })
      return false
    } finally {
      sendingPrimary.current = false
    }
  }

  /** The read-view kebab's Make primary (Story 4.4): no confirm; once saved, "Addresses saved." and focus on the `h2`. */
  async function makePrimary(key: string, reread = false): Promise<void> {
    if (!(await sendMakePrimary(key, reread))) return
    toastSuccess(formatMessage(SECTION_MESSAGES.saved, { section: SHELL_MESSAGES.sectionAddresses }))
    document.getElementById(sectionHeadingId("addresses"))?.focus()
  }

  /** The header Edit: every row collapsed, focus on the first chevron. */
  function editAll(): void {
    if (sendingPrimary.current) return
    setExpanded(EMPTY_KEYS)
    section.startEdit()
  }

  /** A read-view kebab's Edit: that row expanded (the others collapsed), focus on its Address Type. */
  function editRow(key: string): void {
    if (sendingPrimary.current) return
    const saved = latestSaved.current
    const index = saved.findIndex((row) => row.key === key)
    // A revalidation between the kebab press and the item run may have dropped the row.
    if (index < 0) return
    setExpanded(new Set([key]))
    section.startEdit({ focus: fieldPath(index, "type") })
  }

  const countriesState: CountriesState = {
    names: countries.data ?? [],
    loading: wantCountries && countries.data === undefined && countries.error === undefined,
    failed: countriesFailed,
    retry: () => void countries.mutate(),
  }
  const placesState: PlacesState = {
    status: placesStatus,
    markOn: () => setPlacesStatus((previous) => (previous === "off" ? previous : "on")),
    markOff: () => setPlacesStatus("off"),
    lookups,
    onPick: (rowKey, suggestion, before) => void pickSuggestion(rowKey, suggestion, before),
  }
  const shownByKey = new Map((rows ?? []).map((row) => [row.key, row]))
  /** A row's name: its saved one-line address, "New address" for a new row. */
  const nameOf = (row: AddressEditRow): string =>
    row.isNew ? ADDRESS_MESSAGES.newAddress : shownByKey.get(row.key)?.oneLine || addressRowOneLine(row) || COMMON_MESSAGES.notProvided
  const emptyAction = { label: ADDRESS_MESSAGES.addAddress, onClick: addAddress }
  /** The shown addresses that can be sent or removed: with an id, not a repeat (the read view's "last address" count). */
  const sendableShown = (rows ?? []).filter((row) => row.address.id !== null && !row.repeat).length
  // Remove's reasons (Story 4.4), against the draft while editing: only rows that aren't struck through count.
  // Only rows that can be sent count: new rows and saved rows with an id (a repeat's edit row has none), not struck through.
  const remaining = formRows.filter((row) => isRemovable(row) && !isAddressRowRemoved(row)).length
  const hadSaved = baseline.rows.some((row) => row.id !== null)

  /** A row's Remove / Restore in edit view (a saved row without an id has nothing to send: none). */
  function removalOf({ row, index }: EditItem): ReactNode {
    if (!isRemovable(row)) return null
    const { ref: removalRef } = section.control(removalPath(index))
    return (
      <RowRemoval
        ref={removalRef}
        state={rowStateOf(row)}
        statusId={statusIdOf(row.key)}
        disabledReason={isAddressRowRemoved(row) ? undefined : removeReasonOf(row.primary, remaining, hadSaved)}
        onRemove={() => setRemoved(row.key, true)}
        onRestore={() => setRemoved(row.key, false)}
      />
    )
  }

  const headerActions =
    rows && !isEditing ? (
      <>
        <Button type="button" variant="outline" size="touch" {...section.editButtonProps} onClick={rows.length === 0 ? addAddress : editAll}>
          {SECTION_MESSAGES.edit}
        </Button>
        <Button type="button" variant="outline" size="touch" onClick={addAddress}>
          <Plus aria-hidden="true" />
          {ADDRESS_MESSAGES.addAddress}
        </Button>
      </>
    ) : null

  const headingId = sectionHeadingId("addresses")
  return (
    <section id="addresses" aria-labelledby={headingId} className="min-w-0">
      <LiveStatus message={placesMessage} />
      <SectionHeader id="addresses" title={SHELL_MESSAGES.sectionAddresses} count={rows?.length} editing={isEditing} actions={headerActions} className="mb-2" />
      <StateFrame
        state={state}
        skeleton="table"
        columns={SECTION_COLUMNS.addresses}
        loadError={{ kind: "section", sectionId: "addresses" }}
        level="section"
        onRetry={() => void addresses.mutate()}
        attempt={attempt}
        onReady={onReady}
        // Once ready the Section container is the card (it carries the editing halo and the draft notice).
        className={rows ? "overflow-visible rounded-none border-0 bg-transparent" : undefined}
      >
        {rows && (
          <SectionContainer editing={isEditing} sectionId="addresses">
            {isEditing ? (
              <>
                <SectionTable<EditItem>
                  rows={formRows.map((row, index) => ({ row, index }))}
                  columns={addressEditColumns({ section, expanded, onToggle: toggleRow, nameOf })}
                  getRowKey={({ row }) => row.key}
                  labelledBy={headingId}
                  editing
                  rowState={({ row }) => rowStateOf(row)}
                  renderExpanded={(item) =>
                    isExpandable(item.row) && expanded.has(item.row.key) ? (
                      <AddressExpandedRow
                        section={section}
                        item={item}
                        name={nameOf(item.row)}
                        onToggle={toggleRow}
                        countries={countriesState}
                        places={placesState}
                        removal={removalOf(item)}
                        onPrimaryChecked={uncheckOtherPrimaries}
                        onlyRow={remaining === 1}
                      />
                    ) : null
                  }
                  // An expanded row holds its Remove in its own header line.
                  actions={(item) => (isExpandable(item.row) && expanded.has(item.row.key) ? null : removalOf(item))}
                  empty={{ message: ADDRESS_MESSAGES.addressesEmpty, action: emptyAction }}
                />
                <SectionFooter {...section.footerProps} addRow={{ label: ADDRESS_MESSAGES.addAddress, onClick: addAddress }} />
              </>
            ) : (
              <SectionTable
                rows={rows}
                columns={ADDRESS_READ_COLUMNS}
                getRowKey={(row) => row.key}
                labelledBy={headingId}
                empty={{ message: ADDRESS_MESSAGES.addressesEmpty, action: emptyAction }}
                actionsWidth="w-14"
                actions={(row) => (
                  <RowActions
                    name={row.oneLine || COMMON_MESSAGES.notProvided}
                    showInline={false}
                    // Only a saved row with an id (not a repeat) can change: Make primary (not on the Primary), Edit, Remove (Story 4.4).
                    actions={
                      row.address.id === null || row.repeat
                        ? []
                        : [
                            ...(row.primary ? [] : [{ id: "make-primary", label: COMMON_MESSAGES.makePrimary, onSelect: () => void makePrimary(row.key) }]),
                            { id: "edit", label: SECTION_MESSAGES.edit, onSelect: () => editRow(row.key) },
                            {
                              id: "remove",
                              label: COMMON_MESSAGES.remove,
                              destructive: true,
                              disabledReason: removeReasonOf(row.primary, sendableShown, true),
                              onSelect: () => removeRow(row.key),
                            },
                          ]
                    }
                  />
                )}
              />
            )}
          </SectionContainer>
        )}
      </StateFrame>
    </section>
  )
}
