/**
 * Next boot hook: validates the server env so a misconfigured deployment
 * fails at startup, naming the variable (never its value). With
 * `PP_E2E_MOCK=1` (Playwright only, `e2e/server-env.ts`; never set in a
 * deployment) it also installs the server-side e2e upstream mock, so the
 * launch exchange, `myself` and the logout revoke never reach 1health.
 */
export async function register(): Promise<void> {
  const { assertServerEnv, serverEnv } = await import("@/lib/server/env")
  assertServerEnv()
  if (serverEnv().PP_E2E_MOCK) {
    const { installUpstreamMock } = await import("@/test/e2e-upstream-mock")
    installUpstreamMock()
  }
}
