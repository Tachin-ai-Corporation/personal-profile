"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useRef, useState, type RefObject } from "react"
import { useForm, useWatch, type Resolver, type UseFormReturn } from "react-hook-form"
import useSWR from "swr"
import { requestLeave, toastError, toastPartial, toastSuccess, useMyself, type SaveResult, type ValidateResult } from "@/features/shell"
import {
  INSURANCE_CARD_SIDES,
  INSURANCE_TYPE_KEY,
  insuranceSavedPolicyId,
  insuranceValueOptions,
  keys,
  mapApiError,
  mappedErrorCode,
  saveInsuranceCreate,
  saveInsuranceUpdate,
  type ApiResponseError,
  type ErrorField,
  type InsuranceCardSide,
  type InsurancePolicy,
  type InsuranceSubscriber,
  type MappedError,
  type TypeInfo,
} from "@/lib/api"
import { deepEqual } from "@/lib/shared/deep-equal"
import { formatMessage, INSURANCE_MESSAGES, messageFor, SECTION_MESSAGES, SHELL_MESSAGES, STATE_MESSAGES } from "@/lib/shared/messages"
import { telemetry } from "@/lib/shared/telemetry"
import { checkInsuranceCardFile, type InsuranceCardImage } from "./card-file"
import { insurancePartialToast, uploadInsuranceCardImage, type InsuranceCardResult } from "./card-upload"
import { EMPTY_INSURANCE_FORM, insuranceLockedSubscriber, toInsuranceFormValues, toInsurancePolicyInput } from "./dto"
import { INSURANCE_FIELD_ORDER, insuranceSchema, needsSubscriber, type InsuranceFormField, type InsuranceFormValues, type InsuranceSchemaContext } from "./schema"

/** A server error mapped to a form field (`lib/api/errors/insurance.ts` `Field`); `policy` shows at drawer level. */
const SERVER_FIELDS: Partial<Record<ErrorField, InsuranceFormField>> = {
  insurer: "insurer",
  type: "type",
  precedence: "precedence",
  relationship: "relationship",
  memberId: "memberId",
  groupId: "groupId",
  effective: "effectiveDate",
  expiration: "expirationDate",
  cancellation: "cancellationDate",
  subscriberFirstName: "subscriberFirstName",
  subscriberLastName: "subscriberLastName",
  subscriberEmail: "subscriberEmail",
  subscriberPhone: "subscriberPhone",
  subscriberBirthDate: "subscriberBirthDate",
}

/** The subscriber's fields: on Edit they are never typed (locked, decision 2C, or absent, decision 3A). */
const SUBSCRIBER_FIELDS: ReadonlySet<InsuranceFormField> = new Set<InsuranceFormField>([
  "subscriberFirstName",
  "subscriberLastName",
  "subscriberEmail",
  "subscriberPhone",
  "subscriberBirthDate",
])

/** The drawer-level error (anything no field holds), with Retry unless retrying can't help. */
export interface InsuranceDrawerError {
  readonly message: string
  readonly retry: boolean
  /** A new error (even with the same text) is announced again. */
  readonly key: number
}

/** The type key's value lists (Type, Precedence, Relationship) and their read state. */
export interface InsuranceOptions {
  readonly state: "loading" | "ready" | "error"
  readonly type: readonly string[]
  readonly precedence: readonly string[]
  readonly relationship: readonly string[]
  readonly retry: () => void
}

/** A card image chosen in the editor (Story 5.3): checked and re-encoded, with its preview's object URL. */
export interface InsuranceChosenImage extends InsuranceCardImage {
  /** An object URL of the re-encoded image (revoked when the choice goes). */
  readonly previewUrl: string
}

/** One value per card side. */
export type InsuranceBySide<T> = Readonly<Record<InsuranceCardSide, T>>

const NO_IMAGES: InsuranceBySide<InsuranceChosenImage | null> = { front: null, back: null }
const NO_IMAGE_ERRORS: InsuranceBySide<string | null> = { front: null, back: null }
const NOT_CHECKING: InsuranceBySide<boolean> = { front: false, back: false }

