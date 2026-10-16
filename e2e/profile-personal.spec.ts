import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  mockFileDownload,
  mockMyself,
  mockPersonalSsnExpose,
  mockProfileDefaults,
  mockTypeKey,
  mockUserEdit,
  PERSONAL_FULL_MYSELF,
  PERSONAL_SIGNATURE_FILE_ID,
  PERSONAL_SSN_SHOWN,
  setTheme,
  signIn,
  test,
} from "./fixtures"

/**
 * Stories 2.1–2.3 (Team A, NG-9022): the Personal information read and edit
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
  test("shows the 16 rows in the F1 order with their values; no email or phone; Edit and the SSN's Reveal", async ({ page }) => {
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
    await expect(section.getByRole("button")).toHaveText(["Edit", "Reveal"])
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

// --- Story 2.3: SSN entry and Reveal ------------------------------------------------------------

/** Any nine-digit SSN, with or without hyphens (not part of a longer number). */
const SSN_SHAPE = /(?<![\d-])\d{3}-?\d{2}-?\d{4}(?![\d-])/

const ssnInput = (page: Page): Locator => control(page, "SSN")
const revealButton = (page: Page): Locator => section(page).getByRole("button", { name: "Reveal SSN" })
const hideButton = (page: Page): Locator => section(page).getByRole("button", { name: "Hide SSN" })

