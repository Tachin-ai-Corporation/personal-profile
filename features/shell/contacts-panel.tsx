"use client"

import { SHELL_COPY } from "@/lib/shared/messages"
import { SectionFrame } from "./section-frame"
import { SectionNav } from "./section-nav"
import { SECTION_COLUMNS, SECTIONS, SIGNATURE_ANCHOR } from "./sections"

/**
 * The Contacts tab body (Story 1.8): the Section menu (≥ 768 px) or Jump to
 * (< 768 px) beside / above the five Sections, each in its loading placeholder
 * until Stories 1.9 and 1.11 give them content.
 */
export function ContactsPanel() {
  return (
    <div className="md:grid md:grid-cols-[200px_minmax(0,1fr)]">
      <SectionNav />
      <div className="flex min-w-0 flex-col gap-8 px-4 py-4 md:p-6">
        {SECTIONS.map((s) => (
          <SectionFrame
            key={s.id}
            id={s.id}
            title={s.label}
            columns={SECTION_COLUMNS[s.id]}
            state="loading"
            anchors={s.id === "personal" ? <SignaturePlaceholder /> : undefined}
          />
        ))}
      </div>
    </div>
  )
}

/** The `#signature` deep-link target inside Personal information. */
function SignaturePlaceholder() {
  return (
    <div
      id={SIGNATURE_ANCHOR}
      role="group"
      aria-label={SHELL_COPY.signature}
      className="flex h-11 items-center gap-4 border-t px-3"
    >
      <span className="w-24 shrink-0 text-body-sm text-muted-foreground">{SHELL_COPY.signature}</span>
      <span aria-hidden="true" className="h-3 min-w-0 flex-1 animate-pulse rounded-sm bg-muted" />
    </div>
  )
}
