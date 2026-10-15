import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { ACCOUNT_TABS, PROFILE_TABS, type AccountTab, type ProfileTab } from "./nav-types"

/**
 * One tab of a `PageTabs` strip (F6-1): static configuration only; the
 * panels are passed separately (composed in `app/**`).
 */
export interface PageTabDefinition<T extends string> {
  readonly id: T
  /** The tab's label (catalog copy). */
  readonly label: string
  /** Adds the "Coming soon" / "Soon" tag after the label. */
  readonly comingSoon?: boolean
  /** Drops the panel's default gutters (the panel lays out its own). */
  readonly bare?: boolean
  /** Takes the panel out of the Tab order (its first control follows the tab directly, e.g. the Section menu). */
  readonly skipInTabOrder?: boolean
}

const PROFILE_TAB_LABELS: Readonly<Record<ProfileTab, string>> = {
  contacts: SHELL_MESSAGES.profileTabContacts,
  insurance: SHELL_MESSAGES.profileTabInsurance,
  medical: SHELL_MESSAGES.profileTabMedical,
}

/**
 * `/` (Story 1.8): Contacts lays out its own columns and Tab goes from the
 * tab straight to its Section menu; Medical is tagged Coming soon.
 */
export const PROFILE_TAB_DEFINITIONS: readonly PageTabDefinition<ProfileTab>[] = PROFILE_TABS.map((id) => ({
  id,
  label: PROFILE_TAB_LABELS[id],
  ...(id === "contacts" ? { bare: true, skipInTabOrder: true } : {}),
  ...(id === "medical" ? { comingSoon: true } : {}),
}))

const ACCOUNT_TAB_LABELS: Readonly<Record<AccountTab, string>> = {
  personal: SHELL_MESSAGES.accountTabPersonal,
  provider: SHELL_MESSAGES.accountTabProvider,
  organizations: SHELL_MESSAGES.accountTabOrganizations,
}

/** `/account` (Story 7.1): three tabs with the default gutters and no tag. */
export const ACCOUNT_TAB_DEFINITIONS: readonly PageTabDefinition<AccountTab>[] = ACCOUNT_TABS.map((id) => ({
  id,
  label: ACCOUNT_TAB_LABELS[id],
}))
