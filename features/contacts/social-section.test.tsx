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
import { EmailSection, SocialSection } from "."

/**
 * Story 3.7 (NG-9025): the Social media read view on `/`, rendered the way
 * `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers the "Read"
 * row of the I/O matrix in `spec-3-7-manage-social-media-links.md`, the
 * anchor attributes of every rendered link, and the load states.
 */

const LIST = "/api/1h/v2/user/contact-point/list"

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

const link = (overrides: Wire): Wire => contactPointWire({ type: "Social Media", label: "Personal", isVerified: null, phoneNumberRegion: null, ...overrides })

/** The matrix's "Read" row: an https link 51 and a legacy handle 52. */
const LINKS: Wire[] = [link({ id: 51, value: "https://x.com/ann" }), link({ id: 52, value: "@ann" })]

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

const section = (): HTMLElement => screen.getByRole("region", { name: "Social media" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const meta = (): string | null | undefined => section().querySelector('[data-slot="section-meta"]')?.textContent

async function renderLoaded(answers: Partial<Record<string, Answer>> = { "Social Media": ok(LINKS) }) {
  const server = listServer(answers)
  const result = renderInPage(<SocialSection />, { page: "profile", handlers: server.handlers })
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  return { ...result, counts: server.counts }
}

/** The desktop table's body rows, as their cells' text (without the actions cell). */
function tableRows(): string[][] {
  const table = within(section()).getByRole("table", { name: "Social media" })
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

describe("SocialSection: loading", () => {
  it("renders the landmark and h2 from the first render, a 3-row table skeleton with the Link column", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { handlers } = listServer({
      "Social Media": async () => {
        await gate
        return HttpResponse.json(LINKS)
      },
    })
    renderInPage(<SocialSection />, { page: "profile", handlers })
    const landmark = section()
    expect(landmark.id).toBe("social")
    expect(screen.getByRole("heading", { level: 2, name: "Social media" }).id).toBe("social-heading")
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(frame()?.getAttribute("data-level")).toBe("section")
    expect(frame()?.querySelector('[data-slot="frame-skeleton"]')?.getAttribute("data-variant")).toBe("table")
    expect(frame()?.querySelectorAll('[data-slot="frame-skeleton-row"]')).toHaveLength(3)
    expect([...(frame()?.querySelectorAll('[data-slot="frame-skeleton-header"] span') ?? [])].map((cell) => cell.textContent)).toEqual(["Link"])
    expect(screen.getByText("Loading social links")).toBeTruthy()
    expect(meta()).toBeUndefined()

    release()
    await screen.findByRole("table", { name: "Social media" })
    // The same landmark, never remounted.
    expect(section()).toBe(landmark)
  })
})

describe("SocialSection: read view", () => {
  it("an https link is an anchor (new tab, noopener noreferrer, link-text); a handle is plain text; count 2", async () => {
    await renderLoaded()
    expect(tableRows()).toEqual([["https://x.com/ann"], ["@ann"]])
    const anchors = within(section()).getAllByRole("link")
    expect(anchors).toHaveLength(1)
    const [anchor] = anchors
    expect(anchor.textContent).toBe("https://x.com/ann")
    expect(anchor.getAttribute("href")).toBe("https://x.com/ann")
    expect(anchor.getAttribute("target")).toBe("_blank")
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer")
    expect(anchor.className).toContain("text-link-text")
    expect(anchor.className).toContain("focus-ring")
    const handle = within(section()).getByText("@ann")
    expect(handle.closest("a")).toBeNull()
    expect(handle.classList.contains("cell-strong")).toBe(true)
    expect(meta()).toBe("2")
  })

  it("every rendered link carries exactly target=_blank and rel=noopener noreferrer; rejected values never become links", async () => {
    await renderLoaded({
      "Social Media": ok([
        link({ id: 1, value: "https://linkedin.com/in/ann" }),
        link({ id: 2, value: " https://github.com/ann " }),
        link({ id: 3, value: "http://insecure.example/ann" }),
        link({ id: 4, value: "javascript:alert(1)" }),
        link({ id: 5, value: "mailto:ann@example.com" }),
        link({ id: 7, value: "https://x.com@evil.example" }),
        link({ id: 6, value: "https://www.example.com/a-very-long-path/that/keeps/going/and/going/without/any/space/to/break/at/all" }),
      ]),
    })
    const anchors = within(section()).getAllByRole("link")
    expect(anchors.map((anchor) => anchor.getAttribute("href"))).toEqual([
      "https://linkedin.com/in/ann",
      "https://github.com/ann",
      "https://www.example.com/a-very-long-path/that/keeps/going/and/going/without/any/space/to/break/at/all",
    ])
    for (const anchor of anchors) {
      expect(anchor.getAttribute("target")).toBe("_blank")
      expect(anchor.getAttribute("rel")).toBe("noopener noreferrer")
    }
    for (const text of ["http://insecure.example/ann", "javascript:alert(1)", "mailto:ann@example.com", "https://x.com@evil.example"]) {
      expect(within(section()).getByText(text).closest("a")).toBeNull()
    }
    expect(section().querySelectorAll("a")).toHaveLength(3)
  })

  it("shows the Link column header and the visually hidden Actions header in a table named by the h2; long links wrap", async () => {
    await renderLoaded()
    const table = within(section()).getByRole("table", { name: "Social media" })
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Link", "Actions"])
    expect(table.getAttribute("aria-labelledby")).toBe("social-heading")
    expect(within(section()).getByText("@ann").closest("td")?.className).toContain("[overflow-wrap:anywhere]")
  })

  it("drops rows without a value and doesn't count them; keys repeated ids apart", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await renderLoaded({
      "Social Media": ok([
        link({ id: 1, value: null }),
        link({ id: 2, value: "" }),
        link({ id: null, value: "https://none.example/ann" }),
        link({ id: 7, value: "https://seven.example/ann" }),
        link({ id: 7, value: "https://again.example/ann" }),
      ]),
    })
    expect(tableRows().map((row) => row[0])).toEqual(["https://none.example/ann", "https://seven.example/ann", "https://again.example/ann"])
    expect(meta()).toBe("3")
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/)
    errors.mockRestore()
  })

  it("each row's kebab is named by its link and lists only Edit and Remove; no inline actions", async () => {
    stubLayoutApis()
    await renderLoaded()
    for (const value of ["https://x.com/ann", "@ann"]) {
      expect(within(section()).getByRole("button", { name: `More actions for ${value}` })).toBeTruthy()
    }
    // No inline actions: the only buttons in the table are the kebabs.
    const table = within(section()).getByRole("table", { name: "Social media" })
    expect(within(table).getAllByRole("button").map((action) => action.getAttribute("aria-label") ?? action.textContent)).toEqual([
      "More actions for https://x.com/ann",
      "More actions for @ann",
    ])
    await act(async () => fireEvent.keyDown(within(section()).getByRole("button", { name: "More actions for https://x.com/ann" }), { key: "Enter" }))
    const menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Remove"])
  })

  it("reports ready to the Section frame and the saved count to the Section index", async () => {
    let counts: ReturnType<typeof useSectionCounts> = {}
    function CountsProbe() {
      counts = useSectionCounts()
      return null
    }
    const { handlers } = listServer({ "Social Media": ok(LINKS) })
    const { frameReady } = renderInPage(
      <SectionCountProvider>
        <SocialSection />
        <CountsProbe />
      </SectionCountProvider>,
      { page: "profile", handlers },
    )
    await screen.findByRole("table", { name: "Social media" })
    await waitFor(() => expect(frameReady).toHaveBeenCalledWith("social"))
    await waitFor(() => expect(counts.social).toBe(2))
  })
})

