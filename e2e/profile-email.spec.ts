import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { contactPointRow, mockContactManage, mockContacts, mockProfileDefaults, setTheme, signIn, test, type ContactAnswer } from "./fixtures"

/**
 * Story 3.5 (Team A, NG-9024): the Email read and edit views on the real `/`.
 * Every test runs under the fail-fast `test`, starts from
 * `mockProfileDefaults` and overrides the Contact Point lists
 * (`mockContacts`, the newest route wins). Desktop asserts run at 1280 px;
 * the stacked cards at 360 px.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

const emailRow = (overrides: Record<string, unknown>): Record<string, unknown> => contactPointRow({ type: "Email", phoneNumberRegion: null, ...overrides })

/** The spec's "Read" row: Email [Work 41 (unverified), Primary 42 (notifications on), Home 43]. Shown as 42, 41, 43. */
const EMAILS = [
  emailRow({ id: 41, value: "ann@work.example", label: "Work", isVerified: false }),
  emailRow({ id: 42, value: "ann@example.com", label: "Primary", isNotificationEnabled: true }),
  emailRow({ id: 43, value: "ann@home.example", label: "Home", isVerified: false }),
]

const section = (page: Page): Locator => page.getByRole("region", { name: "Email" })
const emailTable = (page: Page): Locator => section(page).getByRole("table", { name: "Email" })
const emailCards = (page: Page): Locator => section(page).getByRole("list", { name: "Email" })
const sectionMeta = (page: Page): Locator => section(page).locator('[data-slot="section-meta"]')
const toastWith = (page: Page, text: string): Locator => page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })
const newRow = (page: Page): Locator => section(page).locator('[data-state="new"]').last()
const addressInput = (row: Locator): Locator => row.getByRole("textbox", { name: "Email address" })
const labelSelect = (row: Locator): Locator => row.getByRole("combobox", { name: "Label" })
const footer = (page: Page): Locator => section(page).locator('[data-slot="section-footer"]')
const saveButton = (page: Page): Locator => footer(page).getByRole("button", { name: "Save" })
/** A row of the edit table (desktop) or its card (360 px), by its locked address. */
const savedRow = (page: Page, address: string): Locator =>
  section(page).locator("tbody tr, li[data-slot='section-table-card']").filter({ has: page.locator(`input[value="${address}"]`) })

async function openWith(page: Page, emails: ContactAnswer = EMAILS): Promise<string[]> {
  await mockProfileDefaults(page)
  const seen = await mockContacts(page, { Email: emails })
  await page.goto("/")
  return seen
}

