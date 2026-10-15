import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { ANN, mockContacts, mockMyself, mockProxy, mockUserEdit, setTheme, signIn } from "./fixtures"

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const FIXTURE = "/test-fixtures/section"

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

const section = (page: Page) => page.getByTestId("fixture-section")
const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Phone" })
const number = (page: Page) => section(page).getByRole("textbox", { name: "Number" })
const note = (page: Page) => section(page).getByRole("textbox", { name: /^Note/ })

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockMyself(page)
  await mockContacts(page)
  await page.goto(FIXTURE)
  await expect(heading(page)).toBeVisible()
})

test.describe("Section edit model (spec F3-2, fixture Section)", () => {
  test("keyboard: Edit → invalid Save (nothing sent, focus on the field) → fix → Save → h2 focused, toast announced", async ({ page }) => {
    await expectNoAxeViolations(page, "read view")
    await expectNoHorizontalScroll(page)

    await section(page).getByRole("button", { name: "Edit" }).focus()
    await page.keyboard.press("Enter")
    await expect(number(page)).toBeFocused()
    await expect(section(page).getByText("Editing")).toBeVisible()

    // Enter never submits, Escape never cancels.
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("12")
    await page.keyboard.press("Enter")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("saves-sent")).toHaveText("0")
    await expect(number(page)).toHaveValue("12")

    // Unsaved changes in a polite live region.
    const indicator = section(page).getByText("Unsaved changes")
    await expect(indicator).toBeVisible()
    await expect(indicator.locator("xpath=..")).toHaveAttribute("aria-live", "polite")

    // Blur validation, then Save with the invalid field: nothing sent, focus moves to it.
    await page.keyboard.press("Tab")
    await expect(note(page)).toBeFocused()
    await expect(number(page)).toHaveAttribute("aria-invalid", "true")
    await expect(number(page)).toHaveAccessibleDescription("Enter a 10-digit US number")
    await expectNoAxeViolations(page, "edit view with an error")
    await expectNoHorizontalScroll(page)
    await section(page).getByRole("button", { name: "Save" }).focus()
    await page.keyboard.press("Enter")
    await expect(number(page)).toBeFocused()
    await expect(page.getByTestId("saves-sent")).toHaveText("0")

    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("4155550000")
    await section(page).getByRole("button", { name: "Save" }).focus()
    await page.keyboard.press("Enter")
    // Saving: busy Save, read-only inputs, inert Cancel; a second press sends nothing more.
    const busy = section(page).getByRole("button", { name: "Saving…" })
    await expect(busy).toHaveAttribute("aria-busy", "true")
    await expect(number(page)).toHaveAttribute("readonly", "")
    await expect(section(page).getByRole("button", { name: "Cancel" })).toHaveAttribute("aria-disabled", "true")
    await page.keyboard.press("Enter")
    await expect(heading(page)).toBeFocused()
    await expect(page.getByTestId("saves-sent")).toHaveText("1")
    await expect(section(page).getByRole("cell", { name: "4155550000" })).toBeVisible()
    await expect(page.getByRole("region", { name: /Notifications/ }).getByText("Phone saved.")).toBeVisible()
    await expectNoAxeViolations(page, "after save with the toast")
  })

  test("Cancel reverts with no confirm and focuses the h2; reverting a change clears the indicator", async ({ page }) => {
    await section(page).getByRole("button", { name: "Edit" }).click()
    await number(page).fill("4155550000")
    await expect(section(page).getByText("Unsaved changes")).toBeVisible()
    await number(page).fill("4155512125")
    await expect(section(page).getByText("Unsaved changes")).toHaveCount(0)
    await number(page).fill("4155550000")
    await section(page).getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(heading(page)).toBeFocused()
    await expect(section(page).getByRole("cell", { name: "4155512125" })).toBeVisible()
  })

  test("a failed save keeps the edit, shows the Section error with Retry (focused) and the error toast; Retry saves", async ({ page }) => {
    await page.getByLabel("Fail the next save").check()
    await section(page).getByRole("button", { name: "Edit" }).click()
    await number(page).fill("4155550000")
    await section(page).getByRole("button", { name: "Save" }).click()
    const message = "Couldn't save phone. Check your connection."
    const banner = section(page).locator("[data-slot~='inline-banner']")
    await expect(banner).toBeFocused()
    await expect(banner.getByRole("alert")).toHaveText(message)
    await expect(page.getByRole("region", { name: /Notifications/ }).getByText(message)).toBeVisible()
    await expect(number(page)).toHaveValue("4155550000")
    await expectNoAxeViolations(page, "save error")
    await expectNoHorizontalScroll(page)
    await banner.getByRole("button", { name: "Retry" }).click()
    await expect(heading(page)).toBeFocused()
    await expect(page.getByTestId("saves-sent")).toHaveText("2")
  })

  test("controls are at least 44 px tall (Edit, Add row, Cancel, Save, Retry); inputs use 16 px text", async ({ page }) => {
    const tall = async (name: string) => {
      const box = await section(page).getByRole("button", { name, exact: true }).boundingBox()
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44)
    }
    await tall("Edit")
    await section(page).getByRole("button", { name: "Edit" }).click()
    for (const name of ["Add row", "Cancel", "Save"]) await tall(name)
    await section(page).getByRole("button", { name: "Add row" }).click()
    await expect(page.getByTestId("rows-added")).toHaveText("1")
    for (const field of [number(page), note(page)]) {
      expect((await field.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(await field.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px")
    }
    await page.getByLabel("Fail the next save").check()
    await number(page).fill("4155550000")
    await section(page).getByRole("button", { name: "Save" }).click()
    await tall("Retry")
    await expectNoHorizontalScroll(page)
  })

  test("layout per width: 4-column/table edit on desktop, stacked label-above-control edit below 768 px; axe and no horizontal scroll", async ({ page, isMobile }) => {
    const readCells = section(page).getByRole("row").first().locator("th, td")
    await expect(readCells).toHaveCount(isMobile ? 2 : 4)
    await section(page).getByRole("button", { name: "Edit" }).click()
    if (isMobile) {
      await expect(section(page).getByRole("table")).toHaveCount(0)
      await expect(section(page).getByRole("group", { name: "Phone" })).toBeVisible()
      const label = await section(page).getByText("Number", { exact: true }).boundingBox()
      const input = await number(page).boundingBox()
      expect((label?.y ?? 0) + (label?.height ?? 0)).toBeLessThanOrEqual(input?.y ?? 0)
      expect(input?.width ?? 0).toBeGreaterThan(280)
    } else {
      await expect(section(page).getByRole("table", { name: "Phone" })).toBeVisible()
      expect((await number(page).boundingBox())?.width ?? 0).toBeLessThanOrEqual(480)
    }
    await expectNoAxeViolations(page, `edit view (${isMobile ? "360" : "desktop"})`)
    await expectNoHorizontalScroll(page)
  })
})

/** The phone-duplicate upstream 400 (`lib/api/errors/contacts.ts`), shown at the Number field. */
const DUPLICATE = { message: "Duplicate Contact Points specified.", code: 400 }
const toasts = (page: Page) => page.getByRole("region", { name: /Notifications/ })
const sectionBanner = (page: Page) => section(page).locator("[data-slot~='inline-banner']")
const draftKey = (userId: number) => `pp:draft:v1:demo:${userId}:phone`
const storedDraft = (page: Page, key: string) => page.evaluate((name) => window.localStorage.getItem(name), key)

/** Edit → type → send the next save as a real PUT (`v2/user/edit`) → Save. */
async function saveToServer(page: Page, value = "4155550000"): Promise<void> {
  await section(page).getByRole("button", { name: "Edit" }).click()
  await number(page).fill(value)
  await page.getByLabel("Send the next save to the server").check()
  await section(page).getByRole("button", { name: "Save" }).click()
}

test.describe("save errors, toasts and load errors (Story 1.12, fixture Section; spec NG-9027)", () => {
  test("a mapped 400 (phone duplicate): the error at Number with focus there, edits kept, no toast; axe", async ({ page }) => {
    const edits = await mockUserEdit(page, { status: 400, body: DUPLICATE })
    await saveToServer(page)
    await expect(number(page)).toBeFocused()
    await expect(number(page)).toHaveAttribute("aria-invalid", "true")
    await expect(number(page)).toHaveAccessibleDescription("This number is already on your profile")
    await expect(number(page)).toHaveValue("4155550000")
    await expect(section(page).getByText("Editing")).toBeVisible()
    expect(edits()).toEqual([{ number: "4155550000", note: "" }])
    await expect(sectionBanner(page)).toHaveCount(0)
    await expect(toasts(page).locator("li")).toHaveCount(0)
    await expectNoAxeViolations(page, "mapped field error")
    await expectNoHorizontalScroll(page)
  })

  test("a generic 400: \"Couldn't save phone.\" with Retry at Section level (focused), no toast", async ({ page }) => {
    await mockUserEdit(page, { status: 400, body: { message: "Something else.", code: 400 } })
    await saveToServer(page)
    const banner = sectionBanner(page)
    await expect(banner).toBeFocused()
    await expect(banner.getByRole("alert")).toHaveText("Couldn't save phone.")
    await expect(banner.getByRole("button", { name: "Retry" })).toBeVisible()
    await expect(number(page)).toHaveValue("4155550000")
    await expect(toasts(page).locator("li")).toHaveCount(0)
    await expectNoAxeViolations(page, "generic save error")
  })

  test("toasts are announced politely; the network error toast's own Retry saves (\"Phone saved.\")", async ({ page }) => {
    const message = "Couldn't save phone. Check your connection."
    await page.getByLabel("Fail the next save").check()
    await section(page).getByRole("button", { name: "Edit" }).click()
    await number(page).fill("4155550000")
    await section(page).getByRole("button", { name: "Save" }).click()
    await expect(toasts(page).getByText(message)).toBeVisible()
    // Radix announces each toast in a polite status region (the toaster's type="background").
    await expect(page.locator("[role='status'][aria-live='polite']").filter({ hasText: message })).toBeAttached()
    await toasts(page).getByRole("button", { name: "Retry" }).click()
    await expect(toasts(page).getByText("Phone saved.")).toBeVisible()
    await expect(page.locator("[role='status'][aria-live='polite']").filter({ hasText: "Phone saved." })).toBeAttached()
    await expect(toasts(page).getByText(message)).toHaveCount(0)
    await expect(page.getByTestId("saves-sent")).toHaveText("2")
    await expect(section(page).getByRole("cell", { name: "4155550000" })).toBeVisible()
  })

  test("the Section load error: \"Couldn't load phones\" + Retry (myself 404 once, then 200), with no page banner", async ({ page }) => {
    let calls = 0
    await mockProxy(page, "v2/user/myself", () => (++calls === 1 ? { status: 404, body: { message: "Not found", code: 404 } } : { body: ANN }))
    await page.reload()
    const banner = page.locator("[data-slot~='inline-banner']").filter({ hasText: "Couldn't load phones" })
    await expect(banner).toBeVisible()
    await expect(heading(page)).toHaveCount(0)
    await expect(page.getByText("Something went wrong while loading profile information")).toHaveCount(0)
    await expectNoAxeViolations(page, "Section load error")
    await banner.getByRole("button", { name: "Retry" }).click()
    await expect(heading(page)).toBeVisible()
    await expect(section(page).getByRole("cell", { name: "4155512125" })).toBeVisible()
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  test("D-A: another user launched in this browser → the save sends nothing, the session dialog shows, the draft stays under the page user", async ({ page }) => {
    // The page loaded as Ann (42); the session is now another user's (43).
    const checks = await mockProxy(page, "v2/user/myself", { body: { ...ANN, id: 43, firstName: "Bo" } })
    const edits = await mockUserEdit(page)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await saveToServer(page)
    await expect(page.getByRole("alertdialog", { name: "Your session ended" })).toBeVisible()
    expect(checks().length).toBeGreaterThanOrEqual(1)
    expect(edits()).toEqual([])
    // The Section stays in edit with the user's value and no error UI.
    await expect(section(page).getByText("Editing")).toBeVisible()
    await expect(section(page).getByRole("textbox", { name: "Number", includeHidden: true })).toHaveValue("4155550000")
    await expect(sectionBanner(page)).toHaveCount(0)
    await expect(toasts(page).locator("li")).toHaveCount(0)
    expect(JSON.parse((await storedDraft(page, draftKey(ANN.id))) ?? "null")).toMatchObject({ values: { number: "4155550000", note: "" } })
    expect(await storedDraft(page, draftKey(43))).toBeNull()
  })
})
