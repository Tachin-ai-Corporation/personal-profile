import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  ACCOUNT_SETTINGS_MYSELF,
  mockAccountDefaults,
  mockContacts,
  mockMyself,
  setTheme,
  signIn,
  test,
} from "./fixtures"

const TITLE = "Personal account settings"
const LOAD_ERROR = "Something went wrong while loading profile information"
const NO_ACCESS = "You don't have access to this in your current account"
const LABELS = [
  "First name", "Last name", "Username", "Password",
  "Primary email address", "Primary phone number", "Birth date",
  "Preferred language", "Default time zone", "Preferred locale for date, time, and currency",
]
const FILLED_VALUES = [
  "Ann", "Lee", "ann.lee", "********", "ann.lee@example.test",
  "+1 (415) 551-2125", "03/09/1987", "English", "Central", "English - United States",
]
const section = (page: Page): Locator => page.getByRole("region", { name: TITLE, exact: true })
const table = (page: Page): Locator => section(page).getByRole("table", { name: TITLE, exact: true })
const authenticator = (page: Page): Locator => page.getByRole("region", { name: "Authenticator app", exact: true })

async function valueCell(page: Page, label: string): Promise<Locator> {
  const header = table(page).getByRole("rowheader", { name: label, exact: true })
  await expect(header).toHaveAttribute("scope", "row")
  const id = await header.getAttribute("id")
  expect(id).toBeTruthy()
  return table(page).locator(`td[headers="${id}"]`)
}

async function expectFields(page: Page, values: string[]): Promise<void> {
  await expect(table(page)).toBeVisible()
  await expect(table(page).getByRole("rowheader")).toHaveText(LABELS)
  await expect(table(page).getByRole("cell")).toHaveText(values)
  for (const [index, label] of LABELS.entries()) {
    await expect(await valueCell(page, label)).toHaveText(values[index])
  }
}

async function expectNoOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(await table(page).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
}

/** Hold the real read at the browser boundary; release falls through to mockMyself. */
async function holdAccountMyself(page: Page, answer: { status?: number; body?: unknown } = { body: ACCOUNT_SETTINGS_MYSELF }): Promise<() => void> {
  await mockMyself(page, answer)
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route("**/api/1h/v2/user/myself", async (route) => {
    await pending
    await route.fallback()
  })
  return release
}