describe("SocialSection: empty", () => {
  it("shows one \"No social links yet · Add link\" row and count 0", async () => {
    await renderLoaded({ "Social Media": ok([]) })
    const table = within(section()).getByRole("table", { name: "Social media" })
    const empty = table.querySelector('[data-slot="empty-state"]')
    expect(empty?.getAttribute("data-variant")).toBe("row")
    expect(empty?.textContent).toBe("No social links yet·Add link")
    expect(empty?.querySelector("td")?.getAttribute("colspan")).toBe("2")
    expect(meta()).toBe("0")
  })
})

describe("SocialSection: below 768 px", () => {
  it("shows stacked cards: the link on line 1, the kebab on the right", async () => {
    stubViewport(360)
    await renderLoaded()
    expect(within(section()).queryByRole("table")).toBeNull()
    const cards = within(within(section()).getByRole("list", { name: "Social media" })).getAllByRole("listitem")
    expect(cards).toHaveLength(2)
    const [line1] = [...cards[0].querySelectorAll(":scope > div:first-child > div")]
    expect([...line1.querySelectorAll("[data-column]")].map((cell) => cell.getAttribute("data-column"))).toEqual(["link"])
    expect(line1.textContent).toBe("Link: https://x.com/ann")
    expect(within(cards[0]).getByRole("link").getAttribute("target")).toBe("_blank")
    expect(within(cards[0]).getByRole("button", { name: "More actions for https://x.com/ann" })).toBeTruthy()
  })
})

