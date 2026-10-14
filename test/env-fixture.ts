import { vi } from "vitest"
import { parseServerEnv, resetServerEnvCache, type ServerEnv } from "@/lib/server/env"

/** Dummy, valid server env for tests (never real secrets). */
export const TEST_ENV = {
  ONEHEALTH_SECRET_KEY_DEMO: "test-demo-secret-key",
  ONEHEALTH_SECRET_KEY_PROD: "test-prod-secret-key",
  APP_ID_DEMO: "test-app-demo",
  APP_ID_PROD: "test-app-prod",
  SESSION_SECRET: "s".repeat(32) + "-test-session-secret",
} as const

/** The launch secrets, for building LPL fixtures. */
export const TEST_DEMO_SECRET: string = TEST_ENV.ONEHEALTH_SECRET_KEY_DEMO
export const TEST_PROD_SECRET: string = TEST_ENV.ONEHEALTH_SECRET_KEY_PROD

/** Stubs `process.env` with the dummy env (plus overrides) and drops the env cache. */
export function stubServerEnv(overrides: Record<string, string> = {}): void {
  for (const [name, value] of Object.entries({ ...TEST_ENV, ...overrides })) vi.stubEnv(name, value)
  resetServerEnvCache()
}

/** A parsed env with overrides, for handler factories. */
export function testEnv(overrides: Record<string, string> = {}): () => ServerEnv {
  const env = parseServerEnv({ ...TEST_ENV, ...overrides })
  return () => env
}
