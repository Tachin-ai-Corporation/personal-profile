import { notFound } from "next/navigation"
import { ProfileHeader } from "@/features/header"
import { PageFrame, PortalUrlProvider } from "@/features/shell"
// A test fixture, deliberately not part of the shell's public API.
import { SectionFixturePage } from "@/features/shell/__fixtures__/section-fixture-page"
import { serverEnv } from "@/lib/server/env"
import { requirePageSession } from "@/lib/server/page-session"

export const dynamic = "force-dynamic"

/**
 * Playwright-only fixture (spec F3-2, Story 1.11): the `/` frame with the
 * fixture Section, so the edit model, focus, live regions and axe run in a
 * real browser. A 404 unless `PP_E2E_FIXTURES=1` (never set in a deployment).
 */
export default async function SectionFixture() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  const { portalUrl, idle } = await requirePageSession()

  return (
    <PortalUrlProvider portalUrl={portalUrl}>
      <PageFrame page="profile" header={<ProfileHeader />} idle={idle}>
        <SectionFixturePage />
      </PageFrame>
    </PortalUrlProvider>
  )
}
