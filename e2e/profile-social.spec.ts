import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { contactPointRow, mockContactManage, mockContacts, mockContactVerify, mockProfileDefaults, setTheme, signIn, test, type ContactAnswer } from "./fixtures"

/**
 * Story 3.7 (Team A, NG-9025): the Social media read and edit views on the
 * real `/`. Every test runs under the fail-fast `test`, starts from
 * `mockProfileDefaults` and overrides the Contact Point lists (`mockContacts`,
 * the newest route wins). Desktop asserts run at 1280 px; the stacked cards
 * at 360 px.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

const socialRow = (overrides: Record<string, unknown>): Record<string, unknown> =>
  contactPointRow({ type: "Social Media", label: "Personal", isVerified: null, phoneNumberRegion: null, ...overrides })

/** The spec's "Read" row: an https link 51 and a legacy handle 52. */
const LINKS = [socialRow({ id: 51, value: "https://x.com/ann" }), socialRow({ id: 52, value: "@ann" })]

const LONG_URL = "https://www.example-hospital-network.org/providers/profiles/ann-lee-md-facp-internal-medicine-and-primary-care?ref=profile&utm_source=1health"

const section = (page: Page): Locator => page.getByRole("region", { name: "Social media" })
const socialTable = (page: Page): Locator => section(page).getByRole("table", { name: "Social media" })
const socialCards = (page: Page): Locator => section(page).getByRole("list", { name: "Social media" })
const sectionMeta = (page: Page): Locator => section(page).locator('[data-slot="section-meta"]')
const toastWith = (page: Page, text: string): Locator => page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })
const newRow = (page: Page): Locator => section(page).locator('[data-state="new"]').last()
const linkInput = (row: Locator): Locator => row.getByRole("textbox", { name: "Link" })
const footer = (page: Page): Locator => section(page).locator('[data-slot="section-footer"]')
const saveButton = (page: Page): Locator => footer(page).getByRole("button", { name: "Save" })
/** The row at `index` (0-based, in shown order) of the table (desktop) or its card (360 px). */
const editRow = (page: Page, index: number): Locator => section(page).locator("tbody tr, li[data-slot='section-table-card']").nth(index)

/** The body of one add: always Social Media, "Personal", notifications off. */
const addOf = (value: string) => ({ value, type: "Social Media", label: "Personal", isNotificationEnabled: false })

async function openWith(page: Page, links: ContactAnswer = LINKS): Promise<string[]> {
  await mockProfileDefaults(page)
  const seen = await mockContacts(page, { "Social Media": links })
  await page.goto("/")
  return seen
}

