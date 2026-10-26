import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"
import { ANN, mockAccountDefaults, mockMyself, mockOrganizations, mockExit, PORTAL_URL, setTheme, signIn, test } from "./fixtures"
import { organizationWire, organizationsPage } from "./fixtures/orgs"

const search = (page: Page) => page.getByRole("searchbox", { name: "Search organizations" })
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true) }
async function axe(page: Page) { expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]) }

test.beforeEach(async ({ page }) => { await signIn(page); await mockAccountDefaults(page); await page.route("**/api/pp/org-logo/*", (route) => route.fulfill({ status: 404, body: "{}" })) })

test("lazy list, server search, pagination and keyboard focus", async ({ page }) => {
  const requests: string[] = []
  await page.route("**/api/1h/v2/user/organization/portal?**", (route) => {
    const q = new URL(route.request().url()).searchParams
    requests.push(`${q.get("name")}:${q.get("page")}`)
    const number = Number(q.get("page"))
    const name = q.get("name") ?? ""
    return route.fulfill({ json: name ? organizationsPage([]) : organizationsPage([organizationWire({ organization: { name: number ? "Beta" : "Alpha", type: [], personContacts: [] } })], { pageNumber: number, totalElements: 24, totalPages: 2 }) })
  })
  await page.goto("/account?tab=personal")
  await expect(page.getByRole("heading", { name: "Personal account settings" })).toBeVisible()
  expect(requests).toEqual([])
  await page.getByRole("tab", { name: "My Organizations" }).click()
  await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Next", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: "Beta", exact: true })).toBeFocused()
  await search(page).fill("  unknown  ")
  await expect(page.getByText("Sorry, no results were found", { exact: true })).toBeVisible()
  await expect(search(page)).toBeFocused()
  await expect(search(page)).toHaveValue("  unknown  ")
  expect(requests).toEqual([":0", ":1", "unknown:0"])
  await expect(page.getByRole("navigation", { name: "Organization pages" })).toHaveCount(0)
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    await expect(page.getByText("Sorry, no results were found", { exact: true })).toBeVisible()
    await expect(search(page)).toBeFocused()
    await noOverflow(page)
    await axe(page)
    await expect(search(page)).toBeFocused()
  }
  await search(page).fill("")
  await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible()
  await expect(search(page)).toBeFocused()
  await expect(page.getByRole("navigation", { name: "Organization pages" })).toBeVisible()
  for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await noOverflow(page); await axe(page) }
})

for (const internal of [false, true]) {
  test(`initial empty registration ${internal ? "internal" : "external"} in both themes`, async ({ page }) => {
    await mockMyself(page, { body: { ...ANN, email: internal ? "ann@1health.io" : "ann@example.com" } })
    await mockOrganizations(page, { body: organizationsPage([]) })
    await page.goto("/account?tab=organizations")
    await expect(page.getByRole("heading", { name: "You aren't managing any organizations yet" })).toBeVisible()
    await expect(search(page)).toHaveCount(0)
    const registration = internal ? page.getByRole("button", { name: "Register organization", exact: true }) : page.getByRole("link", { name: "Register organization (opens in a new tab)" })
    await expect(registration).toBeVisible()
    if (!internal) { await expect(registration).toHaveAttribute("target", "_blank"); await expect(registration).toHaveAttribute("rel", "noopener noreferrer") }
    const box = await registration.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)
    for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await noOverflow(page); await axe(page) }
  })
}

test("result grid, internal creation and single-page pager are accessible in both themes", async ({ page }) => {
  await mockMyself(page, { body: { ...ANN, email: "ann@tachin.ai" } })
  await mockOrganizations(page, { body: organizationsPage([organizationWire()]) })
  await page.goto("/account?tab=organizations")
  await expect(page.getByRole("article")).toHaveCount(1)
  await search(page).focus()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "Create new organization" })).toBeFocused()
  for (const name of ["Previous", "1", "Next"]) {
    const button = page.getByRole("button", { name, exact: true })
    const box = await button.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44)
  }
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveAttribute("aria-disabled", "true")
  for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await noOverflow(page); await axe(page) }
})

