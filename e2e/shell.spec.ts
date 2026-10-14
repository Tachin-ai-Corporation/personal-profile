import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { sealedSessionCookie } from "./session-cookie"
import { mockContacts, mockExit, mockMyself, PORTAL_URL, setTheme, signIn } from "./fixtures"

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const FIXTURE = "/test-fixtures/leave-guard"
const TABS = ["contacts", "insurance", "medical"] as const

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** Describes the focused element as "role:name". */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return "body"
    const role = el.getAttribute("role") ?? el.tagName.toLowerCase()
    return `${role}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim()}`
  })

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("/ page frame (Stories 1.8, 1.9)", () => {
  test("app bar, header, tabs; ?tab normalized; tab order page nav → Return → tabs; wordmark never focused", async ({ page }) => {
    await mockMyself(page)
    await mockContacts(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await expect(page).toHaveURL(/\/\?tab=contacts$/)
    await expect(page.getByRole("link", { name: "Personal Profile" })).toHaveAttribute("aria-current", "page")

    const order: string[] = []
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab")
      order.push(await focused(page))
    }
    expect(order.slice(0, 4)).toEqual(["a:Personal Profile", "a:Account", "a:Return to 1health", "tab:Contacts"])
    expect(order[4]).toMatch(/^tabpanel:/)
    expect(order.some((entry) => entry.endsWith(":1health"))).toBe(false)
  })

  for (const tab of TABS) {
    test(`?tab=${tab}: axe clean in light and dark, no horizontal scroll, 44 px targets`, async ({ page }) => {
      await mockMyself(page)
      await mockContacts(page, { Email: [{ id: 1, value: "ann@example.com", label: "Primary" }] })
      await page.goto(`/?tab=${tab}`)
      await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
      await expect(page.getByRole("tab", { selected: true })).toContainText(tab === "medical" ? "Medical" : tab === "contacts" ? "Contacts" : "Insurance")
      await expectNoHorizontalScroll(page)
      const targets = [
        page.getByRole("link", { name: "Personal Profile" }),
        page.getByRole("link", { name: "Account" }),
        page.getByRole("link", { name: "Return to 1health" }),
        ...(await page.getByRole("tab").all()),
      ]
      for (const target of targets) {
        const box = await target.boundingBox()
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      }
      await expectNoAxeViolations(page, `/?tab=${tab}`)
    })
  }

  test("tabs: arrows, Home/End move focus; Enter activates by replace; bogus tab normalized; refresh keeps the tab", async ({ page }) => {
    await mockMyself(page)
    await mockContacts(page)
    await page.goto("/?tab=bogus")
    await expect(page).toHaveURL(/\/\?tab=contacts$/)
    const historyLength = await page.evaluate(() => history.length)
    await page.getByRole("tab", { name: "Contacts" }).focus()
    await page.keyboard.press("ArrowLeft")
    await expect(page.getByRole("tab", { name: /^Medical/ })).toBeFocused()
    await page.keyboard.press("Home")
    await expect(page.getByRole("tab", { name: "Contacts" })).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("tab", { name: "Insurance" })).toBeFocused()
    await expect(page.getByRole("tab", { name: "Contacts" })).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/\?tab=insurance$/)
    await expect(page.getByRole("tab", { name: "Insurance" })).toHaveAttribute("aria-selected", "true")
    expect(await page.evaluate(() => history.length)).toBe(historyLength)
    await page.keyboard.press("End")
    await expect(page.getByRole("tab", { name: /^Medical/ })).toBeFocused()
    await page.keyboard.press("Space")
    await expect(page.getByText("Coming soon: medications, allergies and conditions will appear here")).toBeVisible()
    await page.reload()
    await expect(page.getByRole("tab", { name: /^Medical/ })).toHaveAttribute("aria-selected", "true")
  })

  test("header: primary phone and email at 768 px and above; none fetched below; a failed type is omitted", async ({ page, isMobile }) => {
    await mockMyself(page)
    const seen = await mockContacts(page, {
      Mobile: { status: 502, body: { errorCode: "UPSTREAM_ERROR", source: "proxy" } },
      Landline: [{ id: 2, value: "+12125550100", label: "Primary" }],
      Email: [{ id: 3, value: "ann@example.com", label: "Primary" }],
    })
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await expect(page.getByText("AL", { exact: true })).toBeVisible()
    if (isMobile) {
      await page.waitForLoadState("networkidle")
      expect(seen).toEqual([])
      await expect(page.getByText("ann@example.com")).toHaveCount(0)
    } else {
      await expect(page.getByText("ann@example.com")).toBeVisible()
      await expect(page.getByText("+12125550100")).toBeVisible()
      expect(seen.toSorted()).toEqual(["Email", "Landline", "Mobile"])
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0)
    }
  })

  test("page switch (clean): Account → router.push to /account, myself not refetched", async ({ page }) => {
    const myselfCalls = await mockMyself(page)
    await mockContacts(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await page.getByRole("link", { name: "Account" }).click()
    await expect(page).toHaveURL(/\/account$/)
    // A client navigation: the document was not reloaded (no second myself request).
    expect(myselfCalls()).toBe(1)
  })

  test("Return to 1health: logout, then the portal in the same tab", async ({ page }) => {
    await mockMyself(page)
    await mockContacts(page)
    const logouts = await mockExit(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await page.getByRole("link", { name: "Return to 1health" }).click()
    await page.waitForURL((url) => url.origin === new URL(PORTAL_URL).origin)
    expect(logouts()).toBe(1)
  })
})

