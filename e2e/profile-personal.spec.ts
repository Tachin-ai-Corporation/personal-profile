import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  mockFileDownload,
  mockMyself,
  mockProfileDefaults,
  mockTypeKey,
  mockUserEdit,
  PERSONAL_FULL_MYSELF,
  PERSONAL_SIGNATURE_FILE_ID,
  setTheme,
  signIn,
  test,
} from "./fixtures"

/**
 * Stories 2.1–2.2 (Team A, NG-9022): the Personal information read and edit
 * views on the real `/`. Every test runs under the fail-fast `test`, starts from
 * `mockProfileDefaults` and overrides `myself` (frozen `ANN` + the fields
 * under test) and the Signature image.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

const LABELS = [
  "Name prefix",
  "First name",
  "Middle name",
  "Last name",
  "Name suffix",
  "Other names",
  "Titles",
  "Birth date",
  "City of birth",
  "Race",
  "Ethnicity",
  "Biological gender",
  "Gender identity",
  "Sexual orientation",
  "SSN",
  "Signature",
]

const personalTable = (page: Page): Locator => page.getByRole("table", { name: "Personal information" })

/** The value cell of the row keyed `label` (the cell whose `headers` names it). */
async function valueCell(page: Page, label: string): Promise<Locator> {
  const id = await personalTable(page).getByRole("rowheader", { name: label, exact: true }).getAttribute("id")
  return personalTable(page).locator(`td[headers="${id}"]`)
}

