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
    expect(within(section()).getByRole("button", { name: "Edit" })).toBeTruthy()
    expect(within(section()).queryByRole("textbox")).toBeNull()
    expect(result.registry.getDirtyCount()).toBe(0)
    expect(result.registry.get("account")?.draftFields).toEqual(["firstName", "lastName", "birthDate", "preferredLanguage", "timeZone", "locale", "primaryEmail", "primaryPhone"])
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

describe("Account settings editing (Story 7.5)", () => {
  it.each([360, 1280])("opens all ten rows, locks credentials, preserves Enter/Escape and Cancel focus at %i", async (width) => {
    stubViewport(width)
    const user = userEvent.setup()
    renderInPage(<AccountSettingsSection />, { page: "account" })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const first = screen.getByRole("textbox", { name: "First name" })
    expect(document.activeElement).toBe(first)
    expect(screen.getByRole("textbox", { name: "Username" }).getAttribute("readonly")).not.toBeNull()
    expect(screen.getByRole("textbox", { name: "Password" }).getAttribute("readonly")).not.toBeNull()
    await user.type(first, "a{Enter}{Escape}")
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit" }))
  })
  it("keeps unchanged Save open and validates invalid dates distinctly from empty dates", async () => {
    const user = userEvent.setup()
    renderInPage(<AccountSettingsSection />, { page: "account" })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("There are no changes")).toBeTruthy()
    const date = screen.getByRole("textbox", { name: "Birth date" })
    await user.clear(date)
    await user.type(date, "02301990")
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Enter a date as MM/DD/YYYY")).toBeTruthy()
    expect(document.activeElement).toBe(date)
    await user.clear(date)
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Birth date is required")).toBeTruthy()
  })
  it("acknowledges details despite stale refresh, retries only the failed zone, and focuses heading on success", async () => {
    const user = userEvent.setup()
    const details: unknown[] = []
    let zones = 0
    const rendered = renderInPage(<AccountSettingsSection />, { page: "account", handlers: [
      http.put("/api/1h/v2/user/edit", async ({ request }) => { details.push(await request.json()); return new HttpResponse(null, { status: 204 }) }),
      http.post("/api/1h/v2/user/time-zone", () => { zones++; return zones === 1 ? HttpResponse.json({}, { status: 500 }) : new HttpResponse(null, { status: 204 }) }),
    ] })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const first = screen.getByRole("textbox", { name: "First name" })
    await user.clear(first)
    await user.type(first, "Bea")
    await act(async () => {
      const entry = rendered.registry.get("account")!
      entry.applyDraft!({ ...entry.getDraftValues!(), timeZone: "America/New_York" })
    })
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Time zone was not saved.")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByRole("button", { name: "Edit" })
    expect(details).toEqual([{ firstName: "Bea" }])
    expect(zones).toBe(2)
    expect(valueOf("First name").textContent).toBe("Bea")
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: TITLE }))
  })
  it("shows a legacy `en-us` locale as the listed option and saves other fields without a locale write (NG-9033)", async () => {
    const user = userEvent.setup()
    const details: unknown[] = []
    let locales = 0
    renderInPage(<AccountSettingsSection />, { page: "account", myself: myselfWire({ locale: "en-us" }), handlers: [
      http.put("/api/1h/v2/user/edit", async ({ request }) => { details.push(await request.json()); return new HttpResponse(null, { status: 204 }) }),
      http.post("/api/1h/v2/user/locale", () => { locales++; return new HttpResponse(null, { status: 204 }) }),
    ] })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const locale = screen.getByRole("combobox", { name: "Preferred locale for date, time, and currency" })
    expect(locale.textContent).toBe("English - United States")
    const first = screen.getByRole("textbox", { name: "First name" })
    await user.clear(first)
    await user.type(first, "Bea")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByRole("button", { name: "Edit" })
    expect(details).toEqual([{ firstName: "Bea" }])
    expect(locales).toBe(0)
    expect(valueOf("Preferred locale for date, time, and currency").textContent).toBe("English - United States")
  })
})

