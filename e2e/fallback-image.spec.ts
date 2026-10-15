import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { setTheme, signIn } from "./fixtures"

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

/** Spec F7-2: the one `onError` fallback image (Story 1.9 avatar, Story 10.2 org logo). */
test.describe("FallbackImage", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await page.goto("/test-fixtures/fallback-image")
    await expect(page.getByRole("heading", { level: 1, name: "Fallback image" })).toBeVisible()
  })

  test("a loading image stays, a failing one and a missing one show the fallback, with no broken image", async ({ page }) => {
    const loads = page.getByRole("region", { name: "Loads" })
    await expect(loads.getByRole("img", { name: "1health" })).toBeVisible()
    await expect.poll(() => loads.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await expect(loads.getByTestId("loads-fallback")).toHaveCount(0)

    const fails = page.getByRole("region", { name: "Fails" })
    await expect(fails.getByTestId("fails-fallback")).toBeVisible()
    await expect(fails.locator("img")).toHaveCount(0)

    const none = page.getByRole("region", { name: "No source" })
    await expect(none.getByTestId("none-fallback")).toBeVisible()
    await expect(none.locator("img")).toHaveCount(0)
  })

  test("axe clean in light and dark", async ({ page }) => {
    await expect(page.getByTestId("fails-fallback")).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
      expect(results.violations, theme).toEqual([])
    }
  })
})
