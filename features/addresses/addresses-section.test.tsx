import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { useEffect } from "react"
import useSWR, { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SectionCountProvider, useSectionCounts } from "@/features/shell"
import { keys, type ContactPointType } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubViewport } from "@/test/media"
import { contactPointWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { AddressesSection } from "."

/**
 * Story 4.1 (NG-9026): the Addresses read view on `/`, rendered the way
 * `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers every row of
 * the I/O matrix in `spec-4-1-view-addresses.md` except Proxy. Story 4.2
 * adds the entry points (header Edit and Add address, the empty row's Add
 * address, the row kebab with Edit); the edit view is
 * `addresses-section.edit.test.tsx`.
 */

const LIST = "/api/1h/v2/person/location/list"
const CONTACTS = "/api/1h/v2/user/contact-point/list"

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

/** A backend `PersonLocation` row. */
const location = (overrides: Wire): Wire => ({
  id: 1,
  personLocationType: "Home",
  addressLine1: "1 Pine St",
  addressLine2: null,
  cityName: "SF",
  county: null,
  stateName: "CA",
  postalCode: "94105",
  country: "United States",
  countryCode: "US",
  primary: false,
  validated: false,
  active: true,
  ...overrides,
})

const page = (content: Wire[]) => ({ content, totalElements: content.length, totalPages: 1, number: 0, size: 100 })

/** The matrix's "Read" row: Main Work 2 (verified), then Home 1 (Primary, unverified). Shown as 1, 2. */
const ADDRESSES: Wire[] = [
  location({ id: 2, personLocationType: "Main Work", validated: true }),
  location({ id: 1, addressLine1: "9 Oak Ave", addressLine2: "Apt 4", primary: true }),
]

const ok = (body: Wire | Wire[]): Answer => () => HttpResponse.json(body)
const fail = (status = 500): Answer => () => HttpResponse.json({ message: "boom" }, { status })

function listServer(answer: Answer = ok(page(ADDRESSES))) {
  const counts = { addresses: 0, queries: [] as string[] }
  const handler = http.get(LIST, ({ request }) => {
    counts.addresses += 1
    counts.queries.push(new URL(request.url).search)
    return answer()
  })
  return { counts, handlers: [handler] }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Addresses" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const meta = (): string | null | undefined => section().querySelector('[data-slot="section-meta"]')?.textContent

async function renderLoaded(answer: Answer = ok(page(ADDRESSES))) {
  const server = listServer(answer)
  const result = renderInPage(<AddressesSection />, { page: "profile", handlers: server.handlers })
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  return { ...result, counts: server.counts }
}

/** The desktop table's body rows, as their cells' text. */
function tableRows(): string[][] {
  const table = within(section()).getByRole("table", { name: "Addresses" })
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

/** Story 4.2's entry points: the header Edit and Add address, and a kebab with only Edit on each row with an id. */
function expectEntryPoints(kebabs: readonly string[]): void {
  expect(within(section()).getByRole("button", { name: "Edit" })).toBeTruthy()
  expect(within(section()).getAllByRole("button", { name: "Add address" }).length).toBeGreaterThan(0)
  expect(within(section()).queryAllByRole("button", { name: /^More actions for / }).map((button) => button.getAttribute("aria-label"))).toEqual(
    kebabs.map((name) => `More actions for ${name}`),
  )
}

beforeEach(() => {
  stubViewport(1024)
})
afterEach(() => {
  document.documentElement.classList.remove("dark")
})

describe("AddressesSection: loading", () => {
  it("renders the landmark and h2 from the first render, a 3-row table skeleton with the four column headers", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { handlers } = listServer(async () => {
      await gate
      return HttpResponse.json(page(ADDRESSES))
    })
    renderInPage(<AddressesSection />, { page: "profile", handlers })
    const landmark = section()
    expect(landmark.id).toBe("addresses")
    expect(screen.getByRole("heading", { level: 2, name: "Addresses" }).id).toBe("addresses-heading")
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(frame()?.getAttribute("data-level")).toBe("section")
    expect(frame()?.querySelector('[data-slot="frame-skeleton"]')?.getAttribute("data-variant")).toBe("table")
    expect(frame()?.querySelectorAll('[data-slot="frame-skeleton-row"]')).toHaveLength(3)
    expect([...(frame()?.querySelectorAll('[data-slot="frame-skeleton-header"] span') ?? [])].map((cell) => cell.textContent)).toEqual([
      "Address",
      "Label",
      "Type",
      "Status",
    ])
    expect(screen.getByText("Loading addresses")).toBeTruthy()
    expect(meta()).toBeUndefined()

    release()
    await screen.findByRole("table", { name: "Addresses" })
    // The same landmark, never remounted.
    expect(section()).toBe(landmark)
  })
})

describe("AddressesSection: read view", () => {
  it("reads page 0 of 100 once; Primary first, then the API order; Type as received; Verified or empty; count 2", async () => {
    const { counts } = await renderLoaded()
    expect(tableRows()).toEqual([
      ["9 Oak Ave, Apt 4, SF, CA 94105", "Primary", "Home", ""],
      ["1 Pine St, SF, CA 94105", "", "Main Work", "Verified"],
    ])
    expect(meta()).toBe("2")
    expect(counts.queries).toEqual(["?page=0&size=100"])
  })

  it("shows the real column headers (a hidden Actions header) in a table named by the h2; the address in cell-strong, wrapping", async () => {
    await renderLoaded()
    const table = within(section()).getByRole("table", { name: "Addresses" })
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Address", "Label", "Type", "Status", "Actions"])
    expect(table.getAttribute("aria-labelledby")).toBe("addresses-heading")
    const address = within(section()).getByText("1 Pine St, SF, CA 94105")
    expect(address.classList.contains("cell-strong")).toBe(true)
    expect(address.closest("td")?.className).toContain("[overflow-wrap:anywhere]")
    expect(address.closest("td")?.className).toContain("h-11")
  })

  it("gives only the Primary row the filled Primary chip; Verified is icon + word", async () => {
    await renderLoaded()
    const chips = [...section().querySelectorAll('[data-slot="chip"]')]
    expect(chips.map((chip) => [chip.getAttribute("data-variant"), chip.textContent])).toEqual([["primary", "Primary"]])
    const badges = [...section().querySelectorAll('[data-slot="status-badge"]')]
    expect(badges.map((badge) => [badge.getAttribute("data-status"), badge.textContent])).toEqual([["verified", "Verified"]])
    expect(badges[0].querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("has the 4.2 entry points: header Edit and Add address, a kebab \"More actions for {address}\" per row", async () => {
    await renderLoaded()
    expectEntryPoints(["9 Oak Ave, Apt 4, SF, CA 94105", "1 Pine St, SF, CA 94105"])
  })

  it("appends a non-US country (the non-US row)", async () => {
    await renderLoaded(
      ok(page([location({ addressLine1: "12 King St W", cityName: "Toronto", stateName: "ON", postalCode: "M5H 1A1", country: "Canada", countryCode: "CA" })])),
    )
    expect(tableRows()[0][0]).toBe("12 King St W, Toronto, ON M5H 1A1, Canada")
  })

  it("skips \"n/a\" and blank parts (the sparse row)", async () => {
    await renderLoaded(ok(page([location({ addressLine2: "n/a", stateName: "" })])))
    expect(tableRows()[0][0]).toBe("1 Pine St, SF 94105")
  })

  it("reads the legacy isPrimary / isValidated names from a bare list (the legacy names row)", async () => {
    await renderLoaded(
      ok([
        location({ id: 5, primary: undefined, validated: undefined, personLocationType: "Other Work" }),
        location({ id: 6, addressLine1: "2 Elm St", primary: undefined, validated: undefined, isPrimary: true, isValidated: true }),
      ]),
    )
    expect(tableRows()).toEqual([
      ["2 Elm St, SF, CA 94105", "Primary", "Home", "Verified"],
      ["1 Pine St, SF, CA 94105", "", "Other Work", ""],
    ])
  })

  it("drops inactive rows and doesn't count them (the inactive row)", async () => {
    await renderLoaded(ok(page([location({ id: 1, active: false }), location({ id: 2, addressLine1: "2 Elm St", personLocationType: "Billing" })])))
    expect(tableRows()).toEqual([["2 Elm St, SF, CA 94105", "", "Billing", ""]])
    expect(meta()).toBe("1")
  })

  it("only the first Primary is shown as Primary; repeated and missing ids keep apart; an empty address reads Not provided", async () => {
    await renderLoaded(
      ok(
        page([
          location({ id: 3, addressLine1: "3 Ash St" }),
          location({ id: 7, addressLine1: "7 Fir St", primary: true }),
          location({ id: 7, addressLine1: "7 Fir St B", primary: true }),
          location({ id: null, addressLine1: null, cityName: null, stateName: null, postalCode: null, personLocationType: null }),
        ]),
      ),
    )
    expect(tableRows()).toEqual([
      ["7 Fir St, SF, CA 94105", "Primary", "Home", ""],
      ["3 Ash St, SF, CA 94105", "", "Home", ""],
      ["7 Fir St B, SF, CA 94105", "", "Home", ""],
      ["Not provided", "", "", ""],
    ])
    expect(section().querySelectorAll('[data-slot="chip"]')).toHaveLength(1)
    expect(meta()).toBe("4")
    // Only a row with an id, first occurrence, can be edited: no kebab on the repeat or the id-less row.
    expectEntryPoints(["7 Fir St, SF, CA 94105", "3 Ash St, SF, CA 94105"])
  })

  it("reports ready to the Section frame and the count to the Section index", async () => {
    let counts: ReturnType<typeof useSectionCounts> = {}
    function CountsProbe() {
      counts = useSectionCounts()
      return null
    }
    const { handlers } = listServer()
    const { frameReady } = renderInPage(
      <SectionCountProvider>
        <AddressesSection />
        <CountsProbe />
      </SectionCountProvider>,
      { page: "profile", handlers },
    )
    await screen.findByRole("table", { name: "Addresses" })
    await waitFor(() => expect(frameReady).toHaveBeenCalledWith("addresses"))
    await waitFor(() => expect(counts.addresses).toBe(2))
  })
})

describe("AddressesSection: empty", () => {
  it("reads an empty Spring Page (the backend's shape) as no addresses: the empty row and count 0", async () => {
    await renderLoaded(ok(page([])))
    expect(within(section()).getByRole("table", { name: "Addresses" }).querySelector('[data-slot="empty-state"]')?.textContent).toBe("No addresses yet·Add address")
    expect(meta()).toBe("0")
  })

  it("shows one \"No addresses yet · Add address\" row and count 0, from the page default (a bare list)", async () => {
    renderInPage(<AddressesSection />, { page: "profile" })
    await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
    const table = within(section()).getByRole("table", { name: "Addresses" })
    const empty = table.querySelector('[data-slot="empty-state"]')
    expect(empty?.getAttribute("data-variant")).toBe("row")
    expect(empty?.textContent).toBe("No addresses yet·Add address")
    expect(empty?.querySelector("td")?.getAttribute("colspan")).toBe("5")
    expect(meta()).toBe("0")
    expectEntryPoints([])
  })
})

describe("AddressesSection: below 768 px", () => {
  it("shows stacked cards: line 1 the address, line 2 (muted) the Primary chip, type and Verified", async () => {
    stubViewport(360)
    await renderLoaded(ok(page([location({ id: 1, primary: true, validated: true })])))
    expect(within(section()).queryByRole("table")).toBeNull()
    const cards = within(within(section()).getByRole("list", { name: "Addresses" })).getAllByRole("listitem")
    expect(cards).toHaveLength(1)
    const [line1, line2] = [...cards[0].querySelectorAll(":scope > div:first-child > div")]
    expect([...line1.querySelectorAll("[data-column]")].map((cell) => cell.getAttribute("data-column"))).toEqual(["address"])
    expect([...line2.querySelectorAll("[data-column]")].map((cell) => cell.getAttribute("data-column"))).toEqual(["label", "type", "status"])
    expect(line2.classList.contains("text-muted-foreground")).toBe(true)
    expect(line1.textContent).toBe("Address: 1 Pine St, SF, CA 94105")
    expect(line2.textContent).toBe("Label: PrimaryType: HomeStatus: Verified")
    expectEntryPoints(["1 Pine St, SF, CA 94105"])
  })

  it("shows the empty line as a card", async () => {
    stubViewport(360)
    await renderLoaded(ok(page([])))
    expect(within(section()).getByRole("list", { name: "Addresses" }).textContent).toBe("No addresses yet·Add address")
  })
})

describe("AddressesSection: load error", () => {
  it("a failed read shows \"Couldn't load addresses\" + Retry; Retry revalidates only the Addresses key; the contact reads are unaffected", async () => {
    let fails = true
    const server = listServer(() => (fails ? fail()() : HttpResponse.json(page(ADDRESSES))))
    const contactTypes: string[] = []
    const contacts = http.get(CONTACTS, ({ request }) => {
      contactTypes.push(new URL(request.url).searchParams.get("type") ?? "")
      return HttpResponse.json([contactPointWire({ id: 42 })])
    })
    /** The Phone, Email and Social reads (their Sections are another feature's): each shows its row count once loaded. */
    function ContactRead({ type }: { readonly type: ContactPointType }) {
      const { data } = useSWR<unknown[]>(keys.contactPoints(type))
      return <p>{data ? `${type}: ${data.length}` : `${type}: loading`}</p>
    }
    renderInPage(
      <>
        <ContactRead type="Mobile" />
        <ContactRead type="Email" />
        <ContactRead type="Social Media" />
        <AddressesSection />
      </>,
      { page: "profile", handlers: [...server.handlers, contacts] },
    )
    const alert = await screen.findByText("Couldn't load addresses")
    expect(alert.closest('[data-slot="state-frame"]')?.getAttribute("data-state")).toBe("error")
    expect(meta()).toBeUndefined()
    for (const type of ["Mobile", "Email", "Social Media"]) await screen.findByText(`${type}: 1`)
    expect(server.counts.addresses).toBe(1)
    const contactReads = contactTypes.length

    fails = false
    fireEvent.click(within(section()).getByRole("button", { name: "Retry" }))
    await screen.findByRole("table", { name: "Addresses" })
    expect(server.counts.addresses).toBe(2)
    expect(contactTypes).toHaveLength(contactReads)
    expect(meta()).toBe("2")
  })

  it.each([
    ["a network failure", () => HttpResponse.error()],
    ["an unexpected body", () => HttpResponse.json({ not: "a page" })],
  ])("shows the load error for %s", async (_case, answer) => {
    renderInPage(<AddressesSection />, { page: "profile", handlers: listServer(answer).handlers })
    expect(await screen.findByText("Couldn't load addresses")).toBeTruthy()
  })

  it("a repeated failure is re-announced once it arrives", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const { handlers } = listServer(async () => {
      calls += 1
      if (calls > 1) await gate
      return HttpResponse.json({ message: "boom" }, { status: 500 })
    })
    renderInPage(<AddressesSection />, { page: "profile", handlers })
    const first = await screen.findByText("Couldn't load addresses")
    fireEvent.click(within(section()).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(calls).toBe(2))
    expect(screen.getByText("Couldn't load addresses")).toBe(first)

    release()
    await waitFor(() => expect(screen.getByText("Couldn't load addresses")).not.toBe(first))
  })

  it("a 403 shows the Section's no-access row", async () => {
    renderInPage(<AddressesSection />, { page: "profile", handlers: listServer(fail(403)).handlers })
    expect(await screen.findByText("You don't have access to this in your current account")).toBeTruthy()
    expect(section().querySelector('[data-slot="no-access"]')?.getAttribute("data-level")).toBe("section")
    expect(screen.queryByText("Couldn't load addresses")).toBeNull()
  })

  it("a session end shows nothing in the frame (the shell owns it), and the landmark stays", async () => {
    const { handlers } = listServer(() => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }))
    renderInPage(<AddressesSection />, { page: "profile", handlers })
    await waitFor(() => expect(frame()).toBeNull())
    expect(section().id).toBe("addresses")
    expect(screen.queryByText("Couldn't load addresses")).toBeNull()
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
    const server = listServer(() => (fails ? fail()() : HttpResponse.json(page(ADDRESSES))))
    renderInPage(
      <>
        <AddressesSection />
        <Probe />
      </>,
      { page: "profile", handlers: server.handlers },
    )
    await screen.findByRole("table", { name: "Addresses" })
    fails = true
    await mutate?.(keys.addresses())
    await waitFor(() => expect(server.counts.addresses).toBe(2))
    expect(frame()?.getAttribute("data-state")).toBe("ready")
    expect(screen.queryByText("Couldn't load addresses")).toBeNull()
  })
})

describe("AddressesSection: accessibility", () => {
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

  it.each(["light", "dark"])("has no axe violations while loading, empty, with the load error and with no access in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    const loading = renderInPage(<AddressesSection />, { page: "profile", handlers: listServer(() => new Promise<Response>(() => undefined)).handlers })
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(await axeViolations()).toEqual([])
    loading.unmount()

    const empty = await renderLoaded(ok(page([])))
    expect(await axeViolations()).toEqual([])
    empty.unmount()

    const failed = renderInPage(<AddressesSection />, { page: "profile", handlers: listServer(fail()).handlers })
    await screen.findByText("Couldn't load addresses")
    expect(await axeViolations()).toEqual([])
    failed.unmount()

    renderInPage(<AddressesSection />, { page: "profile", handlers: listServer(fail(403)).handlers })
    await screen.findByText("You don't have access to this in your current account")
    expect(await axeViolations()).toEqual([])
  })
})