for (const failure of ["upstream403", "proxy403", "network", "500"] as const) {
  test(`${failure} read state and retry`, async ({ page }) => {
    let calls = 0
    await page.route("**/api/1h/v2/user/organization/portal?**", (route) => {
      calls++
      if (calls > 1) return route.fulfill({ json: organizationsPage([organizationWire()]) })
      if (failure === "network") return route.abort()
      return route.fulfill({ status: failure === "500" ? 500 : 403, json: failure === "proxy403" ? { source: "proxy", errorCode: "NOT_ALLOWED" } : { message: "Denied" } })
    })
    await page.goto("/account?tab=organizations")
    if (failure === "upstream403") {
      await expect(page.getByText("You don't have access to this in your current account")).toBeVisible()
      await expect(search(page)).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0)
    } else {
      // Scoped to the tab: Next's empty route announcer is also role="alert" once hydrated.
      await expect(page.getByRole("tabpanel").getByRole("alert")).toBeVisible()
      for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await noOverflow(page); await axe(page) }
      await page.getByRole("button", { name: "Retry", exact: true }).click()
      await expect(page.getByRole("article")).toHaveCount(1)
      expect(calls).toBe(2)
    }
    for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await noOverflow(page); await axe(page) }
  })
}

test("real organization cards follow all four grid breakpoints without horizontal overflow", async ({ page }) => {
  await mockOrganizations(page, { body: organizationsPage(Array.from({ length: 12 }, (_, index) => organizationWire({
    tenantId: index + 1,
    organization: { name: `Clinic ${String(index + 1).padStart(2, "0")}`, type: ["Lab"], personContacts: [] },
  }))) })
  await page.goto("/account?tab=organizations")
  const cards = page.locator('[data-slot="organizations-grid"]').getByRole("article")
  await expect(cards).toHaveCount(12)
  for (const [width, columns] of [[1280, 4], [1024, 3], [640, 2], [360, 1]]) {
    await page.setViewportSize({ width, height: 740 })
    await expect(async () => {
      const boxes = await cards.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width }
      }))
      const firstRow = boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 1)
      expect(firstRow).toHaveLength(columns)
      if (columns > 1) expect(Math.round(firstRow[1].x - firstRow[0].x - firstRow[0].width)).toBe(16)
    }).toPass()
    await noOverflow(page)
  }
})


for (const empty of [false, true]) {
  test(`internal ${empty ? "Register" : "Create"} opens the actual same-tab creation handoff and preserves unrelated draft`, async ({ page, context }) => {
    await mockMyself(page, { body: { ...ANN, email: "ann@1health.io" } })
    await mockOrganizations(page, { body: organizationsPage(empty ? [] : [organizationWire()]) })
    const logouts = await mockExit(page)
    const forbidden: string[] = []
    page.on("request", (request) => {
      if (/logout|switch[-_/]?tenant/i.test(request.url())) forbidden.push(request.url())
    })
    await page.goto("/account?tab=organizations")
    const action = page.getByRole("button", { name: empty ? "Register organization" : "Create new organization", exact: true })
    await expect(action).toBeVisible()
    const draftKey = "pp:draft:v1:demo:42:phone"
    const draft = await page.evaluate((key) => {
      const value = JSON.stringify({ savedAt: Date.now(), baseHash: "retained", values: { phoneNumber: "4155552125" } })
      localStorage.setItem(key, value)
      return value
    }, draftKey)
    const pagesBefore = context.pages().length
    const destination = new URL("/organizations/create", PORTAL_URL).href
    const handoff = page.waitForResponse((response) => new URL(response.url()).pathname === "/handoff/portal")
    await action.click()
    const response = await handoff
    const responseUrl = new URL(response.url())
    expect(responseUrl.pathname + responseUrl.search).toBe("/handoff/portal?to=create-org")
    expect(response.status()).toBe(303)
    expect(response.headers().location).toBe(destination)
    expect(response.headers()["set-cookie"]).toBeUndefined()
    await page.waitForURL(destination)
    expect(context.pages()).toHaveLength(pagesBefore)
    expect(logouts()).toBe(0)
    expect(forbidden).toEqual([])
    await page.goto("/account?tab=organizations")
    expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft)
  })
}

test("a searched page of only null organizations shows no results without a pager, as in 1health-fe (parity)", async ({ page }) => {
  await page.route("**/api/1h/v2/user/organization/portal?**", (route) => {
    const name = new URL(route.request().url()).searchParams.get("name") ?? ""
    return route.fulfill({ json: name ? organizationsPage([organizationWire({ organization: null })], { totalElements: 1, totalPages: 1 }) : organizationsPage([organizationWire()]) })
  })
  await page.goto("/account?tab=organizations")
  await expect(page.getByRole("heading", { name: "Sample Organization", exact: true })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Organization pages" })).toBeVisible()
  await search(page).fill("ghost")
  await expect(page.getByText("Sorry, no results were found", { exact: true })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Organization pages" })).toHaveCount(0)
  await expect(search(page)).toHaveValue("ghost")
})