interface EditorSession {
  readonly open: boolean
  /** The policy being edited; `null` for Add. Kept after close (the drawer animates out with it). */
  readonly policy: InsurancePolicy | null
  /** The values the form opened with (the dirty baseline). */
  readonly opening: InsuranceFormValues
  /** Remounts the drawer body on every open (its local text state starts over). */
  readonly session: number
  /** "Today" for the subscriber's age and the birth date calendar, fixed per open. */
  readonly today: Date
}

export interface InsuranceEditor {
  readonly open: boolean
  readonly mode: "add" | "edit"
  readonly policy: InsurancePolicy | null
  readonly session: number
  readonly today: Date
  readonly form: UseFormReturn<InsuranceFormValues, unknown, InsuranceFormValues>
  /** The form differs from the values it opened with (only while open). */
  readonly isDirty: boolean
  readonly saving: boolean
  /** The saved non-Self subscriber of an Edit (decision 2C): read-only, sent back unchanged. */
  readonly locked: InsuranceSubscriber | null
  readonly drawerError: InsuranceDrawerError | null
  readonly options: InsuranceOptions
  /** The card images chosen in this session of the drawer (Story 5.3); they upload after the policy saves. */
  readonly images: InsuranceBySide<InsuranceChosenImage | null>
  /** A rejected file's inline error per side (the slot keeps its previous state). */
  readonly imageErrors: InsuranceBySide<string | null>
  /** A chosen file is being checked and re-encoded. */
  readonly imageChecking: InsuranceBySide<boolean>
  /** Checks, then keeps (or refuses with an inline error) a file chosen for a side. */
  readonly chooseImage: (side: InsuranceCardSide, file: File) => void
  /** Clears a side's unsaved choice only. */
  readonly removeImage: (side: InsuranceCardSide) => void
  readonly openAdd: () => void
  readonly openEdit: (policy: InsurancePolicy) => void
  /** Every close path (close, Back, Escape, scrim, Cancel): the scoped leave guard first. */
  readonly requestClose: () => void
  /** The drawer's own Save: validate (focus the first invalid field), then send once. */
  readonly submit: () => Promise<void>
  /** Retry of the drawer-level error: focus moves to Save first (the banner unmounts while saving). */
  readonly retry: () => void
  // The leave guard's registration (`useRegisterSection("insurance")`).
  readonly validate: () => Promise<ValidateResult>
  readonly save: () => Promise<SaveResult>
  readonly discard: () => void
  /** Registers a slot's first button (Choose / Replace) for focus; pass the result as its `ref`. */
  readonly registerImageAction: (side: InsuranceCardSide) => (element: HTMLElement | null) => void
  /** Registers a field's control for focus (first invalid field, server errors); pass the result as its `ref`. */
  readonly registerControl: (name: InsuranceFormField) => (element: HTMLElement | null) => void
  /** The Sheet's `onCloseAutoFocus`: focus back on the trigger, or on "Add insurance" when it is gone. */
  readonly onCloseAutoFocus: (event: Event) => void
}

/**
 * The elements the editor focuses, kept apart from `InsuranceEditor` (the
 * React compiler lint treats an object that carries refs as a ref, so its
 * other values couldn't be read while rendering).
 */
export interface InsuranceEditorRefs {
  /** The drawer-level save error. */
  readonly banner: RefObject<HTMLDivElement | null>
  /** The value lists' load error (Save is blocked until they load). */
  readonly optionsBanner: RefObject<HTMLDivElement | null>
  readonly saveButton: RefObject<HTMLButtonElement | null>
  /** The header's "Add insurance": focus lands there when the trigger is gone (e.g. the empty card after an add). */
  readonly addButton: RefObject<HTMLButtonElement | null>
  /** The policyholder reason of a non-Self Edit without a saved subscriber (decision 3A): Save focuses it. */
  readonly policyholder: RefObject<HTMLParagraphElement | null>
}

const CLOSED: EditorSession = { open: false, policy: null, opening: EMPTY_INSURANCE_FORM, session: 0, today: new Date(0) }

