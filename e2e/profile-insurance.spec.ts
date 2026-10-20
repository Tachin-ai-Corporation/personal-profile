import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  ANN,
  insurancePage,
  insurancePolicy,
  mockInsurance,
  mockInsuranceCard,
  mockInsuranceCreate,
  mockInsurers,
  mockInsuranceTypeKey,
  mockInsuranceUpdate,
  mockMyself,
  mockProfileDefaults,
  setTheme,
  signIn,
  test,
} from "./fixtures"

/**
 * Stories 5.1–5.2 (Team A, NG-9029): the Insurance Section on the real
 * `/?tab=insurance`, on desktop and at 360 px: the policy cards (5.1) and the
 * Add / Edit drawer with its leave guard (5.2). Every test runs under the
 * fail-fast `test`, starts from `mockProfileDefaults` (no policies) and
 * overrides the policy list and the card images. The image headers of the
 * download entry are unit-tested (`allowlist/insurance.test.ts`); here the
 * images are answered in the browser.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

/** The I/O matrix's "Cards" row: the Deleted Vision policy first in platform order. */
const MEDICAL = insurancePolicy()
const DENTAL = insurancePolicy({
  id: 56,
  insuranceType: "DENTAL",
  insurancePrecedence: "SECONDARY",
  relationshipToInsured: "SPOUSE",
  insuranceOrganizationDTO: { insuranceCompanyName: "Delta Dental" },
  subscriber: { firstName: "Sam", lastName: "Lee" },
  insuranceGroupId: "n/a",
  frontSideCardFile: null,
  backSideCardFile: null,
})
const VISION = insurancePolicy({ id: 57, insuranceType: "VISION", label: "Deleted", insuranceOrganizationDTO: { insuranceCompanyName: "VSP" }, backSideCardFile: null })
const CARDS = insurancePage([VISION, MEDICAL, DENTAL])

const section = (page: Page): Locator => page.getByRole("region", { name: "Insurance" })
const card = (page: Page, title: string): Locator => section(page).getByRole("article", { name: title })
const frontThumb = (page: Page): Locator => card(page, "Medical Insurance").getByRole("button", { name: "Front of UnitedHealthcare Medical Insurance card" })

/** The value cell of a key in a card's grid. */
async function valueOf(container: Locator, key: string): Promise<Locator> {
  const id = await container.getByRole("rowheader", { name: key, exact: true }).getAttribute("id")
  return container.locator(`td[headers="${id}"]`)
}

async function open(page: Page, body: unknown = CARDS): Promise<void> {
  await mockProfileDefaults(page)
  await mockMyself(page, { body: { ...ANN, firstName: "Avery" } })
  await mockInsurance(page, { body })
  await page.goto("/?tab=insurance")
  await expect(page.getByRole("heading", { level: 1, name: "Avery Lee" })).toBeVisible()
}

