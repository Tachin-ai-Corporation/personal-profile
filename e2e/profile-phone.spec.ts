import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { CONTACT_PHONES, contactPointRow, mockContactManage, mockContacts, mockContactVerify, mockProfileDefaults, setTheme, signIn, test } from "./fixtures"

/**
 * Stories 3.1–3.4 (Team A, NG-9023): the Phone read and edit views, verify and Make primary on the real `/`. Every
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
    await expect(phoneTable(page).getByRole("columnheader")).toHaveText(["Number", "Label", "Type", "Status", "Notifications", "Actions"])
    const rows = phoneTable(page).locator("tbody tr")
    await expect(rows).toHaveCount(3)
    // The value cells (the last cell holds the row's kebab).
    const cells = (index: number) => rows.nth(index).locator("td:not([data-slot=row-actions-cell])")
    await expect(cells(0)).toHaveText(["🇺🇸+1 (415) 551-2125", "Primary", "Mobile", "Verified", "On"])
    await expect(cells(1)).toHaveText(["🇺🇸+1 (415) 555-0111", "Work", "Mobile", "Not verified", "—Not applicable"])
    await expect(cells(2)).toHaveText(["🇬🇧+44 20 7183 8750", "Home", "Landline", "", "—Not applicable"])
    await expect(rows.nth(0).locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "primary")
    await expect(rows.nth(1).locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "label")
    // The flag is decoration: the number's accessible text is the formatted number alone.
    await expect(rows.nth(0).getByText("🇺🇸")).toHaveAttribute("aria-hidden", "true")
    await expect(sectionMeta(page)).toHaveText("3")
    await expect(page.getByRole("navigation", { name: "Sections" }).locator('a[href="#phone"] [data-slot="section-count"]')).toHaveText("3")
    // Story 3.2: the header's Edit and Add phone, and one kebab per row.
    await expect(section(page).getByRole("button", { name: "Edit", exact: true })).toBeVisible()
    await expect(section(page).getByRole("button", { name: "Add phone" })).toBeVisible()
    await expect(section(page).getByRole("button", { name: /^More actions for / })).toHaveCount(3)
  })

  test("shows Off on a Primary with notifications off", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWith(page, { Mobile: [contactPointRow({ id: 12, label: "Primary", isNotificationEnabled: false })] })
    await expect(phoneTable(page).locator("tbody tr").first().getByRole("cell").nth(4)).toHaveText("Off")
  })

  test("empty: one \"No phones yet · Add phone\" row and count 0", async ({ page }) => {
    await openWith(page, {})
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No phones yet·Add phone")
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
    await expect(section(page).locator('[data-slot="empty-state-line"]')).toHaveText("No phones yet·Add phone")
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#phone").withTags(WCAG).analyze()
      expect(results.violations, `Phone empty (${theme})`).toEqual([])
    }
  })
})

// --- Story 3.2: add, relabel and remove phones -------------------------------------------------

const toastWith = (page: Page, text: string): Locator => page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })
const newRow = (page: Page): Locator => section(page).locator('[data-state="new"]').last()
const numberInput = (row: Locator): Locator => row.getByRole("textbox", { name: "Number" })
const labelSelect = (row: Locator): Locator => row.getByRole("combobox", { name: "Label" })
const typeSelect = (row: Locator): Locator => row.getByRole("combobox", { name: "Type" })
const footer = (page: Page): Locator => section(page).locator('[data-slot="section-footer"]')
const saveButton = (page: Page): Locator => footer(page).getByRole("button", { name: "Save" })
/** A row of the edit table (desktop) or its card (360 px), by its locked number. */
const savedRow = (page: Page, number: string): Locator =>
  section(page).locator("tbody tr, li[data-slot='section-table-card']").filter({ has: page.locator(`input[value="${number}"]`) })

