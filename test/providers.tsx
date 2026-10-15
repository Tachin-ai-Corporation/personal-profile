import { render, type RenderResult } from "@testing-library/react"
import type { HttpHandler } from "msw"
import { useLayoutEffect, type ReactElement, type ReactNode } from "react"
import { SWRConfig } from "swr"
import { vi, type Mock } from "vitest"
import {
  CurrentPageProvider,
  DraftsProvider,
  PortalUrlProvider,
  SectionFrameProvider,
  SectionRegistryProvider,
  SwrProvider,
  useSectionRegistry,
  type PageId,
  type SectionRegistry,
} from "@/features/shell"
import type { PageIdleTiming } from "@/lib/shared/bff-contract"
import type { Environment } from "@/lib/shared/environments"
import { server } from "./msw-server"
import { myselfWire } from "./myself-fixture"
import { setTestUrl } from "./next-navigation"
import { pageReadHandlers, type PageReadOptions } from "./page-handlers"

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

/** The environment `renderInPage` keys drafts with (`pp:draft:v1:demo:<userId>:<section>`). */
export const TEST_DRAFT_ENVIRONMENT: Environment = "demo"

export interface RenderInPageOptions extends PageReadOptions {
  /** The page the Section sits on (`useCurrentPage()`, and which read handlers are installed). */
  readonly page: PageId
  /** The URL before render (`setTestUrl`), e.g. `"/?tab=contacts#phone"`; unchanged when omitted. */
  readonly url?: string
  /** Extra MSW handlers, installed after the page's defaults (so they win), e.g. a failing read or a write. */
  readonly handlers?: readonly HttpHandler[]
}

export interface RenderInPageResult extends RenderResult {
  /** The page's Section registry (dirty state, `save`, `discard`). */
  readonly registry: SectionRegistry
  /** The `SectionFrameProvider` sink: called with a frame id each time `useSectionFrame(id).onReady` fires. */
  readonly frameReady: Mock<(frameId: string) => void>
}

/** Hands the page's registry to `renderInPage` once mounted (render flushes effects). */
function CaptureRegistry({ onRegistry }: { readonly onRegistry: (registry: SectionRegistry) => void }) {
  const registry = useSectionRegistry()
  useLayoutEffect(() => onRegistry(registry), [onRegistry, registry])
  return null
}

/** The drafts owner: the `myself` override's numeric `id`, else the fixture user's. */
function draftUserId(myself: PageReadOptions["myself"]): number {
  const id = typeof myself === "object" && myself !== null && !("status" in myself) ? (myself as { id?: unknown }).id : undefined
  return typeof id === "number" ? id : (myselfWire().id as number)
}

/**
 * Renders a Section (or any page fragment) the way `PageFrame` hosts it,
 * without the app bar, header, tabs or dialogs (spec F7-1, for both teams):
 * `TestProviders` (fresh SWR cache, portal URL) → `CurrentPageProvider` →
 * `SectionRegistryProvider` → `DraftsProvider` (demo environment, the fixture
 * user) → a spy `SectionFrameProvider`. Before rendering it installs the
 * page's read handlers (`test/page-handlers.ts`; `myself` / `contacts` are
 * passed through), then `handlers`, which win. A `server.use(…)` made before
 * this call is shadowed by the defaults: pass it as `handlers` instead.
 *
 *   const { registry } = renderInPage(<AccountSettingsSection />, { page: "account", myself: myselfWire({ firstName: "Bo" }) })
 */
export function renderInPage(ui: ReactElement, { page, url, handlers = [], ...reads }: RenderInPageOptions): RenderInPageResult {
  if (url !== undefined) setTestUrl(url)
  // Each `server.use` call goes in front of the earlier ones, so the test's own handlers win over the page defaults.
  server.use(...pageReadHandlers(page, reads))
  if (handlers.length > 0) server.use(...handlers)
  const frameReady = vi.fn<(frameId: string) => void>()
  const captured: { registry?: SectionRegistry } = {}
  const capture = (registry: SectionRegistry): void => {
    captured.registry = registry
  }
  const result = render(
    <TestProviders>
      <CurrentPageProvider value={page}>
        <SectionRegistryProvider>
          <CaptureRegistry onRegistry={capture} />
          <DraftsProvider userId={draftUserId(reads.myself)} environment={TEST_DRAFT_ENVIRONMENT}>
            <SectionFrameProvider onReady={frameReady}>{ui}</SectionFrameProvider>
          </DraftsProvider>
        </SectionRegistryProvider>
      </CurrentPageProvider>
    </TestProviders>,
  )
  if (!captured.registry) throw new Error("renderInPage: the Section registry was not mounted")
  return { ...result, registry: captured.registry, frameReady }
}
