import { SWRConfig } from "swr"
import { StrictMode, useState } from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse, type HttpHandler } from "msw"
import { beforeEach, expect, it, vi } from "vitest"
import { toastSuccess, useMyself, type FrameState } from "@/features/shell"
import { sessionEvents } from "@/lib/api"
import { MFA_MESSAGES } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { AuthenticatorSection } from "./authenticator-section"
import { AuthenticatorLinkDialog } from "./authenticator-link-dialog"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(), toastPartial: vi.fn() }))
const DISABLE = "/api/1h/v2/mfa/disable/totp"
const MYSELF = "/api/1h/v2/user/myself"
const trigger = () => screen.getByRole("button", { name: "Disable" })
const confirm = () => screen.getByRole("button", { name: "Turn off" })
const heading = () => screen.getByRole("heading", { name: "Authenticator app" })
const tile = () => screen.getByRole("button", { name: "Link Google" })
function setup(handlers: HttpHandler[] = []) {
  return renderInPage(<StrictMode><AuthenticatorSection /></StrictMode>, { page: "account", myself: myselfWire({ mfaEnabled: true, totpEnabled: true }), handlers })
}
async function open() {
  await screen.findByText("Enabled")
  fireEvent.click(trigger())
  await screen.findByRole("alertdialog", { name: MFA_MESSAGES.disableTitle })
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBe(document.activeElement))
}
beforeEach(() => { stubLayoutApis(); vi.mocked(toastSuccess).mockClear() })

it.each(["Cancel", "Escape", "overlay"])("confirms explicitly and cancels via %s without mutation", async (action) => {
  let calls = 0
  setup([http.post(DISABLE, () => { calls++; return new HttpResponse(null) })])
  await open()
  expect(screen.getByText(MFA_MESSAGES.disableBody)).toBeTruthy()
  expect(calls).toBe(0)
  expect(await axeViolations()).toEqual([])
  if (action === "Escape") await userEvent.setup().keyboard("{Escape}")
  else if (action === "overlay") {
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')!
    await userEvent.setup().click(overlay)
  } else fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  expect(document.activeElement).toBe(trigger())
  expect(calls).toBe(0)
})

it("single-flights disable and keeps both flows inert through authoritative reconciliation", async () => {
  let release!: () => void
  let releaseRead!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const readGate = new Promise<void>((resolve) => { releaseRead = resolve })
  let linked = true
  let calls = 0
  let heldReads = 0
  setup([
    http.post(DISABLE, async ({ request }) => { calls++; expect(await request.text()).toBe(""); expect(new URL(request.url).search).toBe(""); await gate; linked = false; return new HttpResponse(null, { status: 200 }) }),
    http.get(MYSELF, async () => { if (!linked) { heldReads++; await readGate }; return HttpResponse.json(myselfWire({ mfaEnabled: true, totpEnabled: linked })) }),
  ])
  await open()
  fireEvent.click(confirm()); fireEvent.click(confirm())
  await waitFor(() => expect(calls).toBe(1))
  expect(confirm().getAttribute("aria-busy")).toBe("true")
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await userEvent.setup().keyboard("{Escape}")
  expect(screen.getByRole("alertdialog")).toBeTruthy()
  await act(async () => release())
  await waitFor(() => expect(heldReads).toBe(1))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  expect(document.activeElement).toBe(heading())
  expect(screen.getByText("Enabled")).toBeTruthy()
  fireEvent.click(trigger()); fireEvent.click(tile())
  expect(screen.queryByRole("alertdialog")).toBeNull()
  expect(tile().getAttribute("aria-disabled")).toBe("true")
  await act(async () => releaseRead())
  await screen.findByText("Not set up")
  await waitFor(() => expect(tile().hasAttribute("aria-disabled")).toBe(false))
  expect(calls).toBe(1)
  expect(toastSuccess).toHaveBeenCalledWith(MFA_MESSAGES.disabled)
})

