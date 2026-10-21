"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useRef, useState, type Ref } from "react"
import {
  useForm,
  useWatch,
  type DefaultValues,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormRegisterReturn,
  type UseFormReturn,
} from "react-hook-form"
import type { z } from "zod"
import type { ErrorField } from "@/lib/api"
import { deepEqual } from "@/lib/shared/deep-equal"
import { formatMessage, messageFor, SECTION_MESSAGES } from "@/lib/shared/messages"
import { telemetry } from "@/lib/shared/telemetry"
import {
  SESSION_EXPIRED_CODE,
  CANCELLED_CODE,
  sectionHeadingId,
  type DraftDiffRow,
  type DraftValues,
  type SaveError,
  type SaveResult,
  type SectionDataStatus,
  type SectionId,
} from "./nav-types"
import type { SectionFooterError, SectionFooterProps } from "./section-footer"
import { useRegisterSection, useSectionRegistry } from "./section-registry"
import { toastError, toastSuccess, type ShownToast } from "./toasts"

export type SectionMode = "read" | "edit" | "saving"

export interface UseSectionFormOptions<T extends FieldValues> {
  readonly id: SectionId
  /** The Section label (catalog copy), e.g. "Phone": toasts, errors and Save all name it. */
  readonly label: string
  readonly displayOrder: number
  /** The Section's zod 4 schema (its own `schema.ts`; messages are catalog strings). */
  readonly schema: z.ZodType<T, T>
  /**
   * The server values the form edits. A new (deep-unequal) baseline resets
   * the read view, or rebases the edit view keeping the user's edits.
   */
  readonly baseline: T
  /**
   * Sends the change (usually with `runSaveSteps`); `baseline` is the one the
   * edit is diffed against. A throw counts as `UNEXPECTED`.
   */
  readonly save: (values: T, baseline: T) => Promise<SaveResult>
  /** `false` for a guard-only participant (never counted or saved by Save all). */
  readonly saveAll?: false
  /** Save with nothing changed: `close` returns to read view (2.2), `status` says "There are no changes" (7.5). */
  readonly onNoChanges?: "close" | "status"
  /** The Section's own success toast; defaults to "{label} saved.", `false` for none. */
  readonly successToast?: string | false
  /** Where Cancel moves focus: the Section `h2` (Profile Sections, 1.11) or its "Edit" button (7.5). */
  readonly cancelFocus?: "heading" | "edit"
  /** The fields in reading order (first-invalid focus, "Edit" focus); defaults to the baseline's keys. */
  readonly fieldOrder?: readonly Path<T>[]
  /** Maps a server `field` error (`mapApiError`) to a form field; a field named like the error field maps by default. */
  readonly errorFields?: Partial<Record<ErrorField, Path<T>>>
  /** The Section-level error copy for a failure; `undefined` falls back to the generic / network copy. */
  readonly describeError?: (error: SaveError) => string | undefined
  /**
   * F4 drafts: the fields a draft may hold (never SSN, Signature, codes, NPI
   * selections, username, password). A draft is written only after a user
   * change (typing, or a `Controller` / `field()` change): values the Section
   * presets with `form.setValue` never count.
   */
  readonly draftFields?: readonly (keyof T & string)[]
  /**
   * Synchronously transforms restored values against the current baseline.
   * Treat both inputs as immutable: they are passed directly, without cloning.
   * `null` defers restoration without changing the form or draft offer.
   * The returned object supplies replacements, rather than merging with the
   * incoming draft. Only declared draft fields are applied; omitted fields keep
   * their form values (the baseline when entering edit from read view).
   * `{}` accepts restoration without applying fields. An accepted result that
   * leaves the form clean immediately resolves the stored draft through the
   * `discarded` lifecycle event.
   */
  readonly transformDraft?: (values: DraftValues, baseline: T) => DraftValues | null
  /** F4 drafts: the Section's server data; a stored draft is offered only once `loaded` (the default). */
  readonly dataStatus?: SectionDataStatus
  /** F4 drafts: the changed fields between a draft and the current server values. */
  readonly describeDraftDiff?: (draft: DraftValues, current: DraftValues) => readonly DraftDiffRow[]
  /**
   * F6-1 (Story 4.2): makes a field that has no mounted control visible (e.g.
   * expands its collapsed address row) and returns `true` when it will be
   * mounted on the next render. Called with a field path (`rows.2.city`)
   * before the hook focuses it: the first invalid field (own Save, Save all,
   * leave guard), a server field error and `startEdit({ focus })`.
   */
  readonly revealField?: (path: string) => boolean
  /**
   * F6-1 (Story 2.4 "Remove your signature?"): asked after validation, before
   * anything is sent and before the saving state, on the own Save and the
   * registered save (Save all, leave guard). Resolving `false` makes the save
   * `CANCELLED`: the Section stays in edit, no error, no focus move, no telemetry.
   */
  readonly confirmBeforeSave?: (values: T) => Promise<boolean>
}

