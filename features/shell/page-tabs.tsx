"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useRef, type ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { DEFAULT_PROFILE_TAB, isProfileTab, PROFILE_TABS, type NavTarget, type ProfileTab } from "./nav-types"
import { useNavigate } from "./navigate"

export interface PageTabDefinition<T extends string> {
  readonly value: T
  readonly label: ReactNode
}

export interface PageTabsProps<T extends string> {
  readonly tabs: readonly PageTabDefinition<T>[]
  readonly isTab: (value: unknown) => value is T
  readonly defaultTab: T
  /** The `navigate()` target that selects a tab (the leave guard can intercept it). */
  readonly toTarget: (tab: T) => NavTarget
  readonly renderPanel: (tab: T) => ReactNode
}

/** Scrolls the strip sideways (never the page) so the selected tab is in view. */
function keepInView(list: HTMLElement | null): void {
  const active = list?.querySelector<HTMLElement>("[data-state='active']")
  if (!list || !active) return
  const start = active.offsetLeft
  const end = start + active.offsetWidth
  if (start < list.scrollLeft) list.scrollLeft = start
  else if (end > list.scrollLeft + list.clientWidth) list.scrollLeft = end - list.clientWidth
}

/**
 * The tab strip bound to `?tab=` (Story 1.8, AD-7): ARIA tabs with manual
 * activation; every change goes through `navigate()`; a missing or unknown
 * `?tab=` shows the default tab and is normalized with a replace.
 */
export function PageTabs<T extends string>({ tabs, isTab, defaultTab, toTarget, renderPanel }: PageTabsProps<T>) {
  const navigate = useNavigate()
  const raw = useSearchParams().get("tab")
  const current: T = isTab(raw) ? raw : defaultTab
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (raw === current) return
    const { pathname, search, hash } = window.location
    const params = new URLSearchParams(search)
    params.set("tab", current)
    // `null` state, as Next documents: its patched history syncs `useSearchParams`.
    window.history.replaceState(null, "", `${pathname}?${params.toString()}${hash}`)
  }, [raw, current])

  useEffect(() => keepInView(listRef.current), [current])

  return (
    <Tabs
      value={current}
      onValueChange={(next) => {
        if (isTab(next) && next !== current) void navigate(toTarget(next))
      }}
    >
      <TabsList ref={listRef} className="px-4 md:px-6">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {/* Every panel exists (so each tab's aria-controls resolves); Radix renders only the selected one's content. */}
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="px-4 py-6 md:px-6">
          {renderPanel(tab.value)}
        </TabsContent>
      ))}
    </Tabs>
  )
}

const PROFILE_TAB_LABELS: Readonly<Record<ProfileTab, string>> = {
  contacts: SHELL_MESSAGES.profileTabContacts,
  insurance: SHELL_MESSAGES.profileTabInsurance,
  medical: SHELL_MESSAGES.profileTabMedical,
}

function ComingSoonTag() {
  return (
    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground">
      <span className="max-md:hidden">{SHELL_MESSAGES.comingSoon}</span>
      <span className="md:hidden">{SHELL_MESSAGES.comingSoonShort}</span>
    </span>
  )
}

const PROFILE_TAB_DEFINITIONS: readonly PageTabDefinition<ProfileTab>[] = PROFILE_TABS.map((value) => ({
  value,
  label:
    value === "medical" ? (
      <>
        {PROFILE_TAB_LABELS[value]}
        <ComingSoonTag />
      </>
    ) : (
      PROFILE_TAB_LABELS[value]
    ),
}))

/** A quiet centered muted panel, no action (DESIGN.md Empty state: Medical). */
function QuietPanel({ children }: { readonly children: ReactNode }) {
  return <p className="py-12 text-center text-body-sm text-muted-foreground">{children}</p>
}

/** Placeholder panels until Epics 3–5 fill Contacts and Insurance; Medical is final (RC9). */
function profilePanel(tab: ProfileTab): ReactNode {
  return <QuietPanel>{tab === "medical" ? SHELL_MESSAGES.medicalComingSoon : SHELL_MESSAGES.tabPlaceholder}</QuietPanel>
}

/** The Personal Profile tab strip: Contacts, Insurance, Medical. */
export function ProfileTabs() {
  return (
    <PageTabs
      tabs={PROFILE_TAB_DEFINITIONS}
      isTab={isProfileTab}
      defaultTab={DEFAULT_PROFILE_TAB}
      toTarget={(tab) => ({ page: "profile", tab })}
      renderPanel={profilePanel}
    />
  )
}