it.each([
  { status: 400, body: { message: "Totp is already disabled." }, text: "Totp is already disabled." },
  { status: 400, body: { message: "Mfa config is missing." }, text: MFA_MESSAGES.disableFailed },
  { status: 429, body: { message: "Too many requests" }, text: "Too many requests" },
  { status: 500, body: { message: "Private upstream text" }, text: MFA_MESSAGES.disableFailed },
  { status: 504, body: {}, text: MFA_MESSAGES.disableFailed },
  { status: 403, body: { errorCode: "NOT_ALLOWED", source: "proxy" }, text: MFA_MESSAGES.disableFailed },
  { status: 0, body: {}, text: MFA_MESSAGES.disableFailed },
])("maps $status and reconciles without replay or notice focus theft", async ({ status, body, text }) => {
  let calls = 0
  let reads = 0
  setup([
    http.post(DISABLE, () => { calls++; return status ? HttpResponse.json(body, { status }) : HttpResponse.error() }),
    http.get(MYSELF, () => { reads++; return HttpResponse.json(myselfWire({ totpEnabled: true })) }),
  ])
  await open()
  const before = reads
  fireEvent.click(confirm())
  await screen.findByText(text)
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger()))
  await waitFor(() => expect(reads).toBeGreaterThan(before))
  expect(screen.queryByText("Private upstream text")).toBeNull()
  expect(calls).toBe(1)
  expect(toastSuccess).not.toHaveBeenCalled()
})

it("scopes upstream denial to the card", async () => {
  setup([http.post(DISABLE, () => HttpResponse.json({ message: "Denied" }, { status: 403 }))])
  await open(); fireEvent.click(confirm())
  await screen.findByText("You don't have access to this in your current account")
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  expect(document.activeElement).toBe(heading())
  expect(screen.queryByText(MFA_MESSAGES.disableFailed)).toBeNull()
})

it.each(["pagehide", "unmount", "session"])("discards stale outcomes after %s and preserves the request gate", async (cause) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  let reads = 0
  let linked = true
  const result = setup([
    http.post(DISABLE, async () => { calls++; await gate; linked = false; return new HttpResponse(null) }),
    http.get(MYSELF, () => { reads++; return HttpResponse.json(myselfWire({ totpEnabled: linked })) }),
  ])
  await open(); fireEvent.click(confirm())
  await waitFor(() => expect(calls).toBe(1))
  if (cause === "unmount") result.unmount()
  else if (cause === "session") act(() => sessionEvents.publish("session-expired"))
  else act(() => window.dispatchEvent(new Event("pagehide")))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  const before = reads
  if (cause === "pagehide") {
    expect(trigger().getAttribute("aria-busy")).toBe("true")
    fireEvent.click(trigger()); fireEvent.click(tile())
    expect(screen.queryByRole("alertdialog")).toBeNull()
  }
  await act(async () => release())
  if (cause === "pagehide") { await screen.findByText("Not set up"); expect(reads).toBeGreaterThan(before) }
  expect(toastSuccess).not.toHaveBeenCalled()
  expect(calls).toBe(1)
})

it.each(["linked", "read"])("invalidates pending disable after external %s change and blocks enrollment until settlement", async (change) => {
  let update!: () => void
  let restore!: () => void
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  function Harness() {
    const { myself } = useMyself()
    const [changed, setChanged] = useState(false)
    update = () => setChanged(true)
    restore = () => setChanged(false)
    const state: FrameState = changed && change === "read" ? { error: { kind: "generic" } } : "ready"
    return <><p>{myself ? "Identity loaded" : "Loading"}</p><AuthenticatorLinkDialog cardProps={{ state, linked: change === "linked" ? !changed : true, onRetry: vi.fn() }} onFailure={vi.fn()} /></>
  }
  renderInPage(<Harness />, { page: "account", myself: myselfWire(), handlers: [http.post(DISABLE, async () => { calls++; await gate; return new HttpResponse(null) })] })
  await screen.findByText("Identity loaded")
  await open(); fireEvent.click(confirm())
  await waitFor(() => expect(calls).toBe(1))
  act(update)
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  if (change === "linked") { expect(tile().getAttribute("aria-disabled")).toBe("true"); fireEvent.click(tile()) }
  else { act(restore); fireEvent.click(trigger()); expect(screen.queryByRole("alertdialog")).toBeNull() }
  await act(async () => release())
  expect(toastSuccess).not.toHaveBeenCalled()
  expect(calls).toBe(1)
})

it("recovers heading focus when a failed mutation refresh removes Disable", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let linked = true
  setup([
    http.post(DISABLE, () => { linked = false; return HttpResponse.json({ message: "Already disabled" }, { status: 400 }) }),
    http.get(MYSELF, async () => { if (!linked) await gate; return HttpResponse.json(myselfWire({ totpEnabled: linked })) }),
  ])
  await open(); fireEvent.click(confirm())
  await screen.findByText("Already disabled")
  await waitFor(() => expect(document.activeElement).toBe(trigger()))
  await act(async () => release())
  await screen.findByText("Not set up")
  await waitFor(() => expect(document.activeElement).toBe(heading()))
})

