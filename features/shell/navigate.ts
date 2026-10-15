"use client"

import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext } from "react"
import { endSession, recordUserActivity } from "@/lib/api"
import { runBeforeExit } from "./exit-hooks"
import { isHandoffHref } from "./handoff"
import { beginExit, cancelExit, confirmUnload, requestLeave } from "./leave"
import { HASH_NAVIGATE_EVENT, PAGE_PATHS, PAGE_TAB_PARAM, pageOfPath, TAB_PARAM, type NavTarget, type PageId } from "./nav-types"
import { usePortalUrl } from "./portal-url-provider"

/** Logout gets at most this long before the portal navigation (Story 1.7). */
export const LOGOUT_TIMEOUT_MS = 3000

export interface NavigateRouter {
  push(href: string): void
}

export interface NavigateLocation {
  readonly pathname: string
  readonly search: string
  assign(url: string): void
}

export interface NavigateDeps {
  readonly router: NavigateRouter
  readonly portalUrl: string
  /** The page being shown; defaults to the one the pathname belongs to. */
  readonly currentPage?: PageId | null
  /** Test seams. */
  readonly location?: NavigateLocation
  readonly history?: Pick<History, "replaceState">
  readonly logout?: () => Promise<unknown>
  readonly logoutTimeoutMs?: number
  /** Records a page/tab move as user activity (Story 1.6); fire and forget. */
  readonly recordActivity?: () => unknown
}

/** `?…` with the tab param (`TAB_PARAM` unless `param`) set, or left as is; every other param kept. */
function queryWith(search: string, tab: string | undefined, param: string = TAB_PARAM): string {
  const params = new URLSearchParams(search)
  if (tab) params.set(param, tab)
  const query = params.toString()
  return query ? `?${query}` : ""
}

function withHash(path: string, hash: string | undefined): string {
  if (!hash) return path
  return `${path}#${hash.replace(/^#/, "")}`
}

/** Best effort: failures and slow answers are ignored after `timeoutMs`. */
async function logoutWithin(logout: () => Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  try {
    await Promise.race([logout().catch(() => undefined), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The app's one navigation (AD-26). Every target first passes `requestLeave()`.
 * Resolves `true` when the move went ahead.
 *
 * - page and tab moves count as user activity (an activity ping, Story 1.6).
 * - page: `router.push`, which keeps the root SWR cache.
 * - tab on the current page: `?tab=` by history replace (other params kept), the old hash dropped, no scroll;
 *   with a `hash`, `HASH_NAVIGATE_EVENT` then lets `useHashAnchors` scroll to it.
 * - portal: before-exit callbacks → logout (≤ 3 s, failures ignored) → same-tab `location.assign(portalUrl)`.
 * - handoff: same-tab `location.assign(href)`; no logout, no before-exit callbacks. Only an `href`
 *   on `BFF_PATHS.handoffPortal` (`handoffHref()`) is followed; any other resolves `false` untouched.
 */
export async function navigate(target: NavTarget, deps: NavigateDeps): Promise<boolean> {
  const location = deps.location ?? window.location

  if ("external" in target) {
    // Only the hand-off route may be a hand-off target (`handoffHref()`, F6-1): anything else goes nowhere.
    if (target.external === "handoff" && !isHandoffHref(target.href)) return false
    // One exit at a time: a second activation while logout is pending does nothing.
    if (!beginExit()) return false
    if (!(await requestLeave())) {
      cancelExit()
      return false
    }
    if (target.external === "portal") {
      runBeforeExit()
      await logoutWithin(deps.logout ?? endSession, deps.logoutTimeoutMs ?? LOGOUT_TIMEOUT_MS)
      confirmUnload()
      location.assign(deps.portalUrl)
      return true
    }
    confirmUnload()
    location.assign(target.href)
    return true
  }

  const samePage = (deps.currentPage ?? pageOfPath(location.pathname)) === target.page
  // The current page's item with no tab or hash does nothing.
  if (samePage && !target.tab && !target.hash) return true
  if (!(await requestLeave())) return false
  void (deps.recordActivity ?? recordUserActivity)()

  if (samePage) {
    const history = deps.history ?? window.history
    // `null` state: Next's patched history then syncs `useSearchParams` and keeps its own tree.
    history.replaceState(null, "", withHash(`${location.pathname}${queryWith(location.search, target.tab, PAGE_TAB_PARAM[target.page])}`, target.hash))
    // A replace fires no hashchange: tell the page's anchors (useHashAnchors) to follow the new hash.
    if (target.hash && typeof window !== "undefined") window.dispatchEvent(new Event(HASH_NAVIGATE_EVENT))
    return true
  }
  deps.router.push(withHash(`${PAGE_PATHS[target.page]}${queryWith("", target.tab, PAGE_TAB_PARAM[target.page])}`, target.hash))
  return true
}

const CurrentPageContext = createContext<PageId | null>(null)

/** Provided by the page frame: which page is being shown. */
export const CurrentPageProvider = CurrentPageContext.Provider

export function useCurrentPage(): PageId | null {
  return useContext(CurrentPageContext)
}

/** `navigate` bound to the Next router, this session's portal URL and the current page. */
export function useNavigate(): (target: NavTarget) => Promise<boolean> {
  const router = useRouter()
  const portalUrl = usePortalUrl()
  const currentPage = useCurrentPage()
  return useCallback((target: NavTarget) => navigate(target, { router, portalUrl, currentPage }), [router, portalUrl, currentPage])
}
