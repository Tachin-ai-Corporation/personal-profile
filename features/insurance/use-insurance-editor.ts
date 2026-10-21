"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useRef, useState, type RefObject } from "react"
import { useForm, useWatch, type Resolver, type UseFormReturn } from "react-hook-form"
import useSWR from "swr"
import { requestLeave, toastError, toastPartial, toastSuccess, useMyself, type SaveResult, type ValidateResult } from "@/features/shell"
import {
  INSURANCE_CARD_SIDES,
  INSURANCE_TYPE_KEY,
  fetchInsurance,
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
  type InsurancePolicyInput,
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
import { insuranceEnumLabel } from "./format"
import { insuranceConflictName, insuranceDemotionInput, insuranceDemotionLacksPolicyholder, insuranceJoinNames, insurancePrimaryConflicts } from "./primary-conflict"
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

/**
 * Story 5.4: the Primary-per-type demotion offer, shown when the form's Type +
 * Precedence would make a second Primary of a type.
 */
export interface InsuranceDemotionOffer {
  /** The type as the banner names it ("Medical"). */
  readonly type: string
  /** The conflicting policies' insurers, joined ("Aetna and Cigna"). */
  readonly insurers: string
  /** The user accepted the demotion: it saves with this policy (before it, decision 1A). */
  readonly accepted: boolean
  /** Save was tried without the acceptance: the error line under the banner. */
  readonly error: boolean
}

/** The acceptance of the demotion, for the Type + Precedence (and open) it was given for. */
interface DemotionState {
  /** The open session, Type and Precedence: any change clears the acceptance and the error line. */
  readonly key: string
  /** The ids of the policies the user agreed to make Secondary, or `null`. */
  readonly accepted: readonly (number | null)[] | null
  readonly error: boolean
}

/** A demotion the save sends: the other policy (from the list read at send time) and its body. */
interface SentDemotion {
  readonly other: InsurancePolicy
  readonly id: number
  readonly input: InsurancePolicyInput
}

/** The rollback's outcome: the notes naming the policies left Secondary, and whether the session ended (no more requests). */
interface RollbackOutcome {
  readonly notes: string[]
  readonly sessionEnded: boolean
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
  /** Story 5.4: the demotion offer, or `null` when the form's Type + Precedence clash with no other Primary. */
  readonly demotion: InsuranceDemotionOffer | null
  /** Accepts the demotion, or (pressed again) takes the acceptance back. */
  readonly toggleDemotion: () => void
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
  /** Story 5.4: the banner's "Make {insurer} secondary": Save without the acceptance focuses it. */
  readonly demoteButton: RefObject<HTMLButtonElement | null>
}

const CLOSED: EditorSession = { open: false, policy: null, opening: EMPTY_INSURANCE_FORM, session: 0, today: new Date(0) }

const UNEXPECTED: SaveResult = { ok: false, error: { code: "UNEXPECTED", mapped: { kind: "generic" } } }

/** The ids that identify a conflict for the acceptance. */
const conflictIds = (conflicts: readonly InsurancePolicy[]): (number | null)[] => conflicts.map((policy) => policy.id)

/** The conflicting policies as the copy names them. */
const conflictNames = (conflicts: readonly InsurancePolicy[]): string => insuranceJoinNames(conflicts.map(insuranceConflictName))

/**
 * The Insurance editor's state (Story 5.2), lifted into `InsuranceSection` so
 * its one `useRegisterSection("insurance")` call can guard it: the drawer's
 * open state and policy, the react-hook-form form (zod, on blur and Save),
 * the type key's value lists, the save (Story 5.4's demotions of the other
 * Primary policies of the type first, decision 1A; then one `POST` or `PUT`;
 * then the card images of Story 5.3: front, then back, each replaced file
 * deleted after its new image uploads), focus and the error display.
 * `policies` is the Section's list (`keys.insurance()`), which decides the
 * Primary conflict; `refresh()` revalidates it (after a save, and after a
 * failed save that sent a demotion, so a Retry sends only what is left), and
 * `refresh(fresh)` puts the list a save just read into the key.
 */
export function useInsuranceEditor(
  refresh: (fresh?: InsurancePolicy[]) => Promise<unknown>,
  policies: readonly InsurancePolicy[] | undefined,
): { readonly editor: InsuranceEditor; readonly refs: InsuranceEditorRefs } {
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
  const demoteButtonRef = useRef<HTMLButtonElement | null>(null)
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

  // Story 5.4: the other Primary policies of the form's type (re-evaluated on every change and every refetch).
  const watchedType = typeof watched.type === "string" ? watched.type : ""
  const watchedPrecedence = typeof watched.precedence === "string" ? watched.precedence : ""
  const conflicts = editing.open ? insurancePrimaryConflicts(policies, editing.policy?.id ?? null, watchedType, watchedPrecedence) : []
  const choiceKey = `${editing.session}|${watchedType}|${watchedPrecedence}`
  const [demotionState, setDemotionState] = useState<DemotionState>({ key: choiceKey, accepted: null, error: false })
  // Changing Type or Precedence (or opening again) clears the acceptance and the error line (adjusted while rendering).
  let demotionNow = demotionState
  if (demotionState.key !== choiceKey) {
    demotionNow = { key: choiceKey, accepted: null, error: false }
    setDemotionState(demotionNow)
  }
  // The acceptance holds while the conflict is what was accepted, or less (a refetch after a failed save may shrink it).
  const accepted = conflicts.length > 0 && demotionNow.accepted !== null && conflictIds(conflicts).every((id) => demotionNow.accepted?.includes(id))
  const demotion: InsuranceDemotionOffer | null =
    conflicts.length === 0
      ? null
      : { type: insuranceEnumLabel(watchedType) ?? watchedType, insurers: conflictNames(conflicts), accepted, error: demotionNow.error && !accepted }
  /** The latest conflict and acceptance, for the save (it runs after renders it didn't start in). */
  const demotionRef = useRef({ conflicts, accepted, acceptedIds: demotionNow.accepted })
  useEffect(() => {
    demotionRef.current = { conflicts, accepted, acceptedIds: demotionNow.accepted }
  })

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
    // Story 5.4: a conflict without the acceptance blocks Save; the error line shows under the banner.
    const blocked = demotionRef.current.conflicts.length > 0 && !demotionRef.current.accepted
    if (blocked) setDemotionState((current) => ({ ...current, error: true }))
    const fieldsValid = await form.trigger()
    if (fieldsValid && !blocked) return { valid: true }
    if (!blocked) return { valid: false, invalidCount: Math.max(1, invalidCount()), focusFirstInvalid }
    // The banner sits after Type + Precedence: only the Insurer comes before it (a conflict needs a valid Type and Primary).
    const insurerFirst = !fieldsValid && form.getFieldState("insurer").invalid
    return {
      valid: false,
      invalidCount: (fieldsValid ? 0 : Math.max(1, invalidCount())) + 1,
      focusFirstInvalid: () => (insurerFirst ? focusFirstInvalid() : demoteButtonRef.current?.focus()),
    }
  }

  /** Shows a drawer-level error (a new one is announced again); with UI, focus moves to it. */
  function showDrawerError(error: Omit<InsuranceDrawerError, "key">, withUi: boolean): void {
    errorCount.current += 1
    setDrawerError({ ...error, key: errorCount.current })
    if (withUi) setFocusBanner((tick) => tick + 1)
  }

  /** A sentence and the notes after it (Story 5.4: the policies now Secondary), each note once. */
  const withNotes = (message: string, notes: readonly string[]): string => [message, ...new Set(notes)].join(" ")

  /** "{insurer} is now secondary." for each policy (once per name). */
  const nowSecondary = (others: readonly InsurancePolicy[]): string[] =>
    others.map((other) => formatMessage(INSURANCE_MESSAGES.demotionNotRolledBack, { insurer: insuranceConflictName(other) }))

  /** The transport errors every failure shares: no access, network, anything else. */
  function transportError(mapped: MappedError): Omit<InsuranceDrawerError, "key"> {
    const section = SHELL_MESSAGES.profileTabInsurance.toLowerCase()
    if (mapped.kind === "forbidden") return { message: STATE_MESSAGES.noAccess, retry: false }
    if (mapped.kind === "network") return { message: formatMessage(SECTION_MESSAGES.networkFailure, { section }), retry: true }
    return { message: formatMessage(SECTION_MESSAGES.saveFailed, { section }), retry: true }
  }

  /**
   * The policy's own save failed (mapped as in Story 5.2). `notes` name the
   * demoted policies a rollback couldn't make Primary again (Story 5.4): they
   * show at drawer level, after the error's sentence or beside a field error.
   */
  function showFailure(mapped: MappedError, withUi: boolean, notes: readonly string[] = []): void {
    if (mapped.kind === "session") return
    if (mapped.kind === "field" && mapped.field === "policy") {
      // The policy is gone: the drawer closes (nothing left to save) and the list shows what is left.
      const reload = (): void => void refresh()
      reload()
      close()
      toastError(withNotes(messageFor(mapped.messageKey), notes), { onRetry: reload })
      return
    }
    const target = mapped.kind === "field" ? SERVER_FIELDS[mapped.field] : undefined
    // Only an editable, mounted field shows its error (a locked or hidden subscriber field can't be fixed there).
    const editable = target !== undefined && controls.current.has(target) && !(locked !== null && SUBSCRIBER_FIELDS.has(target))
    if (mapped.kind === "field" && target !== undefined && editable) {
      form.setError(target, { type: "server", message: messageFor(mapped.messageKey) })
      // The rollback notes still show at drawer level, without taking focus from the field.
      if (notes.length > 0) showDrawerError({ message: [...new Set(notes)].join(" "), retry: false }, false)
      if (withUi) controls.current.get(target)?.focus()
      return
    }
    let error: Omit<InsuranceDrawerError, "key">
    if (mapped.kind === "field") {
      const incomplete = locked !== null && target !== undefined && SUBSCRIBER_FIELDS.has(target)
      error = { message: incomplete ? INSURANCE_MESSAGES.subscriberIncomplete : messageFor(mapped.messageKey), retry: false }
    } else error = transportError(mapped)
    showDrawerError({ ...error, message: withNotes(error.message, notes) }, withUi)
  }

  /**
   * A demotion failed (Story 5.4): always at drawer level (its error is about
   * the other policy, never this form's fields). The other policy is gone
   * ("… is no longer on your profile. Save again.", with Retry: the refetch
   * already dropped it), a refused body ("Edit that policy first", no Retry),
   * or the transport error with Retry; `notes` name the earlier demotions a
   * rollback couldn't undo.
   */
  function showDemotionFailure(mapped: MappedError, other: InsurancePolicy, notes: readonly string[], withUi: boolean): void {
    if (mapped.kind === "session") return
    const insurer = insuranceConflictName(other)
    let error: Omit<InsuranceDrawerError, "key">
    if (mapped.kind === "field" && mapped.field === "policy") error = { message: formatMessage(INSURANCE_MESSAGES.demotionPolicyGone, { insurer }), retry: true }
    else if (mapped.kind === "field") error = { message: formatMessage(INSURANCE_MESSAGES.demotionUnbuildable, { insurer }), retry: false }
    else error = transportError(mapped)
    showDrawerError({ ...error, message: withNotes(error.message, notes) }, withUi)
  }

  /**
   * Decision 2A: makes each demoted policy Primary again (its body as
   * demoted, the precedence restored), and answers the sentences naming those
   * a rollback couldn't restore ("{insurer} is now secondary."). A session
   * failure stops it: no request can go any more (the shell's dialog takes over).
   */
  async function rollBack(demoted: readonly SentDemotion[]): Promise<RollbackOutcome> {
    const failed: InsurancePolicy[] = []
    for (const { other, id } of demoted) {
      const input = insuranceDemotionInput(other, "PRIMARY")
      const res = input === null ? null : await saveInsuranceUpdate(id, input)
      if (res !== null && !res.success && mapApiError("insurance", res).kind === "session") return { notes: nowSecondary(failed), sessionEnded: true }
      if (res === null || !res.success) failed.push(other)
    }
    return { notes: nowSecondary(failed), sessionEnded: false }
  }

  /**
   * After a failure that may have left policies Secondary: rolls them back,
   * refetches, then shows the failure with the notes (nothing once the
   * session ended).
   */
  async function undoDemotions(demoted: readonly SentDemotion[], show: (notes: readonly string[]) => void): Promise<void> {
    const { notes, sessionEnded } = await rollBack(demoted)
    if (sessionEnded) return
    await refetch()
    show(notes)
  }

  /**
   * The list again after a partial outcome (or `fresh`, a list the save just
   * read, put into the key): the conflict, and so the next Save, follows what
   * the backend now holds.
   */
  async function refetch(fresh?: InsurancePolicy[]): Promise<void> {
    try {
      await refresh(fresh)
    } catch {
      // A failed refetch keeps the old list: the next Save may demote again, which the backend accepts.
    }
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
    // Kept outside the `try`, so an unexpected throw still rolls back what was demoted.
    const demoted: SentDemotion[] = []
    let policySaved = false
    try {
      // A file chosen just before Save is still being checked: it goes with this save, and if it is refused
      // nothing is sent: the drawer stays open with the slot's inline error.
      const rejected = (await Promise.all([...checks.current])).find((check) => !check.ok)
      if (rejected) {
        if (withUi) imageActions.current.get(rejected.side)?.focus()
        return { ok: false, error: { code: "FIELD" } }
      }
      // Story 5.4: the other Primary policies of the type (accepted, `validate`) go Secondary first (decision 1A).
      let others = demotionRef.current.conflicts
      if (others.length > 0) {
        // The list again, now: a demotion is a full replace, so it is built from the other policy's current values,
        // and a Primary added elsewhere since is never demoted without consent.
        const fresh = await fetchInsurance()
        if (!fresh.success || fresh.data === undefined) {
          const mapped = mapApiError("insurance", fresh)
          const code = mappedErrorCode(mapped)
          telemetry.track("section_save", { sectionId: "insurance", ok: false, code })
          if (mapped.kind !== "session") showDrawerError(transportError(mapped), withUi)
          return { ok: false, error: { code, mapped } }
        }
        await refetch(fresh.data)
        const values = form.getValues()
        others = insurancePrimaryConflicts(fresh.data, policy?.id ?? null, values.type, values.precedence)
        const acceptedIds = demotionRef.current.acceptedIds ?? []
        if (others.some((other) => !acceptedIds.includes(other.id))) {
          // Not what was accepted: the banner names the new policies; nothing is sent.
          setDemotionState((current) => ({ ...current, error: true }))
          if (withUi) demoteButtonRef.current?.focus()
          return { ok: false, error: { code: "FIELD" } }
        }
      }
      const demotions: SentDemotion[] = []
      const unbuildable: InsurancePolicy[] = []
      for (const other of others) {
        const demotion = insuranceDemotionInput(other)
        // `insuranceDemotionInput` answers a body only for a policy with a usable id.
        if (demotion === null || other.id === null) unbuildable.push(other)
        else demotions.push({ other, id: other.id, input: demotion })
      }
      if (unbuildable.length > 0) {
        // Their saved values can't make a valid body: nothing is sent.
        const orphaned = unbuildable.filter(insuranceDemotionLacksPolicyholder)
        const invalid = unbuildable.filter((other) => !orphaned.includes(other))
        const sentences = [
          orphaned.length > 0 ? formatMessage(INSURANCE_MESSAGES.demotionNoPolicyholder, { insurer: conflictNames(orphaned) }) : null,
          invalid.length > 0 ? formatMessage(INSURANCE_MESSAGES.demotionUnbuildable, { insurer: conflictNames(invalid) }) : null,
        ].filter((sentence) => sentence !== null)
        telemetry.track("section_save", { sectionId: "insurance", ok: false, code: "FIELD" })
        showDrawerError({ message: sentences.join(" "), retry: false }, withUi)
        return { ok: false, error: { code: "FIELD" } }
      }
      for (const sent of demotions) {
        const { other } = sent
        const res = await saveInsuranceUpdate(sent.id, sent.input)
        if (res.success) {
          demoted.push(sent)
          continue
        }
        // Nothing else is sent: the earlier demotions are rolled back, the list refetched.
        const mapped = mapApiError("insurance", res)
        const code = mappedErrorCode(mapped)
        telemetry.track("section_save", { sectionId: "insurance", ok: false, code })
        if (mapped.kind !== "session") await undoDemotions(demoted, (notes) => showDemotionFailure(mapped, other, notes, withUi))
        return { ok: false, error: { code, mapped } }
      }
      // Only Add sends a typed subscriber (decision 3A); an Edit sends the saved one or none.
      const input = toInsurancePolicyInput(form.getValues(), locked, policy === null)
      const editId = policy && policy.id !== null ? policy.id : null
      const res = editId !== null ? await saveInsuranceUpdate(editId, input) : await saveInsuranceCreate(input)
      if (res.success) {
        policySaved = true
        telemetry.track("section_save", { sectionId: "insurance", ok: true, code: null })
        // Story 5.3: the images upload only after the policy saved, front then back; they never fail the save.
        const results = await uploadImages(editId ?? insuranceSavedPolicyId(res.data), editId === null ? null : policy)
        void refresh()
        const partial = insurancePartialToast(results)
        // An upload that ended the session: the shell's dialog takes over, so no toast.
        const sessionEnded = Object.values(results).some((result) => result.outcome === "session")
        if (!sessionEnded) {
          // Story 5.4: the toast also says which policy is now Secondary.
          const demotedNotes = nowSecondary(demoted.map((sent) => sent.other))
          if (partial) toastPartial(withNotes(partial, demotedNotes))
          else toastSuccess(withNotes(formatMessage(SECTION_MESSAGES.saved, { section: SHELL_MESSAGES.profileTabInsurance }), demotedNotes))
        }
        // A new policy: the empty card's button may go with the refetch, so focus lands on the header's "Add insurance".
        if (policy === null && addButtonRef.current) returnFocus.current = addButtonRef.current
        close()
        return { ok: true }
      }
      const mapped = mapApiError("insurance", res)
      const code = mappedErrorCode(mapped)
      telemetry.track("section_save", { sectionId: "insurance", ok: false, code })
      // Decision 2A: the demoted policies go back to Primary, then the list is refetched (no rollback once the session ended).
      if (demoted.length > 0 && mapped.kind !== "session") await undoDemotions(demoted, (notes) => showFailure(mapped, withUi, notes))
      else showFailure(mapped, withUi)
      return { ok: false, error: { code, mapped } }
    } catch {
      telemetry.track("section_save", { sectionId: "insurance", ok: false, code: "UNEXPECTED" })
      // A throw before the policy saved: what was demoted goes back to Primary (decision 2A).
      if (demoted.length > 0 && !policySaved) await undoDemotions(demoted, (notes) => showFailure({ kind: "generic" }, withUi, notes))
      else showFailure({ kind: "generic" }, withUi)
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
    demotion,
    toggleDemotion: () => {
      if (saving || conflicts.length === 0) return
      setDemotionState((current) => ({ ...current, accepted: accepted ? null : conflictIds(conflicts), error: false }))
    },
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
  return {
    editor,
    refs: { banner: bannerRef, optionsBanner: optionsBannerRef, saveButton: saveButtonRef, addButton: addButtonRef, policyholder: policyholderRef, demoteButton: demoteButtonRef },
  }
}
