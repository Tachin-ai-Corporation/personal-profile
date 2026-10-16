import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { useEffect, useState } from "react"
import { SWRConfig, unstable_serialize, useSWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AccountSectionPlaceholder, MyselfErrorClaimProvider, useMyself, useMyselfErrorClaimed } from "@/features/shell"
import { keys, toContactPoints, toMyself } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { contactPointWire, myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { AccountSettingsSection } from "./account-settings-section"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

const MYSELF = "/api/1h/v2/user/myself"
const TITLE = "Personal account settings"
const LABELS = [
  "First name", "Last name", "Username", "Password", "Primary email address",
  "Primary phone number", "Birth date", "Preferred language", "Default time zone",
  "Preferred locale for date, time, and currency",
]
const VALUES = [
  "Ann", "Lee", "ann.lee", "********", "ann.lee@example.com", "+1 (415) 555-2671",
  "04/15/1990", "English", "Central", "English - United States",
]

const section = () => screen.getByRole("region", { name: TITLE })
const table = () => screen.getByRole("table", { name: TITLE })
function valueOf(label: string): HTMLElement {
  const key = within(table()).getByRole("rowheader", { name: label })
  const cell = within(table()).getAllByRole("cell").find((candidate) => candidate.getAttribute("headers") === key.id)
  if (!cell) throw new Error(`Missing value for ${label}`)
  return cell
}

/** Real consumers and mutations of the same root cache, as another page/section would use. */
function CacheActions() {
  const { mutate } = useSWRConfig()
  return <>
    <button onClick={() => void mutate(keys.contactPoints("Mobile"), toContactPoints([contactPointWire({ phoneNumberRegion: "GB" })]), false)}>Cache British mobile</button>
    <button onClick={() => void mutate(keys.myself(), toMyself(myselfWire({ firstName: "Bea", timeZone: "Europe/Paris" })), false)}>Update identity</button>
  </>
}

function IdentityReader() {
  const { myself } = useMyself()
  return <p aria-label="Shared identity">{myself?.firstName ?? "Waiting for identity"}</p>
}

function ClaimReader() {
  const claimed = useMyselfErrorClaimed()
  return <p role="status" aria-label="Page error owner">{claimed ? "Section owns error" : "Page owns error"}</p>
}

beforeEach(() => {
  stubViewport(360)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 16, 0, 15))
})
afterEach(() => {
  vi.useRealTimers()
  server.events.removeAllListeners("request:start")
})

