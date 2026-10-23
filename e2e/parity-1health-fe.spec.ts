import { expect, type Locator, type Page } from "@playwright/test"
import {
  ANN,
  REGISTERED_PROVIDER_NPI,
  addressRow,
  mockAccountDefaults,
  mockAddresses,
  mockCountries,
  mockFileDownload,
  mockMyself,
  mockNpiAvailability,
  mockRegisterNpi,
  mockUserNpi,
  mockProfileDefaults,
  mockTypeKey,
  signIn,
  test,
} from "./fixtures"

/**
 * Parity with 1health-fe (NG-9019): the labels, headings, empty states and
 * option lists the legacy Personal Profile and Account screens show, as the
 * rebuild renders them. Source: `docs/PARITY-1health-fe.md` (each fact cites
 * its new-app file there). Differences backed by a decision are asserted as
 * the new behaviour; the open gaps (DIFF-GAP) are `test.fixme` at the end, so
 * the report lists them until they are built. The per-story specs own the
 * behaviour; this file only pins what a legacy user expects to find.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

const region = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true })

/** Opens a Select or Combobox and answers its option texts; closes it again. */
async function optionsOf(page: Page, trigger: Locator): Promise<string[]> {
  await trigger.click()
  const options = page.getByRole("listbox").getByRole("option")
  await expect(options.first()).toBeVisible()
  const texts = (await options.allInnerTexts()).map((text) => text.trim())
  await page.keyboard.press("Escape")
  await expect(page.getByRole("listbox")).toHaveCount(0)
  return texts
}