test.describe("session expired (Story 1.7)", () => {
  test("a proxy 401 opens the dialog with focus on Return; intent saved; Escape does nothing; Return goes to the portal without logout", async ({ page }) => {
    await mockMyself(page, { status: 401, body: { errorCode: "SESSION_EXPIRED", source: "proxy" } })
    await mockContacts(page)
    const logouts = await mockExit(page)
    await page.goto("/?tab=insurance")
    const dialog = page.getByRole("alertdialog", { name: "Your session ended" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Return to 1health" })).toBeFocused()
    await expect(page.getByText("Something went wrong while loading profile information")).toHaveCount(0)
    expect(await page.evaluate(() => sessionStorage.getItem("pp:login-intent"))).toBe("/?tab=insurance")
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    await expectNoAxeViolations(page, "session dialog")
    await dialog.getByRole("button", { name: "Return to 1health" }).click()
    await page.waitForURL((url) => url.origin === new URL(PORTAL_URL).origin)
    expect(logouts()).toBe(0)
  })

  for (const [saved, landing] of [
    ["/?tab=insurance", /\/\?tab=insurance$/],
    ["/account?tab=provider", /\/\?tab=contacts$/],
  ] as const) {
    test(`a relaunch with the saved intent ${saved} lands on ${landing}`, async ({ page }) => {
      await mockMyself(page)
      await mockContacts(page)
      await page.route("**/api/token", async (route) => {
        const cookie = await sealedSessionCookie()
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "Set-Cookie": `${cookie.name}=${cookie.value}; Path=/; HttpOnly; Secure; SameSite=Lax` },
          body: JSON.stringify({ ok: true, environment: "demo" }),
        })
      })
      await page.goto("/auth")
      await page.evaluate((intent) => sessionStorage.setItem("pp:login-intent", intent), saved)
      await page.goto("/auth?lpl=abc")
      await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible({ timeout: 10_000 })
      await expect(page).toHaveURL(landing)
    })
  }
})

test.describe("leave guard (Story 1.13, fixture page)", () => {
  async function openDirty(page: Page) {
    await mockMyself(page)
    await mockContacts(page)
    await page.goto(FIXTURE)
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await page.getByLabel("Fixture phone").fill("415")
  }

  test("a dirty page switch asks; Keep editing (initial focus) stays; axe clean; Discard navigates", async ({ page }) => {
    await openDirty(page)
    await page.getByRole("link", { name: "Account" }).click()
    const dialog = page.getByRole("alertdialog", { name: "You have unsaved changes" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused()
    await expect(dialog.getByRole("button")).toHaveText(["Keep editing", "Discard", "Save"])
    await expectNoAxeViolations(page, "leave guard")
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`${FIXTURE}`))
    await expect(page.getByLabel("Fixture phone")).toHaveValue("415")
    await page.getByRole("link", { name: "Account" }).click()
    await page.getByRole("button", { name: "Discard" }).click()
    await expect(page).toHaveURL(/\/account$/)
  })

  test("a dirty tab switch: Save saves, then the tab changes", async ({ page }) => {
    await openDirty(page)
    await page.getByRole("tab", { name: "Insurance" }).click()
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page).toHaveURL(/\?tab=insurance$/)
    await expect(page.getByText("saved", { exact: true })).toBeVisible()
  })

  test("a dirty guard-only participant that can't save: no Save button", async ({ page }) => {
    await mockMyself(page)
    await mockContacts(page)
    await page.goto(FIXTURE)
    await page.getByLabel("Fixture insurance").fill("x")
    await page.getByRole("tab", { name: "Insurance" }).click()
    const dialog = page.getByRole("alertdialog", { name: "You have unsaved changes" })
    await expect(dialog.getByRole("button")).toHaveText(["Keep editing", "Discard"])
  })

  test("Return to 1health while dirty: guard → Discard → logout → portal", async ({ page }) => {
    const logouts = await mockExit(page)
    await openDirty(page)
    await page.getByRole("link", { name: "Return to 1health" }).click()
    await page.getByRole("button", { name: "Discard" }).click()
    await page.waitForURL((url) => url.origin === new URL(PORTAL_URL).origin)
    expect(logouts()).toBe(1)
  })

  test("beforeunload fires only while something is dirty", async ({ page }) => {
    await mockMyself(page)
    await mockContacts(page)
    await page.goto(FIXTURE)
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    const dialogs: string[] = []
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.type())
      void dialog.dismiss()
    })
    // A user gesture is required before Chrome shows a beforeunload prompt.
    await page.getByLabel("Fixture phone").click()
    // With a prompt the page would stay open (dismissed) and this would time out.
    await Promise.all([page.waitForEvent("close"), page.close({ runBeforeUnload: true })])
    expect(dialogs).toEqual([])
  })

  test("beforeunload fires on close while dirty", async ({ page }) => {
    await openDirty(page)
    const prompted = new Promise<string>((resolve) => page.once("dialog", (dialog) => {
      resolve(dialog.type())
      void dialog.accept()
    }))
    await page.close({ runBeforeUnload: true })
    expect(await prompted).toBe("beforeunload")
  })
})
