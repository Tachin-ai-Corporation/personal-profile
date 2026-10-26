"use client"

import { Plus } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useWatch, type Path } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { DisabledAction } from "@/components/ui/disabled-action"
import { Input } from "@/components/ui/input"
import { InputLocked } from "@/components/ui/input-locked"
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
  mapFetchError,
  mutateMyself,
  PRIMARY_LABEL,
  saveContactPoints,
  type ContactPoint,
  type ContactPointEditRow,
  type ErrorField,
  type MappedError,
} from "@/lib/api"
import { ENVIRONMENTS, environmentConfig } from "@/lib/shared/environments"
import { safeHref } from "@/lib/shared/safe-href"
import { COMMON_MESSAGES, CONTACT_MESSAGES, SECTION_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { useContactRead } from "./use-contact-read"
import { blockAddWhileInvalid, CellField, isRepeatKey, nextNewKey, uniqueRowKeys } from "./contact-edit-kit"
import {
  isSocialFull,
  isSocialRowChanged,
  isSocialRowLocked,
  newSocialEditRow,
  SOCIAL_LINK_MAX_LENGTH,
  socialDraftDiff,
  socialEditRowOf,
  socialSchema,
  type SocialEditRow,
  type SocialValues,
} from "./social-schema"

/** The Contact Type of every row here (the list key, the add `type`). */
const SOCIAL_TYPE = "Social Media"

/** The label of every link added here, a replacement included (no labels in the UI). */
const SOCIAL_ADD_LABEL = "Personal"

/** One shown link: the row as read. */
interface SocialRow {
  /** Stable across revalidations: the id (a repeated id gets its occurrence), else the position. */
  readonly key: string
  readonly point: ContactPoint
  /** Its `value` (rows without one are never shown). */
  readonly value: string
}

/** The shown links in API order, without the rows that have no value, keyed uniquely. */
function socialRowsOf(points: readonly ContactPoint[]): SocialRow[] {
  return uniqueRowKeys(points.flatMap((point, index) => (point.value ? [{ key: point.id === null ? `none-${index}` : `id-${point.id}`, point, value: point.value }] : [])))
}

/** A repeated id's later occurrence: locked like a row without an id. */
const isRepeat = (row: SocialRow): boolean => isRepeatKey(row.key)

/** A saved link labelled Primary (legacy): the backend refuses to remove or replace it without a replacement, so it is locked. */
const isLegacyPrimary = (label: string | null): boolean => label === PRIMARY_LABEL

/** `safeHref(value, ["https:"])`, refused for a link with credentials (`https://x.com@evil.example` reads like x.com). */
function socialHref(value: string): string | undefined {
  const href = safeHref(value, ["https:"])
  if (!href) return undefined
  const url = new URL(href)
  // Portal and other 1health destinations are outside the Social new-tab exception (PA1).
  const host = url.hostname.replace(/\.$/, "")
  const firstParty = ENVIRONMENTS.some((environment) => {
    const portalHost = new URL(environmentConfig(environment).portalUrl).hostname
    const domain = portalHost.split(".").slice(-2).join(".")
    return host === domain || host.endsWith(`.${domain}`)
  })
  return url.username === "" && url.password === "" && !firstParty ? href : undefined
}

/**
 * A link as shown: an anchor opening a new tab when `socialHref` accepts it
 * (an external, non-1health site: the AD-5 exception, never through
 * `navigate()`), else plain text (a handle, a legacy non-https value, a link
 * with credentials). Long links wrap.
 */
function SocialLink({ value }: { readonly value: string }) {
  const href = socialHref(value)
  if (!href) return <span className="cell-strong text-foreground">{value}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-slot="social-link"
      className="cell-strong text-link-text inline-flex min-h-11 max-w-full items-center rounded-sm underline-offset-4 outline-none hover:underline focus-ring"
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{value}</span>
    </a>
  )
}

const [LINK] = SECTION_COLUMNS.social

/** Link (wraps); below 768 px the link is line 1 of the card, the kebab on its right. */
const socialReadColumns: SectionTableColumn<SocialRow>[] = [{ key: "link", header: LINK, mobileLine: 1, cell: (row) => <SocialLink value={row.value} /> }]

