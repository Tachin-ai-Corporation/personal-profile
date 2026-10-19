import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { useEffect } from "react"
import { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SectionCountProvider, useSectionCounts } from "@/features/shell"
import { keys } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { contactPointWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { PhoneSection } from "."

/**
 * Story 3.1 (NG-9023): the Phone read view on `/`, rendered the way
 * `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers every read
 * row of the I/O matrix in `spec-3-1-contact-point-engine-and-phone-read-view.md`.
 */

const LIST = "/api/1h/v2/user/contact-point/list"

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

/** The matrix's "Read" row: Mobile [Work 11, Primary 12 (notifications on)], Landline [Home 21]. */
const MOBILE: Wire[] = [
  contactPointWire({ id: 11, value: "+14155550111", label: "Work", isVerified: false, isNotificationEnabled: false }),
  contactPointWire({ id: 12, value: "+14155512125", label: "Primary", isVerified: true, isNotificationEnabled: true }),
]
const LANDLINE: Wire[] = [contactPointWire({ id: 21, value: "+442071838750", type: "Landline", label: "Home", isVerified: false, phoneNumberRegion: "gb" })]

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

const section = (): HTMLElement => screen.getByRole("region", { name: "Phone" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const meta = (): string | null | undefined => section().querySelector('[data-slot="section-meta"]')?.textContent

async function renderLoaded(answers: Partial<Record<string, Answer>> = { Mobile: ok(MOBILE), Landline: ok(LANDLINE) }) {
  const server = listServer(answers)
  const result = renderInPage(<PhoneSection />, { page: "profile", handlers: server.handlers })
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  return { ...result, counts: server.counts }
}

/** The desktop table's body rows, as their cells' text (without the actions cell). */
function tableRows(): string[][] {
  const table = within(section()).getByRole("table", { name: "Phone" })
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

describe("PhoneSection: loading", () => {
  it("renders the landmark and h2 from the first render, a 3-row table skeleton with the five column headers", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { handlers } = listServer({
      Mobile: async () => {
        await gate
        return HttpResponse.json(MOBILE)
      },
      Landline: ok(LANDLINE),
    })
    renderInPage(<PhoneSection />, { page: "profile", handlers })
    const landmark = section()
    expect(landmark.id).toBe("phone")
    expect(screen.getByRole("heading", { level: 2, name: "Phone" }).id).toBe("phone-heading")
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(frame()?.getAttribute("data-level")).toBe("section")
    expect(frame()?.querySelector('[data-slot="frame-skeleton"]')?.getAttribute("data-variant")).toBe("table")
    expect(frame()?.querySelectorAll('[data-slot="frame-skeleton-row"]')).toHaveLength(3)
    expect([...(frame()?.querySelectorAll('[data-slot="frame-skeleton-header"] span') ?? [])].map((cell) => cell.textContent)).toEqual([
      "Number",
      "Label",
      "Type",
      "Status",
      "Notifications",
    ])
    expect(screen.getByText("Loading phones")).toBeTruthy()
    expect(meta()).toBeUndefined()

    release()
    await screen.findByRole("table", { name: "Phone" })
    // The same landmark, never remounted.
    expect(section()).toBe(landmark)
  })

  it("stays loading until both lists have loaded", async () => {
    const { handlers } = listServer({ Mobile: ok(MOBILE), Landline: () => new Promise<Response>(() => undefined) })
    renderInPage(<PhoneSection />, { page: "profile", handlers })
    await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("loading"))
    expect(screen.queryByRole("table")).toBeNull()
  })
})

describe("PhoneSection: read view", () => {
  it("merges Mobile and Landline: Primary first, then the API order; count 3", async () => {
    await renderLoaded()
    expect(tableRows()).toEqual([
      ["🇺🇸+1 (415) 551-2125", "Primary", "Mobile", "Verified", "On"],
      ["🇺🇸+1 (415) 555-0111", "Work", "Mobile", "Not verified", NA],
      ["🇬🇧+44 20 7183 8750", "Home", "Landline", "", NA],
    ])
    expect(meta()).toBe("3")
  })

  it("shows the real column headers in a table named by the h2", async () => {
    await renderLoaded()
    const table = within(section()).getByRole("table", { name: "Phone" })
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Number", "Label", "Type", "Status", "Notifications", "Actions"])
    expect(table.getAttribute("aria-labelledby")).toBe("phone-heading")
  })

  it("shows the flag as decoration and the number formatted in cell-strong", async () => {
    await renderLoaded()
    const number = within(section()).getByText("+1 (415) 551-2125")
    expect(number.classList.contains("cell-strong")).toBe(true)
    const flags = within(section()).getAllByText(/^(🇺🇸|🇬🇧)$/u)
    expect(flags.map((flag) => [flag.textContent, flag.getAttribute("aria-hidden")])).toEqual([
      ["🇺🇸", "true"],
      ["🇺🇸", "true"],
      ["🇬🇧", "true"],
    ])
  })

  it("gives the Primary row the filled primary chip and every other label the plain chip", async () => {
    await renderLoaded()
    expect(within(section()).getByText("Primary").getAttribute("data-variant")).toBe("primary")
    expect(within(section()).getByText("Work").getAttribute("data-variant")).toBe("label")
    expect(within(section()).getByText("Home").getAttribute("data-variant")).toBe("label")
  })

  it("shows the status as icon + word, and none on a Home row", async () => {
    await renderLoaded()
    const badges = [...section().querySelectorAll('[data-slot="status-badge"]')]
    expect(badges.map((badge) => [badge.getAttribute("data-status"), badge.textContent])).toEqual([
      ["verified", "Verified"],
      ["notVerified", "Not verified"],
    ])
    for (const badge of badges) expect(badge.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("shows Off (muted) on a Primary row with notifications off", async () => {
    await renderLoaded({ Mobile: ok([contactPointWire({ id: 12, label: "Primary", isNotificationEnabled: false })]), Landline: ok([]) })
    const off = within(section()).getByText("Off")
    expect(off.classList.contains("text-muted-foreground")).toBe(true)
  })

  it("keeps the API order without a Primary, Mobile rows before Landline rows", async () => {
    await renderLoaded({
      Mobile: ok([contactPointWire({ id: 1, value: "+14155550001", label: "Work" }), contactPointWire({ id: 2, value: "+14155550002", label: "Personal" })]),
      Landline: ok([contactPointWire({ id: 3, value: "+14155550003", type: "Landline", label: "Main" })]),
    })
    expect(tableRows().map((row) => row[1])).toEqual(["Work", "Personal", "Main"])
  })

  it("puts the Mobile Primary first over a legacy Landline Primary", async () => {
    await renderLoaded({
      Mobile: ok([contactPointWire({ id: 1, value: "+14155550001", label: "Work" }), contactPointWire({ id: 2, value: "+14155550002", label: "Primary" })]),
      Landline: ok([contactPointWire({ id: 3, value: "+14155550003", type: "Landline", label: "Primary" })]),
    })
    expect(tableRows()).toEqual([
      ["🇺🇸+1 (415) 555-0002", "Primary", "Mobile", "Verified", "On"],
      ["🇺🇸+1 (415) 555-0001", "Work", "Mobile", "Verified", NA],
      ["🇺🇸+1 (415) 555-0003", "Primary", "Landline", "Verified", NA],
    ])
    // Only the Primary phone gets the filled chip; the legacy Landline Primary reads as a plain label.
    expect([...section().querySelectorAll('[data-slot="chip"]')].map((chip) => chip.getAttribute("data-variant"))).toEqual(["primary", "label", "label"])
  })

  it("shows the \"—\" of a non-Primary row hidden from assistive tech, with \"Not applicable\" for screen readers", async () => {
    await renderLoaded()
    const dash = within(section()).getAllByText("—")[0]
    expect(dash.getAttribute("aria-hidden")).toBe("true")
    expect(dash.nextElementSibling?.textContent).toBe("Not applicable")
    expect(dash.nextElementSibling?.classList.contains("sr-only")).toBe(true)
  })

  it("keys rows apart when a list repeats an id", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await renderLoaded({ Mobile: ok([contactPointWire({ id: 7, value: "+14155550007", label: "Work" }), contactPointWire({ id: 7, value: "+14155550008", label: "Home" })]), Landline: ok([contactPointWire({ id: 7, value: "+14155550009", type: "Landline", label: "Main" })]) })
    expect(tableRows().map((row) => row[1])).toEqual(["Work", "Home", "Main"])
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/)
    errors.mockRestore()
  })

  it("shows no flag for a region the phone helpers don't know", async () => {
    await renderLoaded({ Mobile: ok([contactPointWire({ id: 1, value: "+442071838750", label: "Work", phoneNumberRegion: "uk" })]), Landline: ok([]) })
    // The number falls back to the international form, with no bogus regional-indicator glyphs before it.
    expect(tableRows()[0][0]).toBe("+44 20 7183 8750")
  })

  it("drops rows without a value and doesn't count them; a row without a label shows no chip", async () => {
    await renderLoaded({
      Mobile: ok([contactPointWire({ id: 1, value: null }), contactPointWire({ id: 2, value: "", label: "Work" }), contactPointWire({ id: null, value: "+14155550004", label: null })]),
      Landline: ok([]),
    })
    expect(tableRows()).toEqual([["🇺🇸+1 (415) 555-0004", "", "Mobile", "Verified", NA]])
    expect(section().querySelector('[data-slot="chip"]')).toBeNull()
    expect(meta()).toBe("1")
  })

  it("formats a GB number internationally and reads a missing region as US", async () => {
    await renderLoaded({
      Mobile: ok([contactPointWire({ id: 1, value: "+14155552671", label: "Work", phoneNumberRegion: null })]),
      Landline: ok([contactPointWire({ id: 2, value: "+442071838750", type: "Landline", label: "Work", phoneNumberRegion: "gb" })]),
    })
    expect(tableRows().map((row) => row[0])).toEqual(["🇺🇸+1 (415) 555-2671", "🇬🇧+44 20 7183 8750"])
  })

  it("reports ready to the Section frame and the saved count to the Section index", async () => {
    let counts: ReturnType<typeof useSectionCounts> = {}
    function CountsProbe() {
      counts = useSectionCounts()
      return null
    }
    const { handlers } = listServer({ Mobile: ok(MOBILE), Landline: ok(LANDLINE) })
    const { frameReady } = renderInPage(
      <SectionCountProvider>
        <PhoneSection />
        <CountsProbe />
      </SectionCountProvider>,
      { page: "profile", handlers },
    )
    await screen.findByRole("table", { name: "Phone" })
    await waitFor(() => expect(frameReady).toHaveBeenCalledWith("phone"))
    await waitFor(() => expect(counts.phone).toBe(3))
  })
})

describe("PhoneSection: empty", () => {
  it("shows one \"No phones yet\" row and count 0", async () => {
    await renderLoaded({ Mobile: ok([]), Landline: ok([]) })
    const table = within(section()).getByRole("table", { name: "Phone" })
    const empty = table.querySelector('[data-slot="empty-state"]')
    expect(empty?.getAttribute("data-variant")).toBe("row")
    expect(empty?.textContent).toBe("No phones yet·Add phone")
    expect(empty?.querySelector("td")?.getAttribute("colspan")).toBe("6")
    expect(meta()).toBe("0")
  })
})

describe("PhoneSection: below 768 px", () => {
  it("shows stacked cards: line 1 number and status, line 2 label chip, type and notifications (muted)", async () => {
    stubViewport(360)
    await renderLoaded()
    expect(within(section()).queryByRole("table")).toBeNull()
    const list = within(section()).getByRole("list", { name: "Phone" })
    const cards = within(list).getAllByRole("listitem")
    expect(cards).toHaveLength(3)
    const [line1, line2] = [...cards[0].querySelectorAll(":scope > div:first-child > div")]
    expect([...line1.querySelectorAll("[data-column]")].map((cell) => cell.getAttribute("data-column"))).toEqual(["number", "status"])
    expect([...line2.querySelectorAll("[data-column]")].map((cell) => cell.getAttribute("data-column"))).toEqual(["label", "type", "notifications"])
    expect(line2.classList.contains("text-muted-foreground")).toBe(true)
    expect(line1.textContent).toBe("Number: 🇺🇸+1 (415) 551-2125Status: Verified")
    expect(line2.textContent).toBe("Label: PrimaryType: MobileNotifications: On")
  })

  it("shows the empty line as a card", async () => {
    stubViewport(360)
    await renderLoaded({ Mobile: ok([]), Landline: ok([]) })
    expect(within(within(section()).getByRole("list", { name: "Phone" })).getByRole("listitem").textContent).toBe("No phones yet·Add phone")
  })
})

describe("PhoneSection: load error", () => {
  it("a failed Landline read shows \"Couldn't load phones\" + Retry; Retry revalidates only the two Phone keys", async () => {
    let landlineFails = true
    const server = listServer({ Mobile: ok(MOBILE), Landline: () => (landlineFails ? fail()() : HttpResponse.json(LANDLINE)) })
    renderInPage(<PhoneSection />, { page: "profile", handlers: server.handlers })
    const alert = await screen.findByText("Couldn't load phones")
    expect(alert.closest('[data-slot="state-frame"]')?.getAttribute("data-state")).toBe("error")
    expect(meta()).toBeUndefined()
    await waitFor(() => expect(server.counts).toEqual({ Mobile: 1, Landline: 1 }))

    landlineFails = false
    fireEvent.click(within(section()).getByRole("button", { name: "Retry" }))
    await screen.findByRole("table", { name: "Phone" })
    expect(server.counts).toEqual({ Mobile: 2, Landline: 2 })
    expect(meta()).toBe("3")
  })

  it.each([
    ["Mobile", { Mobile: fail(), Landline: ok(LANDLINE) }],
    ["a network failure", { Mobile: () => HttpResponse.error(), Landline: ok(LANDLINE) }],
    ["an unexpected body", { Mobile: () => HttpResponse.json({ not: "a list" }), Landline: ok(LANDLINE) }],
  ])("shows the load error for %s", async (_case, answers) => {
    const { handlers } = listServer(answers)
    renderInPage(<PhoneSection />, { page: "profile", handlers })
    expect(await screen.findByText("Couldn't load phones")).toBeTruthy()
  })

  it("a repeated failure is re-announced once it arrives", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const { handlers } = listServer({
      Mobile: ok(MOBILE),
      Landline: async () => {
        calls += 1
        if (calls > 1) await gate
        return HttpResponse.json({ message: "boom" }, { status: 500 })
      },
    })
    renderInPage(<PhoneSection />, { page: "profile", handlers })
    const first = await screen.findByText("Couldn't load phones")
    fireEvent.click(within(section()).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(calls).toBe(2))
    expect(screen.getByText("Couldn't load phones")).toBe(first)

    release()
    await waitFor(() => expect(screen.getByText("Couldn't load phones")).not.toBe(first))
  })

  it("a 403 shows the Section's no-access row (even when the other read fails too)", async () => {
    const { handlers } = listServer({ Mobile: fail(500), Landline: fail(403) })
    renderInPage(<PhoneSection />, { page: "profile", handlers })
    expect(await screen.findByText("You don't have access to this in your current account")).toBeTruthy()
    expect(section().querySelector('[data-slot="no-access"]')?.getAttribute("data-level")).toBe("section")
    expect(screen.queryByText("Couldn't load phones")).toBeNull()
  })

  it("a session end shows nothing in the frame (the shell owns it), and the landmark stays", async () => {
    const { handlers } = listServer({ Mobile: fail(403), Landline: () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }) })
    renderInPage(<PhoneSection />, { page: "profile", handlers })
    await waitFor(() => expect(frame()).toBeNull())
    expect(section().id).toBe("phone")
    expect(screen.queryByText("Couldn't load phones")).toBeNull()
    expect(screen.queryByText("You don't have access to this in your current account")).toBeNull()
  })

  it("a failed background revalidation keeps the cached table", async () => {
    let landlineFails = false
    let mutate: ScopedMutator | undefined
    function Probe() {
      const { mutate: scoped } = useSWRConfig()
      useEffect(() => {
        mutate = scoped
      }, [scoped])
      return null
    }
    const server = listServer({ Mobile: ok(MOBILE), Landline: () => (landlineFails ? fail()() : HttpResponse.json(LANDLINE)) })
    renderInPage(
      <>
        <PhoneSection />
        <Probe />
      </>,
      { page: "profile", handlers: server.handlers },
    )
    await screen.findByRole("table", { name: "Phone" })

    landlineFails = true
    await mutate?.(keys.contactPoints("Landline"))
    await waitFor(() => expect(server.counts.Landline).toBe(2))
    expect(frame()?.getAttribute("data-state")).toBe("ready")
    expect(screen.getByRole("table", { name: "Phone" })).toBeTruthy()
    expect(screen.queryByText("Couldn't load phones")).toBeNull()
  })
})

