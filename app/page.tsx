import { redirect } from "next/navigation"
import { ClientConfig } from "@/features/shell/client-config"
import { MyselfName } from "@/features/shell/myself-name"
import { ONEHEALTH_SECRET_KEY, PORTAL_URL, PP_DISABLED } from "@/lib/server/env"
import { deriveAesKey } from "@/lib/server/launch"
import { requireSession } from "@/lib/server/session"
import { computeBinding } from "@/lib/server/session-binding"

/**
 * Home page (placeholder) with the session guard (AD-1, AD-4).
 *
 * The kill switch and bad-key guards run first (AD-20), then `requireSession()`
 * redirects to `/launch-error?reason=expired` when there is no valid session.
 * There is no login page and no `/auth` route. `app/page.tsx` never reads `lpl`;
 * `proxy.ts` redirects a `/?lpl=` request to `/launch` before this runs.
 *
 * Rendered per request so the proxy's no-store headers and CSP nonce apply, and
 * the guard runs on every request (AD-18).
 *
 * The page embeds `sessionBinding = HMAC(SESSION_SECRET, sid)` for this cookie's
 * `sid` plus `PORTAL_URL`; `ClientConfig` registers both with `callApi` before
 * any child fetches (AD-17, AD-19).
 */
export const dynamic = "force-dynamic"

export default async function HomePage() {
  if (PP_DISABLED) {
    redirect("/launch-error?reason=disabled")
  }
  try {
    deriveAesKey(ONEHEALTH_SECRET_KEY)
  } catch {
    redirect("/launch-error?reason=config")
  }

  const session = await requireSession()

  return (
    <ClientConfig sessionBinding={computeBinding(session.sid)} portalUrl={PORTAL_URL}>
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-semibold">Personal Profile</h1>
        <MyselfName />
        <p className="text-muted-foreground">Coming soon.</p>
      </main>
    </ClientConfig>
  )
}
