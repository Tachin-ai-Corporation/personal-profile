import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page, type Request } from "@playwright/test"
import { addressesPage, addressRow, mockAddresses, mockProfileDefaults, setTheme, signIn, test } from "./fixtures"

/**
 * Story 4.1 (Team A, NG-9026): the Addresses read view on the real `/`.
 * Every test runs under the fail-fast `test`, starts from
 * `mockProfileDefaults` (an empty Page) and overrides the list
 * (`mockAddresses`, the newest route wins). Desktop asserts run at 1280 px;
 * the stacked cards at 360 px.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

/** The spec's "Read" row: Main Work 2 (verified), then Home 1 (Primary). Shown as 1, 2. */
const ADDRESSES = [
  addressRow({ id: 2, personLocationType: "Main Work", validated: true }),
  addressRow({ id: 1, addressLine1: "9 Oak Ave", addressLine2: "Apt 4", primary: true }),
]

/** The spec's "Non-US" row. */
const TORONTO = addressRow({ id: 3, addressLine1: "12 King St W", cityName: "Toronto", stateName: "ON", postalCode: "M5H 1A1", country: "Canada", countryCode: "CA" })

const section = (page: Page): Locator => page.getByRole("region", { name: "Addresses" })
const addressTable = (page: Page): Locator => section(page).getByRole("table", { name: "Addresses" })
const addressCards = (page: Page): Locator => section(page).getByRole("list", { name: "Addresses" })
const sectionMeta = (page: Page): Locator => section(page).locator('[data-slot="section-meta"]')

async function openWith(page: Page, addresses: Parameters<typeof mockAddresses>[1] = ADDRESSES): Promise<() => Request[]> {
  await mockProfileDefaults(page)
  const seen = await mockAddresses(page, addresses)
  await page.goto("/?tab=contacts")
  return seen
}

/** No horizontal page scroll. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** Nothing to act on in 4.1: no Add address, no Edit, no kebab. */
async function expectNoActions(page: Page): Promise<void> {
  await expect(section(page).getByRole("button")).toHaveCount(0)
  await expect(section(page).getByText("Add address")).toHaveCount(0)
}

