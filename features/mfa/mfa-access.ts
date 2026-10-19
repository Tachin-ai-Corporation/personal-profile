"use client"

import { useCallback, useState } from "react"
import { forbiddenScopeFor, type MappedError } from "@/lib/api"

/** Local controller shared by the card and its later enrollment/disable flows. */
export function useMfaAccess() {
  const [mfaForbidden, setMfaForbidden] = useState(false)
  const handleFailure = useCallback((path: string, error: MappedError): void => {
    if (error.kind === "forbidden" && forbiddenScopeFor(path, "account")?.owner === "authenticator") {
      setMfaForbidden(true)
    }
  }, [])
  return { mfaForbidden, handleFailure }
}
