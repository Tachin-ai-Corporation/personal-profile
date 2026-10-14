import { defineConfig, devices } from "@playwright/test"

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

/**
 * Playwright drives a local production server (`next build` + `next start`)
 * started with dummy env (APP_ENV=dev and placeholder secrets — never real
 * credentials). Production is used deliberately: `next dev` injects `eval`-based
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
      APP_ENV: "dev",
      APP_ORIGIN: "https://localhost:3100",
      APP_ID: "dummy-app-id",
      ONEHEALTH_SECRET_KEY: "dummy-onehealth-secret",
      SESSION_SECRET: "dummy-session-secret-0123456789abcdef",
      // Install the server-side 1health upstream mock (launch exchange + /myself)
      // so the launch redirect-chain spec is deterministic. Never set in real envs.
      PP_E2E_MOCK: "1",
    },
  },
})