test.describe("Personal Profile `/` (legacy Contacts / Insurance / Medical)", () => {
  test("shell: app bar, the three legacy tabs, Medical is the coming-soon placeholder", async ({ page }) => {
    await mockProfileDefaults(page)
    await page.goto("/")
    await expect(page).toHaveTitle(/Personal Profile/)
    const pages = page.getByRole("navigation", { name: "Pages" })
    await expect(pages.getByRole("link", { name: "Personal Profile" })).toHaveAttribute("aria-current", "page")
    await expect(pages.getByRole("link", { name: "Account" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Return to 1health" })).toBeVisible()
    const tabs = page.getByRole("tablist", { name: "Profile sections" }).getByRole("tab")
    await expect(tabs).toHaveCount(3)
    await expect(tabs.nth(0)).toContainText("Contacts")
    await expect(tabs.nth(1)).toContainText("Insurance")
    await expect(tabs.nth(2)).toContainText("Medical")
    await tabs.nth(2).click()
    await expect(page.getByText("Coming soon: medications, allergies and conditions will appear here")).toBeVisible()
  })

  test("header: the legacy name heading and the picture entry point", async ({ page }) => {
    await mockProfileDefaults(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ann Lee")
    await expect(page.getByRole("button", { name: "Change profile picture" })).toBeVisible()
  })

  test("Contacts: the legacy Sections in order (Personal Information, Phone, Email, Social Media, Location Addresses)", async ({ page }) => {
    await mockProfileDefaults(page)
    await page.goto("/")
    const headings = page.getByRole("heading", { level: 2 })
    for (const name of ["Personal information", "Phone", "Email", "Social media", "Addresses"]) {
      await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible()
    }
    const order = (await headings.allInnerTexts()).map((text) => text.trim())
    const wanted = ["Personal information", "Phone", "Email", "Social media", "Addresses"]
    expect(order.filter((text) => wanted.includes(text))).toEqual(wanted)
  })

  test("Personal information: the legacy fields (Full Name, Birth Date, Race, Ethnicity, Biological Gender, Signature) and \"Not provided\"", async ({ page }) => {
    await mockProfileDefaults(page)
    await page.goto("/")
    const table = page.getByRole("table", { name: "Personal information" })
    await expect(table).toBeVisible()
    await expect(table.getByRole("rowheader")).toHaveText([
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
    ])
    // Legacy "No signature available!" reads "Not provided" (decision in docs/PARITY-1health-fe.md).
    const id = await table.getByRole("rowheader", { name: "Signature", exact: true }).getAttribute("id")
    await expect(table.locator(`td[headers="${id}"]`)).toHaveText("Not provided")
  })

  test("Personal information edit: the legacy option lists (fallback when the Person type key fails)", async ({ page }) => {
    await mockProfileDefaults(page)
    await mockTypeKey(page, "Person", { status: 500, body: {} })
    await page.goto("/")
    const section = region(page, "Personal information")
    await section.getByRole("button", { name: "Edit" }).click()
    await expect(section.getByText("Editing")).toBeVisible()
    const control = (label: string) => section.getByLabel(new RegExp(`^${label}( \\(optional\\))?$`))
    // An unset profile preselects the legacy defaults.
    await expect(control("Race")).toHaveText("Unknown")
    await expect(control("Ethnicity")).toHaveText("Unknown")
    await expect(control("Biological gender")).toHaveText("Asked but not answered")
    expect(await optionsOf(page, control("Race"))).toEqual([
      "American Indian or Alaska Native",
      "Asian",
      "Black or African American",
      "Hispanic or Latino",
      "Middle Eastern or North African",
      "Native Hawaiian or other Pacific Islander",
      "White",
      "Other Race",
      "Unknown",
    ])
    expect(await optionsOf(page, control("Ethnicity"))).toEqual(["Not Hispanic or Latino", "Hispanic or Latino", "Unknown"])
    // Gender identity is a free-text Combobox that filters by its text: clear it to see the whole list.
    await section.getByRole("button", { name: "Clear Gender identity" }).click()
    const genderIdentity = section.getByRole("combobox", { name: "Gender identity" })
    await genderIdentity.focus()
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Asked but not answered", "Female", "Male", "Other"])
  })

  test("Phone, Email, Social media: legacy columns and the empty states (legacy \"Not Provided\")", async ({ page }) => {
    await mockProfileDefaults(page)
    await page.goto("/")
    await expect(region(page, "Phone").getByText("No phones yet")).toBeVisible()
    await expect(region(page, "Email").getByText("No emails yet")).toBeVisible()
    await expect(region(page, "Social media").getByText("No social links yet")).toBeVisible()
    await expect(region(page, "Addresses").getByText("No addresses yet")).toBeVisible()
    await expect(region(page, "Phone").getByRole("button", { name: "Add phone" }).first()).toBeVisible()
    await expect(region(page, "Email").getByRole("button", { name: "Add email" }).first()).toBeVisible()
    await expect(region(page, "Social media").getByRole("button", { name: "Add link" }).first()).toBeVisible()
    await expect(region(page, "Addresses").getByRole("button", { name: "Add address" }).first()).toBeVisible()
  })

  test("Phone edit: the legacy Type and Label options (no \"Primary\" label)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockProfileDefaults(page)
    await page.goto("/")
    const phone = region(page, "Phone")
    await phone.getByRole("button", { name: "Add phone" }).first().click()
    expect(await optionsOf(page, phone.getByRole("combobox", { name: /Type/ }).first())).toEqual(["Mobile", "Landline"])
    const labels = await optionsOf(page, phone.getByRole("combobox", { name: /Label/ }).first())
    expect(labels).toEqual(["Home", "Main", "Old", "Personal", "Mailing List", "Work"])
    expect(labels).not.toContain("Primary")
  })

  test("Addresses edit: the legacy Address Type options and field labels", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockProfileDefaults(page)
    await page.goto("/")
    const addresses = region(page, "Addresses")
    await addresses.getByRole("button", { name: "Add address" }).first().click()
    const row = addresses.locator('[data-slot="address-expanded"]').first()
    expect(await optionsOf(page, row.getByRole("combobox", { name: "Address Type" }))).toEqual(["Home", "Main Work", "Other Work", "Vacation Home"])
    for (const label of ["City", "Zip", "Address line 2 (optional)", "County (optional)", "State/Province (optional)"]) {
      await expect(row.getByRole("textbox", { name: label, exact: true })).toBeVisible()
    }
    await expect(row.getByRole("combobox", { name: "Address line 1", exact: true })).toBeVisible()
    await expect(row.getByRole("combobox", { name: "Country" })).toHaveText("United States")
  })

  test("Insurance: the legacy tab with an add action and the empty state (legacy \"Not provided\")", async ({ page }) => {
    await mockProfileDefaults(page)
    await page.goto("/?tab=insurance")
    await expect(page.getByRole("heading", { level: 2, name: "Insurance" })).toBeVisible()
    await expect(page.getByText("No insurance on file. Add a policy before your next visit.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Add insurance" }).first()).toBeVisible()
  })
})

test.describe("Account `/account` (legacy Personal Account / Provider Registration / My Organizations)", () => {
  test("shell: the three legacy tabs in order", async ({ page }) => {
    await mockAccountDefaults(page)
    await page.goto("/account")
    await expect(page).toHaveTitle(/Account/)
    await expect(page.getByRole("tablist", { name: "Account sections" }).getByRole("tab")).toHaveText([
      "Personal Account",
      "Individual Provider Registration",
      "My Organizations",
    ])
  })

  test("Personal Account Settings: the legacy fields; the password is masked", async ({ page }) => {
    await mockAccountDefaults(page)
    await page.goto("/account")
    await expect(page.getByRole("heading", { level: 2, name: "Personal account settings" })).toBeVisible()
    const section = region(page, "Personal account settings")
    for (const label of [
      "First name",
      "Last name",
      "Username",
      "Password",
      "Primary email address",
      "Primary phone number",
      "Birth date",
      "Preferred language",
      "Default time zone",
      "Preferred locale for date, time, and currency",
    ]) {
      await expect(section.getByText(label, { exact: true }).first()).toBeVisible()
    }
    await expect(section.getByText("********", { exact: true })).toBeVisible()
  })

  test("Enable authenticator app for MFA: the five legacy vendors in order", async ({ page }) => {
    await mockAccountDefaults(page)
    await page.goto("/account")
    const section = region(page, "Authenticator app")
    await expect(section.getByText("Link an authenticator app to get sign-in codes on your phone.")).toBeVisible()
    await expect(section.getByRole("button", { name: /^Link / })).toHaveText([/Google/, /Microsoft/, /Authy/, /DUO/, /Android OTP/])
  })

  test("Individual Provider Registration: Healthcare credentials, the two NPI searches and Register", async ({ page }) => {
    await mockAccountDefaults(page)
    await page.goto("/account?tab=provider")
    await expect(page.getByRole("heading", { level: 2, name: "Healthcare credentials" })).toBeVisible()
    await expect(page.getByText("Please find your provider and NPI information to continue…")).toBeVisible()
    await expect(page.getByRole("combobox", { name: /Search for your personal NPI number/ })).toHaveAttribute("aria-required", "true")
    await expect(page.getByRole("combobox", { name: /Search for your practice's \(hospital, clinic, lab, etc\.\) NPI Number/ })).toBeVisible()
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible()
    await expect(page.getByRole("button", { name: "About provider registration" })).toBeVisible()
  })

  test("My Organizations: the empty state and the register link", async ({ page }) => {
    await mockAccountDefaults(page)
    await page.goto("/account?tab=organizations")
    await expect(page.getByRole("heading", { level: 2, name: "You aren't managing any organizations yet" })).toBeVisible()
    await expect(page.getByRole("link", { name: /Register organization/ })).toBeVisible()
  })

  test("header on /account shows the same legacy name", async ({ page }) => {
    await mockAccountDefaults(page)
    await mockMyself(page)
    await page.goto("/account")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ann Lee")
  })
})

test.describe("Individual Provider Registration (Stories 9.2, 9.3; legacy IndividualProviderRegistration*.tsx)", () => {
  const personal = (page: Page) => page.getByRole("combobox", { name: "Search for your personal NPI number" })
  const practice = (page: Page) => page.getByRole("combobox", { name: "Search for your practice's (hospital, clinic, lab, etc.) NPI Number", exact: false })

  test.beforeEach(async ({ page }) => {
    await mockAccountDefaults(page)
    await page.route("**/api/1h/v2/public/npi/list?*", (route) => {
      const individual = new URL(route.request().url()).searchParams.get("entityTypeCode") === "1"
      const row = individual ? { id: 77, npi: 1234567890, providerFirstName: "Ann", providerLastName: "Lee" } : { id: 88, npi: 1987654321, providerOrganizationName: "Sample Clinic" }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [row], totalElements: 1 }) })
    })
    await mockNpiAvailability(page, 77)
    await mockNpiAvailability(page, 88)
  })

  test("Register without a personal NPI: the legacy required error, nothing sent", async ({ page }) => {
    const posts = await mockRegisterNpi(page)
    await page.goto("/account?tab=provider")
    await page.getByRole("button", { name: "Register", exact: true }).click()
    await expect(page.getByText("Personal NPI is required", { exact: true })).toBeVisible()
    expect(posts()).toHaveLength(0)
  })

  test("Register personal + practice NPI: one POST with both registry ids, the success toast, then the registered view", async ({ page }) => {
    const posts = await mockRegisterNpi(page)
    let reads = 0
    await page.route("**/api/1h/v2/user/npi", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(++reads === 1 ? {} : REGISTERED_PROVIDER_NPI) }))
    await page.goto("/account?tab=provider")
    await personal(page).focus()
    await page.getByRole("option", { name: "1234567890, Ann Lee", exact: true }).click()
    await practice(page).focus()
    await page.getByRole("option", { name: "1987654321, Sample Clinic", exact: true }).click()
    await page.getByRole("button", { name: "Register", exact: true }).click()
    await expect(page.getByText("Provider and practice NPIs registered", { exact: true })).toBeVisible()
    expect(posts().map((request) => request.postDataJSON())).toEqual([{ providerNpiId: 77, practiceNpiId: 88 }])
    await expect(page.getByRole("table", { name: "Healthcare credentials" })).toBeVisible()
    await expect(page.getByRole("combobox")).toHaveCount(0)
  })

  test("registered view: the legacy credential rows (NPI, taxonomy, HIE, practice, licenses, addresses, signature)", async ({ page }) => {
    await mockUserNpi(page, { body: REGISTERED_PROVIDER_NPI })
    await mockMyself(page, { body: { ...ANN, signature: { id: 501, name: "signature.png" } } })
    await mockFileDownload(page, 501)
    await page.goto("/account?tab=provider")
    const table = page.getByRole("table", { name: "Healthcare credentials" })
    await expect(table.getByRole("rowheader")).toHaveText([
      "NPI",
      "Taxonomy",
      "Health Information Exchange",
      "Practice name",
      "Practice address",
      "Practice NPI",
      "Licenses",
      "Address of practice",
      "Signature",
    ])
    for (const value of ["1234567890", "Family Medicine", "Sample Exchange", "1987654321", "TEST-LICENSE-01"]) {
      await expect(table.getByText(value, { exact: true })).toBeVisible()
    }
    await expect(table.getByRole("button", { name: "Sample Clinic" })).toBeVisible()
    await expect(page.getByRole("img", { name: "Your signature" })).toBeVisible()
  })
})

