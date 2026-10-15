/** Dummy values for every required server env var: e2e never needs real 1health credentials. */
export const TEST_SERVER_ENV = {
  ONEHEALTH_SECRET_KEY_DEMO: "e2e-demo-secret-key",
  ONEHEALTH_SECRET_KEY_PROD: "e2e-prod-secret-key",
  APP_ID_DEMO: "e2e-app-demo",
  APP_ID_PROD: "e2e-app-prod",
  /** The optional dev pair (D18), set so e2e covers a dev launch and the Dev option. */
  ONEHEALTH_SECRET_KEY_DEV: "e2e-dev-secret-key",
  APP_ID_DEV: "e2e-app-dev",
  SESSION_SECRET: "e2e-session-secret-0123456789abcdef",
  /** Serves /test-fixtures/** (the leave-guard fixture page). */
  PP_E2E_FIXTURES: "1",
  /**
   * Installs the server-side upstream mock (`test/e2e-upstream-mock.ts`): the
   * launch exchange, `myself` and the logout revoke never reach 1health.
   */
  PP_E2E_MOCK: "1",
} as const

/**
 * Each environment's launch credentials as the e2e server boots with them, for
 * `makeLpl` (`e2e/fixtures/core.ts`). Kept here so the `_DEMO`/`_PROD`/`_DEV` names
 * stay in the files `check-forbidden.sh` allows.
 */
export const E2E_LAUNCH = {
  demo: { secretKey: TEST_SERVER_ENV.ONEHEALTH_SECRET_KEY_DEMO, appId: TEST_SERVER_ENV.APP_ID_DEMO },
  prod: { secretKey: TEST_SERVER_ENV.ONEHEALTH_SECRET_KEY_PROD, appId: TEST_SERVER_ENV.APP_ID_PROD },
  dev: { secretKey: TEST_SERVER_ENV.ONEHEALTH_SECRET_KEY_DEV, appId: TEST_SERVER_ENV.APP_ID_DEV },
} as const

/** Ports used per run: the base (app) and the two kill-switch servers at base + 1 and base + 2. */
const PORT_STRIDE = 3
const DEFAULT_E2E_PORT = 3100

/** `PP_E2E_PORT` as a base port (an integer 1–65533, so base + 2 is still a port); unset or empty → 3100. */
export function e2ePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_E2E_PORT
  const port = Number(raw)
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535 - (PORT_STRIDE - 1)) {
    throw new Error(
      `PP_E2E_PORT must be an integer from 1 to ${65535 - (PORT_STRIDE - 1)}: e2e uses it and the next two ports (base, +1, +2). Got "${raw}".`,
    )
  }
  return port
}

/**
 * The e2e base port: 3100, or `PP_E2E_PORT` so two checkouts (worktrees) can
 * run e2e at once without reusing each other's server. One run takes three
 * ports: the app on the base, the kill-switch servers on base + 1 and base + 2
 * (so parallel runs need bases at least 3 apart).
 */
export const E2E_PORT = e2ePort(process.env.PP_E2E_PORT)

/** Extra servers of the same build with a kill switch on (AD-20; e2e/kill-switch.spec.ts). */
export const KILL_SWITCH_SERVERS = [
  { port: E2E_PORT + 1, env: { PP_DISABLED: "1" } },
  { port: E2E_PORT + 2, env: { ACCOUNT_DISABLED: "1" } },
] as const

export const PP_DISABLED_URL = `http://localhost:${KILL_SWITCH_SERVERS[0].port}`
export const ACCOUNT_DISABLED_URL = `http://localhost:${KILL_SWITCH_SERVERS[1].port}`
