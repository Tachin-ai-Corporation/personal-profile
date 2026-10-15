import type { ReactNode } from "react"
import { ProfileSectionPlaceholder } from "./placeholders"

export interface InsurancePanelProps {
  /** The Insurance Section (Epic 5), composed by the route; it renders its own `SectionLandmark id="insurance"`. */
  readonly section?: ReactNode
}

/**
 * The Insurance tab body (F3-3, port of main's Story 1.8B; slot since F6-1):
 * one Section, `#insurance`, at full main-column width (inside the tab
 * panel's own gutters). No Section menu or Jump to. Without a `section` it
 * shows the loading placeholder.
 */
export function InsurancePanel({ section }: InsurancePanelProps = {}) {
  return <>{section ?? <ProfileSectionPlaceholder id="insurance" />}</>
}