test.describe("Personal account settings read view (Story 7.4)", () => {
  test.use({ timezoneId: "America/Bogota" })

  test.beforeEach(async ({ page }) => {
    await mockAccountDefaults(page)
    await signIn(page)
    // Fix Date only: timers, SWR and the shell's activity clock keep running.
    await page.clock.setFixedTime(new Date("2026-10-16T12:00:00-05:00"))
  })

  test("all ten labels and values have row-major th/td pairs at desktop and 360 px", async ({ page, isMobile }) => {
    const reads = await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
    await page.goto("/account?tab=personal")
    await expectFields(page, FILLED_VALUES)
    const rows = table(page).getByRole("row")
    await expect(rows).toHaveCount(isMobile ? 10 : 5)
    for (const row of await rows.all()) {
      expect(await row.locator(":scope > *").evaluateAll((cells) => cells.map((cell) => cell.tagName)))
        .toEqual(isMobile ? ["TH", "TD"] : ["TH", "TD", "TH", "TD"])
    }
    const password = (await valueCell(page, "Password")).locator(".mono-value")
    await expect(password).toHaveText("********")
    await expect(password).toHaveCSS("font-family", /mono/i)
    await expect(page.getByText(ACCOUNT_SETTINGS_MYSELF.password, { exact: true })).toHaveCount(0)
    await expect(section(page).getByRole("button", { name: "Edit", exact: true })).toBeVisible()
    expect(reads()).toBe(1)
    await expectNoOverflow(page)
  })

  for (const [name, body] of [
    ["missing", { id: 42 }],
    ["empty", { id: 42, firstName: "", lastName: " ", username: "", email: "", phoneNumber: "", birthDate: "", preferredLanguage: "", timeZone: "", locale: "" }],
    ["PM3 placeholders", { id: 42, firstName: null, lastName: " n/a ", username: "-1", email: "N/A", phoneNumber: -1, birthDate: "n/a", preferredLanguage: "n/a", timeZone: "-1", locale: null }],
  ] as const) {
    test(`${name}: missing fields are Not provided; password and default locale remain`, async ({ page }) => {
      await mockMyself(page, { body })
      await page.goto("/account?tab=personal")
      await expectFields(page, [
        "Not provided", "Not provided", "Not provided", "********", "Not provided",
        "Not provided", "Not provided", "Not provided", "Not provided", "English - United States",
      ])
      await expectNoOverflow(page)
    })
  }

  test("unknown regional codes are trimmed and preserved in their respective cells", async ({ page }) => {
    await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, preferredLanguage: " x-klingon ", timeZone: " Europe/Paris ", locale: " fr-FR " } })
    await page.goto("/account?tab=personal")
    await expectFields(page, [...FILLED_VALUES.slice(0, 7), "x-klingon", "Europe/Paris", "fr-FR"])
    await expectNoOverflow(page)
  })

  test("a stored language 1health-fe knows shows its label in any letter case (parity)", async ({ page }) => {
    await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, preferredLanguage: " FR-ca " } })
    await page.goto("/account?tab=personal")
    await expectFields(page, [...FILLED_VALUES.slice(0, 7), "French - Canada", ...FILLED_VALUES.slice(8)])
  })

  test("long stored values wrap inside their cells at 360 px and the desktop breakpoint", async ({ page }) => {
    const username = "account".repeat(12)
    const email = `${"longemail".repeat(10)}@example.test`
    const language = "language".repeat(12)
    const zone = `Region/${"Unlisted".repeat(12)}`
    const locale = "locale".repeat(14)
    await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, username, email, preferredLanguage: language, timeZone: zone, locale } })
    await page.goto("/account?tab=personal")
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      for (const [label, value] of [["Username", username], ["Primary email address", email], ["Preferred language", language], ["Default time zone", zone], [LABELS[9], locale]]) {
        const cell = await valueCell(page, label)
        await expect(cell).toHaveText(value)
        await expect.poll(() => cell.evaluate((element) => {
          const cellBounds = element.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(element)
          return [...range.getClientRects()].every((line) => line.left >= cellBounds.left - 1 && line.right <= cellBounds.right + 1 && line.top >= cellBounds.top - 1 && line.bottom <= cellBounds.bottom + 1)
        })).toBe(true)
      }
      await expectNoOverflow(page)
    }
  })

  for (const { label, roles, birthDate, display } of [
    { label: "18th birthday today", roles: ["Patient"], birthDate: "2008-10-16", display: "10/16/2008" },
    { label: "one day short of 18", roles: ["Patient"], birthDate: "2008-10-17", display: "Not provided" },
    { label: "Proctor at 18", roles: ["Proctor"], birthDate: "2008-10-16", display: "Not provided" },
    { label: "Proctor 21st birthday today", roles: ["Patient", "Proctor"], birthDate: "2005-10-16", display: "10/16/2005" },
    { label: "Proctor one day short of 21", roles: ["Proctor"], birthDate: "2005-10-17", display: "Not provided" },
    { label: "120-year boundary", roles: ["Patient"], birthDate: "1906-10-16", display: "10/16/1906" },
    { label: "older than upper boundary", roles: ["Proctor"], birthDate: "1906-10-15", display: "Not provided" },
    { label: "impossible date", roles: ["Patient"], birthDate: "1990-02-30", display: "Not provided" },
    { label: "future date", roles: ["Patient"], birthDate: "2026-10-17", display: "Not provided" },
  ]) {
    test(`birth date: ${label} on fixed local 2026-10-16`, async ({ page }) => {
      await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, roles, birthDate } })
      await page.goto("/account?tab=personal")
      await expect(await valueCell(page, "Birth date")).toHaveText(display)
    })
  }

  test("loaded table passes axe in light and dark without horizontal overflow", async ({ page }) => {
    await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
    await page.goto("/account?tab=personal")
    await expectFields(page, FILLED_VALUES)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      const results = await new AxeBuilder({ page }).include("#account").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
      expect(results.violations, `${theme} account settings`).toEqual([])
      await expectNoOverflow(page)
    }
  })

  test("mobile real page observes no Mobile cache by issuing zero contact reads", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile disables the desktop header's contact subscribers")
    const contacts = await mockContacts(page)
    await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
    await page.goto("/account?tab=personal")
    await expectFields(page, FILLED_VALUES)
    // Exercise another render and focus/reconnect triggers without a header subscriber.
    await page.getByRole("tab", { name: "Individual Provider Registration", exact: true }).click()
    await page.getByRole("tab", { name: "Personal Account", exact: true }).click()
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"))
      window.dispatchEvent(new Event("online"))
    })
    await expectFields(page, FILLED_VALUES)
    await page.waitForLoadState("networkidle")
    expect(contacts).toEqual([])
  })

  test("desktop cached Primary Mobile region updates the phone through the observer", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop header owns the cache-populating read")
    const contacts = await mockContacts(page, {
      Mobile: [{ id: 71, value: "02079460018", label: "Primary", phoneNumberRegion: "gb", type: "Mobile" }],
    })
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    await page.route("**/api/1h/v2/user/contact-point/list?**", async (route) => {
      if (new URL(route.request().url()).searchParams.get("type") === "Mobile") await pending
      await route.fallback()
    })
    await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, phoneNumber: "02079460018" } })
    try {
      await page.goto("/account?tab=personal")
      await expect(await valueCell(page, "Primary phone number")).toHaveText("02079460018")
      release()
      await expect(await valueCell(page, "Primary phone number")).toHaveText("+44 20 7946 0018")
      expect(contacts.filter((type) => type === "Mobile")).toHaveLength(1)
    } finally {
      release()
    }
  })

  test("mounting on mobile preserves the desktop header's later contact refresh", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 })
    const reads: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.pathname.endsWith("/contact-point/list") && url.searchParams.get("type") === "Mobile") reads.push(url.href)
    })
    await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, phoneNumber: "02079460018" } })
    await mockContacts(page, { Mobile: [{ id: 71, value: "02079460018", label: "Primary", phoneNumberRegion: "us", type: "Mobile" }] })
    await page.goto("/account?tab=personal")
    await expect(await valueCell(page, "Primary phone number")).toHaveText("02079460018")
    expect(reads).toHaveLength(0)
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(() => reads.length).toBe(1)
    await page.waitForLoadState("networkidle")
    await mockContacts(page, { Mobile: [{ id: 71, value: "02079460018", label: "Primary", phoneNumberRegion: "gb", type: "Mobile" }] })
    // Poll the real reconnect event until SWR's in-flight dedupe window ends.
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("online")))
      return reads.length
    }).toBe(2)
    await expect(await valueCell(page, "Primary phone number")).toHaveText("+44 20 7946 0018")
  })

  test("#account exists during loading and is re-scrolled when its real table becomes ready", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    // Observe the native scroll calls while preserving their actual behavior.
    // This proves the ready callback re-follows the anchor even when layout
    // happens to leave the heading at the same position after loading.
    await page.addInitScript(() => {
      const scrollIntoView = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function (options) {
        if (this.id === "account") {
          const state = this.querySelector('[data-slot="state-frame"]')?.getAttribute("data-state")
          document.documentElement.dataset.accountAnchorStates = `${document.documentElement.dataset.accountAnchorStates ?? ""},${state}`
        }
        return scrollIntoView.call(this, options)
      }
    })
    const release = await holdAccountMyself(page)
    try {
      await page.goto("/account?tab=personal#account")
      const heading = section(page).getByRole("heading", { level: 2, name: TITLE, exact: true })
      await expect(heading).toHaveAttribute("tabindex", "-1")
      await expect(heading).toBeFocused()
      const frame = section(page).locator('[data-slot="state-frame"]')
      await expect(frame).toHaveAttribute("aria-busy", "true")
      const skeleton = frame.locator('[data-slot="frame-skeleton"][data-variant="kv"]')
      await expect(skeleton).toHaveAttribute("aria-hidden", "true")
      await expect(skeleton.locator('[data-slot="frame-skeleton-row"]')).toHaveCount(4)
      await expect(table(page)).toHaveCount(0)
      await expect(authenticator(page)).toBeVisible()
      await expect(page.locator("html")).toHaveAttribute("data-account-anchor-states", /,loading/)
      release()
      await expectFields(page, FILLED_VALUES)
      await expect(frame).toHaveAttribute("data-state", "ready")
      await expect(frame).not.toHaveAttribute("aria-busy", "true")
      await expect(page.locator("html")).toHaveAttribute("data-account-anchor-states", /,loading.*?,ready/)
      await expect(heading).toBeFocused()
      await expect(heading).toBeInViewport()
      await expect(page).toHaveURL(/\/account\?tab=personal#account$/)
    } finally {
      release()
    }
  })

  test("controlled local response renders a complete ready table within 1500 ms", async ({ page }) => {
    const release = await holdAccountMyself(page)
    try {
      await page.goto("/account?tab=personal")
      await expect(section(page).locator('[data-slot="state-frame"]')).toHaveAttribute("data-state", "loading")
      // Warmed page, held synthetic read. Start at the response signal, not
      // navigation; demo broadband PNFR timing remains an environment check.
      let respondedAt = 0
      const response = page.waitForResponse((reply) => {
        if (!reply.url().endsWith("/api/1h/v2/user/myself")) return false
        respondedAt = performance.now()
        return true
      })
      release()
      expect((await response).status()).toBe(200)
      await page.waitForFunction(() => {
        const frame = document.querySelector('#account [data-slot="state-frame"][data-state="ready"]')
        return frame?.querySelectorAll("td").length === 10
      }, undefined, { timeout: 1500, polling: "raf" })
      expect(performance.now() - respondedAt, "local response → ready table (ms)").toBeLessThan(1500)
      await expectFields(page, FILLED_VALUES)
    } finally {
      release()
    }
  })

  test("a held Account read cannot displace the later #authenticator target when its table grows", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    const release = await holdAccountMyself(page)
    try {
      await page.goto("/account?tab=personal#authenticator")
      const heading = authenticator(page).getByRole("heading", { name: "Authenticator app", exact: true })
      await expect(section(page).locator('[data-slot="state-frame"]')).toHaveAttribute("data-state", "loading")
      await expect(heading).toBeFocused()
      await expect(heading).toBeInViewport()
      release()
      await expectFields(page, FILLED_VALUES)
      await expect(heading).toBeFocused()
      await expect(heading).toBeInViewport()
      await expect(page).toHaveURL(/#authenticator$/)
    } finally {
      release()
    }
  })

  for (const status of [400, 403]) {
    test(`a held Account ${status} failure preserves the later #authenticator target`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" })
      await mockMyself(page, { status, body: { code: status, message: "Private diagnostic" } })
      let release!: () => void
      const pending = new Promise<void>((resolve) => { release = resolve })
      await page.route("**/api/1h/v2/user/myself", async (route) => { await pending; await route.fallback() })
      try {
        await page.goto("/account?tab=personal#authenticator")
        const heading = authenticator(page).getByRole("heading", { name: "Authenticator app", exact: true })
        await expect(section(page).locator('[data-slot="state-frame"]')).toHaveAttribute("data-state", "loading")
        await expect(heading).toBeFocused()
        release()
        await expect(section(page).getByText(status === 403 ? NO_ACCESS : LOAD_ERROR, { exact: true })).toBeVisible()
        await expect(heading).toBeFocused()
        await expect(heading).toBeInViewport()
      } finally {
        release()
      }
    })
  }

  test("expired Account self-read uses the foundation session dialog without a section load error", async ({ page }) => {
    await mockMyself(page, { status: 401, body: { errorCode: "SESSION_EXPIRED", source: "proxy" } })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/account?tab=personal#account")
    const dialog = page.getByRole("alertdialog", { name: "Your session ended" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Return to 1health" })).toBeFocused()
    await expect(page.getByText(LOAD_ERROR, { exact: true })).toHaveCount(0)
    await expect(page.locator("#account").getByRole("button", { name: "Retry", exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => sessionStorage.getItem("pp:login-intent"))).toBe("/account?tab=personal")
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
  })

  for (const { label, status, body, forbidden } of [
    { label: "self-read upstream 403", status: 403, body: { code: 403, message: "Private diagnostic" }, forbidden: true },
    { label: "proxy 403", status: 403, body: { errorCode: "NOT_ALLOWED", source: "proxy" }, forbidden: false },
    { label: "generic upstream 400", status: 400, body: { code: 400, message: "Private diagnostic" }, forbidden: false },
  ]) {
    test(`${label} stays in the section with Authenticator visible${forbidden ? "" : "; Retry recovers only myself"}`, async ({ page }) => {
      const reads = await mockMyself(page, { status, body })
      const requests: string[] = []
      page.on("request", (request) => {
        if (/\/api\/(1h|pp|places)\//.test(request.url())) requests.push(new URL(request.url()).pathname)
      })
      await page.goto("/account?tab=personal")
      await expect(section(page).getByText(forbidden ? NO_ACCESS : LOAD_ERROR, { exact: true })).toBeVisible()
      await expect(authenticator(page).getByText(forbidden ? NO_ACCESS : LOAD_ERROR, { exact: true })).toBeVisible()
      await expect(page.getByText("Private diagnostic", { exact: true })).toHaveCount(0)
      await expect(authenticator(page)).toBeVisible()
      expect(reads()).toBe(1)
      await expect(table(page)).toHaveCount(0)
      const retry = section(page).getByRole("button", { name: "Retry", exact: true })
      if (forbidden) {
        await expect(retry).toHaveCount(0)
        await expect(section(page).locator('[data-slot="state-frame"]')).toHaveAttribute("data-state", "forbidden")
      } else {
        await expect(page.getByText(NO_ACCESS, { exact: true })).toHaveCount(0)
        const recovered = await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
        // Mobile has no header reads. On desktop wait for the existing picture
        // read to settle before recording requests caused by Retry.
        await page.waitForLoadState("networkidle")
        requests.length = 0
        await retry.focus()
        await expect(retry).toBeFocused()
        await page.keyboard.press("Enter")
        await expectFields(page, FILLED_VALUES)
        await expect(section(page).getByRole("heading", { level: 2, name: TITLE, exact: true })).toBeFocused()
        await expect(page.getByText(LOAD_ERROR, { exact: true })).toHaveCount(0)
        expect(recovered()).toBe(1)
        expect(requests).toEqual(["/api/1h/v2/user/myself"])
        await expect(authenticator(page)).toBeVisible()
        await expect(authenticator(page).getByText("Not set up", { exact: true })).toBeVisible()
        await expect(authenticator(page).getByRole("button", { name: /^Link / })).toHaveCount(5)
      }
    })
  }

  for (const interaction of ["no further interaction", "another control", "outside heading then body", "nonfocusable text"] as const) {
    test(`held keyboard Retry ${interaction === "no further interaction" ? "focuses its heading with" : "does not steal focus after"} ${interaction}`, async ({ page }) => {
      await mockMyself(page, { status: 400, body: { code: 400, message: "Private diagnostic" } })
      await page.goto("/account?tab=personal")
      const retry = section(page).getByRole("button", { name: "Retry", exact: true })
      await expect(section(page).getByText(LOAD_ERROR, { exact: true })).toBeVisible()
      const release = await holdAccountMyself(page)
      try {
        await retry.focus()
        await expect(retry).toBeFocused()
        await Promise.all([
          page.waitForRequest("**/api/1h/v2/user/myself"),
          page.keyboard.press("Enter"),
        ])
        await expect(retry).toBeFocused()
        // The request is still held: leaving and later blurring to body must
        // cancel recovery focus just as surely as keeping another control focused.
        const otherTab = page.getByRole("tab", { name: "Individual Provider Registration", exact: true })
        const panel = page.getByRole("tabpanel", { name: "Personal Account", exact: true })
        if (interaction === "another control") {
          await otherTab.focus()
          await expect(otherTab).toBeFocused()
        } else if (interaction === "outside heading then body") {
          const heading = authenticator(page).getByRole("heading", { level: 2, name: "Authenticator app", exact: true })
          await heading.focus()
          await expect(heading).toBeFocused()
          await heading.evaluate((element) => element.blur())
          await expect(page.locator("body")).toBeFocused()
        } else if (interaction === "nonfocusable text") {
          // A real pointer action on a paragraph also revokes Retry's focus
          // intent. Chromium focuses the containing focusable tab panel.
          await section(page).getByText(LOAD_ERROR, { exact: true }).click()
          await expect(panel).toBeFocused()
        }
        await expect(table(page)).toHaveCount(0)
        release()
        await expectFields(page, FILLED_VALUES)
        const expectedFocus = interaction === "no further interaction"
          ? section(page).getByRole("heading", { level: 2, name: TITLE, exact: true })
          : interaction === "another control" ? otherTab : interaction === "nonfocusable text" ? panel : page.locator("body")
        await expect(expectedFocus).toBeFocused()
        await expect(page).toHaveURL(/\/account\?tab=personal$/)
      } finally {
        release()
      }
    })
  }

  test("background identity refresh after Retry recovery does not reclaim focus from body", async ({ page }) => {
    await mockMyself(page, { status: 400, body: { code: 400, message: "Private diagnostic" } })
    await page.goto("/account?tab=personal")
    const retry = section(page).getByRole("button", { name: "Retry", exact: true })
    await expect(retry).toBeVisible()
    await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
    await retry.focus()
    await page.keyboard.press("Enter")
    await expectFields(page, FILLED_VALUES)
    await expect(section(page).getByRole("heading", { level: 2, name: TITLE, exact: true })).toBeFocused()
    const heading = authenticator(page).getByRole("heading", { level: 2, name: "Authenticator app", exact: true })
    await heading.focus()
    await expect(heading).toBeFocused()
    await heading.evaluate((element) => element.blur())
    await expect(page.locator("body")).toBeFocused()
    await mockMyself(page, { body: { ...ACCOUNT_SETTINGS_MYSELF, firstName: "Beth" } })
    // Reconnect revalidates the real shared identity cache once SWR's
    // in-flight dedupe window ends; no owned hook or cache is mocked.
    const firstName = await valueCell(page, "First name")
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("online")))
      return firstName.textContent()
    }).toBe("Beth")
    await expect(page.locator("body")).toBeFocused()
  })

  test("held keyboard Retry ending in session expiry leaves focus in the session dialog", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await mockMyself(page, { status: 400, body: { code: 400, message: "Private diagnostic" } })
    await page.goto("/account?tab=personal")
    const retry = section(page).getByRole("button", { name: "Retry", exact: true })
    await expect(retry).toBeVisible()
    const release = await holdAccountMyself(page, { status: 401, body: { errorCode: "SESSION_EXPIRED", source: "proxy" } })
    try {
      await retry.focus()
      await expect(retry).toBeFocused()
      await Promise.all([
        page.waitForRequest("**/api/1h/v2/user/myself"),
        page.keyboard.press("Enter"),
      ])
      release()
      const dialog = page.getByRole("alertdialog", { name: "Your session ended" })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole("button", { name: "Return to 1health" })).toBeFocused()
      await expect(section(page).getByText(LOAD_ERROR, { exact: true })).toHaveCount(0)
      await expect(retry).toHaveCount(0)
      await expect(table(page)).toHaveCount(0)
      await page.keyboard.press("Escape")
      await expect(dialog.getByRole("button", { name: "Return to 1health" })).toBeFocused()
    } finally {
      release()
    }
  })
})