/** `startEdit` options. */
export interface StartEditOptions<T extends FieldValues> {
  /** The field (or row field) to focus instead of the first in `fieldOrder` (e.g. a row's kebab "Edit", Story 4.2). */
  readonly focus?: Path<T>
}

/**
 * `control(name)`: the wiring of a non-native control (Select, DateInput,
 * Combobox), which `field()`'s `register` can't drive: the value, a user
 * `onChange(value)` (counts as a change for drafts), `onBlur` (validates in
 * `onBlur` mode), and a `ref` that registers the element for focus (first
 * invalid field, mapped errors, `startEdit({ focus })`). RHF never holds the
 * element, so it never writes a raw value into it. Destructure the ref
 * (`const { ref: raceRef, ...race } = section.control("race")`): the React
 * compiler lint treats an object whose `.ref` reaches JSX as a ref.
 */
export interface SectionControl<V> {
  readonly name: string
  readonly value: V
  readonly onChange: (value: V) => void
  readonly onBlur: () => void
  readonly ref: (element: HTMLElement | null) => void
  /** `true` while saving (controls are never `disabled`). */
  readonly readOnly: boolean
}

/** The footer wiring, spread onto `SectionFooter` (the ref lets the hook focus the Section error). */
export type SectionFooterBindings = Omit<SectionFooterProps, "addRow" | "className"> & { readonly ref: Ref<HTMLDivElement> }

export interface SectionForm<T extends FieldValues> {
  readonly form: UseFormReturn<T, unknown, T>
  readonly mode: SectionMode
  /** Edit or saving. */
  readonly isEditing: boolean
  readonly isSaving: boolean
  /** The values deep-differ from the baseline (never in read view). */
  readonly isDirty: boolean
  /** The baseline the edit is diffed against (the read view's values). */
  readonly baseline: T
  /** Read → edit; focus moves to `focus` (revealed first if hidden) or else the first field in `fieldOrder`. */
  readonly startEdit: (options?: StartEditOptions<T>) => void
  /** Reverts only this Section to its baseline (no confirm) and returns to read view. */
  readonly cancel: () => void
  /** The Section's own Save: validates first (nothing sent if invalid), then saves once. */
  readonly submit: () => Promise<void>
  /** Resets the baseline to fresh server data, keeping the fields the user changed. */
  readonly rebase: (next: T) => void
  /** `register(name)` plus `readOnly` while saving (inputs are never `disabled`). */
  readonly field: <N extends Path<T>>(name: N) => UseFormRegisterReturn<N> & { readonly readOnly: boolean }
  /** The wiring of a non-native control (Select, DateInput, Combobox); see `SectionControl`. */
  readonly control: <N extends Path<T>>(name: N) => SectionControl<PathValue<T, N>>
  /** The field's error message (catalog copy), if any. */
  readonly errorFor: (name: Path<T>) => string | undefined
  /** Spread onto the read view's "Edit" button (its id is the `edit` cancel-focus target). */
  readonly editButtonProps: { readonly id: string; readonly onClick: () => void }
  readonly footerProps: SectionFooterBindings
}

/** `firstInvalid`: focus the first invalid field again after `revealField` mounted hidden ones. */
type FocusTarget = "heading" | "edit" | "error" | "firstInvalid" | { readonly field: string; readonly revealed?: boolean }

const UNEXPECTED: SaveResult = { ok: false, error: { code: "UNEXPECTED", mapped: { kind: "generic" } } }
const CANCELLED: SaveResult = { ok: false, error: { code: CANCELLED_CODE } }

/** One schema issue: its dotted path (e.g. `phones.1.value`, `""` for a root refine) and message. */
interface ErrorLeaf {
  readonly path: string
  readonly message: string | undefined
}

