"use client"

import { createContext, useContext, type ReactNode } from "react"
import { configureApiClient } from "@/lib/api"

const PortalUrlContext = createContext<string | null>(null)

export interface PortalUrlProviderProps {
  /** The session environment's portal URL, from the server page (Story 1.4, D4). */
  readonly portalUrl: string
  readonly children: ReactNode
}

/**
 * Receives the portal URL from the server page and registers it with
 * `lib/api/client.ts` (registration happens during render, browser only, so
 * it is in place before any child effect runs). There is no session binding (D5).
 */
export function PortalUrlProvider({ portalUrl, children }: PortalUrlProviderProps) {
  if (typeof window !== "undefined") configureApiClient({ portalUrl })
  return <PortalUrlContext.Provider value={portalUrl}>{children}</PortalUrlContext.Provider>
}

/** The portal URL for this session (consumed by `navigate()` in Story 7.0b). */
export function usePortalUrl(): string {
  const value = useContext(PortalUrlContext)
  if (value === null) throw new Error("usePortalUrl must be used inside PortalUrlProvider")
  return value
}
