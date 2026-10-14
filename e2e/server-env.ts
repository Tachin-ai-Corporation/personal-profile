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