async function axe(page: Page, label: string, include = "#insurance"): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).include(include).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("Insurance policies (Story 5.1)", () => {
  test("cards: active first, count 2, chips, own name on Self, tiles for missing sides, a muted Deleted card without actions", async ({ page }) => {
    const images = await mockInsuranceCard(page)
    await open(page)
    await expect(section(page).getByRole("heading", { level: 3 })).toHaveText(["Medical Insurance", "Dental Insurance", "Vision Insurance"])
    await expect(section(page).locator('[data-slot="section-meta"]')).toHaveText("2")
    await expect(section(page).locator('[data-slot="chip"]')).toHaveText(["Primary", "Secondary", "Deleted"])
    await expect(await valueOf(card(page, "Medical Insurance"), "Subscriber")).toHaveText("Avery Lee")
    await expect(await valueOf(card(page, "Dental Insurance"), "Subscriber")).toHaveText("Sam Lee")
    // Backend placeholders: the 1970-01-01 Cancellation and the "n/a" Group ID.
    await expect(await valueOf(card(page, "Medical Insurance"), "Cancellation")).toHaveText("Not provided")
    await expect(await valueOf(card(page, "Dental Insurance"), "Group ID")).toHaveText("Not provided")
    await expect(await valueOf(card(page, "Medical Insurance"), "Effective")).toHaveText("01/01/2025")
    await expect(card(page, "Dental Insurance").getByRole("img")).toHaveText(["Image not uploaded", "Image not uploaded"])
    // The thumbnails load through the proxy path, with the session cookie (same origin).
    await expect(frontThumb(page).locator("img")).toHaveJSProperty("complete", true)
    await expect.poll(() => frontThumb(page).locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    expect(images().map((request) => new URL(request.url()).pathname + new URL(request.url()).search)).toEqual(
      expect.arrayContaining([
        "/api/1h/v2/health/insurance/55/file/900/download?fileRelKey=InsuranceHasFrontSideCardFile",
        "/api/1h/v2/health/insurance/55/file/901/download?fileRelKey=InsuranceHasBackSideCardFile",
        "/api/1h/v2/health/insurance/57/file/900/download?fileRelKey=InsuranceHasFrontSideCardFile",
      ]),
    )
    const vision = card(page, "Vision Insurance")
    await expect(vision.getByRole("button")).toHaveCount(0)
    await expect(vision.getByRole("img", { name: "Front of VSP Vision Insurance card" })).toBeVisible()
    // Story 5.2: "Add insurance" in the header and a kebab on each active card (none on the Deleted one).
    await expect(section(page).getByRole("button", { name: "Add insurance" })).toHaveCount(1)
    await expect(section(page).getByRole("button", { name: /^More actions for/ })).toHaveCount(2)
    await expectNoHorizontalScroll(page)
    await axe(page, "cards")
  })

  test("thumbnails sit right of the grid behind a hairline from 768 px, below it at 360 px; targets are at least 44 px", async ({ page, isMobile }) => {
    await mockInsuranceCard(page)
    await open(page)
    const medical = card(page, "Medical Insurance")
    const grid = await medical.getByRole("table").boundingBox()
    const thumbs = await medical.locator('[data-slot="insurance-thumbnails"]').boundingBox()
    const thumb = await frontThumb(page).boundingBox()
    if (!grid || !thumbs || !thumb) throw new Error("no layout")
    if (isMobile) expect(thumbs.y).toBeGreaterThanOrEqual(grid.y + grid.height - 1)
    else expect(thumbs.x).toBeGreaterThanOrEqual(grid.x + grid.width - 1)
    expect([Math.round(thumb.width), Math.round(thumb.height)]).toEqual([120, 76])
    const title = await medical.locator('[data-slot="insurance-card-title"]').boundingBox()
    expect(title?.height).toBeGreaterThanOrEqual(52)
    await expectNoHorizontalScroll(page)
  })

  test("viewer: Enter on Front opens it on Front, Back toggles, Escape returns focus to the thumbnail", async ({ page, isMobile }) => {
    await mockInsuranceCard(page)
    await open(page)
    await frontThumb(page).focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "UnitedHealthcare Medical Insurance card" })
    await expect(dialog).toBeVisible()
    const toggles = dialog.getByRole("group", { name: "Card side" }).getByRole("button")
    await expect(toggles).toHaveText(["Front", "Back"])
    await expect(toggles.nth(0)).toHaveAttribute("aria-pressed", "true")
    await expect(dialog.getByRole("img", { name: "Front of UnitedHealthcare Medical Insurance card" })).toBeVisible()
    if (isMobile) {
      const box = await dialog.boundingBox()
      expect([box?.width, box?.height]).toEqual([360, 740])
    }
    await axe(page, "viewer", '[data-slot="insurance-card-viewer"]')
    await toggles.nth(1).click()
    await expect(toggles.nth(1)).toHaveAttribute("aria-pressed", "true")
    await expect(dialog.getByRole("img", { name: "Back of UnitedHealthcare Medical Insurance card" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(frontThumb(page)).toBeFocused()
  })

  test("viewer: Space on Back opens it; a missing side is disabled; Close returns focus", async ({ page }) => {
    await mockInsuranceCard(page)
    await open(page, insurancePage([insurancePolicy({ frontSideCardFile: null })]))
    const back = card(page, "Medical Insurance").getByRole("button", { name: "Back of UnitedHealthcare Medical Insurance card" })
    await back.focus()
    await page.keyboard.press(" ")
    const dialog = page.getByRole("dialog")
    const toggles = dialog.getByRole("group", { name: "Card side" }).getByRole("button")
    await expect(toggles.nth(1)).toHaveAttribute("aria-pressed", "true")
    await expect(toggles.nth(0)).toHaveAttribute("aria-disabled", "true")
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
    await expect(back).toBeFocused()
  })

  test("a card image the download refuses (404) or that isn't an image shows the tile, silently", async ({ page }) => {
    await mockInsuranceCard(page, 55, 900, { status: 404, contentType: "application/json", body: Buffer.from(JSON.stringify({ message: "Not found" })) })
    await mockInsuranceCard(page, 55, 901, { contentType: "text/html", body: Buffer.from("<html></html>") })
    await open(page, insurancePage([MEDICAL]))
    const medical = card(page, "Medical Insurance")
    await expect(medical.getByRole("img", { name: "Front image not uploaded" })).toHaveText("Image not uploaded")
    await expect(medical.getByRole("img", { name: "Back image not uploaded" })).toHaveText("Image not uploaded")
    // No thumbnail button is left (only the kebab, Story 5.2).
    await expect(medical.getByRole("button", { name: /card$/ })).toHaveCount(0)
    // Silent: no banner or toast (the empty alert is Next's route announcer).
    await expect(section(page).getByRole("alert")).toHaveCount(0)
    await expect(page.getByRole("region", { name: /Notifications/ }).locator("li")).toHaveCount(0)
  })

  test("empty: the dashed empty card with the copy and its primary \"Add insurance\"", async ({ page }) => {
    await open(page, insurancePage([]))
    const empty = section(page).locator('[data-slot="empty-state"]')
    await expect(empty.getByText("No insurance on file. Add a policy before your next visit.")).toBeVisible()
    await expect(empty.getByRole("button", { name: "Add insurance" })).toBeVisible()
    await expect(section(page).locator('[data-slot="section-meta"]')).toHaveText("0")
    await expectNoHorizontalScroll(page)
    await axe(page, "empty")
  })

  test("error: \"Couldn't load insurance · Retry\"; Retry reloads only the list", async ({ page }) => {
    await mockProfileDefaults(page)
    let fail = true
    const reads = await mockInsurance(page, { body: CARDS })
    await page.route("**/api/1h/v2/health/patient/insurance?**", (route) =>
      fail ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) }) : route.fallback(),
    )
    await mockInsuranceCard(page)
    await page.goto("/?tab=insurance")
    await expect(section(page).getByText("Couldn't load insurance")).toBeVisible()
    await axe(page, "error")
    fail = false
    const others: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      const listOrCard = url.pathname === "/api/1h/v2/health/patient/insurance" || /^\/api\/1h\/v2\/health\/insurance\/\d+\/file\/\d+\/download$/.test(url.pathname)
      if (url.pathname.startsWith("/api/1h/") && !listOrCard) others.push(url.pathname)
    })
    await section(page).getByRole("button", { name: "Retry" }).click()
    await expect(card(page, "Medical Insurance")).toBeVisible()
    expect(reads()).toHaveLength(1)
    expect(others).toEqual([])
  })

  test("forbidden: a list 403 shows the Section's no-access row", async ({ page }) => {
    await mockProfileDefaults(page)
    await mockInsurance(page, { status: 403, body: { message: "Forbidden" } })
    await page.goto("/?tab=insurance")
    await expect(section(page).getByText("You don't have access to this in your current account")).toBeVisible()
  })
})

