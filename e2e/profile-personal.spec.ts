import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { ANN, mockFileDownload, mockMyself, mockProfileDefaults, mockTypeKey, setTheme, signIn, test } from "./fixtures"

/**
 * Story 2.1 (Team A, NG-9022): the Personal information read view on the
 * real `/`. Every test runs under the fail-fast `test`, starts from
 * `mockProfileDefaults` and overrides `myself` (frozen `ANN` + the fields
 * under test) and the Signature image.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

const SIGNATURE_FILE_ID = 501

/** `ANN` with every Personal information field filled. */
const FULL_MYSELF = {
  ...ANN,
  namePrefix: "Dr.",
  middleName: "Marie",
  nameSuffix: "Jr.",
  otherNames: "Ann Smith",
  titles: "MD",
  birthDate: "1987-03-09",
  cityOfBirth: "Springfield",
  race: "Asian",
  ethnicity: "Not Hispanic or Latino",
  biologicalGender: "Female",
  genderIdentity: "Woman",
  sexualOrientation: "n/a",
  socialSecurityNumber: "***-**-1234",
  signature: { id: SIGNATURE_FILE_ID, name: "signature.png" },
  email: "ann.lee@example.com",
  phoneNumber: "+14155552671",
}

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
  await mockMyself(page, { body: FULL_MYSELF })
  await mockFileDownload(page, SIGNATURE_FILE_ID)
  await page.goto(url)
  await expect(personalTable(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("Personal information read view (Story 2.1)", () => {
  test("shows the 16 rows in the F1 order with their values; no email or phone; no Edit yet", async ({ page }) => {
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
    await expect(img).toHaveAttribute("src", `/api/1h/v2/file/${SIGNATURE_FILE_ID}/download`)
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
    // The 112 × 32 thumbnail is the bordered frame around the image.
    const thumb = (await valueCell(page, "Signature")).locator('[data-slot="signature-thumb"]')
    expect(await thumb.evaluate((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height])).toEqual([112, 32])

    await expect(personalTable(page)).not.toContainText("ann.lee@example.com")
    await expect(section.getByRole("button")).toHaveCount(0)
  })

  test("a broken signature image reads \"Not provided\"", async ({ page }) => {
    await mockProfileDefaults(page)
    await mockMyself(page, { body: FULL_MYSELF })
    await mockFileDownload(page, SIGNATURE_FILE_ID, { status: 404, contentType: "application/json", body: Buffer.from('{"errorCode":"NOT_FOUND"}') })
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

    const myselfRequests = await mockMyself(page, { body: FULL_MYSELF })
    await mockFileDownload(page, SIGNATURE_FILE_ID)
    await section.getByRole("button", { name: "Retry" }).click()
    await expect(personalTable(page)).toBeVisible()
    await expect(await valueCell(page, "Birth date")).toHaveText("03/09/1987")
    expect(myselfRequests()).toBe(1)
    expect(typeKeyRequests().length).toBe(typeKeysBefore)
  })

  test("a failed Person type key leaves the read view unaffected", async ({ page }) => {
    await mockProfileDefaults(page)
    await mockMyself(page, { body: FULL_MYSELF })
    await mockFileDownload(page, SIGNATURE_FILE_ID)
    const typeKeyRequests = await mockTypeKey(page, "Person", { status: 500, body: { message: "boom" } })
    await page.goto("/")
    await expect(personalTable(page)).toBeVisible()
    await expect.poll(() => typeKeyRequests().length).toBeGreaterThanOrEqual(1)
    await expect(await valueCell(page, "Race")).toHaveText("Asian")
    await expect(page.getByRole("region", { name: "Personal information" }).getByText(/Couldn't load/)).toHaveCount(0)
  })
})
