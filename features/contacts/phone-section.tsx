"use client"

import { Plus } from "lucide-react"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useWatch, type Path } from "react-hook-form"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { DisabledAction } from "@/components/ui/disabled-action"
import { FieldError } from "@/components/ui/form-field"
import { InputLocked } from "@/components/ui/input-locked"
import { PhoneInput } from "@/components/ui/phone-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  RowActions,
  RowEditStatus,
  RowRemoval,
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
  type RowEditState,
  type SaveResult,
  type SectionDataStatus,
  type SectionForm,
  type SectionTableColumn,
} from "@/features/shell"
import {
  contactPointsDiffToManageDTO,
  findPrimary,
  keys,
  mapFetchError,
  mutateContactPoints,
  mutateMyself,
  PRIMARY_LABEL,
  saveContactPoints,
  valueListOptions,
  type ApiResponseError,
  type ContactPoint,
  type ContactPointEditRow,
  type ErrorField,
  type MappedError,
  type TypeInfo,
} from "@/lib/api"
import { CONTACT_LABEL_HOME, CONTACT_PHONE_TYPES, contactLabelsFrom, type ContactPhoneType } from "@/lib/shared/contact-labels"
import { COMMON_MESSAGES, CONTACT_MESSAGES, SECTION_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { formatPhoneDisplay, isPhoneRegion, normalizeRegion, regionFlag, toE164, type PhoneInputValue } from "@/lib/shared/phone"
import {
  arePhoneTypesFull,
  isPhoneTypeFull,
  newPhoneEditRow,
  phoneDraftDiff,
  phoneEditRowOf,
  phoneSchema,
  phoneTypeLabel,
  type PhoneEditRow,
  type PhoneValues,
} from "./phone-schema"

/** One shown phone: the row as read, and the list (key) it came from. */
interface PhoneRow {
  /** Stable across revalidations: the id (a repeated id gets its occurrence), else the list and position. */
  readonly key: string
  readonly type: ContactPhoneType
  readonly point: ContactPoint
  /** Its `value` (rows without one are never shown). */
  readonly value: string
  /** The one Primary phone (`findPrimary`): a legacy second Primary-labelled row is shown as a plain label. */
  readonly primary: boolean
}

function toPhoneRows(type: ContactPhoneType, points: readonly ContactPoint[]): PhoneRow[] {
  // Keyed by position only when there is no id; the keys are made unique across both lists in `phoneRowsOf`.
  return points.flatMap((point, index) =>
    point.value ? [{ key: point.id === null ? `${type}-none-${index}` : `id-${point.id}`, type, point, value: point.value, primary: false }] : [],
  )
}

/** A repeated id's later occurrence (`id-<id>~<n>`): locked like a row without an id, so only the first one can change. */
const isRepeat = (row: PhoneRow): boolean => row.key.includes("~")

/** Unique keys: a repeated id (in one list or across both) gets its occurrence, so the first one keeps `id-<id>`. */
function uniqueKeys(rows: readonly PhoneRow[]): PhoneRow[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const count = seen.get(row.key) ?? 0
    seen.set(row.key, count + 1)
    return count === 0 ? row : { ...row, key: `${row.key}~${count}` }
  })
}

/**
 * The shown phones: the Mobile rows, then the Landline rows, each in API
 * order, without the rows that have no value; the Primary phone
 * (`findPrimary`, a Mobile one first) moves to the top and is the only row
 * shown as Primary.
 */
function phoneRowsOf(mobile: readonly ContactPoint[], landline: readonly ContactPoint[]): PhoneRow[] {
  const rows = uniqueKeys([...toPhoneRows("Mobile", mobile), ...toPhoneRows("Landline", landline)])
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

/** The "—" of a row that has no notifications setting, with its meaning for screen readers. */
function NotApplicable() {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">{CONTACT_MESSAGES.notificationsNotApplicable}</span>
      <span className="sr-only">{CONTACT_MESSAGES.notificationsNotApplicableLabel}</span>
    </span>
  )
}

