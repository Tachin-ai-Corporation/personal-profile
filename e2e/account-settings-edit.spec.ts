import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"
import { test, mockAccountDefaults, mockMyself, mockProxy, mockUserEdit, mockAccountTimeZone, mockAccountLocale, ACCOUNT_SETTINGS_MYSELF, signIn, setTheme } from "./fixtures"

const account = (page: Page) => page.getByRole("region", { name: "Personal account settings", exact: true })
async function openEdit(page: Page) {
  await page.goto("/account")
  await account(page).getByRole("button", { name: "Edit", exact: true }).click()
  await expect(account(page).getByRole("textbox", { name: "First name", exact: true })).toBeFocused()
}
test.beforeEach(async ({ page }) => {
  await mockAccountDefaults(page)
  await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
  await signIn(page)
})

test("edit six fields, birth-date help, unchanged save and Cancel", async ({ page }) => {
  await openEdit(page)
  const section = account(page)
  await expect(section.getByRole("textbox", { name: "Username", exact: true })).toHaveAttribute("readonly", "")
  await section.getByRole("button", { name: "Save", exact: true }).click()
  await expect(section.getByText("There are no changes", { exact: true })).toBeVisible()
  // Settle scrolling before the keyboard transition: Radix dismisses an open
  // tooltip when an ancestor scrolls, including a delayed native focus scroll.
  const birthDateHelp = section.getByRole("button", { name: "About birth date" })
  await birthDateHelp.scrollIntoViewIfNeeded()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await section.getByRole("textbox", { name: "Birth date", exact: true }).focus()
  await page.keyboard.press("Shift+Tab")
  await expect(birthDateHelp).toBeFocused()
  await expect(page.getByRole("tooltip")).toContainText("Your date of birth")
  await page.keyboard.press("Escape")
  await section.getByRole("textbox", { name: "First name", exact: true }).fill("Bea")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Escape")
  await expect(section.getByRole("button", { name: "Save", exact: true })).toBeVisible()
  await section.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeFocused()
})

test("Primary email address is required like Primary phone number (parity)", async ({ page }) => {
  await openEdit(page)
  const section = account(page)
  for (const name of ["Primary email address", "Primary phone number"]) {
    await expect(section.getByRole("combobox", { name, exact: true })).toHaveAttribute("aria-required", "true")
  }
})

test("validation distinguishes invalid and missing dates and focuses first invalid", async ({ page }) => {
  await openEdit(page)
  const section = account(page)
  const first = section.getByRole("textbox", { name: "First name", exact: true })
  const date = section.getByRole("textbox", { name: "Birth date", exact: true })
  await first.fill("")
  await date.fill("02/30/1990")
  await section.getByRole("button", { name: "Save", exact: true }).click()
  await expect(first).toBeFocused()
  await expect(first).toHaveAttribute("aria-invalid", "true")
  await expect(section.getByText("Enter a date as MM/DD/YYYY", { exact: true })).toBeVisible()
  await date.fill("")
  await section.getByRole("button", { name: "Save", exact: true }).click()
  await expect(section.getByText("Birth date is required", { exact: true })).toBeVisible()
})

