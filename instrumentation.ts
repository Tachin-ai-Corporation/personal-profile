/**
 * Next.js instrumentation hook.
 *
 * `register()` runs once when the server boots. Importing `lib/server/env.ts`
 * here runs its load-time validation, so a missing or invalid required variable
 * fails the boot with a message that names the variable (never its value).
 *
 * When `PP_E2E_MOCK=1` (Playwright only, never dev/demo/prod), it also installs
 * the server-side upstream mock so the launch exchange and `/myself` can be
 * driven deterministically in e2e.
 */
export async function register() {
  await import("./lib/server/env")

  // eslint-disable-next-line no-restricted-properties -- test-only boot flag, not a secret
  if (process.env.PP_E2E_MOCK === "1") {
    const { installUpstreamMock } = await import("./test/e2e-upstream-mock")
    installUpstreamMock()
  }
}
