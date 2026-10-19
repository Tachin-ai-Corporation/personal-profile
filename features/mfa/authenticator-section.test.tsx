import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { useEffect, useState } from "react"
import { useSWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MyselfErrorClaimProvider, useMyself, useMyselfErrorClaimed } from "@/features/shell"
import { keys, toMyself } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { AuthenticatorCard } from "./authenticator-card"
import { AuthenticatorSection } from "./authenticator-section"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)
const MYSELF = "/api/1h/v2/user/myself"
const TITLE = "Authenticator app"
const APPS = ["Google", "Microsoft", "Authy", "DUO", "Android OTP"]
const ERROR = "Something went wrong while loading profile information"
const REASON = "Disable the current authenticator to link another"
const card = () => screen.getByRole("region", { name: TITLE })
const tiles = () => within(card()).getAllByRole("button", { name: /^Link / })

beforeEach(() => stubLayoutApis())
afterEach(() => server.events.removeAllListeners("request:start"))

function SharedReader() {
  const { myself } = useMyself()
  const { mutate } = useSWRConfig()
  return <><p>{myself?.firstName}</p><button onClick={() => void mutate(keys.myself(), toMyself(myselfWire({ totpEnabled: true })), false)}>External update</button></>
}

describe("AuthenticatorSection (Story 8.1)", () => {
  it.each([false, null, undefined])("treats totpEnabled=%s as unlinked even with base MFA enabled", async (totpEnabled) => {
    renderInPage(<AuthenticatorSection />, { page: "account", myself: myselfWire({ totpEnabled, mfaEnabled: true }) })
    await within(card()).findByText("Not set up")
    expect(tiles().map((tile) => tile.textContent)).toEqual(APPS)
    expect(within(card()).getByText("Link an authenticator app to get sign-in codes on your phone.")).toBeTruthy()
    expect(within(card()).queryByRole("button", { name: "Disable" })).toBeNull()
    for (const [index, tile] of tiles().entries()) {
      expect(tile.tagName).toBe("BUTTON")
      expect(tile.getAttribute("aria-label")).toBe(`Link ${APPS[index]}`)
      expect(tile.getAttribute("aria-haspopup")).toBe("dialog")
      expect(tile.hasAttribute("aria-disabled")).toBe(false)
      const img = tile.querySelector("img")!
      expect(img.getAttribute("alt")).toBe("")
      expect(img.getAttribute("aria-hidden")).toBe("true")
      expect(img.getAttribute("src")).toBe(`/mfa/${["google", "microsoft", "authy", "duo", "android-otp"][index]}.png`)
      expect(img.getAttribute("width")).toBe("48")
    }
    expect(await axeViolations()).toEqual([])
  })

  it.each([false, true, null])("uses TOTP alone for linked status with mfaEnabled=%s", async (mfaEnabled) => {
    renderInPage(<AuthenticatorSection />, { page: "account", myself: myselfWire({ totpEnabled: true, mfaEnabled }) })
    const status = await within(card()).findByText("Enabled")
    expect(status.getAttribute("data-status")).toBe("verified")
    expect(status.querySelector("svg")).toBeTruthy()
    expect(within(card()).queryByText("Not set up")).toBeNull()
    expect(within(card()).getByRole("button", { name: "Disable" }).className).toContain("text-error-strong")
    const caption = within(card()).getByText(REASON)
    for (const tile of tiles()) {
      expect(tile.getAttribute("aria-disabled")).toBe("true")
      expect(tile.hasAttribute("disabled")).toBe(false)
      expect(tile.getAttribute("aria-describedby")?.split(" ")).toContain(caption.id)
    }
    expect(await axeViolations()).toEqual([])
  })

  it("keeps inactive callbacks inert on click, Enter and Space while allowing tooltip focus", async () => {
    const onLink = vi.fn()
    const onDisable = vi.fn()
    const user = userEvent.setup()
    renderInPage(<AuthenticatorCard state="ready" linked onRetry={vi.fn()} onLink={onLink} onDisable={onDisable} />, { page: "account" })
    for (const tile of tiles()) {
      await user.click(tile)
      tile.focus()
      await user.keyboard("{Enter} ")
      expect(tile).toBe(document.activeElement)
      expect(tile.getAttribute("aria-describedby")?.split(" ")).toContain("authenticator-inactive-caption")
    }
    expect(onLink).not.toHaveBeenCalled()
    expect(onDisable).not.toHaveBeenCalled()
    expect(await screen.findByRole("tooltip")).toHaveProperty("textContent", REASON)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("exposes vendor-specific link and Disable seams without introducing a dialog", async () => {
    const user = userEvent.setup()
    const onLink = vi.fn()
    const onDisable = vi.fn()
    const result = renderInPage(<AuthenticatorCard state="ready" linked={false} onRetry={vi.fn()} onLink={onLink} />, { page: "account" })
    for (const [index, tile] of tiles().entries()) {
      await user.click(tile)
      expect(onLink).toHaveBeenNthCalledWith(index + 1, ["google", "microsoft", "authy", "duo", "android-otp"][index])
    }
    expect(onLink).toHaveBeenCalledTimes(5)
    result.unmount()
    renderInPage(<AuthenticatorCard state="ready" linked onRetry={vi.fn()} onDisable={onDisable} />, { page: "account" })
    await user.click(within(card()).getByRole("button", { name: "Disable" }))
    expect(onDisable).toHaveBeenCalledOnce()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it.each([false, true])("preserves the focused trigger DOM when linked changes from %s and back", async (initialLinked) => {
    function TransitionHarness() {
      const [linked, setLinked] = useState(initialLinked)
      return <div onKeyDown={(event) => { if (event.key === "F2") setLinked((previous) => !previous) }}>
        <AuthenticatorCard state="ready" linked={linked} onRetry={vi.fn()} />
      </div>
    }
    renderInPage(<TransitionHarness />, { page: "account" })
    const user = userEvent.setup()
    const trigger = tiles()[0]
    act(() => trigger.focus())
    for (const nextLinked of [!initialLinked, initialLinked]) {
      await user.keyboard("{F2}")
      expect(tiles()[0]).toBe(trigger)
      expect(document.activeElement).toBe(trigger)
      expect(trigger.getAttribute("aria-disabled")).toBe(nextLinked ? "true" : null)
      if (!nextLinked) {
        const tooltip = screen.queryByRole("tooltip")
        if (tooltip) {
          expect(tooltip.classList.contains("hidden")).toBe(true)
          expect(tooltip.textContent).toBe("")
        }
      }
    }
  })

  it("mounts the landmark and five shared skeletons immediately and keeps the same heading", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { frameReady } = renderInPage(<AuthenticatorSection />, { page: "account", handlers: [http.get(MYSELF, async () => { await gate; return HttpResponse.json(myselfWire()) })] })
    const heading = within(card()).getByRole("heading", { name: TITLE })
    expect(heading.getAttribute("tabindex")).toBe("-1")
    expect(card().getAttribute("aria-labelledby")).toBe(heading.id)
    expect(card().querySelector('[data-variant="tiles"]')?.children).toHaveLength(5)
    expect(card().querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(within(card()).queryByText("Not set up")).toBeNull()
    expect(within(card()).queryByRole("button")).toBeNull()
    await act(async () => release())
    await within(card()).findByText("Not set up")
    expect(within(card()).getByRole("heading", { name: TITLE })).toBe(heading)
    expect(frameReady).toHaveBeenCalledWith("authenticator")
  })

  it("shares one identity request, excludes itself from registry/drafts and does not steal focus on updates", async () => {
    const requests: string[] = []
    server.events.on("request:start", ({ request }) => requests.push(new URL(request.url).pathname))
    const result = renderInPage(<><SharedReader /><AuthenticatorSection /></>, { page: "account" })
    await within(card()).findByText("Not set up")
    expect(requests).toEqual([MYSELF])
    expect(result.registry.getDirtyCount()).toBe(0)
    expect(result.registry.getAll().map(({ id }) => id)).not.toContain("authenticator")
    expect(within(card()).queryByRole("button", { name: /Save|Edit/ })).toBeNull()
    const action = screen.getByRole("button", { name: "External update" })
    await userEvent.setup().click(action)
    await within(card()).findByText("Enabled")
    expect(document.activeElement).toBe(action)
    expect(requests).toEqual([MYSELF])
  })

  it.each([
    { status: 400, body: { message: "Private diagnostic" } },
    { status: 403, body: { errorCode: "NOT_ALLOWED", source: "proxy" } },
  ])("shows ordinary read errors and recovers only myself (%s)", async ({ status, body }) => {
    const requests: string[] = []
    let failed = true
    server.events.on("request:start", ({ request }) => requests.push(new URL(request.url).pathname))
    renderInPage(<AuthenticatorSection />, { page: "account", handlers: [http.get(MYSELF, () => HttpResponse.json(failed ? body : myselfWire(), { status: failed ? status : 200 }))] })
    await within(card()).findByText(ERROR)
    expect(within(card()).queryByText("Not set up")).toBeNull()
    expect(within(card()).queryByText("Private diagnostic")).toBeNull()
    expect(within(card()).queryByText("You don't have access to this in your current account")).toBeNull()
    expect(within(card()).queryByRole("button", { name: /^Link / })).toBeNull()
    failed = false
    await userEvent.setup().click(within(card()).getByRole("button", { name: "Retry" }))
    await within(card()).findByText("Not set up")
    expect(requests.filter((path) => path !== "/api/session/ping")).toEqual([MYSELF, MYSELF])
  })

  it("re-announces each settled failed Retry with unchanged copy", async () => {
    let release!: () => void
    let calls = 0
    renderInPage(<AuthenticatorSection />, { page: "account", handlers: [http.get(MYSELF, async () => {
      calls++
      if (calls > 1) await new Promise<void>((resolve) => { release = resolve })
      return HttpResponse.json({}, { status: 400 })
    })] })
    let alert = await within(card()).findByRole("alert")
    for (const count of [2, 3]) {
      await userEvent.setup().click(within(card()).getByRole("button", { name: "Retry" }))
      await waitFor(() => expect(calls).toBe(count))
      expect(within(card()).getByRole("alert")).toBe(alert)
      await act(async () => release())
      await waitFor(() => expect(within(card()).getByRole("alert")).not.toBe(alert))
      alert = within(card()).getByRole("alert")
      expect(alert.textContent).toBe(ERROR)
    }
  })

  it.each(["Retry", "another control", "another control then body", "nonfocusable content"])("recovers a held Retry with focus owned by %s", async (destination) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const user = userEvent.setup()
    renderInPage(<><AuthenticatorSection /><button>Elsewhere</button><p>Other content</p></>, {
      page: "account", handlers: [http.get(MYSELF, async () => {
        calls++
        if (calls === 1) return HttpResponse.json({}, { status: 400 })
        await gate
        return HttpResponse.json(myselfWire())
      })],
    })
    const retry = await within(card()).findByRole("button", { name: "Retry" })
    await user.click(retry)
    await waitFor(() => expect(calls).toBe(2))
    if (destination === "nonfocusable content") await user.click(screen.getByText("Other content"))
    else if (destination !== "Retry") act(() => {
      screen.getByRole("button", { name: "Elsewhere" }).focus()
      if (destination === "another control then body") (document.activeElement as HTMLElement).blur()
    })
    const chosen = document.activeElement
    await act(async () => release())
    await within(card()).findByText("Not set up")
    expect(document.activeElement).toBe(destination === "Retry" ? within(card()).getByRole("heading", { name: TITLE }) : chosen)
    expect(calls).toBe(2)
  })

  it("does not claim another control's focus for a virtual Retry activation", async () => {
    let calls = 0
    renderInPage(<><AuthenticatorSection /><button>Elsewhere</button></>, { page: "account", handlers: [http.get(MYSELF, () => {
      calls++
      return calls === 1 ? HttpResponse.json({}, { status: 400 }) : HttpResponse.json(myselfWire())
    })] })
    const retry = await within(card()).findByRole("button", { name: "Retry" })
    const outside = screen.getByRole("button", { name: "Elsewhere" })
    act(() => { outside.focus(); retry.click() })
    await within(card()).findByText("Not set up")
    expect(document.activeElement).toBe(outside)
  })

  it("releases a failed Retry's focus ownership before a background recovery", async () => {
    let replaceIdentity!: () => Promise<void>
    function BackgroundIdentity() {
      const { mutate } = useSWRConfig()
      useEffect(() => { replaceIdentity = async () => { await mutate(keys.myself(), toMyself(myselfWire()), false) } }, [mutate])
      return null
    }
    renderInPage(<><AuthenticatorSection /><BackgroundIdentity /></>, { page: "account", handlers: [http.get(MYSELF, () => HttpResponse.json({}, { status: 400 }))] })
    const first = await within(card()).findByRole("alert")
    const retry = within(card()).getByRole("button", { name: "Retry" })
    await userEvent.setup().click(retry)
    await waitFor(() => expect(within(card()).getByRole("alert")).not.toBe(first))
    expect(document.activeElement).toBe(retry)
    await act(replaceIdentity)
    await within(card()).findByText("Not set up")
    expect(document.activeElement).toBe(document.body)
  })

  it("claims the shell error until recovery or unmount", async () => {
    function Harness() {
      const [shown, setShown] = useState(true)
      return <MyselfErrorClaimProvider><Claim />{shown && <AuthenticatorSection />}<button onClick={() => setShown((previous) => !previous)}>Toggle card</button></MyselfErrorClaimProvider>
    }
    function Claim() { return <p aria-label="Claim">{String(useMyselfErrorClaimed())}</p> }
    let failed = true
    renderInPage(<Harness />, { page: "account", handlers: [http.get(MYSELF, () => HttpResponse.json(failed ? {} : myselfWire(), { status: failed ? 400 : 200 }))] })
    await within(card()).findByText(ERROR)
    expect(screen.getByLabelText("Claim").textContent).toBe("true")
    await userEvent.setup().click(screen.getByRole("button", { name: "Toggle card" }))
    expect(screen.getByLabelText("Claim").textContent).toBe("false")
    await userEvent.setup().click(screen.getByRole("button", { name: "Toggle card" }))
    await within(card()).findByText(ERROR)
    expect(screen.getByLabelText("Claim").textContent).toBe("true")
    failed = false
    await userEvent.setup().click(within(card()).getByRole("button", { name: "Retry" }))
    await within(card()).findByText("Not set up")
    expect(screen.getByLabelText("Claim").textContent).toBe("false")
  })

  it("leaves expired sessions to the shell", async () => {
    renderInPage(<AuthenticatorSection />, { page: "account", myself: { status: 401, body: { errorCode: "SESSION_EXPIRED", source: "proxy" } } })
    await waitFor(() => expect(card().querySelector('[data-slot="state-frame"]')).toBeNull())
    expect(within(card()).queryByRole("button")).toBeNull()
    expect(within(card()).queryByText(ERROR)).toBeNull()
    expect(within(card()).getByRole("heading", { name: TITLE })).toBeTruthy()
  })
})

