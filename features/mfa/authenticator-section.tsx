"use client"

import { useState } from "react"
import { useClaimMyselfError, useMyself, useSectionFrame, type FrameState } from "@/features/shell"
import { mapFetchError } from "@/lib/api"
import { AuthenticatorCard } from "./authenticator-card"
import { useMfaAccess } from "./mfa-access"

/** Read-only landmark, deliberately outside the editable Section registry. */
export function AuthenticatorSection() {
  const { myself, error, isLoading, retry } = useMyself()
  const { onReady } = useSectionFrame("authenticator")
  const { mfaForbidden } = useMfaAccess()
  const [failure, setFailure] = useState({ error, attempt: 0 })
  if (error && error !== failure.error) setFailure({ error, attempt: failure.attempt + 1 })
  useClaimMyselfError(Boolean(error))
  const readError = error ? mapFetchError("authenticator", error) : null
  const state: FrameState = readError?.kind === "session" ? { error: readError }
    : mfaForbidden ? { error: { kind: "forbidden" } }
    : readError ? { error: readError }
    : isLoading || !myself ? "loading" : "ready"
  return <AuthenticatorCard state={state} linked={myself?.totpEnabled === true} onRetry={retry} attempt={failure.attempt} onSettled={onReady} />
}