it("does not steal transferred session focus when a held disable settles", async () => {
  let release!: () => void
  let calls = 0
  const gate = new Promise<void>((resolve) => { release = resolve })
  renderInPage(<><button>Session action</button><AuthenticatorSection /></>, { page: "account", myself: myselfWire({ totpEnabled: true }), handlers: [http.post(DISABLE, async () => { calls++; await gate; return new HttpResponse(null) })] })
  await open(); fireEvent.click(confirm())
  await waitFor(() => expect(calls).toBe(1))
  act(() => sessionEvents.publish("session-expired"))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  act(() => screen.getByText("Session action").focus())
  await act(async () => release())
  expect(document.activeElement).toBe(screen.getByText("Session action"))
  expect(toastSuccess).not.toHaveBeenCalled()
})

it("keeps disable coordinated across actual card remount and permits enrollment after the late authoritative read", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let linked = true
  let disables = 0
  let enables = 0
  function Harness() {
    const [visible, setVisible] = useState(true)
    useMyself()
    return <><button onClick={() => setVisible((value) => !value)}>Toggle card</button>{visible && <AuthenticatorSection />}</>
  }
  renderInPage(<Harness />, { page: "account", myself: myselfWire({ totpEnabled: true }), handlers: [
    http.get(MYSELF, () => HttpResponse.json(myselfWire({ totpEnabled: linked }))),
    http.post(DISABLE, async () => { disables++; await gate; linked = false; return new HttpResponse(null) }),
    http.post("/api/1h/v2/mfa/enable/totp", () => { enables++; return HttpResponse.json({ qrCode: "data:image/png;base64,aGVsbG8=" }) }),
  ] })
  await open(); fireEvent.click(confirm())
  await waitFor(() => expect(disables).toBe(1))
  const user = userEvent.setup()
  await user.click(screen.getByText("Toggle card")); await user.click(screen.getByText("Toggle card"))
  await screen.findByText("Enabled")
  expect(trigger().getAttribute("aria-busy")).toBe("true")
  // Deliberate raw dispatch stress-tests the coordinator beyond native aria-disabled event blocking.
  fireEvent.click(trigger())
  expect(screen.queryByRole("alertdialog")).toBeNull()
  await act(async () => release())
  await screen.findByText("Not set up")
  expect(toastSuccess).not.toHaveBeenCalled()
  await user.click(tile())
  await screen.findByRole("dialog", { name: "Link your Google authenticator" })
  expect(enables).toBe(1)
  expect(disables).toBe(1)
})

it("keeps actions blocked after terminal reconciliation failure until successful manual Retry", async () => {
  let linked = true
  let failed = false
  let releaseRead!: () => void
  const gate = new Promise<void>((resolve) => { releaseRead = resolve })
  let heldReads = 0
  setup([
    http.post(DISABLE, () => { linked = false; failed = true; return new HttpResponse(null) }),
    http.get(MYSELF, async () => {
      if (failed) return HttpResponse.json({}, { status: 500 })
      if (!linked) { heldReads++; await gate }
      return HttpResponse.json(myselfWire({ totpEnabled: linked }))
    }),
  ])
  await open(); fireEvent.click(confirm())
  await screen.findByRole("button", { name: "Retry" })
  failed = false
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }))
  await waitFor(() => expect(heldReads).toBe(1))
  // Cached linked data must never open a new confirmation while Retry remains outstanding.
  expect(screen.queryByRole("alertdialog")).toBeNull()
  await act(async () => releaseRead())
  await screen.findByText("Not set up")
  await waitFor(() => expect(tile().hasAttribute("aria-disabled")).toBe(false))
})

it("relinquishes delayed focus recovery after a non-focusable pointer interaction", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let linked = true
  renderInPage(<><p>Outside copy</p><AuthenticatorSection /></>, { page: "account", myself: myselfWire({ totpEnabled: true }), handlers: [
    http.post(DISABLE, () => { linked = false; return HttpResponse.json({ message: "Already disabled" }, { status: 400 }) }),
    http.get(MYSELF, async () => { if (!linked) await gate; return HttpResponse.json(myselfWire({ totpEnabled: linked })) }),
  ] })
  await open(); fireEvent.click(confirm())
  await screen.findByText("Already disabled")
  await waitFor(() => expect(document.activeElement).toBe(trigger()))
  await userEvent.setup().click(screen.getByText("Outside copy"))
  expect(document.activeElement).toBe(document.body)
  await act(async () => release())
  await screen.findByText("Not set up")
  expect(document.activeElement).toBe(document.body)
})


