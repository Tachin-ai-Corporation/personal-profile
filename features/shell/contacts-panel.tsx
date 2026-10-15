"use client"

import { Fragment, type ReactNode } from "react"
import { PROFILE_SECTION_IDS, PROFILE_SECTIONS, type ProfileSectionId } from "./anchors"
import { ProfileSectionPlaceholder } from "./placeholders"
import { SectionCountProvider } from "./section-counts"
import { SectionFrameProvider, useLandmarkCheck } from "./section-frame"
import { SectionNav, useSectionNavigation } from "./section-nav"

export interface ContactsPanelProps {
  /**
   * The five Sections, by id, composed by the route (`app/page.tsx`). Each
   * element renders its own `SectionLandmark id={id}` (the `<section id>`
   * the Section menu, Jump to and deep links target) and passes
   * `useSectionFrame(id).onReady` to its `StateFrame`. A missing entry shows
   * that Section's loading placeholder.
   */
  readonly sections?: Partial<Record<ProfileSectionId, ReactNode>>
}

/**
 * The Contacts tab body (F3-3, port of main's Story 1.8B; slots since F6-1):
 * the Section menu (≥ 768 px) or Jump to (< 768 px) beside / above the five
 * Sections, always in `PROFILE_SECTIONS` order.
 */
export function ContactsPanel({ sections }: ContactsPanelProps = {}) {
  return (
    <SectionCountProvider>
      <ContactsBody sections={sections} />
    </SectionCountProvider>
  )
}

function ContactsBody({ sections }: ContactsPanelProps) {
  const nav = useSectionNavigation()
  useLandmarkCheck(PROFILE_SECTION_IDS, "ContactsPanel")
  return (
    <div className="md:grid md:grid-cols-[200px_minmax(0,1fr)]">
      <SectionNav state={nav} />
      <div className="flex min-w-0 flex-col gap-8 px-4 py-4 md:p-6">
        <SectionFrameProvider onReady={nav.frameReady}>
          {PROFILE_SECTIONS.map((section) => (
            <Fragment key={section.id}>{sections?.[section.id] ?? <ProfileSectionPlaceholder id={section.id} />}</Fragment>
          ))}
        </SectionFrameProvider>
      </div>
    </div>
  )
}
