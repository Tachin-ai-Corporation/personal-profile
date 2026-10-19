import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page, type Request } from "@playwright/test"
import { addressesPage, addressRow, mockAddressCreate, mockAddresses, mockAddressUpdate, mockCountries, mockProfileDefaults, mockProxy, setTheme, signIn, test } from "./fixtures"

/**
 * Stories 4.1–4.2 (Team A, NG-9026): the Addresses read and edit views on the real `/`.
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
/** A body row's cells without the actions cell. */
const CELLS = "td:not([data-slot=row-actions-cell])"
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

/** Story 4.2's entry points: the header Edit and Add address, and one kebab "More actions for {address}" per named row. */
async function expectEntryPoints(page: Page, kebabs: readonly string[]): Promise<void> {
  await expect(section(page).getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await expect(section(page).getByRole("button", { name: "Add address" }).first()).toBeVisible()
  await expect(section(page).getByRole("button", { name: /^More actions for / })).toHaveCount(kebabs.length)
  for (const name of kebabs) await expect(section(page).getByRole("button", { name: `More actions for ${name}` })).toBeVisible()
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
  test("shows the Primary first, then the API order, with the chip, types and Verified; count 2; the entry points", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const seen = await openWith(page)
    await expect(addressTable(page).getByRole("columnheader")).toHaveText(["Address", "Label", "Type", "Status", "Actions"])
    const rows = addressTable(page).locator("tbody tr")
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator(CELLS)).toHaveText(["9 Oak Ave, Apt 4, SF, CA 94105", "Primary", "Home", ""])
    await expect(rows.nth(1).locator(CELLS)).toHaveText(["1 Pine St, SF, CA 94105", "", "Main Work", "Verified"])
    await expect(rows.nth(0).locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "primary")
    await expect(rows.nth(1).locator('[data-slot="chip"]')).toHaveCount(0)
    await expect(rows.nth(1).locator('[data-slot="status-badge"]')).toHaveAttribute("data-status", "verified")
    // 44 px rows.
    for (const index of [0, 1]) expect((await rows.nth(index).boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await expect(sectionMeta(page)).toHaveText("2")
    await expect(page.getByRole("navigation", { name: "Sections" }).locator('a[href="#addresses"] [data-slot="section-count"]')).toHaveText("2")
    await expectEntryPoints(page, ["9 Oak Ave, Apt 4, SF, CA 94105", "1 Pine St, SF, CA 94105"])
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
    await expect(rows.nth(0).locator(CELLS)).toHaveText(["2 Elm St, SF, CA 94105", "Primary", "Home", "Verified"])
    await expect(rows.nth(1).locator(CELLS)).toHaveText(["1 Pine St, SF, CA 94105", "", "Billing", ""])
    await expect(sectionMeta(page)).toHaveText("2")
  })

  test("empty: one \"No addresses yet · Add address\" row, count 0", async ({ page }) => {
    await openWith(page, [])
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No addresses yet·Add address")
    await expect(sectionMeta(page)).toHaveText("0")
    await expectEntryPoints(page, [])
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
    await expect(first.getByRole("button", { name: "More actions for 9 Oak Ave, Apt 4, SF, CA 94105" })).toBeVisible()
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

// --- Story 4.2: add and edit -------------------------------------------------------------------

const COUNTRIES = [{ id: 1, name: "Germany" }, { id: 2, name: "Canada" }, { id: 3, name: "n/a" }, { id: 4, name: "United States" }, { id: 5, name: "Australia" }]

const footer = (page: Page): Locator => section(page).locator('[data-slot="section-footer"]')
const saveButton = (page: Page): Locator => footer(page).getByRole("button", { name: "Save" })
const expandedRows = (page: Page): Locator => section(page).locator('[data-slot="address-expanded"]')
const toastWith = (page: Page, text: string): Locator => page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })
const typeSelect = (row: Locator): Locator => row.getByRole("combobox", { name: "Address Type" })
const countrySelect = (row: Locator): Locator => row.getByRole("combobox", { name: "Country" })
const field = (row: Locator, name: string): Locator => row.getByRole("textbox", { name, exact: true })

async function pick(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

/**
 * The list as a small backend: `rows` (mutated by the create and update
 * mocks below, so the refetch after a save sees the change).
 */
async function openEditable(page: Page, rows: Record<string, unknown>[] = ADDRESSES.map((row) => ({ ...row })), countries: Parameters<typeof mockCountries>[1] = { body: COUNTRIES }) {
  await mockProfileDefaults(page)
  const lists = await mockProxy(page, "v2/person/location/list?**", () => ({ body: addressesPage(rows) }))
  await mockCountries(page, countries)
  await page.goto("/?tab=contacts")
  await expect(addressTable(page).or(addressCards(page))).toBeVisible()
  return { rows, lists }
}

/** Applies a write body to a list row (the mock backend). */
function applyBody(row: Record<string, unknown>, body: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(body)) if (key !== "fullAddress") row[key] = value
}

/** A collapsed row's chevron. */
const expandButton = (page: Page, address: string): Locator => section(page).getByRole("button", { name: `Expand ${address}`, exact: true })

test.describe("Addresses edit (Story 4.2)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("Add address → save → read: one POST, the list refetched, \"Addresses saved.\", h2 focused", async ({ page }) => {
    const { rows, lists } = await openEditable(page)
    const posts = await mockAddressCreate(page, (request) => {
      const created = addressRow({ id: 31, ...request.postDataJSON(), addressLine2: null, county: null })
      rows.push(created)
      return { body: created }
    })
    await section(page).getByRole("button", { name: "Add address" }).click()
    const row = expandedRows(page).first()
    await expect(typeSelect(row)).toBeFocused()
    await expect(row.getByText("New · not saved")).toBeVisible()
    await expect(countrySelect(row)).toHaveText("United States")
    await pick(page, typeSelect(row), "Home")
    // The countries list: the pinned three first, then alphabetical, "n/a" dropped.
    await countrySelect(row).click()
    await expect(page.getByRole("option")).toHaveText(["United States", "Canada", "Australia", "Germany"])
    await page.keyboard.press("Escape")
    await field(row, "Address line 1").fill("1 Pine St")
    await field(row, "City").fill("SF")
    await field(row, "State/Province (optional)").fill("CA")
    await field(row, "Zip").fill("94105")
    await expect(footer(page).getByText("Unsaved changes")).toBeVisible()
    const listReads = lists().length
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([
      { personLocationType: "Home", addressLine1: "1 Pine St", cityName: "SF", stateName: "CA", postalCode: "94105", country: "United States", primary: false, validated: false },
    ])
    expect(lists().length).toBeGreaterThan(listReads)
    await expect(toastWith(page, "Addresses saved.")).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "Addresses" })).toBeFocused()
    await expect(addressTable(page).locator("tbody tr")).toHaveCount(3)
    await expect(sectionMeta(page)).toHaveText("3")
  })

  test("Edit: the kebab opens that row expanded; city SF → Oakland sends PUT /2 with every field, validated false, fullAddress rebuilt", async ({ page }) => {
    const { rows } = await openEditable(page)
    const puts = await mockAddressUpdate(page, (request) => {
      const target = rows.find((row) => row.id === 2) as Record<string, unknown>
      applyBody(target, request.postDataJSON())
      return { body: target }
    })
    await section(page).getByRole("button", { name: "More actions for 1 Pine St, SF, CA 94105" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    const row = expandedRows(page).first()
    await expect(typeSelect(row)).toBeFocused()
    await expect(expandedRows(page)).toHaveCount(1)
    await expect(expandButton(page, "9 Oak Ave, Apt 4, SF, CA 94105")).toHaveAttribute("aria-expanded", "false")
    await field(row, "City").fill("Oakland")
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(puts()).toEqual([
      {
        id: 2,
        body: {
          personLocationType: "Main Work",
          addressLine1: "1 Pine St",
          cityName: "Oakland",
          stateName: "CA",
          postalCode: "94105",
          country: "United States",
          primary: false,
          validated: false,
          fullAddress: "1 Pine St, Oakland, 94105, United States",
        },
      },
    ])
    await expect(addressTable(page).getByText("1 Pine St, Oakland, CA 94105")).toBeVisible()
  })

  test("Label only: Main Work → Home keeps validated true; Unchanged: nothing sent", async ({ page }) => {
    await openEditable(page)
    const puts = await mockAddressUpdate(page)
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    // The header Edit: every row collapsed, focus on the first chevron.
    await expect(expandButton(page, "9 Oak Ave, Apt 4, SF, CA 94105")).toBeFocused()
    await expect(expandedRows(page)).toHaveCount(0)
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(puts()).toEqual([])

    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    await expandButton(page, "1 Pine St, SF, CA 94105").click()
    await expect(section(page).getByRole("button", { name: "Collapse 1 Pine St, SF, CA 94105" })).toBeFocused()
    await pick(page, typeSelect(expandedRows(page).first()), "Home")
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(puts()).toEqual([expect.objectContaining({ id: 2, body: expect.objectContaining({ personLocationType: "Home", validated: true, primary: false }) })])
  })

  test("Invalid: a collapsed new row with a 3-digit zip expands on Save, focus on Zip, its message; nothing sent", async ({ page }) => {
    await openEditable(page)
    const posts = await mockAddressCreate(page)
    await section(page).getByRole("button", { name: "Add address" }).click()
    const row = expandedRows(page).first()
    await pick(page, typeSelect(row), "Home")
    await field(row, "Address line 1").fill("5 Elm St")
    await field(row, "City").fill("SF")
    await field(row, "Zip").fill("941")
    await section(page).getByRole("button", { name: "Collapse New address" }).click()
    await expect(expandedRows(page)).toHaveCount(0)
    await saveButton(page).click()
    const zip = field(expandedRows(page).first(), "Zip")
    await expect(zip).toBeFocused()
    await expect(zip).toHaveAttribute("aria-invalid", "true")
    await expect(expandedRows(page).first().getByText("Enter a 5-digit ZIP code")).toBeVisible()
    expect(posts()).toEqual([])
  })

  test("Two steps: PUT ok, POST 500 → Section error + Retry; Retry sends only the POST", async ({ page }) => {
    const { rows } = await openEditable(page)
    let failCreate = true
    const puts = await mockAddressUpdate(page, (request) => {
      applyBody(rows.find((row) => row.id === 2) as Record<string, unknown>, request.postDataJSON())
      return { body: { id: 2 } }
    })
    const posts = await mockAddressCreate(page, (request) => {
      if (failCreate) return { status: 500, body: { message: "boom" } }
      const created = addressRow({ id: 31, ...request.postDataJSON() })
      rows.push(created)
      return { body: created }
    })
    await section(page).getByRole("button", { name: "More actions for 1 Pine St, SF, CA 94105" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    await field(expandedRows(page).first(), "City").fill("Oakland")
    await footer(page).getByRole("button", { name: "Add address" }).click()
    const added = expandedRows(page).last()
    await pick(page, typeSelect(added), "Vacation Home")
    await field(added, "Address line 1").fill("7 Bay Rd")
    await field(added, "City").fill("Tahoe")
    await field(added, "Zip").fill("96150")
    await saveButton(page).click()
    const banner = footer(page).locator('[data-slot~="inline-banner"]')
    await expect(banner).toContainText("Couldn't save addresses.")
    expect(puts()).toHaveLength(1)
    expect(posts()).toHaveLength(1)
    failCreate = false
    await banner.getByRole("button", { name: "Retry" }).click()
    await expect(footer(page)).toHaveCount(0)
    expect(puts()).toHaveLength(1)
    expect(posts()).toHaveLength(2)
    await expect(toastWith(page, "Addresses saved.")).toBeVisible()
    await expect(addressTable(page).locator("tbody tr")).toHaveCount(3)
  })

  test("Countries fail: \"Couldn't load countries · Retry\"; a new row can't save; a saved row can", async ({ page }) => {
    const { rows } = await openEditable(page, undefined, { status: 500, body: { message: "boom" } })
    const posts = await mockAddressCreate(page)
    const puts = await mockAddressUpdate(page, (request) => {
      applyBody(rows.find((row) => row.id === 2) as Record<string, unknown>, request.postDataJSON())
      return { body: { id: 2 } }
    })
    await section(page).getByRole("button", { name: "Add address" }).click()
    const row = expandedRows(page).first()
    await expect(row.getByText("Couldn't load countries")).toBeVisible()
    await expect(row.getByRole("button", { name: "Retry" })).toBeVisible()
    await pick(page, typeSelect(row), "Home")
    await field(row, "Address line 1").fill("5 Elm St")
    await field(row, "City").fill("SF")
    await field(row, "Zip").fill("94105")
    await saveButton(page).click()
    await expect(row.getByText("Countries need to load before this address can be saved")).toBeVisible()
    expect(posts()).toEqual([])
    await footer(page).getByRole("button", { name: "Cancel" }).click()

    await section(page).getByRole("button", { name: "More actions for 1 Pine St, SF, CA 94105" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    await field(expandedRows(page).first(), "City").fill("Oakland")
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(puts()).toHaveLength(1)
    expect(puts()[0].body).not.toHaveProperty("country")
  })

  test("at 360 px: the edit view's fields stack full width in the card, no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openEditable(page)
    await section(page).getByRole("button", { name: "Add address" }).click()
    const row = expandedRows(page).first()
    await expect(typeSelect(row)).toBeFocused()
    const line1 = await field(row, "Address line 1").boundingBox()
    const line2 = await field(row, "Address line 2 (optional)").boundingBox()
    const city = await field(row, "City").boundingBox()
    expect(line1).not.toBeNull()
    expect(line2).not.toBeNull()
    expect(city).not.toBeNull()
    expect(Math.abs(line1!.x - line2!.x)).toBeLessThan(2)
    expect(line2!.y).toBeGreaterThan(line1!.y)
    expect(Math.abs(line1!.width - city!.width)).toBeLessThan(2)
    for (const control of [typeSelect(row), field(row, "Zip"), row.getByRole("checkbox", { name: "Set as primary" })]) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    }
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in light and dark in edit view (an expanded saved row, a new row with an error)", async ({ page }) => {
    await openEditable(page)
    await section(page).getByRole("button", { name: "More actions for 1 Pine St, SF, CA 94105" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    await footer(page).getByRole("button", { name: "Add address" }).click()
    const added = expandedRows(page).last()
    await field(added, "Zip").fill("941")
    await field(added, "City").focus()
    await expect(added.getByText("Enter a 5-digit ZIP code")).toBeVisible()
    await axe(page, "Addresses edit")
  })
})