describe("AccountSettingsSection (Story 7.4)", () => {
  it.each([360, 1280])("renders the ten ordered th/td pairs at %i px without fetching contacts", async (width) => {
    stubViewport(width)
    const requests: string[] = []
    server.events.on("request:start", ({ request }) => requests.push(new URL(request.url).pathname))
    const result = renderInPage(<AccountSettingsSection />, { page: "account" })
    await screen.findByRole("table", { name: TITLE })
    const headers = within(table()).getAllByRole("rowheader")
    expect(headers.map((cell) => cell.textContent)).toEqual(LABELS)
    expect(within(table()).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(VALUES)
    const rows = within(table()).getAllByRole("row")
    expect(rows).toHaveLength(width >= 768 ? 5 : 10)
    for (const row of rows) expect(row.children).toHaveLength(width >= 768 ? 4 : 2)
    headers.forEach((key, index) => {
      expect(key.tagName).toBe("TH")
      expect(key.getAttribute("scope")).toBe("row")
      const value = valueOf(LABELS[index])
      expect(value.tagName).toBe("TD")
      expect(key.nextElementSibling).toBe(value)
      expect(value.getAttribute("headers")).toBe(key.id)
    })
    expect(valueOf("Password").querySelector(".mono-value")?.textContent).toBe("********")
    expect(within(section()).queryByRole("button")).toBeNull()
    expect(within(section()).queryByRole("textbox")).toBeNull()
    expect(result.registry.getDirtyCount()).toBe(0)
    expect(result.registry.get("account")).toBeUndefined()
    expect(requests).toEqual([MYSELF])
  })

  it("keeps the same focusable anchor heading from kv loading through readiness", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { frameReady } = renderInPage(<AccountSettingsSection />, {
      page: "account", url: "/account?tab=personal#account",
      handlers: [http.get(MYSELF, async () => { await gate; return HttpResponse.json(myselfWire()) })],
    })
    const landmark = section()
    const heading = within(landmark).getByRole("heading", { level: 2, name: TITLE })
    expect(landmark.id).toBe("account")
    expect(heading.id).toBe("account-heading")
    expect(heading.tabIndex).toBe(-1)
    const frame = landmark.querySelector('[data-slot="state-frame"]')!
    expect(frame.getAttribute("aria-busy")).toBe("true")
    expect(frame.getAttribute("data-level")).toBe("section")
    expect(frame.querySelector('[data-slot="frame-skeleton"]')?.getAttribute("data-variant")).toBe("kv")
    expect(frame.querySelectorAll('[data-slot="frame-skeleton-row"]')).toHaveLength(4)
    expect(frame.querySelector('[data-slot="frame-skeleton"]')?.getAttribute("aria-hidden")).toBe("true")
    expect(screen.queryByRole("table")).toBeNull()
    expect(frameReady).not.toHaveBeenCalled()
    release()
    await screen.findByRole("table", { name: TITLE })
    expect(section()).toBe(landmark)
    expect(screen.getByRole("heading", { level: 2, name: TITLE })).toBe(heading)
    expect(table().getAttribute("aria-labelledby")).toBe(heading.id)
    expect(frameReady).toHaveBeenCalledExactlyOnceWith("account")
    heading.focus()
    expect(document.activeElement).toBe(heading)
  })

  it.each([null, "", " n/A ", "-1"])("renders PM3 %j as Not provided except the fixed password and default locale", async (missing) => {
    renderInPage(<AccountSettingsSection />, { page: "account", myself: myselfWire({
      firstName: missing, lastName: missing, username: missing, email: missing,
      phoneNumber: missing, birthDate: missing, preferredLanguage: missing, timeZone: missing, locale: missing,
    }) })
    await screen.findByRole("table", { name: TITLE })
    for (const label of LABELS.filter((label) => label !== "Password" && label !== LABELS[9])) {
      expect(valueOf(label).textContent).toBe("Not provided")
      expect(valueOf(label).firstElementChild?.classList.contains("text-muted-foreground")).toBe(true)
    }
    expect(valueOf("Password").textContent).toBe("********")
    expect(valueOf(LABELS[9]).textContent).toBe("English - United States")
  })

  it("renders trimmed unlisted regional values as safe text", async () => {
    renderInPage(<AccountSettingsSection />, { page: "account", myself: myselfWire({
      firstName: " <script>example</script> ", preferredLanguage: " fr ", timeZone: " Europe/Paris ", locale: " fr-FR ",
    }) })
    await screen.findByRole("table", { name: TITLE })
    expect(valueOf("First name").textContent).toBe("<script>example</script>")
    expect(valueOf("First name").querySelector("script")).toBeNull()
    expect(valueOf("Preferred language").textContent).toBe("fr")
    expect(valueOf("Default time zone").textContent).toBe("Europe/Paris")
    expect(valueOf(LABELS[9]).textContent).toBe("fr-FR")
  })

  it.each([
    ["generic 400", 400, { message: "Private upstream detail" }],
    ["proxy 403", 403, { errorCode: "NOT_ALLOWED", source: "proxy" }],
  ])("shows page load copy for %s and Retry recovers only identity, leaving Authenticator intact", async (_name, status, body) => {
    let calls = 0
    const requests: string[] = []
    server.events.on("request:start", ({ request }) => requests.push(new URL(request.url).pathname))
    const user = userEvent.setup()
    // Story 8.1's current Authenticator body is this shared shell placeholder.
    const { frameReady } = renderInPage(<><AccountSettingsSection /><AccountSectionPlaceholder id="authenticator" /></>, {
      page: "account",
      handlers: [http.get(MYSELF, () => {
        calls += 1
        return calls === 1 ? HttpResponse.json(body, { status }) : HttpResponse.json(myselfWire())
      })],
    })
    const sibling = screen.getByRole("region", { name: "Authenticator app" })
    const siblingContent = sibling.innerHTML
    expect((await within(section()).findByRole("alert")).textContent).toBe("Something went wrong while loading profile information")
    expect(within(section()).queryByText("You don't have access to this in your current account")).toBeNull()
    expect(screen.queryByText("Private upstream detail")).toBeNull()
    expect(within(section()).queryByRole("table")).toBeNull()
    // A settled error layout can move a later deep-link target too.
    expect(frameReady).toHaveBeenCalledWith("account")
    await user.click(within(section()).getByRole("button", { name: "Retry" }))
    await screen.findByRole("table", { name: TITLE })
    expect(document.activeElement).toBe(within(section()).getByRole("heading", { name: TITLE }))
    expect(calls).toBe(2)
    // Clicking Retry also records user activity through the shell's real ping boundary.
    expect(requests.filter((path) => path !== "/api/session/ping")).toEqual([MYSELF, MYSELF])
    expect(screen.getByRole("region", { name: "Authenticator app" })).toBe(sibling)
    expect(sibling.innerHTML).toBe(siblingContent)
    expect(frameReady).toHaveBeenCalledWith("account")
  })

  it("shows section-level no-access for upstream 403 without Retry or affecting Authenticator", async () => {
    renderInPage(<><AccountSettingsSection /><AccountSectionPlaceholder id="authenticator" /></>, { page: "account", myself: {
      status: 403, body: { message: "Forbidden", code: "FORBIDDEN" },
    } })
    const sibling = screen.getByRole("region", { name: "Authenticator app" })
    const siblingContent = sibling.innerHTML
    const status = await within(section()).findByRole("status")
    expect(status.textContent).toBe("You don't have access to this in your current account")
    expect(status.getAttribute("data-level")).toBe("section")
    expect(within(section()).queryByRole("button", { name: "Retry" })).toBeNull()
    expect(within(section()).queryByRole("table")).toBeNull()
    expect(sibling.innerHTML).toBe(siblingContent)
  })

  it("re-announces an identical failure only after each delayed Retry finishes", async () => {
    let release: (() => void) | undefined
    let calls = 0
    const user = userEvent.setup()
    renderInPage(<AccountSettingsSection />, {
      page: "account",
      handlers: [http.get(MYSELF, async () => {
        calls += 1
        if (calls > 1) await new Promise<void>((resolve) => { release = resolve })
        return HttpResponse.json({}, { status: 400 })
      })],
    })
    let lastAlert = await within(section()).findByRole("alert")
    for (const call of [2, 3]) {
      await user.click(within(section()).getByRole("button", { name: "Retry" }))
      await waitFor(() => expect(calls).toBe(call))
      expect(within(section()).getByRole("alert")).toBe(lastAlert)
      await act(async () => { release?.() })
      await waitFor(() => expect(within(section()).getByRole("alert")).not.toBe(lastAlert))
      lastAlert = within(section()).getByRole("alert")
      expect(lastAlert.textContent).toBe("Something went wrong while loading profile information")
    }
  })

  it.each(["another control", "another control then body", "nonfocusable content"])("does not steal recovery focus after moving to %s", async (destination) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const user = userEvent.setup()
    renderInPage(<><AccountSettingsSection /><button>Elsewhere</button><p>Other content</p></>, {
      page: "account",
      handlers: [http.get(MYSELF, async () => {
        calls += 1
        if (calls === 1) return HttpResponse.json({}, { status: 400 })
        await gate
        return HttpResponse.json(myselfWire())
      })],
    })
    await within(section()).findByRole("alert")
    await user.click(within(section()).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(calls).toBe(2))
    const outside = screen.getByRole("button", { name: "Elsewhere" })
    if (destination === "nonfocusable content") await user.click(screen.getByText("Other content"))
    else act(() => {
      outside.focus()
      if (destination === "another control then body") outside.blur()
    })
    const chosen = document.activeElement
    await act(async () => { release() })
    await screen.findByRole("table", { name: TITLE })
    expect(document.activeElement).toBe(chosen)
    expect(document.activeElement).not.toBe(within(section()).getByRole("heading", { name: TITLE }))
  })

  it("clears a failed Retry's focus ownership before a later background recovery", async () => {
    let replaceIdentity!: () => Promise<void>
    function BackgroundIdentity() {
      const { mutate } = useSWRConfig()
      useEffect(() => {
        replaceIdentity = async () => { await mutate(keys.myself(), toMyself(myselfWire()), false) }
      }, [mutate])
      return null
    }
    let calls = 0
    const user = userEvent.setup()
    renderInPage(<><AccountSettingsSection /><BackgroundIdentity /></>, {
      page: "account",
      handlers: [http.get(MYSELF, () => {
        calls += 1
        return HttpResponse.json({}, { status: 400 })
      })],
    })
    const firstError = await within(section()).findByRole("alert")
    const retry = within(section()).getByRole("button", { name: "Retry" })
    await user.click(retry)
    await waitFor(() => expect(within(section()).getByRole("alert")).not.toBe(firstError))
    expect(calls).toBe(2)
    expect(document.activeElement).toBe(retry)
    await act(replaceIdentity)
    await screen.findByRole("table", { name: TITLE })
    expect(document.activeElement).toBe(document.body)
  })

  it("does not claim focus for a virtual Retry activation while another control is focused", async () => {
    let calls = 0
    renderInPage(<><AccountSettingsSection /><button>Elsewhere</button></>, {
      page: "account", handlers: [http.get(MYSELF, () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({}, { status: 400 }) : HttpResponse.json(myselfWire())
      })],
    })
    await within(section()).findByRole("alert")
    const outside = screen.getByRole("button", { name: "Elsewhere" })
    act(() => {
      outside.focus()
      // Assistive/virtual activation need not transfer DOM focus first.
      within(section()).getByRole("button", { name: "Retry" }).click()
    })
    await screen.findByRole("table", { name: TITLE })
    expect(document.activeElement).toBe(outside)
  })

  it("keeps recovery focus when Retry is pressed again while a request is pending", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const user = userEvent.setup()
    renderInPage(<AccountSettingsSection />, {
      page: "account", handlers: [http.get(MYSELF, async () => {
        calls += 1
        if (calls === 1) return HttpResponse.json({}, { status: 400 })
        await gate
        return HttpResponse.json(myselfWire())
      })],
    })
    await within(section()).findByRole("alert")
    const retry = within(section()).getByRole("button", { name: "Retry" })
    await user.click(retry)
    await waitFor(() => expect(calls).toBe(2))
    await user.click(retry)
    await act(async () => { release() })
    await screen.findByRole("table", { name: TITLE })
    expect(document.activeElement).toBe(within(section()).getByRole("heading", { name: TITLE }))
  })

  it("reads already cached Primary Mobile region and subscribes to cache updates without a contacts fetch", async () => {
    const contactsRequests: string[] = []
    server.events.on("request:start", ({ request }) => {
      if (new URL(request.url).pathname.includes("contact-point")) contactsRequests.push(request.url)
    })
    const mobileKey = unstable_serialize(keys.contactPoints("Mobile"))
    const cached = toContactPoints([contactPointWire({ value: "02071838750", phoneNumberRegion: "US" })])!
    renderInPage(<SWRConfig value={{ fallback: { [mobileKey]: cached } }}><AccountSettingsSection /><CacheActions /></SWRConfig>, {
      page: "account", myself: myselfWire({ phoneNumber: "02071838750" }),
    })
    await screen.findByRole("table", { name: TITLE })
    expect(valueOf("Primary phone number").textContent).toBe("02071838750")
    await userEvent.setup().click(screen.getByRole("button", { name: "Cache British mobile" }))
    await waitFor(() => expect(valueOf("Primary phone number").textContent).toBe("+44 20 7183 8750"))
    expect(contactsRequests).toEqual([])
  })

  it("uses a region cached before mount, including a matching non-Primary Mobile row", async () => {
    const cached = toContactPoints([contactPointWire({ value: "020 7183 8750", label: "Home", phoneNumberRegion: "GB" })])!
    renderInPage(<SWRConfig value={{ fallback: { [unstable_serialize(keys.contactPoints("Mobile"))]: cached } }}><AccountSettingsSection /></SWRConfig>, {
      page: "account", myself: myselfWire({ phoneNumber: "02071838750" }),
    })
    await screen.findByRole("table", { name: TITLE })
    expect(valueOf("Primary phone number").textContent).toBe("+44 20 7183 8750")
  })

  it("reuses fresh identity loaded elsewhere and both consumers react to a shared cache mutation without refetching", async () => {
    function Host() {
      const [show, setShow] = useState(false)
      return <><IdentityReader /><button onClick={() => setShow(true)}>Show account</button>{show && <AccountSettingsSection />}<CacheActions /></>
    }
    let calls = 0
    renderInPage(<SWRConfig value={{ dedupingInterval: 60_000 }}><Host /></SWRConfig>, {
      page: "account", handlers: [http.get(MYSELF, () => { calls += 1; return HttpResponse.json(myselfWire()) })],
    })
    await waitFor(() => expect(screen.getByLabelText("Shared identity").textContent).toBe("Ann"))
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Show account" }))
    await screen.findByRole("table", { name: TITLE })
    await act(async () => undefined)
    expect(calls).toBe(1)
    await user.click(screen.getByRole("button", { name: "Update identity" }))
    await waitFor(() => expect(valueOf("First name").textContent).toBe("Bea"))
    expect(valueOf("Default time zone").textContent).toBe("Europe/Paris")
    expect(screen.getByLabelText("Shared identity").textContent).toBe("Bea")
    expect(calls).toBe(1)
  })

  it("claims the page error only while this section displays it and releases the claim on recovery and unmount", async () => {
    function Host() {
      const [show, setShow] = useState(true)
      return <MyselfErrorClaimProvider><ClaimReader />{show && <AccountSettingsSection />}<button onClick={() => setShow(false)}>Hide account</button></MyselfErrorClaimProvider>
    }
    const { unmount } = renderInPage(<Host />, { page: "account", myself: { status: 400, body: {} } })
    expect(screen.getByLabelText("Page error owner").textContent).toBe("Page owns error")
    await waitFor(() => expect(screen.getByLabelText("Page error owner").textContent).toBe("Section owns error"))
    server.use(http.get(MYSELF, () => HttpResponse.json(myselfWire())))
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }))
    await screen.findByRole("table", { name: TITLE })
    expect(screen.getByLabelText("Page error owner").textContent).toBe("Page owns error")
    unmount()
    renderInPage(<Host />, { page: "account", myself: { status: 400, body: {} } })
    await waitFor(() => expect(screen.getByLabelText("Page error owner").textContent).toBe("Section owns error"))
    await userEvent.setup().click(screen.getByRole("button", { name: "Hide account" }))
    expect(screen.getByLabelText("Page error owner").textContent).toBe("Page owns error")
  })

  it("has no WCAG 2.1 A/AA structural violations", async () => {
    renderInPage(<AccountSettingsSection />, { page: "account" })
    await screen.findByRole("table", { name: TITLE })
    expect(await axeViolations()).toEqual([])
  })
})
