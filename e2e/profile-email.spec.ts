import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { contactPointRow, mockContactManage, mockContacts, mockContactVerify, mockProfileDefaults, setTheme, signIn, test, type ContactAnswer } from "./fixtures"

/**
 * Stories 3.5–3.6 (Team A, NG-9024): the Email read and edit views, verify, Make primary and notifications on the real `/`.
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
const newRow = (page: Page): Locator => section(page).locator('[data-state="new"]').first() // the latest added: new rows go on top (1health-fe parity)
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
    // Story 3.6: Verify and Make primary (aria-disabled with its reason) before Edit and Remove.
    await expect(page.getByRole("menuitem")).toHaveText(["Verify", "Make primaryVerify this email first", "Edit", "Remove"])
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
    const verifies = await mockContactVerify(page)
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
    // Story 3.6: the new unverified address gets its link after the refetch.
    await expect.poll(() => verifies()).toEqual([{ contactPointIds: [44] }])
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

  test("provider typos: gmail.cnn and gmail.cdm read \"Did you mean test@gmail.com?\", linked to the address; an unknown domain saves", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Add email" }).click()
    const row = newRow(page)
    await pick(page, labelSelect(row), "Work")
    for (const value of ["test@gmail.cnn", "test@gmail.cdm"]) {
      await addressInput(row).fill(value)
      await addressInput(row).blur()
      await expect(row.locator('[data-slot="field-error"]')).toHaveText("Did you mean test@gmail.com?")
      await expect(addressInput(row)).toHaveAttribute("aria-invalid", "true")
      const describedBy = (await addressInput(row).getAttribute("aria-describedby")) ?? ""
      const descriptions = await Promise.all(describedBy.split(" ").filter(Boolean).map((id) => page.locator(`[id="${id}"]`).textContent()))
      expect(descriptions).toContain("Did you mean test@gmail.com?")
      await saveButton(page).click()
      await expect(addressInput(row)).toBeFocused()
    }
    expect(posts()).toEqual([])

    await addressInput(row).fill("name@mycompany.health")
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([{ contactPointsToAdd: [{ value: "name@mycompany.health", type: "Email", label: "Work", isNotificationEnabled: false }], contactPointsToUpdate: [], contactPointsToRemove: [] }])
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

// --- Story 3.6: verify emails, make an email primary and manage notifications ----------------------

const readRow = (page: Page, address: string): Locator => section(page).locator("tbody tr, li[data-slot='section-table-card']").filter({ hasText: address })
const liveStatus = (page: Page): Locator => section(page).locator('[data-slot="live-status"]')
const confirmDialog = (page: Page): Locator => page.getByRole("alertdialog")
const header = (page: Page): Locator => page.locator("div:has(> h1)")

/** EMAILS plus a Verified Personal 44: [Work 41 (unverified), Primary 42, Home 43 (unverified), Personal 44]. */
const PRIMARY_EMAILS = [...EMAILS, emailRow({ id: 44, value: "ann@personal.example", label: "Personal" })]
/** After Make primary on 44: 44 Primary with notifications on, 42 Old. */
const SWITCHED_EMAILS = [
  EMAILS[0],
  { ...EMAILS[1], label: "Old" },
  EMAILS[2],
  emailRow({ id: 44, value: "ann@personal.example", label: "Primary", isNotificationEnabled: true }),
]
const IN_USE = "User with email 'ann@personal.example' already exists."

