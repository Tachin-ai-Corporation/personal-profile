import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { setTheme, signIn } from "./fixtures"

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const FIXTURE = "/test-fixtures/ui-kit"

async function expectNoAxeViolations(page: Page, label: string, include?: string, disableRules: string[] = []): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const builder = new AxeBuilder({ page }).withTags(WCAG).disableRules(disableRules)
    const results = await (include ? builder.include(include) : builder).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

/** Radix restores focus a task after closing; give it that task before the next step. */
async function settleFocus(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)))
}

async function press(target: Locator, isMobile: boolean): Promise<void> {
  if (isMobile) await target.tap()
  else await target.click()
}

const kebab = (page: Page, number: string) => page.getByRole("button", { name: `More actions for ${number}` })
const phoneTable = (page: Page) => page.getByRole("table", { name: "Phone" }).or(page.getByRole("list", { name: "Phone" }))

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await page.goto(FIXTURE)
  await expect(page.getByRole("heading", { level: 1, name: "UI kit" })).toBeVisible()
})

test.describe("F6-2 UI kit", () => {
  test("axe clean in light and dark: closed, dialog, sheet, row menu, busy confirm", async ({ page }) => {
    await expectNoAxeViolations(page, "ui kit closed")

    await page.getByRole("button", { name: "Link authenticator" }).click()
    await expect(page.getByRole("dialog", { name: "Link your Microsoft authenticator" })).toBeVisible()
    await expectNoAxeViolations(page, "dialog open")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await settleFocus(page)

    await page.getByRole("button", { name: "Add insurance" }).click()
    await expect(page.getByRole("dialog", { name: "Add insurance" })).toBeVisible()
    await expectNoAxeViolations(page, "sheet open")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await settleFocus(page)

    await kebab(page, "+1 (415) 555-0100").focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menu")).toBeVisible()
    await expectNoAxeViolations(page, "row menu open", "[role='menu']")
    await page.keyboard.press("Escape")
    await settleFocus(page)

    await page.getByRole("button", { name: "Disable" }).click()
    await page.getByRole("button", { name: "Turn off" }).click()
    await expect(page.getByRole("button", { name: "Turning off…" })).toBeVisible()
    await expectNoAxeViolations(page, "busy confirm")
  })

  test("targets are at least 44 px, inputs use 16 px text, and nothing scrolls sideways", async ({ page, isMobile }) => {
    const controls = [
      page.getByRole("button", { name: "Link authenticator" }),
      page.getByRole("button", { name: "Disable" }),
      page.getByRole("checkbox", { name: "Set as primary" }),
      page.getByRole("switch", { name: "Notifications" }),
      page.getByRole("combobox", { name: /^Country code/ }),
      page.getByRole("textbox", { name: "Phone number" }),
      page.getByRole("button", { name: "2 more types: Insurance, Population Health" }),
      kebab(page, "+1 (415) 551-2125"),
      page.getByRole("button", { name: "Add link" }),
      page.getByRole("button", { name: "Add a policy" }),
    ]
    if (!isMobile) controls.push(page.getByRole("button", { name: "Verify" }).first())
    for (const control of controls) {
      const box = await control.boundingBox()
      const name = await control.evaluate((el) => el.outerHTML.slice(0, 80))
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44)
      expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44)
    }
    expect(await page.getByRole("textbox", { name: "Phone number" }).evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px")
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })

  test("text roles, qr-surface and the wide control width come from globals.css", async ({ page }) => {
    const style = (testId: string) =>
      page.getByTestId(testId).evaluate((el) => {
        const s = getComputedStyle(el)
        return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, color: s.color, maxWidth: s.maxWidth }
      })
    const mono = await style("mono-value")
    expect(mono.family).toMatch(/monospace/)
    expect([mono.size, mono.weight]).toEqual(["14px", "500"])
    expect(await style("cell-strong")).toMatchObject({ size: "14px", weight: "500" })
    expect((await style("control-max-wide")).maxWidth).toBe("720px")
    const heading = page.getByRole("heading", { name: "Chips and text roles" })
    expect(await heading.evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).fontWeight])).toEqual(["16px", "600"])
    expect((await style("kv-value-empty")).weight).toBe("400")
    await page.getByRole("button", { name: "Link authenticator" }).click()
    await setTheme(page, "dark")
    expect(await page.getByTestId("qr").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)")
  })
})

