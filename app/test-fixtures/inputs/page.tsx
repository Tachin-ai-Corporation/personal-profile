import { notFound } from "next/navigation"
// A test fixture, deliberately not part of the shell's public API.
import { InputsFixture } from "@/features/shell/__fixtures__/inputs-fixture"
import { serverEnv } from "@/lib/server/env"

export const dynamic = "force-dynamic"

/**
 * Playwright-only fixture (spec F5-1): Select (aria-disabled + helper,
 * unlisted value, placeholder), the date input with its calendar and the info
 * popovers, so axe and keyboard operation run in a real browser. A 404
 * unless `PP_E2E_FIXTURES=1` (never set in a deployment).
 */
export default async function InputsFixturePage() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  return <InputsFixture />
}
