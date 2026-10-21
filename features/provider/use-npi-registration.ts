"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toastSuccess } from "@/features/shell"
import { isNpiRegistered, mapApiError, registerNpi, sessionEvents, type MappedError, type NpiOption } from "@/lib/api"
import { messageFor, NPI_MESSAGES } from "@/lib/shared/messages"

const registrationSchema = z.object({
  personalNpi: z.custom<NpiOption>().nullable().refine((pick): pick is NpiOption => pick !== null, { message: NPI_MESSAGES.personalNpiRequired }),
  practiceNpi: z.custom<NpiOption>().nullable(),
})
type RegistrationValues = z.input<typeof registrationSchema>
type ValidatedRegistrationValues = z.output<typeof registrationSchema>
type RegistrationField = keyof RegistrationValues
export interface NpiRegistrationProps {
  readonly onFailure: (error: MappedError) => void
  readonly onRegistered: () => Promise<void>
}

/** An ephemeral command: no registry, drafts, cache, or automatic mutation retry. */
export function useNpiRegistration({ onFailure, onRegistered }: NpiRegistrationProps) {
  const form = useForm<RegistrationValues, unknown, ValidatedRegistrationValues>({ resolver: zodResolver(registrationSchema), defaultValues: { personalNpi: null, practiceNpi: null }, mode: "onBlur" })
  const { setValue, clearErrors, setError, getValues, reset, handleSubmit } = form
  const requestedFocus = useRef<RegistrationField | null>(null)
  const personalInput = useRef<HTMLInputElement>(null)
  const practiceInput = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const pending = useRef(false)
  const mounted = useRef(false)
  const active = useRef<AbortController | null>(null)
  const completed = useRef(false)
  const [resetKey, setResetKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ text: string; attempt: number } | null>(null)
  const attempts = useRef(0)
  const personalSelection = useWatch({ control: form.control, name: "personalNpi" })
  const practiceSelection = useWatch({ control: form.control, name: "practiceNpi" })

  useEffect(() => {
    mounted.current = true
    const abandon = () => { generation.current++; active.current?.abort(); reset(); setResetKey((key) => key + 1); setBanner(null); setBusy(false) }
    const unsubscribe = sessionEvents.subscribe("session-expired", abandon)
    window.addEventListener("pagehide", abandon)
    const lifecycleGeneration = generation
    return () => { mounted.current = false; lifecycleGeneration.current++; active.current?.abort(); unsubscribe(); window.removeEventListener("pagehide", abandon) }
  }, [reset])

  const change = (field: RegistrationField, pick: NpiOption | null): void => {
    if (pending.current || completed.current || sessionEvents.hasPublished("session-expired")) return
    setValue(field, pick)
    clearErrors(field)
  }
  const focusField = (field: RegistrationField): void => { requestedFocus.current = field }
  useEffect(() => {
    if (busy || !requestedFocus.current || sessionEvents.hasPublished("session-expired")) return
    const field = requestedFocus.current
    requestedFocus.current = null
    const input = field === "personalNpi" ? personalInput : practiceInput
    input.current?.focus()
  })
  const fail = (mapped: MappedError): RegistrationField | null => {
    if (mapped.kind === "field" && (mapped.field === "personalNpi" || mapped.field === "practiceNpi")) {
      setError(mapped.field, { type: "server", message: messageFor(mapped.messageKey) })
      return mapped.field
    }
    if (mapped.kind === "forbidden" || mapped.kind === "session") onFailure(mapped)
    else {
      const text = mapped.kind === "generic" && mapped.message ? mapped.message : NPI_MESSAGES.registrationFailed
      const attempt = attempts.current
      setBanner((previous) => text === NPI_MESSAGES.registrationFailed && previous ? previous : { text, attempt })
    }
    return null
  }
  const execute = async (values: ValidatedRegistrationValues): Promise<void> => {
    const provider = values.personalNpi
    const controller = new AbortController()
    active.current = controller
    const live = () => mounted.current && !controller.signal.aborted && !sessionEvents.hasPublished("session-expired")
    const picks = [{ field: "personalNpi" as const, pick: provider }, ...(values.practiceNpi ? [{ field: "practiceNpi" as const, pick: values.practiceNpi }] : [])]
    const results = await Promise.all(picks.map(async ({ field, pick }) => ({ field, response: await isNpiRegistered(pick.id, { signal: controller.signal, userInitiated: true }) })))
    if (!live()) return
    let blocked = false
    let firstField: RegistrationField | null = null
    for (const { field, response } of results) {
      if (!response.success || typeof response.data !== "boolean") {
        blocked = true
        const failedField = fail(mapApiError("provider", response))
        firstField ??= failedField
      } else if (response.data) {
        blocked = true
        setError(field, { type: "server", message: field === "personalNpi" ? NPI_MESSAGES.personalNpiTaken : NPI_MESSAGES.practiceNpiTaken })
        firstField ??= field
      }
    }
    if (blocked) { if (firstField) focusField(firstField); return }
    const response = await registerNpi({ providerNpiId: provider.id, ...(values.practiceNpi ? { practiceNpiId: values.practiceNpi.id } : {}) }, controller.signal)
    if (!live()) return
    if (!response.success) { const field = fail(mapApiError("provider", response)); if (field) focusField(field); return }
    completed.current = true
    reset()
    setResetKey((key) => key + 1)
    toastSuccess(values.practiceNpi ? NPI_MESSAGES.providerPracticeRegistered : NPI_MESSAGES.providerRegistered)
    await onRegistered()
  }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (pending.current || completed.current || sessionEvents.hasPublished("session-expired")) return
    pending.current = true
    setBusy(true)
    setBanner(null)
    attempts.current++
    clearErrors()
    const current = generation.current
    void handleSubmit(async (values) => { if (current === generation.current) await execute(values) }, () => focusField("personalNpi"))(event).finally(() => {
      pending.current = false
      if (mounted.current && !completed.current && !sessionEvents.hasPublished("session-expired")) setBusy(false)
    })
  }
  return {
    busy, banner, submit, resetKey, errors: form.formState.errors,
    personalSelection, practiceSelection,
    personalInput, practiceInput,
    change, personalBlur: () => { if (!getValues("personalNpi")) setError("personalNpi", { type: "required", message: NPI_MESSAGES.personalNpiRequired }) },
  }
}