async function axe(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).include("#addresses").withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("Addresses read view (Story 4.1)", () => {
  test("shows the Primary first, then the API order, with the chip, types and Verified; count 2; no actions", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const seen = await openWith(page)
    await expect(addressTable(page).getByRole("columnheader")).toHaveText(["Address", "Label", "Type", "Status"])
    const rows = addressTable(page).locator("tbody tr")
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator("td")).toHaveText(["9 Oak Ave, Apt 4, SF, CA 94105", "Primary", "Home", ""])
    await expect(rows.nth(1).locator("td")).toHaveText(["1 Pine St, SF, CA 94105", "", "Main Work", "Verified"])
    await expect(rows.nth(0).locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "primary")
    await expect(rows.nth(1).locator('[data-slot="chip"]')).toHaveCount(0)
    await expect(rows.nth(1).locator('[data-slot="status-badge"]')).toHaveAttribute("data-status", "verified")
    // 44 px rows.
    for (const index of [0, 1]) expect((await rows.nth(index).boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await expect(sectionMeta(page)).toHaveText("2")
    await expect(page.getByRole("navigation", { name: "Sections" }).locator('a[href="#addresses"] [data-slot="section-count"]')).toHaveText("2")
    await expectNoActions(page)
    expect(seen().map((request) => new URL(request.url()).search)).toEqual(["?page=0&size=100"])
  })

  test("appends a non-US country and skips absent parts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWith(page, [TORONTO, addressRow({ id: 4, addressLine2: "n/a", stateName: "" })])
    const firstCells = addressTable(page).locator("tbody tr td:first-child")
    await expect(firstCells).toHaveText(["12 King St W, Toronto, ON M5H 1A1, Canada", "1 Pine St, SF 94105"])
  })

  test("reads the legacy names from a bare list and drops inactive rows", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWith(page, {
      body: [
        addressRow({ id: 5, active: false, addressLine1: "5 Gone St" }),
        addressRow({ id: 6, personLocationType: "Billing" }),
        addressRow({ id: 7, addressLine1: "2 Elm St", primary: undefined, validated: undefined, isPrimary: true, isValidated: true }),
      ],
    })
    const rows = addressTable(page).locator("tbody tr")
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator("td")).toHaveText(["2 Elm St, SF, CA 94105", "Primary", "Home", "Verified"])
    await expect(rows.nth(1).locator("td")).toHaveText(["1 Pine St, SF, CA 94105", "", "Billing", ""])
    await expect(sectionMeta(page)).toHaveText("2")
  })

  test("empty: one \"No addresses yet\" row with no action, count 0", async ({ page }) => {
    await openWith(page, [])
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No addresses yet")
    await expect(sectionMeta(page)).toHaveText("0")
    await expectNoActions(page)
  })

  test("a failed read shows \"Couldn't load addresses\" + Retry, which revalidates only the Addresses key; Phone, Email and Social still load", async ({ page }) => {
    await openWith(page, { status: 500, body: { message: "boom" } })
    await expect(section(page).getByText("Couldn't load addresses")).toBeVisible()
    await expect(page.getByRole("region", { name: "Phone" }).locator('[data-slot="empty-state-line"]')).toHaveText("No phones yet·Add phone")
    await expect(page.getByRole("region", { name: "Email" }).locator('[data-slot="empty-state-line"]')).toHaveText("No emails yet·Add email")
    await expect(page.getByRole("region", { name: "Social media" }).locator('[data-slot="empty-state-line"]')).toHaveText(/^No social links yet/)
    await page.waitForLoadState("networkidle")

    const proxied: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith("/api/1h/")) proxied.push(url.pathname.slice("/api/1h/".length))
    })
    await mockAddresses(page, ADDRESSES)
    await section(page).getByRole("button", { name: "Retry" }).click()
    await expect(addressTable(page).or(addressCards(page))).toBeVisible()
    await expect(sectionMeta(page)).toHaveText("2")
    expect([...new Set(proxied)]).toEqual(["v2/person/location/list"])
  })

  test("a 403 shows the Section's no-access row", async ({ page }) => {
    await openWith(page, { status: 403, body: { message: "Forbidden" } })
    await expect(section(page).getByText("You don't have access to this in your current account")).toBeVisible()
    await expect(section(page).getByRole("button", { name: "Retry" })).toHaveCount(0)
  })

  test("at 360 px: stacked cards (the address, then the chip, type and Verified, muted), no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page, [
      ...ADDRESSES,
      TORONTO,
      addressRow({ id: 8, addressLine1: "1600 Pennsylvania Avenue Northwest Executive Residence Building", addressLine2: "Suite 1234567890", cityName: "Washington", stateName: "DC", postalCode: "20500" }),
    ])
    await expect(addressTable(page)).toHaveCount(0)
    const cards = addressCards(page).getByRole("listitem")
    await expect(cards).toHaveCount(4)
    const first = cards.first()
    await expect(first.locator('[data-column="address"]')).toContainText("9 Oak Ave, Apt 4, SF, CA 94105")
    await expect(first.locator('[data-column="label"]')).toContainText("Primary")
    await expect(first.locator('[data-column="type"]')).toContainText("Home")
    await expect(cards.nth(1).locator('[data-column="status"]')).toContainText("Verified")
    const addressBox = await first.locator('[data-column="address"]').boundingBox()
    const labelBox = await first.locator('[data-column="label"]').boundingBox()
    const typeBox = await first.locator('[data-column="type"]').boundingBox()
    expect(addressBox).not.toBeNull()
    expect(labelBox).not.toBeNull()
    expect(typeBox).not.toBeNull()
    expect(labelBox!.y).toBeGreaterThan(addressBox!.y)
    expect(Math.abs(typeBox!.y - labelBox!.y)).toBeLessThan(8)
    await expectNoActions(page)
    await expectNoHorizontalScroll(page)
  })

  test("reduced motion: the loading skeleton holds still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await mockProfileDefaults(page)
    await page.route("**/api/1h/v2/person/location/list?**", async (route) => {
      await held
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(addressesPage(ADDRESSES)) })
    })
    await page.goto("/?tab=contacts")
    const bar = section(page).locator('[data-slot="frame-skeleton"] [data-slot="skeleton"]').first()
    await expect(bar).toBeVisible()
    expect(await bar.evaluate((element) => getComputedStyle(element).animationName)).toBe("none")
    release()
    await expect(addressTable(page).or(addressCards(page))).toBeVisible()
  })

  test("axe passes in light and dark, loaded, empty and with the load error", async ({ page }) => {
    await openWith(page)
    await expect(addressTable(page).or(addressCards(page))).toBeVisible()
    await axe(page, "Addresses")
    await expectNoHorizontalScroll(page)

    await mockAddresses(page, [])
    await page.reload()
    await expect(section(page).getByText("No addresses yet")).toBeVisible()
    await axe(page, "Addresses empty")

    await mockAddresses(page, { status: 500, body: { message: "boom" } })
    await page.reload()
    await expect(section(page).getByText("Couldn't load addresses")).toBeVisible()
    await axe(page, "Addresses load error")
  })
})
