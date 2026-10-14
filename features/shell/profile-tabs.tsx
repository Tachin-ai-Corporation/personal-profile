"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SHELL_COPY } from "@/lib/shared/messages"
import { ContactsPanel } from "./contacts-panel"
import { InsurancePanel } from "./insurance-panel"
import { requestLeave } from "./leave"
import { MedicalPanel } from "./medical-panel"
import { isTabId, TAB_IDS, type TabId } from "./sections"

/**
 * =============================================================================
 * Profile tabs (Story 1.8, FR-3, AD-7)
 * =============================================================================
 *
 * shadcn/Radix Tabs with manual activation: arrow keys (wrapping), Home and End
 * move focus; Enter, Space or a click activates. Radix provides the roles and
 * the `aria-controls` / `aria-labelledby` wiring.
 *
 * - Activation asks `requestLeave()` (the Story 1.13 leave guard). On `false`
 *   nothing changes; otherwise the panel switches and the URL becomes
 *   `?tab=<id>` through `history.replaceState`: no history entry, no scroll,
 *   the hash dropped, and no router navigation (which would re-render the
 *   server page).
 * - The server picks the initial tab from `?tab=`; on mount an unknown or
 *   missing value is normalised to `?tab=contacts`, keeping any hash.
 * =============================================================================
 */

const TRIGGER_CLASS =
  "-mb-px h-11 flex-none gap-2 rounded-none border-0 border-b-2 border-transparent px-3 py-0 text-body font-normal text-muted-foreground shadow-none hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:text-muted-foreground dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent"

export function ProfileTabs({ initialTab }: { initialTab: TabId }) {
  const [tab, setTab] = useState<TabId>(initialTab)

  useEffect(() => {
    // A repeated `?tab=` renders Contacts on the server too, so it is normalised.
    const values = new URLSearchParams(window.location.search).getAll("tab")
    if (values.length !== 1 || !isTabId(values[0])) window.history.replaceState(null, "", `?tab=contacts${window.location.hash}`)
  }, [])

  const onValueChange = async (value: string) => {
    if (!isTabId(value) || value === tab) return
    if (!(await requestLeave())) return
    setTab(value)
    window.history.replaceState(null, "", `?tab=${value}`)
  }

  return (
    <Tabs value={tab} onValueChange={onValueChange} activationMode="manual" className="gap-0">
      <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b bg-transparent p-0 px-4 md:gap-1 md:px-6">
        {TAB_IDS.map((id) => (
          <TabsTrigger key={id} value={id} className={TRIGGER_CLASS}>
            {SHELL_COPY.tabs[id]}
            {id === "medical" && " "}
            {id === "medical" && (
              <span className="rounded-sm bg-muted px-1.5 text-caption font-normal text-muted-foreground">
                <span className="hidden md:inline">{SHELL_COPY.comingSoon}</span>
                <span className="md:hidden">{SHELL_COPY.soon}</span>
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="contacts" tabIndex={-1}>
        <ContactsPanel />
      </TabsContent>
      <TabsContent value="insurance">
        <InsurancePanel />
      </TabsContent>
      <TabsContent value="medical">
        <MedicalPanel />
      </TabsContent>
    </Tabs>
  )
}
