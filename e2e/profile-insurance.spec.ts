import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { ANN, insurancePage, insurancePolicy, mockInsurance, mockInsuranceCard, mockMyself, mockProfileDefaults, setTheme, signIn, test } from "./fixtures"

/**
 * Story 5.1 (Team A, NG-9029): the Insurance Section on the real
 * `/?tab=insurance`, on desktop and at 360 px. Every test runs under the
 * fail-fast `test`, starts from `mockProfileDefaults` (no policies) and
 * overrides the policy list and the card images. The image headers of the
 * download entry are unit-tested (`allowlist/insurance.test.ts`); here the
 * images are answered in the browser.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

/** The I/O matrix's "Cards" row: the Deleted Vision policy first in platform order. */
const MEDICAL = insurancePolicy()
const DENTAL = insurancePolicy({
  id: 56,
  insuranceType: "DENTAL",
  insurancePrecedence: "SECONDARY",
  relationshipToInsured: "SPOUSE",
  insuranceOrganizationDTO: { insuranceCompanyName: "Delta Dental" },
  subscriber: { firstName: "Sam", lastName: "Lee" },
  insuranceGroupId: "n/a",
  frontSideCardFile: null,
  backSideCardFile: null,
})
const VISION = insurancePolicy({ id: 57, insuranceType: "VISION", label: "Deleted", insuranceOrganizationDTO: { insuranceCompanyName: "VSP" }, backSideCardFile: null })
const CARDS = insurancePage([VISION, MEDICAL, DENTAL])

const section = (page: Page): Locator => page.getByRole("region", { name: "Insurance" })
const card = (page: Page, title: string): Locator => section(page).getByRole("article", { name: title })
const frontThumb = (page: Page): Locator => card(page, "Medical Insurance").getByRole("button", { name: "Front of UnitedHealthcare Medical Insurance card" })

/** The value cell of a key in a card's grid. */
async function valueOf(container: Locator, key: string): Promise<Locator> {
  const id = await container.getByRole("rowheader", { name: key, exact: true }).getAttribute("id")
  return container.locator(`td[headers="${id}"]`)
}

async function open(page: Page, body: unknown = CARDS): Promise<void> {
  await mockProfileDefaults(page)
  await mockMyself(page, { body: { ...ANN, firstName: "Avery" } })
  await mockInsurance(page, { body })
  await page.goto("/?tab=insurance")
  await expect(page.getByRole("heading", { level: 1, name: "Avery Lee" })).toBeVisible()
}

