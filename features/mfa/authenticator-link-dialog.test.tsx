import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse, type HttpHandler } from "msw"
import { useSWRConfig } from "swr"
import { StrictMode, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toastSuccess, useMyself, type FrameState } from "@/features/shell"
import { sessionEvents } from "@/lib/api"
import { setTelemetrySink } from "@/lib/shared/telemetry"
import { MFA_MESSAGES } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { AuthenticatorLinkDialog } from "./authenticator-link-dialog"
import { AuthenticatorSection } from "./authenticator-section"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(), toastPartial: vi.fn() }))
const ENABLE = "/api/1h/v2/mfa/enable/totp"
const VALIDATE = "/api/pp/mfa/validate"
const MYSELF = "/api/1h/v2/user/myself"
const QR = "data:image/png;base64,aGVsbG8="
const tile = (name = "Microsoft") => screen.getByRole("button", { name: `Link ${name}` })
const dialog = () => screen.getByRole("dialog")
const codeField = () => screen.getByRole("textbox", { name: "6-digit code" })
const submit = () => screen.getByRole("button", { name: "Submit" })
const heading = () => screen.getByRole("heading", { name: "Authenticator app" })
function setup(handlers: HttpHandler[] = [], strict = false) {
  return renderInPage(strict ? <StrictMode><AuthenticatorSection /></StrictMode> : <AuthenticatorSection />, { page: "account", myself: myselfWire({ mfaEnabled: true, totpEnabled: false }), handlers: [...handlers, http.post(ENABLE, () => HttpResponse.json({ qrCode: QR }))] })
}
async function open() {
  await screen.findByText("Not set up")
  await userEvent.setup().click(tile())
  await screen.findByRole("dialog", { name: "Link your Microsoft authenticator" })
  await waitFor(() => expect(document.activeElement).toBe(codeField()))
}
beforeEach(() => { stubLayoutApis(); vi.mocked(toastSuccess).mockClear(); setTelemetrySink(() => undefined) })

