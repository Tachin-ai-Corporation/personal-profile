import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  mockFileDownload,
  mockMyself,
  mockPersonalFileDelete,
  mockPersonalMyselfFrom,
  mockPersonalSignatureUpload,
  mockPersonalSsnExpose,
  PERSONAL_SIGNATURE_JPEG,
  mockProfileDefaults,
  mockTypeKey,
  mockUserEdit,
  PERSONAL_FULL_MYSELF,
  PERSONAL_SIGNATURE_FILE_ID,
  PERSONAL_SSN_SHOWN,
  PNG_1X1,
  setTheme,
  type PersonalSignatureRelations,
  signIn,
  test,
} from "./fixtures"

/**
 * Stories 2.1–2.4 (Team A, NG-9022): the Personal information read and edit
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
    // The saved Signature is loaded into the pad (Story 2.4).
    await expect(section(page).locator('canvas[role="img"]')).not.toHaveAttribute("data-empty", "true")
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

// --- Story 2.4: Signature -----------------------------------------------------------------------

const pad = (page: Page): Locator => section(page).getByRole("img", { name: "Draw your signature" })
const confirmDialog = (page: Page): Locator => page.getByRole("alertdialog", { name: "Remove your signature?" })
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const MB = 1024 * 1024

/** One stroke across the pad with the mouse (pointer events, as a finger or pen sends them). */
async function drawOnPad(page: Page): Promise<void> {
  // The mouse doesn't scroll: bring the pad into view first.
  await pad(page).scrollIntoViewIfNeeded()
  const box = await pad(page).boundingBox()
  if (!box) throw new Error("no pad")
  await page.mouse.move(box.x + 30, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + 90, box.y + 50, { steps: 8 })
  await page.mouse.move(box.x + 160, box.y + 110, { steps: 8 })
  await page.mouse.move(box.x + 230, box.y + 60, { steps: 8 })
  await page.mouse.up()
}

/**
 * The server: Ann's `PersonHasSignatureFile` relations (oldest first;
 * `myself.signature` is the newest) and first name, changed mid-test by the
 * upload mock (adds 57) and the ownership-checked delete mock.
 */
function signatureServer(initial: number | null) {
  const state = { firstName: "Ann" }
  const relations: PersonalSignatureRelations = { ids: initial === null ? [] : [initial] }
  const body = () => {
    const newest = relations.ids.at(-1)
    return { ...PERSONAL_FULL_MYSELF, firstName: state.firstName, signature: newest === undefined ? null : { id: newest, name: "signature.png" } }
  }
  /** The upload answer that adds relation 57. */
  const uploaded = () => {
    relations.ids.push(57)
    return { body: { id: 57 } }
  }
  return { state, relations, body, uploaded }
}

async function openSignature(page: Page, initial: number | null): Promise<ReturnType<typeof signatureServer>> {
  const server = signatureServer(initial)
  await mockProfileDefaults(page)
  await mockPersonalMyselfFrom(page, server.body)
  await mockFileDownload(page)
  await page.goto("/?tab=contacts#signature")
  await expect(personalTable(page)).toBeVisible()
  return server
}

async function editSignature(page: Page): Promise<void> {
  await section(page).getByRole("button", { name: "Edit" }).click()
  await expect(section(page).getByText("Editing")).toBeVisible()
  await expect(pad(page)).toBeVisible()
}

function expectSignaturePng(upload: { part: string; fileName: string; parts: number; search: string; bytes: Buffer }): void {
  expect(upload.parts).toBe(1)
  expect(upload.part).toBe("file")
  expect(upload.fileName).toBe("signature.png")
  expect(upload.search).toBe("")
  expect([...upload.bytes.subarray(0, 8)]).toEqual(PNG_MAGIC)
  expect(upload.bytes.length).toBeLessThanOrEqual(MB)
}

