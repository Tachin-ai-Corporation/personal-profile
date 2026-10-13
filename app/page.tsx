/**
 * Placeholder home page.
 *
 * Story 1.1 ships only the foundation. Launch, the session guard and the profile
 * shell arrive in Stories 1.2 and 1.8 — this page does no data load and no
 * session check.
 *
 * Rendered per request so the proxy's per-request CSP nonce is stamped onto
 * Next's scripts (a statically prerendered page cannot carry a per-request
 * nonce, which would blank the page under `'strict-dynamic'`). AD-18 pins this.
 */
export const dynamic = "force-dynamic"

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">Personal Profile</h1>
      <p className="text-muted-foreground">Coming soon.</p>
    </main>
  )
}