for (const theme of ["light", "dark"] as const) {
  test(`partial failure retries only failed part and passes axe in ${theme}`, async ({ page }) => {
    let failures = true
    const details = await mockUserEdit(page, { status: 204 })
    const zones = await mockAccountTimeZone(page, () => failures ? { status: 500 } : { status: 204 })
    await mockAccountLocale(page)
    await openEdit(page)
    await setTheme(page, theme)
    const section = account(page)
    await section.getByRole("textbox", { name: "First name", exact: true }).fill("Bea")
    await section.getByRole("textbox", { name: "Birth date", exact: true }).fill("04/15/1990")
    await section.getByRole("combobox", { name: "Default time zone", exact: true }).click()
    await page.getByRole("option", { name: "Eastern", exact: true }).click()
    expect((await new AxeBuilder({ page }).include("#account").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([])
    await section.getByRole("button", { name: "Save", exact: true }).click()
    await expect(section.getByText("Time zone was not saved.", { exact: true })).toBeVisible()
    expect((await new AxeBuilder({ page }).include("#account").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([])
    failures = false
    await section.getByRole("button", { name: "Save", exact: true }).click()
    await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
    await expect(section.getByRole("heading", { name: "Personal account settings", exact: true })).toBeFocused()
    expect(details()).toEqual([{ firstName: "Bea", birthDate: "1990-04-15" }])
    expect(zones()).toHaveLength(2)
    await expect(page.getByText("Personal account updated successfully", { exact: true })).toBeVisible()
  })
}

test("dirty navigation has three choices; failed guard Save prevents departure", async ({ page }) => {
  await mockUserEdit(page, { status: 500 })
  await openEdit(page)
  await account(page).getByRole("textbox", { name: "First name", exact: true }).fill("Bea")
  await page.getByRole("tab", { name: "Individual Provider Registration", exact: true }).click()
  const guard = page.getByRole("alertdialog", { name: "You have unsaved changes", exact: true })
  await expect(guard.getByRole("button", { name: "Keep editing", exact: true })).toBeVisible()
  await expect(guard.getByRole("button", { name: "Discard", exact: true })).toBeVisible()
  await guard.getByRole("button", { name: "Save", exact: true }).click()
  await expect(account(page).getByText("Account details was not saved.", { exact: true })).toBeVisible()
  expect(page.url()).not.toContain("tab=provider")
})

test("six-field draft restores after reload and external names produce conflict", async ({ page }) => {
  await openEdit(page)
  await account(page).getByRole("textbox", { name: "First name", exact: true }).fill("Bea")
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith(":account")).length)).toBe(1)
  const draft = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.endsWith(":account"))?.[1] ?? "")
  expect(draft).not.toContain("username")
  expect(draft).not.toContain("password")
  await page.reload()
  await account(page).getByRole("button", { name: "Restore", exact: true }).click()
  await expect(account(page).getByRole("textbox", { name: "First name", exact: true })).toHaveValue("Bea")
  await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, lastName: "External" } })
  await page.reload()
  await expect(account(page).getByText("Your version", { exact: true }).first()).toBeVisible()
})

for (const proctor of [false, true]) {
  test(`requires blank regional choices and applies ${proctor ? "Proctor 21" : "Patient 18"} birthday boundary`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-19T12:00:00Z"))
    await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, roles: [proctor ? "Proctor" : "Patient"], preferredLanguage: "", timeZone: "", locale: "" } })
    const writes = await mockUserEdit(page, { status: 204 })
    await mockAccountTimeZone(page)
    const locales = await mockAccountLocale(page)
    await openEdit(page)
    const section = account(page)
    await section.getByRole("textbox", { name: "Birth date", exact: true }).fill(proctor ? "10/20/2005" : "10/20/2008")
    await section.getByRole("button", { name: "Save", exact: true }).click()
    await expect(section.getByText(`You must be between ${proctor ? 21 : 18} and 120 years old`, { exact: true })).toBeVisible()
    await expect(section.getByText("Select a preferred language", { exact: true })).toBeVisible()
    await expect(section.getByText("Select a time zone", { exact: true })).toBeVisible()
    await section.getByRole("textbox", { name: "Birth date", exact: true }).fill(proctor ? "10/19/2005" : "10/19/2008")
    for (const [label, option] of [["Preferred language", "English"], ["Default time zone", "Central"]]) {
      await section.getByRole("combobox", { name: label, exact: true }).click()
      await page.getByRole("option", { name: option, exact: true }).click()
    }
    await section.getByRole("button", { name: "Save", exact: true }).click()
    await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
    expect(writes()).toEqual([{ birthDate: proctor ? "2005-10-19" : "2008-10-19", preferredLanguage: "en" }])
    expect(locales()).toHaveLength(0)
  })
}

test("unlisted regional values remain selected and are omitted from a names-only save", async ({ page }) => {
  await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, preferredLanguage: "es", timeZone: "Europe/Paris", locale: "fr-FR" } })
  const writes = await mockUserEdit(page, { status: 204 })
  await openEdit(page)
  const section = account(page)
  await expect(section.getByRole("combobox", { name: "Preferred language", exact: true })).toHaveText("Spanish")
  await expect(section.getByRole("combobox", { name: "Default time zone", exact: true })).toHaveText("Europe/Paris")
  await expect(section.getByRole("combobox", { name: "Preferred locale for date, time, and currency", exact: true })).toHaveText("fr-FR")
  await section.getByRole("textbox", { name: "First name", exact: true }).fill(" Bea ")
  await section.getByRole("button", { name: "Save", exact: true }).click()
  await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  expect(writes()).toEqual([{ firstName: "Bea" }])
})