function notificationsOf(row: PhoneRow): ReactNode {
  if (!row.primary) return <NotApplicable />
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
  { key: "type", header: TYPE, cell: (row) => phoneTypeLabel(row.type) },
  { key: "status", header: STATUS, mobileLine: 1, cell: statusOf },
  { key: "notifications", header: NOTIFICATIONS, cell: notificationsOf },
]

/** A read failure without cached data (the session end first, then a 403, then any other). */
function phoneLoadError(failures: readonly unknown[]): MappedError | undefined {
  const mapped = failures.filter((failure) => failure !== undefined).map((failure) => mapFetchError("phone", failure))
  return mapped.find((error) => error.kind === "session") ?? mapped.find((error) => error.kind === "forbidden") ?? mapped[0]
}

// --- Edit view (Story 3.2) --------------------------------------------------------------------

type PhoneSectionForm = SectionForm<PhoneValues>

/** A row of the edit table with its index in the form's `rows` (its field paths). */
interface EditItem {
  readonly row: PhoneEditRow
  readonly index: number
}

/** The form paths of a row's controls. */
const numberPath = (index: number) => `rows.${index}.phone` as const
const labelPath = (index: number) => `rows.${index}.label` as const
const typePath = (index: number) => `rows.${index}.type` as const
/** The locked number of a saved row (focus only: a kebab Edit on a row with nothing editable). */
const lockedPath = (index: number) => `rows.${index}.value` as const
/** The row's Remove / Restore action (focus only: Restore after a read-view Remove). */
const removalPath = (index: number) => `rows.${index}.removed` as const

/** A saved row whose label can be changed here: it has an id (to update) and isn't the Primary (Story 3.4 changes it). */
const isLabelEditable = (row: PhoneEditRow): boolean => row.isNew || (row.id !== null && row.label !== PRIMARY_LABEL)

/**
 * The shape of the form's rows, one letter per row: `n` new, `s` saved with
 * an editable label, `l` saved and locked. The field order and the server
 * error mapping depend only on it.
 */
function rowsShape(rows: readonly PhoneEditRow[]): string {
  return rows.map((row) => (row.isNew ? "n" : isLabelEditable(row) ? "s" : "l")).join("")
}

/** The fields in reading order (the first one takes focus on Edit), or the first locked number when nothing is editable. */
function phoneFieldOrder(shape: string): Path<PhoneValues>[] {
  const order = [...shape].flatMap((kind, index): Path<PhoneValues>[] => {
    if (kind === "n") return [numberPath(index), labelPath(index), typePath(index)]
    return kind === "s" ? [labelPath(index)] : []
  })
  return order.length === 0 && shape.length > 0 ? [lockedPath(0)] : order
}

/** The server field errors of the one new row, when there is exactly one (else they show at Section level). */
function phoneErrorFields(shape: string): Partial<Record<ErrorField, Path<PhoneValues>>> | undefined {
  const indexes = [...shape].flatMap((kind, index) => (kind === "n" ? [index] : []))
  if (indexes.length !== 1) return undefined
  const [index] = indexes
  return { value: numberPath(index), type: typePath(index), label: labelPath(index) }
}

/** Where a row's kebab Edit puts focus: its Label, else its locked number. */
const editFocusOf = (row: PhoneEditRow, index: number) => (isLabelEditable(row) ? labelPath(index) : lockedPath(index))

/** A new row key no row holds yet. */
function nextNewKey(rows: readonly PhoneEditRow[], counter: { current: number }): string {
  let key: string
  do {
    counter.current += 1
    key = `new-${counter.current}`
  } while (rows.some((row) => row.key === key))
  return key
}

/**
 * Why a row's Remove is unavailable, if it is: the last phone left ("You
 * need at least one phone"; only when the person had saved phones), else a
 * Primary-labelled saved row ("Make another phone primary first": Story
 * 3.4's Make primary moves it first; the backend rejects removing a Primary
 * without a replacement).
 */