async function axe(page: Page, label: string, include = "#insurance"): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).include(include).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("Insurance policies (Story 5.1)", () => {
  test("cards: active first, count 2, chips, own name on Self, tiles for missing sides, a muted Deleted card without actions", async ({ page }) => {
    const images = await mockInsuranceCard(page)
    await open(page)
    await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(["Medical Insurance", "Dental Insurance", "Vision Insurance"])
    await expect(section(page).locator('[data-slot="section-meta"]')).toHaveText("2")
    await expect(section(page).locator('[data-slot="chip"]')).toHaveText(["Primary", "Secondary", "Deleted"])
    await expect(await valueOf(card(page, "Medical Insurance"), "Subscriber")).toHaveText("Avery Lee")
    await expect(await valueOf(card(page, "Dental Insurance"), "Subscriber")).toHaveText("Sam Lee")
    // Backend placeholders: the 1970-01-01 Cancellation and the "n/a" Group ID.
    await expect(await valueOf(card(page, "Medical Insurance"), "Cancellation")).toHaveText("Not provided")
    await expect(await valueOf(card(page, "Dental Insurance"), "Group ID")).toHaveText("Not provided")
    await expect(await valueOf(card(page, "Medical Insurance"), "Effective")).toHaveText("01/01/2025")
    await expect(card(page, "Dental Insurance").getByRole("img")).toHaveText(["Image not uploaded", "Image not uploaded"])
    // The thumbnails load through the proxy path, with the session cookie (same origin).
    await expect(frontThumb(page).locator("img")).toHaveJSProperty("complete", true)
    await expect.poll(() => frontThumb(page).locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    expect(images().map((request) => new URL(request.url()).pathname + new URL(request.url()).search)).toEqual(
      expect.arrayContaining([
        "/api/1h/v2/health/insurance/55/file/900/download?fileRelKey=InsuranceHasFrontSideCardFile",
        "/api/1h/v2/health/insurance/55/file/901/download?fileRelKey=InsuranceHasBackSideCardFile",
        "/api/1h/v2/health/insurance/57/file/900/download?fileRelKey=InsuranceHasFrontSideCardFile",
      ]),
    )
    const vision = card(page, "Vision Insurance")
    await expect(vision.getByRole("button")).toHaveCount(0)
    await expect(vision.getByRole("img", { name: "Front of VSP Vision Insurance card" })).toBeVisible()
    // Decision 1A: no kebab and no "Add insurance" until Stories 5.2 and 5.5.
    await expect(section(page).getByRole("button", { name: /More actions for|Add insurance/ })).toHaveCount(0)
    await expectNoHorizontalScroll(page)
    await axe(page, "cards")
  })

  test("thumbnails sit right of the grid behind a hairline from 768 px, below it at 360 px; targets are at least 44 px", async ({ page, isMobile }) => {
    await mockInsuranceCard(page)
    await open(page)
    const medical = card(page, "Medical Insurance")
    const grid = await medical.getByRole("table").boundingBox()
    const thumbs = await medical.locator('[data-slot="insurance-thumbnails"]').boundingBox()
    const thumb = await frontThumb(page).boundingBox()
    if (!grid || !thumbs || !thumb) throw new Error("no layout")
    if (isMobile) expect(thumbs.y).toBeGreaterThanOrEqual(grid.y + grid.height - 1)
    else expect(thumbs.x).toBeGreaterThanOrEqual(grid.x + grid.width - 1)
    expect([Math.round(thumb.width), Math.round(thumb.height)]).toEqual([120, 76])
    const title = await medical.locator('[data-slot="insurance-card-title"]').boundingBox()
    expect(title?.height).toBeGreaterThanOrEqual(52)
    await expectNoHorizontalScroll(page)
  })

  test("viewer: Enter on Front opens it on Front, Back toggles, Escape returns focus to the thumbnail", async ({ page, isMobile }) => {
    await mockInsuranceCard(page)
    await open(page)
    await frontThumb(page).focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "UnitedHealthcare Medical Insurance card" })
    await expect(dialog).toBeVisible()
    const toggles = dialog.getByRole("group", { name: "Card side" }).getByRole("button")
    await expect(toggles).toHaveText(["Front", "Back"])
    await expect(toggles.nth(0)).toHaveAttribute("aria-pressed", "true")
    await expect(dialog.getByRole("img", { name: "Front of UnitedHealthcare Medical Insurance card" })).toBeVisible()
    if (isMobile) {
      const box = await dialog.boundingBox()
      expect([box?.width, box?.height]).toEqual([360, 740])
    }
    await axe(page, "viewer", '[data-slot="insurance-card-viewer"]')
    await toggles.nth(1).click()
    await expect(toggles.nth(1)).toHaveAttribute("aria-pressed", "true")
    await expect(dialog.getByRole("img", { name: "Back of UnitedHealthcare Medical Insurance card" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(frontThumb(page)).toBeFocused()
  })

  test("viewer: Space on Back opens it; a missing side is disabled; Close returns focus", async ({ page }) => {
    await mockInsuranceCard(page)
    await open(page, insurancePage([insurancePolicy({ frontSideCardFile: null })]))
    const back = card(page, "Medical Insurance").getByRole("button", { name: "Back of UnitedHealthcare Medical Insurance card" })
    await back.focus()
    await page.keyboard.press(" ")
    const dialog = page.getByRole("dialog")
    const toggles = dialog.getByRole("group", { name: "Card side" }).getByRole("button")
    await expect(toggles.nth(1)).toHaveAttribute("aria-pressed", "true")
    await expect(toggles.nth(0)).toHaveAttribute("aria-disabled", "true")
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
    await expect(back).toBeFocused()
  })

  test("a card image the download refuses (404) or that isn't an image shows the tile, silently", async ({ page }) => {
    await mockInsuranceCard(page, 55, 900, { status: 404, contentType: "application/json", body: Buffer.from(JSON.stringify({ message: "Not found" })) })
    await mockInsuranceCard(page, 55, 901, { contentType: "text/html", body: Buffer.from("<html></html>") })
    await open(page, insurancePage([MEDICAL]))
    const medical = card(page, "Medical Insurance")
    await expect(medical.getByRole("img", { name: "Front image not uploaded" })).toHaveText("Image not uploaded")
    await expect(medical.getByRole("img", { name: "Back image not uploaded" })).toHaveText("Image not uploaded")
    await expect(medical.getByRole("button")).toHaveCount(0)
    // Silent: no banner or toast (the empty alert is Next's route announcer).
    await expect(section(page).getByRole("alert")).toHaveCount(0)
    await expect(page.getByRole("region", { name: /Notifications/ }).locator("li")).toHaveCount(0)
  })

  test("empty: the dashed empty card with the copy and no action", async ({ page }) => {
    await open(page, insurancePage([]))
    const empty = section(page).locator('[data-slot="empty-state"]')
    await expect(empty).toHaveText("No insurance on file. Add a policy before your next visit.")
    await expect(empty.getByRole("button")).toHaveCount(0)
    await expect(section(page).locator('[data-slot="section-meta"]')).toHaveText("0")
    await expectNoHorizontalScroll(page)
    await axe(page, "empty")
  })

  test("error: \"Couldn't load insurance · Retry\"; Retry reloads only the list", async ({ page }) => {
    await mockProfileDefaults(page)
    let fail = true
    const reads = await mockInsurance(page, { body: CARDS })
    await page.route("**/api/1h/v2/health/patient/insurance?**", (route) =>
      fail ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) }) : route.fallback(),
    )
    await mockInsuranceCard(page)
    await page.goto("/?tab=insurance")
    await expect(section(page).getByText("Couldn't load insurance")).toBeVisible()
    await axe(page, "error")
    fail = false
    const others: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      const listOrCard = url.pathname === "/api/1h/v2/health/patient/insurance" || /^\/api\/1h\/v2\/health\/insurance\/\d+\/file\/\d+\/download$/.test(url.pathname)
      if (url.pathname.startsWith("/api/1h/") && !listOrCard) others.push(url.pathname)
    })
    await section(page).getByRole("button", { name: "Retry" }).click()
    await expect(card(page, "Medical Insurance")).toBeVisible()
    expect(reads()).toHaveLength(1)
    expect(others).toEqual([])
  })

  test("forbidden: a list 403 shows the Section's no-access row", async ({ page }) => {
    await mockProfileDefaults(page)
    await mockInsurance(page, { status: 403, body: { message: "Forbidden" } })
    await page.goto("/?tab=insurance")
    await expect(section(page).getByText("You don't have access to this in your current account")).toBeVisible()
  })
})
