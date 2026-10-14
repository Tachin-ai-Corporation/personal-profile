import type { ReactNode } from "react"
import { SWRConfig } from "swr"
import { PortalUrlProvider, SwrProvider } from "@/features/shell"

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