async function pick(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

/** The new phone of the "Add US" row, as the list answers it after the save. */
const ADDED = contactPointRow({ id: 13, value: "+14155550101", label: "Personal", isVerified: false })

test.describe("Phone edit (Story 3.2)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("Add phone → save → read: one POST with the DTO, the lists refetched, toast, h2 focused", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    // Story 3.3: the refetch shows the new unverified Mobile, which the save then verifies.
    const verifies = await mockContactVerify(page)
    await section(page).getByRole("button", { name: "Add phone" }).click()
    const row = newRow(page)
    await expect(numberInput(row)).toBeFocused()
    await expect(row.getByText("New · not saved")).toBeVisible()
    await expect(row.getByText("Include the area code. Mobile numbers get a verification link by text after you save.")).toBeVisible()
    await numberInput(row).fill("4155550101")
    await pick(page, labelSelect(row), "Personal")
    await pick(page, typeSelect(row), "Mobile")
    await expect(footer(page).getByText("Unsaved changes")).toBeVisible()

    await mockContacts(page, { ...CONTACT_PHONES, Mobile: [...CONTACT_PHONES.Mobile, ADDED] })
    // Every data call from here on, in order: the reads that follow the POST are its refetch.
    const calls: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith("/api/1h/")) calls.push(`${request.method()} ${url.pathname.slice("/api/1h/".length)}${url.search}`)
    })
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([
      {
        contactPointsToAdd: [{ value: "+14155550101", type: "Mobile", label: "Personal", isNotificationEnabled: false, phoneNumberRegion: "us" }],
        contactPointsToUpdate: [],
        contactPointsToRemove: [],
      },
    ])
    await expect(toastWith(page, "Phone saved.")).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "Phone" })).toBeFocused()
    await expect(phoneTable(page).locator("tbody tr")).toHaveCount(4)
    await expect(phoneTable(page).locator("tbody tr").nth(2).getByRole("cell").first()).toHaveText("🇺🇸+1 (415) 555-0101")
    await expect(sectionMeta(page)).toHaveText("4")
    const post = calls.indexOf("POST v2/health/contact-point")
    expect(post).toBeGreaterThanOrEqual(0)
    const after = calls.slice(post + 1)
    for (const read of ["GET v2/user/contact-point/list?type=Mobile", "GET v2/user/contact-point/list?type=Landline", "GET v2/user/myself"]) expect(after, read).toContain(read)
    expect(verifies()).toEqual([{ contactPointIds: [13] }])
  })

  test("relabel: Home → Work sends one update", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    const home = savedRow(page, "+44 20 7183 8750")
    await expect(home.locator('[data-slot="input-locked"] input')).toHaveCount(2)
    await expect(home.getByText("Saved numbers can't be changed. Remove it and add a new one.").first()).toBeVisible()
    await pick(page, labelSelect(home), "Work")
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 21, type: "Landline", label: "Work", isNotificationEnabled: false }], contactPointsToRemove: [] }])
  })

  test("remove and restore: the kebab's Remove strikes the row through with Restore focused; Save sends the removal", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "More actions for +1 (415) 555-0111" }).click()
    await page.getByRole("menuitem", { name: "Remove" }).click()
    const work = savedRow(page, "+1 (415) 555-0111")
    await expect(work).toHaveAttribute("data-state", "removed")
    await expect(work.getByText("Removed on save")).toBeVisible()
    await expect(work.getByRole("button", { name: "Restore" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(work).toHaveAttribute("data-state", "saved")
    await expect(work.getByRole("button", { name: "Remove" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(work).toHaveAttribute("data-state", "removed")
    expect(posts()).toEqual([])
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [], contactPointsToRemove: [11] }])
  })

  test("the last phone and the Primary can't be removed: aria-disabled with the reason", async ({ page }) => {
    await openWith(page, { Mobile: [contactPointRow({ id: 5, value: "+14155550105", label: "Work" })] })
    await section(page).getByRole("button", { name: "More actions for +1 (415) 555-0105" }).click()
    const item = page.getByRole("menuitem", { name: /Remove/ })
    await expect(item).toHaveAttribute("aria-disabled", "true")
    await expect(item).toContainText("You need at least one phone")
    await page.keyboard.press("Escape")
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    const remove = section(page).getByRole("button", { name: "Remove" })
    await expect(remove).toHaveAttribute("aria-disabled", "true")
    await remove.focus()
    await expect(page.getByRole("tooltip")).toContainText("You need at least one phone")
    // Activation is a no-op.
    await page.keyboard.press("Enter")
    await expect(section(page).locator('[data-state="removed"]')).toHaveCount(0)
    await footer(page).getByRole("button", { name: "Cancel" }).click()

    await mockContacts(page, CONTACT_PHONES)
    await page.reload()
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    const primaryRemove = savedRow(page, "+1 (415) 551-2125").getByRole("button", { name: "Remove" })
    await expect(primaryRemove).toHaveAttribute("aria-disabled", "true")
    await primaryRemove.focus()
    await expect(page.getByRole("tooltip")).toContainText("Make another phone primary first")
  })

  test("invalid: a short US number shows its error on blur; Save sends nothing and focuses it", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Add phone" }).click()
    const row = newRow(page)
    await numberInput(row).fill("41555")
    await numberInput(row).blur()
    await expect(row.getByText("Enter a 10-digit US number")).toBeVisible()
    await expect(numberInput(row)).toHaveAttribute("aria-invalid", "true")
    await saveButton(page).click()
    await expect(row.locator('[data-slot="field-error"]')).toHaveText(["Enter a 10-digit US number", "Choose a label", "Choose Mobile or Landline"])
    await expect(numberInput(row)).toBeFocused()
    expect(posts()).toEqual([])
  })

  test("a duplicate 400 shows \"This number is already on your profile\" at the new number; stays in edit", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page, {
      status: 400,
      body: { message: "Operation failed. Person with id '42' already has contact point with value '+14155550101'.", code: 400 },
    })
    await section(page).getByRole("button", { name: "Add phone" }).click()
    const row = newRow(page)
    await numberInput(row).fill("4155550101")
    await pick(page, labelSelect(row), "Work")
    await pick(page, typeSelect(row), "Mobile")
    await saveButton(page).click()
    await expect(row.getByText("This number is already on your profile")).toBeVisible()
    await expect(numberInput(row)).toBeFocused()
    await expect(saveButton(page)).toBeVisible()
    expect(posts()).toHaveLength(1)
  })

  test("at 360 px: each card stacks its inputs full width in place, every control at least 44 px, no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page)
    await section(page).getByRole("button", { name: "Add phone" }).click()
    const card = newRow(page)
    await expect(phoneTable(page)).toHaveCount(0)
    const cardBox = await card.boundingBox()
    for (const control of [numberInput(card), labelSelect(card), typeSelect(card), card.getByRole("button", { name: "Remove" })]) {
      const box = await control.boundingBox()
      expect(box && box.height >= 44).toBe(true)
    }
    for (const control of [labelSelect(card), typeSelect(card)]) {
      const box = await control.boundingBox()
      // Full width of the card's body (the Remove action sits beside it).
      expect(box && cardBox && box.width > cardBox.width * 0.6).toBe(true)
    }
    const numberBox = await numberInput(card).boundingBox()
    const labelBox = await labelSelect(card).boundingBox()
    expect(numberBox && labelBox && labelBox.y > numberBox.y).toBe(true)
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in edit view in light and dark, with a new row, a struck row and errors", async ({ page }) => {
    await openWith(page)
    await section(page).getByRole("button", { name: "More actions for +1 (415) 555-0111" }).click()
    await page.getByRole("menuitem", { name: "Remove" }).click()
    await footer(page).getByRole("button", { name: "Add row" }).click()
    await numberInput(newRow(page)).fill("415")
    await saveButton(page).click()
    await expect(numberInput(newRow(page))).toHaveAttribute("aria-invalid", "true")
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#phone").withTags(WCAG).analyze()
      expect(results.violations, `Phone edit (${theme})`).toEqual([])
    }
    await expectNoHorizontalScroll(page)
  })
})

