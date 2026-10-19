"use client"

import { Plus } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useWatch, type Path } from "react-hook-form"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { DisabledAction } from "@/components/ui/disabled-action"
import { InputLocked } from "@/components/ui/input-locked"
import { LiveStatus } from "@/components/ui/live-status"
import { PhoneInput } from "@/components/ui/phone-input"
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
  mutateMyself,
  newUnverifiedContactPoints,
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
import { COMMON_MESSAGES, CONTACT_MESSAGES, formatMessage, SECTION_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { formatPhoneDisplay, isPhoneRegion, normalizeRegion, regionFlag, toE164, type PhoneInputValue } from "@/lib/shared/phone"
import { CellField, ChoiceCell, isRepeatKey, nextNewKey, NotApplicable, NotificationsSwitch, uniqueRowKeys } from "./contact-edit-kit"
import { useMakePrimary } from "./contact-primary"
import { contactVerifyAction, ContactVerifyStatus, useContactVerification, useResendSeconds, type ContactVerifyState, type ContactVerifyStates } from "./contact-verify"
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
const isRepeat = (row: PhoneRow): boolean => isRepeatKey(row.key)

/**
 * The shown phones: the Mobile rows, then the Landline rows, each in API
 * order, without the rows that have no value; the Primary phone
 * (`findPrimary`, a Mobile one first) moves to the top and is the only row
 * shown as Primary.
 */
function phoneRowsOf(mobile: readonly ContactPoint[], landline: readonly ContactPoint[]): PhoneRow[] {
  const rows = uniqueRowKeys([...toPhoneRows("Mobile", mobile), ...toPhoneRows("Landline", landline)])
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

// --- Verify (Story 3.3; the flow is shared in `contact-verify.tsx`) ------------------------------

/** The id a row's verification is keyed by: a saved row's id, never a repeated id's later occurrence. */
const verifyIdOf = (row: PhoneRow): number | null => (isRepeat(row) ? null : row.point.id)

/** A row the Verify action offers: saved (an id, not a repeat), Mobile, not labelled Home, not verified (an unverified Primary counts). */
const isVerifiable = (row: PhoneRow): boolean =>
  verifyIdOf(row) !== null && row.type === "Mobile" && row.point.label !== CONTACT_LABEL_HOME && row.point.isVerified !== true

/** The Status cell: the shared one, with the phone's cooldown help. */
function PhoneStatus({ row, state }: { readonly row: PhoneRow; readonly state: ContactVerifyState | undefined }) {
  return <ContactVerifyStatus label={row.point.label} isVerified={row.point.isVerified} state={state} cooldownHelp={CONTACT_MESSAGES.verifyCooldown} />
}

// --- Make primary (Story 3.4) --------------------------------------------------------------------

/** A row's Make primary: offered, enabled (`reason` undefined) or aria-disabled with its reason; `null` when not offered. */
type PhonePrimaryOffer = { readonly reason: string | undefined } | null

/**
 * The RC2 exception: no shown phone is Verified and none is Primary, so an
 * unverified Mobile (not labelled Home) may be made Primary too.
 */
const isPrimaryExceptionCase = (rows: readonly PhoneRow[]): boolean => !rows.some((row) => row.primary || row.point.isVerified === true)

/**
 * Make primary on a read-view row (Story 3.4, FR18). Never offered on the
 * Primary, on a row already labelled Primary (a legacy second one), or on a
 * row without an id or a repeated id's later occurrence. A Landline reads
 * "Landlines can't be primary"; a Verified Mobile is eligible; an unverified
 * Home-labelled Mobile reads "Change the label from Home, then verify this
 * number"; any other unverified Mobile is eligible in the RC2 case, else
 * reads "Verify this number first" (Verify sits beside it).
 */
function primaryOfferOf(row: PhoneRow, exception: boolean): PhonePrimaryOffer {
  if (row.primary || row.point.label === PRIMARY_LABEL || verifyIdOf(row) === null) return null
  if (row.type === "Landline") return { reason: CONTACT_MESSAGES.phoneLandlineNotPrimary }
  if (row.point.isVerified === true) return { reason: undefined }
  if (row.point.label === CONTACT_LABEL_HOME) return { reason: CONTACT_MESSAGES.phoneHomeNotPrimary }
  return { reason: exception ? undefined : CONTACT_MESSAGES.phoneVerifyFirst }
}

interface PhoneReadActionsProps {
  readonly row: PhoneRow
  readonly state: ContactVerifyState | undefined
  readonly showInline: boolean
  readonly removeReason: string | undefined
  readonly primaryOffer: PhonePrimaryOffer
  readonly onVerify: (id: number) => void
  readonly onMakePrimary: (id: number) => void
  readonly onEdit: (key: string) => void
  readonly onRemove: (key: string) => void
}

/**
 * A read-view row's actions: Verify / Resend verification (inline and in the
 * kebab; aria-disabled with "Link sent · Resend in {n} s" during the
 * countdown) on a verifiable row, then Make primary (inline and in the
 * kebab; aria-disabled with its reason) where offered, then Edit, then
 * Remove (rows with an id, not a repeated id's later occurrence: its edit
 * row is locked, so a Remove there could never be restored or sent).
 */
function PhoneReadActions({ row, state, showInline, removeReason: removeDisabled, primaryOffer, onVerify, onMakePrimary, onEdit, onRemove }: PhoneReadActionsProps) {
  const seconds = useResendSeconds(state)
  const id = verifyIdOf(row)
  const verify = id !== null && isVerifiable(row) ? [contactVerifyAction(state, seconds, () => onVerify(id))] : []
  const makePrimary =
    id !== null && primaryOffer
      ? [{ id: "make-primary", label: COMMON_MESSAGES.makePrimary, inline: true, disabledReason: primaryOffer.reason, onSelect: () => onMakePrimary(id) }]
      : []
  return (
    <RowActions
      name={formatPhoneDisplay(row.value, row.point.phoneNumberRegion)}
      showInline={showInline}
      actions={[
        ...verify,
        ...makePrimary,
        { id: "edit", label: SECTION_MESSAGES.edit, onSelect: () => onEdit(row.key) },
        ...(row.point.id === null || isRepeat(row)
          ? []
          : [{ id: "remove", label: COMMON_MESSAGES.remove, destructive: true, disabledReason: removeDisabled, onSelect: () => onRemove(row.key) }]),
      ]}
    />
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

/** The verification state of a row (none on a repeated id's later occurrence). */
const verifyStateOf = (states: ContactVerifyStates, row: PhoneRow): ContactVerifyState | undefined => {
  const id = verifyIdOf(row)
  return id === null ? undefined : states.get(id)
}

/** Number · Label · Type · Status · Notifications; below 768 px line 1 is the number and status, line 2 the rest (muted). */
function phoneReadColumns(states: ContactVerifyStates): SectionTableColumn<PhoneRow>[] {
  return [
    { key: "number", header: NUMBER, width: "w-[34%]", mobileLine: 1, cell: (row) => <PhoneNumber row={row} /> },
    {
      key: "label",
      header: LABEL,
      cell: (row) => (row.point.label ? <Chip variant={row.primary ? "primary" : "label"}>{row.point.label}</Chip> : null),
    },
    { key: "type", header: TYPE, cell: (row) => phoneTypeLabel(row.type) },
    { key: "status", header: STATUS, mobileLine: 1, cell: (row) => <PhoneStatus row={row} state={verifyStateOf(states, row)} /> },
    { key: "notifications", header: NOTIFICATIONS, cell: notificationsOf },
  ]
}

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
/** The Primary row's notifications switch (Story 3.4). */
const notificationsPath = (index: number) => `rows.${index}.notifications` as const
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

/** A saved row's locked Number or Type, focusable and read-only, with the locked help. */
/** A saved row's locked Number (focusable target, with the locked help) or Type (no repeated help). */
function LockedCell({ section, item, headerId, value, number }: CellProps & { readonly value: string; readonly number?: boolean }) {
  const { ref } = section.control(lockedPath(item.index))
  return <InputLocked ref={number ? ref : undefined} value={value} help={number ? CONTACT_MESSAGES.phoneLocked : null} aria-labelledby={headerId} />
}

/**
 * The Primary row's Notifications switch (Story 3.4, FR19), named
 * "Notifications for {formatted number}" (the shared `NotificationsSwitch`).
 */
function NotificationsCell({ section, item, read }: Omit<CellProps, "headerId"> & { readonly read: PhoneRow }) {
  return (
    <NotificationsSwitch
      section={section}
      path={notificationsPath(item.index)}
      name={formatPhoneDisplay(read.value, read.point.phoneNumberRegion)}
      saved={read.point.isNotificationEnabled === true}
    />
  )
}

interface EditColumnsInput {
  readonly section: PhoneSectionForm
  readonly rows: readonly PhoneEditRow[]
  readonly labelOptions: readonly string[]
  /** The saved phones as read, by key (status and notifications). */
  readonly saved: ReadonlyMap<string, PhoneRow>
  readonly primaryKey: string | undefined
  /** The Section's verification states (the saved rows' Status). */
  readonly verifyStates: ContactVerifyStates
}

const rowStateOf = (row: PhoneEditRow): RowEditState => (row.isNew ? "new" : row.removed ? "removed" : "saved")

/** The id of a row's edit status ("New · not saved", "Removed on save"): its Restore is described by it. */
const statusIdOf = (key: string) => `phone-row-${key}-status`

/** The edit table: Number, Label and Type as controls (locked on a saved row), Status and Notifications as read. */
function phoneEditColumns({ section, rows, labelOptions, saved, primaryKey, verifyStates }: EditColumnsInput): SectionTableColumn<EditItem>[] {
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
          return <ChoiceCell section={section} headerId={headerId} path={labelPath(index)} options={labelChoices} placeholder={CONTACT_MESSAGES.chooseLabel} />
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
        return <ChoiceCell section={section} headerId={headerId} path={typePath(index)} options={options} placeholder={CONTACT_MESSAGES.choosePhoneType} />
      },
    },
    {
      key: "status",
      header: STATUS,
      cell: ({ row }) => {
        const state = rowStateOf(row)
        if (state !== "saved") return <RowEditStatus state={state} id={statusIdOf(row.key)} />
        const read = saved.get(row.key)
        return read ? <PhoneStatus row={read} state={verifyStateOf(verifyStates, read)} /> : null
      },
    },
    {
      key: "notifications",
      header: NOTIFICATIONS,
      cell: ({ row, index }) => {
        const read = row.isNew ? undefined : saved.get(row.key)
        // RC3: only the Primary has a setting; it can change only with an id to update.
        if (!read?.primary) return <NotApplicable />
        return row.id === null ? notificationsOf(read) : <NotificationsCell section={section} item={{ row, index }} read={read} />
      },
    },
  ]
}

/**
 * The rows `values` stands for, as the engine reads them: every saved phone
 * (with an id) as read, relabelled, its notifications switched (Story 3.4)
 * or struck through by its edit row (a
 * saved phone the form doesn't hold, e.g. one a stale draft didn't know, is
 * kept unchanged), then the new rows with their E.164 number and picked region.
 */
function editedContactPoints(before: readonly ContactPoint[], rows: readonly PhoneEditRow[]): ContactPointEditRow[] {
  const kept = before.map((point): ContactPointEditRow => {
    const edit = rows.find((row) => !row.isNew && row.id === point.id)
    if (!edit) return point
    const label = edit.label === "" ? point.label : edit.label
    // Only the Primary has a control for them (a restored draft never changes another row's), and a draft stored
    // before Story 3.4 holds none: unchanged.
    const isNotificationEnabled =
      point.label === PRIMARY_LABEL && typeof edit.notifications === "boolean" ? edit.notifications : point.isNotificationEnabled
    return edit.removed ? { ...point, label, isNotificationEnabled, removed: true } : { ...point, label, isNotificationEnabled }
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
 * Phone (Stories 3.1–3.4, FR15–FR19, NG-9023): the user's Mobile and Landline
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
 *
 * Verify (Story 3.3, FR17): after its manage POST, `save()` sends one
 * verification request for the new unverified Mobiles the refetch shows
 * (`newUnverifiedContactPoints`; Save all too); nothing it does fails the
 * save. The read view offers Verify / Resend verification on every
 * unverified, non-Home saved Mobile: it sends at once, with no confirm and
 * no edit mode. A sent link counts down "Link sent · Resend in {n} s" for
 * 60 s ("Link sent" announced once); a send error or the backend's
 * cooldown shows as the row's help with Resend available at once; a
 * manual send that can't get through shows an error toast with Retry. The
 * states live here, keyed by id, and a reload forgets them.
 *
 * Make primary (Story 3.4, FR18): a read-view row action (inline and in the
 * kebab, after Verify) on a saved, Verified Mobile that isn't the Primary
 * (RC2: with no Verified and no Primary phone, an unverified non-Home Mobile
 * too); elsewhere aria-disabled with its reason. It opens the standard
 * confirm ("This changes how you sign in", focus on Cancel); Confirm keeps it
 * busy while the one manage POST goes out (the new Primary with notifications
 * on, the old one relabelled Old), then refetches both Phone keys and
 * `myself`, toasts "Phone saved." and focuses the `h2`. A failure closes it,
 * leaves the view as it was and toasts the mapped error with Retry. The
 * footnote "Changing your primary phone changes how you sign in." shows
 * below the table. Notifications (FR19): in edit view the Primary row's
 * cell is a switch, and Save sends only that row.
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

  // --- Verify (Story 3.3) ---
  // The shown phones of the latest render: a kebab item runs after its menu closes, from an older render, and a toast's
  // Retry later still (the hook reads the check when a send starts).
  const latestRows = useRef(rows)
  useLayoutEffect(() => {
    latestRows.current = rows
  })
  const verification = useContactVerification("phone", CONTACT_MESSAGES.verifyCooldown, (id) => {
    const row = latestRows.current?.find((shown) => verifyIdOf(shown) === id)
    return row !== undefined && isVerifiable(row)
  })
  const verifyStates = verification.states

  // The form rows' shape (kept in step while rendering, below): the field order and the server error mapping.
  const [shape, setShape] = useState(() => rowsShape(baseline.rows))

  async function save(values: PhoneValues): Promise<SaveResult> {
    const dto = contactPointsDiffToManageDTO(savedPoints, editedContactPoints(savedPoints, values.rows))
    if (dto === null) return { ok: true }
    const result = await saveContactPoints(dto)
    if (!result.ok) return result
    // The same shared keys the header and `/account` read: refetched through the hooks, which hand back the fresh lists.
    let fresh: ContactPoint[] | undefined
    try {
      const [mobileRows, landlineRows] = await Promise.all([mobile.mutate(), landline.mutate(), mutateMyself()])
      fresh = [...(mobileRows ?? []).map((point) => ({ ...point, type: "Mobile" })), ...(landlineRows ?? []).map((point) => ({ ...point, type: "Landline" }))]
    } catch {
      // Saved: a failed refetch must never make Retry send the adds again (the next read catches up); no verify without it.
    }
    // Never throws: nothing the verify does fails the save.
    if (fresh) await verification.sendAfterSave(newUnverifiedContactPoints(savedPoints, fresh))
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

  // The saved rows, saved points and mode of the latest render: a kebab item runs after its menu closes, from an older
  // render, and a toast's Retry later still.
  const latestSaved = useRef(baseline.rows)
  const latestPoints = useRef(savedPoints)
  const latestEditing = useRef(isEditing)
  useLayoutEffect(() => {
    latestSaved.current = baseline.rows
    latestPoints.current = savedPoints
    latestEditing.current = isEditing
  })

  // --- Make primary (Story 3.4; the flow is shared in `contact-primary.tsx`) ---
  const headingId = sectionHeadingId("phone")
  const makePrimary = useMakePrimary({
    scope: "phone",
    sectionLabel: SHELL_MESSAGES.sectionPhone,
    headingId,
    // The shown row `id` stands for, when Make primary is still enabled on it (latest rows, read view only).
    eligible: (id) => {
      const shown = latestRows.current
      if (!shown || latestEditing.current) return undefined
      const row = shown.find((candidate) => verifyIdOf(candidate) === id)
      const offer = row ? primaryOfferOf(row, isPrimaryExceptionCase(shown)) : null
      if (!row || !offer || offer.reason !== undefined) return undefined
      return {
        name: formatPhoneDisplay(row.value, row.point.phoneNumberRegion),
        relabelsOld: latestPoints.current.some((point) => point.id !== id && point.type === row.type && point.label === PRIMARY_LABEL),
      }
    },
    savedPoints: () => latestPoints.current,
    refetch: () => Promise.allSettled([mobile.mutate(), landline.mutate(), mutateMyself()]),
    body: ({ name, relabelsOld }) => formatMessage(relabelsOld ? CONTACT_MESSAGES.makePrimaryBody : CONTACT_MESSAGES.makePrimaryBodyNoCurrent, { number: name }),
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

  const savedFull = arePhoneTypesFull(baseline.rows)
  const editFull = arePhoneTypesFull(formRows)
  const limitReason = (full: boolean) => (full ? CONTACT_MESSAGES.phoneLimit : undefined)
  // Only phones that can be sent count: new rows and saved rows with an id that aren't struck through.
  const remaining = formRows.filter((row) => row.isNew || (row.id !== null && !row.removed)).length
  const savedWithId = baseline.rows.filter((row) => row.id !== null).length
  const hadSaved = savedWithId > 0
  const savedByKey = new Map((rows ?? []).map((row) => [row.key, row]))
  const primaryKey = rows?.find((row) => row.primary)?.key
  const primaryException = rows ? isPrimaryExceptionCase(rows) : false
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
                  columns={phoneEditColumns({ section, rows: formRows, labelOptions, saved: savedByKey, primaryKey, verifyStates })}
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
                columns={phoneReadColumns(verifyStates)}
                getRowKey={(row) => row.key}
                labelledBy={headingId}
                empty={{ message: CONTACT_MESSAGES.phonesEmpty, action: emptyAction }}
                actions={(row, layout) => (
                  <PhoneReadActions
                    row={row}
                    state={verifyStateOf(verifyStates, row)}
                    showInline={layout === "table"}
                    removeReason={removeReason({ isNew: false, label: row.point.label ?? "" }, savedWithId, true)}
                    primaryOffer={primaryOfferOf(row, primaryException)}
                    onVerify={verification.verify}
                    onMakePrimary={makePrimary.open}
                    onEdit={editRow}
                    onRemove={removeRow}
                  />
                )}
              />
            )}
          </SectionContainer>
        )}
        {rows && (
          <p data-slot="phone-footnote" className="text-muted-foreground text-body-sm mt-2">
            {CONTACT_MESSAGES.phonePrimaryFootnote}
          </p>
        )}
      </StateFrame>
      {makePrimary.dialog}
      {/* "Link sent", once per send (never each second of the countdown). */}
      <LiveStatus message={verification.announcement} />
    </section>
  )
}