describe("Authenticator enrollment", () => {
  it("starts once from activation in StrictMode, makes other tiles inert, and focuses the field after a held request", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    setup([http.post(ENABLE, async () => { calls++; await gate; return HttpResponse.json({ qrCode: QR }) })], true)
    await screen.findByText("Not set up")
    expect(calls).toBe(0)
    const user = userEvent.setup()
    await user.click(tile())
    await waitFor(() => expect(calls).toBe(1))
    expect(tile().getAttribute("aria-busy")).toBe("true")
    for (const name of ["Google", "Microsoft", "Authy", "DUO", "Android OTP"]) {
      const button = tile(name)
      expect(button.getAttribute("aria-disabled")).toBe("true")
      fireEvent.click(button)
      fireEvent.keyDown(button, { key: "Enter" })
    }
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => tile("Google").focus())
    await act(async () => release())
    await screen.findByRole("dialog")
    await waitFor(() => expect(document.activeElement).toBe(codeField()))
    expect(calls).toBe(1)
    expect(dialog().getAttribute("data-fullscreen-mobile")).toBe("true")
    expect(within(dialog()).getByAltText(MFA_MESSAGES.qrAlt).getAttribute("src")).toBe(QR)
    expect(await axeViolations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(document.activeElement).toBe(tile()))
  })

  it("sanitizes typed and pasted input and rejects short submissions without sending", async () => {
    let calls = 0
    setup([http.post(VALIDATE, () => { calls++; return HttpResponse.json(false) })])
    await open()
    const user = userEvent.setup()
    expect(submit().getAttribute("aria-disabled")).toBeNull()
    await user.click(submit())
    expect(await screen.findByText(MFA_MESSAGES.codeRequired)).toBeTruthy()
    expect(document.activeElement).toBe(codeField())
    await user.type(codeField(), "a1b2c3")
    expect(codeField()).toHaveProperty("value", "123")
    await user.clear(codeField())
    await user.paste("12a 34-56 78")
    expect(codeField()).toHaveProperty("value", "123456")
    expect(calls).toBe(0)
    expect(codeField().getAttribute("aria-describedby")).toBeTruthy()
  })

  it("retains QR on invalid codes, counts outcomes per opening, links and refreshes shared status", async () => {
    let enables = 0
    let validations = 0
    let linked = false
    const events = vi.fn()
    setTelemetrySink(events)
    setup([
      http.post(ENABLE, () => { enables++; return HttpResponse.json({ qrCode: QR }) }),
      http.post(VALIDATE, async ({ request }) => { expect(new URL(request.url).search).toBe(""); expect(await request.json()).toEqual({ code: "123456" }); linked = ++validations > 1; return HttpResponse.json(linked) }),
      http.get(MYSELF, () => HttpResponse.json(myselfWire({ totpEnabled: linked }))),
    ])
    await open()
    const user = userEvent.setup()
    const qr = within(dialog()).getByAltText(MFA_MESSAGES.qrAlt)
    await user.type(codeField(), "123456{Enter}")
    await screen.findByText(MFA_MESSAGES.codeInvalid)
    expect(codeField()).toHaveProperty("value", "")
    expect(document.activeElement).toBe(codeField())
    expect(within(dialog()).getByAltText(MFA_MESSAGES.qrAlt)).toBe(qr)
    await user.type(codeField(), "123456")
    await user.click(submit())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await screen.findByText("Enabled")
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(enables).toBe(1)
    expect(events.mock.calls).toEqual([["mfa_link", { ok: false, attempt: 1 }], ["mfa_link", { ok: true, attempt: 2 }]])
    expect(toastSuccess).toHaveBeenCalledWith("Microsoft authenticator linked")
    setTelemetrySink(() => undefined)
  })

  it.each(["Cancel", "Escape", "Close"])("clears on %s, refreshes, restores the activating tile and reopens with a fresh QR", async (action) => {
    let enables = 0
    let reads = 0
    setup([
      http.post(ENABLE, () => { enables++; return HttpResponse.json({ qrCode: enables === 1 ? QR : "data:image/png;base64,bmV3" }) }),
      http.get(MYSELF, () => { reads++; return HttpResponse.json(myselfWire()) }),
    ])
    await open()
    const user = userEvent.setup()
    await user.type(codeField(), "123")
    const readsBeforeDismissal = reads
    if (action === "Escape") await user.keyboard("{Escape}")
    else await user.click(screen.getByRole("button", { name: action }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(tile()))
    expect(document.querySelector(`img[src="${QR}"]`)).toBeNull()
    await waitFor(() => expect(reads).toBeGreaterThan(readsBeforeDismissal))
    await user.click(tile())
    await screen.findByRole("dialog")
    expect(codeField()).toHaveProperty("value", "")
    expect(within(dialog()).getByAltText(MFA_MESSAGES.qrAlt).getAttribute("src")).toBe("data:image/png;base64,bmV3")
    expect(enables).toBe(2)
  })

  it.each(["Mfa is not enabled for this user.", "Mfa config is missing."])("focuses and repeats the base-MFA notice for %s", async (message) => {
    let calls = 0
    setup([http.post(ENABLE, () => { calls++; return HttpResponse.json({ message }, { status: 400 }) })])
    await screen.findByText("Not set up")
    const user = userEvent.setup()
    for (let count = 1; count <= 2; count++) {
      await user.click(tile())
      const message = await screen.findByText(MFA_MESSAGES.baseUnavailable)
      await waitFor(() => expect(document.activeElement).toBe(message.parentElement))
      expect(tile().hasAttribute("aria-disabled")).toBe(false)
      expect(calls).toBe(count)
      expect(screen.queryByRole("dialog")).toBeNull()
    }
  })

  it("reconciles an already-linked rejection without opening a dialog", async () => {
    let linked = false
    setup([
      http.post(ENABLE, () => { linked = true; return HttpResponse.json({ message: "Totp is already enabled." }, { status: 400 }) }),
      http.get(MYSELF, () => HttpResponse.json(myselfWire({ totpEnabled: linked }))),
    ])
    await screen.findByText("Not set up")
    await userEvent.setup().click(tile())
    await screen.findByText("Enabled")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it.each([
    { status: 429, body: { message: "Too many requests" }, text: "Too many requests" },
    { status: 500, body: { message: "Private error" }, text: MFA_MESSAGES.startFailed },
    { status: 403, body: { errorCode: "NOT_ALLOWED", source: "proxy" }, text: MFA_MESSAGES.startFailed },
  ])("maps enable $status without retry", async ({ status, body, text }) => {
    let calls = 0
    setup([http.post(ENABLE, () => { calls++; return HttpResponse.json(body, { status }) })])
    await screen.findByText("Not set up")
    await userEvent.setup().click(tile())
    await screen.findByText(text)
    expect(screen.queryByText("Private error")).toBeNull()
    expect(calls).toBe(1)
    expect(tile().hasAttribute("aria-disabled")).toBe(false)
  })

  it.each([ENABLE, VALIDATE])("scopes upstream permission denial from %s to the card", async (path) => {
    setup([http.post(path, () => HttpResponse.json({ message: "Denied" }, { status: 403 }))])
    if (path === VALIDATE) { await open(); await userEvent.setup().type(codeField(), "123456{Enter}") }
    else { await screen.findByText("Not set up"); await userEvent.setup().click(tile()) }
    await screen.findByText("You don't have access to this in your current account")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByRole("button", { name: "Link Microsoft" })).toBeNull()
    if (path === ENABLE) expect(document.activeElement).toBe(heading())
  })

  it.each([429, 500])("retains code and QR after validation %i without retry", async (status) => {
    let calls = 0
    setup([http.post(VALIDATE, () => { calls++; return HttpResponse.json({ message: "Too many requests" }, { status }) })])
    await open()
    await userEvent.setup().type(codeField(), "123456{Enter}")
    await screen.findByText(status === 429 ? "Too many requests" : MFA_MESSAGES.validateFailed)
    expect(codeField()).toHaveProperty("value", "123456")
    expect(within(dialog()).getByAltText(MFA_MESSAGES.qrAlt).getAttribute("src")).toBe(QR)
    expect(calls).toBe(1)
  })

  it("gates concurrent validation and prevents every dismissal while busy", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    setup([http.post(VALIDATE, async () => { calls++; await gate; return HttpResponse.json(false) })])
    await open()
    const user = userEvent.setup()
    await user.type(codeField(), "123456{Enter}")
    await waitFor(() => expect(calls).toBe(1))
    await user.click(submit())
    fireEvent.submit(codeField().closest("form")!)
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(dialog()).toBeTruthy()
    expect(calls).toBe(1)
    await act(async () => release())
    await screen.findByText(MFA_MESSAGES.codeInvalid)
  })

  it.each(["pagehide", "unmount", "session"])("discards a held enable response after %s", async (cause) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const result = setup([http.post(ENABLE, async () => { calls++; await gate; return HttpResponse.json({ qrCode: QR }) })])
    await screen.findByText("Not set up")
    await userEvent.setup().click(tile())
    await waitFor(() => expect(calls).toBe(1))
    if (cause === "unmount") result.unmount()
    else if (cause === "pagehide") act(() => window.dispatchEvent(new Event("pagehide")))
    else act(() => sessionEvents.publish("session-expired"))
    await act(async () => release())
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.querySelector(`img[src="${QR}"]`)).toBeNull()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it.each(["pagehide", "session", "unmount"])("clears an open dialog and suppresses held validation after %s", async (cause) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const events = vi.fn()
    setTelemetrySink(events)
    const result = setup([http.post(VALIDATE, async () => { calls++; await gate; return HttpResponse.json(true) })])
    await open()
    await userEvent.setup().type(codeField(), "123456{Enter}")
    await waitFor(() => expect(calls).toBe(1))
    if (cause === "unmount") result.unmount()
    else if (cause === "pagehide") act(() => window.dispatchEvent(new Event("pagehide")))
    else act(() => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await act(async () => release())
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(events).not.toHaveBeenCalled()
    expect(document.querySelector(`img[src="${QR}"]`)).toBeNull()
    setTelemetrySink(() => undefined)
  })

  it("keeps the complete enrollment out of caches, storage, URLs and console output", async () => {
    let inspectCache = (): string => ""
    function CacheProbe() {
      const { cache } = useSWRConfig()
      inspectCache = () => JSON.stringify([...cache.keys()].map((key) => [key, cache.get(key)]))
      return null
    }
    vi.stubEnv("NODE_ENV", "development")
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    const end = vi.spyOn(console, "groupEnd").mockImplementation(() => undefined)
    const storageWrites = vi.spyOn(Storage.prototype, "setItem")
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined)
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const events = vi.fn()
    const restoreTelemetry = setTelemetrySink(events)
    const beforeLocal = JSON.stringify(localStorage)
    const beforeSession = JSON.stringify(sessionStorage)
    let validations = 0
    renderInPage(<><AuthenticatorSection /><CacheProbe /></>, { page: "account", myself: myselfWire(), handlers: [
      http.post(ENABLE, () => HttpResponse.json({ qrCode: QR })),
      http.post(VALIDATE, () => HttpResponse.json(++validations > 1)),
    ] })
    await open()
    const assertPrivate = (): void => {
      const output = JSON.stringify({ cache: inspectCache(), storageWrites: storageWrites.mock.calls, logs: [group.mock.calls, log.mock.calls, debug.mock.calls, error.mock.calls], events: events.mock.calls, url: window.location.href })
      expect(output).not.toContain(QR)
      expect(output).not.toContain("123456")
      expect(JSON.stringify(localStorage)).toBe(beforeLocal)
      expect(JSON.stringify(sessionStorage)).toBe(beforeSession)
    }
    try {
      const user = userEvent.setup()
      await user.type(codeField(), "123456")
      assertPrivate()
      await user.click(submit())
      await screen.findByText(MFA_MESSAGES.codeInvalid)
      assertPrivate()
      await user.type(codeField(), "123456{Enter}")
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
      assertPrivate()
      expect(events.mock.calls).toEqual([["mfa_link", { ok: false, attempt: 1 }], ["mfa_link", { ok: true, attempt: 2 }]])
      expect(group.mock.calls.some(([label]) => String(label).includes(`POST ${ENABLE}`))).toBe(true)
      expect(group.mock.calls.some(([label]) => String(label).includes(`POST ${VALIDATE}`))).toBe(true)
      expect(log).toHaveBeenCalledWith("response", { qrCode: "[redacted]" })
      expect(log).toHaveBeenCalledWith("request", { code: "[redacted]" })
    } finally {
      restoreTelemetry()
      vi.unstubAllEnvs()
      group.mockRestore()
      end.mockRestore()
      storageWrites.mockRestore()
      log.mockRestore()
      debug.mockRestore()
      error.mockRestore()
    }
  })


  it("retains enable coordination across pagehide until settlement, then permits a fresh activation", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const latestQr = "data:image/png;base64,bGF0ZXN0"
    setup([http.post(ENABLE, async () => {
      if (++calls === 1) { await gate; return HttpResponse.json({ qrCode: QR }) }
      return HttpResponse.json({ qrCode: latestQr })
    })])
    await screen.findByText("Not set up")
    const user = userEvent.setup()
    await user.click(tile())
    await waitFor(() => expect(calls).toBe(1))
    act(() => window.dispatchEvent(new Event("pagehide")))
    await user.click(tile("Google"))
    expect(calls).toBe(1)
    expect(screen.queryByRole("dialog")).toBeNull()
    await act(async () => release())
    expect(screen.queryByRole("dialog")).toBeNull()
    await user.click(tile("Google"))
    await screen.findByRole("dialog", { name: "Link your Google authenticator" })
    expect(within(dialog()).getByAltText(MFA_MESSAGES.qrAlt).getAttribute("src")).toBe(latestQr)
    expect(calls).toBe(2)
  })

  it("does not focus a pending error notice after session expiry transfers focus", async () => {
    function Identity() {
      const { myself } = useMyself()
      return <p>{myself ? "Identity loaded" : "Identity loading"}</p>
    }
    renderInPage(<>
      <Identity />
      <button>Session action</button>
      <AuthenticatorLinkDialog cardProps={{ state: "ready", linked: false, onRetry: vi.fn() }} onFailure={() => {
        // Reproduce expiry between the response settlement and the notice's passive effect.
        sessionEvents.publish("session-expired")
        screen.getByText("Session action").focus()
      }} />
    </>, { page: "account", myself: myselfWire(), handlers: [http.post(ENABLE, () => HttpResponse.json({}, { status: 500 }))] })
    await screen.findByText("Identity loaded")
    await userEvent.setup().click(tile())
    await screen.findByText(MFA_MESSAGES.startFailed)
    expect(document.activeElement).toBe(screen.getByText("Session action"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("removes the decoding skeleton on load and clears a broken QR without retrying enable", async () => {
    let enables = 0
    setup([http.post(ENABLE, () => { enables++; return HttpResponse.json({ qrCode: QR }) })])
    await open()
    const qr = within(dialog()).getByAltText(MFA_MESSAGES.qrAlt)
    expect(dialog().querySelector('[data-slot="skeleton"]')).toBeTruthy()
    fireEvent.load(qr)
    expect(dialog().querySelector('[data-slot="skeleton"]')).toBeNull()
    await userEvent.setup().type(codeField(), "123456")
    fireEvent.error(qr)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await screen.findByText(MFA_MESSAGES.startFailed)
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(document.querySelector(`img[src="${QR}"]`)).toBeNull()
    expect(enables).toBe(1)
    expect(toastSuccess).not.toHaveBeenCalled()
    await userEvent.setup().click(tile())
    await screen.findByRole("dialog")
    expect(codeField()).toHaveProperty("value", "")
  })

  it("restores the clicked tile even when a browser click leaves another control focused", async () => {
    setup()
    await screen.findByText("Not set up")
    act(() => heading().focus())
    fireEvent.click(tile("Authy"))
    await screen.findByRole("dialog", { name: "Link your Authy authenticator" })
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(document.activeElement).toBe(tile("Authy")))
  })

  it("resets telemetry attempts on reopen and counts transport failures before boolean outcomes", async () => {
    let calls = 0
    const events = vi.fn()
    const restore = setTelemetrySink(events)
    setup([http.post(VALIDATE, () => ++calls === 1 ? HttpResponse.error() : HttpResponse.json(false))])
    try {
      await open()
      const user = userEvent.setup()
      await user.type(codeField(), "123456{Enter}")
      await screen.findByText(MFA_MESSAGES.validateFailed)
      expect(events).not.toHaveBeenCalled()
      await user.click(submit())
      await screen.findByText(MFA_MESSAGES.codeInvalid)
      expect(events.mock.calls).toEqual([["mfa_link", { ok: false, attempt: 2 }]])
      await user.click(screen.getByRole("button", { name: "Cancel" }))
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
      await open()
      await user.type(codeField(), "123456{Enter}")
      await screen.findByText(MFA_MESSAGES.codeInvalid)
      expect(events.mock.calls).toEqual([["mfa_link", { ok: false, attempt: 2 }], ["mfa_link", { ok: false, attempt: 1 }]])
      expect(calls).toBe(3)
    } finally { restore() }
  })

  it.each(["linked", "error", "forbidden", "session"])("clears enrollment and ignores held validation when observed card becomes %s", async (transition) => {
    let update!: () => void
    let release!: () => void
    let calls = 0
    const gate = new Promise<void>((resolve) => { release = resolve })
    const events = vi.fn()
    const restore = setTelemetrySink(events)
    function Harness() {
      const { myself } = useMyself()
      const [observed, setObserved] = useState<{ linked: boolean; state: FrameState }>({ linked: false, state: "ready" })
      update = () => {
        if (transition === "session") {
          sessionEvents.publish("session-expired")
        }
        setObserved(transition === "linked" ? { linked: true, state: "ready" } : { linked: false, state: { error: { kind: transition === "forbidden" ? "forbidden" : transition === "session" ? "session" : "generic" } } })
      }
      return <><p>{myself ? "Identity loaded" : "Loading identity"}</p><button>Session action</button><AuthenticatorLinkDialog cardProps={{ ...observed, onRetry: vi.fn() }} onFailure={vi.fn()} /></>
    }
    renderInPage(<Harness />, { page: "account", myself: myselfWire(), handlers: [
      http.post(ENABLE, () => HttpResponse.json({ qrCode: QR })),
      http.post(VALIDATE, async () => { calls++; await gate; return HttpResponse.json(true) }),
    ] })
    try {
      await screen.findByText("Identity loaded")
      await open()
      await userEvent.setup().type(codeField(), "123456{Enter}")
      await waitFor(() => expect(calls).toBe(1))
      act(update)
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
      expect(document.querySelector(`img[src="${QR}"]`)).toBeNull()
      if (transition === "session") act(() => screen.getByText("Session action").focus())
      await act(async () => release())
      expect(toastSuccess).not.toHaveBeenCalled()
      expect(events).not.toHaveBeenCalled()
      await waitFor(() => expect(document.activeElement).toBe(transition === "session" ? screen.getByText("Session action") : heading()))
    } finally { restore() }
  })

})
