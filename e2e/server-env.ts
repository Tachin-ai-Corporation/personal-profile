/** Dummy values for every required server env var: e2e never needs real 1health credentials. */
export const TEST_SERVER_ENV = {
  ONEHEALTH_SECRET_KEY_DEMO: "e2e-demo-secret-key",
  ONEHEALTH_SECRET_KEY_PROD: "e2e-prod-secret-key",
  APP_ID_DEMO: "e2e-app-demo",
  APP_ID_PROD: "e2e-app-prod",
  SESSION_SECRET: "e2e-session-secret-0123456789abcdef",
  /** Serves /test-fixtures/** (the leave-guard fixture page). */
  PP_E2E_FIXTURES: "1",
} as const

/**
 * The e2e server's port: 3100, or `PP_E2E_PORT` so two checkouts (worktrees)
 * can run e2e at once without reusing each other's server. The kill-switch
 * servers take the next two ports.
 */
export const E2E_PORT = Number(process.env.PP_E2E_PORT || 3100)

/** Extra servers of the same build with a kill switch on (AD-20; e2e/kill-switch.spec.ts). */
export const KILL_SWITCH_SERVERS = [
  { port: E2E_PORT + 1, env: { PP_DISABLED: "1" } },
  { port: E2E_PORT + 2, env: { ACCOUNT_DISABLED: "1" } },
] as const

export const PP_DISABLED_URL = `http://localhost:${KILL_SWITCH_SERVERS[0].port}`
export const ACCOUNT_DISABLED_URL = `http://localhost:${KILL_SWITCH_SERVERS[1].port}`
