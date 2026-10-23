import { existsSync } from "node:fs"
import { defineConfig, devices } from "@playwright/test"
import type { LiveOptions } from "./e2e-live/fixtures"
import { PORTAL_SESSION_FILE, liveSettingsFrom } from "./e2e-live/live-env"

/**
 * Live e2e against 1health dev (NG-9019): `pnpm exec playwright test -c playwright.live.config.ts`.
 * Never part of `pnpm test:e2e` or CI. See `e2e-live/README.md`.
 *
 * Settings come from `.env.live.local` (gitignored): the dev test user
 * (`LIVE_DEV_*`) and, for a local target, the app server's real dev launch
 * credentials. `LIVE_BASE_URL` targets a deployed app instead (no local server).
 */
const ENV_FILE = ".env.live.local"
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)

const PORT = Number(process.env.LIVE_PORT ?? 3200)
const LIVE = liveSettingsFrom(process.env)
const TARGET = process.env.LIVE_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig<LiveOptions>({
  testDir: "e2e-live",
  // Portal mode (LIVE_PORTAL_LOGIN=1): a person signs in to the dev portal once; the tests reuse that app session.
  globalSetup: "./e2e-live/global-setup.ts",
  // One dev user: tests run one at a time so writes and logout never overlap.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/live", open: "never" }]],
  outputDir: "test-results/live",
  use: { baseURL: TARGET, trace: "retain-on-failure", screenshot: "only-on-failure", live: LIVE, ...(LIVE.mode === "portal" ? { storageState: PORTAL_SESSION_FILE } : {}) },
  projects: [
    { name: "desktop", testIgnore: /live-exit/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-360", testIgnore: /live-exit/, use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
    // Logout ends the session every other test uses, so it runs last.
    { name: "exit", testMatch: /live-exit/, dependencies: ["desktop", "mobile-360"], use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.LIVE_BASE_URL
    ? undefined
    : {
        // Shares `.next` with `pnpm test:e2e`: don't run both at once. Never reuses a running (mocked) server.
        command: `corepack pnpm build && corepack pnpm start --port ${PORT}`,
        url: `${TARGET}/auth`,
        reuseExistingServer: false,
        timeout: 300_000,
        // Real upstream: the in-process mock and the test fixtures stay off.
        env: { PP_E2E_MOCK: "0", PP_E2E_FIXTURES: "0" },
      },
})
