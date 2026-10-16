import AxeBuilder from "@axe-core/playwright"
import { expect, type APIRequestContext, type APIResponse, type Locator, type Page } from "@playwright/test"
import { computeCacheBustingSearchParam } from "next/dist/shared/lib/router/utils/cache-busting-search-param"
import { ACCOUNT_DISABLED_URL } from "./server-env"
import { expectHeaderTabOrder, mockAccountDefaults, mockContacts, mockMyself, PORTAL_URL, setTheme, signIn, test } from "./fixtures"

/** Team B consumer coverage for Story 7.2. Enforcement remains foundation-owned. */
const TABS = [
  ["personal", "Personal Account"],
  ["provider", "Individual Provider Registration"],
  ["organizations", "My Organizations"],
] as const
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const CSP = /^default-src 'self'; script-src 'self' 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests$/

function expectHardened(headers: Record<string, string>): string {
  const csp = CSP.exec(headers["content-security-policy"] ?? "")
  expect(csp, "production nonce CSP").not.toBeNull()
  expect(headers).toMatchObject({
    "x-frame-options": "DENY",
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin",
    pragma: "no-cache",
  })
  // Next uses a stricter no-store value on 404s. Check directives, not their order.
  const directives = (headers["cache-control"] ?? "").split(",").map((value) => value.trim())
  expect(directives).toEqual(expect.arrayContaining(["private", "no-store", "max-age=0"]))
  expect(headers["cache-control"]).not.toMatch(/public|s-maxage/)
  return csp?.[1] ?? ""
}

