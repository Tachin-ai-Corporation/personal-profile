import { expect } from "@playwright/test"
import { mockAccountDefaults, mockNpiSearch, setTheme, signIn, test } from "./fixtures"

test("a long selected practice label can be edited without exceeding the search limit", async ({ page }) => {
  await mockAccountDefaults(page)
  await signIn(page)
  const name = "Synthetic practice organization with a deliberately long registry name ".repeat(2).trim()
  const address = "1 Synthetic Practice Address"
  const label = ["1987654321", name, address, "Austin", "TX"].join(", ")
  expect(label.length).toBeGreaterThan(100)
  const searches = await mockNpiSearch(page, { body: { data: [{ id: 88, npi: 1987654321, providerOrganizationName: name, providerFirstLineBusinessMailingAddress: address, providerBusinessMailingAddressCityName: "Austin", providerBusinessMailingAddressStateName: "TX" }], totalElements: 1 } })
  await page.goto("/account?tab=provider")
  await setTheme(page, "light")
  const input = page.getByRole("combobox", { name: /^Search for your practice/ })
  await input.focus()
  await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(input).toHaveValue(label)
  await page.keyboard.press("End")
  await page.keyboard.type("x")
  await expect(input).toHaveValue("x")
  await expect.poll(() => searches().length).toBe(2)
  expect(new URL(searches()[1].url()).searchParams.get("searchText")).toBe("x")
})
