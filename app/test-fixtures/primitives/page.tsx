import { notFound } from "next/navigation"
// A test fixture, deliberately not part of the shell's public API.
import { PrimitivesFixture } from "@/features/shell/__fixtures__/primitives-fixture"
import { serverEnv } from "@/lib/server/env"

export const dynamic = "force-dynamic"

/**
 * Playwright-only fixture (spec F3-1): every shared UI primitive and the
 * toasts, so axe, target sizes and tooltip/toast behaviour run in a real
 * browser. A 404 unless `PP_E2E_FIXTURES=1` (never set in a deployment).
 */
export default async function PrimitivesFixturePage() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  return <PrimitivesFixture />
}