function AccountRevisions() {
  const { mutate } = useSWRConfig()
  return <>{["Ann", "Bea", "Cara"].map((firstName) => <button key={firstName} onClick={() => void mutate(keys.myself(), toMyself(myselfWire({ firstName })), false)}>{`Server ${firstName}`}</button>)}</>
}

it.each([true, false])("retires acknowledged name after confirmation=%s or external replacement, never reviving it on A→B→C→A", async (confirm) => {
  const user = userEvent.setup()
  renderInPage(<><AccountSettingsSection /><AccountRevisions /></>, { page: "account", handlers: [http.put("/api/1h/v2/user/edit", () => new HttpResponse(null, { status: 204 }))] })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await user.clear(screen.getByRole("textbox", { name: "First name" }))
  await user.type(screen.getByRole("textbox", { name: "First name" }), "Bea")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByRole("button", { name: "Edit" })
  expect(valueOf("First name").textContent).toBe("Bea")
  if (confirm) await user.click(screen.getByRole("button", { name: "Server Bea" }))
  await user.click(screen.getByRole("button", { name: "Server Cara" }))
  expect(valueOf("First name").textContent).toBe("Cara")
  await user.click(screen.getByRole("button", { name: "Server Ann" }))
  expect(valueOf("First name").textContent).toBe("Ann")
})

it.each(["02/3", "02/30/1990"])("restores exact invalid draft text %s and retains its validation error", async (birthDate) => {
  const user = userEvent.setup()
  const rendered = renderInPage(<AccountSettingsSection />, { page: "account" })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await act(async () => {
    const entry = rendered.registry.get("account")!
    entry.applyDraft!({ ...entry.getDraftValues!(), birthDate })
  })
  expect((screen.getByRole("textbox", { name: "Birth date" }) as HTMLInputElement).value).toBe(birthDate)
  expect(rendered.registry.get("account")?.getDraftValues?.().birthDate).toBe(birthDate)
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByText("Enter a date as MM/DD/YYYY")).toBeTruthy()
})

it("validates a stored invalid-age date even when Save has no changes", async () => {
  const user = userEvent.setup()
  renderInPage(<AccountSettingsSection />, { page: "account", myself: myselfWire({ birthDate: "2020-01-01" }) })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  const date = screen.getByRole("textbox", { name: "Birth date" }) as HTMLInputElement
  expect(date.value).toBe("01/01/2020")
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByText("You must be between 18 and 120 years old")).toBeTruthy()
  expect(document.activeElement).toBe(date)
})

it("shows one valid, focused detailed alert with safely paired part messages and Retry on that banner", async () => {
  const user = userEvent.setup()
  let fail = true
  const messages = { details: "Name <b>rejected</b>", timeZone: "Zone rejected safely", locale: "Locale rejected safely" }
  const answer = (message: string) => fail ? HttpResponse.json({ message }, { status: 400 }) : new HttpResponse(null, { status: 204 })
  const rendered = renderInPage(<AccountSettingsSection />, { page: "account", myself: myselfWire({ locale: "fr-FR" }), handlers: [
    http.put("/api/1h/v2/user/edit", () => answer(messages.details)),
    http.post("/api/1h/v2/user/time-zone", () => answer(messages.timeZone)),
    http.post("/api/1h/v2/user/locale", () => answer(messages.locale)),
  ] })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await act(async () => {
    const entry = rendered.registry.get("account")!
    entry.applyDraft!({ ...entry.getDraftValues!(), firstName: "Bea", timeZone: "America/New_York", locale: "en-US" })
  })
  await user.click(screen.getByRole("button", { name: "Save" }))
  const alert = await screen.findByRole("alert")
  expect(screen.getAllByRole("alert")).toHaveLength(1)
  expect([...alert.children].map((node) => node.textContent?.trim())).toEqual([
    `Account details was not saved. ${messages.details}`,
    `Time zone was not saved. ${messages.timeZone}`,
    `Preferred locale was not saved. ${messages.locale}`,
  ])
  expect(alert.querySelector("ul,li,b")).toBeNull()
  const banner = alert.closest('[data-slot="inline-banner"]') as HTMLElement
  expect(document.activeElement).toBe(banner)
  expect(within(banner).getByRole("button", { name: "Retry" })).toBeTruthy()
  expect(section().querySelector('[data-slot="section-footer"] [role="alert"]')).toBeNull()
  fail = false
  await user.click(within(banner).getByRole("button", { name: "Retry" }))
  await screen.findByRole("button", { name: "Edit" })
  expect(screen.queryByRole("alert")).toBeNull()
})

