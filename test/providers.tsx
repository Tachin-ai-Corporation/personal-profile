import type { ReactNode } from "react"
import { SWRConfig } from "swr"
import { PortalUrlProvider, SwrProvider } from "@/features/shell"
import type { PageIdleTiming } from "@/lib/shared/bff-contract"

export const TEST_PORTAL_URL = "https://portal.test"

/** The app's root SWR provider with a fresh cache per test, plus the portal URL. */
export function TestProviders({ children }: { readonly children: ReactNode }) {
  return (
    <SwrProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <PortalUrlProvider portalUrl={TEST_PORTAL_URL}>{children}</PortalUrlProvider>
      </SWRConfig>
    </SwrProvider>
  )
}

/** Idle timing for a page that was just rendered with a fresh session (Story 1.6). */
export function testIdle(now: number = Date.now()): PageIdleTiming {
  return { idleTimeoutSec: 900, lastSeen: now, absoluteExpiresAt: now + 8 * 60 * 60 * 1000, serverNow: now }
}
