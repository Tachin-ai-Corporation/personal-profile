"use client"

import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { useWatch, type Path, type PathValue, type UseFormReturn } from "react-hook-form"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Chip } from "@/components/ui/chip"
import { FieldError, FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  RowActions,
  RowEditStatus,
  runSaveSteps,
  SECTION_COLUMNS,
  SectionContainer,
  SectionFooter,
  SectionHeader,
  SectionTable,
  StateFrame,
  sectionHeadingId,
  useReportSectionCount,
  useSectionForm,
  useSectionFrame,
  type FrameState,
  type SaveResult,
  type SectionDataStatus,
  type SectionForm,
  type SectionTableColumn,
} from "@/features/shell"
import {
  ADDRESS_TYPES,
  addressCreateBody,
  addressUpdateBody,
  fetchAddresses,
  isAddressPartChanged,
  keys,
  mapFetchError,
  saveAddressCreate,
  saveAddressUpdate,
  type Address,
  type ApiResponseError,
  type ErrorField,
  type MappedError,
} from "@/lib/api"
import { ADDRESS_MESSAGES, COMMON_MESSAGES, formatMessage, SECTION_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { formatAddressOneLine } from "./format"
import { addressRowsToSend, mergeAddressRows } from "./save"
import {
  addressDraftDiff,
  addressEditRowOf,
  addressesSchemaWith,
  addressRowOneLine,
  newAddressEditRow,
  type AddressEditRow,
  type AddressValues,
} from "./schema"

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

/** The DOM id of a row's chevron. */
const toggleId = (key: string) => `addresses-toggle-${key}`

/** A row that can be expanded and edited: a new row, or a saved row with an id (an id-less row has nothing to send). */
const isExpandable = (row: AddressEditRow): boolean => row.isNew || row.id !== null

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
  readonly field: "line1" | "line2" | "city" | "county" | "state" | "zip"
  readonly label: string
  readonly optional?: boolean
  readonly autoComplete: string
}

/** A text field (44 px, 16 px text), labelled, validated on blur; optional ones end in "(optional)". */
function AddressTextField({ section, index, field, label, optional = false, autoComplete, className }: TextFieldProps) {
  const path = fieldPath(index, field)
  return (
    <FormField label={label} optional={optional} required={!optional} error={section.errorFor(path)} className={cn("min-w-0", className)}>
      {(control) => <Input {...control} {...section.field(path)} autoComplete={autoComplete} />}
    </FormField>
  )
}

interface SelectFieldProps extends FieldProps {
  readonly field: "type" | "country"
  readonly label: string
  readonly options: readonly SelectOption[]
  readonly placeholder: string
  readonly loading?: boolean
  readonly helper?: ReactNode
}

/**
 * A required Select (Address Type, Country). A saved value the list doesn't
 * offer still shows on the trigger (`unlistedValue`) until changed.
 * Read-only while saving: it doesn't open and ignores changes.
 */