it("clears obsolete failed-part outcomes when reverted values are saved unchanged", async () => {
  const user = userEvent.setup()
  renderInPage(<AccountSettingsSection />, { page: "account", handlers: [http.put("/api/1h/v2/user/edit", () => HttpResponse.json({}, { status: 500 }))] })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  const first = screen.getByRole("textbox", { name: "First name" })
  await user.clear(first); await user.type(first, "Bea")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByRole("alert")
  await user.clear(first); await user.type(first, "Ann")
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByText("There are no changes")).toBeTruthy()
  expect(screen.queryByRole("alert")).toBeNull()
  expect(screen.getByRole("textbox", { name: "First name" })).toBeTruthy()
})

it("normalizes restored whitespace-only name changes before deciding unchanged Save", async () => {
  const user = userEvent.setup()
  let writes = 0
  const rendered = renderInPage(<AccountSettingsSection />, { page: "account", handlers: [http.put("/api/1h/v2/user/edit", () => { writes++; return new HttpResponse(null, { status: 204 }) })] })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await act(async () => {
    const entry = rendered.registry.get("account")!
    entry.applyDraft!({ ...entry.getDraftValues!(), firstName: " Ann ", lastName: " Lee " })
  })
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByText("There are no changes")).toBeTruthy()
  expect(writes).toBe(0)
  expect((screen.getByRole("textbox", { name: "First name" }) as HTMLInputElement).value).toBe("Ann")
  expect((screen.getByRole("textbox", { name: "Last name" }) as HTMLInputElement).value).toBe("Lee")
})

function RetryIdentityRead() {
  const { retry } = useMyself()
  return <button onClick={retry}>Revalidate shared identity</button>
}

it("honors a real upstream myself 403 during editing, retains the draft, and restores controls on read recovery", async () => {
  const user = userEvent.setup()
  let forbidden = false
  const rendered = renderInPage(<><AccountSettingsSection /><RetryIdentityRead /></>, { page: "account", handlers: [
    http.get(MYSELF, () => forbidden ? HttpResponse.json({}, { status: 403 }) : HttpResponse.json(myselfWire())),
  ] })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await user.clear(screen.getByRole("textbox", { name: "First name" }))
  await user.type(screen.getByRole("textbox", { name: "First name" }), "Bea")
  forbidden = true
  await user.click(screen.getByRole("button", { name: "Revalidate shared identity" }))
  expect(await screen.findByText("You don't have access to this in your current account")).toBeTruthy()
  expect(within(section()).queryByRole("textbox")).toBeNull()
  expect(rendered.registry.get("account")?.getDraftValues?.().firstName).toBe("Bea")
  forbidden = false
  await user.click(screen.getByRole("button", { name: "Revalidate shared identity" }))
  const first = await screen.findByRole("textbox", { name: "First name" }) as HTMLInputElement
  expect(first.value).toBe("Bea")
  expect(screen.queryByText("You don't have access to this in your current account")).toBeNull()
})

it.each([false, true])("refreshes a separate shared identity reader after details save with partial failure=%s", async (partial) => {
  const user = userEvent.setup()
  let firstName = "Ann"
  const rendered = renderInPage(<><AccountSettingsSection /><IdentityReader /></>, { page: "account", handlers: [
    http.get(MYSELF, () => HttpResponse.json(myselfWire({ firstName }))),
    http.put("/api/1h/v2/user/edit", async ({ request }) => { firstName = (await request.json() as { firstName: string }).firstName; return new HttpResponse(null, { status: 204 }) }),
    http.post("/api/1h/v2/user/time-zone", () => HttpResponse.json({}, { status: 500 })),
  ] })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await act(async () => {
    const entry = rendered.registry.get("account")!
    entry.applyDraft!({ ...entry.getDraftValues!(), firstName: "Bea", ...(partial ? { timeZone: "America/New_York" } : {}) })
  })
  await user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(screen.getByLabelText("Shared identity").textContent).toBe("Bea"))
  if (partial) expect(screen.getByRole("textbox", { name: "First name" })).toBeTruthy()
  else expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy()
})