/** No horizontal page scroll. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

async function pick(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

async function axe(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).include("#email").withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("Email read view (Story 3.5)", () => {
  test("shows Primary first, then the API order, with chips, statuses and notifications; count 3", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWith(page)
    await expect(emailTable(page).getByRole("columnheader")).toHaveText(["Email address", "Label", "Status", "Notifications", "Actions"])
    const rows = emailTable(page).locator("tbody tr")
    await expect(rows).toHaveCount(3)
    const cells = (index: number) => rows.nth(index).locator("td:not([data-slot=row-actions-cell])")
    await expect(cells(0)).toHaveText(["ann@example.com", "Primary", "Verified", "On"])
    await expect(cells(1)).toHaveText(["ann@work.example", "Work", "Not verified", "—Not applicable"])
    await expect(cells(2)).toHaveText(["ann@home.example", "Home", "", "—Not applicable"])
    await expect(rows.nth(0).locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "primary")
    await expect(rows.nth(1).locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "label")
    await expect(sectionMeta(page)).toHaveText("3")
    await expect(page.getByRole("navigation", { name: "Sections" }).locator('a[href="#email"] [data-slot="section-count"]')).toHaveText("3")
    await expect(section(page).getByRole("button", { name: "Edit", exact: true })).toBeVisible()
    await expect(section(page).getByRole("button", { name: "Add email" })).toBeVisible()
    await section(page).getByRole("button", { name: "More actions for ann@work.example" }).click()
    // Only Edit and Remove (Verify and Make primary are Story 3.6).
    await expect(page.getByRole("menuitem")).toHaveText(["Edit", "Remove"])
  })

  test("empty: one \"No emails yet · Add email\" row and count 0", async ({ page }) => {
    await openWith(page, [])
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No emails yet·Add email")
    await expect(sectionMeta(page)).toHaveCount(1)
    await expect(sectionMeta(page)).toHaveText("0")
  })

  test("a failed read shows \"Couldn't load emails\" + Retry, which revalidates only the Email key; Phone still loads", async ({ page }) => {
    await openWith(page, { status: 500, body: { message: "boom" } })
    await expect(section(page).getByText("Couldn't load emails")).toBeVisible()
    const phone = page.getByRole("region", { name: "Phone" })
    await expect(phone.locator('[data-slot="empty-state-line"]')).toHaveText("No phones yet·Add phone")
    await page.waitForLoadState("networkidle")

    const seen = await mockContacts(page, { Email: EMAILS })
    await section(page).getByRole("button", { name: "Retry" }).click()
    await expect(emailTable(page).or(emailCards(page))).toBeVisible()
    await expect(sectionMeta(page)).toHaveText("3")
    expect([...new Set(seen)]).toEqual(["Email"])
  })

  test("a 403 shows the Section's no-access row", async ({ page }) => {
    await openWith(page, { status: 403, body: { message: "Forbidden" } })
    await expect(section(page).getByText("You don't have access to this in your current account")).toBeVisible()
    await expect(section(page).getByRole("button", { name: "Retry" })).toHaveCount(0)
  })

  test("at 360 px: stacked cards (address and status, then label and notifications), no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page, [...EMAILS, emailRow({ id: 44, value: "a.very.long.address.that.must.wrap.inside.its.card@subdomain.example-hospital.org", label: "Work" })])
    await expect(emailTable(page)).toHaveCount(0)
    const cards = emailCards(page).getByRole("listitem")
    await expect(cards).toHaveCount(4)
    const first = cards.first()
    await expect(first.locator('[data-column="address"]')).toContainText("ann@example.com")
    await expect(first.locator('[data-column="status"]')).toContainText("Verified")
    await expect(first.locator('[data-column="label"]')).toContainText("Primary")
    await expect(first.locator('[data-column="notifications"]')).toContainText("On")
    const addressBox = await first.locator('[data-column="address"]').boundingBox()
    const labelBox = await first.locator('[data-column="label"]').boundingBox()
    expect(addressBox && labelBox && labelBox.y > addressBox.y).toBe(true)
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in light and dark, loaded and empty", async ({ page }) => {
    await openWith(page)
    await expect(emailTable(page).or(emailCards(page))).toBeVisible()
    await axe(page, "Email")
    await expectNoHorizontalScroll(page)

    await mockContacts(page, {})
    await page.reload()
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No emails yet·Add email")
    await axe(page, "Email empty")
  })
})

test.describe("Email edit (Story 3.5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("Add email → save → read: one POST with the trimmed address, the Email list and myself refetched, toast, h2 focused", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Add email" }).click()
    const row = newRow(page)
    await expect(addressInput(row)).toBeFocused()
    await expect(addressInput(row)).toHaveAttribute("type", "email")
    await expect(row.getByText("New · not saved")).toBeVisible()
    await addressInput(row).fill(" Ann@Personal.example ")
    await pick(page, labelSelect(row), "Personal")
    await expect(footer(page).getByText("Unsaved changes")).toBeVisible()

    const added = emailRow({ id: 44, value: "Ann@Personal.example", label: "Personal", isVerified: false })
    await mockContacts(page, { Email: [...EMAILS, added] })
    const calls: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith("/api/1h/")) calls.push(`${request.method()} ${url.pathname.slice("/api/1h/".length)}${url.search}`)
    })
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([
      {
        contactPointsToAdd: [{ value: "Ann@Personal.example", type: "Email", label: "Personal", isNotificationEnabled: false }],
        contactPointsToUpdate: [],
        contactPointsToRemove: [],
      },
    ])
    await expect(toastWith(page, "Email saved.")).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "Email" })).toBeFocused()
    await expect(emailTable(page).locator("tbody tr")).toHaveCount(4)
    await expect(emailTable(page).locator("tbody tr").nth(3).getByRole("cell").first()).toHaveText("Ann@Personal.example")
    await expect(sectionMeta(page)).toHaveText("4")
    const post = calls.indexOf("POST v2/health/contact-point")
    expect(post).toBeGreaterThanOrEqual(0)
    const after = calls.slice(post + 1)
    for (const read of ["GET v2/user/contact-point/list?type=Email", "GET v2/user/myself"]) expect(after, read).toContain(read)
    // No verification call in this story (Story 3.6).
    expect(after.filter((call) => call.includes("verify"))).toEqual([])
  })

  test("relabel and remove: Work → Main and Home struck through go in one POST", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    const primary = savedRow(page, "ann@example.com")
    await expect(primary.getByText("Locked. This is the address you sign in with.")).toBeVisible()
    await expect(primary.getByRole("combobox", { name: "Label" })).toHaveCount(0)
    const work = savedRow(page, "ann@work.example")
    await expect(work.getByText("Saved addresses can't be changed. Remove it and add a new one.")).toBeVisible()
    await pick(page, labelSelect(work), "Main")
    const home = savedRow(page, "ann@home.example")
    await home.getByRole("button", { name: "Remove" }).click()
    await expect(home).toHaveAttribute("data-state", "removed")
    await expect(home.getByText("Removed on save")).toBeVisible()
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([
      { contactPointsToAdd: [], contactPointsToUpdate: [{ id: 41, type: "Email", label: "Main", isNotificationEnabled: false }], contactPointsToRemove: [43] },
    ])
  })

  test("the kebab's Remove strikes the row through with Restore focused", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "More actions for ann@work.example" }).click()
    await page.getByRole("menuitem", { name: "Remove" }).click()
    const work = savedRow(page, "ann@work.example")
    await expect(work).toHaveAttribute("data-state", "removed")
    await expect(work.getByRole("button", { name: "Restore" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(work).toHaveAttribute("data-state", "saved")
    expect(posts()).toEqual([])
  })

  test("the last email and the Primary can't be removed: aria-disabled with the reason", async ({ page }) => {
    await openWith(page, [emailRow({ id: 5, value: "only@example.com", label: "Work" })])
    await section(page).getByRole("button", { name: "More actions for only@example.com" }).click()
    const item = page.getByRole("menuitem", { name: /Remove/ })
    await expect(item).toHaveAttribute("aria-disabled", "true")
    await expect(item).toContainText("You need at least one email")
    await page.keyboard.press("Escape")
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    // Edit focuses the first Label: wait for it, so that focus doesn't land after (and close) the Tooltip below.
    await expect(labelSelect(savedRow(page, "only@example.com"))).toBeFocused()
    const remove = section(page).getByRole("button", { name: "Remove" })
    await expect(remove).toHaveAttribute("aria-disabled", "true")
    // Radix closes a tooltip when its trigger's scroller scrolls, so bring it into view before focusing it.
    await remove.scrollIntoViewIfNeeded()
    await remove.focus()
    await expect(page.getByRole("tooltip")).toContainText("You need at least one email")
    await page.keyboard.press("Enter")
    await expect(section(page).locator('[data-state="removed"]')).toHaveCount(0)
    await footer(page).getByRole("button", { name: "Cancel" }).click()

    await mockContacts(page, { Email: EMAILS })
    await page.reload()
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    await expect(labelSelect(savedRow(page, "ann@work.example"))).toBeFocused()
    const primaryRemove = savedRow(page, "ann@example.com").getByRole("button", { name: "Remove" })
    await expect(primaryRemove).toHaveAttribute("aria-disabled", "true")
    await primaryRemove.scrollIntoViewIfNeeded()
    await primaryRemove.focus()
    await expect(page.getByRole("tooltip")).toContainText("Make another email primary first")
  })

  test("invalid: \"ann@\" shows its error on blur; a duplicate of a struck address and an empty label too; Save sends nothing", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Add email" }).click()
    const row = newRow(page)
    await addressInput(row).fill("ann@")
    await addressInput(row).blur()
    await expect(row.getByText("Enter a valid email address")).toBeVisible()
    await expect(addressInput(row)).toHaveAttribute("aria-invalid", "true")
    await saveButton(page).click()
    await expect(row.locator('[data-slot="field-error"]')).toHaveText(["Enter a valid email address", "Choose a label"])
    await expect(addressInput(row)).toBeFocused()

    await savedRow(page, "ann@work.example").getByRole("button", { name: "Remove" }).click()
    await addressInput(row).fill("ANN@work.example")
    await pick(page, labelSelect(row), "Work")
    await saveButton(page).click()
    await expect(row.locator('[data-slot="field-error"]')).toHaveText(["This email is already on your profile"])
    await expect(addressInput(row)).toBeFocused()
    expect(posts()).toEqual([])
  })

  test("a 400 \"… is not a valid email.\" and a duplicate 400 show at the new address; stays in edit", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page, { status: 400, body: { message: "new@example.com is not a valid email.", code: 400 } })
    await section(page).getByRole("button", { name: "Add email" }).click()
    const row = newRow(page)
    await addressInput(row).fill("new@example.com")
    await pick(page, labelSelect(row), "Work")
    await saveButton(page).click()
    await expect(row.getByText("Enter a valid email address")).toBeVisible()
    await expect(addressInput(row)).toBeFocused()

    // The newer route wins: the second save reaches only this recorder.
    const duplicatePosts = await mockContactManage(page, {
      status: 400,
      body: { message: "Operation failed. Person with id '42' already has contact point with value 'new@example.com'.", code: 400 },
    })
    await saveButton(page).click()
    await expect(row.getByText("This email is already on your profile")).toBeVisible()
    await expect(saveButton(page)).toBeVisible()
    expect(posts()).toHaveLength(1)
    expect(duplicatePosts()).toHaveLength(1)
  })

  test("limit: with 20 saved, Add email and Add row are aria-disabled with the limit; Edit still works", async ({ page }) => {
    const twenty = Array.from({ length: 20 }, (_, index) => emailRow({ id: 100 + index, value: `user${100 + index}@example.com`, label: "Work" }))
    await openWith(page, twenty)
    const add = section(page).getByRole("button", { name: "Add email" })
    await expect(add).toHaveAttribute("aria-disabled", "true")
    await expect(add).toHaveAccessibleDescription("You've reached the limit of 20 emails")
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    const addRow = footer(page).getByRole("button", { name: "Add row" })
    await expect(addRow).toHaveAttribute("aria-disabled", "true")
    await expect(addRow).toHaveAccessibleDescription("You've reached the limit of 20 emails")
    await addRow.focus()
    await page.keyboard.press("Enter")
    await expect(section(page).locator('[data-state="new"]')).toHaveCount(0)
  })

  test("at 360 px: the edit card stacks its controls full width, every control at least 44 px, no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page)
    await section(page).getByRole("button", { name: "Add email" }).click()
    const card = newRow(page)
    await expect(emailTable(page)).toHaveCount(0)
    const cardBox = await card.boundingBox()
    for (const control of [addressInput(card), labelSelect(card), card.getByRole("button", { name: "Remove" })]) {
      const box = await control.boundingBox()
      expect(box && box.height >= 44).toBe(true)
    }
    const labelBox = await labelSelect(card).boundingBox()
    expect(labelBox && cardBox && labelBox.width > cardBox.width * 0.6).toBe(true)
    const addressBox = await addressInput(card).boundingBox()
    expect(addressBox && labelBox && labelBox.y > addressBox.y).toBe(true)
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in edit view in light and dark, with a new row, a struck row and errors", async ({ page }) => {
    await openWith(page)
    await section(page).getByRole("button", { name: "More actions for ann@work.example" }).click()
    await page.getByRole("menuitem", { name: "Remove" }).click()
    await footer(page).getByRole("button", { name: "Add row" }).click()
    await addressInput(newRow(page)).fill("ann@")
    await saveButton(page).click()
    await expect(addressInput(newRow(page))).toHaveAttribute("aria-invalid", "true")
    await axe(page, "Email edit")
    await expectNoHorizontalScroll(page)
  })
})