// --- Story 5.2: add and edit a policy ---------------------------------------------------------

const drawer = (page: Page, name: "Add insurance" | "Edit insurance" = "Add insurance"): Locator => page.getByRole("dialog", { name })
const headerAdd = (page: Page): Locator => section(page).locator('[data-slot="section-header"]').getByRole("button", { name: "Add insurance" })
const field = (scope: Locator, label: string): Locator => scope.getByLabel(new RegExp(`^${label}( \\(optional\\))?$`)).first()
const guard = (page: Page): Locator => page.getByRole("alertdialog", { name: "You have unsaved changes" })
const toastWith = (page: Page, text: string): Locator => page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })
/** The error line of the field labelled `label` (the inner locator is matched inside each form field). */
const fieldError = (scope: Locator, label: string): Locator =>
  scope
    .locator('[data-slot="form-field"]')
    .filter({ has: scope.page().getByLabel(new RegExp(`^${label}( \\(optional\\))?$`)) })
    .locator('[data-slot="field-error"]')

/** The editor's reads: the type key with its lists and the insurer search. */
async function openEditor(page: Page, body: unknown = insurancePage([]), myself: Record<string, unknown> = { ...ANN, firstName: "Avery", email: "avery@example.com" }) {
  await mockProfileDefaults(page)
  await mockMyself(page, { body: myself })
  await mockInsurance(page, { body })
  await mockInsuranceTypeKey(page)
  const searches = await mockInsurers(page)
  await mockInsuranceCard(page)
  await page.goto("/?tab=insurance")
  await expect(section(page).locator('[data-slot="state-frame"]')).toHaveAttribute("data-state", "ready")
  return { searches }
}