test.describe("Email verify (Story 3.6)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("add → save → auto-verify: the verify follows the POST; the new row counts down (pending); \"Link sent\" announced", async ({ page }) => {
    await openWith(page)
    const posts = await mockContactManage(page)
    const verifies = await mockContactVerify(page)
    await section(page).getByRole("button", { name: "Add email" }).click()
    const row = newRow(page)
    await addressInput(row).fill("b@x.com")
    await pick(page, labelSelect(row), "Personal")
    await mockContacts(page, { Email: [...EMAILS, emailRow({ id: 45, value: "b@x.com", label: "Personal", isVerified: false })] })
    const writes: string[] = []
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/1h/v2/health/contact-point")) writes.push(new URL(request.url()).pathname)
    })
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    await expect(toastWith(page, "Email saved.")).toBeVisible()
    expect(posts()).toHaveLength(1)
    await expect.poll(() => verifies()).toEqual([{ contactPointIds: [45] }])
    expect(writes).toEqual(["/api/1h/v2/health/contact-point", "/api/1h/v2/health/contact-point/verify"])
    const added = readRow(page, "b@x.com")
    await expect(added.locator('[data-slot="status-badge"]')).toHaveAttribute("data-status", "pending")
    await expect(added.locator('[data-slot="status-badge"]')).toHaveText(/^Link sent · Resend in (60|59|58) s$/)
    await expect(liveStatus(page)).toHaveText("Link sent")
  })

  test("manual Verify: sends [41] at once with no edit mode; the countdown; the kebab item is aria-disabled with it", async ({ page }) => {
    await openWith(page)
    const verifies = await mockContactVerify(page)
    const work = readRow(page, "ann@work.example")
    // Only the unverified Work email offers Verify (the Primary is verified, the Home row has no status).
    await expect(section(page).getByRole("button", { name: "Verify", exact: true })).toHaveCount(1)
    await work.hover()
    await work.getByRole("button", { name: "Verify", exact: true }).click()
    await expect.poll(() => verifies()).toEqual([{ contactPointIds: [41] }])
    await expect(footer(page)).toHaveCount(0)
    await expect(work.locator('[data-slot="status-badge"]')).toHaveText(/^Link sent · Resend in (60|59) s$/)
    await expect(liveStatus(page)).toHaveText("Link sent")
    await section(page).getByRole("button", { name: "More actions for ann@work.example" }).click()
    const item = page.getByRole("menuitem", { name: /Resend verification/ })
    await expect(item).toHaveAttribute("aria-disabled", "true")
    await expect(item).toContainText(/Link sent · Resend in \d+ s/)
    await page.keyboard.press("Escape")
    expect(verifies()).toHaveLength(1)
  })

  test("a send error reads \"Couldn't send the link\" with Resend verification available at once", async ({ page }) => {
    await openWith(page)
    const verifies = await mockContactVerify(page, { body: { success: false, contactPointIdsWithSendError: [41] } })
    const work = readRow(page, "ann@work.example")
    await work.hover()
    await work.getByRole("button", { name: "Verify", exact: true }).click()
    await expect(work.getByText("Couldn't send the link")).toBeVisible()
    await work.hover()
    const resend = work.getByRole("button", { name: "Resend verification" })
    await expect(resend).not.toHaveAttribute("aria-disabled", "true")
    await resend.click()
    await expect.poll(() => verifies()).toHaveLength(2)
  })
})

