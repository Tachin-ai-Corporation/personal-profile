"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { isProductionBuild } from "@/lib/shared/app-env"
import { PAGE_TAB_PARAM, pageTabTarget, type NavTarget, type PageId } from "./nav-types"
import { useNavigate } from "./navigate"
import type { PageTabDefinition } from "./page-tabs-config"

export interface PageTabsProps<T extends string> {
  /** The page the strip belongs to: tab changes are `navigate({ page, tab })` (leave guard first). */
  readonly page: PageId
  /** The tabs in order (static config, e.g. `PROFILE_TAB_DEFINITIONS`). */
  readonly tabs: readonly PageTabDefinition<T>[]
  /**
   * Each tab's panel, as React elements composed by the route (server
   * components welcome). Only the selected one is mounted, so a panel's reads
   * start when its tab is first opened.
   */
  readonly panels: Readonly<Record<T, ReactNode>>
  readonly defaultTab: T
  /** The tablist's accessible name (catalog copy). */
  readonly "aria-label"?: string
}

/**
 * Development check (F6-1 review M3): unique ids, `defaultTab` among them,
 * and every id a tab `navigate()` can route on `page`. Throws outside
 * production builds; production renders whatever it was given.
 */
export function assertPageTabsConfig(page: PageId, tabs: readonly PageTabDefinition<string>[], defaultTab: string): void {
  if (isProductionBuild()) return
  const ids = tabs.map((tab) => tab.id)
  const fail = (problem: string): never => {
    throw new Error(`PageTabs (${page}): ${problem}`)
  }
  if (new Set(ids).size !== ids.length) fail("duplicate tab ids")
  if (!ids.includes(defaultTab)) fail(`defaultTab "${defaultTab}" is not one of the tabs`)
  const unroutable = ids.find((id) => pageTabTarget(page, id) === null)
  if (unroutable !== undefined) fail(`tab "${unroutable}" is not routable`)
}

/** Scrolls only the strip so the focused tab (or current selection) is in view. */
function keepInView(list: HTMLElement | null, focused?: HTMLElement): void {
  const active = focused ?? list?.querySelector<HTMLElement>("[data-state='active']")
  if (!list || !active) return
  const start = active.offsetLeft
  const end = start + active.offsetWidth
  if (start < list.scrollLeft) list.scrollLeft = start
  else if (end > list.scrollLeft + list.clientWidth) list.scrollLeft = end - list.clientWidth
}

/** The keys that activate a tab (manual activation). */
const isActivationKey = (event: KeyboardEvent): boolean => event.key === "Enter" || event.key === " "

function ComingSoonTag() {
  return (
    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground">
      <span className="max-md:hidden">{SHELL_MESSAGES.comingSoon}</span>
      <span className="md:hidden">{SHELL_MESSAGES.comingSoonShort}</span>
    </span>
  )
}

/**
 * A page's tab strip bound to `?tab=` (Stories 1.8, 7.1; AD-7; generic since
 * F6-1: it knows no page's tabs). ARIA tabs with manual activation; every
 * change goes through `navigate()`. A missing, unknown or repeated `?tab=`
 * (`?tab=a&tab=b`) shows `defaultTab` and is normalized to one value with a
 * replace (other params and the hash kept).
 *
 * Enter and Space activate on keyup, not on Radix's keydown (WCAG 2.1.1;
 * deferred-work, spec NG-9027): a dirty page opens the leave dialog, which
 * focuses "Keep editing", and the rest of a keydown-time press (Enter's
 * keypress click, Space's keyup click) would land on that button and close
 * it at once. The keydown is prevented (Radix then skips its own activation,
 * and the browser synthesizes no click); the keyup on the same tab activates.
 * Arrow keys, Home/End and the pointer are Radix's, unchanged.
 */
export function PageTabs<T extends string>({ page, tabs, panels, defaultTab, "aria-label": ariaLabel }: PageTabsProps<T>) {
  assertPageTabsConfig(page, tabs, defaultTab)
  const param = PAGE_TAB_PARAM[page]
  const navigate = useNavigate()
  const values = useSearchParams().getAll(param)
  const isTab = (value: unknown): value is T => tabs.some((tab) => tab.id === value)
  const single = values.length === 1 ? values[0] : null
  const current: T = isTab(single) ? single : defaultTab
  const normalized = single === current
  const listRef = useRef<HTMLDivElement>(null)
  /** The tab that took the Enter/Space keydown: only its own keyup activates. */
  const pressedRef = useRef<T | null>(null)

  const activate = (next: string): void => {
    // Routed by the configured ids (validated as routable above).
    if (next === current || !isTab(next)) return
    void navigate({ page, tab: next } as NavTarget)
  }

  useEffect(() => {
    if (normalized) return
    const { pathname, search, hash } = window.location
    const params = new URLSearchParams(search)
    params.set(param, current)
    // `null` state, as Next documents: its patched history syncs `useSearchParams`.
    window.history.replaceState(null, "", `${pathname}?${params.toString()}${hash}`)
  }, [normalized, current, param])

  useEffect(() => keepInView(listRef.current), [current])

  return (
    <Tabs
      value={current}
      onValueChange={activate}
    >
      <TabsList ref={listRef} aria-label={ariaLabel} className="px-4 md:px-6" onFocusCapture={(event) => keepInView(listRef.current, event.target)}>
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            onKeyDown={(event) => {
              if (!isActivationKey(event)) return
              event.preventDefault()
              pressedRef.current = tab.id
            }}
            onKeyUp={(event) => {
              if (!isActivationKey(event) || pressedRef.current !== tab.id) return
              pressedRef.current = null
              activate(tab.id)
            }}
            onBlur={() => {
              pressedRef.current = null
            }}
          >
            {tab.comingSoon ? (
              <>
                {tab.label}
                <ComingSoonTag />
              </>
            ) : (
              tab.label
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {/* Every panel exists (so each tab's aria-controls resolves); Radix renders only the selected one's content. */}
      {tabs.map((tab) => (
        <TabsContent
          key={tab.id}
          value={tab.id}
          // Only when skipping: an explicit `undefined` would override Radix's own tabIndex=0.
          {...(tab.skipInTabOrder ? { tabIndex: -1 } : {})}
          className={cn("focus-ring", !tab.bare && "px-4 py-6 md:px-6")}
        >
          {panels[tab.id]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