/**
 * Open gaps against 1health-fe (DIFF-GAP in docs/PARITY-1health-fe.md). Each
 * stays `fixme` until its story lands; then turn it into a real test.
 */
test.describe("Resolved gaps vs 1health-fe", () => {
  // Resolved 2026-10-23 (NG-9026): legacy AddressComponent.tsx:123-144 empties line 1/2, city, county, state, zip and lat/lon on a Country change.
  test("P2 · Changing an address's country clears the address fields, as in legacy", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockProfileDefaults(page)
    await mockAddresses(page, [addressRow({ id: 1, addressLine1: "9 Oak Ave", addressLine2: "Apt 4", county: "SF County", primary: true, validated: true })])
    await mockCountries(page, { body: [{ id: 1, name: "Canada" }, { id: 2, name: "United States" }] })
    await page.goto("/")
    const addresses = region(page, "Addresses")
    await addresses.getByRole("button", { name: "More actions for 9 Oak Ave, Apt 4, SF, CA 94105" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).click()
    const row = addresses.locator('[data-slot="address-expanded"]').first()
    await expect(row.getByRole("combobox", { name: "Address line 1", exact: true })).toHaveValue("9 Oak Ave")
    await row.getByRole("combobox", { name: "Country" }).click()
    await page.getByRole("option", { name: "Canada", exact: true }).click()
    await expect(row.getByRole("combobox", { name: "Address line 1", exact: true })).toHaveValue("")
    for (const label of ["Address line 2 (optional)", "City", "County (optional)", "State/Province (optional)", "Zip"]) {
      await expect(row.getByRole("textbox", { name: label, exact: true })).toHaveValue("")
    }
    // As in legacy, the Address Type and the Primary flag stay.
    await expect(row.getByRole("combobox", { name: "Address Type" })).toHaveText("Home")
    await expect(row.getByRole("checkbox", { name: "Set as primary" })).toBeChecked()
  })
})

test.describe("Open gaps vs 1health-fe", () => {
  test.fixme("P2 · A legacy `en-us` locale shows as \"English - United States\", not raw text", async () => {})
  test.fixme("P2 · Insurance Relationship options follow the backend order", async () => {})
  test.fixme("P3 · Verify is offered from the Phone and Email edit view, as in legacy", async () => {})
})
