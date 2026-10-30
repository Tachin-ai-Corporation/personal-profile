import { expect, test, type Locator, type Page } from "@playwright/test"
import { signIn } from "./fixtures"

/**
 * The design refresh's foundation pieces, opted in together on a fixture page
 * (#61 review): the Section menu's sliding indicator, its hover, and the copy
 * and saved feedback, with real CSS, layout and stacking. Each runs with
 * motion allowed and reduced; the assertions wait for the final state, never
 * for a fixed animation delay. The rest of the suite keeps the config's
 * reduced-motion default.
 */
const FIXTURE = "/test-fixtures/design-refresh"
const PHONE = "+1 (415) 555-2671"

const menu = (page: Page) => page.getByRole("navigation", { name: "Sections" })
const menuLink = (page: Page, name: string) => menu(page).getByRole("link", { name, exact: true })
const indicator = (page: Page) => page.locator('[data-slot="section-nav-indicator"]')
const section = (page: Page, id: string) => page.locator(`section#${id}`)

/** The largest gap, in px, between the indicator's and `link`'s top and height. */
async function indicatorOffset(page: Page, link: Locator): Promise<number> {
  const [a, b] = await Promise.all([indicator(page).boundingBox(), link.boundingBox()])
  return a && b ? Math.max(Math.abs(a.y - b.y), Math.abs(a.height - b.height)) : Number.POSITIVE_INFINITY
}

/** The indicator rests on the current (`aria-current`) item. */
async function expectIndicatorOnCurrent(page: Page): Promise<void> {
  const current = menu(page).locator('a[aria-current="location"]')
  await expect(current).toHaveCount(1)
  await expect.poll(() => indicatorOffset(page, current)).toBeLessThanOrEqual(1)
}

const backgroundOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor)
const opacityOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).opacity)
const TRANSPARENT = "rgba(0, 0, 0, 0)"

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test.describe(`design refresh (foundation opt-in), reducedMotion ${reducedMotion}`, () => {
    test.use({ contextOptions: { reducedMotion }, permissions: ["clipboard-read", "clipboard-write"] })

    test.beforeEach(async ({ page }) => {
      await signIn(page)
      await page.goto(FIXTURE)
      await expect(page.getByRole("heading", { level: 2, name: "Phone" })).toBeVisible()
    })

    test("the menu indicator follows a selection and a viewport resize", async ({ page, isMobile }) => {
      test.skip(isMobile, "the menu shows from 768 px (Jump to below)")
      await expect(indicator(page)).toHaveAttribute("data-ready", "true")
      await expectIndicatorOnCurrent(page)
      // It slides only when motion is allowed (globals.css cuts every transition to 0.01 ms under reduced motion).
      const duration = await indicator(page).evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration))
      if (reducedMotion === "reduce") expect(duration).toBeLessThan(0.001)
      else expect(duration).toBe(0.3)

      await menuLink(page, "Email").click()
      await expect(menuLink(page, "Email")).toHaveAttribute("aria-current", "location")
      await expectIndicatorOnCurrent(page)

      // Below 768 px the menu is hidden; back above, the list resizes from nothing and the indicator is placed again.
      const viewport = page.viewportSize()
      if (!viewport) throw new Error("no viewport")
      await page.setViewportSize({ width: 700, height: viewport.height })
      await expect(menu(page)).toBeHidden()
      await page.setViewportSize(viewport)
      await expect(menu(page)).toBeVisible()
      await expectIndicatorOnCurrent(page)
    })

    test("hovering the current item keeps its indicator visible; another item takes its hover tint", async ({ page, isMobile }) => {
      test.skip(isMobile, "the menu shows from 768 px (Jump to below)")
      const phone = menuLink(page, "Phone")
      await phone.click()
      await expect(phone).toHaveAttribute("aria-current", "location")
      await expectIndicatorOnCurrent(page)
      const fill = await backgroundOf(indicator(page))
      expect(fill).not.toBe(TRANSPARENT)

      await phone.hover()
      expect(await phone.evaluate((element) => element.matches(":hover"))).toBe(true)
      // The link paints over the indicator: a hover fill on it would cover the indicator's tint and bar.
      expect(await backgroundOf(phone)).toBe(TRANSPARENT)
      expect(await backgroundOf(indicator(page))).toBe(fill)
      await expectIndicatorOnCurrent(page)

      const addresses = menuLink(page, "Addresses")
      await addresses.hover()
      await expect.poll(() => backgroundOf(addresses)).not.toBe(TRANSPARENT)
      expect(await addresses.getAttribute("aria-current")).toBeNull()
    })

    test("a copy shows ✓ and \"Copied\", announces it, writes the clipboard, then reverts", async ({ page }) => {
      const button = page.getByRole("button", { name: `Copy ${PHONE}` })
      const row = page.getByTestId("phone-row")
      const bubble = row.locator('[data-slot="copy-confirmation"]')
      await button.click()

      await expect(button).toHaveAttribute("data-copied", "true")
      await expect(button.locator("svg.lucide-check")).toBeVisible()
      await expect(bubble).toHaveText("Copied")
      await expect.poll(() => opacityOf(bubble)).toBe("1")
      await expect.poll(() => opacityOf(button)).toBe("1")
      await expect(row.locator('[data-slot="copy-status"]')).toHaveText(`${PHONE} copied`)
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(PHONE)

      await expect(bubble).toHaveCount(0)
      await expect(button).not.toHaveAttribute("data-copied")
      await expect(button.locator("svg.lucide-copy")).toBeVisible()
    })

    test("a save shows its Section's check and ring, then both go; other Sections stay still", async ({ page, isMobile }) => {
      const phone = section(page, "phone")
      const check = phone.locator('[data-slot="animated-icon-success"]')
      const ring = phone.locator('[data-slot="section-saved-flash"]')
      await page.getByRole("button", { name: "Save Phone" }).click()

      // The header tile (and its check) shows from 640 px.
      if (!isMobile) await expect.poll(() => opacityOf(check)).toBe("1")
      await expect(section(page, "email").locator('[data-slot="animated-icon-success"], [data-slot="section-saved-flash"]')).toHaveCount(0)
      await expect(check).toHaveCount(0)
      await expect(ring).toBeHidden()

      // A second save shows it again.
      await page.getByRole("button", { name: "Save Phone" }).click()
      if (!isMobile) await expect.poll(() => opacityOf(check)).toBe("1")
      await expect(check).toHaveCount(0)
    })
  })
}
