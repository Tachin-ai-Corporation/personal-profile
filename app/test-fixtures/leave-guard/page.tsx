import { notFound } from "next/navigation"
import { ProfileHeader } from "@/features/header"
import { PageFrame, PortalUrlProvider, ProfileTabs } from "@/features/shell"
// A test fixture, deliberately not part of the shell's public API.
import { LeaveGuardControls } from "@/features/shell/__fixtures__/leave-guard-controls"
import { serverEnv } from "@/lib/server/env"
import { requirePageSession } from "@/lib/server/page-session"

export const dynamic = "force-dynamic"

/**
 * Playwright-only fixture (Stories 1.11, 1.13; spec NG-9027): the `/` frame
 * plus three registered participants (a Save-all one, a guard-only one that
 * can save, one that can't; `?fail=<id>`), a hand-off and a scoped close, so
 * the leave guard can be driven in a real browser. A 404 unless
 * `PP_E2E_FIXTURES=1` (never set in a deployment).
 */
export default async function LeaveGuardFixturePage() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  const { portalUrl, idle } = await requirePageSession()

  return (
    <PortalUrlProvider portalUrl={portalUrl}>
      <PageFrame page="profile" header={<ProfileHeader />} idle={idle}>
        <LeaveGuardControls />
        <ProfileTabs />
      </PageFrame>
    </PortalUrlProvider>
  )
}