async function expectAxeAndLayout(page: Page): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${theme} WCAG 2.1 AA`).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
}

async function expectTouchTarget(target: Locator): Promise<void> {
  const box = await target.boundingBox()
  expect(box, "visible touch target").not.toBeNull()
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
}

async function expectFocusRing(target: Locator): Promise<void> {
  await expect(target).toBeFocused()
  expect(await target.evaluate((element) => {
    const style = getComputedStyle(element)
    const transparent = /transparent|rgba\([^)]*,\s*0\)|\/\s*0(?:[\s)]|$)/
    const outline = parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== "none" && !transparent.test(style.outlineColor)
    // Split at commas outside color functions. Transparent Tailwind shadow
    // placeholders and a decorative shadow do not prove a visible 2 px ring.
    const ring = style.boxShadow.split(/,(?![^(]*\))/).some((shadow) => {
      const lengths = shadow.match(/-?\d*\.?\d+px/g)?.map(parseFloat)
      return lengths?.length === 4 && lengths[0] === 0 && lengths[1] === 0 && lengths[2] === 0 && lengths[3] >= 2 && !transparent.test(shadow)
    })
    return element.matches(":focus-visible") && (outline || ring)
  }), "visible keyboard focus ring").toBe(true)
}

async function expectTabRevealed(tab: Locator): Promise<void> {
  await expect.poll(() => tab.evaluate((node) => {
    const strip = node.closest('[role="tablist"]')!
    const target = node.getBoundingClientRect()
    const viewport = strip.getBoundingClientRect()
    const visible = Math.min(target.right, viewport.right) - Math.max(target.left, viewport.left)
    return visible >= Math.min(target.width, viewport.width) - 1
  }), { message: "selected tab uses all available visible width inside its strip" }).toBe(true)
}

/** Match Next's RSC discriminator to a valid Flight state on every request. */
async function requestRsc(request: APIRequestContext, path: string, prefetch: "1" | undefined, extraHeaders: Record<string, string> = {}): Promise<APIResponse> {
  const tree = encodeURIComponent(JSON.stringify(["", {}]))
  const rsc = await computeCacheBustingSearchParam(prefetch, undefined, tree, undefined)
  return request.get(`${path}?_rsc=${rsc}`, {
    headers: { ...extraHeaders, RSC: "1", "Next-Router-State-Tree": tree, ...(prefetch ? { "Next-Router-Prefetch": prefetch } : {}) },
    maxRedirects: 0,
  })
}

function expectNoFlightFailure(payload: string): void {
  expect(payload).not.toContain("NEXT_REDIRECT")
  expect(payload).not.toMatch(/(?:^|\n)[\da-f]+:E\{/)
}

/** Without a loading boundary, dynamic prefetch stops at route metadata. */
function expectRoutePrefetch(payload: string, path: string): void {
  expectNoFlightFailure(payload)
  expect(payload).toContain('"s":"__PAGE__"')
  if (path === "/account") expect(payload).toContain('"s":"account"')
  expect(payload).not.toContain('"page":"account"')
  expect(payload).not.toContain('"page":"profile"')
  expect(payload).not.toContain('"portalUrl":')
  expect(payload).not.toContain('"idle":')
}

async function expectRscAuthRedirect(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(200)
  expectHardened(response.headers())
  expect(response.headers()["content-type"]).toContain("text/x-component")
  const payload = await response.text()
  expect(payload).toContain('"digest":"NEXT_REDIRECT;replace;/auth;307;"')
  expect(payload).not.toContain('"page":"account"')
  expect(payload).not.toContain('"page":"profile"')
  expect(payload).not.toContain('"portalUrl":')
}

test.describe("Account security and caching (Story 7.2)", () => {
  for (const [tab] of TABS) {
    test(`signed-in ?tab=${tab} has AD-21 and AD-18 headers`, async ({ page }) => {
      await mockAccountDefaults(page)
      await signIn(page)
      const response = await page.goto(`/account?tab=${tab}`)
      expect(response?.status()).toBe(200)
      expectHardened(await response!.allHeaders())
      await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
      // Next owns rendered-page Vary and replaces Cookie with its RSC variants.
      expect((await response!.allHeaders()).vary.toLowerCase()).toContain("rsc")
    })
  }

  test("Account expired-session navigation redirects keep AD-21, no-store and Cookie variability", async ({ request }) => {
    const response = await request.get("/account?tab=organizations", {
      headers: { cookie: "__Host-pp_s=expired", "Sec-Fetch-Mode": "navigate" },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(307)
    expect(new URL(response.headers().location, response.url()).href).toBe(new URL("/auth", response.url()).href)
    expectHardened(response.headers())
    expect(response.headers().vary).toMatch(/(^|,\s*)Cookie(,|$)/i)
  })

  test("Account scripts carry their request nonce without CSP violations; another response has a fresh nonce", async ({ page }) => {
    const violations: string[] = []
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.text().startsWith("account-csp:")) violations.push(message.text())
    })
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`account-csp:${event.violatedDirective}:${event.blockedURI}`)
      })
    })
    await mockAccountDefaults(page)
    await signIn(page)
    const response = await page.goto("/account?tab=personal")
    const nonce = expectHardened(await response!.allHeaders())
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    const nonces = await page.locator("script").evaluateAll((scripts) => scripts.map((script) => script.nonce))
    expect(nonces.length).toBeGreaterThan(0)
    for (const value of nonces) expect(value).toBe(nonce)
    const next = await page.request.get("/account?tab=personal")
    expect(next.status()).toBe(200)
    expect(expectHardened(next.headers())).not.toBe(nonce)
    expect(violations).toEqual([])
    expect(errors).toEqual([])
  })

  for (const path of ["/", "/account", "/handoff/portal"]) {
    for (const prefetch of [undefined, "1"] as const) {
      test(`${path}: signed-in RSC ${prefetch ? "prefetch" : "navigation"} is private and never cached`, async ({ page }) => {
        await signIn(page)
        const response = await requestRsc(page.request, path, prefetch)
        // The enduring handoff contract also accepts 7.3's safe fallback 303;
        // until that route lands, Next's missing-route RSC is a hardened 404.
        if (path === "/handoff/portal") expect([303, 404]).toContain(response.status())
        else expect(response.status()).toBe(200)
        expectHardened(response.headers())
        if (response.status() === 303) {
          expect(new URL(response.headers().location, response.url()).href).toBe(new URL(PORTAL_URL).href)
        } else {
          expect(response.headers()["content-type"]).toContain("text/x-component")
          expect(response.headers().vary.toLowerCase()).toContain("rsc")
          const payload = await response.text()
          if (path !== "/handoff/portal") {
            if (prefetch) {
              expectRoutePrefetch(payload, path)
            } else {
              expectNoFlightFailure(payload)
              expect(payload).toContain(`"page":"${path === "/account" ? "account" : "profile"}"`)
              expect(payload).toContain(`"defaultTab":"${path === "/account" ? "personal" : "contacts"}"`)
              expect(payload).toContain(`"label":"${path === "/account" ? "Personal Account" : "Contacts"}"`)
            }
          }
        }
      })
    }
  }

  for (const path of ["/", "/account"]) {
    for (const session of ["absent", "invalid"] as const) {
      for (const prefetch of [undefined, "1"] as const) {
        test(`${path}: ${session} session on RSC ${prefetch ? "prefetch then navigation" : "navigation"} stays private and requires auth`, async ({ request }) => {
          const headers: Record<string, string> = session === "invalid" ? { cookie: "__Host-pp_s=expired" } : {}
          const response = await requestRsc(request, path, prefetch, headers)
          if (prefetch) {
            expect(response.status()).toBe(200)
            expectHardened(response.headers())
            expect(response.headers()["content-type"]).toContain("text/x-component")
            expectRoutePrefetch(await response.text(), path)
            // Prefetch skips the dynamic page; the actual navigation must
            // still execute requirePageSession and return its auth redirect.
            await expectRscAuthRedirect(await requestRsc(request, path, undefined, headers))
          } else {
            await expectRscAuthRedirect(response)
          }
        })
      }
    }
  }
})

test.describe("Account emergency switch (Story 7.2)", () => {
  test.use({ baseURL: ACCOUNT_DISABLED_URL })

  test("every Account tab answers a hardened 503 before authentication", async ({ request }) => {
    for (const [tab] of TABS) {
      const response: APIResponse = await request.get(`/account?tab=${tab}`, { maxRedirects: 0 })
      expect(response.status()).toBe(503)
      expectHardened(response.headers())
      expect(response.headers().vary).toMatch(/(^|,\s*)Cookie(,|$)/i)
      expect(response.headers()["retry-after"]).toBe("300")
      expect(await response.text()).toContain("Personal Profile is unavailable right now")
    }
  })

  for (const path of ["/account", "/handoff/portal"]) {
    for (const prefetch of [undefined, "1"] as const) {
      test(`${path}: Account-disabled RSC ${prefetch ? "prefetch" : "navigation"} answers a hardened 503 before auth`, async ({ request }) => {
        const response = await requestRsc(request, path, prefetch)
        expect(response.status()).toBe(503)
        expectHardened(response.headers())
        expect(response.headers()["content-type"]).toContain("text/html")
        expect(response.headers()["retry-after"]).toBe("300")
        expect(response.headers().vary).toMatch(/(^|,\s*)Cookie(,|$)/i)
        expect(response.headers().location).toBeUndefined()
        expect(await response.text()).toContain("Personal Profile is unavailable right now")
      })
    }
  }
})

test.describe("Account mobile and keyboard (Story 7.2)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountDefaults(page)
    await signIn(page)
  })

  for (const [tab, label] of TABS) {
    test(`${tab}: mobile gutters, hidden header contacts and locally scrolling tabs`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "360×740 layout contract")
      await page.goto(`/account?tab=${tab}`)
      const heading = page.getByRole("heading", { level: 1, name: "Ann Lee" })
      await expect(heading).toBeVisible()
      const gutters = [page.getByRole("banner").locator(":scope > div"), heading.locator(".."), page.getByRole("tablist"), page.getByRole("tabpanel")]
      for (const element of gutters) {
        expect(await element.evaluate((node) => [getComputedStyle(node).paddingLeft, getComputedStyle(node).paddingRight])).toEqual(["16px", "16px"])
      }
      const list = page.getByRole("tablist")
      expect(await list.evaluate((node) => node.scrollWidth > node.clientWidth && getComputedStyle(node).overflowX === "auto")).toBe(true)
      const active = page.getByRole("tab", { name: label, exact: true })
      await expectTabRevealed(active)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      for (const target of [...await page.getByRole("tab").all(), ...await page.getByRole("banner").getByRole("link").all()]) await expectTouchTarget(target)
    })
  }

  test("loaded desktop header contacts disappear when the viewport becomes mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 740 })
    await mockContacts(page, {
      Mobile: [{ id: 1, value: "+14155552671", label: "Primary", phoneNumberRegion: "us" }],
      Email: [{ id: 2, value: "ann@example.com", label: "Primary" }],
    })
    await page.goto("/account?tab=personal")
    const header = page.getByRole("heading", { level: 1, name: "Ann Lee" }).locator("..")
    await expect(header.getByText("ann@example.com", { exact: true })).toBeVisible()
    await expect(header.getByText("+1 (415) 555-2671", { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 360, height: 740 })
    await expect(header.getByText("ann@example.com", { exact: true })).toHaveCount(0)
    await expect(header.getByText("+1 (415) 555-2671", { exact: true })).toHaveCount(0)
    await expect(header.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
  })

  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: keyboard reaches every tab, wraps manually, reveals the selection and enters its panel`, async ({ page }) => {
      await page.goto("/account?tab=personal")
      await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
      await setTheme(page, theme)
      await expectHeaderTabOrder(page)
      await expectFocusRing(page.getByRole("tab", { name: "Personal Account", exact: true }))
      for (const [key, label, activation, tab] of [
        ["ArrowRight", "Individual Provider Registration", "Enter", "provider"],
        ["ArrowRight", "My Organizations", "Space", "organizations"],
        ["ArrowRight", "Personal Account", "Enter", "personal"],
        ["ArrowLeft", "My Organizations", "Enter", "organizations"],
        ["Home", "Personal Account", "Enter", "personal"],
        ["End", "My Organizations", "Enter", "organizations"],
      ] as const) {
        const before = page.url()
        await page.keyboard.press(key)
        const focused = page.getByRole("tab", { name: label, exact: true })
        await expectFocusRing(focused)
        await expectTabRevealed(focused)
        expect(page.url()).toBe(before)
        await page.keyboard.press(activation)
        await expect(page).toHaveURL(new RegExp(`/account\\?tab=${tab}$`))
        await expect(focused).toHaveAttribute("aria-selected", "true")
        await expectTabRevealed(focused)
      }
      await page.keyboard.press("Tab")
      await expectFocusRing(page.getByRole("tabpanel"))
      // Keyboard modality is active: the app-bar links must expose their rings too.
      for (const name of ["Personal Profile", "Account", "Return to 1health"]) {
        const link = page.getByRole("link", { name, exact: true })
        await link.focus()
        await expectFocusRing(link)
      }
    })
  }
})

