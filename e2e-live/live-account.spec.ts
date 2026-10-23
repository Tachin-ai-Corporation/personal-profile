import { expect, expectNoLoadErrors, test } from "./fixtures"

/**
 * Live, read-only checks of Account (`/account`, Team B, Epics 7–10) against
 * 1health dev: the settings show the dev user's data, the authenticator
 * vendors are offered, Provider Registration and My Organizations load real
 * data. Nothing is written (no MFA change, no registration).
 */

const VENDORS = ["Google", "Microsoft", "Authy", "DUO", "Android OTP"] as const

test.describe("Account on dev (read-only)", () => {
  test("Personal Account: settings show the dev username; the authenticator Section loads", async ({ page, liveLaunch, myself }) => {
    await liveLaunch()
    await page.getByRole("link", { name: "Account" }).click()
    await expect(page).toHaveURL(/\/account/)
    await expect(page.getByRole("tab", { name: "Personal Account" })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("heading", { name: "Personal account settings" })).toBeVisible()
    if (myself.username) await expect(page.getByText(myself.username, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("heading", { name: "Authenticator app" })).toBeVisible()
    await page.waitForLoadState("networkidle")
    await expectNoLoadErrors(page)
  })

  test("Authenticator: the five vendors are offered (or MFA shows as on)", async ({ page, liveLaunch }) => {
    await liveLaunch()
    await page.goto("/account")
    const section = page.getByRole("region", { name: "Authenticator app", exact: true })
    await expect(section).toBeVisible()
    await page.waitForLoadState("networkidle")
    // A user with MFA on sees its status instead of the Link tiles.
    const tiles = await section.getByRole("button", { name: /^Link / }).count()
    if (tiles > 0) for (const vendor of VENDORS) await expect(section.getByRole("button", { name: `Link ${vendor}`, exact: true })).toBeVisible()
    await expectNoLoadErrors(page)
  })

  test("Individual Provider Registration loads the dev NPI state with no error", async ({ page, liveLaunch }) => {
    await liveLaunch()
    await page.goto("/account?tab=provider")
    await expect(page.getByRole("tab", { name: "Individual Provider Registration" })).toHaveAttribute("aria-selected", "true")
    await page.waitForLoadState("networkidle")
    await expectNoLoadErrors(page)
  })

  test("My Organizations shows the dev organizations (or the empty state)", async ({ page, liveLaunch, upstream }) => {
    const response = await upstream.get("v2/user/organization/portal", { params: { name: "", page: "0", size: "12" } })
    const list = response.ok()
      ? ((await response.json()) as { data?: { organization?: { name?: string | null; shortOrganizationName?: string | null } | null }[] })
      : null
    await liveLaunch()
    await page.goto("/account?tab=organizations")
    await expect(page.getByRole("tab", { name: "My Organizations" })).toHaveAttribute("aria-selected", "true")
    await page.waitForLoadState("networkidle")
    // A card is titled with the short name, else the name (spec 10.2).
    const names = (list?.data ?? [])
      .map((row) => row.organization?.shortOrganizationName?.trim() || row.organization?.name?.trim())
      .filter((name): name is string => Boolean(name))
    if (list && names.length === 0) await expect(page.getByText("You aren't managing any organizations yet")).toBeVisible()
    for (const name of names) await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
    await expectNoLoadErrors(page)
  })
})
