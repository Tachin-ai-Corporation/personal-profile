/**
 * Test fixture: a complete, valid D1 server env with dummy values, for unit
 * tests that load the real `lib/server/env.ts` from `process.env`. Never real
 * credentials. Spread it into `process.env`, overriding `SESSION_SECRET` etc.
 * per test as needed.
 */
export const TEST_SERVER_ENV: Readonly<Record<string, string>> = {
  ONEHEALTH_SECRET_KEY_DEMO: "dummy-demo-secret",
  ONEHEALTH_SECRET_KEY_PROD: "dummy-prod-secret",
  APP_ID_DEMO: "dummy-app-demo",
  APP_ID_PROD: "dummy-app-prod",
  SESSION_SECRET: "dummy-session-secret-0123456789abcdef",
}