test.describe("Account read failures (Story 7.2)", () => {
  for (const { label, status, body, forbidden } of [
    { label: "upstream 400", status: 400, body: { message: "Private upstream diagnostic", code: 400 }, forbidden: false },
    { label: "upstream 403", status: 403, body: { message: "Private upstream diagnostic", code: 403 }, forbidden: true },
    { label: "proxy 403", status: 403, body: { errorCode: "NOT_ALLOWED", source: "proxy" }, forbidden: false },
  ]) {
    test(`myself ${label}: accessible light/dark failure with ${forbidden ? "no action" : "Retry and recovery"}`, async ({ page }) => {
      await mockAccountDefaults(page)
      // A 400 deliberately avoids the transient 5xx retry budget (already tested in foundation).
      const calls = await mockMyself(page, { status, body })
      await signIn(page)
      await page.goto("/account?tab=personal")
      await expect(page.getByText(forbidden ? "You don't have access to this in your current account" : "Something went wrong while loading profile information")).toBeVisible()
      if (!forbidden) await expect(page.getByText("You don't have access to this in your current account")).toHaveCount(0)
      await expect(page.getByText("Private upstream diagnostic")).toHaveCount(0)
      expect(calls()).toBe(1)
      await expectAxeAndLayout(page)
      const retry = page.getByRole("button", { name: "Retry", exact: true })
      if (forbidden) {
        await expect(retry).toHaveCount(0)
      } else {
        await expectTouchTarget(retry)
        for (const theme of ["light", "dark"] as const) {
          await setTheme(page, theme)
          await retry.focus()
          await page.keyboard.press("Tab")
          await page.keyboard.press("Shift+Tab")
          await expectFocusRing(retry)
        }
        const recovered = await mockMyself(page)
        await page.keyboard.press("Enter")
        await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
        await expect(page.getByText("Something went wrong while loading profile information")).toHaveCount(0)
        expect(recovered()).toBe(1)
      }
    })
  }
})
