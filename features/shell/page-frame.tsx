"use client"

import type { ReactNode } from "react"
import { mapFetchError } from "@/lib/api"
import type { PageIdleTiming } from "@/lib/shared/bff-contract"
import { AppBar } from "./app-bar"
import { IdleWarning } from "./idle-warning"
import { LeaveGuard } from "./leave-guard"
import type { PageId } from "./nav-types"
import { CurrentPageProvider } from "./navigate"
import { ReadStateFor } from "./read-state"
import { SectionRegistryProvider } from "./section-registry"
import { SessionDialog } from "./session-dialog"
import { useMyself } from "./use-myself"

/** The Launching user's read failure, via `ReadStateFor` (nothing while loading or on success). */
function MyselfReadState() {
  const { error, retry } = useMyself()
  if (!error) return null
  return <ReadStateFor error={mapFetchError("page", error)} onRetry={retry} className="mx-4 mt-4 md:mx-6" />
}

export interface PageFrameProps {
  readonly page: PageId
  /** The shared profile header (features/header), composed by the route. */
  readonly header: ReactNode
  /** The page's tabs and panels. */
  readonly children: ReactNode
  /** The idle warning's deadlines, from `requirePageSession()` (Story 1.6). */
  readonly idle: PageIdleTiming
}

/**
 * The page frame shared by `/` and `/account` (Stories 1.8, 7.1): app bar →
 * header → tabs → content, with the page's own Section registry, its leave
 * guard, the idle warning and the session dialog. Must sit inside
 * `PortalUrlProvider`.
 */
export function PageFrame({ page, header, children, idle }: PageFrameProps) {
  return (
    <CurrentPageProvider value={page}>
      <SectionRegistryProvider>
        <div className="min-h-screen bg-background">
          <AppBar current={page} />
          <main>
            {header}
            <MyselfReadState />
            {children}
          </main>
        </div>
        <LeaveGuard />
        <IdleWarning {...idle} />
        <SessionDialog />
      </SectionRegistryProvider>
    </CurrentPageProvider>
  )
}