// --- Story 3.3: verify phones -------------------------------------------------------------------

const readRow = (page: Page, number: string): Locator => section(page).locator("tbody tr, li[data-slot='section-table-card']").filter({ hasText: number })
const liveStatus = (page: Page): Locator => section(page).locator('[data-slot="live-status"]')

test.describe("Phone verify (Story 3.3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("add → save → auto-verify: the verify follows the POST; the new row counts down (pending); \"Link sent\" announced", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    const verifies = await mockContactVerify(page)
    await section(page).getByRole("button", { name: "Add phone" }).click()
    const row = newRow(page)
    await numberInput(row).fill("4155550101")
    await pick(page, labelSelect(row), "Personal")
    await pick(page, typeSelect(row), "Mobile")
    await mockContacts(page, { ...CONTACT_PHONES, Mobile: [...CONTACT_PHONES.Mobile, ADDED] })
    const writes: string[] = []
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/1h/v2/health/contact-point")) writes.push(new URL(request.url()).pathname)
    })
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    await expect(toastWith(page, "Phone saved.")).toBeVisible()
    expect(posts()).toHaveLength(1)
    await expect.poll(() => verifies()).toEqual([{ contactPointIds: [13] }])
    expect(writes).toEqual(["/api/1h/v2/health/contact-point", "/api/1h/v2/health/contact-point/verify"])
    const added = readRow(page, "+1 (415) 555-0101")
    await expect(added.locator('[data-slot="status-badge"]')).toHaveAttribute("data-status", "pending")
    await expect(added.locator('[data-slot="status-badge"]')).toHaveText(/^Link sent · Resend in (60|59|58) s$/)
    await expect(liveStatus(page)).toHaveText("Link sent")
    // The countdown runs.
    await expect(added.locator('[data-slot="status-badge"]')).toHaveText(/^Link sent · Resend in 5\d s$/)
  })

  test("manual Verify: sends [11] at once with no edit mode; the countdown; the kebab item is aria-disabled with it", async ({ page }) => {
    await openWith(page)
    const verifies = await mockContactVerify(page)
    const work = readRow(page, "+1 (415) 555-0111")
    // Only the unverified Work Mobile offers Verify (the Primary is verified, the Home Landline has no status).
    await expect(section(page).getByRole("button", { name: "Verify", exact: true })).toHaveCount(1)
    await work.hover()
    await work.getByRole("button", { name: "Verify", exact: true }).click()
    await expect.poll(() => verifies()).toEqual([{ contactPointIds: [11] }])
    await expect(footer(page)).toHaveCount(0)
    await expect(work.locator('[data-slot="status-badge"]')).toHaveText(/^Link sent · Resend in (60|59) s$/)
    await expect(liveStatus(page)).toHaveText("Link sent")
    await section(page).getByRole("button", { name: "More actions for +1 (415) 555-0111" }).click()
    const item = page.getByRole("menuitem", { name: /Resend verification/ })
    await expect(item).toHaveAttribute("aria-disabled", "true")
    await expect(item).toContainText(/Link sent · Resend in \d+ s/)
    // Activation during the countdown does nothing (the menu stays open).
    await item.focus()
    await page.keyboard.press("Enter")
    await expect(item).toBeVisible()
    await page.keyboard.press("Escape")
    expect(verifies()).toHaveLength(1)
  })

  test("send error: the listed id reads \"Couldn't send the link\" with Resend verification available at once", async ({ page }) => {
    await openWith(page)
    const verifies = await mockContactVerify(page, { body: { success: false, contactPointIdsWithSendError: [11] } })
    const work = readRow(page, "+1 (415) 555-0111")
    await work.hover()
    await work.getByRole("button", { name: "Verify", exact: true }).click()
    await expect(work.getByText("Couldn't send the link")).toBeVisible()
    await expect(work.locator('[data-slot="status-badge"]')).toHaveText("Not verified")
    await work.hover()
    const resend = work.getByRole("button", { name: "Resend verification" })
    await expect(resend).not.toHaveAttribute("aria-disabled", "true")
    await resend.click()
    await expect.poll(() => verifies()).toHaveLength(2)
  })

  test("at 360 px: the card shows the countdown; Verify is in the kebab; no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page)
    const verifies = await mockContactVerify(page)
    await section(page).getByRole("button", { name: "More actions for +1 (415) 555-0111" }).click()
    await page.getByRole("menuitem", { name: "Verify", exact: true }).click()
    await expect.poll(() => verifies()).toEqual([{ contactPointIds: [11] }])
    const card = readRow(page, "+1 (415) 555-0111")
    await expect(card.locator('[data-column="status"] [data-slot="status-badge"]')).toHaveText(/^Link sent · Resend in \d+ s$/)
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in light and dark with a countdown and a send error", async ({ page }) => {
    await openWith(page, {
      ...CONTACT_PHONES,
      Mobile: [...CONTACT_PHONES.Mobile, contactPointRow({ id: 14, value: "+14155550114", label: "Personal", isVerified: false })],
    })
    await mockContactVerify(page, (request) => {
      const { contactPointIds } = request.postDataJSON() as { contactPointIds: number[] }
      return { body: { success: !contactPointIds.includes(14), contactPointIdsWithSendError: contactPointIds.filter((id) => id === 14) } }
    })
    for (const number of ["+1 (415) 555-0111", "+1 (415) 555-0114"]) {
      const row = readRow(page, number)
      await row.hover()
      await row.getByRole("button", { name: "Verify", exact: true }).click()
    }
    await expect(readRow(page, "+1 (415) 555-0111").locator('[data-slot="status-badge"]')).toHaveText(/^Link sent/)
    await expect(readRow(page, "+1 (415) 555-0114").getByText("Couldn't send the link")).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#phone").withTags(WCAG).analyze()
      expect(results.violations, `Phone verify (${theme})`).toEqual([])
    }
  })
})

