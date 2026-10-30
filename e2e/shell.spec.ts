import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"
import { sealedSessionCookie } from "./session-cookie"
import { ANN, HEADER_TAB_STOPS, mockContacts, mockExit, mockMyself, mockProfileDefaults, PORTAL_URL, setTheme, signIn, test } from "./fixtures"

/**
 * The shell on `/` (foundation-owned). Every test runs under the fail-fast
 * `test` and starts from `mockProfileDefaults` (spec F7-1), so a read Team A
 * adds to `/` is answered by its default here without editing this file.
 */

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
  test("app bar, header, tabs; ?tab normalized; tab order page nav → Return → tabs → Section menu; wordmark never focused", async ({ page, isMobile }) => {
    await mockProfileDefaults(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await expect(page).toHaveURL(/\/\?tab=contacts$/)
    await expect(page.getByRole("link", { name: "Personal Profile" })).toHaveAttribute("aria-current", "page")

    // The header's own stops (the avatar button, Story 1.10) come from Team A's HEADER_TAB_STOPS.
    const head = ["a:Personal Profile", "a:Account", "a:Return to 1health", ...HEADER_TAB_STOPS.profile, "tab:Contacts"]
    const order: string[] = []
    for (let i = 0; i <= head.length; i++) {
      await page.keyboard.press("Tab")
      order.push(await focused(page))
    }
    expect(order.slice(0, head.length)).toEqual(head)
    // Contacts takes its panel out of the Tab order: its Section menu (or Jump to) follows the tab (F3-3). A page that
    // opts into the design refresh's menu accent (PROPOSAL) shows Section icons instead of 01–05; Jump to keeps them.
    const accented = (await page.locator('[data-slot="section-nav-icon"]').count()) > 0
    expect(order[head.length]).toBe(isMobile ? "combobox:01Personal information" : accented ? "a:Personal information" : "a:01Personal information")
    expect(order.some((entry) => entry.endsWith(":1health"))).toBe(false)
  })

  for (const tab of TABS) {
    test(`?tab=${tab}: axe clean in light and dark, no horizontal scroll, 44 px targets`, async ({ page }) => {
      await mockProfileDefaults(page)
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
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
      }
      await expectNoAxeViolations(page, `/?tab=${tab}`)
    })
  }

  test("360 px: 16 px gutters on the app bar, header, tabs, Sections and Jump to; 44 × 44 Jump to", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the 360 px layout runs on the mobile-360 project")
    await mockProfileDefaults(page)
    await page.goto("/?tab=contacts")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    const jumpTo = page.getByRole("combobox", { name: "Jump to" })
    const jumpBox = await jumpTo.boundingBox()
    expect(jumpBox?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(jumpBox?.width ?? 0).toBeGreaterThanOrEqual(44)
    const avatar = await page.getByText("AL", { exact: true }).boundingBox()
    const gutters = await page.evaluate(() => {
      const pad = (el: Element | null | undefined) => (el ? `${getComputedStyle(el).paddingLeft} ${getComputedStyle(el).paddingRight}` : "missing")
      return {
        appBar: pad(document.querySelector("body header")?.firstElementChild),
        tabs: pad(document.querySelector('[role="tablist"]')),
        sections: pad(document.getElementById("personal")?.parentElement),
        jumpTo: pad(document.querySelector('[role="combobox"][aria-labelledby]')?.parentElement),
      }
    })
    expect(gutters).toEqual({ appBar: "16px 16px", tabs: "16px 16px", sections: "16px 16px", jumpTo: "16px 16px" })
    // The header's avatar starts at the 16 px gutter (inside its padded row, whatever the border).
    expect(Math.round(avatar?.x ?? 0)).toBe(16)
  })

  test("tabs: arrows, Home/End move focus; Enter activates by replace; bogus tab normalized; refresh keeps the tab", async ({ page }) => {
    await mockProfileDefaults(page)
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

  test("a repeated ?tab= opens Contacts and is normalized to one value by replace (F6-1, Story 7.1 rule)", async ({ page }) => {
    await mockProfileDefaults(page)
    await page.goto("/?tab=insurance&tab=medical#email")
    await expect(page).toHaveURL(/\/\?tab=contacts#email$/)
    await expect(page.getByRole("tab", { name: "Contacts" })).toHaveAttribute("aria-selected", "true")
    // The composed feature stubs keep the five Section landmarks and the #signature row.
    await expect(page.locator("main section")).toHaveCount(5)
    await expect(page.locator("#signature")).toHaveCount(1)
  })

  test("header: primary phone and email at 768 px and above; none fetched below; a failed type is omitted", async ({ page, isMobile }) => {
    await mockProfileDefaults(page)
    const seen = await mockContacts(page, {
      Mobile: { status: 502, body: { errorCode: "UPSTREAM_ERROR", source: "proxy" } },
      Landline: [{ id: 2, value: "+12125550100", label: "Primary" }],
      Email: [{ id: 3, value: "ann@example.com", label: "Primary" }],
    })
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await expect(page.getByText("AL", { exact: true })).toBeVisible()
    // The profile header: the block holding the page's h1 (the Sections below use h2). Scoped so the
    // Contact Sections (Epic 3), which read the same per-type keys and show their own errors, don't count.
    const header = page.locator("div:has(> h1)")
    await expect(header).toHaveCount(1)
    if (isMobile) {
      await page.waitForLoadState("networkidle")
      await expect(header.getByText("ann@example.com")).toHaveCount(0)
    } else {
      await expect(header.getByText("ann@example.com")).toBeVisible()
      // Shown through the shared formatter (spec F1), with the row's region (default us).
      await expect(header.getByText("+1 (212) 555-0100")).toBeVisible()
      // As a set: the header and the Contact Sections share the keys, so a type may be requested twice outside SWR's dedupe
      // window; Social Media is the Social media Section's own read (Story 3.7).
      expect([...new Set(seen)].toSorted()).toEqual(["Email", "Landline", "Mobile", "Social Media"])
      // The failed type is omitted from the header, with no error there.
      await expect(header.getByRole("alert")).toHaveCount(0)
    }
  })

  test("page switch (clean): Account → router.push to /account, myself not refetched", async ({ page }) => {
    await mockProfileDefaults(page)
    const myselfCalls = await mockMyself(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await page.getByRole("link", { name: "Account" }).click()
    await expect(page).toHaveURL(/\/account\?tab=personal$/)
    // A client navigation: the document was not reloaded (no second myself request).
    expect(myselfCalls()).toBe(1)
  })

  test("Return to 1health: logout, then the portal in the same tab", async ({ page }) => {
    await mockProfileDefaults(page)
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
    await mockProfileDefaults(page)
    await mockMyself(page, { status: 401, body: { errorCode: "SESSION_EXPIRED", source: "proxy" } })
    const logouts = await mockExit(page)
    // Reduced motion from the start: the dialog opens without its fade/zoom, so axe never measures mid-animation.
    await page.emulateMedia({ reducedMotion: "reduce" })
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
      await mockProfileDefaults(page)
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

test.describe("Section navigation (F3-3, port of Story 1.8B)", () => {
  async function open(page: Page, url: string): Promise<void> {
    await mockProfileDefaults(page)
    await page.goto(url)
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
  }

  test("/?tab=contacts#signature on load scrolls to the Signature row and survives a refresh", async ({ page }) => {
    await open(page, "/?tab=contacts#signature")
    const signature = page.locator("#signature")
    await expect(signature).toBeInViewport()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
    await page.reload()
    await expect(page).toHaveURL(/\/\?tab=contacts#signature$/)
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await expect(signature).toBeInViewport()
  })

  test("an unknown hash, or a Section hash on Insurance, leaves the page at the top", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(String(error)))
    // Poll after the data settles (no requests in flight), so a late scroll would be seen.
    await open(page, "/?tab=contacts#nope")
    await page.waitForLoadState("networkidle")
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.goto("/?tab=insurance#phone")
    await expect(page.getByRole("region", { name: "Insurance" })).toBeVisible()
    await page.waitForLoadState("networkidle")
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    expect(errors).toEqual([])
  })

  test("keyboard: the Section menu / Jump to focuses the Section h2 and replaces the hash; a dirty Section opens no leave dialog", async ({ page, isMobile }) => {
    await open(page, FIXTURE)
    await page.getByLabel("Fixture phone").fill("415")
    const historyLength = await page.evaluate(() => history.length)
    if (isMobile) {
      await expect(page.getByRole("navigation", { name: "Sections" })).toBeHidden()
      const jump = page.getByRole("combobox", { name: "Jump to" })
      await jump.focus()
      await page.keyboard.press("Enter")
      await page.getByRole("option", { name: "Email" }).focus()
      await page.keyboard.press("Enter")
    } else {
      await expect(page.getByRole("combobox", { name: "Jump to" })).toBeHidden()
      await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Email" }).focus()
      await page.keyboard.press("Enter")
    }
    await expect(page.getByRole("heading", { level: 2, name: "Email" })).toBeFocused()
    await expect(page).toHaveURL(/\?tab=contacts#email$/)
    await expect(page.locator("#email")).toBeInViewport()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(page.getByLabel("Fixture phone")).toHaveValue("415")
    expect(await page.evaluate(() => history.length)).toBe(historyLength)
    if (!isMobile) {
      const nav = page.getByRole("navigation", { name: "Sections" })
      await expect(nav.locator('[aria-current="location"]')).toHaveCount(1)
      await expect(nav.locator('[aria-current="location"]')).toHaveText(/03\s*Email/)
    }
  })

  test("Contacts: Section menu rows (desktop) or Jump to (mobile) are 44 px targets, no horizontal scroll", async ({ page, isMobile }) => {
    await open(page, "/?tab=contacts")
    await expectNoHorizontalScroll(page)
    const targets = isMobile
      ? [page.getByRole("combobox", { name: "Jump to" })]
      : await page.getByRole("navigation", { name: "Sections" }).getByRole("link").all()
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      const box = await target.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    if (!isMobile) {
      const nav = page.getByRole("navigation", { name: "Sections" })
      expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe("sticky")
      expect(await nav.evaluate((el) => (el.parentElement as HTMLElement).getBoundingClientRect().width)).toBe(200)
    }
  })
})

test.describe("leave guard (Story 1.13, fixture page)", () => {
  async function openDirty(page: Page) {
    await mockProfileDefaults(page)
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
    await expect(page).toHaveURL(/\/account\?tab=personal$/)
  })

  test("a dirty tab switch: Save saves, then the tab changes", async ({ page }) => {
    await openDirty(page)
    await page.getByRole("tab", { name: "Insurance" }).click()
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page).toHaveURL(/\?tab=insurance$/)
    await expect(page.getByText("saved", { exact: true })).toBeVisible()
  })

  test("a dirty guard-only participant that can't save: no Save button", async ({ page }) => {
    await mockProfileDefaults(page)
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
    await mockProfileDefaults(page)
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

test.describe("leave guard: every Story 1.13 case (fixture page; spec NG-9027)", () => {
  const BODY = "Save your changes before you leave, or discard them."
  const CANNOT_SAVE = "These changes can't be saved from here. Keep editing to finish them, or discard them."
  /** Another Section's draft of this user: a hand-off keeps it, Return to 1health purges it. */
  const OTHER_DRAFT = `pp:draft:v1:demo:${ANN.id}:email`
  /** The fixture's participants: a Save-all one, a guard-only one that can save, one that can't. */
  const PARTICIPANTS = { "Fixture phone": "phone", "Fixture editor": "social", "Fixture insurance": "insurance" } as const
  type Participant = keyof typeof PARTICIPANTS

  const dialog = (page: Page) => page.getByRole("alertdialog", { name: "You have unsaved changes" })
  const status = (page: Page, label: Participant) => page.getByTestId(`fixture-${PARTICIPANTS[label]}`).locator("output")
  const storedDraft = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), OTHER_DRAFT)

  async function open(page: Page, query = ""): Promise<void> {
    await mockProfileDefaults(page)
    await page.goto(`${FIXTURE}${query}`)
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
  }

  async function seedOtherDraft(page: Page): Promise<void> {
    await page.evaluate((key) => {
      window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), baseHash: "0".repeat(64), values: { value: "ann@example.com" } }))
    }, OTHER_DRAFT)
  }

  const COMBINATIONS: readonly (readonly Participant[])[] = [
    ["Fixture phone"],
    ["Fixture editor"],
    ["Fixture insurance"],
    ["Fixture phone", "Fixture editor"],
    ["Fixture phone", "Fixture insurance"],
    ["Fixture editor", "Fixture insurance"],
    ["Fixture phone", "Fixture editor", "Fixture insurance"],
  ]

  for (const dirty of COMBINATIONS) {
    const canSave = !dirty.includes("Fixture insurance")
    test(`a tab switch with ${dirty.join(" + ")} dirty: ${canSave ? "Save saves every one" : "no Save, the cannot-save body; Discard discards every one"}, then the tab changes`, async ({ page }) => {
      await open(page)
      for (const label of dirty) await page.getByLabel(label).fill("x")
      await page.getByRole("tab", { name: "Insurance" }).click()
      await expect(dialog(page).getByRole("button")).toHaveText(canSave ? ["Keep editing", "Discard", "Save"] : ["Keep editing", "Discard"])
      await expect(dialog(page)).toContainText(canSave ? BODY : CANNOT_SAVE)
      await dialog(page).getByRole("button", { name: canSave ? "Save" : "Discard" }).click()
      await expect(page).toHaveURL(/\?tab=insurance$/)
      for (const label of dirty) {
        if (canSave) await expect(status(page, label)).toHaveText("saved")
        else {
          await expect(page.getByLabel(label)).toHaveValue("")
          // Discarded, never saved.
          await expect(status(page, label)).toHaveText("")
        }
      }
    })
  }

  test("Save with an invalid value sends nothing, closes, stays and focuses that input", async ({ page }) => {
    await open(page)
    await page.getByLabel("Fixture phone").fill("415")
    await page.getByLabel("Fixture editor").fill("invalid")
    await page.getByRole("tab", { name: "Insurance" }).click()
    await dialog(page).getByRole("button", { name: "Save" }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByLabel("Fixture editor")).toBeFocused()
    await expect(page).toHaveURL(/\?tab=contacts$/)
    await expect(status(page, "Fixture phone")).toHaveText("")
    await expect(status(page, "Fixture editor")).toHaveText("")
  })

  test("a failing Save stays: the others still save, the partial toast, focus on the failed Section's heading", async ({ page }) => {
    await open(page, "?fail=phone")
    await page.getByLabel("Fixture phone").fill("415")
    await page.getByLabel("Fixture editor").fill("x")
    await page.getByRole("tab", { name: "Insurance" }).click()
    await dialog(page).getByRole("button", { name: "Save" }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(page).toHaveURL(/[?&]tab=contacts$/)
    await expect(status(page, "Fixture phone")).toHaveText("not saved")
    await expect(status(page, "Fixture editor")).toHaveText("saved")
    await expect(page.getByRole("region", { name: /Notifications/ }).getByText("1 saved, 1 failed")).toBeVisible()
    await expect(page.locator("#phone-heading")).toBeFocused()
  })

  test("a hand-off while dirty: Discard → /handoff/portal in the same tab, no logout, another Section's draft kept", async ({ page }) => {
    const logouts = await mockExit(page)
    await page.route("**/handoff/portal", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>hand-off</title>hand-off" }))
    await open(page)
    await seedOtherDraft(page)
    await page.getByLabel("Fixture phone").fill("415")
    await page.getByRole("button", { name: "Hand off" }).click()
    await dialog(page).getByRole("button", { name: "Discard" }).click()
    await page.waitForURL(/\/handoff\/portal$/)
    expect(logouts()).toBe(0)
    expect(await storedDraft(page)).not.toBeNull()
  })

  test("Return to 1health while dirty: Discard purges this user's drafts, then logout and the portal", async ({ page }) => {
    const logouts = await mockExit(page)
    await open(page)
    await seedOtherDraft(page)
    await page.getByLabel("Fixture phone").fill("415")
    await page.getByRole("link", { name: "Return to 1health" }).click()
    await dialog(page).getByRole("button", { name: "Discard" }).click()
    await page.waitForURL((url) => url.origin === new URL(PORTAL_URL).origin)
    expect(logouts()).toBe(1)
    // Back on this origin (the logout was mocked, so the session is still there): the draft is gone.
    await open(page)
    expect(await storedDraft(page)).toBeNull()
  })

  test("a scoped close asks about its participant only: Keep editing keeps it, Discard discards only it", async ({ page }) => {
    await open(page)
    await page.getByLabel("Fixture phone").fill("415")
    await page.getByLabel("Fixture insurance").fill("x")
    await page.getByRole("button", { name: "Close insurance" }).click()
    await expect(dialog(page).getByRole("button")).toHaveText(["Keep editing", "Discard"])
    await dialog(page).getByRole("button", { name: "Keep editing" }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByTestId("scoped-close")).toHaveText("false")
    await expect(page.getByLabel("Fixture insurance")).toHaveValue("x")
    await page.getByRole("button", { name: "Close insurance" }).click()
    await dialog(page).getByRole("button", { name: "Discard" }).click()
    await expect(page.getByTestId("scoped-close")).toHaveText("true")
    await expect(page.getByLabel("Fixture insurance")).toHaveValue("")
    await expect(page.getByLabel("Fixture phone")).toHaveValue("415")
  })

  for (const key of ["Enter", "Space"] as const) {
    test(`keyboard tab switch while dirty (WCAG 2.1.1): ${key} on a tab opens the dialog and it stays open; Keep editing stays; Tab → Discard → Enter changes the tab`, async ({ page }) => {
      await open(page)
      await page.getByLabel("Fixture phone").fill("415")
      const tab = page.getByRole("tab", { name: "Insurance" })
      // Arrow keys still only move focus between tabs.
      await page.getByRole("tab", { name: "Contacts" }).focus()
      await page.keyboard.press("ArrowRight")
      await expect(tab).toBeFocused()
      await expect(dialog(page)).toBeHidden()
      // The same press must not activate the dialog's initially focused button.
      await page.keyboard.press(key)
      const keepEditing = dialog(page).getByRole("button", { name: "Keep editing" })
      await expect(keepEditing).toBeFocused()
      await page.waitForTimeout(300)
      await expect(dialog(page)).toBeVisible()
      await expect(page).toHaveURL(/\?tab=contacts$/)
      // Keep editing (from the keyboard) keeps the user on the tab.
      await page.keyboard.press(key)
      await expect(dialog(page)).toBeHidden()
      await expect(tab).toBeFocused()
      await expect(page).toHaveURL(/\?tab=contacts$/)
      await expect(page.getByLabel("Fixture phone")).toHaveValue("415")
      // Again, then Tab to Discard and Enter: the tab changes.
      await page.keyboard.press(key)
      await expect(keepEditing).toBeFocused()
      await page.keyboard.press("Tab")
      await expect(dialog(page).getByRole("button", { name: "Discard" })).toBeFocused()
      await page.keyboard.press("Enter")
      await expect(dialog(page)).toBeHidden()
      await expect(page).toHaveURL(/\?tab=insurance$/)
      await expect(tab).toHaveAttribute("aria-selected", "true")
    })
  }

  test("Escape keeps editing and returns focus to the trigger (a tab, the hand-off button)", async ({ page }) => {
    await open(page)
    await page.getByLabel("Fixture phone").fill("415")
    // A tab, from the keyboard.
    const tab = page.getByRole("tab", { name: "Insurance" })
    await tab.focus()
    await page.keyboard.press("Enter")
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog(page)).toBeHidden()
    await expect(tab).toBeFocused()
    // The hand-off button, from the keyboard.
    const handoff = page.getByRole("button", { name: "Hand off" })
    await handoff.focus()
    await expect(handoff).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog(page)).toBeHidden()
    await expect(handoff).toBeFocused()
    await expect(page).toHaveURL(/\?tab=contacts$/)
    await expect(page.getByLabel("Fixture phone")).toHaveValue("415")
  })

  test("beforeunload fires on close while only a guard-only participant is dirty", async ({ page }) => {
    await open(page)
    await page.getByLabel("Fixture editor").fill("x")
    const prompted = new Promise<string>((resolve) =>
      page.once("dialog", (dialog) => {
        resolve(dialog.type())
        void dialog.accept()
      }),
    )
    await page.close({ runBeforeUnload: true })
    expect(await prompted).toBe("beforeunload")
  })
})

test.describe("idle warning (Story 1.6)", () => {
  const WARNING = "You'll be signed out in 1 minute"

  /** Answers the ping like the BFF: 204 echoing the given server time. */
  async function mockPing(page: Page, echo: () => number): Promise<() => number> {
    let pings = 0
    await page.route("**/api/session/ping", (route) => {
      pings += 1
      return route.fulfill({ status: 204, headers: { "X-PP-Activity-At": String(echo()) } })
    })
    return () => pings
  }

  /** Installs the context's clock (shared by its pages), then opens `/`. */
  async function openProfile(page: Page): Promise<void> {
    await page.clock.install()
    await mockProfileDefaults(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
  }

  test("appears 60 s before the idle deadline with Stay signed in focused; Stay signed in pings and closes it", async ({ page }) => {
    let echo = 0
    const pings = await mockPing(page, () => echo)
    await openProfile(page)
    const dialog = page.getByRole("alertdialog", { name: WARNING })

    // The client warns 30 s ahead of the server (IDLE_SAFETY_MARGIN_MS): server 14:00 → client 13:30.
    await page.clock.fastForward("13:00")
    await expect(dialog).toHaveCount(0)
    await page.clock.fastForward("00:31")
    await expect(dialog).toBeVisible()
    const stay = dialog.getByRole("button", { name: "Stay signed in" })
    await expect(stay).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    await expectNoAxeViolations(page, "idle warning")

    // The page clock tracks the server clock here (offset ≈ 0), so "now" is the echo.
    echo = await page.evaluate(() => Date.now())
    await stay.click()
    await expect(dialog).toHaveCount(0)
    expect(pings()).toBe(1)
    await page.clock.fastForward("05:00")
    await expect(dialog).toHaveCount(0)
  })

  test("two tabs: activity in one closes the other tab's warning and keeps it from firing early", async ({ page, context }) => {
    let echo = 0
    await mockPing(page, () => echo)
    // One clock for the whole context: both tabs move together.
    await openProfile(page)
    const other = await context.newPage()
    await mockProfileDefaults(other)
    await other.goto("/")
    await expect(other.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()

    const warningA = page.getByRole("alertdialog", { name: WARNING })
    const warningB = other.getByRole("alertdialog", { name: WARNING })
    await page.clock.fastForward("14:00")
    await expect(warningA).toBeVisible()
    await expect(warningB).toBeVisible()

    // Tab A stays signed in; the echo reaches tab B over pp-activity.
    echo = await page.evaluate(() => Date.now())
    await warningA.getByRole("button", { name: "Stay signed in" }).click()
    await expect(warningA).toHaveCount(0)
    await expect(warningB).toHaveCount(0)

    // Tab B now warns 14 min after tab A's activity, not before.
    await page.clock.fastForward("13:00")
    await expect(warningB).toHaveCount(0)
    await page.clock.fastForward("00:31")
    await expect(warningB).toBeVisible()
  })
})