function removeReason(row: { readonly isNew: boolean; readonly label: string }, remaining: number, hadSaved: boolean): string | undefined {
  if (remaining === 1 && hadSaved) return CONTACT_MESSAGES.phoneMinimum
  if (!row.isNew && row.label === PRIMARY_LABEL) return CONTACT_MESSAGES.phonePrimaryFirst
  return undefined
}

/** A control's help and error lines, wired to it (`aria-describedby`, `aria-invalid`) with the error in a polite live region. */
function CellField({
  help,
  error,
  children,
}: {
  readonly help?: ReactNode
  readonly error?: string
  readonly children: (wiring: { readonly id: string; readonly "aria-describedby": string | undefined; readonly "aria-invalid": true | undefined }) => ReactNode
}) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {help ? (
        <p id={helpId} className="text-muted-foreground text-body-sm">
          {help}
        </p>
      ) : null}
      <div aria-live="polite">{error ? <FieldError id={errorId}>{error}</FieldError> : null}</div>
    </div>
  )
}

interface CellProps {
  readonly section: PhoneSectionForm
  readonly item: EditItem
  /** The id of the visible header naming the cell (desktop `th`, card label). */
  readonly headerId: string
}

/** A new row's number: the phone input (default US) with its help, validated on blur. */
function NewNumberCell({ section, item }: Omit<CellProps, "headerId">) {
  const path = numberPath(item.index)
  const { ref, ...binding } = section.control(path)
  const error = section.errorFor(path)
  return (
    <CellField help={CONTACT_MESSAGES.phoneNewHelp} error={error}>
      {(wiring) => (
        <>
          <label htmlFor={wiring.id} className="sr-only">
            {NUMBER}
          </label>
          <PhoneInput
            {...wiring}
            name={path}
            value={binding.value as PhoneInputValue}
            onChange={(next) => {
              if (!binding.readOnly) binding.onChange(next)
            }}
            onBlur={binding.onBlur}
            inputRef={ref}
            readOnly={binding.readOnly}
            required
            aria-required
          />
        </>
      )}
    </CellField>
  )
}

interface ChoiceCellProps extends CellProps {
  readonly path: `rows.${number}.label` | `rows.${number}.type`
  readonly options: readonly { readonly value: string; readonly label: string; readonly disabled?: boolean }[]
  readonly placeholder: string
}