interface SocialReadActionsProps {
  readonly row: SocialRow
  readonly onEdit: (key: string) => void
  readonly onRemove: (key: string) => void
}

/**
 * A read-view row's actions, "More actions for {link}": Edit, then Remove
 * (rows with an id, not a repeat; aria-disabled with its reason on a legacy
 * Primary). No Verify or Make primary.
 */
function SocialReadActions({ row, onEdit, onRemove }: SocialReadActionsProps) {
  const removable = row.point.id !== null && !isRepeat(row)
  const reason = isLegacyPrimary(row.point.label) ? CONTACT_MESSAGES.socialPrimaryLocked : undefined
  return (
    <RowActions
      name={row.value}
      showInline={false}
      actions={[
        { id: "edit", label: SECTION_MESSAGES.edit, onSelect: () => onEdit(row.key) },
        ...(removable ? [{ id: "remove", label: COMMON_MESSAGES.remove, destructive: true, disabledReason: reason, onSelect: () => onRemove(row.key) }] : []),
      ]}
    />
  )
}

// --- Edit view --------------------------------------------------------------------------------

type SocialSectionForm = SectionForm<SocialValues>

/** A row of the edit table with its index in the form's `rows` (its field paths). */
interface EditItem {
  readonly row: SocialEditRow
  readonly index: number
}

/** The form path of a row's link (the input, or the locked value: focus only). */
const valuePath = (index: number) => `rows.${index}.value` as const
/** The row's Remove / Restore action (focus only: Restore after a read-view Remove). */
const removalPath = (index: number) => `rows.${index}.removed` as const

/** The shape of the form's rows, one letter per row: `n` new, `c` saved and changed, `s` saved and editable, `l` saved and locked. */
function rowsShape(rows: readonly SocialEditRow[]): string {
  return rows.map((row) => (row.isNew ? "n" : isSocialRowLocked(row) ? "l" : isSocialRowChanged(row) ? "c" : "s")).join("")
}

/** The links in reading order (the first one takes focus on Edit), or the first locked link when nothing is editable. */
function socialFieldOrder(shape: string): Path<SocialValues>[] {
  const order = [...shape].flatMap((kind, index): Path<SocialValues>[] => (kind === "l" ? [] : [valuePath(index)]))
  return order.length === 0 && shape.length > 0 ? [valuePath(0)] : order
}

/** A rejected link names the one changed or new row, when there is exactly one (else, and the limit, it shows at Section level). */
function socialErrorFields(shape: string): Partial<Record<ErrorField, Path<SocialValues>>> | undefined {
  const indexes = [...shape].flatMap((kind, index) => (kind === "n" || kind === "c" ? [index] : []))
  if (indexes.length !== 1) return undefined
  return { value: valuePath(indexes[0]) }
}

const rowStateOf = (row: SocialEditRow): RowEditState => (row.isNew ? "new" : row.removed ? "removed" : "saved")

/** The id of a row's edit status ("New · not saved", "Removed on save"): its Restore is described by it. */
const statusIdOf = (key: string) => `social-row-${key}-status`

interface CellProps {
  readonly section: SocialSectionForm
  readonly item: EditItem
  /** The id of the visible header naming the cell (desktop `th`, card label). */
  readonly headerId: string
}