test.describe("Signature (Story 2.4)", () => {
  test("UJ-3: #signature → Edit → draw → Save uploads one PNG; toast; the read view shows the new thumbnail; h2 focused", async ({ page }) => {
    const server = await openSignature(page, null)
    await expect(page.locator("#signature")).toBeInViewport()
    const puts = await mockUserEdit(page)
    const deletes = await mockPersonalFileDelete(page, server.relations)
    const uploads = await mockPersonalSignatureUpload(page, server.uploaded)
    await editSignature(page)
    // The paper pad: up to 480 px wide, 160 px tall, the cue while empty, 44 px Clear and Upload.
    const box = await section(page).locator('[data-slot="signature-pad"]').boundingBox()
    expect(box && box.width <= 480 && box.height === 160).toBe(true)
    await expect(section(page).getByText("Draw your signature", { exact: true })).toBeVisible()
    await expect(pad(page)).toHaveAccessibleDescription(/Draw with a mouse, finger or pen, or upload a PNG or JPEG\. Drawing needs a mouse, finger or pen\. To add your signature with a keyboard, use Upload image instead\./)
    await expect(pad(page)).toHaveCSS("touch-action", "none")
    for (const name of ["Clear", "Upload image instead"]) expect((await section(page).getByRole("button", { name, exact: true }).boundingBox())?.height, name).toBe(44)
    await expect(section(page).getByText("Unsaved changes")).toHaveCount(0)

    await drawOnPad(page)
    await expect(section(page).getByText("Unsaved changes")).toBeVisible()
    await expect(section(page).getByText("Draw your signature", { exact: true })).toHaveCount(0)
    await section(page).getByRole("button", { name: "Save" }).click()

    await expectReadView(page)
    expect(puts()).toEqual([])
    expect(uploads()).toHaveLength(1)
    expectSignaturePng(uploads()[0])
    expect(deletes()).toEqual([])
    const img = (await valueCell(page, "Signature")).getByRole("img", { name: "Your signature" })
    await expect(img).toHaveAttribute("src", "/api/1h/v2/file/57/download")
    await expect(await valueCell(page, "Signature")).not.toContainText("Added")
    await expect(toastWith(page, "Personal information saved.")).toBeVisible()
    await expect(section(page).getByRole("heading", { level: 2, name: "Personal information" })).toBeFocused()
  })

  test("Edit with a saved Signature: the pad shows it, the Section stays clean and Save sends nothing", async ({ page }) => {
    await openSignature(page, PERSONAL_SIGNATURE_FILE_ID)
    const uploads = await mockPersonalSignatureUpload(page)
    const puts = await mockUserEdit(page)
    await editSignature(page)
    await expect(pad(page)).not.toHaveAttribute("data-empty", "true")
    await expect(section(page).getByText("Draw your signature", { exact: true })).toHaveCount(0)
    await expect(section(page).getByText("Unsaved changes")).toHaveCount(0)
    await section(page).getByRole("button", { name: "Save" }).click()
    await expectReadView(page)
    expect(uploads()).toEqual([])
    expect(puts()).toEqual([])
  })

  test("Clear → Save → confirm: Cancel and Escape send nothing; Remove signature deletes the saved file; the read view says Not provided", async ({ page }) => {
    const server = await openSignature(page, PERSONAL_SIGNATURE_FILE_ID)
    const deletes = await mockPersonalFileDelete(page, server.relations)
    const uploads = await mockPersonalSignatureUpload(page)
    await editSignature(page)
    await section(page).getByRole("button", { name: "Clear", exact: true }).click()
    await expect(pad(page)).toHaveAttribute("data-empty", "true")
    await expect(section(page).getByText("Unsaved changes")).toBeVisible()
    const save = section(page).getByRole("button", { name: "Save" })

    await save.click()
    await expect(confirmDialog(page)).toBeVisible()
    await expect(confirmDialog(page)).toContainText("Documents you sign will no longer carry it.")
    await expect(confirmDialog(page).getByRole("button", { name: "Cancel" })).toBeFocused()
    const results = await new AxeBuilder({ page }).include('[role="alertdialog"]').withTags(WCAG).analyze()
    expect(results.violations, "Remove confirm").toEqual([])
    await confirmDialog(page).getByRole("button", { name: "Cancel" }).click()
    await expect(confirmDialog(page)).toHaveCount(0)
    await expect(save).toBeFocused()
    await expect(section(page).getByText("Editing")).toBeVisible()
    await expect(pad(page)).toHaveAttribute("data-empty", "true")

    await save.click()
    await expect(confirmDialog(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(confirmDialog(page)).toHaveCount(0)
    await expect(section(page).getByText("Editing")).toBeVisible()
    expect(deletes()).toEqual([])

    await save.click()
    await confirmDialog(page).getByRole("button", { name: "Remove signature" }).click()
    await expectReadView(page)
    expect(deletes()).toEqual([{ id: String(PERSONAL_SIGNATURE_FILE_ID), status: 204 }])
    expect(server.relations.ids).toEqual([])
    expect(uploads()).toEqual([])
    await expect(await valueCell(page, "Signature")).toHaveText("Not provided")
  })

  test("Upload image instead: a PNG replaces the saved Signature (upload, then the old file's delete)", async ({ page }) => {
    const server = await openSignature(page, PERSONAL_SIGNATURE_FILE_ID)
    const deletes = await mockPersonalFileDelete(page, server.relations)
    const uploads = await mockPersonalSignatureUpload(page, server.uploaded)
    await editSignature(page)
    await section(page).getByTestId("signature-file-input").setInputFiles({ name: "my-signature.png", mimeType: "image/png", buffer: PNG_1X1 })
    await expect(section(page).getByText("Unsaved changes")).toBeVisible()
    await section(page).getByRole("button", { name: "Save" }).click()
    await expectReadView(page)
    expect(uploads()).toHaveLength(1)
    expectSignaturePng(uploads()[0])
    expect(uploads()[0].bytes.equals(PNG_1X1)).toBe(false)
    // The named op owns the replaced old relation: it is deleted (204) and gone afterwards.
    expect(deletes()).toEqual([{ id: String(PERSONAL_SIGNATURE_FILE_ID), status: 204 }])
    expect(server.relations.ids).toEqual([57])
    await expect((await valueCell(page, "Signature")).getByRole("img")).toHaveAttribute("src", "/api/1h/v2/file/57/download")
  })

  test("Upload image instead: a real JPEG is decoded and re-encoded in the browser; the upload is a PNG ≤ 1 MB without its EXIF", async ({ page }) => {
    const server = await openSignature(page, null)
    const uploads = await mockPersonalSignatureUpload(page, server.uploaded)
    await editSignature(page)
    await section(page).getByTestId("signature-file-input").setInputFiles({ name: "scan.jpg", mimeType: "image/jpeg", buffer: PERSONAL_SIGNATURE_JPEG })
    await expect(section(page).getByText("Unsaved changes")).toBeVisible()
    await expect(section(page).getByText("Choose a PNG or JPEG image.")).toHaveCount(0)
    await section(page).getByRole("button", { name: "Save" }).click()
    await expectReadView(page)
    expect(uploads()).toHaveLength(1)
    expectSignaturePng(uploads()[0])
    expect(uploads()[0].bytes.includes(Buffer.from("Exif", "ascii"))).toBe(false)
    expect(server.relations.ids).toEqual([57])
  })

  test("a GIF or a renamed text file is refused under the pad; the pad is unchanged", async ({ page }) => {
    await openSignature(page, null)
    await editSignature(page)
    const input = section(page).getByTestId("signature-file-input")
    await input.setInputFiles({ name: "sig.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") })
    await expect(section(page).getByText("Choose a PNG or JPEG image.")).toBeVisible()
    await input.setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: Buffer.from("just some text") })
    await expect(section(page).getByText("Choose a PNG or JPEG image.")).toBeVisible()
    await expect(pad(page)).toHaveAttribute("data-empty", "true")
    await expect(section(page).getByText("Unsaved changes")).toHaveCount(0)
  })

  test("the PUT saves but the upload fails: the name is saved, the Signature error shows, Retry sends only the upload", async ({ page }) => {
    const server = await openSignature(page, null)
    const puts = await mockUserEdit(page, (request) => {
      server.state.firstName = (request.postDataJSON() as { firstName: string }).firstName
      return { status: 200, body: server.body() }
    })
    const uploads = await mockPersonalSignatureUpload(page, (attempt) => (attempt === 1 ? { status: 500, body: { message: "boom" } } : server.uploaded()))
    await editSignature(page)
    await control(page, "First name").fill("Anna")
    await drawOnPad(page)
    await section(page).getByRole("button", { name: "Save" }).click()
    await expect(section(page).getByText("Couldn't save your signature. Try again.")).toBeVisible()
    await expect(section(page).getByText("Editing")).toBeVisible()
    await expect(pad(page)).not.toHaveAttribute("data-empty", "true")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anna Lee")
    expect(puts()).toEqual([{ firstName: "Anna" }])

    await section(page).getByRole("button", { name: "Retry" }).click()
    await expectReadView(page)
    expect(puts()).toEqual([{ firstName: "Anna" }])
    expect(uploads()).toHaveLength(2)
    expectSignaturePng(uploads()[1])
    await expect((await valueCell(page, "Signature")).getByRole("img")).toHaveAttribute("src", "/api/1h/v2/file/57/download")
  })

  test("a rotation across 768 px keeps the drawing (the pad remounts with its strokes) and Save uploads it", async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 1000 })
    const server = await openSignature(page, null)
    const uploads = await mockPersonalSignatureUpload(page, server.uploaded)
    await editSignature(page)
    await drawOnPad(page)
    await page.setViewportSize({ width: 1000, height: 740 })
    await expect(section(page).locator("table")).toBeVisible()
    await expect(pad(page)).not.toHaveAttribute("data-empty", "true")
    await expect(section(page).getByText("Unsaved changes")).toBeVisible()
    await section(page).getByRole("button", { name: "Save" }).click()
    await expectReadView(page)
    expect(uploads()).toHaveLength(1)
    expectSignaturePng(uploads()[0])
  })

  test("edge ink survives narrower remounts and repeated resizing in the exported PNG", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 740 })
    const server = await openSignature(page, null)
    const uploads = await mockPersonalSignatureUpload(page, server.uploaded)
    await editSignature(page)
    await pad(page).scrollIntoViewIfNeeded()
    const box = await pad(page).boundingBox()
    if (!box) throw new Error("no pad")
    await page.mouse.move(box.x + box.width - 12, box.y + 24)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 12, box.y + box.height - 24, { steps: 16 })
    await page.mouse.up()
    const bounds = () => pad(page).evaluate((element) => {
      const canvas = element as HTMLCanvasElement
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
      const ratio = canvas.width / canvas.getBoundingClientRect().width
      let minX = canvas.width
      let maxX = -1
      let minY = canvas.height
      let maxY = -1
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
      return { minX: minX / ratio, maxX: maxX / ratio, minY: minY / ratio, maxY: maxY / ratio, width: canvas.width / ratio, height: canvas.height / ratio }
    })
    const original = await bounds()
    expect(original.maxX).toBeGreaterThan(original.width - 20)
    for (const width of [360, 1000, 360]) {
      await page.setViewportSize({ width, height: 740 })
      await expect.poll(async () => {
        const next = await bounds()
        const scale = Math.min(next.width / original.width, next.height / original.height)
        const x = (next.width - original.width * scale) / 2
        const y = (next.height - original.height * scale) / 2
        return Math.max(
          Math.abs(next.minX - (x + original.minX * scale)),
          Math.abs(next.maxX - (x + original.maxX * scale)),
          Math.abs(next.minY - (y + original.minY * scale)),
          Math.abs(next.maxY - (y + original.maxY * scale)),
        )
      }).toBeLessThan(2)
    }
    await section(page).getByRole("button", { name: "Save" }).click()
    await expectReadView(page)
    expect(uploads()).toHaveLength(1)
    expectSignaturePng(uploads()[0])
    // Decode the actual uploaded PNG too: the edge drawing must still contain ink.
    const ink = await page.evaluate(async (base64) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      return pixels.some((alpha, index) => index % 4 === 3 && alpha > 0)
    }, uploads()[0].bytes.toString("base64"))
    expect(ink).toBe(true)
  })

  test("the pad at 360 px: full width, no horizontal scroll; axe passes on the pad in light and dark", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openSignature(page, PERSONAL_SIGNATURE_FILE_ID)
    await editSignature(page)
    await expect(pad(page)).not.toHaveAttribute("data-empty", "true")
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    const first = await control(page, "First name").boundingBox()
    const padBox = await section(page).locator('[data-slot="signature-pad"]').boundingBox()
    expect(Math.abs((padBox?.width ?? 0) - (first?.width ?? -10))).toBeLessThanOrEqual(1)
    await drawOnPad(page)
    await section(page).getByTestId("signature-file-input").setInputFiles({ name: "sig.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") })
    await expect(section(page).getByText("Choose a PNG or JPEG image.")).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#personal").withTags(WCAG).analyze()
      expect(results.violations, `Signature pad (${theme})`).toEqual([])
    }
  })
})
