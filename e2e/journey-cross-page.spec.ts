import { expect, type Locator, type Page } from "@playwright/test"
import { createJourneyBackend, JOURNEY_START, launch, PORTAL_URL, test } from "./fixtures"

/**
 * The integrated journey suite (NG-9019), across both pages: data saved on
 * `/` (Team A) shows on `/account` (Team B) and back, then the user leaves
 * for the portal. Personal information's new name reaches the header and
 * Account settings; an email and a phone added (and verified) in Contacts
 * become choices in the Account primary pickers; the primary switched there
 * reads back as Primary in Contacts and in the header; "Return to 1health"
 * logs out for real and ends the session.
 *
 * How it differs from the per-story specs: those mock each page alone with
 * canned answers. This one signs in once through the real launch
 * (`launch()`), moves between the pages with the app bar (client
 * navigation), runs against the stateful fake backend
 * (`createJourneyBackend`, `e2e/fixtures/journey.ts`) and lets the real
 * `/api/session/logout` run (only the portal page itself is answered here).
 * Runs on desktop and mobile-360.
 */

const NEW_EMAIL = "anna.work@example.test"
const NEW_PHONE = "+1 (415) 555-0123"

const region = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true })
const toastWith = (page: Page, text: string): Locator => page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })
const header = (page: Page): Locator => page.locator("div:has(> h1)")
const footer = (section: Locator): Locator => section.locator('[data-slot="section-footer"]')
const newRow = (section: Locator): Locator => section.locator('[data-state="new"]').last()
const readRow = (section: Locator, text: string): Locator => section.locator("tbody tr, li[data-slot='section-table-card']").filter({ hasText: text })

async function pick(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

async function saveSection(section: Locator): Promise<void> {
  await footer(section).getByRole("button", { name: "Save" }).click()
  await expect(footer(section)).toHaveCount(0)
}

test("cross-page journey: Profile edits show on Account, the Account primary switch shows on Profile, then Return to 1health", async ({ page, isMobile }) => {
  test.setTimeout(150_000)
  const backend = await createJourneyBackend(page, { seedAlternatives: false })
  const portalOrigin = new URL(PORTAL_URL).origin
  await page.route((url) => url.origin === portalOrigin, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>portal</title>portal" }))

  await test.step("on /: rename to Anna in Personal information", async () => {
    await launch(page)
    const section = region(page, "Personal information")
    await section.getByRole("button", { name: "Edit" }).click()
    await section.getByLabel(/^First name( \(optional\))?$/).fill("Anna")
    await section.getByRole("button", { name: "Save" }).click()
    await expect(toastWith(page, "Personal information saved.")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anna Lee")
  })

  await test.step("on /: add an email and a Mobile in Contacts; the user opens both verification links", async () => {
    const email = region(page, "Email")
    await email.getByRole("button", { name: "Add email" }).click()
    await newRow(email).getByRole("textbox", { name: "Email address" }).fill(NEW_EMAIL)
    await pick(page, newRow(email).getByRole("combobox", { name: "Label" }), "Work")
    await saveSection(email)
    await expect(toastWith(page, "Email saved.")).toBeVisible()

    const phone = region(page, "Phone")
    await phone.getByRole("button", { name: "Add phone" }).click()
    await newRow(phone).getByRole("textbox", { name: "Number" }).fill("4155550123")
    await pick(page, newRow(phone).getByRole("combobox", { name: "Label" }), "Work")
    await pick(page, newRow(phone).getByRole("combobox", { name: "Type" }), "Mobile")
    await saveSection(phone)
    await expect(toastWith(page, "Phone saved.")).toBeVisible()

    await expect.poll(() => backend.state.verifyRequests.length).toBe(2)
    backend.clickVerificationLink(NEW_EMAIL)
    backend.clickVerificationLink("+14155550123")
    // Back from the links (opened on another device): a reload shows both verified. Navigating within 2 s of the
    // save would reuse SWR's deduped lists from before the verification, which no real user can do.
    await page.reload()
    await expect(readRow(email, NEW_EMAIL).locator('[data-slot="status-badge"]')).toHaveText("Verified")
    await expect(readRow(phone, NEW_PHONE).locator('[data-slot="status-badge"]')).toHaveText("Verified")
  })

  await test.step("on /account: the new name, and the verified contacts as primary choices; switch both", async () => {
    await page.getByRole("link", { name: "Account" }).click()
    await expect(page).toHaveURL(/\/account\?tab=personal$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anna Lee")
    const section = region(page, "Personal account settings")
    await expect(section.getByRole("cell", { name: "Anna", exact: true })).toBeVisible()
    await section.getByRole("button", { name: "Edit", exact: true }).click()
    await expect(section.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("Anna")
    const email = section.getByRole("combobox", { name: "Primary email address", exact: true })
    const phone = section.getByRole("combobox", { name: "Primary phone number", exact: true })
    await expect(email).not.toHaveAttribute("aria-busy", "true")
    await expect(phone).not.toHaveAttribute("aria-busy", "true")
    await email.click()
    await expect(page.getByRole("option")).toHaveText([JOURNEY_START.email, NEW_EMAIL])
    await page.getByRole("option", { name: NEW_EMAIL, exact: true }).click()
    await pick(page, phone, NEW_PHONE)
    await section.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByText("Personal account updated successfully", { exact: true })).toBeVisible()
    await expect(section.getByText(NEW_EMAIL, { exact: true })).toBeVisible()
    await expect(section.getByText(NEW_PHONE, { exact: true })).toBeVisible()
    // Only the switch was sent: the name came from Profile and is unchanged here.
    expect(backend.userEdits().at(-1)).toMatchObject({ email: NEW_EMAIL, phoneNumber: "+14155550123" })
    expect(backend.userEdits().at(-1)).not.toHaveProperty("firstName")
  })

  await test.step("back on /: Contacts reads the switched primaries (Primary and Old), and so does the header", async () => {
    await page.getByRole("link", { name: "Personal Profile" }).click()
    await expect(page).toHaveURL(/\/\?tab=contacts$/)
    const email = region(page, "Email")
    const phone = region(page, "Phone")
    await expect(readRow(email, NEW_EMAIL).locator('[data-slot="chip"]')).toHaveText("Primary")
    await expect(readRow(email, JOURNEY_START.email).locator('[data-slot="chip"]')).toHaveText("Old")
    await expect(readRow(phone, NEW_PHONE).locator('[data-slot="chip"]')).toHaveText("Primary")
    await expect(readRow(phone, "+1 (415) 555-2671").locator('[data-slot="chip"]')).toHaveText("Old")
    if (!isMobile) {
      await expect(header(page).getByText(NEW_EMAIL)).toBeVisible()
      await expect(header(page).getByText(NEW_PHONE)).toBeVisible()
    }
  })

  await test.step("Return to 1health: the real logout, the portal in the same tab, and the session is gone", async () => {
    const logout = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/session/logout")
    await page.getByRole("link", { name: "Return to 1health" }).click()
    expect((await logout).status()).toBe(204)
    await page.waitForURL((url) => url.origin === portalOrigin)
    await page.goto("/account")
    await expect(page).toHaveURL(/\/auth$/)
  })
})