describe("SocialSection: load error", () => {
  it("a failed read shows \"Couldn't load social links\" + Retry; Retry revalidates only the Social Media key; Email is unaffected", async () => {
    let fails = true
    const server = listServer({
      "Social Media": () => (fails ? fail()() : HttpResponse.json(LINKS)),
      Email: ok([contactPointWire({ id: 42, value: "ann@example.com", type: "Email", label: "Primary", phoneNumberRegion: null })]),
    })
    renderInPage(
      <>
        <EmailSection />
        <SocialSection />
      </>,
      { page: "profile", handlers: server.handlers },
    )
    const alert = await screen.findByText("Couldn't load social links")
    expect(alert.closest('[data-slot="state-frame"]')?.getAttribute("data-state")).toBe("error")
    expect(meta()).toBeUndefined()
    await screen.findByRole("table", { name: "Email" })
    await waitFor(() => expect(server.counts).toEqual({ "Social Media": 1, Email: 1 }))

    fails = false
    fireEvent.click(within(section()).getByRole("button", { name: "Retry" }))
    await screen.findByRole("table", { name: "Social media" })
    expect(server.counts).toEqual({ "Social Media": 2, Email: 1 })
    expect(meta()).toBe("2")
  })

  it.each([
    ["a network failure", () => HttpResponse.error()],
    ["an unexpected body", () => HttpResponse.json({ not: "a list" })],
  ])("shows the load error for %s", async (_case, answer) => {
    renderInPage(<SocialSection />, { page: "profile", handlers: listServer({ "Social Media": answer }).handlers })
    expect(await screen.findByText("Couldn't load social links")).toBeTruthy()
  })

  it("a repeated failure is re-announced once it arrives", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const { handlers } = listServer({
      "Social Media": async () => {
        calls += 1
        if (calls > 1) await gate
        return HttpResponse.json({ message: "boom" }, { status: 500 })
      },
    })
    renderInPage(<SocialSection />, { page: "profile", handlers })
    const first = await screen.findByText("Couldn't load social links")
    fireEvent.click(within(section()).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(calls).toBe(2))
    expect(screen.getByText("Couldn't load social links")).toBe(first)

    release()
    await waitFor(() => expect(screen.getByText("Couldn't load social links")).not.toBe(first))
  })

  it("a 403 shows the Section's no-access row", async () => {
    renderInPage(<SocialSection />, { page: "profile", handlers: listServer({ "Social Media": fail(403) }).handlers })
    expect(await screen.findByText("You don't have access to this in your current account")).toBeTruthy()
    expect(section().querySelector('[data-slot="no-access"]')?.getAttribute("data-level")).toBe("section")
    expect(screen.queryByText("Couldn't load social links")).toBeNull()
  })

  it("a session end shows nothing in the frame (the shell owns it), and the landmark stays", async () => {
    const { handlers } = listServer({ "Social Media": () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }) })
    renderInPage(<SocialSection />, { page: "profile", handlers })
    await waitFor(() => expect(frame()).toBeNull())
    expect(section().id).toBe("social")
    expect(screen.queryByText("Couldn't load social links")).toBeNull()
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
    const server = listServer({ "Social Media": () => (fails ? fail()() : HttpResponse.json(LINKS)) })
    renderInPage(
      <>
        <SocialSection />
        <Probe />
      </>,
      { page: "profile", handlers: server.handlers },
    )
    await screen.findByRole("table", { name: "Social media" })
    fails = true
    await mutate?.(keys.contactPoints("Social Media"))
    await waitFor(() => expect(server.counts["Social Media"]).toBe(2))
    expect(frame()?.getAttribute("data-state")).toBe("ready")
    expect(screen.queryByText("Couldn't load social links")).toBeNull()
  })
})

describe("SocialSection: accessibility", () => {
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
    const loading = renderInPage(<SocialSection />, { page: "profile", handlers: listServer({ "Social Media": () => new Promise<Response>(() => undefined) }).handlers })
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(await axeViolations()).toEqual([])
    loading.unmount()

    const empty = await renderLoaded({ "Social Media": ok([]) })
    expect(await axeViolations()).toEqual([])
    empty.unmount()

    renderInPage(<SocialSection />, { page: "profile", handlers: listServer({ "Social Media": fail() }).handlers })
    await screen.findByText("Couldn't load social links")
    expect(await axeViolations()).toEqual([])
  })
})

it("never opens portal or other 1health destinations in a new tab", async () => {
  const destinations = ["https://1health.app.1health.io", "https://1health.demo.1health.io/u", "https://dev.1hdev.io", "https://1health.app.1health.io./u", "https://www.1health.io", "https://sub.dev.1hdev.io/u"]
  await renderLoaded({ "Social Media": ok(destinations.map((value, index) => link({ id: 100 + index, value }))) })
  for (const value of destinations) {
    expect(within(section()).getByText(value)).toBeTruthy()
    expect(within(section()).queryByRole("link", { name: value })).toBeNull()
  }
})

it("repeated Retry presses join one contact read", async () => {
  let recover = false
  let release = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  const server = listServer({ "Social Media": async () => {
    if (!recover) return fail()()
    await gate
    return ok(LINKS)()
  } })
  renderInPage(<SocialSection />, { page: "profile", handlers: server.handlers })
  const retry = await within(section()).findByRole("button", { name: "Retry" })
  recover = true
  await act(async () => {
    fireEvent.click(retry)
    fireEvent.click(retry)
  })
  await waitFor(() => expect(server.counts["Social Media"]).toBe(2))
  await act(async () => release())
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  expect(server.counts["Social Media"]).toBe(2)
})