test.describe("Email Make primary and notifications (Story 3.6)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("Make primary → confirm → one POST; 44 first with Primary and On, 42 Old; toast; h2 focused; the header shows the new email", async ({ page }) => {
    await openWith(page, PRIMARY_EMAILS)
    await expect(header(page).getByText("ann@example.com")).toBeVisible()
    const posts = await mockContactManage(page)
    const row = readRow(page, "ann@personal.example")
    await row.hover()
    await row.getByRole("button", { name: "Make primary" }).click()
    const dialog = confirmDialog(page)
    await expect(dialog.getByRole("heading", { name: "This changes how you sign in" })).toBeVisible()
    await expect(dialog).toContainText("ann@personal.example becomes your primary email and sign-in email. Your current primary is relabeled Old.")
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused()
    await mockContacts(page, { Email: SWITCHED_EMAILS })
    await dialog.getByRole("button", { name: "Make primary" }).click()
    await expect(dialog).toHaveCount(0)
    expect(posts()).toEqual([
      {
        contactPointsToAdd: [],
        contactPointsToUpdate: [
          { id: 44, type: "Email", label: "Primary", isNotificationEnabled: true },
          { id: 42, type: "Email", label: "Old", isNotificationEnabled: true },
        ],
        contactPointsToRemove: [],
      },
    ])
    await expect(toastWith(page, "Email saved.")).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "Email" })).toBeFocused()
    const first = emailTable(page).locator("tbody tr").first()
    await expect(first.getByRole("cell").first()).toHaveText("ann@personal.example")
    await expect(first.locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "primary")
    await expect(first.getByRole("cell").nth(3)).toHaveText("On")
    await expect(readRow(page, "ann@example.com").locator('[data-slot="chip"]')).toHaveText("Old")
    await expect(header(page).getByText("ann@personal.example")).toBeVisible()
  })

  test("Cancel and Escape send nothing and return focus to the trigger", async ({ page }) => {
    await openWith(page, PRIMARY_EMAILS)
    const posts = await mockContactManage(page)
    const row = readRow(page, "ann@personal.example")
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

  test("disabled reasons: unverified (Verify beside it) and unverified Home", async ({ page }) => {
    await openWith(page, PRIMARY_EMAILS)
    const cases: [string, string][] = [
      ["ann@work.example", "Verify this email first"],
      ["ann@home.example", "Change the label from Home, then verify this email"],
    ]
    for (const [address, reason] of cases) {
      const action = readRow(page, address).getByRole("button", { name: "Make primary" })
      await expect(action).toHaveAttribute("aria-disabled", "true")
      await expect(action).toHaveAccessibleDescription(reason)
      await action.focus()
      await page.keyboard.press("Enter")
      await expect(confirmDialog(page)).toHaveCount(0)
    }
    await readRow(page, "ann@work.example").getByRole("button", { name: "Make primary" }).focus()
    await expect(page.getByRole("tooltip", { name: "Verify this email first" })).toBeVisible()
    await expect(readRow(page, "ann@work.example").getByRole("button", { name: "Verify", exact: true })).toHaveCount(1)
    // The Primary row offers no Make primary.
    await expect(readRow(page, "ann@example.com").getByRole("button", { name: "Make primary" })).toHaveCount(0)
  })

  test("in use: the 400 toasts \"This email is used by another account. Choose a different one.\" with Retry; the view is unchanged", async ({ page }) => {
    await openWith(page, PRIMARY_EMAILS)
    const posts = await mockContactManage(page, { status: 400, body: { message: IN_USE, code: 400 } })
    const row = readRow(page, "ann@personal.example")
    await row.hover()
    await row.getByRole("button", { name: "Make primary" }).click()
    await confirmDialog(page).getByRole("button", { name: "Make primary" }).click()
    await expect(confirmDialog(page)).toHaveCount(0)
    const toast = toastWith(page, "This email is used by another account. Choose a different one.")
    await expect(toast).toBeVisible()
    await expect(toast.getByRole("button", { name: "Retry" })).toBeVisible()
    expect(posts()).toHaveLength(1)
    // Unchanged: 42 still first and Primary, 44 still Personal.
    const first = emailTable(page).locator("tbody tr").first()
    await expect(first.getByRole("cell").first()).toHaveText("ann@example.com")
    await expect(first.locator('[data-slot="chip"]')).toHaveAttribute("data-variant", "primary")
    await expect(readRow(page, "ann@personal.example").locator('[data-slot="chip"]')).toHaveText("Personal")
  })

  test("notifications: in edit view only the Primary has a switch; off → Save sends only that row; read view shows Off", async ({ page }) => {
    await openWith(page, PRIMARY_EMAILS)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    await expect(section(page).getByRole("switch")).toHaveCount(1)
    const toggle = section(page).getByRole("switch", { name: "Notifications for ann@example.com" })
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(footer(page).getByText("Unsaved changes")).toBeVisible()
    await mockContacts(page, { Email: PRIMARY_EMAILS.map((row) => (row.id === 42 ? { ...row, isNotificationEnabled: false } : row)) })
    await saveButton(page).click()
    await expect(footer(page)).toHaveCount(0)
    expect(posts()).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 42, type: "Email", label: "Primary", isNotificationEnabled: false }], contactPointsToRemove: [] }])
    await expect(emailTable(page).locator("tbody tr").first().getByRole("cell").nth(3)).toHaveText("Off")
  })

  test("at 360 px: Make primary from the kebab; the confirm fits with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page, PRIMARY_EMAILS)
    await section(page).getByRole("button", { name: "More actions for ann@personal.example" }).click()
    await page.getByRole("menuitem", { name: "Make primary" }).click()
    const dialog = confirmDialog(page)
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box && box.x >= 16 && box.x + box.width <= 360 - 16).toBe(true)
    await expectNoHorizontalScroll(page)
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(section(page).getByRole("button", { name: "More actions for ann@personal.example" })).toBeFocused()
    await expectNoHorizontalScroll(page)
  })

  test("axe passes in light and dark with the confirm open, with a countdown, and in edit view with the switch", async ({ page }) => {
    await openWith(page, PRIMARY_EMAILS)
    await mockContactVerify(page)
    const work = readRow(page, "ann@work.example")
    await work.hover()
    await work.getByRole("button", { name: "Verify", exact: true }).click()
    await expect(work.locator('[data-slot="status-badge"]')).toHaveText(/^Link sent/)
    const row = readRow(page, "ann@personal.example")
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
    await axe(page, "Email edit with the switch")
  })
})

