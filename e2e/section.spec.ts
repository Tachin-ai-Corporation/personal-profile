import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { mockContacts, mockMyself, setTheme, signIn } from "./fixtures"

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const FIXTURE = "/test-fixtures/section"

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

const section = (page: Page) => page.getByTestId("fixture-section")
const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Phone" })
const number = (page: Page) => section(page).getByRole("textbox", { name: "Number" })
const note = (page: Page) => section(page).getByRole("textbox", { name: /^Note/ })

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockMyself(page)
  await mockContacts(page)
  await page.goto(FIXTURE)
  await expect(heading(page)).toBeVisible()
})

test.describe("Section edit model (spec F3-2, fixture Section)", () => {
  test("keyboard: Edit → invalid Save (nothing sent, focus on the field) → fix → Save → h2 focused, toast announced", async ({ page }) => {
    await expectNoAxeViolations(page, "read view")
    await expectNoHorizontalScroll(page)

    await section(page).getByRole("button", { name: "Edit" }).focus()
    await page.keyboard.press("Enter")
    await expect(number(page)).toBeFocused()
    await expect(section(page).getByText("Editing")).toBeVisible()

    // Enter never submits, Escape never cancels.
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("12")
    await page.keyboard.press("Enter")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("saves-sent")).toHaveText("0")
    await expect(number(page)).toHaveValue("12")

    // Unsaved changes in a polite live region.
    const indicator = section(page).getByText("Unsaved changes")
    await expect(indicator).toBeVisible()
    await expect(indicator.locator("xpath=..")).toHaveAttribute("aria-live", "polite")

    // Blur validation, then Save with the invalid field: nothing sent, focus moves to it.
    await page.keyboard.press("Tab")
    await expect(note(page)).toBeFocused()
    await expect(number(page)).toHaveAttribute("aria-invalid", "true")
    await expect(number(page)).toHaveAccessibleDescription("Enter a 10-digit US number")
    await expectNoAxeViolations(page, "edit view with an error")
    await expectNoHorizontalScroll(page)
    await section(page).getByRole("button", { name: "Save" }).focus()
    await page.keyboard.press("Enter")
    await expect(number(page)).toBeFocused()
    await expect(page.getByTestId("saves-sent")).toHaveText("0")

    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("4155550000")
    await section(page).getByRole("button", { name: "Save" }).focus()
    await page.keyboard.press("Enter")
    // Saving: busy Save, read-only inputs, inert Cancel; a second press sends nothing more.
    const busy = section(page).getByRole("button", { name: "Saving…" })
    await expect(busy).toHaveAttribute("aria-busy", "true")
    await expect(number(page)).toHaveAttribute("readonly", "")
    await expect(section(page).getByRole("button", { name: "Cancel" })).toHaveAttribute("aria-disabled", "true")
    await page.keyboard.press("Enter")
    await expect(heading(page)).toBeFocused()
    await expect(page.getByTestId("saves-sent")).toHaveText("1")
    await expect(section(page).getByRole("cell", { name: "4155550000" })).toBeVisible()
    await expect(page.getByRole("region", { name: /Notifications/ }).getByText("Phone saved.")).toBeVisible()
    await expectNoAxeViolations(page, "after save with the toast")
  })

  test("Cancel reverts with no confirm and focuses the h2; reverting a change clears the indicator", async ({ page }) => {
    await section(page).getByRole("button", { name: "Edit" }).click()
    await number(page).fill("4155550000")
    await expect(section(page).getByText("Unsaved changes")).toBeVisible()
    await number(page).fill("4155512125")
    await expect(section(page).getByText("Unsaved changes")).toHaveCount(0)
    await number(page).fill("4155550000")
    await section(page).getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(heading(page)).toBeFocused()
    await expect(section(page).getByRole("cell", { name: "4155512125" })).toBeVisible()
  })

  test("a failed save keeps the edit, shows the Section error with Retry (focused) and the error toast; Retry saves", async ({ page }) => {
    await page.getByLabel("Fail the next save").check()
    await section(page).getByRole("button", { name: "Edit" }).click()
    await number(page).fill("4155550000")
    await section(page).getByRole("button", { name: "Save" }).click()
    const message = "Couldn't save phone. Check your connection."
    const banner = section(page).locator("[data-slot~='inline-banner']")
    await expect(banner).toBeFocused()
    await expect(banner.getByRole("alert")).toHaveText(message)
    await expect(page.getByRole("region", { name: /Notifications/ }).getByText(message)).toBeVisible()
    await expect(number(page)).toHaveValue("4155550000")
    await expectNoAxeViolations(page, "save error")
    await expectNoHorizontalScroll(page)
    await banner.getByRole("button", { name: "Retry" }).click()
    await expect(heading(page)).toBeFocused()
    await expect(page.getByTestId("saves-sent")).toHaveText("2")
  })

  test("controls are at least 44 px tall (Edit, Add row, Cancel, Save, Retry); inputs use 16 px text", async ({ page }) => {
    const tall = async (name: string) => {
      const box = await section(page).getByRole("button", { name, exact: true }).boundingBox()
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44)
    }
    await tall("Edit")
    await section(page).getByRole("button", { name: "Edit" }).click()
    for (const name of ["Add row", "Cancel", "Save"]) await tall(name)
    await section(page).getByRole("button", { name: "Add row" }).click()
    await expect(page.getByTestId("rows-added")).toHaveText("1")
    for (const field of [number(page), note(page)]) {
      expect((await field.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(await field.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px")
    }
    await page.getByLabel("Fail the next save").check()
    await number(page).fill("4155550000")
    await section(page).getByRole("button", { name: "Save" }).click()
    await tall("Retry")
    await expectNoHorizontalScroll(page)
  })

  test("layout per width: 4-column/table edit on desktop, stacked label-above-control edit below 768 px; axe and no horizontal scroll", async ({ page, isMobile }) => {
    const readCells = section(page).getByRole("row").first().locator("th, td")
    await expect(readCells).toHaveCount(isMobile ? 2 : 4)
    await section(page).getByRole("button", { name: "Edit" }).click()
    if (isMobile) {
      await expect(section(page).getByRole("table")).toHaveCount(0)
      await expect(section(page).getByRole("group", { name: "Phone" })).toBeVisible()
      const label = await section(page).getByText("Number", { exact: true }).boundingBox()
      const input = await number(page).boundingBox()
      expect((label?.y ?? 0) + (label?.height ?? 0)).toBeLessThanOrEqual(input?.y ?? 0)
      expect(input?.width ?? 0).toBeGreaterThan(280)
    } else {
      await expect(section(page).getByRole("table", { name: "Phone" })).toBeVisible()
      expect((await number(page).boundingBox())?.width ?? 0).toBeLessThanOrEqual(480)
    }
    await expectNoAxeViolations(page, `edit view (${isMobile ? "360" : "desktop"})`)
    await expectNoHorizontalScroll(page)
  })
})
