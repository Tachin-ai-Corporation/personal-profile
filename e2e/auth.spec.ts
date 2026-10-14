import { expect, test, type Page } from "@playwright/test"
import { sealedSessionCookie } from "./session-cookie"

/** Records any page access to `document.cookie` (there must be none). */
async function watchDocumentCookie(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = (): void => {
      Object.assign(window, { __cookieAccess: true })
    }
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => {
        record()
        return ""
      },
      set: () => record(),
    })
  })
}

const cookieAccessed = (page: Page): Promise<boolean> => page.evaluate(() => "__cookieAccess" in window)

test.describe("launch entry (/auth)", () => {
  test("a page without a session redirects to /auth, which offers Choose Environment", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/auth$/)
    await expect(page.getByText("Choose Environment")).toBeVisible()
  })

  test("a bad pasted LPL is rejected once (retryable:false) and sets no session cookie", async ({ page, context }) => {
    await watchDocumentCookie(page)
    let posts = 0
    page.on("request", (request) => {
      if (request.url().endsWith("/api/token")) posts += 1
    })
    await page.goto("/auth")
    await page.getByRole("button", { name: "Demo" }).click()
    await page.getByLabel("Launch Payload (LPL)").fill("bm90LWEtcmVhbC1sYXVuY2gtcGF5bG9hZC1hdC1hbGwtMTIzNDU2Nzg5MA==")
    const tokenResponse = page.waitForResponse("**/api/token")
    await page.getByRole("button", { name: "Submit" }).click()
    const response = await tokenResponse
    expect(response.status()).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, errorCode: "LAUNCH_INVALID", retryable: false })
    await expect(page.getByText("Authentication Failed")).toBeVisible()
    await expect(page.getByText("This link has expired. Open Personal Profile again from 1health.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Enter LPL Manually" })).toBeVisible()
    expect(posts).toBe(1)
    expect((await context.cookies()).some((c) => c.name === "__Host-pp_s")).toBe(false)
    expect(await cookieAccessed(page)).toBe(false)
  })

  test("a launch posts only { lpl }, removes it from history and lands on / signed in", async ({ page }) => {
    await watchDocumentCookie(page)
    let posted: unknown
    let posts = 0
    await page.route("**/api/token", async (route) => {
      posts += 1
      posted = route.request().postDataJSON()
      // Mocked BFF success with the same Set-Cookie the real route sends (its exchange is unit-tested).
      const cookie = await sealedSessionCookie()
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Set-Cookie": `${cookie.name}=${cookie.value}; Path=/; HttpOnly; Secure; SameSite=Lax` },
        body: JSON.stringify({ ok: true, environment: "demo" }),
      })
    })
    await page.route("**/api/1h/v2/user/myself", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 42, personId: 4242, firstName: "Ann", lastName: "Lee" }) }),
    )

    await page.goto("/auth?lpl=abc+def")
    await expect(page.getByRole("heading", { name: "Ann Lee" })).toBeVisible({ timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe("/")
    expect(page.url()).not.toContain("lpl")
    expect(posted).toEqual({ lpl: "abc+def" })

    await page.goBack()
    expect(page.url()).not.toContain("lpl")
    await page.goForward()
    await page.reload()
    await expect(page.getByRole("heading", { name: "Ann Lee" })).toBeVisible()
    expect(posts).toBe(1)
    expect(await cookieAccessed(page)).toBe(false)
  })
})
