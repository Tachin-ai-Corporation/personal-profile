import { expect, test, type Page } from "@playwright/test"
import { launch } from "./fixtures"

/**
 * Story 1.7: the session dialogs in the real app. The page launches (demo)
 * through `/auth` against the server-side upstream mock, then `page.route`
 * answers the in-app `myself` read with `401 SESSION_EXPIRED` or
 * `409 SESSION_CHANGED`, which `callApi` publishes and `SessionDialogs` turns
 * into its dialog. The app is never framed (D10), so there is no framed case.
 */

/** The demo session's portal (`environments.demo.portalUrl`). */
const DEMO_PORTAL = "https://1health.demo.1health.io"
const MYSELF_ROUTE = "**/api/1h/v2/user/myself"

const EXPIRED_TITLE = "Your session ended"
const CHANGED_TITLE = "This profile was opened by another account in another tab"

async function answerMyself(page: Page, status: number, code: string) {
  await page.route(MYSELF_ROUTE, (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code }) }),
  )
}

test("SESSION_EXPIRED opens the non-dismissable session-ended dialog, focus on Return to 1health", async ({ page }) => {
  await answerMyself(page, 401, "SESSION_EXPIRED")
  await launch(page)

  const dialog = page.getByRole("alertdialog", { name: EXPIRED_TITLE })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("Your changes are kept on this device. Relaunch from 1health to continue.")
  const link = dialog.getByRole("link", { name: "Return to 1health" })
  await expect(link).toBeFocused()
  await expect(link).toHaveAttribute("href", DEMO_PORTAL)

  // Non-dismissable: Escape and an overlay click change nothing.
  await page.keyboard.press("Escape")
  await page.mouse.click(5, 5)
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/\?tab=contacts$/)

  // The page stays mounted behind the overlay.
  await expect(page.locator("main h1")).toHaveText(/personal profile/i)
})

test("SESSION_CHANGED opens the changed dialog and Reload reloads the page", async ({ page }) => {
  await answerMyself(page, 409, "SESSION_CHANGED")
  await launch(page)

  const dialog = page.getByRole("alertdialog", { name: CHANGED_TITLE })
  await expect(dialog).toBeVisible()
  const reload = dialog.getByRole("button", { name: "Reload" })
  await expect(reload).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()

  await page.evaluate(() => {
    ;(window as unknown as { __beforeReload?: boolean }).__beforeReload = true
  })
  await Promise.all([page.waitForEvent("load"), reload.click()])
  expect(await page.evaluate(() => (window as unknown as { __beforeReload?: boolean }).__beforeReload)).toBeUndefined()
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
  // The reloaded page hits the same 409 and shows the dialog again.
  await expect(page.getByRole("alertdialog", { name: CHANGED_TITLE })).toBeVisible()
})

/**
 * POST the logout from inside the page, so the browser's own cookie is sent and
 * updated with real browser semantics. Returns the status and
 * the raw `Set-Cookie` (read via `allHeaders()`, which page JS cannot see).
 */
async function logoutFromPage(page: Page, binding: string) {
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/session/logout") && r.request().method() === "POST",
  )
  await page.evaluate(async (b) => {
    await fetch("/api/session/logout", { method: "POST", headers: { "X-PP-Session": b } })
  }, binding)
  const response = await responsePromise
  return { status: response.status(), setCookie: (await response.allHeaders())["set-cookie"] }
}

test("logout through the real runtime: a stale binding is a no-op; the page's binding clears the cookie", async ({
  page,
}) => {
  // The page's real binding: read it off the app's own `myself` request.
  const myselfRequest = page.waitForRequest((r) => r.url().endsWith("/api/1h/v2/user/myself"))
  await launch(page)
  const binding = (await myselfRequest).headers()["x-pp-session"]
  expect(binding, "the page sends its X-PP-Session binding").toBeTruthy()

  // A stale tab's binding → 204, no Set-Cookie, the session keeps working.
  const stale = await logoutFromPage(page, "not-the-binding")
  expect(stale.status).toBe(204)
  expect(stale.setCookie).toBeUndefined()
  await page.goto("/?tab=contacts")
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
  await expect(page.getByText("Test User", { exact: true })).toBeVisible()

  // The page's binding → 204 + the cookie cleared; `/` is then signed out.
  const real = await logoutFromPage(page, binding)
  expect(real.status).toBe(204)
  expect(real.setCookie ?? "").toContain("__Host-pp_s=;")
  expect(real.setCookie ?? "").toContain("Max-Age=0")
  await page.goto("/?tab=contacts")
  await expect(page).toHaveURL(/\/auth$/)
})
