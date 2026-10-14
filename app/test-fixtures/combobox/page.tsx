import { notFound } from "next/navigation"
// A test fixture, deliberately not part of the shell's public API.
import { ComboboxFixture } from "@/features/shell/__fixtures__/combobox-fixture"
import { serverEnv } from "@/lib/server/env"

export const dynamic = "force-dynamic"

/**
 * Playwright-only fixture (spec F5-2): the four async combobox variants (NPI,
 * address line 1, insurer, gender identity) on fake loaders, so axe, keyboard,
 * touch, paging and retry run in a real browser. A 404 unless
 * `PP_E2E_FIXTURES=1` (never set in a deployment).
 */
export default async function ComboboxFixturePage() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  return <ComboboxFixture />
}