it("detailed Retry clears old failures when the user reverted the edits", async () => {
  const user = userEvent.setup()
  let writes = 0
  renderInPage(<AccountSettingsSection />, { page: "account", handlers: [http.put("/api/1h/v2/user/edit", () => { writes++; return HttpResponse.json({}, { status: 500 }) })] })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  const first = screen.getByRole("textbox", { name: "First name" })
  await user.clear(first); await user.type(first, "Bea")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByRole("alert")
  await user.clear(first); await user.type(first, "Ann")
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByText("There are no changes")).toBeTruthy()
  expect(screen.queryByRole("alert")).toBeNull()
  expect(writes).toBe(1)
  expect(screen.getByRole("textbox", { name: "First name" })).toBeTruthy()
})

it("preserves the second acknowledged save across a preceding held refresh and late A/B snapshots after failed second refresh", async () => {
  const user = userEvent.setup()
  let releaseFirstRefresh!: () => void
  const firstRefresh = new Promise<void>((resolve) => { releaseFirstRefresh = resolve })
  let releaseSecondPut!: () => void
  const secondPut = new Promise<void>((resolve) => { releaseSecondPut = resolve })
  let holdNextRead = false
  let firstRefreshHeld = false
  let secondPutHeld = false
  let failNextRead = false
  let secondRefreshFailed = false
  let readName = "Ann"
  const writes: string[] = []
  renderInPage(<><AccountSettingsSection /><IdentityReader /><RetryIdentityRead /></>, { page: "account", handlers: [
    http.get(MYSELF, async () => {
      if (holdNextRead) {
        holdNextRead = false
        firstRefreshHeld = true
        await firstRefresh
        return HttpResponse.json(myselfWire({ firstName: "Bea" }))
      }
      if (failNextRead) {
        failNextRead = false
        secondRefreshFailed = true
        return HttpResponse.json({}, { status: 500 })
      }
      return HttpResponse.json(myselfWire({ firstName: readName }))
    }),
    http.put("/api/1h/v2/user/edit", async ({ request }) => {
      const { firstName } = await request.json() as { firstName: string }
      writes.push(firstName)
      if (writes.length === 1) holdNextRead = true
      else {
        secondPutHeld = true
        await secondPut
        failNextRead = true
      }
      return new HttpResponse(null, { status: 204 })
    }),
  ] })
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await user.clear(screen.getByRole("textbox", { name: "First name" }))
  await user.type(screen.getByRole("textbox", { name: "First name" }), "Bea")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByRole("button", { name: "Edit" })
  await waitFor(() => expect(firstRefreshHeld).toBe(true))
  await user.click(screen.getByRole("button", { name: "Edit" }))
  await user.clear(screen.getByRole("textbox", { name: "First name" }))
  await user.type(screen.getByRole("textbox", { name: "First name" }), "Cara")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(secondPutHeld).toBe(true))
  await act(async () => { releaseFirstRefresh() })
  await waitFor(() => expect(screen.getByLabelText("Shared identity").textContent).toBe("Bea"))
  await act(async () => { releaseSecondPut() })
  await waitFor(() => expect(secondRefreshFailed).toBe(true))
  await screen.findByText("Something went wrong while loading profile information")
  for (const predecessor of ["Ann", "Bea"]) {
    readName = predecessor
    await user.click(screen.getByRole("button", { name: "Revalidate shared identity" }))
    await waitFor(() => expect(screen.getByLabelText("Shared identity").textContent).toBe(predecessor))
    await waitFor(() => expect(valueOf("First name").textContent).toBe("Cara"))
  }
  await user.click(screen.getByRole("button", { name: "Edit" }))
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByText("There are no changes")).toBeTruthy()
  expect(writes).toEqual(["Bea", "Cara"])
})
