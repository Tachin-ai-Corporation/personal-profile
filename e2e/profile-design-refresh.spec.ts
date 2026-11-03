import { expect, type Locator, type Page } from "@playwright/test"
import { contactPointRow, mockContacts, mockProfileDefaults, setTheme, signIn, test } from "./fixtures"

/**
 * `/`'s opt-in to the design refresh (Team A, NG-9019; #62 review): the
 * Section menu → heading focus journey and the accented profile header's
 * contact contrast. The foundation pieces themselves are covered in
 * `e2e/design-refresh.spec.ts`.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("design refresh on `/`", () => {
  test("Section menu → heading: focus moves either way, but the ring shows only after the keyboard", async ({ page, isMobile }) => {
    test.skip(isMobile, "the Section menu is desktop only")
    await mockProfileDefaults(page)
    await page.goto("/?tab=contacts")
    const menu = page.getByRole("navigation", { name: "Sections" })
    const heading = page.getByRole("heading", { level: 2, name: "Phone" })
    // The icon tile's ring answers keyboard focus in its row too, not a click (`::after` opacity; no transition under reduced motion).
    const ring = () => page.locator("#phone [data-slot='animated-icon-tile']").evaluate((tile) => getComputedStyle(tile, "::after").opacity)
    await menu.getByRole("link", { name: "Phone" }).click()
    await page.mouse.move(0, 0)
    await expect(heading).toBeFocused()
    await expect(heading).toHaveCSS("outline-style", "none")
    await expect.poll(ring).toBe("0")
    await menu.getByRole("link", { name: "Email" }).focus()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Enter")
    await expect(heading).toBeFocused()
    await expect(heading).toHaveCSS("outline-style", "solid")
    await expect.poll(ring).toBe("1")
  })
})

// --- The accented header's contact block over the gradient ------------------------------------------

const LONG_EMAIL = "alexandra.longlastname.department@example.com"

/**
 * The lowest WCAG contrast between `text`'s color and the band painted
 * behind it: the text is made transparent, its box screenshotted and every
 * pixel compared with the text color (both read through a canvas, so the
 * browser does the color conversion).
 */
async function minContrast(page: Page, text: Locator): Promise<number> {
  const box = await text.boundingBox()
  if (!box) throw new Error("no box")
  const color = await text.evaluate((element) => getComputedStyle(element).color)
  await text.evaluate((element) => element.style.setProperty("color", "transparent"))
  const shot = await page.screenshot({ clip: box, animations: "disabled" })
  await text.evaluate((element) => element.style.removeProperty("color"))
  return page.evaluate(
    async ({ png, color }) => {
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) throw new Error("no canvas")
      const rgbOf = (fill: string): number[] => {
        canvas.width = canvas.height = 1
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = fill
        context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)]
      }
      const luminance = ([r, g, b]: number[]): number => {
        const [R, G, B] = [r, g, b].map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
        return 0.2126 * R + 0.7152 * G + 0.0722 * B
      }
      const textL = luminance(rgbOf(color))
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      canvas.width = image.width
      canvas.height = image.height
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, image.width, image.height).data
      let lowest = Infinity
      for (let i = 0; i < pixels.length; i += 4) {
        const L = luminance([pixels[i], pixels[i + 1], pixels[i + 2]])
        lowest = Math.min(lowest, (Math.max(L, textL) + 0.05) / (Math.min(L, textL) + 0.05))
      }
      return lowest
    },
    { png: shot.toString("base64"), color },
  )
}

test.describe("accented header at 768 px with a long primary email", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: the contact labels and values are AA over the gradient where they land`, async ({ page, isMobile }) => {
      test.skip(isMobile, "the 768 px layout; the contacts aren't shown below it")
      await page.setViewportSize({ width: 768, height: 900 })
      await mockProfileDefaults(page)
      await mockContacts(page, {
        Mobile: [contactPointRow({ id: 12, value: "+14155512125", label: "Primary" })],
        Email: [contactPointRow({ id: 31, value: LONG_EMAIL, type: "Email", label: "Primary", phoneNumberRegion: null })],
      })
      await page.goto("/")
      const header = page.locator("[data-accent='true']:has(> h1)")
      await expect(header.getByText(LONG_EMAIL)).toBeVisible()
      await setTheme(page, theme)

      // The long email pushes the block left, into the band's stronger part (#62 review: 38 % of the width).
      const [band, phoneLabel] = await Promise.all([header.boundingBox(), header.getByText("Primary phone").boundingBox()])
      if (!band || !phoneLabel) throw new Error("no box")
      expect((phoneLabel.x - band.x) / band.width).toBeLessThan(0.5)

      for (const name of ["Primary phone", "Primary email", "+1 (415) 551-2125", LONG_EMAIL]) {
        expect(await minContrast(page, header.getByText(name, { exact: true })), `${name} (${theme})`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
