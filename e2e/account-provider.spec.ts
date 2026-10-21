import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { mockAccountDefaults, mockNpiSearch, mockUserNpi, setTheme, signIn, test } from "./fixtures"

const personalName = "Search for your personal NPI number"
const practiceName = "Search for your practice's (hospital, clinic, lab, etc.) NPI Number"
const personal = (page: Page) => page.getByRole("combobox", { name: personalName })
const practice = (page: Page) => page.getByRole("combobox", { name: practiceName, exact: false })
const record = (id = 77) => ({ id, npi: 1234567890 + id, providerFirstName: `Ann${id}`, providerLastName: "Lee", providerOrganizationName: `Clinic${id}`, providerFirstLineBusinessMailingAddress: "1 Main St", providerBusinessMailingAddressCityName: "Austin", providerBusinessMailingAddressStateName: "TX" })
const label = "1234567967, Ann77 Lee, Austin, TX"
async function touchTarget(target: Locator) {
  const box = await target.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.width).toBeGreaterThanOrEqual(44)
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true) }
async function axe(page: Page) { expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]) }

test.beforeEach(async ({ page }) => { await signIn(page); await mockAccountDefaults(page) })

test("lazy NPI read; keyboard personal/practice search, selection, clear and required registration (UJ-103)", async ({ page }) => {
  const reads = await mockUserNpi(page)
  const searches = await mockNpiSearch(page, { body: { data: [record()], totalElements: 1 } })
  const writes: string[] = []
  page.on("request", (request) => { if (request.method() !== "GET" && /\/api\/(?:1h|pp)\//.test(request.url())) writes.push(request.url()) })
  await page.goto("/account?tab=personal")
  await expect(page.getByRole("heading", { name: "Personal account settings" })).toBeVisible()
  expect(reads()).toHaveLength(0)
  await page.getByRole("tab", { name: "Individual Provider Registration" }).click()
  await expect(personal(page)).toBeVisible()
  expect(reads()).toHaveLength(1)
  await personal(page).focus()
  await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible()
  expect(new URL(searches()[0].url()).searchParams.get("searchText")).toBe("")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(personal(page)).toHaveValue(label)
  await personal(page).fill("  1987654321  ")
  await expect.poll(() => searches().length).toBe(2)
  expect(new URL(searches()[1].url()).searchParams.get("entityTypeCode")).toBe("1")
  expect(new URL(searches()[1].url()).searchParams.get("searchText")).toBe("1987654321")
  await touchTarget(page.getByRole("button", { name: `Clear ${personalName}` }))
  await page.getByRole("button", { name: `Clear ${personalName}` }).click()
  await expect(personal(page)).toBeFocused()
  await expect(personal(page)).toHaveValue("")
  await practice(page).focus()
  await expect(page.getByRole("option", { name: "1234567967, Clinic77, 1 Main St, Austin, TX", exact: true })).toBeVisible()
  expect(new URL(searches().at(-1)!.url()).searchParams.get("entityTypeCode")).toBe("2")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await touchTarget(page.getByRole("button", { name: /^Clear Search for your practice/ }))
  await page.getByRole("button", { name: "Register", exact: true }).click()
  expect(writes).toEqual([])
  expect(page.url()).not.toMatch(/Ann77|1234567967/)
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  expect(storage).not.toMatch(/Ann77|1234567967|Clinic77/)
  await page.reload()
  await expect(personal(page)).toHaveValue("")
  await expect(practice(page)).toHaveValue("")
})

for (const registered of [false, true]) {
  test(`${registered ? "registered" : "unregistered"} layout, both themes, targets and accessibility`, async ({ page }) => {
    if (registered) await mockUserNpi(page, { body: { providerNpi: { id: 77, npi: 1234567890 } } })
    await page.goto("/account?tab=provider")
    await expect(page.getByRole("heading", { name: "Healthcare credentials" })).toBeVisible()
    if (registered) {
      await expect(page.getByText("1234567890", { exact: true })).toBeVisible()
      await expect(page.getByRole("combobox")).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0)
    } else await expect(personal(page)).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await noOverflow(page)
      await axe(page)
      const info = page.getByRole("button", { name: "About provider registration" })
      await touchTarget(info)
      await page.getByRole("heading", { name: "Healthcare credentials" }).focus()
      await info.focus()
      await expect(page.getByText(/Registering links your 1health account/)).toBeVisible()
      await expect(info).toBeFocused()
      await noOverflow(page)
      await axe(page)
      await page.keyboard.press("Escape")
      await expect(page.getByText(/Registering links your 1health account/)).toHaveCount(0)
      if (!registered) {
        await personal(page).focus()
        await expect(page.getByRole("option", { name: "No matching NPI found" })).toBeVisible()
        await touchTarget(personal(page))
        await touchTarget(practice(page))
        await touchTarget(page.getByRole("button", { name: "Register", exact: true }))
        await noOverflow(page)
        await axe(page)
        await page.keyboard.press("Escape")
      }
    }
  })
}

test("read retries only NPI; upstream read403 replaces Provider while other tabs work", async ({ page }) => {
  let reads = 0
  await page.route("**/api/1h/v2/user/npi", (route) => {
    reads++
    return route.fulfill({ status: reads === 1 ? 500 : 403, contentType: "application/json", body: JSON.stringify({ message: "Synthetic failure" }) })
  })
  await page.goto("/account?tab=provider")
  await expect(page.getByText("Something went wrong while loading profile information")).toBeVisible()
  await expect(page.getByRole("combobox")).toHaveCount(0)
  await touchTarget(page.getByRole("button", { name: "Retry", exact: true }))
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(page.getByText("You don't have access to this in your current account")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Healthcare credentials" })).toHaveCount(0)
  expect(reads).toBe(2)
  await page.getByRole("tab", { name: "Personal Account" }).click()
  await expect(page.getByRole("heading", { name: "Personal account settings" })).toBeVisible()
  await page.getByRole("tab", { name: "My Organizations" }).click()
  await expect(page.getByRole("tab", { name: "My Organizations" })).toHaveAttribute("aria-selected", "true")
})

test("pagination retries unchanged page, retains options, announces end; error listbox passes axe", async ({ page }) => {
  const requests: string[] = []
  let failed = false
  await page.route("**/api/1h/v2/public/npi/list?*", (route) => {
    const q = new URL(route.request().url()).searchParams
    requests.push(`${q.get("searchText")}:${q.get("page")}`)
    if (q.get("page") === "1" && !failed) { failed = true; return route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: q.get("page") === "0" ? Array.from({ length: 10 }, (_, i) => record(i + 1)) : [record(11)], totalElements: 11 }) })
  })
  await page.goto("/account?tab=provider")
  await expect(personal(page)).toBeVisible()
  await personal(page).focus()
  await expect(page.getByRole("option", { name: "1234567891, Ann1 Lee, Austin, TX", exact: true })).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("End")
  await expect(page.getByRole("button", { name: "Try again." })).toBeVisible()
  await expect(page.getByRole("option")).toHaveCount(10)
  for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await noOverflow(page); await axe(page) }
  await touchTarget(page.getByRole("button", { name: "Try again." }))
  await page.getByRole("button", { name: "Try again." }).click()
  await expect(page.getByRole("option", { name: "1234567901, Ann11 Lee, Austin, TX", exact: true })).toBeVisible()
  await expect(page.getByRole("option", { name: "No more results", exact: true })).toBeVisible()
  expect(requests).toEqual([":0", ":1", ":1"])
})

