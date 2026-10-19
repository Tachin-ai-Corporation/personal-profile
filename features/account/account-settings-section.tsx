"use client"

import { useEffect, useRef, useState } from "react"
import { useCachedValue } from "@/features/shell/use-cached-value"
import { KeyValueTable, SectionHeader, SectionContainer, SectionFooter, StateFrame, useSectionForm, useSectionRegistry, sectionHeadingId, useClaimMyselfError, useMyself, useSectionFrame, type FrameState, type KeyValueRow } from "@/features/shell"
import { keys, mapFetchError, type ContactPoint, type MappedError } from "@/lib/api"
import { ACCOUNT_MESSAGES, COMMON_MESSAGES, FIELD_MESSAGES, SHELL_MESSAGES, SECTION_MESSAGES, formatMessage, messageFor } from "@/lib/shared/messages"
import { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import { InlineBanner } from "@/components/ui/inline-banner"
import { deepEqual } from "@/lib/shared/deep-equal"
import { normalizeName } from "@/lib/shared/person-rules"
import { displayToWireDate } from "@/lib/shared/dates"
import { ACCOUNT_DRAFT_FIELDS, accountFormDefaults, accountSchema, accountDraftDiff, type AccountFormValues } from "./schema"
import { saveAccount, type AccountSaveOutcome } from "./account-save"
import { AccountEditFields } from "./account-edit-fields"
import { toAccountView, type AccountView } from "./view-model"

type AccountPredecessors = Partial<Record<keyof AccountFormValues, readonly string[]>>

function accountRows(view: AccountView): KeyValueRow[] {
  return [
    { key: "firstName", label: FIELD_MESSAGES.firstName, value: view.firstName },
    { key: "lastName", label: FIELD_MESSAGES.lastName, value: view.lastName },
    { key: "username", label: ACCOUNT_MESSAGES.username, value: view.username },
    { key: "password", label: ACCOUNT_MESSAGES.password, value: <span className="mono-value">{view.password}</span> },
    { key: "primaryEmail", label: ACCOUNT_MESSAGES.primaryEmail, value: view.primaryEmail },
    { key: "primaryPhone", label: ACCOUNT_MESSAGES.primaryPhone, value: view.primaryPhone },
    { key: "birthDate", label: FIELD_MESSAGES.birthDate, value: view.birthDate },
    { key: "preferredLanguage", label: ACCOUNT_MESSAGES.preferredLanguage, value: view.preferredLanguage },
    { key: "timeZone", label: ACCOUNT_MESSAGES.timeZone, value: view.timeZone },
    { key: "locale", label: ACCOUNT_MESSAGES.locale, value: view.locale },
  ]
}

/** Account settings read, edit and partial-save recovery on the shared identity key. */
export function AccountSettingsSection() {
  const { myself, error, isLoading, retry } = useMyself()
  const { mutate } = useSWRConfig()
  const registry = useSectionRegistry()
  const [acknowledgements, setAcknowledgements] = useState<{ values: Partial<AccountFormValues>; before: AccountPredecessors; history: AccountPredecessors }>({ values: {}, before: {}, history: {} })
  const serverValues = accountFormDefaults(myself)
  const latestServerValues = useRef(serverValues)
  useEffect(() => { latestServerValues.current = serverValues }, [serverValues])
  const retainedFields = ACCOUNT_DRAFT_FIELDS.filter((field) => acknowledgements.values[field] !== undefined && acknowledgements.before[field]?.includes(serverValues[field]) && serverValues[field] !== acknowledgements.values[field])
  if (retainedFields.length !== Object.keys(acknowledgements.values).length) {
    const history = { ...acknowledgements.history }
    for (const field of ACCOUNT_DRAFT_FIELDS) {
      if (acknowledgements.values[field] !== undefined && !retainedFields.includes(field) && serverValues[field] !== acknowledgements.values[field]) delete history[field]
    }
    setAcknowledgements({
      history,
      values: Object.fromEntries(retainedFields.map((field) => [field, acknowledgements.values[field]])),
      before: Object.fromEntries(retainedFields.map((field) => [field, acknowledgements.before[field]])),
    })
  }
  // Keep acknowledgements over stale reads, but allow later external changes through.
  const acknowledged = Object.fromEntries(retainedFields.map((field) => [field, acknowledgements.values[field]])) as Partial<AccountFormValues>
  const [outcomeAttempt, setOutcomeAttempt] = useState(0)
  const [outcomes, setOutcomes] = useState<readonly AccountSaveOutcome[]>([])
  const baseline = { ...serverValues, ...acknowledged }
  const section = useSectionForm<AccountFormValues>({
    id: "account", label: SHELL_MESSAGES.accountSectionHeading, displayOrder: 1,
    schema: accountSchema(myself?.roles ?? undefined), baseline, cancelFocus: "edit", onNoChanges: "status",
    fieldOrder: ACCOUNT_DRAFT_FIELDS, draftFields: ACCOUNT_DRAFT_FIELDS,
    describeDraftDiff: accountDraftDiff, dataStatus: error ? "error" : myself ? "loaded" : "loading",
    successToast: ACCOUNT_MESSAGES.updated,
    save: async (values, base) => saveAccount(values, base, {
      outcomes: (failures) => {
        setOutcomes(failures)
        if (failures.length) setOutcomeAttempt((attempt) => attempt + 1)
        for (const failure of failures) {
          const mapped = failure.mapped
          if (mapped.kind === "field" && ACCOUNT_DRAFT_FIELDS.some((field) => field === String(mapped.field))) {
            section.form.setError(mapped.field as keyof AccountFormValues, { type: "server", message: messageFor(mapped.messageKey) })
          }
        }
      },
      rebase: (next) => {
        const saved = Object.fromEntries(ACCOUNT_DRAFT_FIELDS.filter((field) => next[field] !== base[field]).map((field) => [field, next[field]]))
        setAcknowledgements((previous) => {
          const before = { ...previous.before }
          const history = { ...previous.history }
          for (const field of ACCOUNT_DRAFT_FIELDS) {
            if (saved[field] === undefined) continue
            // A preceding refresh can finish during this PUT or after its acknowledgement.
            // Preserve every known predecessor until this value is confirmed or superseded.
            before[field] = [...new Set([...(history[field] ?? []), base[field], latestServerValues.current[field]])]
            history[field] = [...before[field], next[field]]
          }
          return { values: { ...previous.values, ...saved }, before, history }
        })
        section.rebase(next)
      },
      refresh: async () => { await Promise.allSettled([mutate(keys.myself()), ...(["Email", "Mobile", "Landline"] as const).map((type) => mutate(keys.contactPoints(type)))]) },
    }),
  })
  const { ref: footerRef, ...footerProps } = section.footerProps
  const submitAccount = async (): Promise<void> => {
    // The shared hook short-circuits unchanged values. Account must still validate
    // a stored invalid-age date or withheld required field on an unchanged Save.
    for (const name of ["firstName", "lastName"] as const) {
      section.form.setValue(name, normalizeName(section.form.getValues(name)), { shouldDirty: true })
    }
    if (deepEqual(section.form.getValues(), section.baseline)) {
      setOutcomes([])
      const checked = await registry.get("account")?.validate?.()
      if (checked && !checked.valid) {
        checked.focusFirstInvalid()
        return
      }
    }
    await section.submit()
  }
  const partLabel = { details: ACCOUNT_MESSAGES.detailsPart, timeZone: ACCOUNT_MESSAGES.timeZonePart, locale: ACCOUNT_MESSAGES.localePart }
  const mappedMessage = (mapped: MappedError): string => mapped.kind === "generic" ? mapped.message ?? "" : mapped.kind === "field" ? messageFor(mapped.messageKey) : ""
  // Observe contacts already fetched elsewhere; this read view never requests them.
  const mobileRows = useCachedValue<readonly ContactPoint[]>(keys.contactPoints("Mobile"))
  const view = myself ? toAccountView({ ...myself, ...acknowledged, ...(acknowledged.birthDate ? { birthDate: displayToWireDate(acknowledged.birthDate) ?? myself.birthDate } : {}) }, mobileRows) : null
  const { onReady } = useSectionFrame("account")
  const retryFocus = useRef<{ origin: HTMLButtonElement; controller: AbortController } | null>(null)
  useEffect(() => () => retryFocus.current?.controller.abort(), [])
  useEffect(() => {
    if (error) {
      retryFocus.current?.controller.abort()
      retryFocus.current = null
    }
  }, [error])
  const [failure, setFailure] = useState({ error, attempt: 0 })
  if (error && error !== failure.error) {
    setFailure({ error, attempt: failure.attempt + 1 })
  }
  useClaimMyselfError(Boolean(error))
  const readError = error ? mapFetchError("account", error) : null
  const state: FrameState = readError?.kind === "forbidden" || readError?.kind === "session" ? { error: readError } : section.isEditing && myself ? "ready" : readError ? { error: readError } : isLoading || !myself ? "loading" : "ready"
  const retryMyself = (): void => {
    retryFocus.current?.controller.abort()
    retryFocus.current = null
    const origin = document.activeElement
    if (origin instanceof HTMLButtonElement && origin.closest("section")?.id === "account") {
      const controller = new AbortController()
      retryFocus.current = { origin, controller }
      // Moving focus or clicking elsewhere gives up ownership, even if the
      // user later leaves focus on body before the request finishes.
      const cancelMoved = (event: Event): void => {
        if (!event.composedPath().includes(origin)) controller.abort()
      }
      document.addEventListener("focusin", cancelMoved, { signal: controller.signal })
      document.addEventListener("pointerdown", cancelMoved, { signal: controller.signal })
    }
    retry()
  }
  const settled = (): void => {
    onReady()
    if (state !== "ready" || !retryFocus.current) return
    const pending = retryFocus.current
    retryFocus.current = null
    const ownsFocus = !pending.controller.signal.aborted && (document.activeElement === pending.origin || document.activeElement === document.body)
    pending.controller.abort()
    if (ownsFocus) document.getElementById(sectionHeadingId("account"))?.focus()
  }
  return (
    <section id="account" aria-labelledby={sectionHeadingId("account")} className="min-w-0">
      <SectionHeader id="account" title={SHELL_MESSAGES.accountSectionHeading} editing={section.isEditing} actions={!section.isEditing && state === "ready" ? <Button variant="outline" size="touch" {...section.editButtonProps} onClick={() => { setOutcomes([]); section.startEdit() }}>{SECTION_MESSAGES.edit}</Button> : undefined} className="mb-2" />
      <StateFrame state={state} className={state === "ready" ? "overflow-visible border-0 bg-transparent" : undefined} skeleton="kv" loadError={{ kind: "page" }} level="section" onRetry={retryMyself} attempt={failure.attempt} onSettled={settled}>
        {view && <SectionContainer editing={section.isEditing} sectionId="account">
          {section.isEditing ? <>
            <AccountEditFields section={section} view={view} roles={myself?.roles ?? undefined} />
            {!section.isSaving && outcomes.some(({ mapped }) => mapped.kind !== "session") && <InlineBanner
              ref={footerRef} variant="error" className="m-3" focusable
              announceKey={footerProps.error?.announceKey ?? outcomeAttempt}
              action={<Button type="button" variant="link" size="touch" onClick={() => {
                document.getElementById(footerProps.saveButtonId ?? "")?.focus()
                void submitAccount()
              }}>{COMMON_MESSAGES.retry}</Button>}
            >{outcomes.filter(({ mapped }) => mapped.kind !== "session").map(({ part, mapped }) => <span className="block" key={part}>{formatMessage(ACCOUNT_MESSAGES.partFailed, { part: partLabel[part] })} {mappedMessage(mapped)}</span>)}</InlineBanner>}
            <SectionFooter {...footerProps} ref={outcomes.length ? undefined : footerRef} error={outcomes.length ? null : footerProps.error} onSave={() => void submitAccount()} onCancel={() => { setOutcomes([]); section.cancel() }} />
          </> : <KeyValueTable labelledBy={sectionHeadingId("account")} rows={accountRows(view)} />}
        </SectionContainer>}
      </StateFrame>
    </section>
  )
}
