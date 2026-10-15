import type { ReactNode } from "react"
import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { ContactsPanel } from "./contacts-panel"
import { InsurancePanel } from "./insurance-panel"
import { DEFAULT_PROFILE_TAB } from "./nav-types"
import { PageTabs } from "./page-tabs"
import { PAGE_TAB_LIST_LABELS, PROFILE_TAB_DEFINITIONS } from "./page-tabs-config"

/** A quiet centered muted panel, no action (DESIGN.md Empty state: Medical). */
export function QuietPanel({ children }: { readonly children: ReactNode }) {
  return <p className="py-12 text-center text-body-sm text-muted-foreground">{children}</p>
}

export interface ProfileTabsProps {
  /** Contacts tab body; default: `ContactsPanel` with every Section's placeholder. */
  readonly contacts?: ReactNode
  /** Insurance tab body; default: `InsurancePanel` with its placeholder. */
  readonly insurance?: ReactNode
  /** Medical tab body; default: the "Coming soon" line. */
  readonly medical?: ReactNode
}

/**
 * The `/` tab strip preset (Story 1.8; F6-1): `PageTabs` with
 * `PROFILE_TAB_DEFINITIONS` and the panels composed by `app/page.tsx`.
 */
export function ProfileTabs({ contacts, insurance, medical }: ProfileTabsProps = {}) {
  return (
    <PageTabs
      page="profile"
      tabs={PROFILE_TAB_DEFINITIONS}
      aria-label={PAGE_TAB_LIST_LABELS.profile}
      defaultTab={DEFAULT_PROFILE_TAB}
      panels={{
        contacts: contacts ?? <ContactsPanel />,
        insurance: insurance ?? <InsurancePanel />,
        medical: medical ?? <QuietPanel>{SHELL_MESSAGES.medicalComingSoon}</QuietPanel>,
      }}
    />
  )
}
