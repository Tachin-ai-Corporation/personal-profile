import { rmSync } from "node:fs"
import { DEV, PORTAL_SESSION_FILE } from "./live-env"
import { expect, test } from "./fixtures"

/**
 * "Return to 1health" on dev (`LIVE_ALLOW_LOGOUT=1` only): the BFF revokes
 * the user's sessions on every device and the browser lands on the dev
 * portal; the app then asks for a new launch. Its own project (`exit`) runs
 * after every other test, since it ends the shared portal session.
 */

test.describe("Exit on dev", () => {
  test.skip(({ live }) => !live.allowLogout, "Set LIVE_ALLOW_LOGOUT=1: logout revokes every session of the dev test user.")
  test.skip(({ isMobile }) => isMobile, "Logout runs once, on desktop.")

  test("Return to 1health signs out and opens the dev portal; / then needs a new launch", async ({ page, liveLaunch }) => {
    await liveLaunch()
    await page.getByRole("link", { name: "Return to 1health" }).click()
    await expect(page).toHaveURL((url) => url.origin === new URL(DEV.portalUrl).origin, { timeout: 30_000 })
    await page.goto("/")
    await expect(page).toHaveURL(/\/auth/)
    // Portal mode: the saved session is revoked now; the next run asks for a sign-in again.
    rmSync(PORTAL_SESSION_FILE, { force: true })
  })
})