async function pickOption(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

/** Fills a valid Self policy with the pointer: Blue Shield, Medical, Primary, Self, XKH123, effective 01/01/2025. */
async function fillSelf(page: Page, scope: Locator): Promise<void> {
  await field(scope, "Insurer").fill("Blu")
  await page.getByRole("option", { name: "Blue Shield", exact: true }).click()
  await pickOption(page, field(scope, "Type"), "Medical")
  await pickOption(page, field(scope, "Precedence"), "Primary")
  await pickOption(page, field(scope, "Relationship"), "Self")
  await field(scope, "Member ID").fill("XKH123")
  await field(scope, "Effective date").fill("01012025")
}

const SAM = { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: "+14155552125", phoneNumberRegion: "us", birthDate: "1980-05-04" }

test.describe("Add and edit a policy (Story 5.2)", () => {
  test("Add, listed insurer: the drawer, one POST, the toast, the new card, focus back on Add insurance", async ({ page, isMobile }) => {
    const { searches } = await openEditor(page)
    const posts = await mockInsuranceCreate(page)
    const add = headerAdd(page)
    await expect(add).toHaveCSS("border-top-width", "1px")
    await add.click()
    const sheet = drawer(page)
    await expect(sheet).toBeVisible()
    await expect(field(sheet, "Insurer")).toBeFocused()
    const box = await sheet.boundingBox()
    if (isMobile) {
      expect([box?.width, box?.height]).toEqual([360, 740])
      await expect(sheet.getByRole("button", { name: "Back" })).toBeVisible()
      await expect(sheet.getByRole("button", { name: "Close" })).toBeHidden()
    } else {
      expect(box?.width).toBe(480)
      await expect(sheet.getByRole("button", { name: "Close" })).toBeVisible()
    }
    await fillSelf(page, sheet)
    expect(new URL(searches().at(-1)?.url() ?? "").search).toBe("?name=Blu&page=0&size=20")
    await mockInsurance(page, { body: insurancePage([insurancePolicy({ id: 60, insuranceOrganizationDTO: { insuranceCompanyName: "Blue Shield", insuranceCompanyId: 7 } })]) })
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    expect(posts()).toEqual([
      {
        insuranceOrganizationDTO: { insuranceCompanyId: 7 },
        insuranceType: "MEDICAL",
        insurancePrecedence: "PRIMARY",
        relationshipToInsured: "SELF",
        memberIdNumber: "XKH123",
        planEffectiveDate: "2025-01-01",
      },
    ])
    await expect(toastWith(page, "Insurance saved.")).toBeVisible()
    await expect(card(page, "Medical Insurance")).toBeVisible()
    await expect(headerAdd(page)).toBeFocused()
  })

  test("keyboard only, from the empty card: a new insurer by name, Drug, a Spouse subscriber; own email and age 17 refused", async ({ page, isMobile }) => {
    // Keyboard-only completion is a desktop journey (the 360 px project is a touch device; its journeys are the pointer ones).
    test.skip(isMobile, "keyboard-only journey runs on desktop")
    await openEditor(page)
    const posts = await mockInsuranceCreate(page)
    await section(page).locator('[data-slot="empty-state"]').getByRole("button", { name: "Add insurance" }).focus()
    await page.keyboard.press("Enter")
    const sheet = drawer(page)
    await expect(field(sheet, "Insurer")).toBeFocused()
    await page.keyboard.type("Acme Health")
    await expect(page.getByRole("option", { name: "Add “Acme Health”" })).toBeVisible()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(field(sheet, "Insurer")).toHaveValue("Acme Health")
    const choose = async (label: string, option: string) => {
      await field(sheet, label).focus()
      await page.keyboard.press("Enter")
      const listbox = page.getByRole("listbox")
      await expect(listbox).toBeVisible()
      const options = listbox.getByRole("option")
      // Home: the first option, whichever the list focused on opening.
      await expect(options.first()).toBeVisible()
      await page.keyboard.press("Home")
      await expect(options.first()).toBeFocused()
      const index = (await options.allTextContents()).indexOf(option)
      for (let step = 1; step <= index; step += 1) {
        await page.keyboard.press("ArrowDown")
        await expect(options.nth(step)).toBeFocused()
      }
      await page.keyboard.press("Enter")
      await expect(listbox).toHaveCount(0)
      await expect(field(sheet, label)).toHaveText(option)
    }
    await choose("Type", "Drug")
    await choose("Precedence", "Secondary")
    await choose("Relationship", "Spouse")
    const subscriber = sheet.getByRole("group", { name: "Subscriber" })
    await expect(subscriber.getByText("If they aren't on 1health yet, we'll invite them by email.")).toBeVisible()
    await field(sheet, "Member ID").focus()
    await page.keyboard.type("ACM-555")
    await field(sheet, "Effective date").focus()
    await page.keyboard.type("03012025")
    await field(subscriber, "First name").focus()
    await page.keyboard.type("Sam")
    await expect(subscriber.getByText("If Sam isn't on 1health yet, we'll invite them by email.")).toBeVisible()
    await page.keyboard.press("Tab")
    await page.keyboard.type("Lee")
    await expect(field(subscriber, "Last name")).toHaveValue("Lee")
    await field(subscriber, "Email").focus()
    await page.keyboard.type("AVERY@example.com")
    await field(subscriber, "Phone").focus()
    await page.keyboard.type("4155552125")
    const seventeen = new Date()
    seventeen.setFullYear(seventeen.getFullYear() - 17)
    await field(subscriber, "Birth date").focus()
    await page.keyboard.type(`${String(seventeen.getMonth() + 1).padStart(2, "0")}${String(seventeen.getDate()).padStart(2, "0")}${seventeen.getFullYear()}`)
    const save = sheet.getByRole("button", { name: "Save" })
    await save.focus()
    await page.keyboard.press("Enter")
    await expect(fieldError(subscriber, "Email")).toHaveText("Use the subscriber's email, not yours")
    await expect(fieldError(subscriber, "Birth date")).toHaveText("You must be 18 to 120 years old")
    await expect(field(subscriber, "Email")).toBeFocused()
    expect(posts()).toEqual([])
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("sam@example.com")
    await field(subscriber, "Birth date").focus()
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("05041980")
    await save.focus()
    await page.keyboard.press("Enter")
    await expect(sheet).toBeHidden()
    expect(posts()).toEqual([
      {
        insuranceOrganizationDTO: { insuranceCompanyName: "Acme Health" },
        insuranceType: "DRUG",
        insurancePrecedence: "SECONDARY",
        relationshipToInsured: "SPOUSE",
        memberIdNumber: "ACM-555",
        planEffectiveDate: "2025-03-01",
        subscriber: { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: "+14155552125", phoneNumberRegion: "us", birthDate: "1980-05-04" },
      },
    ])
    await expect(headerAdd(page)).toBeFocused()
  })

  test("Edit: pre-filled with the placeholders empty; the PUT sends every field; focus back on the kebab", async ({ page }) => {
    await openEditor(page, insurancePage([insurancePolicy({ insuranceGroupId: "n/a", expirationDate: "1970-01-01", cancellationDate: "1970-01-01" })]))
    const puts = await mockInsuranceUpdate(page)
    const kebab = card(page, "Medical Insurance").getByRole("button", { name: "More actions for UnitedHealthcare Medical Insurance" })
    await kebab.click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    const sheet = drawer(page, "Edit insurance")
    await expect(field(sheet, "Insurer")).toHaveValue("UnitedHealthcare")
    await expect(field(sheet, "Type")).toHaveText("Medical")
    await expect(field(sheet, "Precedence")).toHaveText("Primary")
    await expect(field(sheet, "Relationship")).toHaveText("Self")
    await expect(field(sheet, "Member ID")).toHaveValue("948221037")
    await expect(field(sheet, "Group ID")).toHaveValue("")
    await expect(field(sheet, "Effective date")).toHaveValue("01/01/2025")
    await expect(field(sheet, "Expiration date")).toHaveValue("")
    await expect(field(sheet, "Cancellation date")).toHaveValue("")
    await field(sheet, "Group ID").fill("704512")
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    expect(puts()).toEqual([
      {
        url: "/api/1h/v2/health/patient/insurance/55",
        body: {
          insuranceOrganizationDTO: { insuranceCompanyId: 7 },
          insuranceType: "MEDICAL",
          insurancePrecedence: "PRIMARY",
          relationshipToInsured: "SELF",
          memberIdNumber: "948221037",
          insuranceGroupId: "704512",
          planEffectiveDate: "2025-01-01",
        },
      },
    ])
    await expect(toastWith(page, "Insurance saved.")).toBeVisible()
    await expect(kebab).toBeFocused()
  })

  test("Edit of a Spouse policy: the subscriber is read-only with the reason; the PUT sends it unchanged", async ({ page }) => {
    const spouse = insurancePolicy({ id: 56, insuranceType: "DENTAL", insurancePrecedence: "SECONDARY", relationshipToInsured: "SPOUSE", subscriber: SAM, insuranceOrganizationDTO: { insuranceCompanyName: "Delta Dental", insuranceCompanyId: 9 } })
    await openEditor(page, insurancePage([spouse]))
    const puts = await mockInsuranceUpdate(page)
    await card(page, "Dental Insurance").getByRole("button", { name: /^More actions for/ }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    const sheet = drawer(page, "Edit insurance")
    const subscriber = sheet.getByRole("group", { name: "Subscriber" })
    await expect(subscriber.getByText("To change the policyholder, remove this policy and add it again.")).toBeVisible()
    for (const [label, value] of [["First name", "Sam"], ["Last name", "Lee"], ["Email", "sam@example.com"], ["Phone", "+1 (415) 555-2125"], ["Birth date", "05/04/1980"]] as const) {
      await expect(field(subscriber, label)).toHaveValue(value)
      await expect(field(subscriber, label)).toHaveAttribute("aria-readonly", "true")
      await expect(field(subscriber, label)).toBeEnabled()
    }
    await axe(page, "edit, locked subscriber", '[data-slot="insurance-editor"]')
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    expect(puts()[0]?.body).toMatchObject({ relationshipToInsured: "SPOUSE", subscriber: SAM })
  })

  test("Edit of a Self policy switched to Spouse (decision 3A): no subscriber inputs, the reason, Save blocked, no PUT", async ({ page }) => {
    await openEditor(page, insurancePage([insurancePolicy()]))
    const puts = await mockInsuranceUpdate(page)
    await card(page, "Medical Insurance").getByRole("button", { name: /^More actions for/ }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    const sheet = drawer(page, "Edit insurance")
    await pickOption(page, field(sheet, "Relationship"), "Spouse")
    const subscriber = sheet.getByRole("group", { name: "Subscriber" })
    const reason = subscriber.getByText("To change the policyholder, remove this policy and add it again.")
    await expect(reason).toBeVisible()
    await expect(subscriber.getByRole("textbox")).toHaveCount(0)
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(reason).toBeFocused()
    await expect(sheet).toBeVisible()
    expect(puts()).toEqual([])
  })

  test("a server field error (the duplicate) shows at Member ID; the drawer stays open", async ({ page }) => {
    await openEditor(page)
    await mockInsuranceCreate(page, {
      status: 400,
      body: { message: "Patient with ID {42} already has an existing insurance record associated with Insurance Company ID {7} and Policy Number {XKH123}", code: 400 },
    })
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(fieldError(sheet, "Member ID")).toHaveText("This policy is already on your profile")
    await expect(field(sheet, "Member ID")).toBeFocused()
    await expect(sheet).toBeVisible()
  })

  test("a network failure: \"Couldn't save insurance. Check your connection.\" with Retry", async ({ page }) => {
    await openEditor(page)
    let attempts = 0
    await page.route("**/api/1h/v2/health/patient/insurance", (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      attempts += 1
      return attempts === 1 ? route.abort("connectionfailed") : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 60 }) })
    })
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    await sheet.getByRole("button", { name: "Save" }).click()
    const banner = sheet.locator('[data-slot~="insurance-save-error"]')
    await expect(banner).toContainText("Couldn't save insurance. Check your connection.")
    await expect(banner).toBeFocused()
    await banner.getByRole("button", { name: "Retry" }).click()
    await expect(sheet).toBeHidden()
    expect(attempts).toBe(2)
  })

  test("the value lists fail: an inline error with Retry, and Save is blocked until they load", async ({ page }) => {
    await openEditor(page)
    await mockInsuranceTypeKey(page, { status: 500, body: { message: "boom" } })
    const posts = await mockInsuranceCreate(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    const banner = sheet.locator('[data-slot~="insurance-options-error"]')
    await expect(banner).toContainText("Couldn't load the insurance options.")
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(banner).toBeFocused()
    expect(posts()).toEqual([])
    await mockInsuranceTypeKey(page)
    await banner.getByRole("button", { name: "Retry" }).click()
    await expect(banner).toHaveCount(0)
    await pickOption(page, field(sheet, "Type"), "Medical")
  })

  test("the leave guard: a clean Escape closes at once; a dirty Escape, Cancel or scrim asks; Keep editing keeps, Discard closes", async ({ page, isMobile }) => {
    await openEditor(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await expect(field(sheet, "Insurer")).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
    await expect(guard(page)).toHaveCount(0)
    await expect(headerAdd(page)).toBeFocused()

    await headerAdd(page).click()
    await field(sheet, "Member ID").fill("XKH")
    await page.keyboard.press("Escape")
    await expect(guard(page)).toBeVisible()
    await axe(page, "leave guard over the drawer", '[role="alertdialog"]')
    await guard(page).getByRole("button", { name: "Keep editing" }).click()
    await expect(guard(page)).toBeHidden()
    await expect(field(sheet, "Member ID")).toHaveValue("XKH")

    await sheet.getByRole("button", { name: "Cancel" }).click()
    await expect(guard(page)).toBeVisible()
    await guard(page).getByRole("button", { name: "Keep editing" }).click()
    await expect(guard(page)).toHaveCount(0)
    // The guard is fully closed once focus is back on Cancel and only the drawer's scrim is left.
    await expect(sheet.getByRole("button", { name: "Cancel" })).toBeFocused()
    await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(1)
    if (isMobile) await sheet.getByRole("button", { name: "Back" }).click()
    else await page.mouse.click(100, 300)
    await expect(guard(page)).toBeVisible()
    await guard(page).getByRole("button", { name: "Discard" }).click()
    await expect(sheet).toBeHidden()
    await expect(headerAdd(page)).toBeFocused()
  })

  test("the leave guard's Save: invalid stays on the field; valid saves and closes", async ({ page }) => {
    await openEditor(page)
    const posts = await mockInsuranceCreate(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await field(sheet, "Member ID").fill("XKH123")
    await page.keyboard.press("Escape")
    await guard(page).getByRole("button", { name: "Save" }).click()
    await expect(guard(page)).toBeHidden()
    await expect(field(sheet, "Insurer")).toBeFocused()
    expect(posts()).toEqual([])
    await fillSelf(page, sheet)
    await page.keyboard.press("Escape")
    await guard(page).getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    expect(posts()).toHaveLength(1)
    await expect(toastWith(page, "Insurance saved.")).toBeVisible()
  })

  test("the drawer: axe light and dark (with the subscriber and errors), 44 px targets, no horizontal scroll", async ({ page }) => {
    await openEditor(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await pickOption(page, field(sheet, "Relationship"), "Spouse")
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(fieldError(sheet, "Email")).toHaveText("Email is required")
    await axe(page, "drawer", '[data-slot="insurance-editor"]')
    for (const name of ["Cancel", "Save"]) {
      const box = await sheet.getByRole("button", { name }).boundingBox()
      expect(box?.height, name).toBeGreaterThanOrEqual(44)
    }
    for (const label of ["Insurer", "Type", "Member ID", "Effective date"]) {
      const box = await field(sheet, label).boundingBox()
      expect(box?.height, label).toBeGreaterThanOrEqual(44)
    }
    const overflow = await sheet.locator('[data-slot="sheet-body"]').evaluate((body) => body.scrollWidth - body.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await expectNoHorizontalScroll(page)
  })
})
