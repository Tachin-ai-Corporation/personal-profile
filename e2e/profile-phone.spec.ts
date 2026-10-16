import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { CONTACT_PHONES, contactPointRow, mockContacts, mockProfileDefaults, setTheme, signIn, test } from "./fixtures"

/**
 * Story 3.1 (Team A, NG-9023): the Phone read view on the real `/`. Every
 * test runs under the fail-fast `test`, starts from `mockProfileDefaults` and
 * overrides the Contact Point lists (`mockContacts`, the newest route wins).
 * Desktop asserts run at 1280 px; the stacked cards at 360 px.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

const section = (page: Page): Locator => page.getByRole("region", { name: "Phone" })
const phoneTable = (page: Page): Locator => section(page).getByRole("table", { name: "Phone" })
const phoneCards = (page: Page): Locator => section(page).getByRole("list", { name: "Phone" })
const sectionMeta = (page: Page): Locator => section(page).locator('[data-slot="section-meta"]')

async function openWith(page: Page, phones: Parameters<typeof mockContacts>[1] = CONTACT_PHONES): Promise<string[]> {
  await mockProfileDefaults(page)
  const seen = await mockContacts(page, phones)
  await page.goto("/")
  return seen
}

/** No horizontal page scroll. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("Phone read view (Story 3.1)", () => {
  test("shows Primary first, then the API order, with formatting, chips, statuses and notifications; count 3", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWith(page)
    await expect(phoneTable(page).getByRole("columnheader")).toHaveText(["Number", "Label", "Type", "Status", "Notifications"])
    const rows = phoneTable(page).locator("tbody tr")
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).getByRole("cell")).toHaveText(["🇺🇸+1 (415) 551-2125", "Primary", "Mobile", "Verified", "On"])
    await expect(rows.nth(1).getByRole("cell")).toHaveText(["🇺🇸+1 (415) 555-0111", "Work", "Mobile", "Not verified", "—Not applicable"])
    await expect(rows.nth(2).getByRole("cell")).toHaveText(["🇬🇧+44 20 7183 8750", "Home", "Landline", "", "—Not applicable"])
    await expect(rows.nth(0).locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "primary")
    await expect(rows.nth(1).locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "label")
    // The flag is decoration: the number's accessible text is the formatted number alone.
    await expect(rows.nth(0).getByText("🇺🇸")).toHaveAttribute("aria-hidden", "true")
    await expect(sectionMeta(page)).toHaveText("3")
    await expect(page.getByRole("navigation", { name: "Sections" }).locator('a[href="#phone"] [data-slot="section-count"]')).toHaveText("3")
    // No row actions yet (Story 3.2 adds Edit and Remove with the kebab).
    await expect(section(page).getByRole("button")).toHaveCount(0)
  })

  test("shows Off on a Primary with notifications off", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWith(page, { Mobile: [contactPointRow({ id: 12, label: "Primary", isNotificationEnabled: false })] })
    await expect(phoneTable(page).locator("tbody tr").first().getByRole("cell").last()).toHaveText("Off")
  })

  test("empty: one \"No phones yet\" row and count 0", async ({ page }) => {
    await openWith(page, {})
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No phones yet")
    await expect(sectionMeta(page)).toHaveText("0")
  })

  test("a failed Landline read shows \"Couldn't load phones\" + Retry, which revalidates only the two Phone keys; Email and Social still load", async ({ page }) => {
    const email = [contactPointRow({ id: 31, type: "Email", value: "ann@example.com", label: "Primary", phoneNumberRegion: null })]
    await openWith(page, { ...CONTACT_PHONES, Email: email, Landline: { status: 500, body: { message: "boom" } } })
    await expect(section(page).getByText("Couldn't load phones")).toBeVisible()
    // The other contact reads are unaffected: the header's primary email (from 768 px) and the Email and Social media Sections, with no error.
    if ((page.viewportSize()?.width ?? 0) >= 768) await expect(page.locator("div:has(> h1)").getByText("ann@example.com")).toBeVisible()
    for (const name of ["Email", "Social media"]) {
      const other = page.getByRole("region", { name })
      await expect(other).toBeVisible()
      await expect(other.getByText(/Couldn't load/)).toHaveCount(0)
      await expect(other.getByRole("alert")).toHaveCount(0)
    }
    await expect(sectionMeta(page)).toHaveCount(0)
    await page.waitForLoadState("networkidle")

    const seen = await mockContacts(page, { ...CONTACT_PHONES, Email: email })
    await section(page).getByRole("button", { name: "Retry" }).click()
    await expect(phoneTable(page).or(phoneCards(page))).toBeVisible()
    await expect(sectionMeta(page)).toHaveText("3")
    expect([...new Set(seen)].toSorted()).toEqual(["Landline", "Mobile"])
  })

  test("a 403 shows the Section's no-access row", async ({ page }) => {
    await openWith(page, { ...CONTACT_PHONES, Mobile: { status: 403, body: { message: "Forbidden" } } })
    await expect(section(page).getByText("You don't have access to this in your current account")).toBeVisible()
    await expect(section(page).getByRole("button", { name: "Retry" })).toHaveCount(0)
  })

  test("at 360 px: stacked cards (number and status, then label, type and notifications), no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page)
    await expect(phoneTable(page)).toHaveCount(0)
    const cards = phoneCards(page).getByRole("listitem")
    await expect(cards).toHaveCount(3)
    const first = cards.first()
    await expect(first.locator('[data-column="number"]')).toContainText("+1 (415) 551-2125")
    await expect(first.locator('[data-column="status"]')).toContainText("Verified")
    await expect(first.locator('[data-column="label"]')).toContainText("Primary")
    await expect(first.locator('[data-column="type"]')).toContainText("Mobile")
    await expect(first.locator('[data-column="notifications"]')).toContainText("On")
    // Line 1 sits above line 2.
    const numberBox = await first.locator('[data-column="number"]').boundingBox()
    const labelBox = await first.locator('[data-column="label"]').boundingBox()
    expect(numberBox && labelBox && labelBox.y > numberBox.y).toBe(true)
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in light and dark, loaded and empty", async ({ page }) => {
    await openWith(page)
    await expect(phoneTable(page).or(phoneCards(page))).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#phone").withTags(WCAG).analyze()
      expect(results.violations, `Phone (${theme})`).toEqual([])
    }
    await expectNoHorizontalScroll(page)

    await mockContacts(page, {})
    await page.reload()
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No phones yet")
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#phone").withTags(WCAG).analyze()
      expect(results.violations, `Phone empty (${theme})`).toEqual([])
    }
  })
})
