import AxeBuilder from "@axe-core/playwright"
import { expect } from "@playwright/test"
import { ANN, MFA_TEST_QR, mockAccountDefaults, mockMfaEnrollment, setTheme, signIn, test } from "./fixtures"

test.beforeEach(async ({ page }) => { await mockAccountDefaults(page); await signIn(page) })
for (const theme of ["light", "dark"] as const) {
  test(`links after an invalid code with private transient data, keyboard focus and axe in ${theme}`, async ({ page, isMobile }) => {
    const state = await mockMfaEnrollment(page)
    const requests: string[] = []
    page.on("request", (request) => requests.push(request.url()))
    await page.goto("/account?tab=personal")
    await setTheme(page, theme)
    const tile = page.getByRole("button", { name: "Link Microsoft", exact: true })
    await tile.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "Link your Microsoft authenticator" })
    await expect(dialog).toBeVisible()
    const field = dialog.getByRole("textbox", { name: "6-digit code" })
    await expect(field).toBeFocused()
    await expect(dialog.getByRole("img")).toHaveAttribute("src", MFA_TEST_QR)
    await expect(dialog.getByRole("img").locator("..")).toHaveCSS("background-color", "rgb(255, 255, 255)")
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press("Tab")
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }
    await field.focus()
    const qr = await dialog.getByRole("img").boundingBox()
    expect(qr?.width).toBe(184)
    expect(qr?.height).toBe(184)
    const bounds = await dialog.boundingBox()
    expect(bounds?.width).toBe(isMobile ? 360 : 440)
    if (isMobile) expect(bounds?.y).toBe(0)
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCSS("height", "44px")
    await expect(dialog.getByRole("button", { name: "Submit", exact: true })).toHaveCSS("height", "44px")
    await expect(field).toHaveCSS("height", "44px")
    await expect(field).toHaveCSS("width", "200px")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await dialog.getByRole("button", { name: "Submit", exact: true }).click()
    await expect(dialog.getByText("Enter the 6-digit code", { exact: true })).toBeVisible()
    await expect(field).toBeFocused()
    expect(state.validations).toBe(0)
    await field.evaluate((element) => {
      const clipboardData = new DataTransfer()
      clipboardData.setData("text", "65a 43-21")
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }))
    })
    await expect(field).toHaveValue("654321")
    await expect(dialog.getByText("Enter the 6-digit code", { exact: true })).toHaveCount(0)
    await expect(field).not.toHaveAttribute("aria-invalid", "true")
    await field.press("Enter")
    await expect(dialog.getByText("Invalid code. Try again.", { exact: true })).toBeVisible()
    await expect(field).toHaveValue("")
    await expect(field).toBeFocused()
    expect(state.enables).toBe(1)
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([])
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
    expect(stored).not.toContain("654321")
    expect(stored).not.toContain("data:image")
    await field.fill("123456")
    await expect(dialog.getByText("Invalid code. Try again.", { exact: true })).toHaveCount(0)
    await field.press("Enter")
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Authenticator app", exact: true })).toBeFocused()
    await expect(page.getByText("Microsoft authenticator linked", { exact: true })).toBeVisible()
    await expect(page.getByRole("region", { name: "Authenticator app", exact: true }).getByText("Enabled", { exact: true })).toBeVisible()
    expect(state.enables).toBe(1)
    expect(state.validations).toBe(2)
    expect(requests.some((url) => /123456|654321|data:image/.test(url))).toBe(false)
    expect(await page.locator(`img[src="${MFA_TEST_QR}"]`).count()).toBe(0)
  })
}

