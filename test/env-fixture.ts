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

/** The optional dev pair (D18): spread into an env override to configure dev. */
export const TEST_DEV_ENV = {
  ONEHEALTH_SECRET_KEY_DEV: "test-dev-secret-key",
  APP_ID_DEV: "test-app-dev",
} as const

/** The launch secrets, for building LPL fixtures. */
export const TEST_DEMO_SECRET: string = TEST_ENV.ONEHEALTH_SECRET_KEY_DEMO
export const TEST_PROD_SECRET: string = TEST_ENV.ONEHEALTH_SECRET_KEY_PROD
export const TEST_DEV_SECRET: string = TEST_DEV_ENV.ONEHEALTH_SECRET_KEY_DEV

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

/** The e2e upstream mock's env (`PP_E2E_MOCK=1`): every launch credential, dev included, is an `e2e-` dummy, as the boot requires. */
export const E2E_MOCK_ENV = {
  ONEHEALTH_SECRET_KEY_DEMO: "e2e-demo-secret-key",
  ONEHEALTH_SECRET_KEY_PROD: "e2e-prod-secret-key",
  APP_ID_DEMO: "e2e-app-demo",
  APP_ID_PROD: "e2e-app-prod",
  ONEHEALTH_SECRET_KEY_DEV: "e2e-dev-secret-key",
  APP_ID_DEV: "e2e-app-dev",
  PP_E2E_MOCK: "1",
} as const
