import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { setTheme, signIn } from "./fixtures"

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const FIXTURE = "/test-fixtures/combobox"

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

const npi = (page: Page) => page.getByRole("combobox", { name: "Search for your personal NPI number" })
const address = (page: Page) => page.getByRole("combobox", { name: "Address line 1" })
const insurer = (page: Page) => page.getByRole("combobox", { name: "Insurer" })
const gender = (page: Page) => page.getByRole("combobox", { name: "Gender identity" })
const listbox = (page: Page, name: string) => page.getByRole("listbox", { name })
const npiList = (page: Page) => listbox(page, "Search for your personal NPI number")
const enabledOptions = (list: Locator) => list.locator("[role='option']:not([aria-disabled='true'])")
const log = (page: Page) => page.getByTestId("npi-log")

/** Taps on touch projects, clicks otherwise. */
async function press(target: Locator, isMobile: boolean): Promise<void> {
  if (isMobile) await target.tap()
  else await target.click()
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await page.goto(FIXTURE)
  await expect(page.getByRole("heading", { level: 1, name: "Combobox" })).toBeVisible()
})

test.describe("F5-2 combobox", () => {
  test("axe clean in light and dark: closed, results, error row, zero results, Add option, suggestions", async ({ page }) => {
    await expectNoAxeViolations(page, "closed")

    await npi(page).focus()
    await expect(enabledOptions(npiList(page))).toHaveCount(10)
    await expectNoAxeViolations(page, "NPI results")

    await npi(page).fill("error")
    await expect(page.getByRole("button", { name: "Try again." })).toBeVisible()
    await expectNoAxeViolations(page, "NPI error row")

    await npi(page).fill("zzz")
    await expect(page.getByRole("option", { name: "No matching NPI found" })).toBeVisible()
    await expectNoAxeViolations(page, "NPI zero results")
    await page.keyboard.press("Escape")

    await insurer(page).fill("Zeta")
    await expect(page.getByRole("option", { name: "Add “Zeta”" })).toBeVisible()
    await expectNoAxeViolations(page, "insurer Add option")
    await page.keyboard.press("Escape")

    await address(page).fill("12 Main")
    await expect(listbox(page, "Address line 1").getByRole("option")).toHaveCount(5)
    await expectNoAxeViolations(page, "address suggestions")
  })

  test("targets are 44 px, inputs use 16 px text, NPI options are 52 px, and nothing scrolls sideways", async ({ page }) => {
    for (const input of [npi(page), address(page), insurer(page), gender(page)]) {
      expect((await input.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px")
    }
    await npi(page).focus()
    await expect(enabledOptions(npiList(page))).toHaveCount(10)
    expect((await enabledOptions(npiList(page)).first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(52)
    const clear = page.getByRole("button", { name: "Clear Gender identity" })
    const box = await clear.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const popup = await npiList(page).boundingBox()
    const viewport = page.viewportSize() ?? { width: 0, height: 0 }
    expect((popup?.x ?? -1) >= 0 && (popup?.x ?? 0) + (popup?.width ?? 0) <= viewport.width).toBe(true)
  })
})

test.describe("NPI variant", () => {
  test("focus opens page 0 of the empty query; arrows, End pages; Enter picks the full label; Escape never reaches the Section", async ({ page }) => {
    const input = npi(page)
    await input.focus()
    await expect(input).toHaveAttribute("aria-expanded", "true")
    await expect(log(page)).toHaveText("|0")
    await expect(enabledOptions(npiList(page))).toHaveCount(10)
    await expect(page.getByRole("status").filter({ hasText: "10 results" })).toHaveCount(1)

    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("End")
    await expect(log(page)).toHaveText("|0 |1")
    await expect(enabledOptions(npiList(page))).toHaveCount(20)
    await page.keyboard.press("End")
    await expect(log(page)).toHaveText("|0 |1 |2")
    await expect(enabledOptions(npiList(page))).toHaveCount(25)
    await expect(page.getByRole("option", { name: "No more results" })).toHaveAttribute("aria-disabled", "true")
    // The end row is skipped by the keys and no further page is requested.
    await page.keyboard.press("End")
    await page.keyboard.press("ArrowDown")
    await expect(log(page)).toHaveText("|0 |1 |2")
    const active = await input.getAttribute("aria-activedescendant")
    expect(active).toBe(await enabledOptions(npiList(page)).last().getAttribute("id"))

    await page.keyboard.press("Home")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(input).toHaveValue("1234500001, Person01 Garcia, Austin, TX")
    await expect(input).toHaveAttribute("aria-expanded", "false")
    await expect(page.getByTestId("npi-value")).toHaveText("1234500001")

    await page.keyboard.press("ArrowDown")
    await expect(input).toHaveAttribute("aria-expanded", "true")
    await page.keyboard.press("Escape")
    await expect(input).toHaveAttribute("aria-expanded", "false")
    await expect(input).toBeFocused()
    await expect(page.getByTestId("section-escapes")).toHaveText("0")
  })

  test("debounce: fast typing sends one request 600 ms after the last key; typing drops the pick", async ({ page }) => {
    const input = npi(page)
    await input.focus()
    await expect(log(page)).toHaveText("|0")
    // Timed in the page: the last keystroke and the moment the request is logged.
    await page.evaluate(() => {
      const timing = { lastKey: 0, request: 0 }
      ;(window as unknown as { __timing: typeof timing }).__timing = timing
      document.addEventListener("keydown", () => (timing.lastKey = performance.now()), true)
      const logEl = document.querySelector("[data-testid='npi-log']") as HTMLElement
      new MutationObserver(() => {
        if (!timing.request && logEl.textContent?.includes("Lee|0")) timing.request = performance.now()
      }).observe(logEl, { childList: true, subtree: true, characterData: true })
    })
    await page.keyboard.type("Lee", { delay: 50 })
    await page.waitForTimeout(400)
    await expect(log(page)).toHaveText("|0")
    await expect(log(page)).toHaveText("|0 Lee|0")
    const { lastKey, request } = await page.evaluate(() => (window as unknown as { __timing: { lastKey: number; request: number } }).__timing)
    expect(request - lastKey).toBeGreaterThanOrEqual(550)
    expect(request - lastKey).toBeLessThan(1000)
    await expect(enabledOptions(npiList(page))).toHaveCount(5)
    await page.waitForTimeout(800)
    await expect(log(page)).toHaveText("|0 Lee|0")

    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("npi-value")).toHaveText("1234500000")
    await page.keyboard.press("Backspace")
    await expect(page.getByTestId("npi-value")).toHaveText("")
  })

  test("error row: Tab reaches Try again., which retries the same query and page; zero results; select-only Tab clears", async ({ page }) => {
    const input = npi(page)
    await input.focus()
    await input.fill("error")
    const retry = page.getByRole("button", { name: "Try again." })
    await expect(retry).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: "Couldn't load results." })).toHaveCount(1)
    await page.keyboard.press("Tab")
    await expect(retry).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(input).toBeFocused()
    await expect(enabledOptions(npiList(page))).toHaveCount(10)
    await expect(log(page)).toContainText("error|0 error|0")

    await input.fill("zzz")
    await expect(page.getByRole("option", { name: "No matching NPI found" })).toBeVisible()
    await page.keyboard.press("Tab")
    await expect(input).toHaveValue("")
    await expect(input).toHaveAttribute("aria-expanded", "false")
  })

  test("touch or pointer: a press picks an option; × clears and keeps focus", async ({ page, isMobile }) => {
    const input = npi(page)
    await press(input, isMobile)
    await expect(enabledOptions(npiList(page))).toHaveCount(10)
    await press(enabledOptions(npiList(page)).nth(2), isMobile)
    await expect(input).toHaveValue("1234500002, Person02 Patel, Austin, TX")
    await expect(input).toBeFocused()
    await press(page.getByRole("button", { name: "Clear Search for your personal NPI number" }), isMobile)
    await expect(input).toHaveValue("")
    await expect(input).toBeFocused()
    await expect(page.getByRole("status").filter({ hasText: "Cleared" })).toHaveCount(1)
  })

  test("scrolling to the last option loads the next page", async ({ page }) => {
    await npi(page).focus()
    await expect(enabledOptions(npiList(page))).toHaveCount(10)
    await enabledOptions(npiList(page)).last().scrollIntoViewIfNeeded()
    await expect(log(page)).toHaveText("|0 |1")
    await expect(enabledOptions(npiList(page))).toHaveCount(20)
  })
})