test.describe("SSN entry and Reveal (Story 2.3)", () => {
  test("read view: Reveal shows the SSN with the ring, announces it and focuses Hide; Hide brings the mask back and focuses Reveal", async ({ page }) => {
    await openWithFullMyself(page)
    const exposes = await mockPersonalSsnExpose(page)
    const cell = await valueCell(page, "SSN")
    await expect(cell.locator(".mono-value")).toHaveText("***-**-1234")
    const reveal = revealButton(page)
    const box = await reveal.boundingBox()
    expect(box && box.height >= 44 && box.width >= 44).toBe(true)
    await expect(reveal).toHaveCSS("text-decoration-line", "underline")

    await reveal.click()
    await expect(cell.getByText(PERSONAL_SSN_SHOWN)).toBeVisible()
    await expect(hideButton(page)).toBeFocused()
    await expect(cell.locator('[data-slot="ssn-countdown-ring"]')).toBeVisible()
    await expect(section(page).getByRole("status").filter({ hasText: "Social Security number shown, hides in 30 seconds" })).toHaveCount(1)
    expect(exposes()).toHaveLength(1)
    expect(page.url()).not.toMatch(SSN_SHAPE)

    await hideButton(page).click()
    await expect(cell.getByText(PERSONAL_SSN_SHOWN)).toHaveCount(0)
    await expect(cell.locator(".mono-value")).toHaveText("***-**-1234")
    await expect(revealButton(page)).toBeFocused()
  })

  test("the real 30 s auto-hide (page clock): the mask is back and no full SSN is on the page", async ({ page }) => {
    await page.clock.install()
    await openWithFullMyself(page)
    await mockPersonalSsnExpose(page)
    await revealButton(page).click()
    const cell = await valueCell(page, "SSN")
    await expect(cell.getByText(PERSONAL_SSN_SHOWN)).toBeVisible()
    await page.clock.runFor(29_000)
    await expect(cell.getByText(PERSONAL_SSN_SHOWN)).toBeVisible()
    await page.clock.runFor(1_500)
    await expect(cell.getByText(PERSONAL_SSN_SHOWN)).toHaveCount(0)
    await expect(cell.locator(".mono-value")).toHaveText("***-**-1234")
    expect(await page.locator("body").innerText()).not.toMatch(SSN_SHAPE)
    expect(await page.content()).not.toMatch(SSN_SHAPE)
  })

  test("a hidden tab hides the SSN at once", async ({ page }) => {
    await openWithFullMyself(page)
    await mockPersonalSsnExpose(page)
    await revealButton(page).click()
    await expect(section(page).getByText(PERSONAL_SSN_SHOWN)).toBeVisible()
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await expect(section(page).getByText(PERSONAL_SSN_SHOWN)).toHaveCount(0)
    await expect((await valueCell(page, "SSN")).locator(".mono-value")).toHaveText("***-**-1234")
  })

  test("reduced motion: \"Hides in 30 s\" instead of the ring", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openWithFullMyself(page)
    await mockPersonalSsnExpose(page)
    await revealButton(page).click()
    const cell = await valueCell(page, "SSN")
    await expect(cell.getByText("Hides in 30 s", { exact: true })).toBeVisible()
    await expect(cell.locator('[data-slot="ssn-countdown-ring"]')).toBeHidden()
  })

  test("a failed Reveal keeps the mask and says \"Couldn't show your SSN. Try again.\"", async ({ page }) => {
    await openWithFullMyself(page)
    await mockPersonalSsnExpose(page, { status: 500, body: { message: "boom" } })
    await revealButton(page).click()
    await expect(section(page).getByText("Couldn't show your SSN. Try again.")).toBeVisible()
    await expect((await valueCell(page, "SSN")).locator(".mono-value")).toHaveText("***-**-1234")
  })

  test("edit: Reveal shows the SSN in the input with the revealed help; the input is kept out of autofill", async ({ page }) => {
    await openEdit(page)
    await mockPersonalSsnExpose(page)
    const input = ssnInput(page)
    await expect(input).toHaveValue("***-**-1234")
    await expect(input).toHaveAttribute("name", "pp-ref-number")
    await expect(input).toHaveAttribute("id", "personal-ref-number")
    await expect(input).toHaveAttribute("autocomplete", "off")
    await expect(input).toHaveAttribute("data-lpignore", "true")
    await expect(input).toHaveAccessibleDescription("Type a new number to replace it.")
    await revealButton(page).click()
    await expect(input).toHaveValue(PERSONAL_SSN_SHOWN)
    await expect(input).toHaveAccessibleDescription("Format XXX-XX-XXXX. Hides in 30 s. Clear it to remove your SSN.")
    await expect(hideButton(page)).toBeFocused()
    expect(await input.getAttribute("value")).toBeNull()
    // Not a change: Save sends nothing.
    const puts = await mockUserEdit(page)
    await section(page).getByRole("button", { name: "Save" }).click()
    await expectReadView(page)
    expect(puts()).toEqual([])
    await expect(section(page).getByText(PERSONAL_SSN_SHOWN)).toHaveCount(0)
  })

  test("edit: typing over the mask formats as XXX-XX-XXXX and Save sends it; the read view shows the new mask", async ({ page }) => {
    await openEdit(page)
    const input = ssnInput(page)
    await input.selectText()
    await page.keyboard.type("123456789")
    await expect(input).toHaveValue("123-45-6789")
    const puts = await mockUserEdit(page)
    await mockMyself(page, { body: { ...PERSONAL_FULL_MYSELF, socialSecurityNumber: "***-**-6789" } })
    await section(page).getByRole("button", { name: "Save" }).click()
    await expectReadView(page)
    expect(puts()).toEqual([{ socialSecurityNumber: "123-45-6789" }])
    await expect((await valueCell(page, "SSN")).locator(".mono-value")).toHaveText("***-**-6789")
    await expect(section(page)).not.toContainText("123-45-6789")
  })

  test("edit: a paste of 123 45 6789 gives 123-45-6789; a partial SSN is refused; Backspace across the hyphen", async ({ page }) => {
    await openEdit(page)
    const input = ssnInput(page)
    await input.selectText()
    await page.keyboard.press("Backspace")
    await expect(input).toHaveValue("")
    await page.keyboard.insertText("123 45 6789")
    await expect(input).toHaveValue("123-45-6789")
    await input.fill("12345")
    await expect(input).toHaveValue("123-45")
    await input.press("ArrowLeft")
    await input.press("ArrowLeft")
    await input.press("Backspace")
    await expect(input).toHaveValue("124-5")
    const puts = await mockUserEdit(page)
    await section(page).getByRole("button", { name: "Save" }).click()
    await expect(input).toBeFocused()
    await expect(input).toHaveAccessibleDescription("Enter all 9 digits of your SSN")
    expect(puts()).toEqual([])
  })

  test("edit: clearing the SSN sends n/a; the read view then says \"Not provided\"", async ({ page }) => {
    await openEdit(page)
    await ssnInput(page).fill("")
    const puts = await mockUserEdit(page)
    await mockMyself(page, { body: { ...PERSONAL_FULL_MYSELF, socialSecurityNumber: "n/a" } })
    await section(page).getByRole("button", { name: "Save" }).click()
    await expectReadView(page)
    expect(puts()).toEqual([{ socialSecurityNumber: "n/a" }])
    await expect(await valueCell(page, "SSN")).toHaveText("Not provided")
    await expect(revealButton(page)).toHaveCount(0)
  })

  test("edit: SSN taken marks only the SSN field and focuses it", async ({ page }) => {
    await openEdit(page)
    const puts = await mockUserEdit(page, {
      status: 400,
      body: { message: "The Social Security Number {123-45-6789} already belongs to another person." },
    })
    await ssnInput(page).fill("123456789")
    await section(page).getByRole("button", { name: "Save" }).click()
    await expect(ssnInput(page)).toBeFocused()
    await expect(ssnInput(page)).toHaveAttribute("aria-invalid", "true")
    await expect(ssnInput(page)).toHaveAccessibleDescription("This SSN belongs to another person")
    await expect(section(page).locator('[aria-invalid="true"]')).toHaveCount(1)
    expect(puts()).toEqual([{ socialSecurityNumber: "123-45-6789" }])
    expect(await section(page).innerHTML()).not.toMatch(SSN_SHAPE)
  })

  test("axe passes with the SSN revealed, read and edit, light and dark; no horizontal scroll at 360 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openWithFullMyself(page)
    await mockPersonalSsnExpose(page)
    await expect.poll(async () => (await valueCell(page, "Signature")).locator('[data-state="loaded"]').count()).toBe(1)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await revealButton(page).click()
      await expect(section(page).getByText(PERSONAL_SSN_SHOWN)).toBeVisible()
      const results = await new AxeBuilder({ page }).include("#personal").withTags(WCAG).analyze()
      expect(results.violations, `SSN revealed (${theme})`).toEqual([])
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
      await hideButton(page).click()
    }
    await section(page).getByRole("button", { name: "Edit" }).click()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await revealButton(page).click()
      await expect(ssnInput(page)).toHaveValue(PERSONAL_SSN_SHOWN)
      const results = await new AxeBuilder({ page }).include("#personal").withTags(WCAG).analyze()
      expect(results.violations, `SSN revealed in edit (${theme})`).toEqual([])
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
      await hideButton(page).click()
    }
  })
})
