/**
 * Next boot hook: validates the server env so a misconfigured deployment
 * fails at startup, naming the variable (never its value).
 */
export async function register(): Promise<void> {
  const { assertServerEnv } = await import("@/lib/server/env")
  assertServerEnv()
}