test("a legacy `en-us` locale reads as English - United States, is the listed option and gets no locale write (NG-9033)", async ({ page }) => {
  await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, locale: "en-us" } })
  const writes = await mockUserEdit(page, { status: 204 })
  const locales = await mockAccountLocale(page)
  await page.goto("/account")
  const section = account(page)
  await expect(section.getByText("English - United States", { exact: true })).toBeVisible()
  await expect(section.getByText("en-us", { exact: true })).toHaveCount(0)
  await section.getByRole("button", { name: "Edit", exact: true }).click()
  const select = section.getByRole("combobox", { name: "Preferred locale for date, time, and currency", exact: true })
  await expect(select).toHaveText("English - United States")
  await select.click()
  await expect(page.getByRole("option")).toHaveText(["English - United States"])
  await page.keyboard.press("Escape")
  await section.getByRole("textbox", { name: "First name", exact: true }).fill("Bea")
  await section.getByRole("button", { name: "Save", exact: true }).click()
  await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  expect(writes()).toEqual([{ firstName: "Bea" }])
  expect(locales()).toHaveLength(0)
})

test("identity mismatch blocks all writes and keeps draft under its original owner", async ({ page }) => {
  const writes = await mockUserEdit(page)
  const zones = await mockAccountTimeZone(page)
  const locales = await mockAccountLocale(page)
  await openEdit(page)
  await account(page).getByRole("textbox", { name: "First name", exact: true }).fill("Bea")
  await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, id: 999 } })
  await account(page).getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("alertdialog", { name: "Your session ended", exact: true })).toBeVisible()
  expect(writes()).toHaveLength(0)
  expect(zones()).toHaveLength(0)
  expect(locales()).toHaveLength(0)
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith(":account")))
  expect(keys).toEqual([`pp:draft:v1:demo:${ACCOUNT_SETTINGS_MYSELF.id}:account`])
})

test("saving locks controls and Cancel and coalesces rapid duplicate Save presses", async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let writes = 0
  await page.route("**/api/1h/v2/user/edit", async (route) => {
    writes++
    await gate
    await route.fulfill({ status: 204 })
  })
  await openEdit(page)
  const section = account(page)
  const first = section.getByRole("textbox", { name: "First name", exact: true })
  await first.fill("Bea")
  await section.getByRole("button", { name: "Save", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  const saving = section.getByRole("button", { name: "Saving…", exact: true })
  await expect(saving).toHaveAttribute("aria-busy", "true")
  await expect(saving).toHaveAttribute("aria-disabled", "true")
  await expect(first).toHaveAttribute("readonly", "")
  await expect(section.getByRole("button", { name: "Cancel", exact: true })).toHaveAttribute("aria-disabled", "true")
  for (const select of await section.getByRole("combobox").all()) await expect(select).toHaveAttribute("aria-disabled", "true")
  await saving.click({ force: true })
  await section.getByRole("button", { name: "Cancel", exact: true }).click({ force: true })
  expect(writes).toBe(1)
  release()
  await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  expect(writes).toBe(1)
})

test("stored invalid-age birth date must be corrected even on unchanged Save", async ({ page }) => {
  await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, birthDate: "2020-01-01" } })
  await openEdit(page)
  const section = account(page)
  const date = section.getByRole("textbox", { name: "Birth date", exact: true })
  await expect(date).toHaveValue("01/01/2020")
  await section.getByRole("button", { name: "Save", exact: true }).click()
  await expect(section.getByText("You must be between 18 and 120 years old", { exact: true })).toBeVisible()
  await expect(date).toBeFocused()
})


for (const text of ["02/3", "02/30/1990"]) {
  test(`reload restores invalid date draft exactly: ${text}`, async ({ page }) => {
    const writes = await mockUserEdit(page)
    await openEdit(page)
    const date = account(page).getByRole("textbox", { name: "Birth date", exact: true })
    await date.fill(text)
    await expect(date).toHaveValue(text)
    await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.endsWith(":account") && value.includes('"birthDate"')))).toBe(true)
    await page.reload()
    await account(page).getByRole("button", { name: "Restore", exact: true }).click()
    await expect(date).toHaveValue(text)
    await account(page).getByRole("button", { name: "Save", exact: true }).click()
    await expect(date).toBeFocused()
    await expect(account(page).getByText("Enter a date as MM/DD/YYYY", { exact: true })).toBeVisible()
    expect(writes()).toHaveLength(0)
  })
}


