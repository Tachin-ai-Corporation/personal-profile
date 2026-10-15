import type { Metadata } from "next"
import { AccountSettingsSection } from "@/features/account"
import { ProfileHeader } from "@/features/header"
import { AuthenticatorSection } from "@/features/mfa"
import { OrganizationsTab } from "@/features/organizations"
import { ProviderTab } from "@/features/provider"
import { AccountPersonalPanel, AccountTabs, PageFrame, PortalUrlProvider } from "@/features/shell"
import { requirePageSession } from "@/lib/server/page-session"
import { SHELL_MESSAGES } from "@/lib/shared/messages"

export const dynamic = "force-dynamic"

/** The browser tab names this page (the root layout's title is "Personal Profile"). */
export const metadata: Metadata = { title: SHELL_MESSAGES.pageAccount }

/**
 * Account (`/account`): app bar → header → Personal Account / Individual
 * Provider Registration / My Organizations tabs (Story 7.1). The composition
 * root (F6-1): each feature's entry point fills its slot; a feature story
 * changes only its own `features/<id>/` files. No Save all (AD-8). The page
 * never reads `lpl` (D1): only `/auth` launches.
 */
export default async function AccountPage() {
  const { portalUrl, idle } = await requirePageSession()

  return (
    <PortalUrlProvider portalUrl={portalUrl}>
      <PageFrame page="account" header={<ProfileHeader />} idle={idle}>
        <AccountTabs
          personal={<AccountPersonalPanel account={<AccountSettingsSection />} authenticator={<AuthenticatorSection />} />}
          provider={<ProviderTab />}
          organizations={<OrganizationsTab />}
        />
      </PageFrame>
    </PortalUrlProvider>
  )
}