test.describe("Dialog", () => {
  test("focus starts on the code; busy blocks Escape and the close button; 440 px or full screen with a pinned footer", async ({ page, isMobile }) => {
    const opener = page.getByRole("button", { name: "Link authenticator" })
    await opener.click()
    const dialog = page.getByRole("dialog", { name: "Link your Microsoft authenticator" })
    await expect(page.getByRole("textbox", { name: "6-digit code" })).toBeFocused()
    const viewport = page.viewportSize() ?? { width: 0, height: 0 }
    const box = await dialog.boundingBox()
    if (isMobile) {
      expect(box).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height })
      const body = dialog.locator("[data-slot='dialog-body']")
      await body.evaluate((el) => el.scrollTo(0, el.scrollHeight))
      const footer = await dialog.locator("[data-slot='dialog-footer']").boundingBox()
      expect(Math.round((footer?.y ?? 0) + (footer?.height ?? 0))).toBe(viewport.height)
      const close = await page.getByRole("button", { name: "Close" }).boundingBox()
      expect(close?.y ?? -1).toBeGreaterThanOrEqual(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    } else {
      expect(box?.width).toBe(440)
    }

    await page.getByRole("button", { name: "Submit" }).click()
    await expect(page.getByRole("button", { name: "Checking…" })).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Close" }).click({ force: true })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole("button", { name: "Close" })).toHaveAttribute("aria-disabled", "true")
    await expect(dialog).toHaveCount(0, { timeout: 5000 })
    await expect(opener).toBeFocused()
  })
})