test("leave-guard partial retry sends only the failed zone and then navigates", async ({ page }) => {
  let rejectZone = true
  const details = await mockUserEdit(page, { status: 204 })
  const zones = await mockAccountTimeZone(page, () => ({ status: rejectZone ? 500 : 204 }))
  await openEdit(page)
  const section = account(page)
  await section.getByRole("textbox", { name: "First name", exact: true }).fill("Bea")
  await section.getByRole("combobox", { name: "Default time zone", exact: true }).click()
  await page.getByRole("option", { name: "Eastern", exact: true }).click()
  const target = page.getByRole("tab", { name: "Individual Provider Registration", exact: true })
  const guard = page.getByRole("alertdialog", { name: "You have unsaved changes", exact: true })
  await target.click()
  await guard.getByRole("button", { name: "Save", exact: true }).click()
  await expect(guard).toBeHidden()
  await expect(section.getByText("Time zone was not saved.", { exact: true })).toBeVisible()
  await expect(target).toHaveAttribute("aria-selected", "false")
  expect(details()).toEqual([{ firstName: "Bea" }])
  expect(zones()).toHaveLength(1)
  rejectZone = false
  await target.click()
  await guard.getByRole("button", { name: "Save", exact: true }).click()
  await expect(target).toHaveAttribute("aria-selected", "true")
  await expect(page).toHaveURL(/tab=provider/)
  expect(details()).toEqual([{ firstName: "Bea" }])
  expect(zones()).toHaveLength(2)
  expect(zones().every((request) => new URL(request.url()).searchParams.get("timeZone") === "America/New_York")).toBe(true)
})

test("locale Select changes an unlisted saved locale to English - United States", async ({ page }) => {
  let locale = "fr-FR"
  await mockProxy(page, "v2/user/myself", () => ({ body: { ...ACCOUNT_SETTINGS_MYSELF, locale } }))
  const locales = await mockAccountLocale(page, (request) => {
    locale = new URL(request.url()).searchParams.get("locale") ?? ""
    return { status: 204 }
  })
  await openEdit(page)
  const section = account(page)
  const select = section.getByRole("combobox", { name: "Preferred locale for date, time, and currency", exact: true })
  await expect(select).toHaveText("fr-FR")
  await select.click()
  await page.getByRole("option", { name: "English - United States", exact: true }).click()
  await expect(select).toHaveText("English - United States")
  await section.getByRole("button", { name: "Save", exact: true }).click()
  await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  expect(locales()).toHaveLength(1)
  expect(new URL(locales()[0].url()).searchParams.get("locale")).toBe("en-US")
  await expect(section.getByText("English - United States", { exact: true })).toBeVisible()
  await page.reload()
  await expect(section.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await expect(section.getByText("English - United States", { exact: true })).toBeVisible()
})

for (const response of ["malformed", "non-JSON"] as const) {
  test(`failed ${response} 200 identity preflight never saves or clears the Account draft`, async ({ page }) => {
    const writes = await mockUserEdit(page, { status: 204 })
    const key = `pp:draft:v1:demo:${ACCOUNT_SETTINGS_MYSELF.id}:account`
    await openEdit(page)
    const section = account(page)
    await section.getByRole("textbox", { name: "First name", exact: true }).fill("Bea")
    const draftName = () => page.evaluate((draftKey) => JSON.parse(localStorage.getItem(draftKey) ?? "null")?.values?.firstName, key)
    await expect.poll(draftName).toBe("Bea")
    if (response === "malformed") await mockMyself(page, { body: {} })
    else await page.route("**/api/1h/v2/user/myself", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "not JSON" }))
    await section.getByRole("button", { name: "Save", exact: true }).click()
    await expect(section.getByRole("alert")).toContainText("Account details was not saved.")
    await expect(section.getByRole("button", { name: "Save", exact: true })).toBeVisible()
    expect(writes()).toHaveLength(0)
    await expect(page.getByText("Personal account updated successfully", { exact: true })).toHaveCount(0)
    await expect.poll(draftName).toBe("Bea")
    await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
    await page.reload()
    await section.getByRole("button", { name: "Restore", exact: true }).click()
    await expect(section.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("Bea")
  })
}