test("cancellation refreshes and restores the chosen tile; reopening gets a fresh enrollment", async ({ page }) => {
  const state = await mockMfaEnrollment(page)
  await page.goto("/account?tab=personal")
  const tile = page.getByRole("button", { name: "Link Authy", exact: true })
  let previousQr = ""
  for (const action of ["Cancel", "Escape", "Close"]) {
    await tile.click()
    const dialog = page.getByRole("dialog", { name: "Link your Authy authenticator" })
    const field = dialog.getByRole("textbox", { name: "6-digit code" })
    await expect(field).toHaveValue("")
    await expect(dialog.getByRole("img")).toHaveAttribute("src", state.qrCode)
    expect(state.qrCode).not.toBe(previousQr)
    expect(await dialog.getByRole("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    previousQr = state.qrCode
    await field.fill("123")
    if (action === "Escape") await field.press("Escape")
    else await dialog.getByRole("button", { name: action, exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(tile).toBeFocused()
  }
  expect(state.enables).toBe(3)
  expect(state.validations).toBe(0)
})

test("base MFA notice refocuses on every deliberate activation without opening", async ({ page }) => {
  const state = await mockMfaEnrollment(page, { baseMfaOff: true })
  await page.goto("/account?tab=personal")
  for (let count = 1; count <= 2; count++) {
    await page.getByRole("button", { name: "Link Microsoft", exact: true }).click()
    const banner = page.locator('[data-slot="inline-banner"]').filter({ hasText: "Your account doesn't have multi-factor authentication turned on" })
    await expect(banner).toBeFocused()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    expect(state.enables).toBe(count)
  }
})

for (const forbidden of ["enable", "validate"] as const) {
  test(`${forbidden} permission denial replaces only the authenticator card`, async ({ page }) => {
    await mockMfaEnrollment(page, { forbidden })
    await page.goto("/account?tab=personal")
    await page.getByRole("button", { name: "Link Microsoft", exact: true }).click()
    if (forbidden === "validate") await page.getByRole("textbox", { name: "6-digit code" }).fill("123456").then(() => page.getByRole("button", { name: "Submit", exact: true }).click())
    await expect(page.getByRole("region", { name: "Authenticator app", exact: true }).getByText("You don't have access to this in your current account", { exact: true })).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    if (forbidden === "enable") await expect(page.getByRole("heading", { name: "Authenticator app", exact: true })).toBeFocused()
    await expect(page.getByRole("region", { name: "Personal account settings", exact: true }).getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  })
}

test("expired validation leaves focus with the shell session dialog", async ({ page }) => {
  await mockMfaEnrollment(page)
  await page.route("**/api/pp/mfa/validate", (route) => route.fulfill({ status: 401, json: { errorCode: "SESSION_EXPIRED", source: "proxy" } }))
  await page.goto("/account?tab=personal")
  await page.getByRole("button", { name: "Link Microsoft", exact: true }).click()
  const code = page.getByRole("textbox", { name: "6-digit code" })
  await code.fill("123456")
  await code.press("Enter")
  const session = page.getByRole("alertdialog", { name: "Your session ended" })
  await expect(session).toBeVisible()
  await expect(session.getByRole("button", { name: "Return to 1health", exact: true })).toBeFocused()
  await expect(page.getByRole("dialog", { name: "Link your Microsoft authenticator" })).toHaveCount(0)
  await expect(page.locator(`img[src="${MFA_TEST_QR}"]`)).toHaveCount(0)
})

test("a validation surviving pagehide blocks enrollment and reconciles the late result", async ({ page }) => {
  const state = await mockMfaEnrollment(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route("**/api/pp/mfa/validate", async (route) => {
    state.validations++
    await gate
    state.linked = true
    await route.fulfill({ json: true })
  })
  try {
    await page.goto("/account?tab=personal")
    const tile = page.getByRole("button", { name: "Link Microsoft", exact: true })
    const other = page.getByRole("button", { name: "Link Google", exact: true })
    await tile.click()
    const code = page.getByRole("textbox", { name: "6-digit code" })
    await code.fill("123456")
    await code.press("Enter")
    await expect.poll(() => state.validations).toBe(1)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })))
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.locator(`img[src="${MFA_TEST_QR}"]`)).toHaveCount(0)
    await expect(tile).toHaveAttribute("aria-busy", "true")
    await expect(other).toHaveAttribute("aria-disabled", "true")
    await other.dispatchEvent("click")
    expect(state.enables).toBe(1)
    release()
    await expect(page.getByRole("region", { name: "Authenticator app", exact: true }).getByText("Enabled", { exact: true })).toBeVisible()
    await expect(tile).not.toHaveAttribute("aria-busy", "true")
    await expect(page.getByText("Microsoft authenticator linked", { exact: true })).toHaveCount(0)
    expect(state.enables).toBe(1)
  } finally { release() }
})

test("successful validation keeps tiles inert while identity refresh is held", async ({ page }) => {
  const state = await mockMfaEnrollment(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route("**/api/1h/v2/user/myself", async (route) => {
    if (state.linked) await gate
    await route.fulfill({ json: { ...ANN, mfaEnabled: true, totpEnabled: state.linked } })
  })
  try {
    await page.goto("/account?tab=personal")
    const tile = page.getByRole("button", { name: "Link Microsoft", exact: true })
    const other = page.getByRole("button", { name: "Link Google", exact: true })
    await tile.click()
    const code = page.getByRole("textbox", { name: "6-digit code" })
    await code.fill("123456")
    await code.press("Enter")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(tile).toHaveAttribute("aria-busy", "true")
    await expect(other).toHaveAttribute("aria-disabled", "true")
    await other.dispatchEvent("click")
    expect(state.enables).toBe(1)
    release()
    await expect(page.getByRole("region", { name: "Authenticator app", exact: true }).getByText("Enabled", { exact: true })).toBeVisible()
    await expect(tile).not.toHaveAttribute("aria-busy", "true")
    expect(state.enables).toBe(1)
  } finally { release() }
})