describe("PhoneSection: accessibility", () => {
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
    const loading = renderInPage(<PhoneSection />, { page: "profile", handlers: listServer({ Mobile: () => new Promise<Response>(() => undefined) }).handlers })
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(await axeViolations()).toEqual([])
    loading.unmount()

    const empty = await renderLoaded({ Mobile: ok([]), Landline: ok([]) })
    expect(await axeViolations()).toEqual([])
    empty.unmount()

    renderInPage(<PhoneSection />, { page: "profile", handlers: listServer({ Mobile: fail() }).handlers })
    await screen.findByText("Couldn't load phones")
    expect(await axeViolations()).toEqual([])
  })
})

describe("PhoneSection: a repeated id's kebab (deferred from Story 3.5, fixed in Story 3.6)", () => {
  it("offers no Remove on a repeated id's later occurrence; the first occurrence keeps it", async () => {
    stubLayoutApis()
    await renderLoaded({
      Mobile: ok([...MOBILE, contactPointWire({ id: 12, value: "+14155550112", label: "Work", isVerified: true, isNotificationEnabled: false })]),
      Landline: ok(LANDLINE),
    })
    const menuOf = async (number: string): Promise<string[]> => {
      await act(async () => fireEvent.keyDown(within(section()).getByRole("button", { name: `More actions for ${number}` }), { key: "Enter" }))
      const menu = await screen.findByRole("menu")
      const items = within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.firstElementChild?.firstElementChild?.textContent ?? item.textContent ?? "")
      await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
      return items
    }
    // The repeat is locked like a row without an id: Edit only (its edit row could never be restored or sent).
    expect(await menuOf("+1 (415) 555-0112")).toEqual(["Edit"])
    expect(await menuOf("+1 (415) 551-2125")).toContain("Remove")
  })
})
