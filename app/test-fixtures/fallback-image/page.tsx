import { notFound } from "next/navigation"
import { FallbackImage } from "@/components/ui/fallback-image"
import { serverEnv } from "@/lib/server/env"

export const dynamic = "force-dynamic"

function InitialsTile({ testId }: { readonly testId: string }) {
  return (
    <span data-testid={testId} className="bg-muted text-muted-foreground inline-flex size-18 items-center justify-center rounded-md font-semibold">
      AL
    </span>
  )
}

/**
 * Playwright-only fixture (spec F7-2): `FallbackImage` in a real browser: an
 * image that loads, one that 404s (its fallback shows, no broken image) and
 * one without a `src`. A 404 unless `PP_E2E_FIXTURES=1` (never set in a
 * deployment).
 */
export default async function FallbackImageFixturePage() {
  if (!serverEnv().PP_E2E_FIXTURES) notFound()
  return (
    <main className="bg-background text-foreground flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Fallback image</h1>
      <section aria-label="Loads" className="flex items-center gap-2">
        <FallbackImage src="/1h-icon.png" alt="1health" width={72} height={72} className="size-18 object-contain" fallback={<InitialsTile testId="loads-fallback" />} />
      </section>
      <section aria-label="Fails" className="flex items-center gap-2">
        <FallbackImage src="/missing-fallback-image.png" alt="" width={72} height={72} className="size-18 object-contain" fallback={<InitialsTile testId="fails-fallback" />} />
      </section>
      <section aria-label="No source" className="flex items-center gap-2">
        <FallbackImage src={null} alt="" fallback={<InitialsTile testId="none-fallback" />} />
      </section>
    </main>
  )
}
