import { expect, type Locator, type Page } from "@playwright/test"
import { createJourneyBackend, JOURNEY_START, launch, PNG_1X1, test } from "./fixtures"

/**
 * The integrated journey suite (NG-9019), Team A: one user on `/` (Epics 1–5,
 * with Epic 6 Medical as its placeholder tab), in the order the legacy
 * 1health-fe Profile screen is used: header and picture, Personal information
 * with the Signature and the SSN, Phone (add, verify, notifications), Email
 * (add, verify, Make primary), Social media, Addresses, Insurance, Medical.
 *
 * How it differs from the per-story specs (`e2e/profile-*.spec.ts`): those
 * test one story each against canned answers, edge cases included. This one
 * signs in once through the real launch (`launch()`: `/auth?lpl=` → the
 * server's upstream mock → a real sealed session) and runs against the
 * stateful fake backend (`createJourneyBackend`, `e2e/fixtures/journey.ts`),
 * so every save changes what later reads return; it checks continuity (the
 * header follows Personal information and the Primary email, a full reload
 * keeps everything), not the edge cases. Selectors and flows are the
 * per-story specs'; runs on desktop and mobile-360.
 */

const NEW_PHONE = "+1 (415) 555-0101"
const START_PHONE = "+1 (415) 555-2671"
const NEW_EMAIL = "anna.personal@example.test"
const LINK = "https://linkedin.com/in/anna-lee"
const OAK = "9 Oak Ave, Apt 4, SF, CA 94105"
const PINE = "1 Pine St, SF, CA 94105"

const region = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true })
const toastWith = (page: Page, text: string): Locator => page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })
const header = (page: Page): Locator => page.locator("div:has(> h1)")
const footer = (section: Locator): Locator => section.locator('[data-slot="section-footer"]')
const newRow = (section: Locator): Locator => section.locator('[data-state="new"]').first() // the latest added: new rows go on top (1health-fe parity)
/** A read row (desktop table) or card (360 px) holding `text`. */
const readRow = (section: Locator, text: string): Locator => section.locator("tbody tr, li[data-slot='section-table-card']").filter({ hasText: text })
const personalTable = (page: Page): Locator => region(page, "Personal information").getByRole("table", { name: "Personal information" })

async function valueCell(page: Page, label: string): Promise<Locator> {
  const id = await personalTable(page).getByRole("rowheader", { name: label, exact: true }).getAttribute("id")
  return personalTable(page).locator(`td[headers="${id}"]`)
}

