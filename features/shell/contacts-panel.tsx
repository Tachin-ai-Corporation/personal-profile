"use client"

import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { PROFILE_SECTIONS, SECTION_COLUMNS, SIGNATURE_ANCHOR } from "./anchors"
import { SectionLandmark } from "./section-landmark"
import { SectionCountProvider } from "./section-counts"
import { SectionNav, useSectionNavigation } from "./section-nav"
import { StateFrame } from "./state-frame"

/** Placeholder frames have nothing to retry until Epics 2–4 give them data. */
const noRetry = (): void => undefined

/**
 * The Contacts tab body (F3-3, port of main's Story 1.8B): the Section menu
 * (≥ 768 px) or Jump to (< 768 px) beside / above the five Sections, each a
 * `StateFrame` in its loading state until Epics 2–4 give it content.
 */
export function ContactsPanel() {
  return (
    <SectionCountProvider>
      <ContactsBody />
    </SectionCountProvider>
  )
}

function ContactsBody() {
  const nav = useSectionNavigation()
  return (
    <div className="md:grid md:grid-cols-[200px_minmax(0,1fr)]">
      <SectionNav state={nav} />
      <div className="flex min-w-0 flex-col gap-8 px-4 py-4 md:p-6">
        {PROFILE_SECTIONS.map((section) => (
          <SectionLandmark key={section.id} id={section.id} title={section.label}>
            <StateFrame
              state="loading"
              skeleton="table"
              columns={SECTION_COLUMNS[section.id]}
              loadError={{ kind: "section", sectionId: section.id }}
              level="section"
              onRetry={noRetry}
              onReady={() => nav.frameReady(section.id)}
              anchors={section.id === "personal" ? <SignaturePlaceholder /> : undefined}
            />
          </SectionLandmark>
        ))}
      </div>
    </div>
  )
}

/** The `#signature` deep-link target inside Personal information while it loads. */
function SignaturePlaceholder() {
  return (
    <div id={SIGNATURE_ANCHOR} role="group" aria-label={SHELL_MESSAGES.signature} className="flex h-11 items-center gap-4 border-t px-3">
      <span className="text-muted-foreground w-24 shrink-0 text-body-sm">{SHELL_MESSAGES.signature}</span>
      <span aria-hidden="true" className="bg-muted h-3 min-w-0 flex-1 animate-pulse rounded-sm motion-reduce:animate-none" />
    </div>
  )
}
