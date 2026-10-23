"use client"

import { useEffect, useState } from "react"
import { isNpiRegistered, isTenantMember, type Myself, type UserNpi } from "@/lib/api"

/** Private, uncached availability, tied to this exact practice and identity. */
export function useRegisteredPractice(registration: UserNpi, myself: Myself | undefined, identityReady: boolean): "notice" | "register" | null {
  const practice = registration.practice
  const organization = practice?.organization
  const recordId = practice?.id
  const identityId = identityReady ? myself?.id : undefined
  const eligible = identityId !== undefined && practice !== undefined && !organization && practice.verified === true
  const [answer, setAnswer] = useState<{ readonly recordId: number; readonly identityId: number; readonly available: boolean } | null>(null)

  useEffect(() => {
    if (!eligible || recordId === undefined || identityId === undefined) return
    const controller = new AbortController()
    void isNpiRegistered(recordId, { signal: controller.signal }).then((response) => {
      if (controller.signal.aborted) return
      setAnswer({ recordId, identityId, available: response.success && response.data === false })
    })
    return () => controller.abort()
  }, [eligible, recordId, identityId])

  if (!identityReady || !myself || !practice) return null
  if (organization) {
    const tenantId = organization.tenantId
    if (tenantId === null || tenantId === undefined) return null
    return isTenantMember(myself, tenantId) ? null : "notice"
  }
  return eligible && answer?.recordId === recordId && answer?.identityId === identityId && answer?.available ? "register" : null
}