test.describe("Address, insurer and gender identity variants", () => {
  test("address: suggestions after 3 chars with the match in 600, free text kept on Tab, silent failure, off when the country has none", async ({ page }) => {
    const input = address(page)
    await input.focus()
    await page.keyboard.type("12")
    await page.waitForTimeout(400)
    await expect(input).toHaveAttribute("aria-expanded", "false")
    await page.keyboard.type(" Main")
    const list = listbox(page, "Address line 1")
    await expect(list.getByRole("option")).toHaveCount(5)
    const weight = await list.getByRole("option").first().locator(".font-semibold").evaluate((el) => getComputedStyle(el).fontWeight)
    expect(weight).toBe("600")
    await expect(input).toHaveAccessibleDescription("Pick a suggestion to fill the rest and verify the address.")
    await page.keyboard.press("Tab")
    await expect(input).toHaveValue("12 Main")
    await expect(page.getByTestId("address-value")).toHaveText("12 Main")

    await input.fill("12 fail street")
    await page.waitForTimeout(600)
    await expect(input).toHaveAttribute("aria-expanded", "false")
    await expect(page.getByText("Couldn't load results.")).toHaveCount(0)

    await page.getByRole("checkbox", { name: "Country supports suggestions" }).uncheck()
    await input.fill("12 Main")
    await page.waitForTimeout(600)
    await expect(input).toHaveAttribute("aria-expanded", "false")
  })

  test("insurer: Add “{name}” when nothing matches exactly; picking it keeps the typed name", async ({ page, isMobile }) => {
    const input = insurer(page)
    await input.fill("acme health")
    await expect(listbox(page, "Insurer").getByRole("option")).toHaveText(["Acme Health"])
    await input.fill("Acme")
    await expect(page.getByRole("option", { name: "Add “Acme”" })).toBeVisible()
    await press(page.getByRole("option", { name: "Add “Acme”" }), isMobile)
    await expect(input).toHaveValue("Acme")
    await expect(page.getByTestId("insurer-value")).toHaveText("new: Acme")
  })

  test("gender identity: every option while the value is one of them, filtering while typing, free text kept", async ({ page }) => {
    const input = gender(page)
    await input.focus()
    await page.keyboard.press("ArrowDown")
    await expect(listbox(page, "Gender identity").getByRole("option")).toHaveCount(4)
    await page.keyboard.press("Escape")
    await input.fill("ma")
    await expect(listbox(page, "Gender identity").getByRole("option")).toHaveText(["Female", "Male"])
    await input.fill("Nonbinary")
    await expect(input).toHaveAttribute("aria-expanded", "false")
    await page.keyboard.press("Tab")
    await expect(page.getByTestId("gender-value")).toHaveText("Nonbinary")
  })
})