/** An editable link: a url input named by its column header, validated on blur (read-only while struck through). */
function LinkInputCell({ section, item, headerId }: CellProps) {
  const path = valuePath(item.index)
  const error = section.errorFor(path)
  const binding = section.field(path)
  return (
    <CellField error={error}>
      {(wiring) => (
        <Input
          {...wiring}
          {...binding}
          readOnly={binding.readOnly || item.row.removed}
          type="url"
          inputMode="url"
          maxLength={SOCIAL_LINK_MAX_LENGTH}
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

/** A locked link (a legacy Primary, a row without an id, a repeated id), focusable and read-only, with why. */
function LockedLinkCell({ section, item, headerId }: CellProps) {
  const { ref } = section.control(valuePath(item.index))
  return <InputLocked ref={ref} value={item.row.value} help={CONTACT_MESSAGES.socialPrimaryLocked} aria-labelledby={headerId} />
}

/** The edit table: the link as a control (locked where it can't change), with the row's edit status beneath. */
function socialEditColumns(section: SocialSectionForm): SectionTableColumn<EditItem>[] {
  return [
    {
      key: "link",
      header: LINK,
      cell: ({ row, index }, { headerId }) => (
        <div className="flex min-w-0 flex-col gap-1.5">
          {isSocialRowLocked(row) ? (
            <LockedLinkCell section={section} item={{ row, index }} headerId={headerId} />
          ) : (
            <LinkInputCell section={section} item={{ row, index }} headerId={headerId} />
          )}
          <RowEditStatus state={rowStateOf(row)} id={statusIdOf(row.key)} />
        </div>
      ),
    },
  ]
}

/**
 * The rows `values` stands for, as the engine reads them (replace mode):
 * every saved link (with an id) as read, struck through, or with its changed
 * link (trimmed) as a "Personal" link with notifications off (the engine
 * sends it as a remove plus an add); a legacy Primary is never changed or
 * removed, and a saved link the form doesn't hold (e.g. one a stale draft
 * didn't know) is kept unchanged. Then the new rows: trimmed, Social Media,
 * "Personal", notifications off.
 */
function editedContactPoints(before: readonly ContactPoint[], rows: readonly SocialEditRow[]): ContactPointEditRow[] {
  const kept = before.map((point): ContactPointEditRow => {
    const edit = rows.find((row) => !row.isNew && row.id === point.id)
    if (!edit || isLegacyPrimary(point.label)) return point
    if (edit.removed) return { ...point, removed: true }
    const value = edit.value.trim()
    if (value === "" || value === (point.value ?? "").trim()) return point
    return { ...point, value, label: SOCIAL_ADD_LABEL, isNotificationEnabled: false }
  })
  const added = rows
    .filter((row) => row.isNew)
    .map(
      (row): ContactPointEditRow => ({
        id: null,
        name: null,
        value: row.value.trim(),
        type: SOCIAL_TYPE,
        label: SOCIAL_ADD_LABEL,
        isVerified: null,
        isNotificationEnabled: false,
        phoneNumberRegion: null,
      }),
    )
  return [...kept, ...added]
}

/** A read failure without cached data, mapped for the frame. */
const socialLoadError = (failure: unknown): MappedError | undefined => (failure === undefined ? undefined : mapFetchError("social", failure))

/**
 * Social media (Story 3.7, FR24, NG-9025): the user's links from the shared
 * key `keys.contactPoints("Social Media")`, in API order. The landmark
 * renders from the first render and is never remounted (F6-1); the header
 * and the Section index show the saved count.
 *
 * A link `safeHref(value, ["https:"])` accepts is an anchor opening a new
 * tab (`target="_blank"`, `rel="noopener noreferrer"`: the AD-5 exception for
 * an external, non-1health site, never through `navigate()`); any other
 * value (a handle, a legacy non-https value) is plain text.
 *
 * A read failure without cached data shows "Couldn't load social links" with
 * Retry, which revalidates only the Social Media key; a 403 shows the
 * Section's no-access row and a session end is left to the shell.
 *
 * Edit runs on `useSectionForm` (registered as `social`, order 4, drafts of
 * `rows`): the whole table switches to edit. Every saved link with an id is
 * an editable url input, except a legacy Primary, which is locked and can't
 * be removed (the backend refuses to remove or replace it without a
 * replacement); new rows come from "Add link", the empty-state action and
 * the footer's Add row. Remove strikes a saved row through until Save
 * (Restore undoes it) and deletes a new row; zero links is allowed. Twenty
 * links at most. Save sends the one manage POST built by
 * `contactPointsDiffToManageDTO` in replace mode (a changed link is a remove
 * plus an add), then revalidates the Social Media key and `myself`. There is
 * no verification.
 */
export function SocialSection() {
  const social = useContactRead(SOCIAL_TYPE)
  const { onReady } = useSectionFrame("social")

  const failure = social.data === undefined ? social.error : undefined
  // Each new failure (a new error object) is a new attempt, so a repeated failure is announced again
  // once it arrives. Adjusted while rendering, so the first error is not mounted twice.
  const [attempt, setAttempt] = useState(0)
  const [seen, setSeen] = useState<unknown>(failure)
  if (seen !== failure) {
    setSeen(failure)
    if (failure) setAttempt((count) => count + 1)
  }

  const rows = useMemo(() => (social.data ? socialRowsOf(social.data) : undefined), [social.data])
  const loadError = socialLoadError(failure)
  const state: FrameState = loadError ? { error: loadError } : rows ? "ready" : "loading"
  const dataStatus: SectionDataStatus = loadError ? "error" : rows ? "loaded" : "loading"
  useReportSectionCount("social", rows?.length)

  const baseline = useMemo<SocialValues>(
    () => ({ rows: (rows ?? []).map((row) => socialEditRowOf(row.key, isRepeat(row) ? { ...row.point, id: null } : row.point)) }),
    [rows],
  )
  /** The saved links the engine diffs against: the shown rows with an id, once per id, typed Social Media. */
  const savedPoints = useMemo(
    () => (rows ?? []).filter((row) => row.point.id !== null && !isRepeat(row)).map((row) => ({ ...row.point, type: SOCIAL_TYPE })),
    [rows],
  )
  const newKeys = useRef(0)

  // The form rows' shape (kept in step while rendering, below): the field order and the server error mapping.
  const [shape, setShape] = useState(() => rowsShape(baseline.rows))

  async function save(values: SocialValues): Promise<SaveResult> {
    let dto: ReturnType<typeof contactPointsDiffToManageDTO>
    try {
      dto = contactPointsDiffToManageDTO(savedPoints, editedContactPoints(savedPoints, values.rows), { valueChange: "replace" })
    } catch {
      // A refused body (a caller bug): never sent, never thrown.
      return { ok: false, error: { code: "UNEXPECTED", mapped: { kind: "generic" } } }
    }
    if (dto === null) return { ok: true }
    const result = await saveContactPoints(dto, "social")
    if (!result.ok) return result
    // Saved: a failed refetch must never make Retry send the body again (the next read catches up).
    await Promise.allSettled([social.refresh(), mutateMyself()])
    return { ok: true }
  }

  const section = useSectionForm<SocialValues>({
    id: "social",
    label: SHELL_MESSAGES.sectionSocial,
    displayOrder: 4,
    schema: socialSchema,
    baseline,
    save,
    onNoChanges: "close",
    cancelFocus: "heading",
    fieldOrder: socialFieldOrder(shape),
    // A rejected link names the one changed or new row when there is exactly one; else (and the limit) it shows at Section level.
    errorFields: socialErrorFields(shape),
    draftFields: ["rows"],
    describeDraftDiff: socialDraftDiff,
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
  const currentRows = (): SocialEditRow[] => (isEditing ? form.getValues("rows") : baseline.rows)

  /**
   * Add link (header, empty state, footer): like 1health-fe
   * (`SocialMediaWrapper` `addNew`), the new row goes at the top, and while
   * editing only once the rows already there are valid; else their errors
   * show and focus goes to the first instead. Focus moves to the new link.
   */
  function addLink(): void {
    if (isSaving) return
    const current = currentRows()
    if (isSocialFull(current)) return
    if (isEditing) {
      const invalid = blockAddWhileInvalid(section, socialSchema, socialFieldOrder(rowsShape(current)))
      if (invalid !== undefined) {
        section.startEdit({ focus: invalid })
        return
      }
      // Every row moves down one index: no error is left on a shifted path (the rows are valid, so none is lost).
      form.clearErrors("rows")
    }
    section.startEdit({ focus: valuePath(0) })
    rowsControl.onChange([newSocialEditRow(nextNewKey(current, newKeys)), ...current])
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

  /** The read-view kebab's Edit: edit view, focus on that row's link. */
  function editRow(key: string): void {
    const index = latestSaved.current.findIndex((row) => row.key === key)
    // A revalidation between the kebab press and the item run may have dropped the row.
    if (index < 0) return
    section.startEdit({ focus: valuePath(index) })
  }

  /** The read-view kebab's Remove: edit view with the row struck through, focus on its Restore. */
  function removeRow(key: string): void {
    const saved = latestSaved.current
    const index = saved.findIndex((row) => row.key === key)
    if (index < 0 || isSocialRowLocked(saved[index])) return
    section.startEdit({ focus: removalPath(index) })
    rowsControl.onChange(saved.map((row) => (row.key === key ? { ...row, removed: true } : row)))
  }

  const headingId = sectionHeadingId("social")
  const savedFull = isSocialFull(baseline.rows)
  const editFull = isSocialFull(formRows)
  const limitReason = (full: boolean) => (full ? CONTACT_MESSAGES.socialLimit : undefined)
  const emptyAction = { label: CONTACT_MESSAGES.addLink, onClick: addLink, disabledReason: limitReason(isEditing ? editFull : savedFull) }

  const headerActions =
    rows && !isEditing ? (
      <>
        <Button type="button" variant="outline" size="touch" {...section.editButtonProps} onClick={rows.length === 0 ? addLink : section.editButtonProps.onClick}>
          {SECTION_MESSAGES.edit}
        </Button>
        {savedFull ? (
          <DisabledAction reason={CONTACT_MESSAGES.socialLimit}>
            <Plus aria-hidden="true" />
            {CONTACT_MESSAGES.addLink}
          </DisabledAction>
        ) : (
          <Button type="button" variant="outline" size="touch" onClick={addLink}>
            <Plus aria-hidden="true" />
            {CONTACT_MESSAGES.addLink}
          </Button>
        )}
      </>
    ) : null

  return (
    <section id="social" aria-labelledby={headingId} className="min-w-0">
      <SectionHeader id="social" title={SHELL_MESSAGES.sectionSocial} count={rows?.length} editing={isEditing} actions={headerActions} className="mb-2" />
      <StateFrame
        state={state}
        skeleton="table"
        columns={SECTION_COLUMNS.social}
        loadError={{ kind: "section", sectionId: "social" }}
        level="section"
        onRetry={() => void social.refresh(false)}
        attempt={attempt}
        onReady={onReady}
        // Once ready the Section container is the card (it carries the editing halo and the draft notice).
        className={rows ? "overflow-visible rounded-none border-0 bg-transparent" : undefined}
      >
        {rows && (
          <SectionContainer editing={isEditing} sectionId="social">
            {isEditing ? (
              <>
                <SectionTable<EditItem>
                  rows={formRows.map((row, index) => ({ row, index }))}
                  columns={socialEditColumns(section)}
                  getRowKey={({ row }) => row.key}
                  labelledBy={headingId}
                  editing
                  rowState={({ row }) => rowStateOf(row)}
                  empty={{ message: CONTACT_MESSAGES.socialEmpty, action: emptyAction }}
                  actions={({ row, index }) => {
                    // A saved row without an id (or a repeated id) can't be removed (nothing to send).
                    if (!row.isNew && row.id === null) return null
                    const { ref: removalRef } = section.control(removalPath(index))
                    return (
                      <RowRemoval
                        ref={removalRef}
                        state={rowStateOf(row)}
                        statusId={statusIdOf(row.key)}
                        disabledReason={!row.removed && isSocialRowLocked(row) ? CONTACT_MESSAGES.socialPrimaryLocked : undefined}
                        onRemove={() => setRemoved(row.key, true)}
                        onRestore={() => setRemoved(row.key, false)}
                      />
                    )
                  }}
                />
                <SectionFooter {...section.footerProps} addRow={{ label: CONTACT_MESSAGES.addRow, onClick: addLink, disabledReason: limitReason(editFull) }} />
              </>
            ) : (
              <SectionTable
                rows={rows}
                columns={socialReadColumns}
                getRowKey={(row) => row.key}
                labelledBy={headingId}
                actionsWidth="w-20"
                empty={{ message: CONTACT_MESSAGES.socialEmpty, action: emptyAction }}
                actions={(row) => <SocialReadActions row={row} onEdit={editRow} onRemove={removeRow} />}
              />
            )}
          </SectionContainer>
        )}
      </StateFrame>
    </section>
  )
}
