"use client"

import { useRef } from "react"
import useSWR from "swr"
import { keys, type ApiResponseError, type ContactPoint, type ContactPointType } from "@/lib/api"

/** Contact writes can replace IDs. Invalidate the old baseline before revalidating it. */
export function useContactRead(type: ContactPointType) {
  const read = useSWR<ContactPoint[] | undefined, ApiResponseError>(keys.contactPoints(type))
  const pending = useRef<Promise<ContactPoint[] | undefined> | null>(null)

  /** Retry only the read, joining repeat presses. SWR owns recovery across panel unmounts. */
  function refresh(invalidate = true): Promise<ContactPoint[] | undefined> {
    if (pending.current) return pending.current
    pending.current = (async () => {
      try {
        // mutate() alone returns cached rows on failure. Remove obsolete IDs first so failure leaves
        // no editable baseline; SWR broadcasts its loading/error state to every current consumer.
        if (invalidate) await read.mutate(undefined, { revalidate: false })
        return (await read.mutate()) ?? undefined
      } finally {
        pending.current = null
      }
    })()
    return pending.current
  }

  return { ...read, refresh }
}