async function pick(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

/** A row's kebab item (the kebab lists every row action on both layouts). */
async function kebab(page: Page, section: Locator, name: string, item: string): Promise<void> {
  await section.getByRole("button", { name: `More actions for ${name}` }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
}

/** Saves a Section from its footer and waits for the read view. */
async function saveSection(section: Locator): Promise<void> {
  await footer(section).getByRole("button", { name: "Save" }).click()
  await expect(footer(section)).toHaveCount(0)
}

/** One stroke across the Signature pad with the mouse (Story 2.4's `drawOnPad`). */
async function drawSignature(page: Page): Promise<void> {
  const pad = region(page, "Personal information").getByRole("img", { name: "Draw your signature" })
  await pad.scrollIntoViewIfNeeded()
  const box = await pad.boundingBox()
  if (!box) throw new Error("no pad")
  await page.mouse.move(box.x + 30, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + 90, box.y + 50, { steps: 8 })
  await page.mouse.move(box.x + 160, box.y + 110, { steps: 8 })
  await page.mouse.up()
}

test("Team A journey: launch → header picture → Personal information → Contacts → Addresses → Insurance → Medical → reload", async ({ page, isMobile }) => {
  test.setTimeout(180_000)
  const backend = await createJourneyBackend(page, { seedAlternatives: false })

  await test.step("launch from the portal lands on Contacts with the header and three tabs", async () => {
    await launch(page)
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await expect(page.getByRole("tab")).toHaveText(["Contacts", "Insurance", /^Medical/])
    await expect(page.getByRole("tab", { selected: true })).toHaveText("Contacts")
    await expect(page.getByText("AL", { exact: true })).toBeVisible()
    if (!isMobile) {
      await expect(header(page).getByText(START_PHONE)).toBeVisible()
      await expect(header(page).getByText(JOURNEY_START.email)).toBeVisible()
    }
  })

  await test.step("change the profile picture from the header avatar", async () => {
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Change profile picture" }).click()
    await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_1X1 })
    const dialog = page.getByRole("dialog", { name: "Change profile picture" })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: /^Sav/ }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect(toastWith(page, "Profile picture saved.")).toBeVisible()
    expect(backend.state.pictureId).not.toBeNull()
    await expect(page.locator('img[src*="/profile-picture/preview"]').first()).toHaveAttribute("src", `/api/1h/v2/user/profile-picture/preview?v=${backend.state.pictureId}`)
  })

  await test.step("Personal information: rename to Anna and draw a Signature; the header follows", async () => {
    const section = region(page, "Personal information")
    await expect(await valueCell(page, "Signature")).toHaveText("Not provided")
    await section.getByRole("button", { name: "Edit" }).click()
    await expect(section.getByText("Editing")).toBeVisible()
    await section.getByLabel(/^First name( \(optional\))?$/).fill("Anna")
    await drawSignature(page)
    await section.getByRole("button", { name: "Save" }).click()
    await expect(section.getByRole("button", { name: "Edit" })).toBeVisible()
    await expect(toastWith(page, "Personal information saved.")).toBeVisible()
    expect(backend.userEdits()).toEqual([{ firstName: "Anna" }])
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anna Lee")
    await expect(await valueCell(page, "First name")).toHaveText("Anna")
    const signatureId = (backend.user.signature as { id: number }).id
    await expect((await valueCell(page, "Signature")).getByRole("img", { name: "Your signature" })).toHaveAttribute("src", `/api/1h/v2/file/${signatureId}/download`)
  })

  await test.step("Personal information: Reveal and Hide the SSN", async () => {
    const section = region(page, "Personal information")
    const cell = await valueCell(page, "SSN")
    await section.getByRole("button", { name: "Reveal SSN" }).click()
    await expect(cell.getByText("987-65-1234")).toBeVisible()
    await section.getByRole("button", { name: "Hide SSN" }).click()
    await expect(cell.locator(".mono-value")).toHaveText("***-**-1234")
  })

  await test.step("Phone: add a Mobile; the save sends its verification link; the user opens it", async () => {
    const section = region(page, "Phone")
    await section.getByRole("button", { name: "Add phone" }).click()
    const row = newRow(section)
    await row.getByRole("textbox", { name: "Number" }).fill("4155550101")
    await pick(page, row.getByRole("combobox", { name: "Label" }), "Personal")
    await pick(page, row.getByRole("combobox", { name: "Type" }), "Mobile")
    await saveSection(section)
    await expect(toastWith(page, "Phone saved.")).toBeVisible()
    const added = backend.contacts.find((point) => point.value === "+14155550101")
    expect(added).toMatchObject({ type: "Mobile", label: "Personal", isVerified: false })
    await expect.poll(() => backend.state.verifyRequests).toEqual([[added?.id]])
    await expect(readRow(section, NEW_PHONE).locator('[data-slot="status-badge"]')).toHaveText(/^Link sent · Resend in \d+ s$/)
    backend.clickVerificationLink("+14155550101")
    await page.reload()
    await expect(readRow(section, NEW_PHONE).locator('[data-slot="status-badge"]')).toHaveText("Verified")
    await expect(section.locator('[data-slot="section-meta"]')).toHaveText("2")
  })

  await test.step("Phone: turn off notifications on the Primary", async () => {
    const section = region(page, "Phone")
    await section.getByRole("button", { name: "Edit", exact: true }).click()
    const toggle = section.getByRole("switch", { name: `Notifications for ${START_PHONE}` })
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await toggle.click()
    await saveSection(section)
    expect(backend.contacts.find((point) => point.value === JOURNEY_START.phone)).toMatchObject({ label: "Primary", isNotificationEnabled: false })
    await expect(readRow(section, START_PHONE)).toContainText("Off")
  })

  await test.step("Email: add one, verify it from the link, make it Primary; the header shows it", async () => {
    const section = region(page, "Email")
    await section.getByRole("button", { name: "Add email" }).click()
    const row = newRow(section)
    await row.getByRole("textbox", { name: "Email address" }).fill(NEW_EMAIL)
    await pick(page, row.getByRole("combobox", { name: "Label" }), "Personal")
    await saveSection(section)
    await expect(toastWith(page, "Email saved.")).toBeVisible()
    await expect.poll(() => backend.state.verifyRequests.length).toBe(2)
    backend.clickVerificationLink(NEW_EMAIL)
    await page.reload()
    await expect(readRow(section, NEW_EMAIL).locator('[data-slot="status-badge"]')).toHaveText("Verified")
    await kebab(page, section, NEW_EMAIL, "Make primary")
    const dialog = page.getByRole("alertdialog")
    await expect(dialog.getByRole("heading", { name: "This changes how you sign in" })).toBeVisible()
    await dialog.getByRole("button", { name: "Make primary" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(toastWith(page, "Email saved.")).toBeVisible()
    await expect(readRow(section, NEW_EMAIL).locator('[data-slot="chip"]')).toHaveText("Primary")
    await expect(readRow(section, JOURNEY_START.email).locator('[data-slot="chip"]')).toHaveText("Old")
    expect(backend.user.email).toBe(NEW_EMAIL)
    if (!isMobile) await expect(header(page).getByText(NEW_EMAIL)).toBeVisible()
  })

  await test.step("Social media: add a link; it reads as a link that opens in a new tab", async () => {
    const section = region(page, "Social media")
    await expect(section.locator('[data-slot="empty-state-line"]')).toHaveText("No social links yet·Add link")
    await section.getByRole("button", { name: "Add link" }).first().click()
    await newRow(section).getByRole("textbox", { name: "Link" }).fill(LINK)
    await saveSection(section)
    await expect(toastWith(page, "Social media saved.")).toBeVisible()
    await expect(section.getByRole("link", { name: LINK })).toHaveAttribute("target", "_blank")
    expect(backend.state.verifyRequests).toHaveLength(2)
  })

  await test.step("Addresses: add a work address, make it Primary, remove the old home", async () => {
    const section = region(page, "Addresses")
    await expect(readRow(section, OAK)).toBeVisible()
    await section.getByRole("button", { name: "Add address" }).first().click()
    const row = section.locator('[data-slot="address-expanded"]').first()
    await expect(row.getByRole("combobox", { name: "Country" })).toHaveText("United States")
    await pick(page, row.getByRole("combobox", { name: "Address Type" }), "Main Work")
    await row.getByRole("combobox", { name: "Address line 1", exact: true }).fill("1 Pine St")
    await row.getByRole("textbox", { name: "City", exact: true }).fill("SF")
    await row.getByRole("textbox", { name: "State/Province (optional)", exact: true }).fill("CA")
    await row.getByRole("textbox", { name: "Zip", exact: true }).fill("94105")
    await saveSection(section)
    await expect(toastWith(page, "Addresses saved.")).toBeVisible()
    await expect(section.locator('[data-slot="section-meta"]')).toHaveText("2")

    await kebab(page, section, PINE, "Make primary")
    await expect(section.locator("tbody tr, li[data-slot='section-table-card']").first()).toContainText(PINE)
    await expect(readRow(section, PINE).locator('[data-slot="chip"]')).toHaveText("Primary")

    await kebab(page, section, OAK, "Remove")
    await expect(readRow(section, OAK)).toHaveAttribute("data-state", "removed")
    await saveSection(section)
    await expect(section.locator('[data-slot="section-meta"]')).toHaveText("1")
    expect(backend.addresses.map((address) => [address.addressLine1, address.primary])).toEqual([["1 Pine St", true]])
  })

  await test.step("Insurance: add a Dental policy, then delete the old Medical one", async () => {
    await page.getByRole("tab", { name: "Insurance" }).click()
    await expect(page).toHaveURL(/\?tab=insurance$/)
    const section = region(page, "Insurance")
    await expect(section.getByRole("article", { name: "Medical Insurance" })).toBeVisible()
    await section.locator('[data-slot="section-header"]').getByRole("button", { name: "Add insurance" }).click()
    const drawer = page.getByRole("dialog", { name: "Add insurance" })
    const field = (label: string): Locator => drawer.getByLabel(new RegExp(`^${label}( \\(optional\\))?$`)).first()
    await field("Insurer").fill("Delta")
    await page.getByRole("option", { name: "Delta Dental", exact: true }).click()
    await pick(page, field("Type"), "Dental")
    await pick(page, field("Precedence"), "Primary")
    await pick(page, field("Relationship"), "Self")
    await field("Member ID").fill("DD1001")
    await field("Effective date").fill("01012026")
    await drawer.getByRole("button", { name: "Save" }).click()
    await expect(drawer).toBeHidden()
    await expect(toastWith(page, "Insurance saved.")).toBeVisible()
    await expect(section.getByRole("article", { name: "Dental Insurance" })).toBeVisible()
    await expect(section.locator('[data-slot="section-meta"]')).toHaveText("2")

    await kebab(page, section, "UnitedHealthcare Medical Insurance", "Delete")
    const confirm = page.getByRole("alertdialog", { name: "Delete this insurance policy?" })
    await confirm.getByRole("button", { name: "Delete policy" }).click()
    await expect(confirm).toBeHidden()
    await expect(toastWith(page, "Insurance policy deleted.")).toBeVisible()
    await expect(section.getByRole("article", { name: "Medical Insurance" })).toHaveCount(0)
    await expect(section.locator('[data-slot="section-meta"]')).toHaveText("1")
  })

  await test.step("Medical: the placeholder tab (Epic 6 on hold)", async () => {
    await page.getByRole("tab", { name: /^Medical/ }).click()
    await expect(page).toHaveURL(/\?tab=medical$/)
    await expect(page.getByText("Coming soon: medications, allergies and conditions will appear here")).toBeVisible()
  })

  await test.step("back on Contacts, then a full reload: everything saved is still there", async () => {
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      else await page.getByRole("tab", { name: "Contacts" }).click()
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anna Lee")
      await expect(await valueCell(page, "First name")).toHaveText("Anna")
      await expect(readRow(region(page, "Phone"), NEW_PHONE).locator('[data-slot="status-badge"]')).toHaveText("Verified")
      await expect(readRow(region(page, "Email"), NEW_EMAIL).locator('[data-slot="chip"]')).toHaveText("Primary")
      await expect(region(page, "Social media").getByRole("link", { name: LINK })).toBeVisible()
      await expect(readRow(region(page, "Addresses"), PINE)).toBeVisible()
      await expect(readRow(region(page, "Addresses"), OAK)).toHaveCount(0)
      await expect(page.locator('img[src*="/profile-picture/preview"]').first()).toBeVisible()
    }
    await page.getByRole("tab", { name: "Insurance" }).click()
    await expect(region(page, "Insurance").getByRole("article", { name: "Dental Insurance" })).toBeVisible()
  })
})
