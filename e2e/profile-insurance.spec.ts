import { crc32, deflateSync } from "node:zlib"
import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  ANN,
  insurancePage,
  insurancePolicy,
  mockInsurance,
  mockInsuranceCard,
  mockInsuranceCardUpload,
  mockInsuranceCreate,
  mockInsuranceDelete,
  mockInsuranceFileDelete,
  mockInsurers,
  mockInsuranceTypeKey,
  mockInsuranceUpdate,
  insuranceWriteLog,
  mockMyself,
  mockProfileDefaults,
  setTheme,
  signIn,
  test,
} from "./fixtures"

/**
 * Stories 5.1–5.5 (Team A, NG-9029): the Insurance Section on the real
 * `/?tab=insurance`, on desktop and at 360 px: the policy cards (5.1), the
 * Add / Edit drawer with its leave guard (5.2), the card images with
 * their uploads and "Retry upload" (5.3, real-browser checks and re-encode),
 * the Primary-per-type demotion offer (5.4) and the delete with its
 * confirm (5.5). Every test runs under the
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
      await expect(sheet.getByRole("button", { name: "Back", exact: true })).toBeVisible()
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
    if (isMobile) await sheet.getByRole("button", { name: "Back", exact: true }).click()
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

// --- Story 5.3: card image upload with retry ----------------------------------------------------

interface CardFile {
  readonly name: string
  readonly mimeType: string
  readonly buffer: Buffer
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed) >>> 0)
  return Buffer.concat([length, typed, crc])
}

/** A plain grey 8-bit grayscale PNG (compresses to almost nothing, whatever its size). */
function greyPng(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width + 1) * height, 0x80)
  for (let y = 0; y < height; y++) raw[y * (width + 1)] = 0
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 0, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

const png = (name: string, width = 856, height = 540): CardFile => ({ name, mimeType: "image/png", buffer: greyPng(width, height) })

const slotOf = (sheet: Locator, side: "Front" | "Back"): Locator => sheet.getByRole("group", { name: "Card images" }).getByRole("group", { name: side })
const slotInput = (sheet: Locator, side: "front" | "back"): Locator => sheet.getByTestId(`insurance-card-input-${side}`)

