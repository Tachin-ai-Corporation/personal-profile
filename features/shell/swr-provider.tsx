"use client"

import type { ReactNode } from "react"
import { SWRConfig } from "swr"
import { swrFetcher } from "@/lib/api"

/**
 * The one root `SWRConfig` (AD-10), mounted in `app/layout.tsx` so every page
 * shares one cache. No page or feature mounts another.
 */
export function SwrProvider({ children }: { readonly children: ReactNode }) {
  return <SWRConfig value={{ fetcher: swrFetcher, shouldRetryOnError: false }}>{children}</SWRConfig>
}
