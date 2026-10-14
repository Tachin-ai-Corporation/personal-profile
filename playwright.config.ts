import { defineConfig, devices } from "@playwright/test"

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

/**
 * Playwright drives a local production server (`next build` + `next start`)
 * started with dummy env (the D1 per-environment placeholder secrets — never
 * real credentials). Production is used deliberately: `next dev` injects `eval`-based
 * HMR that trips the strict CSP, whereas the header/nonce behavior we assert is a
 * production concern. The header spec runs against a desktop Chromium project and
 * a 360×740 mobile project.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        isMobile: false,
      },
    },
  ],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Must match e2e/fixtures.ts.
      ONEHEALTH_SECRET_KEY_DEMO: "dummy-demo-secret",
      ONEHEALTH_SECRET_KEY_PROD: "dummy-prod-secret",
      APP_ID_DEMO: "dummy-app-demo",
      APP_ID_PROD: "dummy-app-prod",
      SESSION_SECRET: "dummy-session-secret-0123456789abcdef",
      // Install the server-side 1health upstream mock (launch exchange + /myself)
      // so the launch specs are deterministic. Never set in real envs.
      PP_E2E_MOCK: "1",
    },
  },
})
