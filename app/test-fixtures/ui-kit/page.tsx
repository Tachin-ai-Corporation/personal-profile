import { notFound } from "next/navigation"
// A test fixture, deliberately not part of the shell's public API.
import { UiKitFixture } from "@/features/shell/__fixtures__/ui-kit-fixture"
import { serverEnv } from "@/lib/server/env"

export const dynamic = "force-dynamic"

/**
 * Playwright-only fixture (spec F6-2): the shared UI kit (Dialog, Sheet,
 * ConfirmDialog busy label, row menu, row removal, Section table, chips,
 * empty states, checkbox, switch, phone input, countdown, announcer, text
 * roles), so axe, targets and keyboard/touch run in a real browser. A 404
 * unless `PP_E2E_FIXTURES=1` (never set in a deployment).
 */
export default async function UiKitFixturePage() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  return <UiKitFixture />
}
