"use client"

import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { PROFILE_SECTIONS, type ProfileSectionId } from "../anchors"
import { ContactsPanel } from "../contacts-panel"
import { sectionHeadingId } from "../nav-types"
import { SectionContainer } from "../section-container"
import { SectionHeader } from "../section-header"
import { SectionRegistryProvider, useSectionRegistry } from "../section-registry"
import { PROFILE_SECTION_ICONS, PROFILE_SECTION_TONES } from "../section-tones"

/** Fixture rows with a copyable value; strings are fixture data, not catalog copy. */
const VALUES: Partial<Record<ProfileSectionId, string>> = { phone: "+1 (415) 555-2671", email: "ann@example.com" }

/**
 * One Section opting into every design-refresh piece the foundation offers:
 * `SectionHeader icon`, `SectionContainer animated accent`, a `CopyButton`
 * row, and a "Save" that reports `saved` the way a real Save does. Tall, so
 * the menu's scroll-spy has room to move.
 */
function FixtureSection({ id, label }: { readonly id: ProfileSectionId; readonly label: string }) {
  const registry = useSectionRegistry()
  const value = VALUES[id]
  return (
    <section id={id} aria-labelledby={sectionHeadingId(id)} className="min-w-0">
      <SectionHeader
        id={id}
        title={label}
        editing={false}
        icon={{ icon: PROFILE_SECTION_ICONS[id], tone: PROFILE_SECTION_TONES[id] }}
        className="mb-2"
        actions={
          <Button type="button" size="touch" variant="outline" onClick={() => registry.report({ type: "saved", id })}>
            Save {label}
          </Button>
        }
      />
      <SectionContainer editing={false} sectionId={id} animated accent={PROFILE_SECTION_TONES[id]} className="min-h-[480px] p-4">
        {value ? (
          <div className="group/row flex items-center gap-2" data-testid={`${id}-row`}>
            <span>{value}</span>
            <CopyButton value={value} />
          </div>
        ) : null}
      </SectionContainer>
    </section>
  )
}

/**
 * Test-only page (e2e `design-refresh.spec.ts`): the Contacts body with the
 * design refresh opted in (`ContactsPanel accent`, the sliding indicator)
 * around five fixture Sections, so the new foundation pieces run together in
 * a real browser with real CSS and layout. Not app UI.
 */
export function DesignRefreshFixture() {
  return (
    <SectionRegistryProvider>
      <main className="bg-background text-foreground min-h-screen">
        <h1 className="sr-only">Design refresh</h1>
        <ContactsPanel
          accent
          sections={Object.fromEntries(PROFILE_SECTIONS.map((section) => [section.id, <FixtureSection key={section.id} id={section.id} label={section.label} />]))}
        />
      </main>
    </SectionRegistryProvider>
  )
}
