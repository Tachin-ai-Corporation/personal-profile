import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"
import { ANN, mockAccountDefaults, mockMyself, setTheme, signIn, test } from "./fixtures"

const TITLE = "Authenticator app"
const ERROR = "Something went wrong while loading profile information"
const REASON = "Disable the current authenticator to link another"
const APPS = ["Google", "Microsoft", "Authy", "DUO", "Android OTP"]
const card = (page: Page) => page.getByRole("region", { name: TITLE, exact: true })
const tiles = (page: Page) => card(page).getByRole("button", { name: /^Link / })

test.describe("Authenticator status and app tiles (Story 8.1)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountDefaults(page)
    await signIn(page)
  })

  for (const linked of [false, true]) {
    test(`${linked ? "linked" : "unlinked"} tiles: both themes, original logos, dimensions, surfaces and axe`, async ({ page, isMobile }) => {
      const reads = await mockMyself(page, { body: { ...ANN, mfaEnabled: !linked, totpEnabled: linked } })
      const mfaRequests: string[] = []
      page.on("request", (request) => { if (/\/api\/.*\/mfa\//.test(request.url())) mfaRequests.push(request.url()) })
      await page.goto("/account?tab=personal")
      await expect(card(page).getByText(linked ? "Enabled" : "Not set up", { exact: true })).toBeVisible()
      await expect(tiles(page)).toHaveCount(5)
      await expect(tiles(page)).toHaveText(APPS)
      await expect(card(page).getByText("Link an authenticator app to get sign-in codes on your phone.", { exact: true })).toBeVisible()
      await expect(card(page).getByRole("button", { name: "Disable", exact: true })).toHaveCount(linked ? 1 : 0)
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme)
        await page.mouse.move(0, 0)
        const geometry = []
        for (const [index, tile] of (await tiles(page).all()).entries()) {
          await expect(tile).toHaveAttribute("aria-label", `Link ${APPS[index]}`)
          await expect(tile).toHaveAttribute("aria-haspopup", "dialog")
          const img = tile.locator("img")
          await expect(img).toHaveAttribute("alt", "")
          await expect(img).toHaveAttribute("aria-hidden", "true")
          expect(await img.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
          const logo = await img.boundingBox()
          expect(logo?.width).toBe(48)
          expect(logo?.height).toBe(48)
          const rect = await tile.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            return { x: bounds.x + window.scrollX, y: bounds.y + window.scrollY, width: bounds.width, height: bounds.height }
          })
          expect(rect).not.toBeNull()
          expect(rect!.width).toBeGreaterThanOrEqual(96)
          expect(Math.abs(rect!.width - rect!.height)).toBeLessThan(1)
          if (!isMobile) expect(rect!.width).toBe(112)
          geometry.push(rect!)
          const surface = await tile.evaluate((element) => {
            const style = getComputedStyle(element)
            // Resolve semantic tokens through a sibling so browser color serialization is identical.
            const sample = document.createElement("span")
            element.parentElement!.append(sample)
            sample.style.backgroundColor = "var(--card)"
            const card = getComputedStyle(sample).backgroundColor
            sample.style.backgroundColor = "var(--accent)"
            const hover = getComputedStyle(sample).backgroundColor
            sample.remove()
            return { actual: style.backgroundColor, card, hover }
          })
          await expect(tile).toHaveCSS("background-color", surface.card)
          if (linked) {
            await expect(tile).toHaveAttribute("aria-disabled", "true")
            await expect(tile).not.toHaveAttribute("disabled")
            await expect(tile).toHaveCSS("opacity", "0.55")
          } else await expect(tile).not.toHaveAttribute("aria-disabled")
          await tile.hover()
          await expect(tile).toHaveCSS("background-color", surface.hover)
          await page.mouse.move(0, 0)
        }
        expect(Math.round(geometry[1].x - geometry[0].x - geometry[0].width)).toBe(isMobile ? 12 : 16)
        expect(geometry[2].y).toBe(geometry[0].y)
        if (isMobile) expect(geometry[3].y).toBeGreaterThan(geometry[0].y)
        else expect(geometry[4].y).toBe(geometry[0].y)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
        expect(results.violations).toEqual([])
      }
      expect(reads()).toBe(1)
      expect(mfaRequests).toEqual([])
    })
  }

  test("narrow fallback and breakpoint geometry at 320, 767 and 768 px", async ({ page }) => {
    for (const linked of [false, true]) {
      await mockMyself(page, { body: { ...ANN, totpEnabled: linked } })
      await page.goto("/account?tab=personal")
      await expect(tiles(page)).toHaveCount(5)
      for (const width of [320, 767, 768]) {
        await page.setViewportSize({ width, height: 740 })
        // Resizing must never expose an intermediate document overflow.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
        const boxes = await tiles(page).evaluateAll((elements) => elements.map((element) => {
          const rect = element.getBoundingClientRect()
          return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height }
        }))
        const columns = width < 360 ? 2 : width < 768 ? 3 : 5
        for (const box of boxes) {
          expect(box.width).toBeGreaterThanOrEqual(96)
          expect(Math.abs(box.width - box.height)).toBeLessThan(1)
          if (width >= 768) expect(box.width).toBe(112)
        }
        expect(boxes[columns - 1].y).toBe(boxes[0].y)
        if (columns < 5) expect(boxes[columns].y).toBeGreaterThan(boxes[0].y)
        expect(Math.round(boxes[1].x - boxes[0].x - boxes[0].width)).toBe(width >= 768 ? 16 : 12)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      }
    }
  })

  test("enabled tiles traverse and activate by keyboard in vendor order without mutation requests", async ({ page }) => {
    await mockMyself(page, { body: { ...ANN, totpEnabled: false } })
    const mutations: string[] = []
    page.on("request", (request) => {
      if (request.method() !== "GET" && /\/api\/(1h|pp)\//.test(request.url())) mutations.push(request.url())
    })
    await page.goto("/account?tab=personal")
    await expect(tiles(page)).toHaveCount(5)
    await page.getByRole("region", { name: "Personal account settings", exact: true }).getByRole("button", { name: "Edit", exact: true }).focus()
    for (const app of APPS) {
      await page.keyboard.press("Tab")
      const tile = card(page).getByRole("button", { name: `Link ${app}`, exact: true })
      await expect(tile).toBeFocused()
      await expect(tile).not.toHaveAttribute("aria-disabled")
      await page.keyboard.press("Enter")
      await page.keyboard.press("Space")
      await expect(tile).toBeFocused()
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await expect(page.getByRole("tooltip")).toHaveCount(0)
    }
    await expect(card(page).getByText("Not set up", { exact: true })).toBeVisible()
    expect(mutations).toEqual([])
  })

  test("200% tile text wraps inside the controls without clipping logos or horizontal overflow", async ({ page }) => {
    for (const linked of [false, true]) {
      await mockMyself(page, { body: { ...ANN, totpEnabled: linked } })
      await page.goto("/account?tab=personal")
      await expect(tiles(page)).toHaveCount(5)
      // Emulate text-only enlargement, keeping control dimensions and viewport unchanged.
      await tiles(page).locator("span").evaluateAll((labels) => labels.forEach((label) => {
        const element = label as HTMLElement
        const style = getComputedStyle(element)
        const fontSize = parseFloat(style.fontSize) * 2
        const lineHeight = parseFloat(style.lineHeight) * 2
        element.style.fontSize = `${fontSize}px`
        element.style.lineHeight = `${lineHeight}px`
      }))
      for (const tile of await tiles(page).all()) {
        const dimensions = await tile.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          const label = element.querySelector("span")!
          const range = document.createRange()
          range.selectNodeContents(label)
          return {
            noOverflow: element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight,
            textContained: [...range.getClientRects()].every((line) => line.left >= bounds.left && line.right <= bounds.right && line.top >= bounds.top && line.bottom <= bounds.bottom),
            logo: element.querySelector("img")!.getBoundingClientRect().height,
          }
        })
        expect(dimensions).toEqual({ noOverflow: true, textContained: true, logo: 48 })
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      expect((await new AxeBuilder({ page }).include("#authenticator").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([])
    }
  })

  for (const destination of ["Retry", "another control", "another control then body", "content", "session"] as const) {
    test(`held Authenticator Retry preserves the focus intent: ${destination}`, async ({ page }) => {
      await mockMyself(page, { status: 400, body: {} })
      await page.goto("/account?tab=personal")
      const retry = card(page).getByRole("button", { name: "Retry", exact: true })
      await expect(retry).toBeVisible()
      let release!: () => void
      const gate = new Promise<void>((resolve) => { release = resolve })
      let calls = 0
      await page.route("**/api/1h/v2/user/myself", async (route) => {
        calls++
        await gate
        await route.fulfill(destination === "session" ? { status: 401, json: { errorCode: "SESSION_EXPIRED", source: "proxy" } } : { json: ANN })
      })
      try {
        await retry.focus()
        await page.keyboard.press("Enter")
        await expect.poll(() => calls).toBe(1)
        const outside = page.getByRole("tab", { name: "Individual Provider Registration", exact: true })
        const otherHeading = page.getByRole("heading", { name: "Personal account settings", exact: true })
        if (destination.startsWith("another control")) {
          await outside.focus()
          if (destination === "another control then body") await outside.evaluate((element) => (element as HTMLElement).blur())
        } else if (destination === "content") await otherHeading.click()
        release()
        if (destination === "session") {
          const dialog = page.getByRole("alertdialog", { name: "Your session ended" })
          await expect(dialog).toBeVisible()
          await expect(dialog.getByRole("button", { name: "Return to 1health", exact: true })).toBeFocused()
        } else {
          await expect(tiles(page)).toHaveCount(5)
          if (destination === "Retry") await expect(card(page).getByRole("heading", { name: TITLE, exact: true })).toBeFocused()
          else if (destination === "another control") await expect(outside).toBeFocused()
          else if (destination === "content") await expect(otherHeading).toBeFocused()
          else expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
        }
        expect(calls).toBe(1)
      } finally { release() }
    })
  }

  test("keyboard order, inactive caption association, focus/hover tooltip and no actions", async ({ page, isMobile }) => {
    await mockMyself(page, { body: { ...ANN, totpEnabled: true } })
    const mfaRequests: string[] = []
    page.on("request", (request) => { if (/\/api\/.*\/mfa\//.test(request.url())) mfaRequests.push(request.url()) })
    await page.goto("/account?tab=personal")
    await expect(tiles(page)).toHaveCount(5)
    const edit = page.getByRole("region", { name: "Personal account settings", exact: true }).getByRole("button", { name: "Edit", exact: true })
    await edit.focus()
    await page.keyboard.press("Tab")
    await expect(card(page).getByRole("button", { name: "Disable", exact: true })).toBeFocused()
    // Fit the whole grid before testing focus: Radix intentionally dismisses a tooltip when its trigger scrolls.
    await card(page).scrollIntoViewIfNeeded()
    const caption = card(page).locator("#authenticator-inactive-caption")
    await expect(caption).toHaveText(REASON)
    for (const [index, tile] of (await tiles(page).all()).entries()) {
      await page.mouse.move(0, 0)
      await page.keyboard.press("Tab")
      await expect(tile).toBeFocused()
      await expect(tile).toHaveCSS("outline-style", "solid")
      await expect(tile).toHaveCSS("outline-width", "2px")
      await expect(tile).toHaveCSS("outline-offset", "2px")
      await expect(card(page).locator('[data-slot="state-frame"]')).toHaveCSS("overflow", "visible")
      await expect(tile).toHaveAttribute("aria-describedby", /authenticator-inactive-caption/)
      await expect(page.getByRole("tooltip")).toHaveCount(1)
      await expect(page.getByRole("tooltip")).toHaveText(REASON)
      if (index === 0 || index === 4) await page.screenshot({ path: test.info().outputPath(`focused-tile-${index}.png`), fullPage: true })
      await page.keyboard.press("Enter")
      await page.keyboard.press("Space")
      await expect(tile).toBeFocused()
      // Playwright treats aria-disabled as non-actionable; dispatch a real pointer click to prove the guard.
      await tile.click({ force: true })
      await expect(page.getByRole("dialog")).toHaveCount(0)
    }
    await edit.focus()
    await page.mouse.move(0, 0)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    if (!isMobile) {
      await tiles(page).first().hover()
      await expect(page.getByRole("tooltip")).toHaveCount(1)
      await expect(page.getByRole("tooltip")).toHaveText(REASON)
    }
    expect(mfaRequests).toEqual([])
  })

  test("touch tooltip toggles and closes on outside tap while tiles stay inactive", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Touch-specific interaction is exercised by mobile-360")
    await mockMyself(page, { body: { ...ANN, totpEnabled: true } })
    await page.goto("/account?tab=personal")
    const first = tiles(page).first()
    // Bypass only Playwright's aria-disabled actionability check; retain native touch events.
    await first.tap({ force: true })
    await expect(page.getByRole("tooltip")).toHaveText(REASON)
    await expect(first).toHaveAttribute("aria-describedby", /authenticator-inactive-caption/)
    await page.getByRole("heading", { level: 1 }).tap()
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    await first.tap({ force: true })
    await expect(page.getByRole("tooltip")).toHaveText(REASON)
    await first.tap({ force: true })
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("delayed deep link keeps its heading mounted, shared reduced-motion skeletons and existing anchor focus", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    await page.route("**/api/1h/v2/user/myself", async (route) => { await pending; await route.fulfill({ json: ANN }) })
    await page.goto("/account?tab=personal#authenticator")
    const heading = card(page).getByRole("heading", { level: 2, name: TITLE, exact: true })
    await expect(heading).toBeVisible()
    await expect(card(page).locator('[data-variant="tiles"] > *')).toHaveCount(5)
    for (const skeleton of await card(page).locator('[data-variant="tiles"] > *').all()) await expect(skeleton).toHaveCSS("animation-name", "none")
    await expect(card(page).getByText("Not set up", { exact: true })).toHaveCount(0)
    await expect(card(page).getByRole("button")).toHaveCount(0)
    try { release(); await expect(heading).toBeFocused(); await expect(tiles(page)).toHaveCount(5) }
    finally { release() }
    await expect(heading).toHaveAttribute("id", "authenticator-heading")
  })

  test("proxy read failure retries only shared identity, announces repeated failure and both cards recover", async ({ page }) => {
    await mockMyself(page, { status: 403, body: { errorCode: "NOT_ALLOWED", source: "proxy" } })
    await page.goto("/account?tab=personal")
    const account = page.getByRole("region", { name: "Personal account settings", exact: true })
    await expect(card(page).getByText(ERROR, { exact: true })).toBeVisible()
    await expect(account.getByText(ERROR, { exact: true })).toBeVisible()
    await expect(tiles(page)).toHaveCount(0)
    await expect(card(page).getByText("Not set up", { exact: true })).toHaveCount(0)
    const before = await card(page).getByRole("alert").elementHandle()
    const repeated = await mockMyself(page, { status: 403, body: { errorCode: "NOT_ALLOWED", source: "proxy" } })
    await card(page).getByRole("button", { name: "Retry", exact: true }).click()
    await expect.poll(repeated).toBe(1)
    await expect.poll(() => before!.evaluate((element) => element.isConnected)).toBe(false)
    await expect(card(page).getByText(ERROR, { exact: true })).toBeVisible()
    await page.waitForLoadState("networkidle")
    const requests: string[] = []
    page.on("request", (request) => { if (/\/api\/(1h|pp|places)\//.test(request.url())) requests.push(new URL(request.url()).pathname) })
    const reads = await mockMyself(page, { body: ANN })
    await card(page).getByRole("button", { name: "Retry", exact: true }).click()
    await expect(tiles(page)).toHaveCount(5)
    await expect(account.getByRole("table")).toBeVisible()
    expect(reads()).toBe(1)
    expect(requests).toEqual(["/api/1h/v2/user/myself"])
    await expect(page.getByText("You don't have access to this in your current account", { exact: true })).toHaveCount(0)
  })
})
