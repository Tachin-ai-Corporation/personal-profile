import { defineConfig, devices } from "@playwright/test"
import { E2E_PORT, KILL_SWITCH_SERVERS, TEST_SERVER_ENV } from "./e2e/server-env"

const PORT = E2E_PORT
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      // Production server: the CSP has no 'unsafe-eval' outside `next dev`.
      // CI builds once in its own step; locally `pnpm test:e2e` builds first.
      command: process.env.CI ? `corepack pnpm start --port ${PORT}` : `corepack pnpm build && corepack pnpm start --port ${PORT}`,
      url: `${BASE_URL}/auth`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: TEST_SERVER_ENV,
    },
    // The same build with a kill switch on (e2e/kill-switch.spec.ts). Servers start one after
    // another, so these reuse the build above. Ready check: a static file (pages answer 503).
    ...KILL_SWITCH_SERVERS.map(({ port, env }) => ({
      command: `corepack pnpm start --port ${port}`,
      url: `http://localhost:${port}/favicon.png`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...TEST_SERVER_ENV, ...env },
    })),
  ],
})