test("search403 replaces whole Provider; proxy403 stays a retryable search error", async ({ page }) => {
  await mockNpiSearch(page, { status: 403, body: { source: "proxy", errorCode: "NOT_ALLOWED" } })
  await page.goto("/account?tab=provider")
  await personal(page).focus()
  await expect(page.getByRole("button", { name: "Try again." })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Healthcare credentials" })).toBeVisible()
  await mockNpiSearch(page, { status: 403, body: { message: "Denied" } })
  await touchTarget(page.getByRole("button", { name: "Try again." }))
  await page.getByRole("button", { name: "Try again." }).click()
  await expect(page.getByText("You don't have access to this in your current account")).toBeVisible()
  await expect(page.getByRole("combobox")).toHaveCount(0)
})

test("two loading bars respect reduced motion; search session expiry removes ephemeral state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  let finishRead!: () => void
  const pending = new Promise<void>((resolve) => { finishRead = resolve })
  await page.route("**/api/1h/v2/user/npi", async (route) => { await pending; await route.fulfill({ status: 200, contentType: "application/json", body: "{}" }) })
  let calls = 0
  await page.route("**/api/1h/v2/public/npi/list?*", (route) => {
    calls++
    return route.fulfill({ status: calls === 1 ? 200 : 401, contentType: "application/json", body: JSON.stringify(calls === 1 ? { data: [record()], totalElements: 1 } : { errorCode: "SESSION_EXPIRED", source: "proxy" }) })
  })
  await page.goto("/account?tab=provider")
  await expect(page.getByRole("heading", { name: "Healthcare credentials" })).toBeVisible()
  const bars = page.locator('[data-variant="bars"] > *')
  await expect(bars).toHaveCount(2)
  expect(await bars.first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
  finishRead()
  await personal(page).focus()
  await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(personal(page)).toHaveValue(label)
  await personal(page).fill("expired")
  await expect(page.getByRole("alertdialog", { name: "Your session ended" })).toBeVisible()
  await expect(page.getByRole("combobox")).toHaveCount(0)
  await expect(page.getByText(label, { exact: true })).toHaveCount(0)
})


test("tab unmount discards selections and pending queries even when the old response arrives later", async ({ page }) => {
  let finishPending!: () => void
  const pending = new Promise<void>((resolve) => { finishPending = resolve })
  let markDelivered!: () => void
  const delivered = new Promise<void>((resolve) => { markDelivered = resolve })
  const queries: string[] = []
  await page.route("**/api/1h/v2/public/npi/list?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("searchText") ?? ""
    queries.push(query)
    if (query === "pending") await pending
    // The old route can already be cancelled when its synthetic upstream settles.
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ ...record(), providerFirstName: query === "pending" ? "Late" : "Ann77" }], totalElements: 1 }) }).catch(() => undefined)
    if (query === "pending") markDelivered()
  })
  await page.goto("/account?tab=provider")
  await personal(page).focus()
  await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(personal(page)).toHaveValue(label)
  const practiceLabel = "1234567967, Clinic77, 1 Main St, Austin, TX"
  await practice(page).focus()
  await expect(page.getByRole("option", { name: practiceLabel, exact: true })).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(practice(page)).toHaveValue(practiceLabel)
  await page.getByRole("tab", { name: "Personal Account" }).click()
  await expect(page.getByRole("combobox")).toHaveCount(0)
  await page.getByRole("tab", { name: "Individual Provider Registration" }).click()
  await expect(personal(page)).toHaveValue("")
  await expect(practice(page)).toHaveValue("")
  await expect(page.getByRole("option")).toHaveCount(0)
  // A separate unmount cycle also discards an in-flight practice query.
  await practice(page).fill("pending")
  await expect.poll(() => queries.includes("pending")).toBe(true)
  await page.getByRole("tab", { name: "Personal Account" }).click()
  await expect(page.getByRole("combobox")).toHaveCount(0)
  await page.getByRole("tab", { name: "Individual Provider Registration" }).click()
  await expect(personal(page)).toHaveValue("")
  await expect(practice(page)).toHaveValue("")
  finishPending()
  await delivered
  await expect(page.getByRole("option")).toHaveCount(0)
  await expect(page.getByText(/Late Lee/)).toHaveCount(0)
  await personal(page).focus()
  await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible()
  await expect(page.getByText(/Late Lee/)).toHaveCount(0)
})


