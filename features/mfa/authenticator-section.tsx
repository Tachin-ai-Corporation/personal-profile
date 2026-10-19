"use client"

import { useEffect, useRef, useState } from "react"
import { sectionHeadingId, useClaimMyselfError, useMyself, useSectionFrame, type FrameState } from "@/features/shell"
import { mapFetchError } from "@/lib/api"
import { AuthenticatorLinkDialog } from "./authenticator-link-dialog"
import { useMfaAccess } from "./mfa-access"

/** Read-only landmark, deliberately outside the editable Section registry. */
export function AuthenticatorSection() {
  const { myself, error, isLoading, retry } = useMyself()
  const { onReady } = useSectionFrame("authenticator")
  const { mfaForbidden, handleFailure } = useMfaAccess()
  const retryFocus = useRef<{ origin: HTMLButtonElement; controller: AbortController } | null>(null)
  useEffect(() => () => retryFocus.current?.controller.abort(), [])
  useEffect(() => {
    if (error) {
      retryFocus.current?.controller.abort()
      retryFocus.current = null
    }
  }, [error])
  const [failure, setFailure] = useState({ error, attempt: 0 })
  if (error && error !== failure.error) setFailure({ error, attempt: failure.attempt + 1 })
  useClaimMyselfError(Boolean(error))
  const readError = error ? mapFetchError("authenticator", error) : null
  const state: FrameState = readError?.kind === "session" ? { error: readError }
    : mfaForbidden ? { error: { kind: "forbidden" } }
    : readError ? { error: readError }
    : isLoading || !myself ? "loading" : "ready"
  const retryMyself = (): void => {
    retryFocus.current?.controller.abort()
    retryFocus.current = null
    const origin = document.activeElement
    if (origin instanceof HTMLButtonElement && origin.closest("section")?.id === "authenticator") {
      const controller = new AbortController()
      retryFocus.current = { origin, controller }
      // Any deliberate focus or pointer move relinquishes this retry's focus ownership.
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
    if (ownsFocus) document.getElementById(sectionHeadingId("authenticator"))?.focus()
  }
  return <AuthenticatorLinkDialog onFailure={handleFailure} cardProps={{ state, linked: myself?.totpEnabled === true, onRetry: retryMyself, attempt: failure.attempt, onSettled: settled }} />
}
