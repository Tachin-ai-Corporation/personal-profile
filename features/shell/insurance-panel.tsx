"use client"

import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { SECTION_COLUMNS } from "./anchors"
import { SectionLandmark } from "./section-landmark"
import { StateFrame } from "./state-frame"

/** The placeholder frame has nothing to retry until Epic 5 gives it data. */
const noRetry = (): void => undefined

/**
 * The Insurance tab body (F3-3, port of main's Story 1.8B): one Section,
 * `#insurance`, in its loading state at full main-column width (inside the
 * tab panel's own gutters). No Section menu or Jump to.
 */
export function InsurancePanel() {
  return (
    <SectionLandmark id="insurance" title={SHELL_MESSAGES.profileTabInsurance}>
      <StateFrame
        state="loading"
        skeleton="table"
        columns={SECTION_COLUMNS.insurance}
        loadError={{ kind: "section", sectionId: "insurance" }}
        level="section"
        onRetry={noRetry}
      />
    </SectionLandmark>
  )
}
