"use client"

import { useEffect, useRef, useState } from "react"
import { useCachedValue } from "@/features/shell/use-cached-value"
import { KeyValueTable, SectionHeader, SectionContainer, SectionFooter, StateFrame, useSectionForm, useSectionRegistry, useSectionDraft, sectionHeadingId, useClaimMyselfError, useMyself, useSectionFrame, type FrameState, type KeyValueRow } from "@/features/shell"
import { keys, loadContactPoints, mapFetchError, type ContactPoint, type MappedError } from "@/lib/api"
import { ACCOUNT_MESSAGES, COMMON_MESSAGES, FIELD_MESSAGES, SHELL_MESSAGES, SECTION_MESSAGES, formatMessage, messageFor } from "@/lib/shared/messages"
import useSWR, { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import { InlineBanner } from "@/components/ui/inline-banner"
import { deepEqual } from "@/lib/shared/deep-equal"
import { normalizeName } from "@/lib/shared/person-rules"
import { displayToWireDate } from "@/lib/shared/dates"
import { ACCOUNT_DRAFT_FIELDS, accountFormDefaults, accountSchema, accountDraftDiff, type AccountFormValues } from "./schema"
import { saveAccount, type AccountSaveOutcome } from "./account-save"
import { usePrimaryReadAttempt } from "./account-primary-picker"
import { AccountEditFields } from "./account-edit-fields"
import { restorePrimaryDraft, samePrimary } from "./primary-contacts"
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
  const draft = useSectionDraft("account")
  const [notices, setNotices] = useState({ email: false, mobile: false })
  const [loadPrimaries, setLoadPrimaries] = useState(false)
  const pendingRestore = useRef(false)
  const [restoreDependencies, setRestoreDependencies] = useState({ email: false, mobile: false })
  const [restoring, setRestoring] = useState(false)
  const email = useSWR<readonly ContactPoint[] | undefined>(loadPrimaries && (!restoring || draft.kind !== "none") ? keys.contactPoints("Email") : null, () => loadContactPoints("Email"))
  const mobile = useSWR<readonly ContactPoint[] | undefined>(loadPrimaries && (!restoring || draft.kind !== "none") ? keys.contactPoints("Mobile") : null, () => loadContactPoints("Mobile"))
  const emailAttempt = usePrimaryReadAttempt(email.error)
  const mobileAttempt = usePrimaryReadAttempt(mobile.error)
  const section = useSectionForm<AccountFormValues>({
    id: "account", label: SHELL_MESSAGES.accountSectionHeading, displayOrder: 1,
    schema: accountSchema(myself?.roles ?? undefined, new Date(), { baseline, contacts: { email: email.error ? undefined : email.data, mobile: mobile.error ? undefined : mobile.data } }), baseline, cancelFocus: "edit", onNoChanges: "status",
    fieldOrder: ["firstName", "lastName", "primaryEmail", "primaryPhone", "birthDate", "preferredLanguage", "timeZone", "locale"], draftFields: ACCOUNT_DRAFT_FIELDS,
    transformDraft: (draft, base) => {
      setLoadPrimaries(true)
      const dependencies = {
        email: typeof draft.primaryEmail === "string" && !samePrimary("Email", draft.primaryEmail, base.primaryEmail),
        mobile: typeof draft.primaryPhone === "string" && !samePrimary("Mobile", draft.primaryPhone, base.primaryPhone),
      }
      setRestoreDependencies((previous) => previous.email === dependencies.email && previous.mobile === dependencies.mobile ? previous : dependencies)
      const restored = restorePrimaryDraft(draft, base, { email: email.error ? undefined : email.data, mobile: mobile.error ? undefined : mobile.data })
      pendingRestore.current = restored === null
      setRestoring(restored === null)
      return restored
    },
    describeDraftDiff: accountDraftDiff, dataStatus: error ? "error" : myself ? "loaded" : "loading",
    successToast: ACCOUNT_MESSAGES.updated,
    save: async (values, base) => {
      setNotices({ email: false, mobile: false })
      return saveAccount(values, base, {
      contacts: { email: email.error ? undefined : email.data, mobile: mobile.error ? undefined : mobile.data },
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
      })
    },
  })
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !section.isEditing && !pendingRestore.current) setLoadPrimaries(false)
    wasEditing.current = section.isEditing
  }, [section.isEditing])
  useEffect(() => registry.observe((event) => {
    if (event.type === "discarded" && event.id === "account") { pendingRestore.current = false; setRestoring(false) }
  }), [registry])
  useEffect(() => {
    if (section.isEditing || !pendingRestore.current) return
    if (restoreDependencies.email && (email.error || email.data === undefined)) return
    if (restoreDependencies.mobile && (mobile.error || mobile.data === undefined)) return
    // This is the still-pending explicit Restore, never a rewrite of live choices.
    if (draft.kind === "restore") draft.restore()
    else if (draft.kind === "conflict") draft.keepMine()
    else pendingRestore.current = false
  }, [draft, section.isEditing, email.data, mobile.data, email.error, mobile.error, restoreDependencies])
  const { ref: footerRef, ...footerProps } = section.footerProps
  const submitAccount = async (): Promise<void> => {
    setNotices({ email: false, mobile: false })
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
  const view = myself ? toAccountView({ ...myself, ...acknowledged, ...(acknowledged.primaryEmail !== undefined ? { email: acknowledged.primaryEmail } : {}), ...(acknowledged.primaryPhone !== undefined ? { phoneNumber: acknowledged.primaryPhone } : {}), ...(acknowledged.birthDate ? { birthDate: displayToWireDate(acknowledged.birthDate) ?? myself.birthDate } : {}) }, mobileRows) : null
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
  const restoreError = (restoreDependencies.email && email.error) || (restoreDependencies.mobile && mobile.error)
  const restoreBusy = (restoreDependencies.email && email.isValidating) || (restoreDependencies.mobile && mobile.isValidating)
  return (
    <section id="account" aria-labelledby={sectionHeadingId("account")} className="min-w-0">
      <SectionHeader id="account" title={SHELL_MESSAGES.accountSectionHeading} editing={section.isEditing} actions={!section.isEditing && state === "ready" ? <Button variant="outline" size="touch" {...section.editButtonProps} onClick={() => { pendingRestore.current = false; setRestoring(false); setNotices({ email: false, mobile: false }); setOutcomes([]); setLoadPrimaries(true); section.startEdit() }}>{SECTION_MESSAGES.edit}</Button> : undefined} className="mb-2" />
      <StateFrame state={state} className={state === "ready" ? "overflow-visible border-0 bg-transparent" : undefined} skeleton="kv" loadError={{ kind: "page" }} level="section" onRetry={retryMyself} attempt={failure.attempt} onSettled={settled}>
        {view && <SectionContainer editing={section.isEditing} sectionId="account">
          {section.isEditing ? <>
            <AccountEditFields notices={notices} onPrimaryChange={(kind) => setNotices((previous) => ({ ...previous, [kind]: true }))} section={section} view={view} roles={myself?.roles ?? undefined} contacts={{
              email: { data: email.data, error: email.error, loading: email.isLoading || email.isValidating, attempt: emailAttempt, retry: () => { void email.mutate() } },
              mobile: { data: mobile.data, error: mobile.error, loading: mobile.isLoading || mobile.isValidating, attempt: mobileAttempt, retry: () => { void mobile.mutate() } },
            }} />
            {!section.isSaving && outcomes.some(({ mapped }) => mapped.kind !== "session" && mapped.kind !== "field") && <InlineBanner
              ref={footerRef} variant="error" className="m-3" focusable
              announceKey={footerProps.error?.announceKey ?? outcomeAttempt}
              action={<Button type="button" variant="link" size="touch" onClick={() => {
                document.getElementById(footerProps.saveButtonId ?? "")?.focus()
                void submitAccount()
              }}>{COMMON_MESSAGES.retry}</Button>}
            >{outcomes.filter(({ mapped }) => mapped.kind !== "session" && mapped.kind !== "field").map(({ part, mapped }) => <span className="block" key={part}>{formatMessage(ACCOUNT_MESSAGES.partFailed, { part: partLabel[part] })} {mappedMessage(mapped)}</span>)}</InlineBanner>}
            <SectionFooter {...footerProps} ref={outcomes.length ? undefined : footerRef} error={outcomes.length ? null : footerProps.error} onSave={() => void submitAccount()} onCancel={() => { setOutcomes([]); setNotices({ email: false, mobile: false }); section.cancel() }} />
          </> : <><KeyValueTable labelledBy={sectionHeadingId("account")} rows={accountRows(view)} />
            {restoring && draft.kind !== "none" && <StateFrame state={restoreError && !restoreBusy ? { error: mapFetchError("account", restoreError) } : "loading"} attempt={emailAttempt + mobileAttempt} skeleton="bars" loadError={{ kind: "page" }} level="section" onRetry={() => { if (restoreDependencies.email && email.error) void email.mutate(); if (restoreDependencies.mobile && mobile.error) void mobile.mutate() }} />}
          </>}
        </SectionContainer>}
      </StateFrame>
    </section>
  )
}
