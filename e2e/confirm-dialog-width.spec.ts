import AxeBuilder from "@axe-core/playwright"
import { expect } from "@playwright/test"
import { mockAccountDefaults, signIn, setTheme, test } from "./fixtures"
import { mockMfaDisable } from "./fixtures/mfa"

for (const width of [360, 600, 767, 768, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`shared confirmation at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await mockAccountDefaults(page)
      await signIn(page)
      await page.goto("/account")
      await setTheme(page, theme)
      const section = page.getByRole("region", { name: "Personal account settings", exact: true })
      await section.getByRole("button", { name: "Edit", exact: true }).click()
      await section.getByRole("textbox", { name: "First name", exact: true }).fill("Synthetic")
      await page.getByRole("tab", { name: "Individual Provider Registration", exact: true }).click()
      const dialog = page.getByRole("alertdialog", { name: "You have unsaved changes", exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused()
      const box = await dialog.boundingBox()
      expect(box).not.toBeNull()
      expect(box?.width).toBe(width < 768 ? width - 32 : 448)
      expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - width / 2)).toBeLessThan(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      expect((await new AxeBuilder({ page }).include('[role="alertdialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([])
      await dialog.getByRole("button", { name: "Keep editing", exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(section.getByRole("button", { name: "Save", exact: true })).toBeVisible()
    })
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const variant of ["standard", "destructive"] as const) {
    for (const viewport of [{ width: 600, height: 240 }, { width: 360, height: 320 }]) {
      test(`${variant} confirmation scrolls at ${viewport.width}x${viewport.height} with enlarged text in ${theme}`, async ({ page }) => {
        await page.setViewportSize(viewport)
        await mockAccountDefaults(page)
        await signIn(page)
        const state = variant === "destructive" ? await mockMfaDisable(page) : null
        let releaseDisable: (() => void) | undefined
        let disableRequests = 0
        if (variant === "destructive") {
          const responseGate = new Promise<void>((resolve) => { releaseDisable = resolve })
          await page.route("**/api/1h/v2/mfa/disable/totp", async (route) => {
            disableRequests++
            await responseGate
            await route.fallback()
          })
        }
        await page.goto("/account")
        await setTheme(page, theme)
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%" })
        const section = page.getByRole("region", { name: "Personal account settings", exact: true })
        if (variant === "standard") {
          await section.getByRole("button", { name: "Edit", exact: true }).click()
          await section.getByRole("textbox", { name: "First name", exact: true }).fill("Synthetic")
          await page.getByRole("tab", { name: "Individual Provider Registration", exact: true }).click()
        } else await page.getByRole("button", { name: "Disable", exact: true }).click()
        const dialog = page.getByRole("alertdialog", { name: variant === "standard" ? "You have unsaved changes" : "Turn off authenticator app?", exact: true })
        const cancel = dialog.getByRole("button", { name: variant === "standard" ? "Keep editing" : "Cancel", exact: true })
        const confirm = dialog.getByRole("button", { name: variant === "standard" ? "Save" : "Turn off", exact: true })
        await expect(cancel).toBeFocused()
        const assertFits = async (height: number) => {
          // Viewport changes can resolve before dynamic viewport units finish relayout.
          await expect(async () => {
            const box = await dialog.boundingBox()
            expect(box).not.toBeNull()
            expect(box!.y).toBeGreaterThanOrEqual(16)
            expect(box!.y + box!.height).toBeLessThanOrEqual(height - 16)
            expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(1)
          }).toPass({ timeout: 5_000 })
        }
        await assertFits(viewport.height)
        await page.setViewportSize({ ...viewport, height: viewport.height + 160 })
        await assertFits(viewport.height + 160)
        await page.setViewportSize(viewport)
        await assertFits(viewport.height)
        const dimensions = await dialog.evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }))
        expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight)
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
        await dialog.hover()
        await page.mouse.wheel(0, -1000)
        await expect(dialog.getByRole("heading")).toBeInViewport({ ratio: 1 })
        await page.mouse.wheel(0, 1000)
        await expect(confirm).toBeInViewport({ ratio: 1 })
        await cancel.focus()
        await page.keyboard.press("Shift+Tab")
        await expect(confirm).toBeFocused()
        await expect(confirm).toBeInViewport({ ratio: 1 })
        const actions = dialog.getByRole("button")
        await page.keyboard.press("Tab")
        for (let index = 0; index < await actions.count(); index++) {
          await expect(actions.nth(index)).toBeFocused()
          await expect(actions.nth(index)).toBeInViewport({ ratio: 1 })
          if (index + 1 < await actions.count()) await page.keyboard.press("Tab")
        }
        expect((await new AxeBuilder({ page }).include('[role="alertdialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([])
        if (variant === "standard") {
          await cancel.click()
          await expect(dialog).toHaveCount(0)
          await expect(section.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("Synthetic")
          await expect(page.getByRole("tab", { name: "Individual Provider Registration", exact: true })).toBeFocused()
        } else {
          await page.keyboard.press("Space")
          try {
            await expect(confirm).toHaveAttribute("aria-busy", "true")
            await cancel.focus()
            await expect(cancel).toBeInViewport({ ratio: 1 })
            await page.keyboard.press("Space")
            await page.keyboard.press("Escape")
            await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 8, y: 8 } })
            await confirm.focus()
            await expect(confirm).toBeInViewport({ ratio: 1 })
            await page.keyboard.press("Space")
            await expect(dialog).toBeVisible()
            await assertFits(viewport.height)
            expect(disableRequests).toBe(1)
          } finally { releaseDisable?.() }
          await expect(dialog).toHaveCount(0)
          await expect(page.getByRole("heading", { name: "Authenticator app", exact: true })).toBeFocused()
          expect(state!.disables).toBe(1)
          await expect(page.getByRole("region", { name: "Authenticator app", exact: true }).getByText("Not set up", { exact: true })).toBeVisible()
        }
      })
    }
  }
}