const UNEXPECTED: SaveResult = { ok: false, error: { code: "UNEXPECTED", mapped: { kind: "generic" } } }

/**
 * The Insurance editor's state (Story 5.2), lifted into `InsuranceSection` so
 * its one `useRegisterSection("insurance")` call can guard it: the drawer's
 * open state and policy, the react-hook-form form (zod, on blur and Save),
 * the type key's value lists, the save (one `POST` or `PUT`, then the card
 * images of Story 5.3: front, then back, each replaced file deleted after its
 * new image uploads), focus and the error display. `refresh` revalidates
 * `keys.insurance()` after a save.
 */
export function useInsuranceEditor(refresh: () => void): { readonly editor: InsuranceEditor; readonly refs: InsuranceEditorRefs } {
  const { myself } = useMyself()
  const [editing, setEditing] = useState<EditorSession>(CLOSED)
  const [saving, setSaving] = useState(false)
  const [drawerError, setDrawerError] = useState<InsuranceDrawerError | null>(null)
  const errorCount = useRef(0)
  const inFlight = useRef<Promise<SaveResult> | null>(null)
  const controls = useRef(new Map<InsuranceFormField, HTMLElement>())
  const returnFocus = useRef<HTMLElement | null>(null)
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const optionsBannerRef = useRef<HTMLDivElement | null>(null)
  const saveButtonRef = useRef<HTMLButtonElement | null>(null)
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  const policyholderRef = useRef<HTMLParagraphElement | null>(null)
  const [focusBanner, setFocusBanner] = useState(0)
  const [images, setImages] = useState<InsuranceBySide<InsuranceChosenImage | null>>(NO_IMAGES)
  const [imageErrors, setImageErrors] = useState<InsuranceBySide<string | null>>(NO_IMAGE_ERRORS)
  const [imageChecking, setImageChecking] = useState<InsuranceBySide<boolean>>(NOT_CHECKING)
  /** The latest chosen images (the save reads them after awaiting the checks in flight). */
  const imagesRef = useRef<InsuranceBySide<InsuranceChosenImage | null>>(NO_IMAGES)
  /** The checks in flight: a save waits for them, so a file chosen just before Save still goes. */
  const checks = useRef(new Set<Promise<{ readonly side: InsuranceCardSide; readonly ok: boolean }>>())
  /** Each slot's first button (Choose / Replace): focus goes there when a file chosen just before Save is rejected. */
  const imageActions = useRef(new Map<InsuranceCardSide, HTMLElement>())
  /** The open drawer's session: a check that ends after the drawer closed or reopened is dropped. */
  const sessionRef = useRef(0)

  const locked = insuranceLockedSubscriber(editing.policy)
  // The user's own (primary) email: a subscriber may not use it. Only Add types a subscriber (decision 3A).
  const context: InsuranceSchemaContext = { ownEmail: myself?.email ?? null, subscriberLocked: editing.policy !== null, today: editing.today }
  const contextRef = useRef(context)
  useEffect(() => {
    contextRef.current = context
  })
  const schemaNow = (): ReturnType<typeof insuranceSchema> => insuranceSchema(contextRef.current)

  // The rules depend on the open policy and the user, so the resolver reads the latest context.
  const resolver: Resolver<InsuranceFormValues, unknown, InsuranceFormValues> = (values, resolverContext, options) =>
    zodResolver(schemaNow())(values, resolverContext, options)
  const form = useForm<InsuranceFormValues, unknown, InsuranceFormValues>({ resolver, mode: "onBlur", defaultValues: EMPTY_INSURANCE_FORM, shouldFocusError: false })
  const watched = useWatch({ control: form.control })
  const isDirty = editing.open && (!deepEqual({ ...editing.opening, ...watched }, editing.opening) || images.front !== null || images.back !== null)

  // The value lists load with the drawer (never on the tab alone).
  const typeKey = useSWR<TypeInfo | undefined, ApiResponseError>(editing.open ? keys.typeKey(INSURANCE_TYPE_KEY) : null)
  const optionsState: InsuranceOptions["state"] = typeKey.data ? "ready" : typeKey.error ? "error" : "loading"
  const options: InsuranceOptions = {
    state: optionsState,
    type: insuranceValueOptions(typeKey.data, "type"),
    precedence: insuranceValueOptions(typeKey.data, "precedence"),
    relationship: insuranceValueOptions(typeKey.data, "relationship"),
    retry: () => void typeKey.mutate(),
  }

  useEffect(() => {
    if (focusBanner > 0) bannerRef.current?.focus()
  }, [focusBanner])

  // The previews' object URLs go with the Section; a check that ends after it is dropped.
  useEffect(
    () => () => {
      sessionRef.current += 1
      for (const side of INSURANCE_CARD_SIDES) {
        const image = imagesRef.current[side]
        if (image) URL.revokeObjectURL(image.previewUrl)
      }
    },
    [],
  )

  /** Sets the chosen images (state and ref), revoking the previews that go. */
  function putImages(next: InsuranceBySide<InsuranceChosenImage | null>): void {
    for (const side of INSURANCE_CARD_SIDES) {
      const previous = imagesRef.current[side]
      if (previous && previous !== next[side]) URL.revokeObjectURL(previous.previewUrl)
    }
    imagesRef.current = next
    setImages(next)
  }

  /** Drops every chosen image and its errors (open, close, discard): nothing stays in memory but the pending store. */
  function resetImages(): void {
    putImages(NO_IMAGES)
    setImageErrors(NO_IMAGE_ERRORS)
    setImageChecking(NOT_CHECKING)
  }

  function chooseImage(side: InsuranceCardSide, file: File): void {
    if (saving || inFlight.current) return
    const session = sessionRef.current
    setImageChecking((current) => ({ ...current, [side]: true }))
    const check = checkInsuranceCardFile(file).then((result) => {
      if (sessionRef.current !== session) return { side, ok: true }
      setImageChecking((current) => ({ ...current, [side]: false }))
      if (!result.ok) {
        // A rejection keeps the slot's previous state.
        setImageErrors((current) => ({ ...current, [side]: result.message }))
        return { side, ok: false }
      }
      setImageErrors((current) => ({ ...current, [side]: null }))
      putImages({ ...imagesRef.current, [side]: { ...result.image, previewUrl: URL.createObjectURL(result.image.blob) } })
      return { side, ok: true }
    })
    checks.current.add(check)
    void check.finally(() => checks.current.delete(check))
  }

  function removeImage(side: InsuranceCardSide): void {
    if (saving) return
    putImages({ ...imagesRef.current, [side]: null })
    setImageErrors((current) => ({ ...current, [side]: null }))
  }

  function close(): void {
    sessionRef.current += 1
    setEditing((current) => ({ ...current, open: false }))
    setDrawerError(null)
    resetImages()
  }

  function start(policy: InsurancePolicy | null): void {
    // The trigger ("Add insurance" or a card's kebab, which has focus again when its item runs).
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const opening = toInsuranceFormValues(policy)
    form.reset(opening)
    setDrawerError(null)
    setSaving(false)
    sessionRef.current += 1
    resetImages()
    setEditing((current) => ({ open: true, policy, opening, session: current.session + 1, today: new Date() }))
  }

  /** The first invalid field in reading order that has a mounted control, or the options banner. */
  function focusFirstInvalid(): void {
    const parsed = schemaNow().safeParse(form.getValues())
    const invalid = new Set(parsed.success ? [] : parsed.error.issues.map((issue) => String(issue.path[0])))
    const first = INSURANCE_FIELD_ORDER.find((name) => invalid.has(name) && controls.current.has(name))
    if (first) controls.current.get(first)?.focus()
  }

  function invalidCount(): number {
    const parsed = schemaNow().safeParse(form.getValues())
    return parsed.success ? 0 : new Set(parsed.error.issues.map((issue) => String(issue.path[0]))).size
  }

  async function validate(): Promise<ValidateResult> {
    if (!editing.open) return { valid: true }
    // Save is blocked until the value lists load: the inline error (with Retry) says why; while loading, Type shows the loading state.
    if (optionsState === "error") return { valid: false, invalidCount: 1, focusFirstInvalid: () => optionsBannerRef.current?.focus() }
    if (optionsState === "loading") return { valid: false, invalidCount: 1, focusFirstInvalid: () => controls.current.get("type")?.focus() }
    // Decision 3A: a non-Self Edit without a saved subscriber can't be saved (only Self, or remove and add again).
    if (editing.policy !== null && locked === null && needsSubscriber(form.getValues("relationship"))) {
      return { valid: false, invalidCount: 1, focusFirstInvalid: () => policyholderRef.current?.focus() }
    }
    if (await form.trigger()) return { valid: true }
    return { valid: false, invalidCount: Math.max(1, invalidCount()), focusFirstInvalid }
  }

  function showFailure(mapped: MappedError, withUi: boolean): void {
    if (mapped.kind === "session") return
    if (mapped.kind === "field" && mapped.field === "policy") {
      // The policy is gone: the drawer closes (nothing left to save) and the list shows what is left.
      const reload = (): void => refresh()
      reload()
      close()
      toastError(messageFor(mapped.messageKey), { onRetry: reload })
      return
    }
    const target = mapped.kind === "field" ? SERVER_FIELDS[mapped.field] : undefined
    // Only an editable, mounted field shows its error (a locked or hidden subscriber field can't be fixed there).
    const editable = target !== undefined && controls.current.has(target) && !(locked !== null && SUBSCRIBER_FIELDS.has(target))
    if (mapped.kind === "field" && target !== undefined && editable) {
      form.setError(target, { type: "server", message: messageFor(mapped.messageKey) })
      if (withUi) controls.current.get(target)?.focus()
      return
    }
    const section = SHELL_MESSAGES.profileTabInsurance.toLowerCase()
    let error: Omit<InsuranceDrawerError, "key">
    if (mapped.kind === "field") {
      const incomplete = locked !== null && target !== undefined && SUBSCRIBER_FIELDS.has(target)
      error = { message: incomplete ? INSURANCE_MESSAGES.subscriberIncomplete : messageFor(mapped.messageKey), retry: false }
    } else if (mapped.kind === "forbidden") error = { message: STATE_MESSAGES.noAccess, retry: false }
    else if (mapped.kind === "network") error = { message: formatMessage(SECTION_MESSAGES.networkFailure, { section }), retry: true }
    else error = { message: formatMessage(SECTION_MESSAGES.saveFailed, { section }), retry: true }
    errorCount.current += 1
    setDrawerError({ ...error, key: errorCount.current })
    if (withUi) setFocusBanner((tick) => tick + 1)
  }

  /** Sends the policy once (a second caller joins the send in flight). */
  function send(withUi: boolean): Promise<SaveResult> {
    if (inFlight.current) return inFlight.current
    const promise = sendOnce(withUi).finally(() => {
      inFlight.current = null
    })
    inFlight.current = promise
    return promise
  }

  async function sendOnce(withUi: boolean): Promise<SaveResult> {
    const { policy } = editing
    setSaving(true)
    setDrawerError(null)
    try {
      // A file chosen just before Save is still being checked: it goes with this save, and if it is refused
      // nothing is sent: the drawer stays open with the slot's inline error.
      const rejected = (await Promise.all([...checks.current])).find((check) => !check.ok)
      if (rejected) {
        if (withUi) imageActions.current.get(rejected.side)?.focus()
        return { ok: false, error: { code: "FIELD" } }
      }
      // Only Add sends a typed subscriber (decision 3A); an Edit sends the saved one or none.
      const input = toInsurancePolicyInput(form.getValues(), locked, policy === null)
      const editId = policy && policy.id !== null ? policy.id : null
      const res = editId !== null ? await saveInsuranceUpdate(editId, input) : await saveInsuranceCreate(input)
      if (res.success) {
        telemetry.track("section_save", { sectionId: "insurance", ok: true, code: null })
        // Story 5.3: the images upload only after the policy saved, front then back; they never fail the save.
        const results = await uploadImages(editId ?? insuranceSavedPolicyId(res.data), editId === null ? null : policy)
        refresh()
        const partial = insurancePartialToast(results)
        // An upload that ended the session: the shell's dialog takes over, so no toast.
        const sessionEnded = Object.values(results).some((result) => result.outcome === "session")
        if (!sessionEnded) {
          if (partial) toastPartial(partial)
          else toastSuccess(formatMessage(SECTION_MESSAGES.saved, { section: SHELL_MESSAGES.profileTabInsurance }))
        }
        // A new policy: the empty card's button may go with the refetch, so focus lands on the header's "Add insurance".
        if (policy === null && addButtonRef.current) returnFocus.current = addButtonRef.current
        close()
        return { ok: true }
      }
      const mapped = mapApiError("insurance", res)
      const code = mappedErrorCode(mapped)
      telemetry.track("section_save", { sectionId: "insurance", ok: false, code })
      showFailure(mapped, withUi)
      return { ok: false, error: { code, mapped } }
    } catch {
      telemetry.track("section_save", { sectionId: "insurance", ok: false, code: "UNEXPECTED" })
      showFailure({ kind: "generic" }, withUi)
      return UNEXPECTED
    } finally {
      setSaving(false)
    }
  }

  /**
   * Uploads the chosen images of the saved policy `policyId` (from the `PUT`'s
   * policy or the `POST`'s answer, never typed), front then back, each on its
   * own. A replaced side's old file (from `edited`) is deleted after its new
   * image uploads. Without a policy id nothing can upload (no Retry either).
   */
  async function uploadImages(policyId: number | null, edited: InsurancePolicy | null): Promise<Partial<Record<InsuranceCardSide, InsuranceCardResult>>> {
    const results: Partial<Record<InsuranceCardSide, InsuranceCardResult>> = {}
    for (const side of INSURANCE_CARD_SIDES) {
      const image = imagesRef.current[side]
      if (!image) continue
      const outcome = policyId === null ? "failed" : await uploadInsuranceCardImage(policyId, side, image, edited?.cardFileIds[side] ?? null)
      results[side] = { outcome, name: image.name }
    }
    return results
  }

  /** The leave guard's save (after its `validate`): the same flow as Save, without focus moves. Never throws. */
  async function save(): Promise<SaveResult> {
    if (inFlight.current) return inFlight.current
    const checked = await validate()
    if (!checked.valid) return { ok: false, error: { code: "FIELD" } }
    return send(false)
  }

  async function submit(): Promise<void> {
    if (saving || inFlight.current) return
    const checked = await validate()
    if (!checked.valid) {
      checked.focusFirstInvalid()
      return
    }
    await send(true)
  }

  function discard(): void {
    form.reset(editing.opening)
    close()
  }

  const editor: InsuranceEditor = {
    open: editing.open,
    mode: editing.policy === null ? "add" : "edit",
    policy: editing.policy,
    session: editing.session,
    today: editing.today,
    form,
    isDirty,
    saving,
    locked,
    drawerError,
    options,
    images,
    imageErrors,
    imageChecking,
    chooseImage,
    removeImage,
    openAdd: () => start(null),
    openEdit: (policy) => start(policy),
    requestClose: () => {
      if (saving) return
      void requestLeave({ scope: "insurance" }).then((leave) => {
        if (leave) close()
      })
    },
    submit,
    retry: () => {
      saveButtonRef.current?.focus()
      void submit()
    },
    validate,
    save,
    discard,
    registerImageAction: (side) => (element) => {
      if (element) imageActions.current.set(side, element)
      else imageActions.current.delete(side)
    },
    registerControl: (name) => (element) => {
      if (element) controls.current.set(name, element)
      else controls.current.delete(name)
    },
    onCloseAutoFocus: (event) => {
      const trigger = returnFocus.current
      returnFocus.current = null
      const target = trigger?.isConnected ? trigger : addButtonRef.current
      if (!target?.isConnected) return
      event.preventDefault()
      target.focus()
    },
  }
  return { editor, refs: { banner: bannerRef, optionsBanner: optionsBannerRef, saveButton: saveButtonRef, addButton: addButtonRef, policyholder: policyholderRef } }
}
