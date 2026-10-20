import AxeBuilder from "@axe-core/playwright"
import { expect } from "@playwright/test"
import { mockAccountDefaults, signIn, setTheme, test } from "./fixtures"

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
