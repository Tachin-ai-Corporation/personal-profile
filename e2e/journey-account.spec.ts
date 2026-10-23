import { expect, type Locator, type Page } from "@playwright/test"
import { createJourneyBackend, JOURNEY_NPI_LABELS, JOURNEY_START, launch, MFA_TEST_QR, mockExit, PORTAL_URL, test } from "./fixtures"

/**
 * The integrated journey suite (NG-9019), Team B: one user on `/account`
 * (Epics 7–10), in the order the legacy 1health-fe Account screen is used:
 * Personal Account settings (names, primary email and phone, time zone),
 * the authenticator app for MFA (link, then disable), Individual Provider
 * Registration (personal and practice NPI search) and My Organizations (list,
 * pagination, search, primary contact, Enter portal).
 *
 * How it differs from the per-story specs (`e2e/account-*.spec.ts`): those
 * test one story each against canned answers, edge cases included. This one
 * signs in once through the real launch (`launch()`), reaches `/account` the
 * way a user does (the app bar), and runs against the stateful fake backend
 * (`createJourneyBackend`, `e2e/fixtures/journey.ts`): the settings save
 * changes the header and the read view, the authenticator status follows
 * link and disable, and Enter portal leaves through the real
 * `/handoff/portal` route. Runs on desktop and mobile-360.
 */

const ALT_PHONE = "+1 (415) 555-0199"

const region = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true })
const settings = (page: Page): Locator => region(page, "Personal account settings")
const settingsTable = (page: Page): Locator => settings(page).getByRole("table", { name: "Personal account settings", exact: true })

async function valueCell(page: Page, label: string): Promise<Locator> {
  const id = await settingsTable(page).getByRole("rowheader", { name: label, exact: true }).getAttribute("id")
  return settingsTable(page).locator(`td[headers="${id}"]`)
}