/** A Label or Type Select (read-only while saving: it doesn't open and ignores changes). */
function ChoiceCell({ section, path, headerId, options, placeholder }: ChoiceCellProps) {
  const { ref, ...binding } = section.control(path)
  const error = section.errorFor(path)
  const value = String(binding.value ?? "")
  // A saved label the list doesn't offer still shows on the trigger until changed.
  const unlisted = value !== "" && !options.some((option) => option.value === value) ? { value } : undefined
  return (
    <CellField error={error}>
      {(wiring) => (
        <Select
          value={value}
          open={binding.readOnly ? false : undefined}
          onValueChange={(next) => {
            if (!binding.readOnly) binding.onChange(next)
          }}
          placeholder={placeholder}
          unlistedValue={unlisted}
        >
          <SelectTrigger
            {...wiring}
            ref={ref}
            aria-labelledby={headerId}
            aria-required
            onBlur={binding.onBlur}
            aria-readonly={binding.readOnly || undefined}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </CellField>
  )
}

/** A saved row's locked Number or Type, focusable and read-only, with the locked help. */
/** A saved row's locked Number (focusable target, with the locked help) or Type (no repeated help). */
function LockedCell({ section, item, headerId, value, number }: CellProps & { readonly value: string; readonly number?: boolean }) {
  const { ref } = section.control(lockedPath(item.index))
  return <InputLocked ref={number ? ref : undefined} value={value} help={number ? CONTACT_MESSAGES.phoneLocked : null} aria-labelledby={headerId} />
}

interface EditColumnsInput {
  readonly section: PhoneSectionForm
  readonly rows: readonly PhoneEditRow[]
  readonly labelOptions: readonly string[]
  /** The saved phones as read, by key (status and notifications). */
  readonly saved: ReadonlyMap<string, PhoneRow>
  readonly primaryKey: string | undefined
}

const rowStateOf = (row: PhoneEditRow): RowEditState => (row.isNew ? "new" : row.removed ? "removed" : "saved")

/** The id of a row's edit status ("New · not saved", "Removed on save"): its Restore is described by it. */
const statusIdOf = (key: string) => `phone-row-${key}-status`

/** The edit table: Number, Label and Type as controls (locked on a saved row), Status and Notifications as read. */
function phoneEditColumns({ section, rows, labelOptions, saved, primaryKey }: EditColumnsInput): SectionTableColumn<EditItem>[] {
  const labelChoices = labelOptions.map((label) => ({ value: label, label }))
  return [
    {
      key: "number",
      header: NUMBER,
      width: "w-[34%]",
      cell: ({ row, index }, { headerId }) =>
        row.isNew ? (
          <NewNumberCell section={section} item={{ row, index }} />
        ) : (
          <LockedCell section={section} item={{ row, index }} headerId={headerId} value={formatPhoneDisplay(row.value, row.region)} number />
        ),
    },
    {
      key: "label",
      header: LABEL,
      cell: ({ row, index }, { headerId }) => {
        if (isLabelEditable(row)) {
          return <ChoiceCell section={section} item={{ row, index }} headerId={headerId} path={labelPath(index)} options={labelChoices} placeholder={CONTACT_MESSAGES.chooseLabel} />
        }
        // The Primary (and a row without an id) keeps its label: shown as the locked chip.
        return row.label ? <Chip variant={row.key === primaryKey ? "primary" : "label"}>{row.label}</Chip> : null
      },
    },
    {
      key: "type",
      header: TYPE,
      cell: ({ row, index }, { headerId }) => {
        if (!row.isNew) return <LockedCell section={section} item={{ row, index }} headerId={headerId} value={phoneTypeLabel(row.type)} />
        const options = CONTACT_PHONE_TYPES.map((type) => ({ value: type, label: phoneTypeLabel(type), disabled: isPhoneTypeFull(rows, type, row.key) }))
        return <ChoiceCell section={section} item={{ row, index }} headerId={headerId} path={typePath(index)} options={options} placeholder={CONTACT_MESSAGES.choosePhoneType} />
      },
    },
    {
      key: "status",
      header: STATUS,
      cell: ({ row }) => {
        const state = rowStateOf(row)
        if (state !== "saved") return <RowEditStatus state={state} id={statusIdOf(row.key)} />
        const read = saved.get(row.key)
        return read ? statusOf(read) : null
      },
    },
    {
      key: "notifications",
      header: NOTIFICATIONS,
      cell: ({ row }) => {
        const read = row.isNew ? undefined : saved.get(row.key)
        return read ? notificationsOf(read) : <NotApplicable />
      },
    },
  ]
}

/**
 * The rows `values` stands for, as the engine reads them: every saved phone
 * (with an id) as read, relabelled or struck through by its edit row (a
 * saved phone the form doesn't hold, e.g. one a stale draft didn't know, is
 * kept unchanged), then the new rows with their E.164 number and picked region.
 */
function editedContactPoints(before: readonly ContactPoint[], rows: readonly PhoneEditRow[]): ContactPointEditRow[] {
  const kept = before.map((point): ContactPointEditRow => {
    const edit = rows.find((row) => !row.isNew && row.id === point.id)
    if (!edit) return point
    const label = edit.label === "" ? point.label : edit.label
    return edit.removed ? { ...point, label, removed: true } : { ...point, label }
  })
  const added = rows
    .filter((row) => row.isNew)
    .map(
      (row): ContactPointEditRow => ({
        id: null,
        name: null,
        value: toE164(row.phone) ?? "",
        type: row.type,
        label: row.label,
        isVerified: null,
        isNotificationEnabled: false,
        phoneNumberRegion: normalizeRegion(row.phone.region),
      }),
    )
  return [...kept, ...added]
}

/**
 * Phone (Stories 3.1–3.2, FR15–FR16, NG-9023): the user's Mobile and Landline
 * numbers from the shared per-type keys `keys.contactPoints("Mobile")` and
 * `("Landline")` (also read by the header and the `/account` pickers),
 * merged in one table: Primary first, then the API order. The landmark
 * renders from the first render and is never remounted (F6-1); the header
 * and the Section index show the saved count.
 *
 * Either read failing without cached data shows "Couldn't load phones" with
 * Retry, which revalidates only the two Phone keys; a 403 shows the Section's
 * no-access row and a session end is left to the shell. Once both lists are
 * cached the table stays, even if a background revalidation fails.
 *
 * Edit (Story 3.2) runs on `useSectionForm` (registered as `phone`, order 2,
 * drafts of `rows`): the whole table switches to edit. Saved rows keep their
 * number and type locked and offer a Label Select (never Primary; the
 * Primary's label stays); new rows ("Add phone", the empty-state action, the
 * footer's Add) take a phone input, a Label and a Type. Remove strikes a
 * saved row through until Save (Restore undoes it) and deletes a new row; it
 * is unavailable on the last phone and on the Primary. Twenty phones per
 * type at most. Save sends the one manage POST built by
 * `contactPointsDiffToManageDTO`, then revalidates both Phone keys and
 * `myself` (the header and `/account` follow).
 */
export function PhoneSection() {
  const mobile = useSWR<ContactPoint[] | undefined, ApiResponseError>(keys.contactPoints("Mobile"))
  const landline = useSWR<ContactPoint[] | undefined, ApiResponseError>(keys.contactPoints("Landline"))
  const typeKey = useSWR<TypeInfo | undefined, ApiResponseError>(keys.typeKey("ContactPoint"))
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

  const rows = useMemo(() => (mobile.data && landline.data ? phoneRowsOf(mobile.data, landline.data) : undefined), [mobile.data, landline.data])
  const loadError = rows ? undefined : phoneLoadError([mobileFailure, landlineFailure])
  const state: FrameState = rows ? "ready" : loadError ? { error: loadError } : "loading"
  const dataStatus: SectionDataStatus = rows ? "loaded" : loadError ? "error" : "loading"
  useReportSectionCount("phone", rows?.length)

  // The Contact Labels the platform offers (the enum when the type key is loading or failed), never Primary.
  const labelOptions = contactLabelsFrom(valueListOptions(typeKey.data, "label").map((value) => value.name)).filter((label) => label !== PRIMARY_LABEL)

  const baseline = useMemo<PhoneValues>(
    () => ({ rows: (rows ?? []).map((row) => phoneEditRowOf(row.key, row.type, isRepeat(row) ? { ...row.point, id: null } : row.point)) }),
    [rows],
  )
  /** The saved phones the engine diffs against: the shown rows with an id, once per id, typed by the list they came from. */
  const savedPoints = useMemo(
    () => (rows ?? []).filter((row) => row.point.id !== null && !isRepeat(row)).map((row) => ({ ...row.point, type: row.type })),
    [rows],
  )
  const newKeys = useRef(0)
  // The form rows' shape (kept in step while rendering, below): the field order and the server error mapping.
  const [shape, setShape] = useState(() => rowsShape(baseline.rows))

  async function save(values: PhoneValues): Promise<SaveResult> {
    const dto = contactPointsDiffToManageDTO(savedPoints, editedContactPoints(savedPoints, values.rows))
    if (dto === null) return { ok: true }
    const result = await saveContactPoints(dto)
    if (!result.ok) return result
    try {
      await Promise.all([mutateContactPoints("Mobile", "Landline"), mutateMyself()])
    } catch {
      // Saved: a failed refetch must never make Retry send the adds again (the next read catches up).
    }
    return { ok: true }
  }

  const section = useSectionForm<PhoneValues>({
    id: "phone",
    label: SHELL_MESSAGES.sectionPhone,
    displayOrder: 2,
    schema: phoneSchema,
    baseline,
    save,
    onNoChanges: "close",
    cancelFocus: "heading",
    fieldOrder: phoneFieldOrder(shape),
    // A rejected number, type or label names the one new row when there is exactly one; else it shows at Section level.
    errorFields: phoneErrorFields(shape),
    draftFields: ["rows"],
    describeDraftDiff: phoneDraftDiff,
    dataStatus,
  })
  const { form, isEditing, isSaving, rebase } = section
  const watchedRows = useWatch({ control: form.control, name: "rows" })
  const formRows = useMemo(() => watchedRows ?? [], [watchedRows])
  if (rowsShape(formRows) !== shape) setShape(rowsShape(formRows))
  const rowsControl = section.control("rows")

  // Back in read view (saved or cancelled): the baseline is the server's again (no stale saved-values override).
  const wasEditing = useRef(false)
  useEffect(() => {
    const leftEdit = wasEditing.current && !isEditing
    wasEditing.current = isEditing
    if (leftEdit) rebase(baseline)
  }, [isEditing, baseline, rebase])

  /** The rows the next change starts from: the form's while editing, else the saved ones. */
  const currentRows = (): PhoneEditRow[] => (isEditing ? form.getValues("rows") : baseline.rows)

  function addPhone(): void {
    if (isSaving) return
    const current = currentRows()
    if (arePhoneTypesFull(current)) return
    const next = [...current, newPhoneEditRow(nextNewKey(current, newKeys))]
    section.startEdit({ focus: numberPath(current.length) })
    rowsControl.onChange(next)
  }

  function setRemoved(key: string, removed: boolean): void {
    if (isSaving) return
    const current = currentRows()
    const target = current.find((row) => row.key === key)
    if (!target) return
    if (target.isNew) {
      // A new row goes outright; errors are re-read from the schema, never left on a shifted index.
      form.clearErrors("rows")
      rowsControl.onChange(current.filter((row) => row.key !== key))
      return
    }
    rowsControl.onChange(current.map((row) => (row.key === key ? { ...row, removed } : row)))
  }

  // The saved rows of the latest render: a kebab item runs after its menu closes, from an older render.
  const latestSaved = useRef(baseline.rows)
  useLayoutEffect(() => {
    latestSaved.current = baseline.rows
  })

  /** The read-view kebab's Edit: edit view, focus on that row's Label (or its locked number). */
  function editRow(key: string): void {
    const saved = latestSaved.current
    const index = saved.findIndex((row) => row.key === key)
    // A revalidation between the kebab press and the item run may have dropped the row.
    if (index < 0) return
    section.startEdit({ focus: editFocusOf(saved[index], index) })
  }

  /** The read-view kebab's Remove: edit view with the row struck through, focus on its Restore. */
  function removeRow(key: string): void {
    const saved = latestSaved.current
    const index = saved.findIndex((row) => row.key === key)
    if (index < 0) return
    section.startEdit({ focus: removalPath(index) })
    rowsControl.onChange(saved.map((row) => (row.key === key ? { ...row, removed: true } : row)))
  }

  const headingId = sectionHeadingId("phone")
  const savedFull = arePhoneTypesFull(baseline.rows)
  const editFull = arePhoneTypesFull(formRows)
  const limitReason = (full: boolean) => (full ? CONTACT_MESSAGES.phoneLimit : undefined)
  // Only phones that can be sent count: new rows and saved rows with an id that aren't struck through.
  const remaining = formRows.filter((row) => row.isNew || (row.id !== null && !row.removed)).length
  const savedWithId = baseline.rows.filter((row) => row.id !== null).length
  const hadSaved = savedWithId > 0
  const savedByKey = new Map((rows ?? []).map((row) => [row.key, row]))
  const primaryKey = rows?.find((row) => row.primary)?.key
  const emptyAction = { label: CONTACT_MESSAGES.addPhone, onClick: addPhone, disabledReason: limitReason(isEditing ? editFull : savedFull) }

  const headerActions =
    rows && !isEditing ? (
      <>
        <Button type="button" variant="outline" size="touch" {...section.editButtonProps} onClick={rows.length === 0 ? addPhone : section.editButtonProps.onClick}>
          {SECTION_MESSAGES.edit}
        </Button>
        {savedFull ? (
          <DisabledAction reason={CONTACT_MESSAGES.phoneLimit}>
            <Plus aria-hidden="true" />
            {CONTACT_MESSAGES.addPhone}
          </DisabledAction>
        ) : (
          <Button type="button" variant="outline" size="touch" onClick={addPhone}>
            <Plus aria-hidden="true" />
            {CONTACT_MESSAGES.addPhone}
          </Button>
        )}
      </>
    ) : null

  const retry = () => {
    void mobile.mutate()
    void landline.mutate()
  }

  return (
    <section id="phone" aria-labelledby={headingId} className="min-w-0">
      <SectionHeader id="phone" title={SHELL_MESSAGES.sectionPhone} count={rows?.length} editing={isEditing} actions={headerActions} className="mb-2" />
      <StateFrame
        state={state}
        skeleton="table"
        columns={SECTION_COLUMNS.phone}
        loadError={{ kind: "section", sectionId: "phone" }}
        level="section"
        onRetry={retry}
        attempt={attempt}
        onReady={onReady}
        // Once ready the Section container is the card (it carries the editing halo and the draft notice).
        className={rows ? "overflow-visible rounded-none border-0 bg-transparent" : undefined}
      >
        {rows && (
          <SectionContainer editing={isEditing} sectionId="phone">
            {isEditing ? (
              <>
                <SectionTable<EditItem>
                  rows={formRows.map((row, index) => ({ row, index }))}
                  columns={phoneEditColumns({ section, rows: formRows, labelOptions, saved: savedByKey, primaryKey })}
                  getRowKey={({ row }) => row.key}
                  labelledBy={headingId}
                  editing
                  rowState={({ row }) => rowStateOf(row)}
                  empty={{ message: CONTACT_MESSAGES.phonesEmpty, action: emptyAction }}
                  actions={({ row, index }) => {
                    // A saved row without an id can't be removed (nothing to send).
                    if (!row.isNew && row.id === null) return null
                    const { ref: removalRef } = section.control(removalPath(index))
                    return (
                      <RowRemoval
                        ref={removalRef}
                        state={rowStateOf(row)}
                        statusId={statusIdOf(row.key)}
                        disabledReason={row.removed ? undefined : removeReason(row, remaining, hadSaved)}
                        onRemove={() => setRemoved(row.key, true)}
                        onRestore={() => setRemoved(row.key, false)}
                      />
                    )
                  }}
                />
                <SectionFooter {...section.footerProps} addRow={{ label: CONTACT_MESSAGES.addRow, onClick: addPhone, disabledReason: limitReason(editFull) }} />
              </>
            ) : (
              <SectionTable
                rows={rows}
                columns={PHONE_COLUMNS}
                getRowKey={(row) => row.key}
                labelledBy={headingId}
                empty={{ message: CONTACT_MESSAGES.phonesEmpty, action: emptyAction }}
                actions={(row, layout) => (
                  <RowActions
                    name={formatPhoneDisplay(row.value, row.point.phoneNumberRegion)}
                    showInline={layout === "table"}
                    actions={[
                      { id: "edit", label: SECTION_MESSAGES.edit, onSelect: () => editRow(row.key) },
                      ...(row.point.id === null
                        ? []
                        : [
                            {
                              id: "remove",
                              label: COMMON_MESSAGES.remove,
                              destructive: true,
                              disabledReason: removeReason({ isNew: false, label: row.point.label ?? "" }, savedWithId, true),
                              onSelect: () => removeRow(row.key),
                            },
                          ]),
                    ]}
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
