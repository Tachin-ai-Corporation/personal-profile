import type { ReactNode } from "react"
import { AccountPersonalPanel } from "./anchored-panel"
import { DEFAULT_ACCOUNT_TAB } from "./nav-types"
import { PageTabs } from "./page-tabs"
import { ACCOUNT_TAB_DEFINITIONS } from "./page-tabs-config"
import { AccountTabPlaceholder } from "./placeholders"

export interface AccountTabsProps {
  /** Personal Account tab body; default: `AccountPersonalPanel` with both placeholders. */
  readonly personal?: ReactNode
  /** Individual Provider Registration tab body (Epic 9); default: the input-bars placeholder. */
  readonly provider?: ReactNode
  /** My Organizations tab body (Epic 10); default: the card-grid placeholder. */
  readonly organizations?: ReactNode
}

/**
 * The `/account` tab strip preset (Story 7.1; F6-1): `PageTabs` with
 * `ACCOUNT_TAB_DEFINITIONS` and the panels composed by `app/account/page.tsx`.
 */
export function AccountTabs({ personal, provider, organizations }: AccountTabsProps = {}) {
  return (
    <PageTabs
      page="account"
      tabs={ACCOUNT_TAB_DEFINITIONS}
      defaultTab={DEFAULT_ACCOUNT_TAB}
      panels={{
        personal: personal ?? <AccountPersonalPanel />,
        provider: provider ?? <AccountTabPlaceholder tab="provider" />,
        organizations: organizations ?? <AccountTabPlaceholder tab="organizations" />,
      }}
    />
  )
}
