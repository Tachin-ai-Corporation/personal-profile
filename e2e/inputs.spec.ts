import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { setTheme, signIn } from "./fixtures"

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const FIXTURE = "/test-fixtures/inputs"

async function expectNoAxeViolations(page: Page, label: string, include?: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const builder = new AxeBuilder({ page }).withTags(WCAG)
    const results = await (include ? builder.include(include) : builder).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

/**
 * Radix restores focus to a closed listbox's or modal popover's trigger once more, a task after
 * closing; a script moving focus at once would have it taken back (a person can't be that fast).
 */
async function settleFocus(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)))
}

const email = (page: Page) => page.getByRole("combobox", { name: "Primary email address" })
const timeZone = (page: Page) => page.getByRole("combobox", { name: "Default time zone" })
const language = (page: Page) => page.getByRole("combobox", { name: "Preferred language" })
const birthDate = (page: Page) => page.getByRole("textbox", { name: "Birth date" })
const calendarButton = (page: Page) => page.getByRole("button", { name: "Choose date" })
const contactTrigger = (page: Page) => page.getByRole("button", { name: "Primary contact for Acme Labs" })

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await page.goto(FIXTURE)
  await expect(page.getByRole("heading", { level: 1, name: "Inputs" })).toBeVisible()
})

test.describe("F5-1 inputs", () => {
  test("axe clean in light and dark: closed, with a listbox, the calendar and an info popover open", async ({ page }) => {
    await expectNoAxeViolations(page, "inputs closed")

    await timeZone(page).focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("listbox")).toBeVisible()
    // Radix Select (F3-1 port) hides the page with aria-hidden while it traps focus, without
    // aria-modal on its listbox, so axe's aria-hidden-focus can't see the trap: scan the listbox.
    await expectNoAxeViolations(page, "select open", "[role='listbox']")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await expect(timeZone(page)).toBeFocused()
    await settleFocus(page)

    await calendarButton(page).focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog", { name: "Choose date" })).toBeVisible()
    await expectNoAxeViolations(page, "calendar open")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(calendarButton(page)).toBeFocused()
    await settleFocus(page)

    await contactTrigger(page).focus()
    await expect(page.getByRole("dialog", { name: "Primary contact" })).toBeVisible()
    await expectNoAxeViolations(page, "info popover open")
  })

  test("targets are at least 44 px, inputs use 16 px text, and nothing scrolls sideways", async ({ page }) => {
    const controls = [
      email(page),
      timeZone(page),
      language(page),
      birthDate(page),
      calendarButton(page),
      page.getByRole("button", { name: "About provider registration" }),
      page.getByRole("button", { name: "Acme Labs", exact: true }),
      contactTrigger(page),
    ]
    for (const control of controls) {
      const box = await control.boundingBox()
      expect(box?.height ?? 0, await control.evaluate((el) => el.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(44)
    }
    for (const control of [calendarButton(page), contactTrigger(page)]) {
      expect((await control.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44)
    }
    expect(await birthDate(page).evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px")
    await calendarButton(page).click()
    await expect(page.getByRole("dialog", { name: "Choose date" })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const dialogBox = await page.getByRole("dialog").boundingBox()
    const viewport = page.viewportSize() ?? { width: 0, height: 0 }
    expect((dialogBox?.x ?? -1) >= 0 && (dialogBox?.x ?? 0) + (dialogBox?.width ?? 0) <= viewport.width).toBe(true)
  })
})

test.describe("Select", () => {
  test("aria-disabled: Enter, Space, ArrowDown and a click never open it; focus stays; the helper is its description", async ({ page }) => {
    const trigger = email(page)
    await trigger.focus()
    for (const key of ["Enter", "Space", "ArrowDown"]) await page.keyboard.press(key)
    // force: Playwright treats aria-disabled as disabled and would wait forever; this is a real click.
    await trigger.click({ force: true })
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute("aria-disabled", "true")
    await expect(trigger).toHaveAccessibleDescription("Add another verified email in Contacts")
    await expect(trigger).toHaveText("ann@work.test")
    await page.keyboard.press("Tab")
    await expect(page.getByRole("link", { name: "Contacts" })).toBeFocused()
  })

  test("an unlisted stored value is shown by its label, isn't offered, and another value can be chosen", async ({ page }) => {
    const trigger = timeZone(page)
    await expect(trigger).toHaveText("Arizona")
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("option")).toHaveText(["Eastern Time", "Central Time", "Pacific Time"])
    await page.getByRole("option", { name: "Central Time" }).click()
    await expect(trigger).toHaveText("Central Time")
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("option")).toHaveText(["Eastern Time", "Central Time", "Pacific Time"])
    await page.keyboard.press("Escape")
  })

  test("the placeholder shows until a value is chosen", async ({ page }) => {
    await expect(language(page)).toHaveText("Select a value")
    await language(page).focus()
    await page.keyboard.press("Enter")
    await page.getByRole("option", { name: "Spanish" }).click()
    await expect(language(page)).toHaveText("Spanish")
  })
})

test.describe("DateInput", () => {
  test("controlled text restores partial/impossible dates, edits with the mask and clears externally", async ({ page }) => {
    const input = birthDate(page)
    await page.getByRole("button", { name: "Restore 02/3", exact: true }).click()
    await expect(input).toHaveValue("02/3")
    await page.getByRole("button", { name: "Restore 02/30/1990", exact: true }).click()
    await expect(input).toHaveValue("02/30/1990")
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(page.getByTestId("birth-date")).toHaveText("")
    await page.getByRole("button", { name: "Clear restored date", exact: true }).click()
    await expect(input).toHaveValue("")
    await input.pressSequentially("02292000")
    await expect(input).toHaveValue("02/29/2000")
    await expect(page.getByTestId("birth-date")).toHaveText("2000-02-29")
    await expectNoAxeViolations(page, "controlled restored date", 'section[aria-label="Dates"]')
  })

  test("typing 02292024 shows 02/29/2024 and sends 2024-02-29; 02/30/1990 sends nothing and shows the caller's error", async ({ page }) => {
    const input = birthDate(page)
    await input.click()
    await page.keyboard.type("02292024")
    await expect(input).toHaveValue("02/29/2024")
    await expect(input).toHaveAttribute("inputmode", "numeric")
    await expect(page.getByTestId("birth-date")).toHaveText("2024-02-29")

    await input.fill("")
    await page.keyboard.type("02301990")
    await expect(input).toHaveValue("02/30/1990")
    await expect(page.getByTestId("birth-date")).toHaveText("")
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(input).toHaveAccessibleDescription("Enter a date as MM/DD/YYYY")

    // Backspace after the slash removes the digit before it.
    await input.fill("")
    await page.keyboard.type("022")
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("Backspace")
    await expect(input).toHaveValue("02")
  })

  test("the calendar is keyboard operable, bounded by min/max, and returns focus to its button", async ({ page }) => {
    // The fixture's fixed today (2026-10-14) and the Proctor rule give max = 2005-10-14.
    await expect(page.getByTestId("bounds")).toHaveText("1906-10-14 2005-10-14")

    const button = calendarButton(page)
    await button.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "Choose date" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("grid")).toHaveAttribute("aria-label", "October 2005")
    await expect(dialog.getByRole("button", { name: "Friday, October 14th, 2005", exact: true })).toBeEnabled()
    await expect(dialog.getByRole("button", { name: "Saturday, October 15th, 2005", exact: true })).toBeDisabled()
    // Focus is in the grid, on the month's first day: move a day back (into September) and pick it.
    await expect(dialog.getByRole("button", { name: "Saturday, October 1st, 2005", exact: true })).toBeFocused()
    await page.keyboard.press("ArrowLeft")
    await expect(dialog.getByRole("button", { name: "Friday, September 30th, 2005", exact: true })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(dialog).toHaveCount(0)
    await expect(button).toBeFocused()
    await expect(birthDate(page)).toHaveValue("09/30/2005")
    await expect(page.getByTestId("birth-date")).toHaveText("2005-09-30")

    await page.keyboard.press("Enter")
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(button).toBeFocused()
  })
})

test.describe("InfoPopover", () => {
  test("keyboard: focus opens it without moving focus; Tab enters its link and goes on; Escape returns focus", async ({ page }) => {
    const trigger = contactTrigger(page)
    await trigger.focus()
    const popover = page.getByRole("dialog", { name: "Primary contact" })
    await expect(popover).toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(await trigger.getAttribute("aria-controls")).toBe(await popover.getAttribute("id"))

    await page.keyboard.press("Tab")
    await expect(page.getByRole("link", { name: "ann@acme.test" })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: "After the card" })).toBeFocused()
    await expect(popover).toHaveCount(0)

    await page.keyboard.press("Shift+Tab")
    await expect(trigger).toBeFocused()
    await expect(popover).toBeVisible()
    await page.keyboard.press("Tab")
    await page.keyboard.press("Shift+Tab")
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Tab")
    await page.keyboard.press("Escape")
    await expect(popover).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("opens below its trigger, left edges aligned, and flips above only without room below", async ({ page, isMobile }) => {
    test.skip(isMobile, "On a phone the popover may shift sideways to stay on screen.")
    const trigger = contactTrigger(page)
    const popover = page.getByRole("dialog", { name: "Primary contact" })
    await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await trigger.focus()
    await expect(popover).toHaveAttribute("data-side", "bottom")
    const anchor = await trigger.boundingBox()
    // With no entrance animation (reduced motion, the e2e default) the box can be read before the popper places it.
    await expect.poll(async () => Math.abs(((await popover.boundingBox())?.x ?? 0) - (anchor?.x ?? 0))).toBeLessThanOrEqual(1)
    const box = await popover.boundingBox()
    expect(box?.y ?? 0).toBeGreaterThanOrEqual((anchor?.y ?? 0) + (anchor?.height ?? 0))

    await page.keyboard.press("Escape")
    await expect(popover).toHaveCount(0)
    await trigger.evaluate((el) => {
      ;(el as HTMLElement).blur()
      el.scrollIntoView({ block: "end" })
    })
    await trigger.focus()
    await expect(popover).toHaveAttribute("data-side", "top")
  })

  test("hover (mouse) or tap (touch) opens it; leaving or an outside tap closes it", async ({ page, isMobile }) => {
    const trigger = page.getByRole("button", { name: "About provider registration" })
    const popover = page.getByRole("dialog", { name: "About provider registration" })
    if (isMobile) {
      await trigger.tap()
      await expect(popover).toBeVisible()
      await page.getByRole("heading", { level: 1 }).tap()
    } else {
      await trigger.hover()
      await expect(popover).toBeVisible()
      await page.mouse.move(0, 0, { steps: 5 })
    }
    await expect(popover).toHaveCount(0)
  })

  test("a click opens it and an outside click closes it; the error state retries in place", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Acme Labs", exact: true })
    await trigger.click()
    const popover = page.getByRole("dialog", { name: "Acme Labs" })
    await expect(popover).toContainText("Couldn't load the support contact.")
    await popover.getByRole("button", { name: "Try again." }).click()
    await expect(popover).toContainText("Loading…")
    await expect(popover.getByRole("link", { name: "support@acme.test" })).toBeVisible()
    await page.getByRole("heading", { level: 1 }).click()
    await expect(popover).toHaveCount(0)
  })
})