// --- Story 3.4: make a phone primary and manage notifications --------------------------------------

/** Mobile [Work 11 (unverified), Primary 12, Verified Personal 13, unverified Home 14], Landline [Home 21]. */
const PRIMARY_PHONES = {
  Mobile: [
    ...CONTACT_PHONES.Mobile,
    contactPointRow({ id: 13, value: "+14155550113", label: "Personal" }),
    contactPointRow({ id: 14, value: "+14155550114", label: "Home", isVerified: false }),
  ],
  Landline: CONTACT_PHONES.Landline,
}
/** After Make primary on 13: 13 Primary with notifications on, 12 Old. */
const SWITCHED_PHONES = {
  Mobile: [
    CONTACT_PHONES.Mobile[0],
    { ...CONTACT_PHONES.Mobile[1], label: "Old" },
    contactPointRow({ id: 13, value: "+14155550113", label: "Primary", isNotificationEnabled: true }),
    PRIMARY_PHONES.Mobile[3],
  ],
  Landline: CONTACT_PHONES.Landline,
}
const confirmDialog = (page: Page): Locator => page.getByRole("alertdialog")
const header = (page: Page): Locator => page.locator("div:has(> h1)")

test.describe("Phone Make primary and notifications (Story 3.4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("Make primary → confirm → one POST; 13 first with Primary and On, 12 Old; toast; h2 focused; the header shows the new number", async ({ page }) => {
    await openWith(page, PRIMARY_PHONES)
    await expect(section(page).getByText("Changing your primary phone changes how you sign in.")).toBeVisible()
    await expect(header(page).getByText("+1 (415) 551-2125")).toBeVisible()
    const posts = await mockContactManage(page)
    const row = readRow(page, "+1 (415) 555-0113")
    await row.hover()
    await row.getByRole("button", { name: "Make primary" }).click()
    const dialog = confirmDialog(page)
    await expect(dialog.getByRole("heading", { name: "This changes how you sign in" })).toBeVisible()
    await expect(dialog).toContainText("+1 (415) 555-0113 becomes your primary phone and sign-in number. Your current primary is relabeled Old.")
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused()
    await mockContacts(page, SWITCHED_PHONES)
    await dialog.getByRole("button", { name: "Make primary" }).click()
    await expect(dialog).toHaveCount(0)
    expect(posts()).toEqual([
      {
        contactPointsToAdd: [],
        contactPointsToUpdate: [
          { id: 13, type: "Mobile", label: "Primary", isNotificationEnabled: true },
          { id: 12, type: "Mobile", label: "Old", isNotificationEnabled: true },
        ],
        contactPointsToRemove: [],
      },
    ])
    await expect(toastWith(page, "Phone saved.")).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "Phone" })).toBeFocused()
    const first = phoneTable(page).locator("tbody tr").first()
    await expect(first.getByRole("cell").first()).toHaveText("🇺🇸+1 (415) 555-0113")
    await expect(first.locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "primary")
    await expect(first.getByRole("cell").nth(4)).toHaveText("On")
    await expect(readRow(page, "+1 (415) 551-2125").locator('[data-slot="chip"]')).toHaveText("Old")
    await expect(header(page).getByText("+1 (415) 555-0113")).toBeVisible()
  })

  test("Cancel and Escape send nothing and return focus to the trigger", async ({ page }) => {
    await openWith(page, PRIMARY_PHONES)
    const posts = await mockContactManage(page)
    const row = readRow(page, "+1 (415) 555-0113")
    await row.hover()
    const trigger = row.getByRole("button", { name: "Make primary" })
    await trigger.click()
    await confirmDialog(page).getByRole("button", { name: "Cancel" }).click()
    await expect(confirmDialog(page)).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(confirmDialog(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(confirmDialog(page)).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(posts()).toEqual([])
  })

  test("disabled reasons: Landline, unverified Mobile (Verify beside it) and unverified Home Mobile", async ({ page }) => {
    await openWith(page, PRIMARY_PHONES)
    const cases: [string, string][] = [
      ["+44 20 7183 8750", "Landlines can't be primary"],
      ["+1 (415) 555-0111", "Verify this number first"],
      ["+1 (415) 555-0114", "Change the label from Home, then verify this number"],
    ]
    for (const [number, reason] of cases) {
      const action = readRow(page, number).getByRole("button", { name: "Make primary" })
      await expect(action).toHaveAttribute("aria-disabled", "true")
      // The reason is the action's description (its Tooltip's text); activation is a no-op.
      await expect(action).toHaveAccessibleDescription(reason)
      await action.focus()
      await page.keyboard.press("Enter")
      await expect(confirmDialog(page)).toHaveCount(0)
    }
    // The Tooltip shows the reason on focus.
    await readRow(page, "+1 (415) 555-0111").getByRole("button", { name: "Make primary" }).focus()
    await expect(page.getByRole("tooltip", { name: "Verify this number first" })).toBeVisible()
    await expect(readRow(page, "+1 (415) 555-0111").getByRole("button", { name: "Verify", exact: true })).toHaveCount(1)
    // The Primary row offers no Make primary.
    await expect(readRow(page, "+1 (415) 551-2125").getByRole("button", { name: "Make primary" })).toHaveCount(0)
  })

  test("notifications: in edit view only the Primary has a switch; off → Save sends only that row; read view shows Off", async ({ page }) => {
    await openWith(page, PRIMARY_PHONES)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    await expect(section(page).getByRole("switch")).toHaveCount(1)
    const toggle = section(page).getByRole("switch", { name: "Notifications for +1 (415) 551-2125" })
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await expect(section(page).getByText("Changing your primary phone changes how you sign in.")).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(footer(page).getByText("Unsaved changes")).toBeVisible()
    await mockContacts(page, { ...PRIMARY_PHONES, Mobile: PRIMARY_PHONES.Mobile.map((row) => (row.id === 12 ? { ...row, isNotificationEnabled: false } : row)) })
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 12, type: "Mobile", label: "Primary", isNotificationEnabled: false }], contactPointsToRemove: [] }])
    await expect(phoneTable(page).locator("tbody tr").first().getByRole("cell").nth(4)).toHaveText("Off")
  })

  test("at 360 px: Make primary from the kebab; the confirm fits with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page, PRIMARY_PHONES)
    await section(page).getByRole("button", { name: "More actions for +1 (415) 555-0113" }).click()
    await page.getByRole("menuitem", { name: "Make primary" }).click()
    const dialog = confirmDialog(page)
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box && box.x >= 16 && box.x + box.width <= 360 - 16).toBe(true)
    await expectNoHorizontalScroll(page)
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(section(page).getByRole("button", { name: "More actions for +1 (415) 555-0113" })).toBeFocused()
    await expect(section(page).getByText("Changing your primary phone changes how you sign in.")).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in light and dark with the confirm open and in edit view with the switch", async ({ page }) => {
    await openWith(page, PRIMARY_PHONES)
    const row = readRow(page, "+1 (415) 555-0113")
    await row.hover()
    await row.getByRole("button", { name: "Make primary" }).click()
    await expect(confirmDialog(page)).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
      expect(results.violations, `Make primary confirm (${theme})`).toEqual([])
    }
    await confirmDialog(page).getByRole("button", { name: "Cancel" }).click()
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#phone").withTags(WCAG).analyze()
      expect(results.violations, `Phone edit with the switch (${theme})`).toEqual([])
    }
  })
})

test("restoring a stale phone draft preserves the principal changed in another session", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openWith(page, PRIMARY_PHONES)
  const posts = await mockContactManage(page)
  await section(page).getByRole("button", { name: "Edit", exact: true }).click()
  const row = section(page).locator("tbody tr").filter({ has: page.locator('input[value="+1 (415) 555-0113"]') })
  await pick(page, row.getByRole("combobox", { name: "Label", exact: true }), "Work")
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pp:draft:v1:demo:42:phone"))).not.toBeNull()
  await mockContacts(page, SWITCHED_PHONES)
  await page.reload()
  await section(page).getByRole("button", { name: /^(Restore|Keep mine)$/ }).click()
  const keepMine = section(page).getByRole("button", { name: "Keep mine", exact: true })
  if (await keepMine.count()) await keepMine.click()
  await section(page).getByRole("button", { name: "Save", exact: true }).click()
  await expect(section(page).getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  expect(posts()).toEqual([])
  await expect(readRow(page, "+1 (415) 555-0113").getByText("Primary", { exact: true })).toBeVisible()
})
