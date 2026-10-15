import { notFound } from "next/navigation"
import { ProfileHeader } from "@/features/header"
import { PageFrame, PortalUrlProvider, ProfileTabs } from "@/features/shell"
// A test fixture, deliberately not part of the shell's public API.
import { FixtureParticipant } from "@/features/shell/__fixtures__/fixture-participant"
import { serverEnv } from "@/lib/server/env"
import { requirePageSession } from "@/lib/server/page-session"

export const dynamic = "force-dynamic"

/**
 * Playwright-only fixture (Stories 1.11, 1.13): the `/` frame plus two
 * registered participants, so the leave guard can be driven in a real
 * browser. A 404 unless `PP_E2E_FIXTURES=1` (never set in a deployment).
 */
export default async function LeaveGuardFixturePage() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  const { portalUrl, idle } = await requirePageSession()

  return (
    <PortalUrlProvider portalUrl={portalUrl}>
      <PageFrame page="profile" header={<ProfileHeader />} idle={idle}>
        <div className="flex flex-col gap-2 px-4 pt-4 md:px-6">
          <FixtureParticipant id="phone" label="Fixture phone" displayOrder={2} />
          <FixtureParticipant id="insurance" label="Fixture insurance" displayOrder={6} canSave={false} />
        </div>
        <ProfileTabs />
      </PageFrame>
    </PortalUrlProvider>
  )
}