test.describe("Card image upload with retry (Story 5.3)", () => {
  test("Add with both images: POST, then front, then back (one JPEG `file` part, no query); \"Insurance saved.\"; the card shows both", async ({ page }) => {
    await openEditor(page)
    const posts = await mockInsuranceCreate(page)
    const uploads = await mockInsuranceCardUpload(page)
    const order: string[] = []
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname
      if (request.method() === "POST" && path.startsWith("/api/1h/")) order.push(path.replace("/api/1h/v2/health/", ""))
    })
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    const group = sheet.getByRole("group", { name: "Card images" })
    await expect(group.getByText("PNG or JPEG, up to 10 MB. Images upload after the policy saves.")).toBeVisible()
    await expect(slotOf(sheet, "Front").getByRole("img", { name: "No image chosen" })).toBeVisible()
    await slotInput(sheet, "front").setInputFiles(png("front card.png"))
    await slotInput(sheet, "back").setInputFiles(png("back.png", 1200, 760))
    await expect(slotOf(sheet, "Front").getByRole("img", { name: "Chosen front image" })).toBeVisible()
    await expect(slotOf(sheet, "Front").getByText(/^front card\.png · \d+ KB$/)).toBeVisible()
    await expect(slotOf(sheet, "Back").getByRole("button", { name: "Remove back image" })).toBeVisible()
    await mockInsurance(page, { body: insurancePage([insurancePolicy({ id: 60, frontSideCardFile: { id: 990 }, backSideCardFile: { id: 991 } })]) })
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    expect(posts()).toHaveLength(1)
    expect(order).toEqual([
      "patient/insurance",
      "type/Insurance/60/relation/InsuranceHasFrontSideCardFile/file/upload",
      "type/Insurance/60/relation/InsuranceHasBackSideCardFile/file/upload",
    ])
    expect(uploads()).toEqual([
      { policyId: "60", side: "front", part: "file", fileName: "front_card.jpg", contentType: "image/jpeg", jpeg: true, parts: 1, search: "" },
      { policyId: "60", side: "back", part: "file", fileName: "back.jpg", contentType: "image/jpeg", jpeg: true, parts: 1, search: "" },
    ])
    await expect(toastWith(page, "Insurance saved.")).toBeVisible()
    await expect(card(page, "Medical Insurance").getByRole("button", { name: "Back of UnitedHealthcare Medical Insurance card" })).toBeVisible()
  })

  test("back upload fails: the policy stays saved; the partial toast; the tile with Retry, which uploads only the back", async ({ page }) => {
    await openEditor(page)
    await mockInsuranceCreate(page)
    const uploads = await mockInsuranceCardUpload(page, (upload, attempt) => (upload.side === "back" && attempt === 2 ? { status: 500, body: { message: "Boom" } } : {}))
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    await slotInput(sheet, "front").setInputFiles(png("front.png"))
    await slotInput(sheet, "back").setInputFiles(png("back.png"))
    await mockInsurance(page, { body: insurancePage([insurancePolicy({ id: 60, frontSideCardFile: { id: 990 }, backSideCardFile: null })]) })
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    await expect(toastWith(page, "Insurance saved. Back image not uploaded.")).toBeVisible()
    const medical = card(page, "Medical Insurance")
    await expect(medical.getByRole("img", { name: "Back image not uploaded" })).toHaveText("Image not uploaded")
    const retry = medical.getByRole("button", { name: "Retry upload of the back image" })
    await expect(retry).toHaveText("Retry upload")
    expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await expectNoHorizontalScroll(page)
    await axe(page, "card with Retry")
    await mockInsurance(page, { body: insurancePage([insurancePolicy({ id: 60, frontSideCardFile: { id: 990 }, backSideCardFile: { id: 992 } })]) })
    await retry.click()
    await expect(toastWith(page, "Card image uploaded.")).toBeVisible()
    await expect(medical.getByRole("button", { name: "Back of UnitedHealthcare Medical Insurance card" })).toBeVisible()
    await expect(medical.getByRole("button", { name: /^Retry upload/ })).toHaveCount(0)
    expect(uploads().map((upload) => `${upload.policyId} ${upload.side}`)).toEqual(["60 front", "60 back", "60 back"])
  })

  test("Replace: the PUT, the new front's upload, then the old file's delete through the named op", async ({ page }) => {
    await openEditor(page, insurancePage([insurancePolicy()]))
    const puts = await mockInsuranceUpdate(page)
    const uploads = await mockInsuranceCardUpload(page)
    const deleted = await mockInsuranceFileDelete(page)
    await card(page, "Medical Insurance").getByRole("button", { name: /^More actions for/ }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    const sheet = drawer(page, "Edit insurance")
    const front = slotOf(sheet, "Front")
    await expect(front.getByRole("img", { name: "Front of UnitedHealthcare Medical Insurance card" })).toBeVisible()
    await expect(front.getByRole("button", { name: "Replace front image" })).toBeVisible()
    await slotInput(sheet, "front").setInputFiles(png("new-front.png"))
    await expect(front.getByRole("img", { name: "Chosen front image" })).toBeVisible()
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    expect(puts()).toHaveLength(1)
    expect(uploads().map((upload) => `${upload.policyId} ${upload.side}`)).toEqual(["55 front"])
    await expect.poll(deleted).toEqual(["900"])
    await expect(toastWith(page, "Insurance saved.")).toBeVisible()
  })

  test("a refused delete of the old file is quiet: the save succeeds", async ({ page }) => {
    await openEditor(page, insurancePage([insurancePolicy()]))
    await mockInsuranceUpdate(page)
    await mockInsuranceCardUpload(page)
    const deleted = await mockInsuranceFileDelete(page, 404)
    await card(page, "Medical Insurance").getByRole("button", { name: /^More actions for/ }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    const sheet = drawer(page, "Edit insurance")
    await slotInput(sheet, "back").setInputFiles(png("new-back.png"))
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    await expect(toastWith(page, "Insurance saved.")).toBeVisible()
    expect(deleted()).toEqual(["901"])
    await expect(page.getByRole("region", { name: /Notifications/ }).locator("li")).toHaveCount(1)
  })

  test("rejections before any upload: SVG, 12 MB, 8000 × 3000 inline, naming the file; a 413 upload names it in the toast, no Retry", async ({ page }) => {
    await openEditor(page)
    await mockInsuranceCreate(page)
    const uploads = await mockInsuranceCardUpload(page, { status: 413, body: { errorCode: "TOO_LARGE", source: "proxy" } })
    await headerAdd(page).click()
    const sheet = drawer(page)
    const back = slotOf(sheet, "Back")
    const input = slotInput(sheet, "back")
    await input.setInputFiles({ name: "card.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
    await expect(back.getByRole("alert")).toHaveText("card.svg isn't a PNG or JPEG image.")
    const big = greyPng(16, 16)
    await input.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.concat([big, Buffer.alloc(12 * 1024 * 1024 - big.length)]) })
    await expect(back.getByRole("alert")).toHaveText(/^big\.png is 12\.0 MB\. Choose a file up to 10 MB\.$/)
    await input.setInputFiles(png("wide.png", 8000, 3000))
    await expect(back.getByRole("alert")).toHaveText("wide.png is larger than 6000 × 4000 pixels.")
    await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: greyPng(4, 4).subarray(0, 40) })
    await expect(back.getByRole("alert")).toHaveText("broken.png couldn't be used. Choose another file.")
    await expect(back.getByRole("img", { name: "No image chosen" })).toBeVisible()
    expect(uploads()).toEqual([])
    await input.setInputFiles(png("back.png"))
    await expect(back.getByRole("alert")).toHaveText("")
    await fillSelf(page, sheet)
    await mockInsurance(page, { body: insurancePage([insurancePolicy({ id: 60, backSideCardFile: null })]) })
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    await expect(toastWith(page, "Insurance saved. back.png couldn't be used. Choose another file.")).toBeVisible()
    await expect(card(page, "Medical Insurance").getByRole("img", { name: "Back image not uploaded" })).toBeVisible()
    await expect(card(page, "Medical Insurance").getByRole("button", { name: /^Retry upload/ })).toHaveCount(0)
  })

  test("keyboard only: choose, replace and remove; a chosen image makes the drawer dirty", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard-only journey runs on desktop")
    await openEditor(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    const front = slotOf(sheet, "Front")
    const choose = front.getByRole("button", { name: "Choose front image" })
    await choose.focus()
    let chooser = page.waitForEvent("filechooser")
    await page.keyboard.press("Enter")
    await (await chooser).setFiles(png("one.png"))
    const replace = front.getByRole("button", { name: "Replace front image" })
    await expect(replace).toBeFocused()
    await expect(front.getByText(/^one\.png · /)).toBeVisible()
    chooser = page.waitForEvent("filechooser")
    await page.keyboard.press("Enter")
    await (await chooser).setFiles(png("two.png"))
    await expect(front.getByText(/^two\.png · /)).toBeVisible()
    await page.keyboard.press("Tab")
    await expect(front.getByRole("button", { name: "Remove front image" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(guard(page)).toBeVisible()
    await guard(page).getByRole("button", { name: "Keep editing" }).click()
    await front.getByRole("button", { name: "Remove front image" }).focus()
    await page.keyboard.press("Enter")
    await expect(choose).toBeFocused()
    await expect(front.getByRole("img", { name: "No image chosen" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
    await expect(guard(page)).toHaveCount(0)
  })

  test("the drawer with its slots: axe light and dark (a chosen image, an error with a long file name), 44 px targets, no horizontal scroll", async ({ page }) => {
    await openEditor(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await slotInput(sheet, "front").setInputFiles(png("front-card-with-a-rather-long-file-name-from-a-phone-camera.png"))
    // A long file name with no spaces wraps inside the slot (no horizontal scroll at 360 px).
    const longName = `${"insurance_card_back_scan_from_the_phone_camera_".repeat(3)}.svg`
    await slotInput(sheet, "back").setInputFiles({ name: longName, mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") })
    await expect(slotOf(sheet, "Back").getByRole("alert")).toHaveText(`${longName} isn't a PNG or JPEG image.`)
    await expect(slotOf(sheet, "Front").getByRole("img", { name: "Chosen front image" })).toBeVisible()
    await axe(page, "drawer with card images", '[data-slot="insurance-editor"]')
    for (const name of ["Replace front image", "Remove front image", "Choose back image"]) {
      const box = await sheet.getByRole("button", { name }).boundingBox()
      expect(box?.height, name).toBeGreaterThanOrEqual(44)
    }
    const preview = await slotOf(sheet, "Front").getByRole("img", { name: "Chosen front image" }).boundingBox()
    expect([Math.round(preview?.width ?? 0), Math.round(preview?.height ?? 0)]).toEqual([120, 76])
    const overflow = await sheet.locator('[data-slot="sheet-body"]').evaluate((body) => body.scrollWidth - body.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await expectNoHorizontalScroll(page)
  })
})

// --- Story 5.4: primary per type with demote offer ---------------------------------------------

/** UnitedHealthcare (`MEDICAL`, id 55) is the Primary Medical policy on file. */
const UHC = insurancePolicy({ frontSideCardFile: null, backSideCardFile: null })
const UHC_PRIMARY = insurancePage([UHC])
const UHC_SECONDARY = insurancePolicy({ insurancePrecedence: "SECONDARY", frontSideCardFile: null, backSideCardFile: null })
const demotionOffer = (sheet: Locator): Locator => sheet.locator('[data-slot="insurance-demotion"]')
const demoteButton = (sheet: Locator, insurer = "UnitedHealthcare"): Locator => sheet.getByRole("button", { name: `Make ${insurer} secondary` })
const saveErrorOf = (sheet: Locator): Locator => sheet.locator('[data-slot~="insurance-save-error"]')
const BOOM = { status: 500, body: { message: "Boom", code: 500 } }

/** Presses Tab until `target` has focus (keyboard only; fails after `max` presses). */
async function tabTo(page: Page, target: Locator, max = 40): Promise<void> {
  for (let press = 0; press < max; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press("Tab")
  }
  await expect(target).toBeFocused()
}

/** Picks `option` in the Select whose trigger has focus, with the keyboard only. */
async function chooseFocused(page: Page, trigger: Locator, option: string): Promise<void> {
  await expect(trigger).toBeFocused()
  await page.keyboard.press("Enter")
  const listbox = page.getByRole("listbox")
  const options = listbox.getByRole("option")
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
  await expect(trigger).toHaveText(option)
  // The list closes, then hands focus back to its trigger: wait for that before the next key.
  await expect(trigger).toBeFocused()
}

test.describe("Primary per type with demote offer (Story 5.4)", () => {
  test("the banner, Save blocked without the acceptance, then demotion → policy → image; the list shows the new Primary and the old Secondary", async ({ page }) => {
    await openEditor(page, UHC_PRIMARY)
    await mockInsuranceUpdate(page)
    let posted = false
    await mockInsuranceCreate(page, () => {
      posted = true
      return {}
    })
    await mockInsuranceCardUpload(page)
    const writes = insuranceWriteLog(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    const offer = demotionOffer(sheet)
    await expect(offer.getByRole("status")).toHaveText("Only one primary Medical policy. Make UnitedHealthcare secondary?")
    const button = demoteButton(sheet)
    await expect(button).toHaveAttribute("aria-pressed", "false")
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    // Not accepted: nothing is sent; focus on the button; the error line.
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(button).toBeFocused()
    await expect(offer.locator('[data-slot="field-error"]')).toHaveText(
      "Only one primary Medical policy is allowed. Make UnitedHealthcare secondary, or don't make this policy primary.",
    )
    await axe(page, "drawer with the demotion error", '[data-slot="insurance-editor"]')
    expect(writes()).toEqual([])
    await button.click()
    await expect(button).toHaveAttribute("aria-pressed", "true")
    await expect(offer.getByText("The change saves with this policy.")).toBeVisible()
    await expect(offer.locator('[data-slot="field-error"]')).toHaveCount(0)
    await axe(page, "drawer with the demotion accepted", '[data-slot="insurance-editor"]')
    await expectNoHorizontalScroll(page)
    await slotInput(sheet, "front").setInputFiles(png("front.png"))
    await expect(slotOf(sheet, "Front").getByRole("img", { name: "Chosen front image" })).toBeVisible()
    // The list read at send time still holds UnitedHealthcare as Primary; after the POST it is Secondary.
    const after = insurancePage([UHC_SECONDARY, insurancePolicy({ id: 60, insuranceOrganizationDTO: { insuranceCompanyName: "Blue Shield", insuranceCompanyId: 7 }, backSideCardFile: null })])
    await mockInsurance(page, () => ({ body: posted ? after : UHC_PRIMARY }))
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    expect(writes()).toEqual(["PUT 55 SECONDARY", "POST", "upload 60 front"])
    await expect(toastWith(page, "Insurance saved. UnitedHealthcare is now secondary.")).toBeVisible()
    await expect(section(page).locator('[data-slot="chip"]')).toHaveText(["Secondary", "Primary"])
    writes.stop()
  })

  test("re-evaluated: accepting, then Precedence Secondary hides the banner; back on Primary it is no longer accepted", async ({ page }) => {
    await openEditor(page, UHC_PRIMARY)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    await demoteButton(sheet).click()
    await expect(demoteButton(sheet)).toHaveAttribute("aria-pressed", "true")
    await pickOption(page, field(sheet, "Precedence"), "Secondary")
    await expect(demotionOffer(sheet)).toHaveCount(0)
    await pickOption(page, field(sheet, "Precedence"), "Primary")
    await expect(demoteButton(sheet)).toHaveAttribute("aria-pressed", "false")
  })

  test("Edit of a Secondary made Primary: the banner, then the demotion PUT, then the policy's PUT", async ({ page }) => {
    const humana = insurancePolicy({ id: 59, insurancePrecedence: "SECONDARY", memberIdNumber: "HUM-1001", insuranceOrganizationDTO: { insuranceCompanyName: "Humana", insuranceCompanyId: 13 }, frontSideCardFile: null, backSideCardFile: null })
    await openEditor(page, insurancePage([UHC, humana]))
    const puts = await mockInsuranceUpdate(page)
    const writes = insuranceWriteLog(page)
    await section(page).getByRole("button", { name: "More actions for Humana Medical Insurance" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    const sheet = drawer(page, "Edit insurance")
    await expect(demotionOffer(sheet)).toHaveCount(0)
    await pickOption(page, field(sheet, "Precedence"), "Primary")
    await expect(demotionOffer(sheet).getByRole("status")).toHaveText("Only one primary Medical policy. Make UnitedHealthcare secondary?")
    await demoteButton(sheet).click()
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(sheet).toBeHidden()
    expect(writes()).toEqual(["PUT 55 SECONDARY", "PUT 59 PRIMARY"])
    expect(puts().map((put) => put.url)).toEqual(["/api/1h/v2/health/patient/insurance/55", "/api/1h/v2/health/patient/insurance/59"])
    expect(puts()[0].body).toMatchObject({ insurancePrecedence: "SECONDARY", memberIdNumber: "948221037", insuranceOrganizationDTO: { insuranceCompanyId: 7 } })
    writes.stop()
  })

  test("the demotion fails: the policy isn't sent; the error with Retry; Retry demotes again and saves", async ({ page }) => {
    await openEditor(page, UHC_PRIMARY)
    let demotions = 0
    await mockInsuranceUpdate(page, () => (++demotions === 1 ? BOOM : {}))
    await mockInsuranceCreate(page)
    const writes = insuranceWriteLog(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    await demoteButton(sheet).click()
    await sheet.getByRole("button", { name: "Save" }).click()
    const banner = saveErrorOf(sheet)
    await expect(banner.getByRole("alert")).toHaveText("Couldn't save insurance.")
    await expect(banner).toBeFocused()
    expect(writes()).toEqual(["PUT 55 SECONDARY"])
    await banner.getByRole("button", { name: "Retry" }).click()
    await expect(sheet).toBeHidden()
    expect(writes()).toEqual(["PUT 55 SECONDARY", "PUT 55 SECONDARY", "POST"])
    writes.stop()
  })

  test("the policy save fails at a field after the demotion: the rollback runs; the error shows at Member ID", async ({ page }) => {
    await openEditor(page, UHC_PRIMARY)
    await mockInsuranceUpdate(page)
    await mockInsuranceCreate(page, { status: 400, body: { message: "Member Id Number should be at least 3 symbols.", code: 400 } })
    const writes = insuranceWriteLog(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    await demoteButton(sheet).click()
    await sheet.getByRole("button", { name: "Save" }).click()
    await expect(fieldError(sheet, "Member ID")).toHaveText("Member ID must be 3 to 32 characters")
    await expect(field(sheet, "Member ID")).toBeFocused()
    await expect.poll(writes).toEqual(["PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY"])
    await expect(saveErrorOf(sheet)).toHaveCount(0)
    writes.stop()
  })

  test("the policy save fails after the demotion: the rollback; a failed rollback is named; the refetch drops the banner and Retry sends only the policy", async ({ page }) => {
    await openEditor(page, UHC_PRIMARY)
    let rolledBack = false
    await mockInsuranceUpdate(page, (request) => {
      if ((request.postDataJSON() as Record<string, unknown>).insurancePrecedence !== "PRIMARY") return {}
      rolledBack = true
      return BOOM
    })
    let posts = 0
    await mockInsuranceCreate(page, () => (++posts === 1 ? BOOM : {}))
    const writes = insuranceWriteLog(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    await demoteButton(sheet).click()
    await mockInsurance(page, () => ({ body: rolledBack ? insurancePage([UHC_SECONDARY]) : UHC_PRIMARY }))
    await sheet.getByRole("button", { name: "Save" }).click()
    const banner = saveErrorOf(sheet)
    await expect(banner.getByRole("alert")).toHaveText("Couldn't save insurance. UnitedHealthcare is now secondary.")
    await expect(demotionOffer(sheet)).toHaveCount(0)
    expect(writes()).toEqual(["PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY"])
    await axe(page, "drawer with the rollback error", '[data-slot="insurance-editor"]')
    await banner.getByRole("button", { name: "Retry" }).click()
    await expect(sheet).toBeHidden()
    expect(writes()).toEqual(["PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY", "POST"])
    writes.stop()
  })

  test("legacy data with two Primaries: the banner names both and wraps at 360 px with no horizontal scroll", async ({ page }) => {
    const long = (id: number, name: string) =>
      insurancePolicy({ id, memberIdNumber: `M-${id}`, insuranceOrganizationDTO: { insuranceCompanyName: name, insuranceCompanyId: id }, frontSideCardFile: null, backSideCardFile: null })
    await openEditor(page, insurancePage([long(57, "Blue Cross Blue Shield of Massachusetts"), long(58, "UnitedHealthcare Community Plan")]))
    await headerAdd(page).click()
    const sheet = drawer(page)
    await fillSelf(page, sheet)
    const both = "Blue Cross Blue Shield of Massachusetts and UnitedHealthcare Community Plan"
    await expect(demotionOffer(sheet).getByRole("status")).toHaveText(`Only one primary Medical policy. Make ${both} secondary?`)
    const button = demoteButton(sheet, both)
    await expect(button).toBeVisible()
    const [box, body] = await Promise.all([button.boundingBox(), sheet.locator('[data-slot="sheet-body"]').boundingBox()])
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((body?.x ?? 0) + (body?.width ?? 0) + 0.5)
    expect(box?.height).toBeGreaterThanOrEqual(44)
    const overflow = await sheet.locator('[data-slot="sheet-body"]').evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await expectNoHorizontalScroll(page)
    await axe(page, "drawer with two insurers in the banner", '[data-slot="insurance-editor"]')
  })

  test("keyboard only: Tab from Precedence reaches the demote button, then Relationship; Save focuses the button; Space accepts; Save goes", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard-only journey runs on desktop")
    await openEditor(page, UHC_PRIMARY)
    await mockInsuranceUpdate(page)
    await mockInsuranceCreate(page)
    const writes = insuranceWriteLog(page)
    await headerAdd(page).click()
    const sheet = drawer(page)
    await expect(field(sheet, "Insurer")).toBeFocused()
    await page.keyboard.type("Blu")
    await expect(page.getByRole("option", { name: "Blue Shield", exact: true })).toBeVisible()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(field(sheet, "Insurer")).toHaveValue("Blue Shield")
    await tabTo(page, field(sheet, "Type"))
    await chooseFocused(page, field(sheet, "Type"), "Medical")
    await page.keyboard.press("Tab")
    await chooseFocused(page, field(sheet, "Precedence"), "Primary")
    const button = demoteButton(sheet)
    await page.keyboard.press("Tab")
    await expect(button).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(field(sheet, "Relationship")).toBeFocused()
    await chooseFocused(page, field(sheet, "Relationship"), "Self")
    await tabTo(page, field(sheet, "Member ID"), 10)
    await page.keyboard.type("XKH123")
    await tabTo(page, field(sheet, "Effective date"))
    await page.keyboard.type("01012025")
    const save = sheet.getByRole("button", { name: "Save" })
    await tabTo(page, save, 60)
    await page.keyboard.press("Enter")
    await expect(button).toBeFocused()
    expect(writes()).toEqual([])
    await page.keyboard.press("Space")
    await expect(button).toHaveAttribute("aria-pressed", "true")
    await tabTo(page, save, 60)
    await page.keyboard.press("Enter")
    await expect(sheet).toBeHidden()
    expect(writes()).toEqual(["PUT 55 SECONDARY", "POST"])
    writes.stop()
  })
})

/** Story 5.5: the active cards of the I/O matrix, Blue Shield (Primary Medical), Delta Dental, VSP; no card images. */
const BLUE = insurancePolicy({ insuranceOrganizationDTO: { insuranceCompanyName: "Blue Shield", insuranceCompanyId: 7 }, frontSideCardFile: null, backSideCardFile: null })
const DELTA = insurancePolicy({
  id: 56,
  insuranceType: "DENTAL",
  insurancePrecedence: "SECONDARY",
  insuranceOrganizationDTO: { insuranceCompanyName: "Delta Dental", insuranceCompanyId: 9 },
  frontSideCardFile: null,
  backSideCardFile: null,
})
const VSP = insurancePolicy({
  id: 57,
  insuranceType: "VISION",
  insurancePrecedence: "SECONDARY",
  insuranceOrganizationDTO: { insuranceCompanyName: "VSP", insuranceCompanyId: 12 },
  frontSideCardFile: null,
  backSideCardFile: null,
})
const deletedPolicy = (row: Record<string, unknown>): Record<string, unknown> => ({ ...row, label: "Deleted" })

const confirmDialog = (page: Page): Locator => page.getByRole("alertdialog", { name: "Delete this insurance policy?" })
const kebabOf = (page: Page, name: string): Locator => section(page).getByRole("button", { name: `More actions for ${name}` })

/**
 * Opens the Section on a list that reads `before` until the returned
 * `markRemoved()` runs (from the delete mock), then `after` (Story 5.5: the
 * refetch shows the platform's result).
 */
async function openWithDelete(page: Page, before: readonly Record<string, unknown>[], after: readonly Record<string, unknown>[]): Promise<() => void> {
  let removed = false
  await mockProfileDefaults(page)
  await mockMyself(page, { body: { ...ANN, firstName: "Avery" } })
  await mockInsurance(page, () => ({ body: insurancePage(removed ? after : before) }))
  await page.goto("/?tab=insurance")
  await expect(section(page).locator('[data-slot="state-frame"]')).toHaveAttribute("data-state", "ready")
  return () => {
    removed = true
  }
}

/** Kebab → "Delete" with the pointer; the confirm opens with focus on Cancel. */
async function openDelete(page: Page, name: string): Promise<Locator> {
  const kebab = kebabOf(page, name)
  await kebab.click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(confirmDialog(page)).toBeVisible()
  await expect(confirmDialog(page).getByRole("button", { name: "Cancel" })).toBeFocused()
  return kebab
}

test.describe("Delete a policy (Story 5.5)", () => {
  test("the kebab lists Edit and Delete; the confirm's copy; Escape and Cancel send nothing and return focus to the kebab", async ({ page }) => {
    await openWithDelete(page, [BLUE, DELTA, deletedPolicy(VSP)], [])
    const deletes = await mockInsuranceDelete(page)
    await expect(section(page).getByRole("button", { name: /^More actions for/ })).toHaveCount(2)
    await kebabOf(page, "Delta Dental Dental Insurance").click()
    await expect(page.getByRole("menuitem")).toHaveText(["Edit", "Delete"])
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveAttribute("data-variant", "destructive")
    await page.keyboard.press("Escape")
    const kebab = await openDelete(page, "Delta Dental Dental Insurance")
    const dialog = confirmDialog(page)
    await expect(dialog).toContainText("Delta Dental Dental Insurance will be removed from your profile.")
    await expect(dialog.getByRole("button")).toHaveText(["Cancel", "Delete policy"])
    for (const button of await dialog.getByRole("button").all()) expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await expectNoHorizontalScroll(page)
    await axe(page, "delete confirm", '[data-slot="confirm-dialog"]')
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(kebab).toBeFocused()
    await openDelete(page, "Delta Dental Dental Insurance")
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
    await expect(kebab).toBeFocused()
    expect(deletes.requests()).toEqual([])
  })

  test("labelled Deleted: busy (Deleting…, not dismissible), then the muted Deleted card, the toast, focus on the next card's kebab", async ({ page }) => {
    const markRemoved = await openWithDelete(page, [BLUE, DELTA, VSP], [deletedPolicy(BLUE), DELTA, VSP])
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const deletes = await mockInsuranceDelete(page, async () => {
      await held
      markRemoved()
      return {}
    })
    await openDelete(page, "Blue Shield Medical Insurance")
    const dialog = confirmDialog(page)
    await dialog.getByRole("button", { name: "Delete policy" }).click()
    const busy = dialog.locator('button[aria-busy="true"]')
    await expect(busy).toContainText("Deleting…")
    await axe(page, "delete confirm, busy", '[data-slot="confirm-dialog"]')
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    release()
    await expect(dialog).toBeHidden()
    expect(deletes.deleted()).toEqual(["55"])
    const medical = card(page, "Medical Insurance")
    await expect(medical).toHaveAttribute("data-deleted", "true")
    await expect(medical.locator('[data-slot="chip"]')).toHaveText("Deleted")
    await expect(kebabOf(page, "Blue Shield Medical Insurance")).toHaveCount(0)
    await expect(section(page).locator('[data-slot="section-meta"]')).toHaveText("2")
    await expect(toastWith(page, "Insurance policy deleted.")).toBeVisible()
    await expect(kebabOf(page, "Delta Dental Dental Insurance")).toBeFocused()
    await expectNoHorizontalScroll(page)
  })

  test("unlinked, the last active card: the card is gone, focus on the previous card's kebab; then the empty card's Add insurance", async ({ page }) => {
    let step = 0
    await mockProfileDefaults(page)
    await mockMyself(page, { body: { ...ANN, firstName: "Avery" } })
    await mockInsurance(page, () => ({ body: insurancePage([[BLUE, DELTA], [BLUE], []][step]) }))
    await mockInsuranceDelete(page, () => {
      step += 1
      return {}
    })
    await page.goto("/?tab=insurance")
    await expect(section(page).locator('[data-slot="state-frame"]')).toHaveAttribute("data-state", "ready")
    await openDelete(page, "Delta Dental Dental Insurance")
    await confirmDialog(page).getByRole("button", { name: "Delete policy" }).click()
    await expect(card(page, "Dental Insurance")).toHaveCount(0)
    await expect(kebabOf(page, "Blue Shield Medical Insurance")).toBeFocused()
    await openDelete(page, "Blue Shield Medical Insurance")
    await confirmDialog(page).getByRole("button", { name: "Delete policy" }).click()
    const empty = section(page).locator('[data-slot="empty-state"]')
    await expect(empty).toBeVisible()
    await expect(empty.getByRole("button", { name: "Add insurance" })).toBeFocused()
  })

  test("a network failure: the dialog closes, the card is unchanged, the error toast persists; its Retry deletes again with no confirm", async ({ page }) => {
    const markRemoved = await openWithDelete(page, [BLUE, DELTA, VSP], [BLUE, VSP])
    const deletes = await mockInsuranceDelete(page, (_id, attempt) => {
      if (attempt === 1) return "abort"
      markRemoved()
      return {}
    })
    const kebab = await openDelete(page, "Delta Dental Dental Insurance")
    await confirmDialog(page).getByRole("button", { name: "Delete policy" }).click()
    await expect(confirmDialog(page)).toBeHidden()
    await expect(kebab).toBeFocused()
    const toast = toastWith(page, "Couldn't delete insurance policy. Check your connection.")
    await expect(toast).toBeVisible()
    await expect(card(page, "Dental Insurance")).toBeVisible()
    await expect(card(page, "Dental Insurance")).not.toHaveAttribute("data-deleted", "true")
    await toast.getByRole("button", { name: "Retry" }).click()
    await expect(confirmDialog(page)).toHaveCount(0)
    await expect(card(page, "Dental Insurance")).toHaveCount(0)
    await expect(toastWith(page, "Insurance policy deleted.")).toBeVisible()
    expect(deletes.requests()).toEqual(["56", "56"])
    expect(deletes.deleted()).toEqual(["56"])
  })

  test("already gone (decision 1B): the backend's 400 refetches and says This policy was already removed., with no error", async ({ page }) => {
    const markRemoved = await openWithDelete(page, [BLUE, DELTA], [BLUE, deletedPolicy(DELTA)])
    await mockInsuranceDelete(page, (id) => {
      markRemoved()
      return { status: 400, body: { message: `Insurance with Id: ${id} is already deleted.`, code: 400 } }
    })
    await openDelete(page, "Delta Dental Dental Insurance")
    await confirmDialog(page).getByRole("button", { name: "Delete policy" }).click()
    await expect(confirmDialog(page)).toBeHidden()
    await expect(toastWith(page, "This policy was already removed.")).toBeVisible()
    await expect(toastWith(page, "Couldn't delete")).toHaveCount(0)
    await expect(card(page, "Dental Insurance")).toHaveAttribute("data-deleted", "true")
    // No next active card: the previous one's kebab.
    await expect(kebabOf(page, "Blue Shield Medical Insurance")).toBeFocused()
  })

  test("keyboard only: the kebab, Delete, Tab to Delete policy, Enter; focus lands on the next card's kebab", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard-only journey runs on desktop")
    const markRemoved = await openWithDelete(page, [BLUE, DELTA, VSP], [DELTA, VSP])
    const deletes = await mockInsuranceDelete(page, () => {
      markRemoved()
      return {}
    })
    const kebab = kebabOf(page, "Blue Shield Medical Insurance")
    await kebab.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused()
    await page.keyboard.press("Enter")
    const dialog = confirmDialog(page)
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(dialog.getByRole("button", { name: "Delete policy" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(dialog).toBeHidden()
    expect(deletes.deleted()).toEqual(["55"])
    await expect(kebabOf(page, "Delta Dental Dental Insurance")).toBeFocused()
  })
})
