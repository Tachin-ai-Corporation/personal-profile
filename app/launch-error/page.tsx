import { AlertCircle } from "lucide-react"
import { PORTAL_URL } from "@/lib/server/env"
import { LAUNCH_ERROR_COPY, normalizeLaunchErrorReason } from "@/lib/shared/messages"
import { Card, CardContent } from "@/components/ui/card"
import { ReturnAction } from "./return-action"

/**
 * Launch-error screen (FR-1).
 *
 * Maps the `reason` query param to the copy catalog and renders a full-page,
 * centered card (icon, title, one paragraph, one primary action). An unknown or
 * missing reason renders exactly the `invalid` variant. The raw `reason` is
 * never rendered or logged. There is no retry/resubmit.
 *
 * Rendered per request so the proxy's no-store headers and CSP nonce apply (AD-18).
 */
export const dynamic = "force-dynamic"

export default async function LaunchErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const copy = LAUNCH_ERROR_COPY[normalizeLaunchErrorReason(reason)]

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4">
          <AlertCircle className="size-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{copy.title}</h1>
          <p className="text-muted-foreground text-sm">{copy.body}</p>
          <ReturnAction label={copy.actionLabel} href={PORTAL_URL} action={copy.action} />
        </CardContent>
      </Card>
    </main>
  )
}
