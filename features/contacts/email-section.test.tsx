import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { useEffect } from "react"
import { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SectionCountProvider, useSectionCounts } from "@/features/shell"
import { keys } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubViewport } from "@/test/media"
import { contactPointWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { EmailSection, PhoneSection } from "."

/**
 * Story 3.5 (NG-9024): the Email read view on `/`, rendered the way
 * `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers the "Read"
 * and "Empty / error" rows of the I/O matrix in
 * `spec-3-5-view-add-relabel-and-remove-emails.md`.
 */

const LIST = "/api/1h/v2/user/contact-point/list"

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

const email = (overrides: Wire): Wire => contactPointWire({ type: "Email", phoneNumberRegion: null, ...overrides })

/** The matrix's "Read" row: Email [Work 41 (unverified), Primary 42 (notifications on), Home 43]. */
const EMAILS: Wire[] = [
  email({ id: 41, value: "ann@work.example", label: "Work", isVerified: false, isNotificationEnabled: false }),
  email({ id: 42, value: "ann@example.com", label: "Primary", isVerified: true, isNotificationEnabled: true }),
  email({ id: 43, value: "ann@home.example", label: "Home", isVerified: false, isNotificationEnabled: false }),
]

/** The Notifications cell of a non-Primary row: the "—" (aria-hidden) and its visually hidden meaning. */
const NA = "—Not applicable"

const ok = (rows: Wire[]): Answer => () => HttpResponse.json(rows)
const fail = (status = 500): Answer => () => HttpResponse.json({ message: "boom" }, { status })

/** Answers the Contact Point list per type and counts the requests of each type. */
function listServer(answers: Partial<Record<string, Answer>> = {}) {
  const counts: Record<string, number> = {}
  const handler = http.get(LIST, ({ request }) => {
    const type = new URL(request.url).searchParams.get("type") ?? ""
    counts[type] = (counts[type] ?? 0) + 1
    return (answers[type] ?? ok([]))()
  })
  return { counts, handlers: [handler] }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Email" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const meta = (): string | null | undefined => section().querySelector('[data-slot="section-meta"]')?.textContent

async function renderLoaded(answers: Partial<Record<string, Answer>> = { Email: ok(EMAILS) }) {
  const server = listServer(answers)
  const result = renderInPage(<EmailSection />, { page: "profile", handlers: server.handlers })
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  return { ...result, counts: server.counts }
}

/** The desktop table's body rows, as their cells' text (without the actions cell). */
function tableRows(): string[][] {
  const table = within(section()).getByRole("table", { name: "Email" })
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .filter((cell) => cell.getAttribute("data-slot") !== "row-actions-cell")
        .map((cell) => cell.textContent ?? ""),
    )
}

beforeEach(() => {
  stubViewport(1024)
})
afterEach(() => {
  document.documentElement.classList.remove("dark")
})

describe("EmailSection: loading", () => {
  it("renders the landmark and h2 from the first render, a 3-row table skeleton with the four column headers", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { handlers } = listServer({
      Email: async () => {
        await gate
        return HttpResponse.json(EMAILS)
      },
    })
    renderInPage(<EmailSection />, { page: "profile", handlers })
    const landmark = section()
    expect(landmark.id).toBe("email")
    expect(screen.getByRole("heading", { level: 2, name: "Email" }).id).toBe("email-heading")
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(frame()?.getAttribute("data-level")).toBe("section")
    expect(frame()?.querySelector('[data-slot="frame-skeleton"]')?.getAttribute("data-variant")).toBe("table")
    expect(frame()?.querySelectorAll('[data-slot="frame-skeleton-row"]')).toHaveLength(3)
    expect([...(frame()?.querySelectorAll('[data-slot="frame-skeleton-header"] span') ?? [])].map((cell) => cell.textContent)).toEqual([
      "Email address",
      "Label",
      "Status",
      "Notifications",
    ])
    expect(screen.getByText("Loading emails")).toBeTruthy()
    expect(meta()).toBeUndefined()

    release()
    await screen.findByRole("table", { name: "Email" })
    // The same landmark, never remounted.
    expect(section()).toBe(landmark)
  })
})

