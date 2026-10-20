import AxeBuilder from "@axe-core/playwright"
import { expect } from "@playwright/test"
import { mockAccountDefaults, setTheme, signIn, test } from "./fixtures"
import { MFA_TEST_QR, mockMfaDisable } from "./fixtures/mfa"

test.beforeEach(async ({ page }) => { await mockAccountDefaults(page); await signIn(page) })
for (const theme of ["light", "dark"] as const) {
  test(`centered confirmed TOTP removal preserves base MFA with keyboard and axe in ${theme}`, async ({ page, isMobile }) => {
    const state = await mockMfaDisable(page)
    const mfaRequests: string[] = []
    page.on("request", (request) => { if (/^\/api\/(?:1h\/v2|pp)\/mfa(?:\/|$)/.test(new URL(request.url()).pathname)) { mfaRequests.push(new URL(request.url()).pathname); expect(request.postData()).toBeNull(); expect(new URL(request.url()).search).toBe("") } })
    await page.goto("/account?tab=personal")
    await setTheme(page, theme)
    const disable = page.getByRole("button", { name: "Disable", exact: true })
    await disable.focus(); await page.keyboard.press("Enter")
    const dialog = page.getByRole("alertdialog", { name: "Turn off authenticator app?" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("You'll no longer be asked for a code from your authenticator app when you sign in.", { exact: true })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused()
    expect(state.disables).toBe(0)
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press("Tab")
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).focus()
    await page.keyboard.press("Shift+Tab")
    await expect(dialog.getByRole("button", { name: "Turn off", exact: true })).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused()
    const bounds = await dialog.boundingBox()
    const viewport = page.viewportSize()!
    expect(bounds!.width).toBe(isMobile ? viewport.width - 32 : 448)
    expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2)).toBeLessThan(1)
    expect(Math.abs(bounds!.y + bounds!.height / 2 - viewport.height / 2)).toBeLessThan(1)
    for (const name of ["Cancel", "Turn off"]) await expect(dialog.getByRole("button", { name, exact: true })).toHaveCSS("height", "44px")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).include('[role="alertdialog"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([])
    await dialog.getByRole("button", { name: "Turn off", exact: true }).focus()
    await page.keyboard.press("Space")
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Authenticator app", exact: true })).toBeFocused()
    await expect(page.getByText("Authenticator app disabled", { exact: true })).toBeVisible()
    await expect(page.getByRole("region", { name: "Authenticator app", exact: true }).getByText("Not set up", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Link Google", exact: true })).not.toHaveAttribute("aria-disabled", "true")
    expect(state.disables).toBe(1)
    expect(state.mfaEnabled).toBe(true)
    expect(mfaRequests).toEqual(["/api/1h/v2/mfa/disable/totp"])
    await page.getByRole("button", { name: "Link Google", exact: true }).click()
    const enrollment = page.getByRole("dialog", { name: "Link your Google authenticator" })
    await expect(enrollment.getByRole("img")).toHaveAttribute("src", MFA_TEST_QR)
    expect(state.enables).toBe(1)
    expect(mfaRequests).toEqual(["/api/1h/v2/mfa/disable/totp", "/api/1h/v2/mfa/enable/totp"])
  })
}

test("Cancel, Escape and overlay dismissal preserve status and restore Disable", async ({ page }) => {
  const state = await mockMfaDisable(page)
  await page.goto("/account?tab=personal")
  const disable = page.getByRole("button", { name: "Disable", exact: true })
  for (const action of ["Cancel", "Escape", "overlay"]) {
    await disable.click()
    const dialog = page.getByRole("alertdialog", { name: "Turn off authenticator app?" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused()
    if (action === "Escape") await page.keyboard.press("Escape")
    else if (action === "overlay") await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 8, y: 8 } })
    else await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(disable).toBeFocused()
  }
  expect(state.disables).toBe(0)
  expect(state.linked).toBe(true)
})

for (const failure of ["error", "forbidden", "session"] as const) {
  test(`handles ${failure} with correct feature and shell focus`, async ({ page }) => {
    const state = await mockMfaDisable(page, { failure })
    await page.goto("/account?tab=personal")
    const disable = page.getByRole("button", { name: "Disable", exact: true })
    await disable.click()
    await page.getByRole("button", { name: "Turn off", exact: true }).click()
    await expect(page.getByRole("alertdialog", { name: "Turn off authenticator app?" })).toHaveCount(0)
    if (failure === "session") {
      const session = page.getByRole("alertdialog", { name: "Your session ended" })
      await expect(session).toBeVisible()
      await expect(session.getByRole("button", { name: "Return to 1health", exact: true })).toBeFocused()
    } else if (failure === "forbidden") {
      await expect(page.getByRole("region", { name: "Authenticator app", exact: true }).getByText("You don't have access to this in your current account", { exact: true })).toBeVisible()
      await expect(page.getByRole("region", { name: "Personal account settings", exact: true }).getByRole("button", { name: "Edit", exact: true })).toBeVisible()
    } else {
      await expect(page.getByText("Couldn't turn off the authenticator app. Try again.", { exact: true })).toBeVisible()
      await expect(disable).toBeFocused()
      await expect(page.getByText("Private upstream text", { exact: true })).toHaveCount(0)
    }
    expect(state.disables).toBe(1)
    expect(state.linked).toBe(true)
  })
}

for (const theme of ["light", "dark"] as const) {
  test(`confirmation retains exact 16px gutters at 600px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 })
    const state = await mockMfaDisable(page)
    await page.goto("/account?tab=personal")
    await setTheme(page, theme)
    await page.getByRole("button", { name: "Disable", exact: true }).click()
    const dialog = page.getByRole("alertdialog", { name: "Turn off authenticator app?" })
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused()
    const bounds = await dialog.boundingBox()
    expect(bounds?.x).toBe(16)
    expect(bounds?.width).toBe(568)
    expect((await new AxeBuilder({ page }).include('[role="alertdialog"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([])
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    expect(state.disables).toBe(0)
  })
}
