"use client"

import { useState } from "react"
import { useCachedValue } from "@/features/shell/use-cached-value"
import { KeyValueTable, SectionLandmark, StateFrame, sectionHeadingId, useClaimMyselfError, useMyself, useSectionFrame, type FrameState, type KeyValueRow } from "@/features/shell"
import { keys, mapFetchError, type ContactPoint } from "@/lib/api"
import { ACCOUNT_MESSAGES, FIELD_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { toAccountView, type AccountView } from "./view-model"

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

/** Story 7.4: read-only Account data on the existing identity key. */
export function AccountSettingsSection() {
  const { myself, error, isLoading, retry } = useMyself()
  // Observe contacts already fetched elsewhere; this read view never requests them.
  const mobileRows = useCachedValue<readonly ContactPoint[]>(keys.contactPoints("Mobile"))
  const { onReady } = useSectionFrame("account")
  const [failure, setFailure] = useState({ error, attempt: 0 })
  if (error && error !== failure.error) {
    setFailure({ error, attempt: failure.attempt + 1 })
  }
  useClaimMyselfError(Boolean(error))
  const state: FrameState = error ? { error: mapFetchError("account", error) } : isLoading || !myself ? "loading" : "ready"
  return (
    <SectionLandmark id="account" title={SHELL_MESSAGES.accountSectionHeading}>
      <StateFrame state={state} skeleton="kv" loadError={{ kind: "page" }} level="section" onRetry={retry} attempt={failure.attempt} onSettled={onReady}>
        {myself && <KeyValueTable labelledBy={sectionHeadingId("account")} rows={accountRows(toAccountView(myself, mobileRows))} />}
      </StateFrame>
    </SectionLandmark>
  )
}