it("retains the disable gate while cached status hides an automatic reconciliation retry", async () => {
  let linked = true
  let readsAfterDisable = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  renderInPage(<SWRConfig value={{ errorRetryCount: 1, errorRetryInterval: 1 }}><AuthenticatorSection /></SWRConfig>, { page: "account", myself: myselfWire({ totpEnabled: true }), handlers: [
    http.post(DISABLE, () => { linked = false; return new HttpResponse(null) }),
    http.get(MYSELF, async () => {
      if (!linked) {
        readsAfterDisable++
        if (readsAfterDisable === 1) return HttpResponse.json({}, { status: 500 })
        await gate
      }
      return HttpResponse.json(myselfWire({ totpEnabled: linked }))
    }),
  ] })
  await open(); fireEvent.click(confirm())
  await waitFor(() => expect(readsAfterDisable).toBe(2))
  expect(trigger().getAttribute("aria-busy")).toBe("true")
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
  // Stress repeated activation while SWR deliberately displays its old ready status.
  fireEvent.click(trigger())
  expect(screen.queryByRole("alertdialog")).toBeNull()
  await act(async () => release())
  await screen.findByText("Not set up")
  await waitFor(() => expect(tile().hasAttribute("aria-disabled")).toBe(false))
  await waitFor(() => expect(document.activeElement).toBe(heading()))
})

it("retains enrollment request coordination across card remount without caching its QR", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let enables = 0
  function Harness() {
    const [visible, setVisible] = useState(true)
    useMyself()
    return <><button onClick={() => setVisible((value) => !value)}>Toggle card</button>{visible && <AuthenticatorSection />}</>
  }
  renderInPage(<Harness />, { page: "account", myself: myselfWire({ totpEnabled: false }), handlers: [http.post("/api/1h/v2/mfa/enable/totp", async () => {
    enables++
    if (enables === 1) await gate
    return HttpResponse.json({ qrCode: "data:image/png;base64,aGVsbG8=" })
  })] })
  await screen.findByText("Not set up")
  const user = userEvent.setup()
  await user.click(tile())
  await waitFor(() => expect(enables).toBe(1))
  await user.click(screen.getByText("Toggle card")); await user.click(screen.getByText("Toggle card"))
  await screen.findByText("Not set up")
  expect(tile().getAttribute("aria-busy")).toBe("true")
  fireEvent.click(tile())
  expect(enables).toBe(1)
  await act(async () => release())
  await waitFor(() => expect(tile().hasAttribute("aria-disabled")).toBe(false))
  expect(screen.queryByRole("dialog")).toBeNull()
  await user.click(tile())
  await screen.findByRole("dialog", { name: "Link your Google authenticator" })
  expect(enables).toBe(2)
})


it("recovers heading focus after failed disable and a later successful automatic read retry removes its trigger", async () => {
  let linked = true
  let reads = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  renderInPage(<SWRConfig value={{ errorRetryCount: 1, errorRetryInterval: 1 }}><AuthenticatorSection /></SWRConfig>, { page: "account", myself: myselfWire({ totpEnabled: true }), handlers: [
    http.post(DISABLE, () => { linked = false; return HttpResponse.json({ message: "Already disabled" }, { status: 400 }) }),
    http.get(MYSELF, async () => {
      if (!linked) {
        if (++reads === 1) return HttpResponse.json({}, { status: 500 })
        await gate
      }
      return HttpResponse.json(myselfWire({ totpEnabled: linked }))
    }),
  ] })
  await open(); fireEvent.click(confirm())
  await waitFor(() => expect(reads).toBe(2))
  await waitFor(() => expect(document.activeElement).toBe(trigger()))
  await act(async () => release())
  await screen.findByText("Not set up")
  await waitFor(() => expect(document.activeElement).toBe(heading()))
})

it("relinquishes delayed heading recovery after deliberate programmatic focus transfer", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let linked = true
  renderInPage(<><button>Outside action</button><AuthenticatorSection /></>, { page: "account", myself: myselfWire({ totpEnabled: true }), handlers: [
    http.post(DISABLE, () => { linked = false; return HttpResponse.json({ message: "Already disabled" }, { status: 400 }) }),
    http.get(MYSELF, async () => { if (!linked) await gate; return HttpResponse.json(myselfWire({ totpEnabled: linked })) }),
  ] })
  await open(); fireEvent.click(confirm())
  await screen.findByText("Already disabled")
  await waitFor(() => expect(document.activeElement).toBe(trigger()))
  act(() => screen.getByText("Outside action").focus())
  await act(async () => release())
  await screen.findByText("Not set up")
  expect(document.activeElement).toBe(screen.getByText("Outside action"))
})
