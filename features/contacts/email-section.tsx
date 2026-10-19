"use client"

import { Plus } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useWatch, type Path } from "react-hook-form"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { DisabledAction } from "@/components/ui/disabled-action"
import { Input } from "@/components/ui/input"
import { InputLocked } from "@/components/ui/input-locked"
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
import { CONTACT_LABEL_HOME, contactLabelsFrom } from "@/lib/shared/contact-labels"
import { COMMON_MESSAGES, CONTACT_MESSAGES, SECTION_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { CellField, ChoiceCell, isRepeatKey, nextNewKey, NotApplicable, uniqueRowKeys } from "./contact-edit-kit"
import { emailDraftDiff, emailEditRowOf, emailSchema, isEmailFull, newEmailEditRow, type EmailEditRow, type EmailValues } from "./email-schema"

/** The Contact Type of every row here (the list key, the add `type`). */
const EMAIL_TYPE = "Email"

/** One shown email: the row as read. */
interface EmailRow {
  /** Stable across revalidations: the id (a repeated id gets its occurrence), else the position. */
  readonly key: string
  readonly point: ContactPoint
  /** Its `value` (rows without one are never shown). */
  readonly value: string
  /** The one Primary email (`findPrimary`): a legacy second Primary-labelled row is shown as a plain label. */
  readonly primary: boolean
}

/**
 * The shown emails in API order, without the rows that have no value, keyed
 * uniquely; the Primary email (`findPrimary`) moves to the top and is the
 * only row shown as Primary.
 */
function emailRowsOf(points: readonly ContactPoint[]): EmailRow[] {
  const rows = uniqueRowKeys(
    points.flatMap((point, index) => (point.value ? [{ key: point.id === null ? `none-${index}` : `id-${point.id}`, point, value: point.value, primary: false }] : [])),
  )
  const primary = findPrimary(rows.map((row) => row.point))
  const first = rows.find((row) => row.point === primary)
  return first ? [{ ...first, primary: true }, ...rows.filter((row) => row !== first)] : rows
}

/** A repeated id's later occurrence: locked like a row without an id. */
const isRepeat = (row: EmailRow): boolean => isRepeatKey(row.key)

/** The Status cell: empty on a Home row, else "Verified" or "Not verified" (icon + word). */
function EmailStatus({ row }: { readonly row: EmailRow }) {
  if (row.point.label === CONTACT_LABEL_HOME) return null
  return row.point.isVerified === true ? (
    <StatusBadge status="verified">{COMMON_MESSAGES.verified}</StatusBadge>
  ) : (
    <StatusBadge status="notVerified">{COMMON_MESSAGES.notVerified}</StatusBadge>
  )
}

/** The Notifications cell: "On" / "Off" on the Primary only (RC3), the "—" elsewhere. */
function notificationsOf(row: EmailRow): ReactNode {
  if (!row.primary) return <NotApplicable />
  return row.point.isNotificationEnabled === true ? (
    <span>{CONTACT_MESSAGES.notificationsOn}</span>
  ) : (
    <span className="text-muted-foreground">{CONTACT_MESSAGES.notificationsOff}</span>
  )
}

const [ADDRESS, LABEL, STATUS, NOTIFICATIONS] = SECTION_COLUMNS.email

/** Email address · Label · Status · Notifications; below 768 px line 1 is the address and status, line 2 the label and notifications (muted). */
const EMAIL_READ_COLUMNS: SectionTableColumn<EmailRow>[] = [
  { key: "address", header: ADDRESS, width: "w-[40%]", mobileLine: 1, cell: (row) => <span className="cell-strong text-foreground">{row.value}</span> },
  {
    key: "label",
    header: LABEL,
    cell: (row) => (row.point.label ? <Chip variant={row.primary ? "primary" : "label"}>{row.point.label}</Chip> : null),
  },
  { key: "status", header: STATUS, mobileLine: 1, cell: (row) => <EmailStatus row={row} /> },
  { key: "notifications", header: NOTIFICATIONS, cell: notificationsOf },
]

/**
 * Why a row's Remove is unavailable, if it is: the last email left ("You
 * need at least one email"; only when the person had saved emails), else a
 * Primary-labelled saved row ("Make another email primary first": the
 * backend rejects removing a Primary without a replacement, and Story 3.6
 * builds Make primary).
 */
function removeReason(row: { readonly isNew: boolean; readonly label: string }, remaining: number, hadSaved: boolean): string | undefined {
  if (remaining === 1 && hadSaved) return CONTACT_MESSAGES.emailMinimum
  if (!row.isNew && row.label === PRIMARY_LABEL) return CONTACT_MESSAGES.emailPrimaryFirst
  return undefined
}

interface EmailReadActionsProps {
  readonly row: EmailRow
  readonly removeReason: string | undefined
  readonly onEdit: (key: string) => void
  readonly onRemove: (key: string) => void
}

/** A read-view row's kebab, "More actions for {email}": Edit, then Remove (rows with an id, not a repeat). No Verify or Make primary (Story 3.6). */
function EmailReadActions({ row, removeReason: removeDisabled, onEdit, onRemove }: EmailReadActionsProps) {
  return (
    <RowActions
      name={row.value}
      actions={[
        { id: "edit", label: SECTION_MESSAGES.edit, onSelect: () => onEdit(row.key) },
        // Nothing to remove on a row without an id or a repeated id's later occurrence (both locked in edit view).
        ...(row.point.id === null || isRepeat(row)
          ? []
          : [{ id: "remove", label: COMMON_MESSAGES.remove, destructive: true, disabledReason: removeDisabled, onSelect: () => onRemove(row.key) }]),
      ]}
    />
  )
}

// --- Edit view --------------------------------------------------------------------------------

type EmailSectionForm = SectionForm<EmailValues>

/** A row of the edit table with its index in the form's `rows` (its field paths). */
interface EditItem {
  readonly row: EmailEditRow
  readonly index: number
}

/** The form paths of a row's controls: a new row's address, and the Label. */
const valuePath = (index: number) => `rows.${index}.value` as const
const labelPath = (index: number) => `rows.${index}.label` as const
/** The locked address of a saved row (focus only: a kebab Edit on a row with nothing editable). Same path as a new row's address. */
const lockedPath = valuePath
/** The row's Remove / Restore action (focus only: Restore after a read-view Remove). */
const removalPath = (index: number) => `rows.${index}.removed` as const

/** A saved row whose label can be changed here: it has an id (to update) and isn't labelled Primary (Story 3.6 changes it). */
const isLabelEditable = (row: EmailEditRow): boolean => row.isNew || (row.id !== null && row.label !== PRIMARY_LABEL)

/** The shape of the form's rows, one letter per row: `n` new, `s` saved with an editable label, `l` saved and locked. */
function rowsShape(rows: readonly EmailEditRow[]): string {
  return rows.map((row) => (row.isNew ? "n" : isLabelEditable(row) ? "s" : "l")).join("")
}

/** The fields in reading order (the first one takes focus on Edit), or the first locked address when nothing is editable. */
function emailFieldOrder(shape: string): Path<EmailValues>[] {
  const order = [...shape].flatMap((kind, index): Path<EmailValues>[] => {
    if (kind === "n") return [valuePath(index), labelPath(index)]
    return kind === "s" ? [labelPath(index)] : []
  })
  return order.length === 0 && shape.length > 0 ? [lockedPath(0)] : order
}

/** The server field errors of the one new row, when there is exactly one (else, and for any other field, they show at Section level). */
function emailErrorFields(shape: string): Partial<Record<ErrorField, Path<EmailValues>>> | undefined {
  const indexes = [...shape].flatMap((kind, index) => (kind === "n" ? [index] : []))
  if (indexes.length !== 1) return undefined
  const [index] = indexes
  return { value: valuePath(index), label: labelPath(index) }
}

/** Where a row's kebab Edit puts focus: its Label, else its locked address. */
const editFocusOf = (row: EmailEditRow, index: number) => (isLabelEditable(row) ? labelPath(index) : lockedPath(index))

const rowStateOf = (row: EmailEditRow): RowEditState => (row.isNew ? "new" : row.removed ? "removed" : "saved")

/** The id of a row's edit status ("New · not saved", "Removed on save"): its Restore is described by it. */
const statusIdOf = (key: string) => `email-row-${key}-status`

interface CellProps {
  readonly section: EmailSectionForm
  readonly item: EditItem
  /** The id of the visible header naming the cell (desktop `th`, card label). */
  readonly headerId: string
}

/** A new row's address: an email input named by its column header, validated on blur. */
function NewAddressCell({ section, item, headerId }: CellProps) {
  const path = valuePath(item.index)
  const error = section.errorFor(path)
  return (
    <CellField error={error}>
      {(wiring) => (
        <Input
          {...wiring}
          {...section.field(path)}
          type="email"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          aria-labelledby={headerId}
          aria-required
          required
        />
      )}
    </CellField>
  )
}

/** A saved row's locked address, focusable and read-only, with its help (the Primary: the address you sign in with). */
function LockedAddressCell({ section, item, headerId, primary }: CellProps & { readonly primary: boolean }) {
  const { ref } = section.control(lockedPath(item.index))
  return <InputLocked ref={ref} value={item.row.value} help={primary ? CONTACT_MESSAGES.emailLockedPrimary : CONTACT_MESSAGES.emailLocked} aria-labelledby={headerId} />
}

interface EditColumnsInput {
  readonly section: EmailSectionForm
  readonly labelOptions: readonly string[]
  /** The saved emails as read, by key (status and notifications). */
  readonly saved: ReadonlyMap<string, EmailRow>
  readonly primaryKey: string | undefined
}

/** The edit table: the address (locked on a saved row) and Label as controls, Status and Notifications as read. */
function emailEditColumns({ section, labelOptions, saved, primaryKey }: EditColumnsInput): SectionTableColumn<EditItem>[] {
  const labelChoices = labelOptions.map((label) => ({ value: label, label }))
  return [
    {
      key: "address",
      header: ADDRESS,
      width: "w-[40%]",
      cell: ({ row, index }, { headerId }) =>
        row.isNew ? (
          <NewAddressCell section={section} item={{ row, index }} headerId={headerId} />
        ) : (
          <LockedAddressCell section={section} item={{ row, index }} headerId={headerId} primary={row.key === primaryKey} />
        ),
    },
    {
      key: "label",
      header: LABEL,
      cell: ({ row, index }, { headerId }) => {
        if (isLabelEditable(row)) {
          return <ChoiceCell section={section} headerId={headerId} path={labelPath(index)} options={labelChoices} placeholder={CONTACT_MESSAGES.chooseLabel} />
        }
        // The Primary (and any Primary-labelled or id-less row) keeps its label: shown as the locked chip.
        return row.label ? <Chip variant={row.key === primaryKey ? "primary" : "label"}>{row.label}</Chip> : null
      },
    },
    {
      key: "status",
      header: STATUS,
      cell: ({ row }) => {
        const state = rowStateOf(row)
        if (state !== "saved") return <RowEditStatus state={state} id={statusIdOf(row.key)} />
        const read = saved.get(row.key)
        return read ? <EmailStatus row={read} /> : null
      },
    },
    {
      key: "notifications",
      header: NOTIFICATIONS,
      cell: ({ row }) => {
        const read = row.isNew ? undefined : saved.get(row.key)
        // RC3: only the Primary has a setting, shown as read (Story 3.6 adds its switch).
        return read ? notificationsOf(read) : <NotApplicable />
      },
    },
  ]
}

/**
 * The rows `values` stands for, as the engine reads them: every saved email
 * (with an id) as read, relabelled or struck through by its edit row (a
 * saved email the form doesn't hold, e.g. one a stale draft didn't know, is
 * kept unchanged), then the new rows with their trimmed address, notifications off.
 */
function editedContactPoints(before: readonly ContactPoint[], rows: readonly EmailEditRow[]): ContactPointEditRow[] {
  const kept = before.map((point): ContactPointEditRow => {
    const edit = rows.find((row) => !row.isNew && row.id === point.id)
    if (!edit) return point
    // Only a label the edit view offers is taken: never Primary and never a change to a Primary-labelled row (Story 3.6
    // owns both), so a stale draft can't switch the Primary.
    const label = edit.label === "" || edit.label === PRIMARY_LABEL || point.label === PRIMARY_LABEL ? point.label : edit.label
    return edit.removed ? { ...point, label, removed: true } : { ...point, label }
  })
  const added = rows
    .filter((row) => row.isNew)
    .map(
      (row): ContactPointEditRow => ({
        id: null,
        name: null,
        value: row.value.trim(),
        type: EMAIL_TYPE,
        label: row.label,
        isVerified: null,
        isNotificationEnabled: false,
        phoneNumberRegion: null,
      }),
    )
  return [...kept, ...added]
}

/** A read failure without cached data, mapped for the frame. */
const emailLoadError = (failure: unknown): MappedError | undefined => (failure === undefined ? undefined : mapFetchError("email", failure))

/**
 * Email (Story 3.5, FR20, NG-9024): the user's email addresses from the
 * shared key `keys.contactPoints("Email")` (also read by the header and the
 * `/account` pickers): Primary first, then the API order. The landmark
 * renders from the first render and is never remounted (F6-1); the header
 * and the Section index show the saved count.
 *
 * A read failure without cached data shows "Couldn't load emails" with
 * Retry, which revalidates only the Email key; a 403 shows the Section's
 * no-access row and a session end is left to the shell. Once cached the
 * table stays, even if a background revalidation fails.
 *
 * Edit runs on `useSectionForm` (registered as `email`, order 3, drafts of
 * `rows`): the whole table switches to edit. Saved rows keep their address
 * locked and offer a Label Select (never Primary; the Primary's label
 * stays); new rows ("Add email", the empty-state action, the footer's Add
 * row) take an address and a Label. Remove strikes a saved row through
 * until Save (Restore undoes it) and deletes a new row; it is unavailable on
 * the last email and on a Primary-labelled one. Twenty emails at most. Save
 * sends the one manage POST built by `contactPointsDiffToManageDTO`, then
 * revalidates the Email key and `myself` (the header and `/account`
 * follow). Verify, Make primary and the notifications switch are Story 3.6.
 */
export function EmailSection() {
  const email = useSWR<ContactPoint[] | undefined, ApiResponseError>(keys.contactPoints(EMAIL_TYPE))
  const typeKey = useSWR<TypeInfo | undefined, ApiResponseError>(keys.typeKey("ContactPoint"))
  const { onReady } = useSectionFrame("email")

  const failure = email.data === undefined ? email.error : undefined
  // Each new failure (a new error object) is a new attempt, so a repeated failure is announced again
  // once it arrives. Adjusted while rendering, so the first error is not mounted twice.
  const [attempt, setAttempt] = useState(0)
  const [seen, setSeen] = useState<unknown>(failure)
  if (seen !== failure) {
    setSeen(failure)
    if (failure) setAttempt((count) => count + 1)
  }

  const rows = useMemo(() => (email.data ? emailRowsOf(email.data) : undefined), [email.data])
  const loadError = rows ? undefined : emailLoadError(failure)
  const state: FrameState = rows ? "ready" : loadError ? { error: loadError } : "loading"
  const dataStatus: SectionDataStatus = rows ? "loaded" : loadError ? "error" : "loading"
  useReportSectionCount("email", rows?.length)

  // The Contact Labels the platform offers (the enum when the type key is loading or failed), never Primary.
  const labelOptions = contactLabelsFrom(valueListOptions(typeKey.data, "label").map((value) => value.name)).filter((label) => label !== PRIMARY_LABEL)

  const baseline = useMemo<EmailValues>(
    () => ({ rows: (rows ?? []).map((row) => emailEditRowOf(row.key, isRepeat(row) ? { ...row.point, id: null } : row.point)) }),
    [rows],
  )
  /** The saved emails the engine diffs against: the shown rows with an id, once per id, typed Email. */
  const savedPoints = useMemo(
    () => (rows ?? []).filter((row) => row.point.id !== null && !isRepeat(row)).map((row) => ({ ...row.point, type: EMAIL_TYPE })),
    [rows],
  )
  const newKeys = useRef(0)

  // The form rows' shape (kept in step while rendering, below): the field order and the server error mapping.
  const [shape, setShape] = useState(() => rowsShape(baseline.rows))

  async function save(values: EmailValues): Promise<SaveResult> {
    let dto: ReturnType<typeof contactPointsDiffToManageDTO>
    try {
      dto = contactPointsDiffToManageDTO(savedPoints, editedContactPoints(savedPoints, values.rows))
    } catch {
      // A refused body (a stale draft striking a row that became Primary meanwhile): never sent, never thrown.
      return { ok: false, error: { code: "UNEXPECTED", mapped: { kind: "generic" } } }
    }
    if (dto === null) return { ok: true }
    const result = await saveContactPoints(dto, "email")
    if (!result.ok) return result
    // The same shared key the header and `/account` read, and `myself` (the header's primary email).
    try {
      await Promise.all([email.mutate(), mutateMyself()])
    } catch {
      // Saved: a failed refetch must never make Retry send the adds again (the next read catches up).
    }
    return { ok: true }
  }

  const section = useSectionForm<EmailValues>({
    id: "email",
    label: SHELL_MESSAGES.sectionEmail,
    displayOrder: 3,
    schema: emailSchema,
    baseline,
    save,
    onNoChanges: "close",
    cancelFocus: "heading",
    fieldOrder: emailFieldOrder(shape),
    // A rejected address or label names the one new row when there is exactly one; else (and the limit) it shows at Section level.
    errorFields: emailErrorFields(shape),
    draftFields: ["rows"],
    describeDraftDiff: emailDraftDiff,
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
  const currentRows = (): EmailEditRow[] => (isEditing ? form.getValues("rows") : baseline.rows)

  function addEmail(): void {
    if (isSaving) return
    const current = currentRows()
    if (isEmailFull(current)) return
    const next = [...current, newEmailEditRow(nextNewKey(current, newKeys))]
    section.startEdit({ focus: valuePath(current.length) })
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

  /** The read-view kebab's Edit: edit view, focus on that row's Label (or its locked address). */
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

  const headingId = sectionHeadingId("email")
  const savedFull = isEmailFull(baseline.rows)
  const editFull = isEmailFull(formRows)
  const limitReason = (full: boolean) => (full ? CONTACT_MESSAGES.emailLimit : undefined)
  // Only emails that can be sent count: new rows and saved rows with an id that aren't struck through.
  const remaining = formRows.filter((row) => row.isNew || (row.id !== null && !row.removed)).length
  const savedWithId = baseline.rows.filter((row) => row.id !== null).length
  const hadSaved = savedWithId > 0
  const savedByKey = new Map((rows ?? []).map((row) => [row.key, row]))
  const primaryKey = rows?.find((row) => row.primary)?.key
  const emptyAction = { label: CONTACT_MESSAGES.addEmail, onClick: addEmail, disabledReason: limitReason(isEditing ? editFull : savedFull) }

  const headerActions =
    rows && !isEditing ? (
      <>
        <Button type="button" variant="outline" size="touch" {...section.editButtonProps} onClick={rows.length === 0 ? addEmail : section.editButtonProps.onClick}>
          {SECTION_MESSAGES.edit}
        </Button>
        {savedFull ? (
          <DisabledAction reason={CONTACT_MESSAGES.emailLimit}>
            <Plus aria-hidden="true" />
            {CONTACT_MESSAGES.addEmail}
          </DisabledAction>
        ) : (
          <Button type="button" variant="outline" size="touch" onClick={addEmail}>
            <Plus aria-hidden="true" />
            {CONTACT_MESSAGES.addEmail}
          </Button>
        )}
      </>
    ) : null

  return (
    <section id="email" aria-labelledby={headingId} className="min-w-0">
      <SectionHeader id="email" title={SHELL_MESSAGES.sectionEmail} count={rows?.length} editing={isEditing} actions={headerActions} className="mb-2" />
      <StateFrame
        state={state}
        skeleton="table"
        columns={SECTION_COLUMNS.email}
        loadError={{ kind: "section", sectionId: "email" }}
        level="section"
        onRetry={() => void email.mutate()}
        attempt={attempt}
        onReady={onReady}
        // Once ready the Section container is the card (it carries the editing halo and the draft notice).
        className={rows ? "overflow-visible rounded-none border-0 bg-transparent" : undefined}
      >
        {rows && (
          <SectionContainer editing={isEditing} sectionId="email">
            {isEditing ? (
              <>
                <SectionTable<EditItem>
                  rows={formRows.map((row, index) => ({ row, index }))}
                  columns={emailEditColumns({ section, labelOptions, saved: savedByKey, primaryKey })}
                  getRowKey={({ row }) => row.key}
                  labelledBy={headingId}
                  editing
                  rowState={({ row }) => rowStateOf(row)}
                  empty={{ message: CONTACT_MESSAGES.emailsEmpty, action: emptyAction }}
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
                <SectionFooter {...section.footerProps} addRow={{ label: CONTACT_MESSAGES.addRow, onClick: addEmail, disabledReason: limitReason(editFull) }} />
              </>
            ) : (
              <SectionTable
                rows={rows}
                columns={EMAIL_READ_COLUMNS}
                getRowKey={(row) => row.key}
                labelledBy={headingId}
                empty={{ message: CONTACT_MESSAGES.emailsEmpty, action: emptyAction }}
                actions={(row) => (
                  <EmailReadActions row={row} removeReason={removeReason({ isNew: false, label: row.point.label ?? "" }, savedWithId, true)} onEdit={editRow} onRemove={removeRow} />
                )}
              />
            )}
          </SectionContainer>
        )}
      </StateFrame>
    </section>
  )
}
