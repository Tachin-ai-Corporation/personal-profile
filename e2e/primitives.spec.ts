import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { setTheme, signIn } from "./fixtures"

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const FIXTURE = "/test-fixtures/primitives"

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await page.goto(FIXTURE)
  await expect(page.getByRole("heading", { level: 1, name: "Primitives" })).toBeVisible()
})

test.describe("F3-1 primitives", () => {
  test("axe clean in light and dark (real contrast), with a tooltip open and all three toasts shown", async ({ page }) => {
    await expectNoAxeViolations(page, "primitives")
    await page.getByRole("button", { name: "Show success" }).click()
    await page.getByRole("button", { name: "Show partial" }).click()
    await page.getByRole("button", { name: "Show error" }).click()
    const addPhone = page.getByRole("button", { name: "Add phone" })
    await addPhone.focus()
    await expect(page.getByRole("tooltip")).toHaveText("You've reached the limit of 20 phones")
    await expectNoAxeViolations(page, "primitives with tooltip and toasts")
  })

  test("interactive primitives are at least 44 px tall; inputs use 16 px text", async ({ page }) => {
    for (const name of ["Save", "Add phone", "About birth date", "About this organization", "Retry"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox()
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44)
    }
    for (const name of ["About birth date", "About this organization"]) {
      const box = await page.getByRole("button", { name }).boundingBox()
      expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44)
    }
    for (const field of [page.getByRole("textbox", { name: "First name" }), page.getByRole("combobox", { name: "Preferred language" })]) {
      expect((await field.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(await field.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px")
    }
  })

  test("focus-ring: 2 px ring outline, 2 px offset and the glow on keyboard focus; no ring after a mouse click", async ({ page }) => {
    const ringOf = (locator: ReturnType<Page["getByRole"]>) =>
      locator.evaluate((el) => {
        const style = getComputedStyle(el)
        return { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle, shadow: style.boxShadow }
      })
    const field = page.getByRole("textbox", { name: "First name" })
    await field.focus()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Tab")
    // The input transitions box-shadow, so wait for the glow to land (--glow: Signal Aqua rgba(143, 216, 230, …)).
    await expect.poll(async () => (await ringOf(field)).shadow).toContain("rgba(143, 216, 230")
    const ring = await ringOf(field)
    expect({ width: ring.width, offset: ring.offset, style: ring.style }).toEqual({ width: "2px", offset: "2px", style: "solid" })

    const button = page.getByRole("button", { name: "Show partial" })
    await button.click()
    await expect(button).toBeFocused()
    const afterClick = await ringOf(button)
    expect(afterClick.style).toBe("none")
    expect(afterClick.shadow).not.toContain("rgba(143, 216, 230")
  })

  test("DisabledAction: Enter, Space and a click do nothing (its form is never submitted), focus stays, the reason is announced and shown", async ({ page }) => {
    const action = page.getByRole("button", { name: "Add phone" })
    // Scroll away from the trigger; focusing it must perform the return scroll.
    await page.evaluate(() => new Promise<void>((resolve) => {
      document.addEventListener("scrollend", () => resolve(), { once: true })
      window.scrollTo(0, document.documentElement.scrollHeight)
    }))
    await expect.poll(() => action.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0)
    await page.evaluate(() => {
      document.documentElement.removeAttribute("data-scroll-settled")
      document.addEventListener("scrollend", () => document.documentElement.setAttribute("data-scroll-settled", "true"), { once: true })
    })
    await action.focus()
    await expect(page.locator("html")).toHaveAttribute("data-scroll-settled", "true")
    // Focus must have landed before the keys (a slow runner can still be hydrating).
    await expect(action).toBeFocused()
    await page.keyboard.press("Enter")
    await page.keyboard.press("Space")
    // force: Playwright treats aria-disabled as disabled and would wait forever; this is a real mouse click.
    await action.click({ force: true })
    await expect(page.getByTestId("submits")).toHaveText("0")
    await expect(action).toBeFocused()
    await expect(action).toHaveAttribute("aria-disabled", "true")
    await expect(action).toHaveAccessibleDescription("You've reached the limit of 20 phones")
    await expect(page.getByRole("tooltip")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("tooltip")).toHaveCount(0)
  })

  test("Tooltip: opens on tap (touch) or hover (mouse), closes on a tap outside", async ({ page, isMobile }) => {
    const info = page.getByRole("button", { name: "About this organization" })
    if (isMobile) {
      await info.tap()
      await expect(page.getByRole("tooltip")).toHaveText("Lab")
      await page.getByRole("heading", { level: 1 }).tap()
    } else {
      await info.hover()
      await expect(page.getByRole("tooltip")).toHaveText("Lab")
      // Hoverable content (WCAG 1.4.13): it closes once the pointer has left both the trigger and the tooltip.
      await page.mouse.move(0, 0, { steps: 5 })
    }
    await expect(page.getByRole("tooltip")).toHaveCount(0)
  })

  for (const scrollArea of ["root", "nested"] as const) {
    test(`Tooltip: keyboard focus survives ${scrollArea} focus scrolling and explicit dismissal`, async ({ page }) => {
      const nested = scrollArea === "nested"
      const trigger = page.getByRole("button", { name: nested ? "Nested scroll help" : "Root scroll help", exact: true })
      const before = page.getByRole("button", { name: nested ? "Before nested tooltip" : "Before root tooltip" })
      const after = page.getByRole("button", { name: nested ? "After nested tooltip" : "After root tooltip" })
      const description = nested ? "Nested scroll description" : "Root scroll description"
      const scroller = nested ? page.getByTestId("tooltip-nested-scroller") : page.locator("html")
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme)
        for (let traversal = 0; traversal < 3; traversal += 1) {
          await before.focus()
          // The target remains off-screen. Only Tab may bring it into view.
          expect(await trigger.evaluate((el) => {
            const bounds = el.getBoundingClientRect()
            const ancestor = el.closest("[data-testid='tooltip-nested-scroller']")
            return bounds.top >= (ancestor?.getBoundingClientRect().bottom ?? innerHeight)
          })).toBe(true)
          await scroller.evaluate((el, isNested) => {
            el.removeAttribute("data-scroll-settled")
            const target = isNested ? el : document
            target.addEventListener("scrollend", () => el.setAttribute("data-scroll-settled", "true"), { once: true })
          }, nested)
          await page.keyboard.press("Tab")
          await expect(scroller).toHaveAttribute("data-scroll-settled", "true")
          await expect(trigger).toBeFocused()
          await expect(page.getByRole("tooltip", { name: description, exact: true })).toBeVisible()
          await expect(trigger).toHaveAccessibleDescription(description)
          await expect.poll(() => page.locator("[data-slot='tooltip-content']").evaluate((el) => {
            const bounds = el.getBoundingClientRect()
            return bounds.width > 0 && bounds.height > 0 && bounds.top >= 0 && bounds.left >= 0
              && bounds.bottom <= innerHeight && bounds.right <= innerWidth
          })).toBe(true)
          if (traversal === 0) {
            await page.keyboard.press("Escape")
          } else if (traversal === 1) {
            await page.keyboard.press("Tab")
            await expect(after).toBeFocused()
          } else {
            await page.getByRole("heading", { level: 1 }).click()
          }
          await expect(page.getByRole("tooltip")).toHaveCount(0)
        }
      }
    })
  }

  test("Tooltip: hover-only content still closes on ancestor scroll", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Nested scroll help", exact: true })
    await trigger.hover()
    await expect(trigger).not.toBeFocused()
    await expect(page.getByRole("tooltip", { name: "Nested scroll description", exact: true })).toBeVisible()
    await page.getByTestId("tooltip-nested-scroller").evaluate((el) => { el.scrollTop -= 20 })
    await expect(page.getByRole("tooltip")).toHaveCount(0)
  })

  test("busy Button: a double click runs the action once and keeps focus", async ({ page }) => {
    const save = page.getByRole("button", { name: "Save" })
    await save.focus()
    await save.dblclick()
    await expect(page.getByTestId("runs")).toHaveText("1")
    const busy = page.getByRole("button", { name: "Saving…" })
    await expect(busy).toHaveAttribute("aria-busy", "true")
    await expect(busy).toBeFocused()
  })

  test("toasts: three at once at the bottom (right on desktop, centered on mobile); Retry calls back and closes", async ({ page, isMobile }) => {
    await page.getByRole("button", { name: "Show success" }).click()
    await page.getByRole("button", { name: "Show partial" }).click()
    await page.getByRole("button", { name: "Show error" }).click()
    const list = page.getByRole("region").locator("ol")
    await expect(list.locator("li")).toHaveCount(3)

    const viewport = page.viewportSize() ?? { width: 0, height: 0 }
    const box = await list.boundingBox()
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(viewport.height)
    if (isMobile) {
      expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - viewport.width / 2)).toBeLessThanOrEqual(1)
    } else {
      expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(viewport.width)
    }

    await page.getByRole("button", { name: "Retry" }).last().click()
    await expect(page.getByTestId("retries")).toHaveText("1")
    await expect(page.getByText("Couldn't save phone. Check your connection.", { exact: true })).toHaveCount(0)
  })
})