describe("EmailSection: read view", () => {
  it("Primary first, then the API order; statuses Verified / Not verified / empty; notifications On / — / —; count 3", async () => {
    await renderLoaded()
    expect(tableRows()).toEqual([
      ["ann@example.com", "Primary", "Verified", "On"],
      ["ann@work.example", "Work", "Not verified", NA],
      ["ann@home.example", "Home", "", NA],
    ])
    expect(meta()).toBe("3")
  })

  it("shows the real column headers in a table named by the h2; the address in cell-strong", async () => {
    await renderLoaded()
    const table = within(section()).getByRole("table", { name: "Email" })
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Email address", "Label", "Status", "Notifications", "Actions"])
    expect(table.getAttribute("aria-labelledby")).toBe("email-heading")
    expect(within(section()).getByText("ann@example.com").classList.contains("cell-strong")).toBe(true)
    // Long addresses wrap inside their cell.
    expect(within(section()).getByText("ann@example.com").closest("td")?.className).toContain("[overflow-wrap:anywhere]")
  })

  it("gives the Primary row the filled primary chip and every other label the plain chip; status as icon + word", async () => {
    await renderLoaded()
    expect([...section().querySelectorAll('[data-slot="chip"]')].map((chip) => chip.getAttribute("data-variant"))).toEqual(["primary", "label", "label"])
    const badges = [...section().querySelectorAll('[data-slot="status-badge"]')]
    expect(badges.map((badge) => [badge.getAttribute("data-status"), badge.textContent])).toEqual([
      ["verified", "Verified"],
      ["notVerified", "Not verified"],
    ])
    for (const badge of badges) expect(badge.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("shows Off (muted) on a Primary row with notifications off", async () => {
    await renderLoaded({ Email: ok([email({ id: 42, value: "ann@example.com", label: "Primary", isNotificationEnabled: false })]) })
    expect(within(section()).getByText("Off").classList.contains("text-muted-foreground")).toBe(true)
  })

  it("only the findPrimary row is shown as Primary: a legacy second Primary reads as a plain label", async () => {
    await renderLoaded({
      Email: ok([email({ id: 1, value: "a@example.com", label: "Primary", isNotificationEnabled: true }), email({ id: 2, value: "b@example.com", label: "Primary", isNotificationEnabled: true })]),
    })
    expect(tableRows()).toEqual([
      ["a@example.com", "Primary", "Verified", "On"],
      ["b@example.com", "Primary", "Verified", NA],
    ])
    expect([...section().querySelectorAll('[data-slot="chip"]')].map((chip) => chip.getAttribute("data-variant"))).toEqual(["primary", "label"])
  })

  it("keeps the API order without a Primary", async () => {
    await renderLoaded({ Email: ok([email({ id: 1, value: "a@example.com", label: "Work" }), email({ id: 2, value: "b@example.com", label: "Personal" })]) })
    expect(tableRows().map((row) => row[0])).toEqual(["a@example.com", "b@example.com"])
  })

  it("drops rows without a value and doesn't count them; keys repeated ids apart; a row without a label shows no chip", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await renderLoaded({
      Email: ok([
        email({ id: 1, value: null }),
        email({ id: 2, value: "", label: "Work" }),
        email({ id: null, value: "none@example.com", label: null }),
        email({ id: 7, value: "seven@example.com", label: "Work" }),
        email({ id: 7, value: "again@example.com", label: "Home" }),
      ]),
    })
    expect(tableRows().map((row) => row[0])).toEqual(["none@example.com", "seven@example.com", "again@example.com"])
    expect(section().querySelectorAll('[data-slot="chip"]')).toHaveLength(2)
    expect(meta()).toBe("3")
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/)
    errors.mockRestore()
  })

  it("each row's kebab is named by its address", async () => {
    await renderLoaded()
    for (const value of ["ann@example.com", "ann@work.example", "ann@home.example"]) {
      expect(within(section()).getByRole("button", { name: `More actions for ${value}` })).toBeTruthy()
    }
  })

  it("reports ready to the Section frame and the saved count to the Section index", async () => {
    let counts: ReturnType<typeof useSectionCounts> = {}
    function CountsProbe() {
      counts = useSectionCounts()
      return null
    }
    const { handlers } = listServer({ Email: ok(EMAILS) })
    const { frameReady } = renderInPage(
      <SectionCountProvider>
        <EmailSection />
        <CountsProbe />
      </SectionCountProvider>,
      { page: "profile", handlers },
    )
    await screen.findByRole("table", { name: "Email" })
    await waitFor(() => expect(frameReady).toHaveBeenCalledWith("email"))
    await waitFor(() => expect(counts.email).toBe(3))
  })
})

describe("EmailSection: empty", () => {
  it("shows one \"No emails yet · Add email\" row and count 0", async () => {
    await renderLoaded({ Email: ok([]) })
    const table = within(section()).getByRole("table", { name: "Email" })
    const empty = table.querySelector('[data-slot="empty-state"]')
    expect(empty?.getAttribute("data-variant")).toBe("row")
    expect(empty?.textContent).toBe("No emails yet·Add email")
    expect(empty?.querySelector("td")?.getAttribute("colspan")).toBe("5")
    expect(meta()).toBe("0")
  })
})

describe("EmailSection: below 768 px", () => {
  it("shows stacked cards: line 1 address and status, line 2 label chip and notifications (muted)", async () => {
    stubViewport(360)
    await renderLoaded()
    expect(within(section()).queryByRole("table")).toBeNull()
    const cards = within(within(section()).getByRole("list", { name: "Email" })).getAllByRole("listitem")
    expect(cards).toHaveLength(3)
    const [line1, line2] = [...cards[0].querySelectorAll(":scope > div:first-child > div")]
    expect([...line1.querySelectorAll("[data-column]")].map((cell) => cell.getAttribute("data-column"))).toEqual(["address", "status"])
    expect([...line2.querySelectorAll("[data-column]")].map((cell) => cell.getAttribute("data-column"))).toEqual(["label", "notifications"])
    expect(line2.classList.contains("text-muted-foreground")).toBe(true)
    expect(line1.textContent).toBe("Email address: ann@example.comStatus: Verified")
    expect(line2.textContent).toBe("Label: PrimaryNotifications: On")
  })
})

describe("EmailSection: load error", () => {
  it("a failed read shows \"Couldn't load emails\" + Retry; Retry revalidates only the Email key; Phone is unaffected", async () => {
    let fails = true
    const server = listServer({
      Email: () => (fails ? fail()() : HttpResponse.json(EMAILS)),
      Mobile: ok([contactPointWire({ id: 12, value: "+14155512125", label: "Primary" })]),
    })
    renderInPage(
      <>
        <PhoneSection />
        <EmailSection />
      </>,
      { page: "profile", handlers: server.handlers },
    )
    const alert = await screen.findByText("Couldn't load emails")
    expect(alert.closest('[data-slot="state-frame"]')?.getAttribute("data-state")).toBe("error")
    expect(meta()).toBeUndefined()
    await screen.findByRole("table", { name: "Phone" })
    await waitFor(() => expect(server.counts).toEqual({ Email: 1, Mobile: 1, Landline: 1 }))

    fails = false
    fireEvent.click(within(section()).getByRole("button", { name: "Retry" }))
    await screen.findByRole("table", { name: "Email" })
    expect(server.counts).toEqual({ Email: 2, Mobile: 1, Landline: 1 })
    expect(meta()).toBe("3")
  })

  it.each([
    ["a network failure", () => HttpResponse.error()],
    ["an unexpected body", () => HttpResponse.json({ not: "a list" })],
  ])("shows the load error for %s", async (_case, answer) => {
    renderInPage(<EmailSection />, { page: "profile", handlers: listServer({ Email: answer }).handlers })
    expect(await screen.findByText("Couldn't load emails")).toBeTruthy()
  })

  it("a repeated failure is re-announced once it arrives", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const { handlers } = listServer({
      Email: async () => {
        calls += 1
        if (calls > 1) await gate
        return HttpResponse.json({ message: "boom" }, { status: 500 })
      },
    })
    renderInPage(<EmailSection />, { page: "profile", handlers })
    const first = await screen.findByText("Couldn't load emails")
    fireEvent.click(within(section()).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(calls).toBe(2))
    expect(screen.getByText("Couldn't load emails")).toBe(first)

    release()
    await waitFor(() => expect(screen.getByText("Couldn't load emails")).not.toBe(first))
  })

  it("a 403 shows the Section's no-access row", async () => {
    renderInPage(<EmailSection />, { page: "profile", handlers: listServer({ Email: fail(403) }).handlers })
    expect(await screen.findByText("You don't have access to this in your current account")).toBeTruthy()
    expect(section().querySelector('[data-slot="no-access"]')?.getAttribute("data-level")).toBe("section")
    expect(screen.queryByText("Couldn't load emails")).toBeNull()
  })

  it("a session end shows nothing in the frame (the shell owns it), and the landmark stays", async () => {
    const { handlers } = listServer({ Email: () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }) })
    renderInPage(<EmailSection />, { page: "profile", handlers })
    await waitFor(() => expect(frame()).toBeNull())
    expect(section().id).toBe("email")
    expect(screen.queryByText("Couldn't load emails")).toBeNull()
  })

  it("a failed background revalidation keeps the cached table", async () => {
    let fails = false
    let mutate: ScopedMutator | undefined
    function Probe() {
      const { mutate: scoped } = useSWRConfig()
      useEffect(() => {
        mutate = scoped
      }, [scoped])
      return null
    }
    const server = listServer({ Email: () => (fails ? fail()() : HttpResponse.json(EMAILS)) })
    renderInPage(
      <>
        <EmailSection />
        <Probe />
      </>,
      { page: "profile", handlers: server.handlers },
    )
    await screen.findByRole("table", { name: "Email" })
    fails = true
    await mutate?.(keys.contactPoints("Email"))
    await waitFor(() => expect(server.counts.Email).toBe(2))
    expect(frame()?.getAttribute("data-state")).toBe("ready")
    expect(screen.queryByText("Couldn't load emails")).toBeNull()
  })
})

describe("EmailSection: accessibility", () => {
  it.each([
    ["light", 360],
    ["dark", 360],
    ["light", 1024],
    ["dark", 1024],
  ] as const)("has no axe violations in %s mode at %i px", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await renderLoaded()
    expect(await axeViolations()).toEqual([])
  })

  it.each(["light", "dark"])("has no axe violations while loading, empty and with the load error in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    const loading = renderInPage(<EmailSection />, { page: "profile", handlers: listServer({ Email: () => new Promise<Response>(() => undefined) }).handlers })
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(await axeViolations()).toEqual([])
    loading.unmount()

    const empty = await renderLoaded({ Email: ok([]) })
    expect(await axeViolations()).toEqual([])
    empty.unmount()

    renderInPage(<EmailSection />, { page: "profile", handlers: listServer({ Email: fail() }).handlers })
    await screen.findByText("Couldn't load emails")
    expect(await axeViolations()).toEqual([])
  })
})
