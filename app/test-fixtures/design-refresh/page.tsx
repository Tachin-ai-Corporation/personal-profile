import { notFound } from "next/navigation"
// A test fixture, deliberately not part of the shell's public API.
import { DesignRefreshFixture } from "@/features/shell/__fixtures__/design-refresh-fixture"
import { serverEnv } from "@/lib/server/env"

export const dynamic = "force-dynamic"

/**
 * Playwright-only fixture (design refresh, #61 review): the foundation's
 * opt-in pieces (Section menu indicator, Section icon and container accents,
 * copy and saved feedback) together in a real browser. A 404 unless
 * `PP_E2E_FIXTURES=1` (never set in a deployment).
 */
export default async function DesignRefreshFixturePage() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  return <DesignRefreshFixture />
}