// --- NG-9023 parity with 1health-fe: Verify in the edit view, where a new row goes ---------------

test.describe("Email 1health-fe parity (NG-9023)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("edit view: only the saved, unverified, non-Home email offers Verify; it sends [41] at once and the edit stays open", async ({ page }) => {
    await openWith(page)
    const verifies = await mockContactVerify(page)
    const posts = await mockContactManage(page)
    await section(page).getByRole("button", { name: "Edit", exact: true }).click()
    await footer(page).getByRole("button", { name: "Add row" }).click()
    // Not on the verified Primary, the Home row or the new row (EmailRow:119).
    await expect(section(page).getByRole("button", { name: "Verify", exact: true })).toHaveCount(1)
    await expect(newRow(page).getByRole("button", { name: /Verif/ })).toHaveCount(0)
    const work = savedRow(page, "ann@work.example")
    await work.getByRole("button", { name: "Verify", exact: true }).click()
    await expect.poll(() => verifies()).toEqual([{ contactPointIds: [41] }])
    expect(posts()).toEqual([])
    await expect(footer(page)).toBeVisible()
    await expect(work.locator('[data-slot="status-badge"]')).toHaveText(/^Link sent · Resend in (60|59) s$/)
    await expect(liveStatus(page)).toHaveText("Link sent")
    await expect(work.getByRole("button", { name: "Resend verification" })).toHaveAttribute("aria-disabled", "true")
    await expect(section(page).locator('[data-state="new"]')).toHaveCount(1)
    await axe(page, "Email edit Verify")
  })

  test("Add row: the new row goes on top, focused; while a row is invalid it adds nothing and focuses the first error", async ({ page }) => {
    await openWith(page)
    await section(page).getByRole("button", { name: "Add email" }).click()
    const rows = section(page).locator("tbody tr")
    await expect(rows).toHaveCount(4)
    await expect(rows.first()).toHaveAttribute("data-state", "new")
    await expect(addressInput(rows.first())).toBeFocused()
    // The untouched new row is invalid: Add row shows its errors and adds nothing (EmailWrapper:330-340).
    await footer(page).getByRole("button", { name: "Add row" }).click()
    await expect(section(page).locator('[data-state="new"]')).toHaveCount(1)
    await expect(addressInput(rows.first())).toHaveAttribute("aria-invalid", "true")
    await expect(addressInput(rows.first())).toBeFocused()
    await addressInput(rows.first()).fill("new@example.com")
    await pick(page, labelSelect(rows.first()), "Personal")
    await footer(page).getByRole("button", { name: "Add row" }).click()
    await expect(section(page).locator('[data-state="new"]')).toHaveCount(2)
    await expect(addressInput(rows.first())).toBeFocused()
    await expect(addressInput(rows.first())).toHaveValue("")
    await expect(addressInput(rows.nth(1))).toHaveValue("new@example.com")
    await expect(rows.nth(1).locator('[data-slot="field-error"]')).toHaveCount(0)
  })

  test("at 360 px: the edit card offers Verify with the status, the new card goes first, no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWith(page)
    const verifies = await mockContactVerify(page)
    await section(page).getByRole("button", { name: "Add email" }).click()
    const cards = emailCards(page).locator("li[data-slot='section-table-card']")
    await expect(cards.first()).toHaveAttribute("data-state", "new")
    await expect(addressInput(cards.first())).toBeFocused()
    const work = savedRow(page, "ann@work.example")
    await work.getByRole("button", { name: "Verify", exact: true }).click()
    await expect.poll(() => verifies()).toEqual([{ contactPointIds: [41] }])
    await expect(work.locator('[data-slot="status-badge"]')).toHaveText(/^Link sent · Resend in \d+ s$/)
    await expect(footer(page)).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})