async function pick(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

test("Team B journey: launch → Account settings → authenticator link and disable → provider NPI search → organizations → Enter portal", async ({ page }) => {
  test.setTimeout(180_000)
  const backend = await createJourneyBackend(page)
  const logouts = await mockExit(page)

  await test.step("launch, then the app bar's Account link opens Personal Account", async () => {
    await launch(page)
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await page.getByRole("link", { name: "Account" }).click()
    await expect(page).toHaveURL(/\/account\?tab=personal$/)
    await expect(page.getByRole("tab", { selected: true })).toHaveText("Personal Account")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    // On /account the avatar is an image, not the picture button (decision 2026-10-14).
    await expect(page.getByRole("button", { name: "Change profile picture" })).toHaveCount(0)
  })

  await test.step("the settings read view shows the account as the platform has it", async () => {
    await expect(await valueCell(page, "First name")).toHaveText("Ann")
    await expect(await valueCell(page, "Primary email address")).toHaveText(JOURNEY_START.email)
    await expect(await valueCell(page, "Primary phone number")).toHaveText("+1 (415) 555-2671")
    await expect(await valueCell(page, "Default time zone")).toHaveText("Central")
    await expect(await valueCell(page, "Preferred locale for date, time, and currency")).toHaveText("English - United States")
  })

  await test.step("edit: first name, primary email and phone, time zone → one save; the header follows", async () => {
    const section = settings(page)
    await section.getByRole("button", { name: "Edit", exact: true }).click()
    await section.getByRole("textbox", { name: "First name", exact: true }).fill("Anna")
    const email = section.getByRole("combobox", { name: "Primary email address", exact: true })
    const phone = section.getByRole("combobox", { name: "Primary phone number", exact: true })
    await expect(email).not.toHaveAttribute("aria-busy", "true")
    await expect(phone).not.toHaveAttribute("aria-busy", "true")
    await pick(page, email, JOURNEY_START.altEmail)
    await pick(page, phone, ALT_PHONE)
    await expect(section.getByText(/^Changing your primary email/)).toBeVisible()
    await expect(section.getByText(/^Changing your primary phone/)).toBeVisible()
    await pick(page, section.getByRole("combobox", { name: "Default time zone", exact: true }), "Eastern")
    await section.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByText("Personal account updated successfully", { exact: true })).toBeVisible()
    await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
    expect(backend.userEdits()).toHaveLength(1)
    expect(backend.userEdits()[0]).toMatchObject({ firstName: "Anna", email: JOURNEY_START.altEmail, phoneNumber: JOURNEY_START.altPhone })
    expect(backend.user.timeZone).toBe("America/New_York")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anna Lee")
    await expect(await valueCell(page, "First name")).toHaveText("Anna")
    await expect(await valueCell(page, "Primary email address")).toHaveText(JOURNEY_START.altEmail)
    await expect(await valueCell(page, "Primary phone number")).toHaveText(ALT_PHONE)
    await expect(await valueCell(page, "Default time zone")).toHaveText("Eastern")
    // The platform relabeled the Contact Points: the chosen ones are Primary now.
    expect(backend.contacts.filter((point) => point.label === "Primary").map((point) => point.value).toSorted()).toEqual([JOURNEY_START.altPhone, JOURNEY_START.altEmail])
  })

  await test.step("MFA: the five authenticator apps; link Google after a wrong code", async () => {
    const card = region(page, "Authenticator app")
    await expect(card.getByText("Not set up", { exact: true })).toBeVisible()
    for (const app of ["Google", "Microsoft", "Authy", "DUO", "Android OTP"]) await expect(page.getByRole("button", { name: `Link ${app}`, exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Link Google", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Link your Google authenticator" })
    await expect(dialog.getByRole("img")).toHaveAttribute("src", MFA_TEST_QR)
    const code = dialog.getByRole("textbox", { name: "6-digit code" })
    await code.fill("000000")
    await code.press("Enter")
    await expect(dialog.getByText("Invalid code. Try again.", { exact: true })).toBeVisible()
    await code.fill("123456")
    await code.press("Enter")
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText("Google authenticator linked", { exact: true })).toBeVisible()
    await expect(card.getByText("Enabled", { exact: true })).toBeVisible()
    expect(backend.user.totpEnabled).toBe(true)
  })

  await test.step("MFA: disable the authenticator app after the confirm", async () => {
    const card = region(page, "Authenticator app")
    await page.getByRole("button", { name: "Disable", exact: true }).click()
    const confirm = page.getByRole("alertdialog", { name: "Turn off authenticator app?" })
    await confirm.getByRole("button", { name: "Turn off", exact: true }).click()
    await expect(confirm).toHaveCount(0)
    await expect(page.getByText("Authenticator app disabled", { exact: true })).toBeVisible()
    await expect(card.getByText("Not set up", { exact: true })).toBeVisible()
    expect(backend.user.totpEnabled).toBe(false)
  })

  await test.step("Provider registration: search both NPIs, Register (9.2), then the registered view (9.3)", async () => {
    await page.getByRole("tab", { name: "Individual Provider Registration" }).click()
    await expect(page).toHaveURL(/\/account\?tab=provider$/)
    await expect(page.getByRole("heading", { name: "Healthcare credentials" })).toBeVisible()
    const personal = page.getByRole("combobox", { name: "Search for your personal NPI number" })
    const practice = page.getByRole("combobox", { name: "Search for your practice's (hospital, clinic, lab, etc.) NPI Number" })
    await personal.focus()
    await page.getByRole("option", { name: JOURNEY_NPI_LABELS.personal, exact: true }).click()
    await expect(personal).toHaveValue(JOURNEY_NPI_LABELS.personal)
    await practice.focus()
    await page.getByRole("option", { name: JOURNEY_NPI_LABELS.practice, exact: true }).click()
    await expect(practice).toHaveValue(JOURNEY_NPI_LABELS.practice)
    await page.getByRole("button", { name: "Register", exact: true }).click()
    await expect(page.getByText("Provider and practice NPIs registered", { exact: true })).toBeVisible()
    expect(backend.writes().filter((write) => write === "POST v2/user/register/npi")).toHaveLength(1)
    const credentials = page.getByRole("table", { name: "Healthcare credentials" })
    await expect(credentials).toBeVisible()
    await expect(page.getByRole("combobox")).toHaveCount(0)
    await expect(credentials.getByText("1588667638", { exact: true })).toBeVisible()
    await expect(credentials.getByText("1730188030", { exact: true })).toBeVisible()
  })

  await test.step("My Organizations: 14 organizations on two pages; search; primary contact", async () => {
    await page.getByRole("tab", { name: "My Organizations" }).click()
    await expect(page).toHaveURL(/\/account\?tab=organizations$/)
    await expect(page.getByRole("article")).toHaveCount(12)
    await expect(page.getByRole("article", { name: "DNN", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await expect(page.getByRole("article")).toHaveCount(2)
    await expect(page.getByRole("heading", { name: "Clinic 13", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Previous", exact: true }).click()
    await expect(page.getByRole("article")).toHaveCount(12)
    await page.getByRole("searchbox", { name: "Search organizations" }).fill("dnn")
    await expect(page.getByRole("article")).toHaveCount(1)
    const card = page.getByRole("article", { name: "DNN", exact: true })
    const contact = card.getByRole("button", { name: "Primary contact for DNN", exact: true })
    await contact.click()
    await expect(page.getByRole("dialog", { name: "Primary contact", exact: true }).getByText("Dana M Ng", { exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(contact).toBeFocused()
  })

  await test.step("Enter portal for DNN: the real hand-off route, same tab, no logout", async () => {
    const handoff = page.waitForResponse((response) => new URL(response.url()).pathname === "/handoff/portal")
    await page.getByRole("article", { name: "DNN", exact: true }).getByRole("button", { name: "Enter portal for DNN", exact: true }).click()
    const response = await handoff
    expect(response.status()).toBe(303)
    expect(new URL(response.url()).searchParams.get("tenantId")).toBe("42")
    await page.waitForURL(new URL(PORTAL_URL).href)
    expect(logouts()).toBe(0)
  })
})
