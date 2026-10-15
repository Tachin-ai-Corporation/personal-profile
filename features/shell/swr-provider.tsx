"use client"

import type { ReactNode } from "react"
import { SWRConfig } from "swr"
import { swrFetcher } from "@/lib/api"
import { MYSELF_RETRY_COUNT } from "./use-myself"

/**
 * Base of the `myself` retry backoff: retry n waits floor((0.5–1.5) × 2^n) ×
 * this, i.e. 1–2 s, then 2–5 s, then 4–11 s (at most ~18 s in all before the
 * Retry UI). A manual Retry starts a fresh request with a fresh 3-retry budget.
 */
export const SWR_ERROR_RETRY_INTERVAL_MS = 1000

/**
 * The one root `SWRConfig` (AD-10), mounted in `app/layout.tsx` so every page
 * shares one cache. No page or feature mounts another. Errors are never
 * retried automatically, except the `myself` read, which opts in on its hook
 * (`useMyself`, human decision 2026-10-14) and uses the retry budget below.
 */
export function SwrProvider({ children }: { readonly children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        shouldRetryOnError: false,
        errorRetryCount: MYSELF_RETRY_COUNT,
        errorRetryInterval: SWR_ERROR_RETRY_INTERVAL_MS,
      }}
    >
      {children}
    </SWRConfig>
  )
}
