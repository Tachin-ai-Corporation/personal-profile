"use client"

import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { environments, type Environment } from "@/lib/shared/environments"
import { DISABLED_COPY } from "@/lib/shared/messages"
import { useReferrerEnvironment } from "./display-environment"

/**
 * The kill-switch screen (`PP_DISABLED=1`, AD-20, Story 1.16): `/` and `/auth`
 * render it directly, with no redirect. "Go to 1health" goes, in the same tab,
 * to the shown environment's portal: the referrer's (when `useReferrer`), else
 * the server-resolved one (session, then the remembered cookie), else prod.
 * Story 1.16 owns the 503 status code.
 */
export function DisabledScreen({
  environment,
  useReferrer = false,
}: {
  /** Server-resolved display environment (session, then `onehealth_environment`), or `null`. */
  environment: Environment | null
  /** Let the referrer win (the `/auth` screen's display order). */
  useReferrer?: boolean
}) {
  const referred = useReferrerEnvironment()
  const shown = (useReferrer ? referred : null) ?? environment ?? "prod"

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4">
          <AlertCircle className="size-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-h4">{DISABLED_COPY.title}</h1>
          <p className="text-body-sm text-muted-foreground">{DISABLED_COPY.body}</p>
          <Button asChild className="min-h-11">
            <a href={environments[shown].portalUrl}>{DISABLED_COPY.action}</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