function AddressSelectField({ section, index, field, label, options, placeholder, loading = false, helper, className }: SelectFieldProps) {
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
            if (!binding.readOnly) binding.onChange(next as PathValue<AddressValues, Path<AddressValues>>)
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

/** "Set as primary": a 44 px checkbox with its label after it (sent as `primary`; Story 4.4 adds exclusivity). Read-only while saving. */
function PrimaryField({ section, index, className }: FieldProps) {
  const path = fieldPath(index, "primary")
  const { ref, ...binding } = section.control(path)
  const id = useId()
  const errorId = `${id}-error`
  const error = section.errorFor(path)
  return (
    <div data-slot="address-primary" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center">
        <Checkbox
          ref={ref}
          id={id}
          checked={binding.value === true}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-readonly={binding.readOnly || undefined}
          onCheckedChange={(next) => {
            if (!binding.readOnly) binding.onChange((next === true) as PathValue<AddressValues, Path<AddressValues>>)
          }}
          onBlur={binding.onBlur}
          className="-ml-3"
        />
        <label htmlFor={id} className="text-body-sm text-foreground font-medium">
          {ADDRESS_MESSAGES.setAsPrimary}
        </label>
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
}

/**
 * An expanded row (EXPERIENCE.md Address edit row): the chevron and "New
 * address · New · not saved" (or the saved one-line address), then the
 * 4-column grid [Address Type][Country][Set as primary ×2] / [Address line 1
 * ×2][Address line 2 ×2] / [City][County][State/Province][Zip] with 16 px
 * gaps; below 768 px every field is full width.
 */
function AddressExpandedRow({ section, item, name, onToggle, countries }: ExpandedRowProps) {
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
        />
        <PrimaryField section={section} index={index} className="md:col-span-2 md:pt-7" />
        <AddressTextField section={section} index={index} field="line1" label={ADDRESS_MESSAGES.line1Label} autoComplete="address-line1" className="md:col-span-2" />
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
  /** The saved rows, by key (Verified holds only while no address part changed). */
  readonly savedByKey: ReadonlyMap<string, AddressEditRow>
}

/** A collapsed row in edit view: the chevron, then the read columns with the form's current values. */
function addressEditColumns({ section, expanded, onToggle, nameOf, savedByKey }: EditColumnsInput): SectionTableColumn<EditItem>[] {
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
      cell: ({ row }) => {
        if (row.isNew) return <RowEditStatus state="new" />
        const saved = savedByKey.get(row.key)
        return saved?.validated && !isAddressPartChanged(row, saved) ? <StatusBadge status="verified">{COMMON_MESSAGES.verified}</StatusBadge> : null
      },
    },
  ]
}

