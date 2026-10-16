"use client"

import { useEffect, useRef, useState } from "react"
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
  const state: FrameState = error ? { error: mapFetchError("account", error) } : isLoading || !myself ? "loading" : "ready"
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
    <SectionLandmark id="account" title={SHELL_MESSAGES.accountSectionHeading}>
      <StateFrame state={state} skeleton="kv" loadError={{ kind: "page" }} level="section" onRetry={retryMyself} attempt={failure.attempt} onSettled={settled}>
        {myself && <KeyValueTable labelledBy={sectionHeadingId("account")} rows={accountRows(toAccountView(myself, mobileRows))} />}
      </StateFrame>
    </SectionLandmark>
  )
}
