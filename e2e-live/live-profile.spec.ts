import { expect, expectNoLoadErrors, sectionByHeading, test, type LiveContactPoint } from "./fixtures"

/**
 * Live, read-only checks of Personal Profile (`/`, Team A, Epics 1–5) against
 * 1health dev: a real launch, then every Section loads real data through the
 * BFF and shows what the dev API holds for the test user. Nothing is written.
 */

const SECTIONS = ["Personal information", "Phone", "Email", "Social media", "Addresses"] as const

const fullName = (first?: string | null, last?: string | null): string => [first, last].filter(Boolean).join(" ").trim()

test.describe("Personal Profile on dev (read-only)", () => {
  test("a real launch lands on Contacts; the header shows the dev user's name", async ({ page, liveLaunch, myself }) => {
    await liveLaunch()
    const name = fullName(myself.firstName, myself.lastName)
    if (name) await expect(page.getByRole("heading", { level: 1 })).toContainText(name)
    await expect(page.getByRole("link", { name: "Personal Profile" })).toHaveAttribute("aria-current", "page")
    await expect(page.getByRole("tab", { name: "Contacts" })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("tab", { name: "Insurance" })).toBeVisible()
    await expect(page.getByRole("tab", { name: /^Medical/ })).toBeVisible()
  })

  test("Contacts: the five Sections load with no error; Personal information shows the dev first name", async ({ page, liveLaunch, myself }) => {
    await liveLaunch()
    for (const name of SECTIONS) await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible()
    await expect(page.getByRole("table", { name: "Personal information" })).toBeVisible({ timeout: 20_000 })
    if (myself.firstName) {
      const table = page.getByRole("table", { name: "Personal information" })
      const id = await table.getByRole("rowheader", { name: "First name", exact: true }).getAttribute("id")
      await expect(table.locator(`td[headers="${id}"]`)).toHaveText(myself.firstName)
    }
    await page.waitForLoadState("networkidle")
    await expectNoLoadErrors(page)
  })

  test("Email shows every email address the dev API holds", async ({ page, liveLaunch, upstream }) => {
    const response = await upstream.get("v2/user/contact-point/list", { params: { type: "Email" } })
    expect(response.ok()).toBe(true)
    const emails = ((await response.json()) as LiveContactPoint[]).map((row) => row.value).filter((value): value is string => Boolean(value))
    await liveLaunch()
    const email = sectionByHeading(page, "Email")
    await expect(email).toBeVisible()
    await page.waitForLoadState("networkidle")
    for (const value of emails) await expect(email.getByText(value, { exact: false }).first()).toBeVisible()
    await expectNoLoadErrors(page)
  })

  test("Insurance tab loads the policies (or the empty state) with no error", async ({ page, liveLaunch }) => {
    await liveLaunch()
    await page.getByRole("tab", { name: "Insurance" }).click()
    await expect(page).toHaveURL(/tab=insurance/)
    await expect(page.getByRole("heading", { level: 2, name: "Insurance" })).toBeVisible()
    await page.waitForLoadState("networkidle")
    await expectNoLoadErrors(page)
  })

  test("Medical stays the coming-soon placeholder (Epic 6 on hold)", async ({ page, liveLaunch }) => {
    await liveLaunch()
    await page.getByRole("tab", { name: /^Medical/ }).click()
    await expect(page.getByText("Coming soon: medications, allergies and conditions will appear here")).toBeVisible()
  })
})
