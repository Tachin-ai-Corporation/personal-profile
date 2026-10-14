"use client"

import type { ReactNode } from "react"
import { configureClient } from "@/lib/api"

/**
 * Registers the page-embedded session binding and portal URL with `callApi`
 * (AD-17). It runs `configureClient` in the RENDER body, not an effect: SWR
 * starts fetching in a layout effect and child effects run before parent
 * effects, so registration must happen before any child mounts.
 */
export function ClientConfig({
  sessionBinding,
  portalUrl,
  children,
}: {
  sessionBinding: string
  portalUrl: string
  children: ReactNode
}) {
  // Browser only: during SSR this would leave a user's binding in shared
  // server module state.
  if (typeof window !== "undefined") configureClient({ sessionBinding, portalUrl })
  return <>{children}</>
}
