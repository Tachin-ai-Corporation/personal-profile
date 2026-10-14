import { AppBar } from "@/features/shell/app-bar"
import { ClientConfig } from "@/features/shell/client-config"
import { DisabledScreen } from "@/features/shell/disabled-screen"
import { IdleWarning } from "@/features/shell/idle-warning"
import { MyselfName } from "@/features/shell/myself-name"
import { ProfileTabs } from "@/features/shell/profile-tabs"
import { normalizeTab } from "@/features/shell/sections"
import { SessionDialogs } from "@/features/shell/session-dialogs"
import { SHELL_COPY } from "@/lib/shared/messages"
import { environments } from "@/lib/shared/environments"
import { PP_DISABLED } from "@/lib/server/env"
import { readEnvironmentCookie } from "@/lib/server/environment-cookie"
import { ABSOLUTE_TIMEOUT_MS, IDLE_TIMEOUT_MS, getSession, requireSession } from "@/lib/server/session"
import { computeBinding } from "@/lib/server/session-binding"

/**
 * Home page: the session guard (AD-1, AD-4) and the profile page shell
 * (Story 1.8).
 *
 * The kill switch runs first: with `PP_DISABLED` the page renders the disabled
 * screen directly, with no redirect (AD-20). Otherwise `requireSession()`
 * redirects to `/auth` (no query) when there is no valid session; there is no
 * login form (D1). This page never reads `lpl`.
 *
 * Rendered per request so the proxy's no-store headers and CSP nonce apply, and
 * the guard runs on every request (AD-18).
 *
 * The page embeds `sessionBinding = HMAC(SESSION_SECRET, sid)` for this cookie's
 * `sid` plus the session environment's `portalUrl` (D4); `ClientConfig`
 * registers both with `callApi` before any child fetches (AD-17, AD-19).
 *
 * The idle warning gets only four numbers (Story 1.6): the idle limit in
 * seconds, the session's `lastSeen`, `iat + ABSOLUTE_TIMEOUT_MS` and the server
 * clock, so the client evaluates every deadline in server time. `proxy.ts` has
 * already re-sealed `lastSeen` for a top-level navigation to `/`.
 *
 * `SessionDialogs` (Story 1.7) is the shell's single listener for
 * `session-expired` / `session-changed`; its "Return to 1health" links to the
 * session environment's `portalUrl`.
 *
 * The shell (Story 1.8), top to bottom: `AppBar`, then `<main>` with the header
 * slot (Story 1.9 fills it; it holds the page's single `h1`) and the tabbed
 * shell. The server reads `?tab=`; an unknown or missing value renders
 * Contacts, and `ProfileTabs` normalises the URL on mount.
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

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
} = {}) {
  if (PP_DISABLED) {
    // Display only (D4): the session's environment, else the remembered one, else prod.
    const environment = (await getSession())?.environment ?? (await readEnvironmentCookie())
    return <DisabledScreen environment={environment} />
  }

  const session = await requireSession()
  const serverNow = readServerClock()
  const initialTab = normalizeTab((await searchParams)?.tab)
  const { portalUrl } = environments[session.environment]

  return (
    <ClientConfig sessionBinding={computeBinding(session.sid)} portalUrl={portalUrl}>
      {/* Must mount before any publisher (IdleWarning, SWR reads): publish never replays. */}
      <SessionDialogs portalUrl={portalUrl} />
      <AppBar portalUrl={portalUrl} />
      <main className="flex min-h-[calc(100dvh-52px)] flex-col bg-card">
        <section aria-label={SHELL_COPY.profileRegion} className="border-b bg-background px-4 py-3 md:px-6 md:py-4">
          <h1 className="text-h4">{SHELL_COPY.appTitle}</h1>
          <MyselfName />
        </section>
        <ProfileTabs initialTab={initialTab} />
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
