"use client"

import { SHELL_COPY } from "@/lib/shared/messages"
import { SectionFrame } from "./section-frame"
import { SECTION_COLUMNS } from "./sections"

/**
 * The Insurance tab body (Story 1.8): one Section, `#insurance`, in its loading
 * placeholder at full main-column width. No Section menu or Jump to.
 */
export function InsurancePanel() {
  return (
    <div className="px-4 py-4 md:p-6">
      <SectionFrame id="insurance" title={SHELL_COPY.insurance} columns={SECTION_COLUMNS.insurance} state="loading" />
    </div>
  )
}
