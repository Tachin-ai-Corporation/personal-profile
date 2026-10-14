import { redirect } from "next/navigation"
import { ClientConfig } from "@/features/shell/client-config"
import { IdleWarning } from "@/features/shell/idle-warning"
import { MyselfName } from "@/features/shell/myself-name"
import { SessionDialogs } from "@/features/shell/session-dialogs"
import { ONEHEALTH_SECRET_KEY, PORTAL_URL, PP_DISABLED } from "@/lib/server/env"
import { deriveAesKey } from "@/lib/server/launch"
import { ABSOLUTE_TIMEOUT_MS, IDLE_TIMEOUT_MS, requireSession } from "@/lib/server/session"
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
 *
 * The idle warning gets only four numbers (Story 1.6): the idle limit in
 * seconds, the session's `lastSeen`, `iat + ABSOLUTE_TIMEOUT_MS` and the server
 * clock, so the client evaluates every deadline in server time. `proxy.ts` has
 * already re-sealed `lastSeen` for a top-level navigation to `/`.
 *
 * `SessionDialogs` (Story 1.7) is the shell's single listener for
 * `session-expired` / `session-changed`; its "Return to 1health" links to the
 * constant `PORTAL_URL`.
 */
export const dynamic = "force-dynamic"

/**
 * The server clock for this request. Called once per render of this
 * force-dynamic server component; it is a plain helper so the `react-hooks/purity`
 * lint rule does not flag a direct `Date.now()` in the component body.
 */
function readServerClock(): number {
  return Date.now()
}

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
  const serverNow = readServerClock()

  return (
    <ClientConfig sessionBinding={computeBinding(session.sid)} portalUrl={PORTAL_URL}>
      {/* Must mount before any publisher (IdleWarning, SWR reads): publish never replays. */}
      <SessionDialogs portalUrl={PORTAL_URL} />
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-semibold">Personal Profile</h1>
        <MyselfName />
        <p className="text-muted-foreground">Coming soon.</p>
      </main>
      <IdleWarning
        idleTimeoutSec={IDLE_TIMEOUT_MS / 1000}
        lastSeen={session.lastSeen}
        absoluteExpiresAt={session.iat + ABSOLUTE_TIMEOUT_MS}
        serverNow={serverNow}
      />
    </ClientConfig>
  )
}