/**
 * Addresses (Stories 4.1–4.2, FR25–FR26, NG-9026): the user's addresses from
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
 * Section level, so Retry sends only what is left. Make primary and Remove
 * arrive with Story 4.4.
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

  // Countries load only in edit view (`wantCountries` follows the edit mode, adjusted while rendering below).
  const [wantCountries, setWantCountries] = useState(false)
  const countries = useSWR<string[] | undefined, ApiResponseError>(wantCountries ? keys.countries() : null)
  const countriesFailed = wantCountries && countries.data === undefined && countries.error !== undefined
  const schema = useMemo(() => addressesSchemaWith({ saved: baseline.rows, countriesFailed }), [baseline.rows, countriesFailed])

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(EMPTY_KEYS)
  const newKeys = useRef(0)
  const [failedRow] = useState(createFailedRowTarget)
  // The latest render's form, rebase, countries and rows: the save, `revealField` and kebab items run later.
  const formRef = useRef<UseFormReturn<AddressValues, unknown, AddressValues> | null>(null)
  const rebaseRef = useRef<(next: AddressValues) => void>(() => undefined)
  const latestCountries = useRef<readonly string[]>([])
  const latestRows = useRef<readonly AddressEditRow[]>(baseline.rows)
  const latestSaved = useRef<readonly AddressEditRow[]>(baseline.rows)

  /** Refetches the list into the cache; throws when it fails (the save's baseline then stays). */
  async function refetchAddresses(): Promise<Address[]> {
    const res = await fetchAddresses()
    if (!res.success || !res.data) throw new Error("addresses refetch failed")
    await addresses.mutate(res.data, { revalidate: false })
    return res.data
  }

  async function save(values: AddressValues, before: AddressValues): Promise<SaveResult> {
    failedRow.setRow(null)
    const savedByKey = new Map(before.rows.map((row) => [row.key, row]))
    const queue = addressRowsToSend(values.rows, before.rows)
    if (queue.length === 0) return { ok: true }
    const listedCountries = new Set(latestCountries.current)
    const succeeded = new Set<string>()
    const created = new Map<string, number | null>()
    let current = values.rows
    /** The refetch after a failure ran and rebuilt the rows (`mergeAddressRows`). */
    let rebased = false
    const result = await runSaveSteps<string, Address[]>(
      queue.map((row) => ({
        part: row.key,
        run: async () => {
          if (row.isNew) {
            // A manual new address is never validated (Story 4.3 adds suggestions).
            const res = await saveAddressCreate(addressCreateBody({ ...row, validated: false }))
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
      {
        scope: "addresses",
        mode: "stop",
        refetch: refetchAddresses,
        rebase: (fresh) => {
          const freshRows = editRowsOf(addressRowsOf(fresh))
          current = mergeAddressRows({ rows: values.rows, before: before.rows, fresh: freshRows, succeeded, created })
          formRef.current?.setValue("rows", current)
          rebaseRef.current({ rows: freshRows })
          rebased = true
        },
      },
    )
    // No rebuild (a session end, or the refetch failed): the created rows are saved all the same, so Retry must never
    // POST them again. Each becomes a saved row with its new id; one whose id is unknown leaves the form.
    if (!rebased && created.size > 0) {
      current = values.rows.flatMap((row) => {
        if (!row.isNew || !created.has(row.key)) return [row]
        const id = created.get(row.key) ?? null
        return id === null ? [] : [{ ...row, key: `id-${id}`, id, isNew: false }]
      })
      formRef.current?.setValue("rows", current)
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
    // `stop`: the steps before the failed one all succeeded.
    const failedKey = queue[succeeded.size]?.key
    const index = current.findIndex((row) => row.key === failedKey)
    failedRow.setRow(index < 0 ? null : index)
    return { ok: false, error: { code: result.error.code, mapped: result.error.mapped } }
  }

  const [toggleOrder, setToggleOrder] = useState<readonly Path<AddressValues>[]>([])

  const section = useSectionForm<AddressValues>({
    id: "addresses",
    label: SHELL_MESSAGES.sectionAddresses,
    displayOrder: 5,
    schema,
    baseline,
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
    latestCountries.current = countries.data ?? []
    latestRows.current = formRows
    latestSaved.current = baseline.rows
  })

  // Back in read view (saved or cancelled): the baseline is the server's again (no stale saved-values override).
  const wasEditing = useRef(false)
  useEffect(() => {
    const leftEdit = wasEditing.current && !isEditing
    wasEditing.current = isEditing
    if (leftEdit) rebase(baseline)
  }, [isEditing, baseline, rebase])

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

  /** "Add address" (header, empty row, footer): one new row, expanded, focus on its Address Type. */
  function addAddress(): void {
    if (isSaving) return
    const current = isEditing ? form.getValues("rows") : latestSaved.current
    const key = nextNewKey(current, newKeys)
    setExpanded((previous) => new Set([...(isEditing ? previous : []), key]))
    section.startEdit({ focus: fieldPath(current.length, "type") })
    rowsControl.onChange([...current, newAddressEditRow(key)])
  }

  /** The header Edit: every row collapsed, focus on the first chevron. */
  function editAll(): void {
    setExpanded(EMPTY_KEYS)
    section.startEdit()
  }

  /** A read-view kebab's Edit: that row expanded (the others collapsed), focus on its Address Type. */
  function editRow(key: string): void {
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
  const shownByKey = new Map((rows ?? []).map((row) => [row.key, row]))
  const savedByKey = new Map(baseline.rows.map((row) => [row.key, row]))
  /** A row's name: its saved one-line address, "New address" for a new row. */
  const nameOf = (row: AddressEditRow): string =>
    row.isNew ? ADDRESS_MESSAGES.newAddress : shownByKey.get(row.key)?.oneLine || addressRowOneLine(row) || COMMON_MESSAGES.notProvided
  const emptyAction = { label: ADDRESS_MESSAGES.addAddress, onClick: addAddress }

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
                  columns={addressEditColumns({ section, expanded, onToggle: toggleRow, nameOf, savedByKey })}
                  getRowKey={({ row }) => row.key}
                  labelledBy={headingId}
                  editing
                  rowState={({ row }) => (row.isNew ? "new" : "saved")}
                  renderExpanded={(item) =>
                    isExpandable(item.row) && expanded.has(item.row.key) ? (
                      <AddressExpandedRow section={section} item={item} name={nameOf(item.row)} onToggle={toggleRow} countries={countriesState} />
                    ) : null
                  }
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
                    // Only a saved row with an id (not a repeat) can change; Make primary and Remove arrive with Story 4.4.
                    actions={row.address.id === null || row.repeat ? [] : [{ id: "edit", label: SECTION_MESSAGES.edit, onSelect: () => editRow(row.key) }]}
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
