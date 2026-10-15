"use client"

import type { ReactNode } from "react"
import { mapFetchError, pageUser } from "@/lib/api"
import type { PageIdleTiming } from "@/lib/shared/bff-contract"
import { environmentOfPortalUrl } from "@/lib/shared/environments"
import { AppBar } from "./app-bar"
import { DraftsProvider } from "./draft-provider"
import { IdleWarning } from "./idle-warning"
import { LeaveGuard } from "./leave-guard"
import { MyselfErrorClaimProvider, useMyselfErrorClaimed } from "./myself-error-claim"
import type { PageId, SectionId } from "./nav-types"
import { CurrentPageProvider } from "./navigate"
import { usePortalUrl } from "./portal-url-provider"
import { ReadStateFor } from "./read-state"
import { SectionRegistryProvider } from "./section-registry"
import { SessionDialog } from "./session-dialog"
import { useMyself } from "./use-myself"

/**
 * The Launching user's read failure, via `ReadStateFor` (nothing while loading
 * or on success), unless a mounted Section shows it itself (`useClaimMyselfError`).
 */
function MyselfReadState() {
  const { error, retry } = useMyself()
  const claimed = useMyselfErrorClaimed()
  if (!error || claimed) return null
  return <ReadStateFor error={mapFetchError("page", error)} onRetry={retry} className="mx-4 mt-4 md:mx-6" />
}

/**
 * The page's drafts, keyed to the Launching user once `myself` loads (Story
 * 1.15): the pinned page user (D-A), so a later `myself` of another user
 * (a launch as B in this browser) never moves A's unsaved edits to B's key.
 */
function PageDrafts({ children }: { readonly children: ReactNode }) {
  const { myself } = useMyself()
  const environment = environmentOfPortalUrl(usePortalUrl())
  return (
    <DraftsProvider userId={pageUser.id() ?? myself?.id} environment={environment}>
      {children}
    </DraftsProvider>
  )
}

interface PageFrameBaseProps {
  /** The shared profile header (features/header), composed by the route. */
  readonly header: ReactNode
  /** The page's tabs and panels. */
  readonly children: ReactNode
  /** The idle warning's deadlines, from `requirePageSession()` (Story 1.6). */
  readonly idle: PageIdleTiming
  /** The leave guard's save order (`SAVE_ORDER` on `/`); defaults to `displayOrder`. */
  readonly saveOrder?: readonly SectionId[]
}

/**
 * Save all exists only on `/` (AD-8): `saveAllSlot` (Team A's bar and pill)
 * is accepted only with `page: "profile"`, and renders after `main`, so it is
 * last in the tab order and reads the page's own registry.
 */
export type PageFrameProps = PageFrameBaseProps &
  (
    | { readonly page: Extract<PageId, "profile">; readonly saveAllSlot?: ReactNode }
    | { readonly page: Extract<PageId, "account">; readonly saveAllSlot?: never }
  )

/**
 * The page frame shared by `/` and `/account` (Stories 1.8, 7.1): app bar →
 * header → tabs → content, with the page's own Section registry, its drafts
 * (Story 1.15), its leave guard, the idle warning and the session dialog. Must sit inside
 * `PortalUrlProvider`.
 */
export function PageFrame({ page, header, children, idle, saveAllSlot, saveOrder }: PageFrameProps) {
  return (
    <CurrentPageProvider value={page}>
      <SectionRegistryProvider>
        <MyselfErrorClaimProvider>
          <PageDrafts>
            <div className="min-h-screen bg-background">
              <AppBar current={page} />
              <main>
                {header}
                <MyselfReadState />
                {children}
              </main>
              {page === "profile" ? saveAllSlot : null}
            </div>
            <LeaveGuard order={saveOrder} />
            <IdleWarning {...idle} />
            <SessionDialog />
          </PageDrafts>
        </MyselfErrorClaimProvider>
      </SectionRegistryProvider>
    </CurrentPageProvider>
  )
}
