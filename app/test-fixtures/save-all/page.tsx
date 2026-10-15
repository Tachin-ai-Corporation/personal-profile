import { notFound } from "next/navigation"
import { ProfileHeader } from "@/features/header"
import { SaveAllBar } from "@/features/save-all"
import { PageFrame, PortalUrlProvider, SAVE_ORDER } from "@/features/shell"
// A test fixture, deliberately not part of the shell's public API.
import { SaveAllFixture } from "@/features/shell/__fixtures__/save-all-fixture"
import { serverEnv } from "@/lib/server/env"
import { requirePageSession } from "@/lib/server/page-session"

export const dynamic = "force-dynamic"

/**
 * Playwright-only fixture (spec NG-9027, for Story 1.14): the `/` frame with
 * `SAVE_ORDER` and the Save all bar, as `app/page.tsx` passes them, over
 * fixture participants (`?fail=<id>`). A 404 unless `PP_E2E_FIXTURES=1`
 * (never set in a deployment).
 */
export default async function SaveAllFixturePage() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  const { portalUrl, idle } = await requirePageSession()

  return (
    <PortalUrlProvider portalUrl={portalUrl}>
      <PageFrame
        page="profile"
        header={<ProfileHeader />}
        idle={idle}
        saveOrder={SAVE_ORDER}
        saveAllSlot={<SaveAllBar />}
      >
        <SaveAllFixture />
      </PageFrame>
    </PortalUrlProvider>
  )
}