test.describe("Sheet", () => {
  test("right drawer at 480 px on desktop, full screen with Back below 768 px; header and footer stay while the body scrolls", async ({ page, isMobile }) => {
    const opener = page.getByRole("button", { name: "Add insurance" })
    await opener.click()
    const sheet = page.getByRole("dialog", { name: "Add insurance" })
    await expect(sheet).toBeVisible()
    const viewport = page.viewportSize() ?? { width: 0, height: 0 }
    const box = await sheet.boundingBox()
    expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(viewport.width)
    expect(box?.height).toBe(viewport.height)
    expect(box?.width).toBe(isMobile ? viewport.width : 480)
    await expect(page.getByRole("button", { name: isMobile ? "Back" : "Close" })).toBeVisible()
    await expect(page.getByRole("button", { name: isMobile ? "Close" : "Back" })).toBeHidden()

    await sheet.locator("[data-slot='sheet-body']").evaluate((el) => el.scrollTo(0, el.scrollHeight))
    const header = await sheet.locator("[data-slot='sheet-header']").boundingBox()
    const footer = await sheet.locator("[data-slot='sheet-footer']").boundingBox()
    expect(header?.y).toBe(0)
    expect(Math.round((footer?.y ?? 0) + (footer?.height ?? 0))).toBe(viewport.height)
    await expect(page.getByRole("textbox", { name: "Group ID" })).toBeInViewport()

    await page.getByRole("button", { name: isMobile ? "Back" : "Close" }).click()
    await expect(sheet).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
})

test.describe("ConfirmDialog busyLabel", () => {
  test("the busy confirm reads its own label and the dialog can't be dismissed meanwhile", async ({ page }) => {
    await page.getByRole("button", { name: "Disable" }).click()
    const confirm = page.getByRole("alertdialog", { name: "Turn off authenticator app?" })
    await page.getByRole("button", { name: "Turn off" }).click()
    await expect(page.getByRole("button", { name: "Turning off…" })).toHaveAttribute("aria-busy", "true")
    await page.keyboard.press("Escape")
    await expect(confirm).toBeVisible()
    await expect(confirm).toHaveCount(0, { timeout: 5000 })
  })
})

test.describe("Row kit (review)", () => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`a confirm opened from a menu item returns focus to the kebab (${reducedMotion})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion })
      const button = kebab(page, "+1 (415) 555-0100")
      await button.focus()
      await page.keyboard.press("Enter")
      await page.getByRole("menuitem", { name: "Make primary" }).click()
      const confirm = page.getByRole("alertdialog", { name: "This changes how you sign in" })
      await expect(confirm).toBeVisible()
      await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused()
      await page.keyboard.press("Escape")
      await expect(confirm).toHaveCount(0)
      await expect(button).toBeFocused()
    })
  }

  test("a long unbroken value wraps inside its cell at 768 px: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    const table = page.getByRole("table", { name: "Links" })
    await expect(table).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    const box = await table.boundingBox()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(768)
    const kebabBox = await kebab(page, "the long link").boundingBox()
    expect((kebabBox?.x ?? 999) + (kebabBox?.width ?? 0)).toBeLessThanOrEqual(768)
  })

  test("the country picker is named with the country for screen readers", async ({ page }) => {
    await expect(page.getByRole("combobox", { name: "Country code +1 United States" })).toBeVisible()
  })
})

test.describe("Row kit", () => {
  test("the kebab menu repeats every action; a disabled item does nothing; Escape returns focus to the kebab", async ({ page }) => {
    const button = kebab(page, "+1 (415) 551-2125")
    await button.focus()
    await expect(button).toBeFocused()
    await settleFocus(page)
    await page.keyboard.press("Enter")
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitem")).toHaveText(["Verify", "Make primaryAlready primary", "Remove"])
    // force: Playwright treats aria-disabled as disabled and would wait; this is a real click. With no entrance
    // animation (reduced motion, the e2e default) force skips the stability wait, so wait until the menu is placed.
    await expect(menu.getByRole("menuitem", { name: /Make primary/ })).toBeInViewport()
    await menu.getByRole("menuitem", { name: /Make primary/ }).click({ force: true })
    await expect(menu).toBeVisible()
    await expect(page.getByTestId("row-log")).toHaveText("")
    await page.keyboard.press("Escape")
    await expect(menu).toHaveCount(0)
    await expect(button).toBeFocused()
    await settleFocus(page)
    await page.keyboard.press("Enter")
    await page.getByRole("menuitem", { name: "Remove" }).click()
    await expect(page.getByTestId("row-log")).toHaveText("remove 1")
  })

  test("touch: the kebab opens the menu by tap", async ({ page, isMobile }) => {
    await press(kebab(page, "+1 (415) 555-0100"), isMobile)
    await press(page.getByRole("menuitem", { name: "Verify" }), isMobile)
    await expect(page.getByTestId("row-log")).toHaveText("verify 2")
  })

  test("desktop: inline actions appear on row hover and focus, and act directly", async ({ page, isMobile }) => {
    test.skip(isMobile, "inline row actions are desktop only; touch relies on the kebab")
    await page.emulateMedia({ reducedMotion: "reduce" })
    const row = page.getByRole("row").filter({ hasText: "+1 (415) 555-0100" })
    const inline = row.locator("[data-slot='row-actions-inline']")
    await page.mouse.move(0, 0)
    expect(await inline.evaluate((el) => getComputedStyle(el).opacity)).toBe("0")
    await row.hover()
    await expect.poll(() => inline.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    await row.getByRole("button", { name: "Verify" }).click()
    await expect(page.getByTestId("row-log")).toHaveText("verify 2")
    await page.mouse.move(0, 0)
    await row.getByRole("button", { name: "Verify" }).focus()
    await expect.poll(() => inline.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
  })

  test("edit view: Remove strikes the row with 'Removed on save' + Restore; the Primary row's Remove explains why not", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click()
    const table = phoneTable(page)
    await expect(table.getByText("Make another phone primary first", { exact: true })).toHaveCount(1)
    const primaryRemove = table.getByRole("button", { name: "Remove" }).first()
    await expect(primaryRemove).toHaveAttribute("aria-disabled", "true")
    await table.getByRole("button", { name: "Remove" }).nth(1).click()
    await expect(table.getByText("Removed on save")).toBeVisible()
    const restore = table.getByRole("button", { name: "Restore" })
    await expect(restore).toBeVisible()
    expect(await table.getByText("Removed on save").evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("none")
    await restore.click()
    await expect(table.getByText("Removed on save")).toHaveCount(0)
  })
})

test.describe("Phone input", () => {
  test("typing is clamped and formatted on blur; a pasted international number switches the country", async ({ page }) => {
    const input = page.getByRole("textbox", { name: "Phone number" })
    await input.fill("415555212")
    await input.blur()
    await expect(page.getByText("Enter a 10-digit US number")).toBeVisible()
    await expect(input).toHaveAttribute("aria-invalid", "true")
    // A too-long paste keeps its first digits: trailing ones are dropped until it fits (1health-fe parity).
    await input.fill("41555521259")
    await expect(input).toHaveValue("4155552125")
    await input.fill("")
    await input.pressSequentially("41555521259")
    await expect(input).toHaveValue("4155552125")
    await input.blur()
    await expect(input).toHaveValue("(415) 555-2125")
    await expect(page.getByTestId("e164")).toHaveText("+14155552125")
    await expect(input).not.toHaveAttribute("aria-invalid", "true")

    await input.fill("+44 20 7183 8750")
    await expect(page.getByRole("combobox", { name: /^Country code/ })).toHaveText("🇬🇧+44")
    await expect(page.getByTestId("e164")).toHaveText("+442071838750")
  })

  test("the country picker opens from the keyboard, finds a country by letter and arrows and keeps the number", async ({ page }) => {
    const input = page.getByRole("textbox", { name: "Phone number" })
    await input.fill("30 901820")
    const country = page.getByRole("combobox", { name: /^Country code/ })
    await country.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("listbox")).toBeVisible()
    // The long list scrolls inside Radix's viewport (role=presentation). Its options are reached by the
    // arrow keys and typeahead (Radix moves focus to them), which axe's scrollable-region-focusable can't see.
    await expectNoAxeViolations(page, "country list", "[role='listbox']", ["scrollable-region-focusable"])
    await page.getByRole("option", { name: /United States/ }).focus()
    // Typeahead by the country name's first letter, then the arrow keys.
    await page.keyboard.press("g")
    await expect(page.getByRole("option", { name: /Gabon/ })).toBeFocused()
    // Radix moves focus a task after each key, so wait for every step.
    for (const next of [/Gambia/, /Georgia/, /Germany/]) {
      await page.keyboard.press("ArrowDown")
      await expect(page.getByRole("option", { name: next })).toBeFocused()
    }
    await page.keyboard.press("Enter")
    await expect(country).toHaveText("🇩🇪+49")
    await expect(input).toHaveValue(/^0?30 ?901820$/)
    await expect(page.getByTestId("e164")).toHaveText("+4930901820")
  })
})

test.describe("Countdown and announcer", () => {
  test("Send link counts down from 60 s and announces 'Link sent' politely", async ({ page }) => {
    await page.getByRole("button", { name: "Send link" }).click()
    await expect(page.getByTestId("countdown")).toHaveText("Link sent · Resend in 60 s")
    await expect(page.getByRole("status").filter({ hasText: "Link sent" })).toHaveAttribute("aria-live", "polite")
    await expect(page.getByTestId("countdown")).toHaveText(/Resend in 5[89] s/, { timeout: 3000 })
  })
})