/** No horizontal page scroll. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

async function axe(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    // A struck row's read-only input inherits the row's muted color through its `color` transition: let it land too.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))))
    const results = await new AxeBuilder({ page }).include("#social").withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("Social media read view (Story 3.7)", () => {
  test("an https link is an anchor (new tab, noopener noreferrer); a handle is plain text; count 2; the kebab holds Edit and Remove", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWith(page)
    await expect(socialTable(page).getByRole("columnheader")).toHaveText(["Link", "Actions"])
    const rows = socialTable(page).locator("tbody tr")
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator("td:not([data-slot=row-actions-cell])")).toHaveText("https://x.com/ann")
    await expect(rows.nth(1).locator("td:not([data-slot=row-actions-cell])")).toHaveText("@ann")
    const anchor = section(page).getByRole("link", { name: "https://x.com/ann" })
    await expect(anchor).toHaveAttribute("href", "https://x.com/ann")
    await expect(anchor).toHaveAttribute("target", "_blank")
    await expect(anchor).toHaveAttribute("rel", "noopener noreferrer")
    await expect(section(page).getByRole("link")).toHaveCount(1)
    await expect(rows.nth(1).locator("a")).toHaveCount(0)
    await expect(sectionMeta(page)).toHaveText("2")
    await expect(page.getByRole("navigation", { name: "Sections" }).locator('a[href="#social"] [data-slot="section-count"]')).toHaveText("2")
    await expect(section(page).getByRole("button", { name: "Edit", exact: true })).toBeVisible()
    await expect(section(page).getByRole("button", { name: "Add link" })).toBeVisible()
    await section(page).getByRole("button", { name: "More actions for @ann" }).click()
    await expect(page.getByRole("menuitem")).toHaveText(["Edit", "Remove"])
  })

  test("empty: one \"No social links yet · Add link\" row and count 0", async ({ page }) => {
    await openWith(page, [])
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No social links yet·Add link")
    await expect(sectionMeta(page)).toHaveText("0")
  })

  test("a failed read shows \"Couldn't load social links\" + Retry, which revalidates only the Social Media key", async ({ page }) => {
    await openWith(page, { status: 500, body: { message: "boom" } })
    await expect(section(page).getByText("Couldn't load social links")).toBeVisible()
    await page.waitForLoadState("networkidle")

    const seen = await mockContacts(page, { "Social Media": LINKS })
    await section(page).getByRole("button", { name: "Retry" }).click()
    await expect(socialTable(page).or(socialCards(page))).toBeVisible()
    await expect(sectionMeta(page)).toHaveText("2")
    expect([...new Set(seen)]).toEqual(["Social Media"])
  })

  test("at 360 px: stacked cards (the link, the kebab on the right); a long URL wraps with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page, [...LINKS, socialRow({ id: 53, value: LONG_URL })])
    await expect(socialTable(page)).toHaveCount(0)
    const cards = socialCards(page).getByRole("listitem")
    await expect(cards).toHaveCount(3)
    const long = cards.nth(2)
    await expect(long.locator('[data-column="link"]')).toContainText(LONG_URL)
    const cardBox = await long.boundingBox()
    const linkBox = await long.getByRole("link").boundingBox()
    const kebabBox = await long.getByRole("button", { name: `More actions for ${LONG_URL}` }).boundingBox()
    // The kebab sits right of the link, and the wrapped link stays inside its card.
    expect(linkBox && kebabBox && kebabBox.x >= linkBox.x + linkBox.width).toBe(true)
    expect(linkBox && cardBox && linkBox.x + linkBox.width <= cardBox.x + cardBox.width).toBe(true)
    expect(linkBox && linkBox.height > 44).toBe(true)
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in light and dark, loaded and empty", async ({ page }) => {
    await openWith(page)
    await expect(socialTable(page).or(socialCards(page))).toBeVisible()
    await axe(page, "Social media")
    await expectNoHorizontalScroll(page)

    await mockContacts(page, {})
    await page.reload()
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No social links yet·Add link")
    await axe(page, "Social media empty")
  })
})

test.describe("Social media edit (Story 3.7)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("Add link → save → read: one POST with the trimmed link as Social Media / Personal, the list and myself refetched, toast, h2; no verify", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    const verifies = await mockContactVerify(page)
    await section(page).getByRole("button", { name: "Add link" }).click()
    const row = newRow(page)
    await expect(linkInput(row)).toBeFocused()
    await expect(linkInput(row)).toHaveAttribute("type", "url")
    await expect(row.getByText("New · not saved")).toBeVisible()
    await linkInput(row).fill("https://linkedin.com/in/ann ")
    await expect(footer(page).getByText("Unsaved changes")).toBeVisible()

    await mockContacts(page, { "Social Media": [...LINKS, socialRow({ id: 54, value: "https://linkedin.com/in/ann" })] })
    const calls: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith("/api/1h/")) calls.push(`${request.method()} ${url.pathname.slice("/api/1h/".length)}${url.search}`)
    })
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([{ contactPointsToAdd: [addOf("https://linkedin.com/in/ann")], contactPointsToUpdate: [], contactPointsToRemove: [] }])
    await expect(toastWith(page, "Social media saved.")).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "Social media" })).toBeFocused()
    await expect(socialTable(page).locator("tbody tr")).toHaveCount(3)
    await expect(sectionMeta(page)).toHaveText("3")
    const post = calls.indexOf("POST v2/health/contact-point")
    expect(post).toBeGreaterThanOrEqual(0)
    const after = calls.slice(post + 1)
    for (const read of ["GET v2/user/contact-point/list?type=Social%20Media", "GET v2/user/myself"]) expect(after, read).toContain(read)
    expect(verifies()).toEqual([])
  })

  test("replace: changing 51 sends remove [51] plus the new link in one POST", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "More actions for https://x.com/ann" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    const input = linkInput(editRow(page, 0))
    await expect(input).toBeFocused()
    await input.fill("https://x.com/ann2")
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([{ contactPointsToAdd: [addOf("https://x.com/ann2")], contactPointsToUpdate: [], contactPointsToRemove: [51] }])
  })

  test("remove all: strike 51 and 52, Save → remove [51, 52], then the empty state", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    for (const index of [0, 1]) {
      const remove = editRow(page, index).getByRole("button", { name: "Remove" })
      await expect(remove).not.toHaveAttribute("aria-disabled", "true")
      await remove.click()
      await expect(editRow(page, index)).toHaveAttribute("data-state", "removed")
    }
    await mockContacts(page, { "Social Media": [] })
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [], contactPointsToRemove: [51, 52] }])
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No social links yet·Add link")
  })

  test("invalid: http, javascript, a handle and empty show their errors; a duplicate of a struck link too; nothing is sent", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Add link" }).click()
    const row = newRow(page)
    for (const value of ["http://x.com", "javascript:alert(1)", "@ann2"]) {
      await linkInput(row).fill(value)
      await linkInput(row).blur()
      await expect(row.locator('[data-slot="field-error"]')).toHaveText("Enter a link that starts with https://")
      await expect(linkInput(row)).toHaveAttribute("aria-invalid", "true")
    }
    await linkInput(row).fill("")
    await saveButton(page).click()
    await expect(row.locator('[data-slot="field-error"]')).toHaveText("Enter a link")
    await expect(linkInput(row)).toBeFocused()

    await editRow(page, 0).getByRole("button", { name: "Remove" }).click()
    await linkInput(row).fill("https://X.com/ann")
    await saveButton(page).click()
    await expect(row.locator('[data-slot="field-error"]')).toHaveText("This link is already on your profile")
    await expect(linkInput(row)).toBeFocused()
    expect(posts()).toEqual([])
  })

  test("limit: with 20 saved, Add link and Add row are aria-disabled with the limit", async ({ page }) => {
    const twenty = Array.from({ length: 20 }, (_, index) => socialRow({ id: 100 + index, value: `https://example.com/u${100 + index}` }))
    await openWith(page, twenty)
    const add = section(page).getByRole("button", { name: "Add link" })
    await expect(add).toHaveAttribute("aria-disabled", "true")
    await expect(add).toHaveAccessibleDescription("You've reached the limit of 20 links")
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    const addRow = footer(page).getByRole("button", { name: "Add row" })
    await expect(addRow).toHaveAttribute("aria-disabled", "true")
    await expect(addRow).toHaveAccessibleDescription("You've reached the limit of 20 links")
    await addRow.focus()
    await page.keyboard.press("Enter")
    await expect(section(page).locator('[data-state="new"]')).toHaveCount(0)
  })

  test("a 400 \"Invalid URL provided '…'.\" shows the invalid-link message at the changed row; stays in edit", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page, { status: 400, body: { message: "Invalid URL provided 'https://x.com/ann2'.", code: 400 } })
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    const input = linkInput(editRow(page, 0))
    await input.fill("https://x.com/ann2")
    await saveButton(page).click()
    await expect(editRow(page, 0).locator('[data-slot="field-error"]')).toHaveText("Enter a link that starts with https://")
    await expect(input).toBeFocused()
    await expect(saveButton(page)).toBeVisible()
    expect(posts()).toHaveLength(1)
  })

  test("at 360 px: the edit card stacks the input full width, at least 44 px; a long URL fits with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page, [...LINKS, socialRow({ id: 53, value: LONG_URL })])
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    await expect(socialTable(page)).toHaveCount(0)
    const card = editRow(page, 2)
    await expect(linkInput(card)).toHaveValue(LONG_URL)
    const cardBox = await card.boundingBox()
    for (const control of [linkInput(card), card.getByRole("button", { name: "Remove" })]) {
      const box = await control.boundingBox()
      expect(box && box.height >= 44).toBe(true)
    }
    const inputBox = await linkInput(card).boundingBox()
    expect(inputBox && cardBox && inputBox.width > cardBox.width * 0.6).toBe(true)
    await footer(page).getByRole("button", { name: "Add row" }).click()
    await expect(linkInput(newRow(page))).toBeFocused()
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in edit view in light and dark, with a new row, a struck row and errors", async ({ page }) => {
    await openWith(page)
    await section(page).getByRole("button", { name: "More actions for @ann" }).click()
    await page.getByRole("menuitem", { name: "Remove" }).click()
    await footer(page).getByRole("button", { name: "Add row" }).click()
    await linkInput(newRow(page)).fill("http://x.com")
    await saveButton(page).click()
    await expect(linkInput(newRow(page))).toHaveAttribute("aria-invalid", "true")
    await axe(page, "Social media edit")
    await expectNoHorizontalScroll(page)
  })
})
