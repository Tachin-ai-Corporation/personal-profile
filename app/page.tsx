import { ProfileHeader } from "@/features/header"
import { PageFrame, PortalUrlProvider, ProfileTabs } from "@/features/shell"
import { requirePageSession } from "@/lib/server/page-session"

export const dynamic = "force-dynamic"

/** Personal Profile (`/`): app bar → header → Contacts / Insurance / Medical tabs (Story 1.8). */
export default async function HomePage() {
  const { portalUrl } = await requirePageSession()

  return (
    <PortalUrlProvider portalUrl={portalUrl}>
      <PageFrame page="profile" header={<ProfileHeader />}>
        <ProfileTabs />
      </PageFrame>
    </PortalUrlProvider>
  )
}
