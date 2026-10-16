import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { mockProfileDefaults, setTheme, signIn, test } from "./fixtures"

/**
 * Story 1.14 (Team A): the Save all bar (≥ 768 px) and pill (< 768 px) on
 * the Save-all fixture page (`/test-fixtures/save-all`, spec NG-9027): the
 * `/` frame with `SAVE_ORDER` and `SaveAllBar` over fixture participants
 * (personal 1, phone 2, email 3, guard-only insurance). `?fail=<id>` makes
 * that participant's save fail; `save-log` lists the saves in call order.
 * Runs in both projects (desktop and mobile-360).
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const SAVE_ORDER_IDS = ["personal", "email", "phone"] as const

const field = (page: Page, id: string): Locator => page.getByLabel(`Fixture ${id}`)
const saveAll = (page: Page, count: number): Locator => page.getByRole("button", { name: `Save all (${count})` })
const discardAll = (page: Page): Locator => page.getByRole("button", { name: "Discard all" })
const bar = (page: Page): Locator => page.locator('[data-slot="save-all-bar"]')
const pill = (page: Page): Locator => page.locator('[data-slot="save-all-pill"]')
const saveLog = (page: Page): Locator => page.getByTestId("save-log").locator("li")
/** A shown toast (the Radix toast `li`) with that text. */
const toastWith = (page: Page, text: string): Locator => page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })

async function open(page: Page, query = ""): Promise<void> {
  await signIn(page)
  await mockProfileDefaults(page)
  await page.goto(`/test-fixtures/save-all${query}`)
  await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
}

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

test.describe("Save all (Story 1.14)", () => {
  test("phone fails: '1 saved, 1 failed', 'Save all (1)', saves in SAVE_ORDER, the toast above Save all, axe, no horizontal scroll", async ({ page, isMobile }) => {
    await open(page, "?fail=phone")
    await expect(bar(page)).toHaveCount(0)
    await expect(pill(page)).toHaveCount(0)
    await field(page, "phone").fill("b")
    await field(page, "email").fill("c")
    if (isMobile) {
      await expect(pill(page)).toBeVisible()
      await expect(discardAll(page)).toHaveCount(0)
    } else {
      await expect(bar(page)).toBeVisible()
      await expect(bar(page).getByText("2 unsaved sections")).toBeVisible()
      await expect(discardAll(page)).toBeVisible()
    }
    await expect(saveAll(page, 2)).toBeVisible()
    await expectNoAxeViolations(page, "dirty")
    await expectNoHorizontalScroll(page)

    await saveAll(page, 2).click()
    const toast = toastWith(page, "1 saved, 1 failed")
    await expect(toast).toBeVisible()
    await expect(saveAll(page, 1)).toBeVisible()
    await expect(page.getByTestId("dirty-count")).toHaveText("1")
    // SAVE_ORDER: email before phone (page order is phone first).
    await expect(saveLog(page)).toHaveText(["email", "phone"])
    await expect(page.getByTestId("fixture-phone").locator("output")).toHaveText("not saved")
    await expect(page.getByTestId("fixture-email").locator("output")).toHaveText("saved")
    // --toast-bottom-offset: the summary toast never covers Save all.
    const button = saveAll(page, 1)
    await expect
      .poll(async () => {
        const [toastBox, buttonBox] = await Promise.all([toast.boundingBox(), button.boundingBox()])
        return toastBox && buttonBox ? toastBox.y + toastBox.height <= buttonBox.y : false
      })
      .toBe(true)
    await expectNoAxeViolations(page, "after the run")
    await expectNoHorizontalScroll(page)
  })

  test("every Save-all participant saves in SAVE_ORDER; the guard-only one is never saved; the bar goes at 0", async ({ page }) => {
    await open(page)
    // Typed in page order.
    await field(page, "personal").fill("a")
    await field(page, "phone").fill("b")
    await field(page, "email").fill("c")
    await field(page, "insurance").fill("d")
    await saveAll(page, 3).click()
    await expect(toastWith(page, "All saved.")).toBeVisible()
    await expect(saveLog(page)).toHaveText([...SAVE_ORDER_IDS])
    await expect(bar(page)).toHaveCount(0)
    await expect(pill(page)).toHaveCount(0)
    await expect(page.getByTestId("fixture-insurance").locator("output")).toHaveText("")
  })

  test("Discard all reverts every dirty Save-all Section and the bar goes (desktop)", async ({ page, isMobile }) => {
    test.skip(isMobile, "the pill has no Discard all")
    await open(page)
    await field(page, "phone").fill("b")
    await field(page, "email").fill("c")
    await discardAll(page).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(bar(page)).toHaveCount(0)
    await expect(field(page, "phone")).toHaveValue("")
    await expect(field(page, "email")).toHaveValue("")
    await expect(page.getByTestId("dirty-count")).toHaveText("0")
    await expect(saveLog(page)).toHaveCount(0)
  })

  test("invalid: nothing sent, the sub-line names it (bar), focus on its field", async ({ page, isMobile }) => {
    await open(page)
    await field(page, "phone").fill("b")
    await field(page, "email").fill("invalid")
    await saveAll(page, 2).click()
    await expect(field(page, "email")).toBeFocused()
    if (!isMobile) await expect(page.locator('[data-slot="save-all-subline"]')).toHaveText("Fixture email has 1 field to fix")
    await expect(saveLog(page)).toHaveCount(0)
    await expect(page.getByTestId("dirty-count")).toHaveText("2")
  })

  test("Save all is last in the tab order", async ({ page, isMobile }) => {
    await open(page)
    await field(page, "phone").fill("b")
    await field(page, "insurance").fill("d")
    await field(page, "insurance").focus()
    if (!isMobile) {
      await page.keyboard.press("Tab")
      await expect(discardAll(page)).toBeFocused()
    }
    await page.keyboard.press("Tab")
    await expect(saveAll(page, 1)).toBeFocused()
    const last = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")]
      const stops = candidates.filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled") && el.getClientRects().length > 0)
      return stops.at(-1)?.textContent
    })
    expect(last).toBe("Save all (1)")
  })

  test("the pill hides while the on-screen keyboard is open and comes back on blur (360 px)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the pill is the < 768 px layout")
    await open(page)
    await field(page, "phone").fill("b")
    await expect(pill(page)).toBeVisible()
    const offset = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--toast-bottom-offset"))
    expect(await offset()).toBe("4.5rem")
    await field(page, "phone").focus()
    // An on-screen keyboard: the visual viewport shrinks by 300 px.
    await page.evaluate(() => {
      const viewport = window.visualViewport!
      Object.defineProperty(viewport, "height", { configurable: true, get: () => window.innerHeight - 300 })
      viewport.dispatchEvent(new Event("resize"))
    })
    await expect(pill(page)).toHaveCount(0)
    expect(await offset()).toBe("")
    await field(page, "phone").blur()
    await expect(pill(page)).toBeVisible()
    expect(await offset()).toBe("4.5rem")
    // Focused again with the keyboard up: hidden; the keyboard closes (viewport back): shown.
    await field(page, "phone").focus()
    await expect(pill(page)).toHaveCount(0)
    await page.evaluate(() => {
      const viewport = window.visualViewport!
      delete (viewport as unknown as { height?: number }).height
      viewport.dispatchEvent(new Event("resize"))
    })
    await expect(pill(page)).toBeVisible()
  })
})