test("scrolling Provider options requests one next page and appends the results", async ({ page }) => {
  const requests: string[] = []
  await page.route("**/api/1h/v2/public/npi/list?*", (route) => {
    const q = new URL(route.request().url()).searchParams
    requests.push(`${q.get("searchText")}:${q.get("page")}`)
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: q.get("page") === "0" ? Array.from({ length: 10 }, (_, i) => record(i + 1)) : [record(11)], totalElements: 11 }) })
  })
  await page.goto("/account?tab=provider")
  await personal(page).focus()
  await expect(page.getByRole("option")).toHaveCount(10)
  await page.getByRole("option").last().scrollIntoViewIfNeeded()
  await expect(page.getByRole("option", { name: "1234567901, Ann11 Lee, Austin, TX", exact: true })).toBeVisible()
  await expect(page.getByRole("option", { name: "1234567891, Ann1 Lee, Austin, TX", exact: true })).toHaveCount(1)
  await expect(page.getByRole("option", { name: "No more results", exact: true })).toHaveCount(1)
  expect(requests).toEqual([":0", ":1"])
})

test("mobile Provider information opens by tap and closes by outside tap", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch interaction is exercised by mobile-360")
  await page.goto("/account?tab=provider")
  await expect(personal(page)).toBeVisible()
  const info = page.getByRole("button", { name: "About provider registration" })
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    await info.tap()
    await expect(page.getByText(/Registering links your 1health account/)).toBeVisible()
    await noOverflow(page)
    await page.getByRole("heading", { name: "Healthcare credentials" }).tap()
    await expect(page.getByText(/Registering links your 1health account/)).toHaveCount(0)
  }
})