async function openWithFullMyself(page: Page, url = "/"): Promise<void> {
  await mockProfileDefaults(page)
  await mockMyself(page, { body: PERSONAL_FULL_MYSELF })
  await mockFileDownload(page, PERSONAL_SIGNATURE_FILE_ID)
  await page.goto(url)
  await expect(personalTable(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("Personal information read view (Story 2.1)", () => {
  test("shows the 16 rows in the F1 order with their values; no email or phone; one Edit action", async ({ page }) => {
    await openWithFullMyself(page)
    const section = page.getByRole("region", { name: "Personal information" })
    await expect(section.getByRole("heading", { level: 2, name: "Personal information" })).toBeVisible()
    await expect(personalTable(page).getByRole("rowheader")).toHaveText(LABELS)

    await expect(await valueCell(page, "Birth date")).toHaveText("03/09/1987")
    await expect(await valueCell(page, "Sexual orientation")).toHaveText("Not provided")
    const ssn = (await valueCell(page, "SSN")).locator(".mono-value")
    await expect(ssn).toHaveText("***-**-1234")
    await expect(ssn).toHaveCSS("font-family", /mono/i)
    const img = (await valueCell(page, "Signature")).getByRole("img", { name: "Your signature" })
    await expect(img).toHaveAttribute("src", `/api/1h/v2/file/${PERSONAL_SIGNATURE_FILE_ID}/download`)
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
    // The 112 × 32 thumbnail is the bordered frame around the image.
    const thumb = (await valueCell(page, "Signature")).locator('[data-slot="signature-thumb"]')
    expect(await thumb.evaluate((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height])).toEqual([112, 32])

    await expect(personalTable(page)).not.toContainText("ann.lee@example.com")
    await expect(section.getByRole("button")).toHaveText(["Edit"])
  })

  test("a broken signature image reads \"Not provided\"", async ({ page }) => {
    await mockProfileDefaults(page)
    await mockMyself(page, { body: PERSONAL_FULL_MYSELF })
    await mockFileDownload(page, PERSONAL_SIGNATURE_FILE_ID, { status: 404, contentType: "application/json", body: Buffer.from('{"errorCode":"NOT_FOUND"}') })
    await page.goto("/")
    await expect(await valueCell(page, "Signature")).toHaveText("Not provided")
    await expect(personalTable(page).getByRole("img")).toHaveCount(0)
  })

  test("#signature deep link scrolls to the Signature row once the data loads", async ({ page }) => {
    await openWithFullMyself(page, "/?tab=contacts#signature")
    const row = page.locator("#signature")
    await expect(row).toHaveCount(1)
    await expect(row).toHaveText("Signature")
    await expect(row).toBeInViewport()
  })

  test("no horizontal scroll at 360 px; one Field | Value pair per row", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWithFullMyself(page)
    await expect(personalTable(page).getByRole("row")).toHaveCount(16)
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test("axe passes in light and dark", async ({ page }) => {
    await openWithFullMyself(page)
    await expect.poll(async () => (await valueCell(page, "Signature")).locator('[data-state="loaded"]').count()).toBe(1)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#personal").withTags(WCAG).analyze()
      expect(results.violations, `Personal information (${theme})`).toEqual([])
    }
  })

  test("a failed myself shows the Section load error (no page banner); Retry refetches only myself", async ({ page }) => {
    await mockProfileDefaults(page)
    const typeKeyRequests = await mockTypeKey(page, "Person")
    // A 4xx is not auto-retried, so the error shows at once.
    await mockMyself(page, { status: 400, body: { message: "Bad request" } })
    await page.goto("/")
    const section = page.getByRole("region", { name: "Personal information" })
    await expect(section.getByText("Couldn't load personal information")).toBeVisible()
    await expect(page.getByText("Something went wrong while loading profile information")).toHaveCount(0)
    await expect(page.locator("#signature")).toHaveCount(1)
    await page.waitForLoadState("networkidle")
    const typeKeysBefore = typeKeyRequests().length

    const myselfRequests = await mockMyself(page, { body: PERSONAL_FULL_MYSELF })
    await mockFileDownload(page, PERSONAL_SIGNATURE_FILE_ID)
    await section.getByRole("button", { name: "Retry" }).click()
    await expect(personalTable(page)).toBeVisible()
    await expect(await valueCell(page, "Birth date")).toHaveText("03/09/1987")
    expect(myselfRequests()).toBe(1)
    expect(typeKeyRequests().length).toBe(typeKeysBefore)
  })

  test("a failed Person type key leaves the read view unaffected", async ({ page }) => {
    await mockProfileDefaults(page)
    await mockMyself(page, { body: PERSONAL_FULL_MYSELF })
    await mockFileDownload(page, PERSONAL_SIGNATURE_FILE_ID)
    const typeKeyRequests = await mockTypeKey(page, "Person", { status: 500, body: { message: "boom" } })
    await page.goto("/")
    await expect(personalTable(page)).toBeVisible()
    await expect.poll(() => typeKeyRequests().length).toBeGreaterThanOrEqual(1)
    await expect(await valueCell(page, "Race")).toHaveText("Asian")
    await expect(page.getByRole("region", { name: "Personal information" }).getByText(/Couldn't load/)).toHaveCount(0)
  })
})

// --- Story 2.2: edit and save -------------------------------------------------------------------

const section = (page: Page): Locator => page.getByRole("region", { name: "Personal information" })
/** The control labelled `label` (with or without the "(optional)" suffix). */
const control = (page: Page, label: string): Locator => section(page).getByLabel(new RegExp(`^${label}( \\(optional\\))?$`))
const toastWith = (page: Page, text: string): Locator => page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })

/** Back in read view (the desktop edit table has the same name as the read table, so wait for "Edit"). */
async function expectReadView(page: Page): Promise<void> {
  await expect(section(page).getByRole("button", { name: "Edit" })).toBeVisible()
  await expect(section(page).getByRole("button", { name: "Save" })).toHaveCount(0)
}

async function openEdit(page: Page): Promise<void> {
  await openWithFullMyself(page)
  await section(page).getByRole("button", { name: "Edit" }).click()
  await expect(section(page).getByText("Editing")).toBeVisible()
}

test.describe("Personal information edit and save (Story 2.2)", () => {
  test("edit → save: only the change is sent, the header name updates, read view, toast, h2 focused", async ({ page }) => {
    await openEdit(page)
    await expect(control(page, "Name prefix")).toBeFocused()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ann Lee")
    const puts = await mockUserEdit(page)
    await control(page, "First name").fill("Anna ")
    await expect(section(page).getByText("Unsaved changes")).toBeVisible()
    // The refetch after the save answers the saved name.
    await mockMyself(page, { body: { ...PERSONAL_FULL_MYSELF, firstName: "Anna" } })
    await section(page).getByRole("button", { name: "Save" }).click()

    await expectReadView(page)
    expect(puts()).toEqual([{ firstName: "Anna" }])
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anna Lee")
    await expect(await valueCell(page, "First name")).toHaveText("Anna")
    await expect(toastWith(page, "Personal information saved.")).toBeVisible()
    await expect(section(page).getByRole("heading", { level: 2, name: "Personal information" })).toBeFocused()
  })

  test("invalid: nothing is sent, the first invalid field is focused, its error is described", async ({ page }) => {
    await openEdit(page)
    const puts = await mockUserEdit(page)
    await control(page, "First name").fill("a".repeat(25))
    await control(page, "Birth date").fill("")
    await section(page).getByRole("button", { name: "Save" }).click()
    await expect(control(page, "First name")).toBeFocused()
    await expect(control(page, "First name")).toHaveAttribute("aria-invalid", "true")
    await expect(control(page, "First name")).toHaveAccessibleDescription("First name can be up to 24 characters")
    await expect(control(page, "Birth date")).toHaveAccessibleDescription("Birth date is required")
    expect(puts()).toEqual([])
  })

  test("the pickers offer only values the save accepts; an unset value is preselected and sent", async ({ page }) => {
    await mockProfileDefaults(page)
    await mockTypeKey(page, "Person", {
      body: {
        boKey: "Person",
        attributes: [{ attrKey: "race", name: "race", type: "VALUE_LIST", attributeValues: ["White", "Martian", "Asian"].map((name, id) => ({ id, name })) }],
      },
    })
    await mockMyself(page, { body: { ...PERSONAL_FULL_MYSELF, race: null } })
    await mockFileDownload(page, PERSONAL_SIGNATURE_FILE_ID)
    await page.goto("/")
    await section(page).getByRole("button", { name: "Edit" }).click()
    await expect(control(page, "Race")).toHaveText("Unknown")
    await control(page, "Race").click()
    await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Asian", "White", "Unknown"])
    // The Radix listbox hides the page from assistive tech while open: scan only the listbox (FOUNDATION §6).
    const listbox = await new AxeBuilder({ page }).include('[role="listbox"]').withTags(WCAG).analyze()
    expect(listbox.violations).toEqual([])
    await page.getByRole("option", { name: "White" }).click()
    const puts = await mockUserEdit(page)
    await section(page).getByRole("button", { name: "Save" }).click()
    await expectReadView(page)
    expect(puts()).toEqual([{ race: "White" }])
  })

  test("a failed save keeps the edit; Retry resends the same diff", async ({ page }) => {
    await openEdit(page)
    let fail = true
    const puts = await mockUserEdit(page, () => (fail ? { status: 502, body: { errorCode: "UPSTREAM_ERROR", source: "proxy" } } : { status: 200, body: PERSONAL_FULL_MYSELF }))
    await control(page, "Middle name").fill("")
    await section(page).getByRole("button", { name: "Save" }).click()
    const banner = section(page).getByText("Couldn't save personal information. Check your connection.")
    await expect(banner).toBeVisible()
    fail = false
    await section(page).getByRole("button", { name: "Retry" }).click()
    await expectReadView(page)
    expect(puts()).toEqual([{ middleName: "n/a" }, { middleName: "n/a" }])
  })

  test("edit view at 360 px: labels above full-width controls, no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openEdit(page)
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    const first = await control(page, "First name").boundingBox()
    const label = await section(page).locator("label", { hasText: /^First name$/ }).boundingBox()
    expect(first && label && first.y > label.y).toBe(true)
    expect((await control(page, "First name").boundingBox())?.height).toBe(44)
    // Every control is full width: the Select, the date input and the combobox match the text input.
    for (const label of ["Race", "Birth date", "Gender identity"]) {
      const box = await control(page, label).boundingBox()
      expect(Math.abs((box?.width ?? 0) - (first?.width ?? -10)), label).toBeLessThanOrEqual(1)
    }
  })

  test("axe passes on the edit view in light and dark, with errors shown", async ({ page }) => {
    await openEdit(page)
    await expect.poll(() => section(page).locator('[data-slot="personal-read-only"] [data-state="loaded"]').count()).toBe(1)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#personal").withTags(WCAG).analyze()
      expect(results.violations, `Personal information edit (${theme})`).toEqual([])
    }
    await control(page, "First name").fill("")
    await section(page).getByRole("button", { name: "Save" }).click()
    await expect(control(page, "First name")).toBeFocused()
    const withErrors = await new AxeBuilder({ page }).include("#personal").withTags(WCAG).analyze()
    expect(withErrors.violations, "Personal information edit with errors").toEqual([])
  })
})