function pick(values: FieldValues, keys: readonly string[]): DraftValues {
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]]))
}

/**
 * The Section edit model (Stories 1.11, 1.12; F3-2): read / edit / saving
 * modes on react-hook-form + zod (`mode: "onBlur"`), dirty = deep inequality
 * with the baseline, registration with the page's Section registry, focus
 * rules, `section_save` telemetry, and the Section's own success toast.
 *
 * The registered `save()` (leave guard, Save all) shows the saving state,
 * field and Section errors and fires telemetry, but never toasts or moves
 * focus: the runner owns the summary. There is no `<form>`: Enter in an
 * input never submits and Escape never cancels.
 */
export function useSectionForm<T extends FieldValues>(options: UseSectionFormOptions<T>): SectionForm<T> {
  const {
    id,
    label,
    displayOrder,
    schema,
    save,
    saveAll,
    onNoChanges = "close",
    successToast,
    cancelFocus = "heading",
    errorFields,
    describeError,
    draftFields,
    transformDraft,
    describeDraftDiff,
    dataStatus,
    revealField,
    confirmBeforeSave,
  } = options
  const registry = useSectionRegistry()

  const form = useForm<T, unknown, T>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: options.baseline as DefaultValues<T>,
    shouldFocusError: false,
  })
  const [mode, setMode] = useState<SectionMode>("read")
  // The baseline is the server data, except right after a save or an explicit rebase, until the server data changes.
  const [override, setOverride] = useState<{ readonly value: T } | null>(null)
  const [seenBaseline, setSeenBaseline] = useState<T>(options.baseline)
  if (!deepEqual(seenBaseline, options.baseline)) {
    // New server data always wins over a saved or rebased value (no stale override on A → B → A).
    setSeenBaseline(options.baseline)
    setOverride(null)
  }
  const baseline = override?.value ?? options.baseline
  const [status, setStatus] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<SectionFooterError | null>(null)
  const [, setFocusTick] = useState(0)
  /**
   * F4: the form values just before the user's first change in this edit
   * (preset values included); `null` while the user changed nothing.
   */
  const [presetBase, setPresetBase] = useState<FieldValues | null>(null)
  /** The latest values seen by the form subscription (read only in its callback). */
  const lastValues = useRef<FieldValues>(options.baseline)
  /** The baseline the form values were last reset to (merges keep the edits made since). */
  const synced = useRef<T>(options.baseline)
  const busy = useRef(false)
  const inFlight = useRef<Promise<SaveResult> | null>(null)
  const errorToast = useRef<ShownToast | null>(null)
  const failures = useRef(0)
  const focusTarget = useRef<FocusTarget | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  /** The mounted controls registered through `field()`, focused synchronously (RHF's `setFocus` defers). */
  const controls = useRef(new Map<string, HTMLElement>())
  const editButtonId = `${id}-edit`
  const saveButtonId = `${id}-save`
  const fieldOrder: readonly string[] = options.fieldOrder ?? Object.keys(options.baseline)

  // Re-renders on every value change, so dirty state is always current.
  const watched = useWatch({ control: form.control })
  const isEditing = mode !== "read"
  /** The one dirty predicate (footer, registry, no-changes Save): deep inequality with the baseline. */
  const differsFromBaseline = (values: FieldValues): boolean => !deepEqual({ ...baseline, ...values }, baseline)
  const isDirty = isEditing && differsFromBaseline(watched)
  // Clean again: the next user change starts over (a later preset alone never counts).
  if (presetBase !== null && !isDirty) setPresetBase(null)
  /** F4: the values differ from what they were before the user's first change (so presets alone, or reverted edits, don't count). */
  const userChanged = isDirty && presetBase !== null && !deepEqual({ ...presetBase, ...watched }, presetBase)

  // A change event from a registered input or a Controller is the user's; `setValue` presets are not.
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ type, values }) => {
          const before = lastValues.current
          if (type === "change") setPresetBase((previous) => previous ?? before)
          lastValues.current = { ...values }
        },
      }),
    [form],
  )

  function requestFocus(target: FocusTarget): void {
    focusTarget.current = target
    setFocusTick((tick) => tick + 1)
  }

  useEffect(() => {
    const target = focusTarget.current
    focusTarget.current = null
    if (target === null) return
    if (target === "heading") document.getElementById(sectionHeadingId(id))?.focus()
    else if (target === "edit") document.getElementById(editButtonId)?.focus()
    else if (target === "error") errorRef.current?.focus()
    // Hidden fields were revealed last render: they are mounted now; no second reveal, no second Section error.
    else if (target === "firstInvalid") invalidState(false).focusFirst(true)
    else focusField(target.field, target.revealed === true)
  })

  // A new baseline (server data, or a rebase): the read view shows it; an edit keeps the fields the user changed.
  useEffect(() => {
    const previous = synced.current
    if (deepEqual(previous, baseline)) return
    synced.current = baseline
    if (mode === "read") {
      form.reset(baseline)
      return
    }
    const current = form.getValues()
    const merged: FieldValues = { ...baseline }
    for (const key of Object.keys(baseline)) {
      if (Object.hasOwn(current, key) && !deepEqual(current[key], previous[key])) merged[key] = current[key]
    }
    form.reset(merged as T, { keepErrors: true, keepIsSubmitted: true, keepTouched: true })
  }, [baseline, mode, form])

  /** Makes `next` the baseline until the server data changes. */
  function rebase(next: T): void {
    setOverride(deepEqual(next, options.baseline) ? null : { value: next })
  }

  /** Focuses a field; an unmounted one is first revealed (`revealField`) and focused after the next render. */
  function focusField(name: string, revealed: boolean): void {
    const control = controls.current.get(name)
    if (control) control.focus()
    else if (!revealed && revealField?.(name)) requestFocus({ field: name, revealed: true })
    else form.setFocus(name as Path<T>)
  }

  /** The registered control an error path belongs to: the exact name, else the first (in page order) under `path.`. */
  function controlFor(path: string): HTMLElement | undefined {
    const exact = controls.current.get(path)
    if (exact) return exact
    if (path === "") return undefined
    return [...controls.current.entries()]
      .filter(([name]) => name.startsWith(`${path}.`))
      .map(([, element]) => element)
      .toSorted((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0]
  }

  /**
   * The current errors: how many fields to fix, and how to focus the first
   * (in page order). An error with no registered control is first offered
   * to `revealField` (a collapsed row, F6-1): when anything is revealed,
   * focus waits a render and then goes to the first invalid field in page
   * order. An error nothing can show (a schema refine, a root path) shows as
   * the Section error instead. `allowReveal: false` is that second pass.
   */
  function invalidState(allowReveal = true): { readonly count: number; readonly focusFirst: (withUi: boolean) => void } {
    // From the schema itself: RHF's `formState` is a render snapshot, and `trigger()` keeps only mounted fields' errors.
    const parsed = schema.safeParse(form.getValues())
    const leaves: ErrorLeaf[] = parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }))
    const located = leaves
      .map((leaf) => ({ leaf, control: controlFor(leaf.path) }))
      .filter((entry): entry is { leaf: ErrorLeaf; control: HTMLElement } => entry.control !== undefined)
      .toSorted((a, b) => (a.control.compareDocumentPosition(b.control) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    const hidden = leaves.filter((leaf) => controlFor(leaf.path) === undefined)
    return {
      count: Math.max(1, leaves.length),
      focusFirst: (withUi) => {
        const revealing = allowReveal && revealField ? hidden.filter((leaf) => revealField(leaf.path)) : []
        // The first pass already showed the Section error for what stayed hidden; the second pass
        // shows it only when the reveal mounted nothing to focus (so focus never gets lost).
        const unlocated = allowReveal || !located[0] ? hidden.find((leaf) => !revealing.includes(leaf)) : undefined
        if (revealing.length > 0) {
          if (unlocated) showSectionError(unlocated.message ?? formatMessage(SECTION_MESSAGES.saveFailed, { section: label.toLowerCase() }), withUi, false)
          requestFocus("firstInvalid")
          return
        }
        if (unlocated) {
          showSectionError(unlocated.message ?? formatMessage(SECTION_MESSAGES.saveFailed, { section: label.toLowerCase() }), withUi, false)
          if (!located[0]) {
            requestFocus("error")
            return
          }
        }
        located[0]?.control.focus()
      },
    }
  }

  function clearMessages(): void {
    setStatus(null)
    setSaveError(null)
  }

  function dismissErrorToast(): void {
    errorToast.current?.dismiss()
    errorToast.current = null
  }

  /** Read → edit with the baseline's values and no messages. */
  function enterEdit(): void {
    synced.current = baseline
    form.reset(baseline)
    clearMessages()
    setPresetBase(null)
    setMode("edit")
  }

  function toRead(): void {
    synced.current = baseline
    form.reset(baseline)
    clearMessages()
    dismissErrorToast()
    setPresetBase(null)
    setMode("read")
  }

  function startEdit(startOptions?: StartEditOptions<T>): void {
    if (mode === "read") enterEdit()
    const target = startOptions?.focus ?? fieldOrder[0]
    if (target !== undefined) requestFocus({ field: target })
  }

  function cancel(): void {
    if (busy.current) return
    const wasDirty = isDirty
    toRead()
    // Only a dirty Section's Cancel discards a draft (a stored one may still be on offer).
    if (wasDirty) registry.report({ type: "discarded", id })
    requestFocus(cancelFocus)
  }

  /**
   * Retry: focus first moves to Save (the banner unmounts while saving, so
   * focus never drops to `<body>`), then the latest render's submit runs, so
   * it diffs against the rebased baseline.
   */
  function retry(): void {
    document.getElementById(saveButtonId)?.focus()
    void latestSubmit.current()
  }

  function showSectionError(message: string, withUi: boolean, toast: boolean): void {
    failures.current += 1
    setSaveError({ message, onRetry: retry, announceKey: failures.current })
    if (!withUi) return
    requestFocus("error")
    if (toast) {
      dismissErrorToast()
      errorToast.current = toastError(message, { onRetry: retry })
    }
  }

  function showFailure(error: SaveError, withUi: boolean): void {
    const mapped = error.mapped
    if (error.code === SESSION_EXPIRED_CODE || mapped?.kind === "session") return
    if (mapped?.kind === "field") {
      const target = errorFields?.[mapped.field] ?? (fieldOrder.includes(mapped.field) ? mapped.field : undefined)
      if (target !== undefined) {
        form.setError(target as Path<T>, { type: "server", message: messageFor(mapped.messageKey) })
        if (withUi) requestFocus({ field: target })
        return
      }
    }
    const section = label.toLowerCase()
    const fallback =
      mapped?.kind === "field"
        ? messageFor(mapped.messageKey)
        : formatMessage(mapped?.kind === "network" ? SECTION_MESSAGES.networkFailure : SECTION_MESSAGES.saveFailed, { section })
    showSectionError(describeError?.(error) ?? fallback, withUi, mapped?.kind === "network")
  }

  /**
   * Sends the values once; `withUi` (the Section's own Save) adds the toast
   * and focus moves. While a send is in flight, every caller gets that one.
   */
  function send(values: T, withUi: boolean): Promise<SaveResult> {
    if (inFlight.current) return inFlight.current
    const promise = confirmThenSend(values, withUi).finally(() => {
      inFlight.current = null
    })
    inFlight.current = promise
    return promise
  }

  /**
   * `confirmBeforeSave` first (F6-1 review M1): awaited in edit mode, before
   * the saving state; `false` (or a rejection) is `CANCELLED`, which changes
   * nothing on screen.
   */
  async function confirmThenSend(values: T, withUi: boolean): Promise<SaveResult> {
    if (confirmBeforeSave) {
      let confirmed = false
      try {
        confirmed = await confirmBeforeSave(values)
      } catch {
        confirmed = false
      }
      if (!confirmed) return CANCELLED
    }
    return sendOnce(values, withUi)
  }

  async function sendOnce(values: T, withUi: boolean): Promise<SaveResult> {
    setMode("saving")
    clearMessages()
    let result: SaveResult
    try {
      result = await save(values, baseline)
    } catch {
      result = UNEXPECTED
    }
    // The user declined a step (F6-1, Story 2.4): back to edit as it was, no error, no focus move, no telemetry.
    const code = result.ok ? null : (result.error.code ?? "GENERIC")
    if (code === CANCELLED_CODE) {
      setMode("edit")
      return result
    }
    telemetry.track("section_save", { sectionId: id, ok: result.ok, code })
    if (result.ok) {
      synced.current = values
      form.reset(values)
      rebase(values)
      dismissErrorToast()
      setPresetBase(null)
      setMode("read")
      // The Section's own Save; the registered save() is reported by the registry.
      if (withUi) registry.report({ type: "saved", id })
      if (withUi) {
        requestFocus("heading")
        const text = successToast ?? formatMessage(SECTION_MESSAGES.saved, { section: label })
        if (text !== false) toastSuccess(text)
      }
    } else {
      setMode("edit")
      showFailure(result.error, withUi)
    }
    return result
  }

  async function submit(): Promise<void> {
    if (busy.current || mode === "read") return
    busy.current = true
    try {
      if (!differsFromBaseline(form.getValues())) {
        if (onNoChanges === "status") {
          setSaveError(null)
          setStatus(SECTION_MESSAGES.noChanges)
        } else {
          toRead()
          requestFocus(cancelFocus)
        }
        return
      }
      await form.handleSubmit(
        (values) => send(values, true),
        () => invalidState().focusFirst(true),
      )()
    } finally {
      busy.current = false
    }
  }

  const latestSubmit = useRef(submit)
  useEffect(() => {
    latestSubmit.current = submit
  })

  /** Re-check the current edit after batch validation; a later edit may have become invalid. */
  function registeredSave(): Promise<SaveResult> {
    if (inFlight.current) return inFlight.current
    const raw = form.getValues()
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        form.setError(issue.path.map(String).join(".") as Path<T>, { type: "schema", message: issue.message })
      }
      invalidState().focusFirst(false)
      return Promise.resolve({ ok: false, error: { code: "GENERIC" } })
    }
    return send(parsed.data, false)
  }

  useRegisterSection({
    id,
    label,
    displayOrder,
    isDirty,
    saveAll,
    validate: async () => {
      if (await form.trigger()) return { valid: true }
      const invalid = invalidState()
      return { valid: false, invalidCount: invalid.count, focusFirstInvalid: () => invalid.focusFirst(true) }
    },
    save: registeredSave,
    discard: toRead,
    draftFields,
    userChanged,
    dataStatus,
    getDraftValues: draftFields ? () => pick(form.getValues(), draftFields) : undefined,
    getDraftBase: draftFields ? () => pick(baseline, draftFields) : undefined,
    applyDraft: draftFields
      ? (values) => {
          if (mode === "saving") return false
          const restored = transformDraft ? transformDraft(values, baseline) : values
          if (restored === null) return false
          if (mode === "read") enterEdit()
          // A restored draft is the user's own change, against the values before it: it is written again (with the current base).
          const before = form.getValues()
          setPresetBase({ ...before })
          for (const key of draftFields) {
            if (Object.hasOwn(restored, key)) {
              form.setValue(key as Path<T>, restored[key] as PathValue<T, Path<T>>, { shouldValidate: true, shouldDirty: true })
            }
          }
          // Mapping can discard every outdated choice. Resolve that draft now:
          // a clean Save or Cancel has no dirty lifecycle event to remove it.
          if (transformDraft && !differsFromBaseline(form.getValues())) registry.report({ type: "discarded", id })
          return true
        }
      : undefined,
    describeDraftDiff,
  })

  const isSaving = mode === "saving"
  return {
    form,
    mode,
    isEditing,
    isSaving,
    isDirty,
    baseline,
    startEdit,
    cancel,
    submit,
    rebase,
    field: (name) => {
      const registered = form.register(name)
      return {
        ...registered,
        ref: (element: HTMLElement | null) => {
          if (element) controls.current.set(name, element)
          else controls.current.delete(name)
          registered.ref(element)
        },
        readOnly: isSaving,
      }
    },
    control: (name) => {
      form.register(name)
      return {
        name,
        value: form.getValues(name),
        // The same synthetic events `useController` sends: a `change` is the user's (drafts), a `blur` validates.
        onChange: (value) => void form.register(name).onChange({ target: { name, value }, type: "change" }),
        onBlur: () => void form.register(name).onBlur({ target: { name, value: form.getValues(name) }, type: "blur" }),
        ref: (element) => {
          if (element) controls.current.set(name, element)
          else controls.current.delete(name)
        },
        readOnly: isSaving,
      }
    },
    errorFor: (name) => form.getFieldState(name, form.formState).error?.message,
    editButtonProps: { id: editButtonId, onClick: () => startEdit() },
    footerProps: {
      ref: errorRef,
      dirty: isDirty,
      saving: isSaving,
      // A change after "There are no changes" makes the status stale.
      status: isDirty ? null : status,
      error: saveError,
      saveButtonId,
      onCancel: cancel,
      onSave: () => void submit(),
    },
  }
}
