import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type HttpHandler } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toastError, toastSuccess } from "@/features/shell"
import { fetchMyself } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { renderInPage } from "@/test/providers"
import { AddressesSection } from "."

// The Section's own toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// Full edit flows (Selects, a save, a refetch) take up to ~1 s here and several times that on a loaded CI
// runner; a timed-out test leaves its `act` scope open and breaks every later render in the file.
vi.setConfig({ testTimeout: 20_000 })

/**
 * Story 4.2 (NG-9026): the Addresses edit view and its save on `/`, rendered
 * the way `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers every
 * row of the I/O matrix in `spec-4-2-add-and-edit-addresses.md` except Proxy.
 */

const LIST = "/api/1h/v2/person/location/list"
const CREATE = "/api/1h/v2/person/location"
const COUNTRIES = "/api/1h/v2/public/countries"
const DRAFT_KEY = "pp:draft:v1:demo:42:addresses"

type Wire = Record<string, unknown>
type Answer = (body: Wire, id?: number) => Response | Promise<Response> | undefined

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

/** Main Work 2 (validated), then Home 1 (Primary). Shown as 1, 2. */
const ADDRESSES: Wire[] = [
  location({ id: 2, personLocationType: "Main Work", validated: true }),
  location({ id: 1, addressLine1: "9 Oak Ave", addressLine2: "Apt 4", primary: true }),
]

const COUNTRY_LIST = [{ id: 1, name: "Germany" }, { id: 2, name: "Canada" }, { id: 3, name: "n/a" }, { id: 4, name: "United States" }, { id: 5, name: "Australia" }]

/** The request body fields a write may hold, as the list row names them. */
const WIRE_FIELDS = ["personLocationType", "addressLine1", "addressLine2", "cityName", "county", "stateName", "postalCode", "country", "primary", "validated"]

interface ServerOptions {
  readonly rows?: Wire[]
  /** Answers a POST instead of the mock backend (undefined → the mock backend). */
  readonly create?: Answer
  /** Answers a PUT instead of the mock backend (undefined → the mock backend). */
  readonly update?: Answer
  readonly countries?: () => Response
  /** Answers a list read instead of the mock backend (undefined → the mock backend). */
  readonly list?: () => Response | undefined
}

/**
 * A small address backend: the list reads `rows`; a POST appends a row (new
 * id from 31); a PUT applies the sent fields to its row. Records every write.
 */
function addressServer(options: ServerOptions = {}) {
  const state = { rows: [...(options.rows ?? ADDRESSES)].map((row) => ({ ...row })), nextId: 31 }
  const writes: { method: string; path: string; body: Wire }[] = []
  const counts = { list: 0, countries: 0 }
  // As the backend does (`verifyPrimaryLocation`): a write with primary: true unsets the old Primary.
  const apply = (target: Wire, body: Wire) => {
    if (body.primary === true) for (const row of state.rows) if (row !== target) row.primary = false
    for (const field of WIRE_FIELDS) if (field in body) target[field] = body[field]
  }
  const handlers: HttpHandler[] = [
    http.get(LIST, () => {
      counts.list += 1
      const answer = options.list?.()
      if (answer) return answer
      return HttpResponse.json({ data: state.rows, totalElements: state.rows.length, lastPage: true })
    }),
    http.get(COUNTRIES, () => {
      counts.countries += 1
      return options.countries ? options.countries() : HttpResponse.json(COUNTRY_LIST)
    }),
    http.post(CREATE, async ({ request }) => {
      const body = (await request.json()) as Wire
      writes.push({ method: "POST", path: new URL(request.url).pathname, body })
      const answer = await options.create?.(body)
      if (answer) return answer
      const row = location({ id: state.nextId, validated: false, addressLine2: null, stateName: null, county: null })
      state.nextId += 1
      apply(row, body)
      state.rows.push(row)
      return HttpResponse.json(row)
    }),
    // Story 4.3: line 1 searches a US row; suggestions are off here (`PLACES_ENABLED` off), the Places tests are their own file.
    http.post("/api/places/autocomplete", () => HttpResponse.json({ enabled: false, suggestions: [] })),
    http.put(`${CREATE}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Wire
      const id = Number(params.id)
      writes.push({ method: "PUT", path: new URL(request.url).pathname, body })
      const answer = await options.update?.(body, id)
      if (answer) return answer
      const row = state.rows.find((candidate) => candidate.id === id)
      if (row) apply(row, body)
      return HttpResponse.json(row ?? {})
    }),
  ]
  return { state, writes, counts, handlers }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Addresses" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const heading = (): HTMLElement => screen.getByRole("heading", { level: 2, name: "Addresses" })
const button = (name: string | RegExp): HTMLElement => within(section()).getByRole("button", { name })
const footer = (): HTMLElement => section().querySelector('[data-slot="section-footer"]') as HTMLElement
const isReadView = (): boolean => section().querySelector('[data-slot="section-footer"]') === null
const banner = (): HTMLElement | null => section().querySelector('[data-slot~="inline-banner"]')
/** The body rows of the edit table (desktop) or its cards (mobile). */
const editRows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>("tbody tr, li[data-slot='section-table-card']")]
/** The expanded rows' bodies, in table order. */
const expandedRows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>('[data-slot="address-expanded"]')]
const typeTrigger = (row: HTMLElement): HTMLElement => within(row).getByRole("combobox", { name: "Address Type" })
const countryTrigger = (row: HTMLElement): HTMLElement => within(row).getByRole("combobox", { name: "Country" })
/** A text field by its label; line 1 is the address combobox (Story 4.3). */
const textbox = (row: HTMLElement, name: string): HTMLInputElement =>
  within(row).getByRole(name === "Address line 1" ? "combobox" : "textbox", { name }) as HTMLInputElement
const primaryBox = (row: HTMLElement): HTMLElement => within(row).getByRole("checkbox", { name: "Set as primary" })
/** The ids an element's `aria-describedby` names, as their text. */
const described = (element: HTMLElement): (string | undefined)[] =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? undefined)

async function render(options: ServerOptions = {}) {
  const server = addressServer(options)
  const result = renderInPage(<AddressesSection />, { page: "profile", handlers: server.handlers })
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  // D-A: a write goes out only once the page user is pinned (the page's own `myself` read does it).
  await act(async () => {
    await fetchMyself()
  })
  return { ...result, ...server }
}

async function click(element: HTMLElement) {
  await act(async () => fireEvent.click(element))
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => fireEvent.change(input, { target: { value } }))
}

async function blur(element: HTMLElement) {
  await act(async () => fireEvent.blur(element))
}

/** Opens a Select and picks the option named `name`. */
async function pick(trigger: HTMLElement, name: string | RegExp) {
  await act(async () => fireEvent.keyDown(trigger, { key: "Enter" }))
  const option = await screen.findByRole("option", { name })
  await act(async () => fireEvent.click(option))
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
}

async function openKebab(address: string): Promise<HTMLElement> {
  await act(async () => fireEvent.keyDown(button(`More actions for ${address}`), { key: "Enter" }))
  return screen.findByRole("menu")
}

/** The kebab's Edit on the row named `address`. */
async function kebabEdit(address: string) {
  const menu = await openKebab(address)
  await click(within(menu).getByRole("menuitem", { name: "Edit" }))
  await waitFor(() => expect(isReadView()).toBe(false))
}

/** Adds a new row (header Add address in read view, the footer's while editing) and fills it. */
async function addAddress(fill: { readonly type?: string; readonly line1?: string; readonly city?: string; readonly state?: string; readonly zip?: string } = {}) {
  await click(isReadView() ? within(section().querySelector('[data-slot="section-header"]') ?? section()).getAllByRole("button", { name: "Add address" })[0] : within(footer()).getByRole("button", { name: "Add address" }))
  const rows = expandedRows()
  const row = rows[rows.length - 1]
  if (fill.type) await pick(typeTrigger(row), fill.type)
  if (fill.line1 !== undefined) await type(textbox(row, "Address line 1"), fill.line1)
  if (fill.city !== undefined) await type(textbox(row, "City"), fill.city)
  if (fill.state !== undefined) await type(textbox(row, "State/Province (optional)"), fill.state)
  if (fill.zip !== undefined) await type(textbox(row, "Zip"), fill.zip)
  return row
}

async function save() {
  await click(within(footer()).getByRole("button", { name: "Save" }))
}

const upstream = (message: string, status = 400) => () => HttpResponse.json({ message, code: status }, { status })

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  window.localStorage.clear()
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastError).mockClear()
})
afterEach(() => {
  document.documentElement.classList.remove("dark")
})

describe("AddressesSection: entry points", () => {
  it("the header has an outline Edit and Add address (plus icon, 44 px); a row kebab holds Make primary (not on the Primary), Edit, Remove", async () => {
    await render()
    for (const name of ["Edit", "Add address"]) {
      const action = button(name)
      expect(action.className).toContain("h-11")
      expect(action.className).toMatch(/border/)
    }
    expect(button("Add address").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    const menu = await openKebab("1 Pine St, SF, CA 94105")
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Make primary", "Edit", "Remove"])
    await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    const primaryMenu = await openKebab("9 Oak Ave, Apt 4, SF, CA 94105")
    expect(within(primaryMenu).getAllByRole("menuitem").map((item) => item.textContent?.startsWith("Remove") ? "Remove" : item.textContent)).toEqual(["Edit", "Remove"])
  })

  it("the header Edit: every row collapsed (chevron + read columns), focus on the first chevron; Editing; the footer", async () => {
    await render()
    await click(button("Edit"))
    expect(within(section()).getByText("Editing")).toBeTruthy()
    expect(expandedRows()).toHaveLength(0)
    const first = button("Expand 9 Oak Ave, Apt 4, SF, CA 94105")
    expect(document.activeElement).toBe(first)
    expect(first.getAttribute("aria-expanded")).toBe("false")
    expect(first.className).toContain("size-11")
    const cells = editRows().map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent))
    expect(cells).toEqual([
      // The Primary's Remove is aria-disabled with its reason (Story 4.4).
      ["9 Oak Ave, Apt 4, SF, CA 94105", "Primary", "Home", "", "RemoveMake another address primary first"],
      ["1 Pine St, SF, CA 94105", "", "Main Work", "Verified", "Remove"],
    ])
    expect(within(footer()).getAllByRole("button").map((action) => action.textContent)).toEqual(["Add address", "Cancel", "Save"])
  })

  it("a chevron expands its row on its own (aria-expanded, Collapse {address}) and focus follows it; again collapses", async () => {
    await render()
    await click(button("Edit"))
    await click(button("Expand 1 Pine St, SF, CA 94105"))
    const collapse = button("Collapse 1 Pine St, SF, CA 94105")
    expect(collapse.getAttribute("aria-expanded")).toBe("true")
    expect(document.activeElement).toBe(collapse)
    expect(expandedRows()).toHaveLength(1)
    expect(within(expandedRows()[0]).getByText("1 Pine St, SF, CA 94105")).toBeTruthy()
    // The other row stays collapsed.
    expect(button("Expand 9 Oak Ave, Apt 4, SF, CA 94105")).toBeTruthy()
    await click(collapse)
    expect(expandedRows()).toHaveLength(0)
    expect(document.activeElement).toBe(button("Expand 1 Pine St, SF, CA 94105"))
  })

  it("a kebab Edit: that row expanded and its Address Type focused, the others collapsed", async () => {
    await render()
    await kebabEdit("1 Pine St, SF, CA 94105")
    const [row] = expandedRows()
    expect(expandedRows()).toHaveLength(1)
    await waitFor(() => expect(document.activeElement).toBe(typeTrigger(row)))
    expect(typeTrigger(row).textContent).toBe("Main Work")
    expect(button("Expand 9 Oak Ave, Apt 4, SF, CA 94105").getAttribute("aria-expanded")).toBe("false")
  })

  it("the expanded row's grid: labels (optional ones marked), 44 px controls, Set as primary as saved, countries pinned first", async () => {
    await render()
    await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    const [row] = expandedRows()
    const labels = [...row.querySelectorAll("label")].map((label) => label.textContent)
    expect(labels).toEqual(["Address Type", "Country", "Set as primary", "Address line 1", "Address line 2 (optional)", "City", "County (optional)", "State/Province (optional)", "Zip"])
    expect(textbox(row, "Address line 1").value).toBe("9 Oak Ave")
    expect(textbox(row, "Address line 2 (optional)").value).toBe("Apt 4")
    expect(textbox(row, "County (optional)").value).toBe("")
    expect(textbox(row, "Zip").getAttribute("aria-required")).toBe("true")
    expect(textbox(row, "County (optional)").getAttribute("aria-required")).toBeNull()
    expect(primaryBox(row).getAttribute("aria-checked")).toBe("true")
    expect(primaryBox(row).className).toContain("size-11")
    const grid = row.querySelector(".grid") as HTMLElement
    expect(grid.className).toContain("md:grid-cols-4")
    expect(grid.className).toContain("grid-cols-1")
    expect(grid.className).toContain("gap-4")
    await waitFor(() => expect(countryTrigger(row).getAttribute("aria-busy")).toBeNull())
    await act(async () => fireEvent.keyDown(countryTrigger(row), { key: "Enter" }))
    const listbox = await screen.findByRole("listbox")
    expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual(["United States", "Canada", "Australia", "Germany"])
    await act(async () => fireEvent.keyDown(listbox, { key: "Escape" }))
    // The Address Types are the four (decision 2a).
    await act(async () => fireEvent.keyDown(typeTrigger(row), { key: "Enter" }))
    expect(within(await screen.findByRole("listbox")).getAllByRole("option").map((option) => option.textContent)).toEqual(["Home", "Main Work", "Other Work", "Vacation Home"])
  })

  it("Add address (header): one new row, expanded, \"New address · New · not saved\", United States, focus on Address Type", async () => {
    await render()
    await click(button("Add address"))
    const rows = expandedRows()
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(document.activeElement).toBe(typeTrigger(row))
    expect(row.textContent).toContain("New address")
    expect(row.textContent).toContain("New · not saved")
    expect(typeTrigger(row).textContent).toBe("Choose an address type")
    expect(countryTrigger(row).textContent).toBe("United States")
    expect(primaryBox(row).getAttribute("aria-checked")).toBe("false")
    expect(row.closest("tr")?.getAttribute("data-state")).toBe("new")
    expect(button("Collapse New address")).toBeTruthy()
    // The footer's Add address appends another, expanded too.
    await click(within(footer()).getByRole("button", { name: "Add address" }))
    expect(expandedRows()).toHaveLength(2)
    expect(document.activeElement).toBe(typeTrigger(expandedRows()[1]))
  })

  it("the empty row's Add address (and the header Edit with no addresses) opens one new row", async () => {
    await render({ rows: [] })
    await click(within(section().querySelector('[data-slot="empty-state"]') as HTMLElement).getByRole("button", { name: "Add address" }))
    expect(expandedRows()).toHaveLength(1)
    expect(document.activeElement).toBe(typeTrigger(expandedRows()[0]))
    await click(within(footer()).getByRole("button", { name: "Cancel" }))
    expect(isReadView()).toBe(true)
    expect(document.activeElement).toBe(heading())
    await click(button("Edit"))
    expect(expandedRows()).toHaveLength(1)
  })

  it("registers as addresses, \"Addresses\", display order 5, with drafts of rows; a change writes the draft", async () => {
    const { registry } = await render()
    expect(registry.get("addresses")).toMatchObject({ id: "addresses", label: "Addresses", displayOrder: 5, draftFields: ["rows"] })
    await kebabEdit("1 Pine St, SF, CA 94105")
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toContain("Oakland"), { timeout: 2000 })
  })
})

describe("AddressesSection: save", () => {
  it("Add: one POST (trimmed, empty fields left out, validated false); \"Addresses saved.\", read view, focus on the h2", async () => {
    const { writes, counts } = await render()
    await addAddress({ type: "Home", line1: " 1 Pine St ", city: "SF", state: "CA", zip: "94105" })
    await blur(textbox(expandedRows()[0], "Zip"))
    // Not a duplicate of row 2 (another type); the type picked clears its blur error.
    expect([...section().querySelectorAll('[data-slot="field-error"]')].map((error) => error.textContent)).toEqual([])
    const listReads = counts.list
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual([
      {
        method: "POST",
        path: "/api/1h/v2/person/location",
        body: { personLocationType: "Home", addressLine1: "1 Pine St", cityName: "SF", stateName: "CA", postalCode: "94105", country: "United States", primary: false, validated: false },
      },
    ])
    expect(counts.list).toBe(listReads + 1)
    expect(toastSuccess).toHaveBeenCalledWith("Addresses saved.")
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(section().querySelectorAll("tbody tr")).toHaveLength(3)
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it("Edit: PUT /2 with every field, validated false, primary as saved, fullAddress rebuilt", async () => {
    const { writes } = await render()
    await kebabEdit("1 Pine St, SF, CA 94105")
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual([
      {
        method: "PUT",
        path: "/api/1h/v2/person/location/2",
        body: {
          personLocationType: "Main Work",
          addressLine1: "1 Pine St",
          cityName: "Oakland",
          stateName: "CA",
          postalCode: "94105",
          country: "United States",
          primary: false,
          validated: false,
          fullAddress: "1 Pine St, Oakland, 94105, United States",
        },
      },
    ])
    expect(within(section()).getByText("1 Pine St, Oakland, CA 94105")).toBeTruthy()
  })

  it("Label only: PUT /2 keeps validated true (no address part changed)", async () => {
    const { writes } = await render()
    await kebabEdit("1 Pine St, SF, CA 94105")
    await pick(typeTrigger(expandedRows()[0]), "Home")
    await save()
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ method: "PUT", path: "/api/1h/v2/person/location/2", body: { personLocationType: "Home", validated: true, primary: false } })
  })

  it("Unchanged: nothing sent, back to read view", async () => {
    const { writes } = await render()
    await click(button("Edit"))
    await click(button("Expand 1 Pine St, SF, CA 94105"))
    await save()
    expect(isReadView()).toBe(true)
    expect(writes).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("clears an optional part with n/a and sends the Set as primary box", async () => {
    const { writes } = await render()
    await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    await type(textbox(expandedRows()[0], "Address line 2 (optional)"), "")
    await save()
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ addressLine2: "n/a", primary: true, validated: false, fullAddress: "9 Oak Ave, SF, 94105, United States" })
  })

  it.each<[string, { readonly zip?: string; readonly city?: string; readonly line1?: string; readonly type?: string }, string, string]>([
    ["a 3-digit US zip", { zip: "941" }, "Zip", "Enter a 5-digit ZIP code"],
    ["an empty city", { city: "" }, "City", "Enter a city"],
    ["a duplicate of row 2", { line1: "1 pine st", type: "Main Work" }, "Address line 1", "This address is already on your profile"],
  ])("Invalid (%s): the collapsed row expands, focus on the invalid field, its message; nothing sent", async (_case, change, field, message) => {
    const { writes } = await render()
    const row = await addAddress({ type: change.type ?? "Home", line1: change.line1 ?? "5 Elm St", city: change.city ?? "SF", zip: change.zip ?? "94105" })
    expect(row).toBeTruthy()
    await click(button("Collapse New address"))
    expect(expandedRows()).toHaveLength(0)
    await save()
    const [expanded] = expandedRows()
    const input = textbox(expanded, field)
    await waitFor(() => expect(document.activeElement).toBe(input))
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(described(input)).toEqual([message])
    expect(writes).toEqual([])
    expect(isReadView()).toBe(false)
  })

  it("an empty Address Type shows its message at the Select on blur", async () => {
    await render()
    const row = await addAddress()
    await blur(typeTrigger(row))
    await waitFor(() => expect(described(typeTrigger(row))).toEqual(["Choose an address type"]))
    expect(typeTrigger(row).getAttribute("aria-invalid")).toBe("true")
  })

  it("Two steps: PUT ok, POST 500 → refetch + rebase, Section error + Retry; Retry sends only the POST", async () => {
    let failCreate = true
    const { writes, counts } = await render({ create: () => (failCreate ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined) })
    await kebabEdit("1 Pine St, SF, CA 94105")
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await addAddress({ type: "Vacation Home", line1: "7 Bay Rd", city: "Tahoe", zip: "96150" })
    const listReads = counts.list
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save addresses."))
    expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual(["PUT /api/1h/v2/person/location/2", "POST /api/1h/v2/person/location"])
    expect(counts.list).toBe(listReads + 1)
    expect(isReadView()).toBe(false)
    // The saved row now matches the server: unchanged, so Retry skips it.
    failCreate = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
      "PUT /api/1h/v2/person/location/2",
      "POST /api/1h/v2/person/location",
      "POST /api/1h/v2/person/location",
    ])
    expect(toastSuccess).toHaveBeenCalledWith("Addresses saved.")
    expect(within(section()).getByText("1 Pine St, Oakland, CA 94105")).toBeTruthy()
    expect(within(section()).getByText("7 Bay Rd, Tahoe 96150")).toBeTruthy()
  })

  it("a created row is never re-sent: POST ok then PUT 500 → Retry sends only the PUT", async () => {
    let failUpdate = true
    const { writes } = await render({ update: () => (failUpdate ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined) })
    const row = await addAddress({ type: "Home", line1: "7 Bay Rd", city: "Tahoe", zip: "96150" })
    await click(primaryBox(row))
    await click(button("Expand 1 Pine St, SF, CA 94105"))
    // Table order: 9 Oak Ave (collapsed), 1 Pine St, the new row.
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await save()
    await waitFor(() => expect(banner()).not.toBeNull())
    // The newly Primary row goes first.
    expect(writes.map((write) => write.method)).toEqual(["POST", "PUT"])
    failUpdate = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes.map((write) => write.method)).toEqual(["POST", "PUT", "PUT"])
    expect(writes[2].body).toMatchObject({ cityName: "Oakland", primary: false })
  })

  it("a created row is never re-sent when the refetch after a failed step fails: Retry sends only the PUT", async () => {
    let failing = true
    let reads = 0
    const { writes } = await render({
      update: () => (failing ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined),
      // The first read loads the Section; the refetch after the failed PUT fails too.
      list: () => {
        reads += 1
        return failing && reads > 1 ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined
      },
    })
    const row = await addAddress({ type: "Home", line1: "7 Bay Rd", city: "Tahoe", zip: "96150" })
    await click(primaryBox(row))
    await click(button("Expand 1 Pine St, SF, CA 94105"))
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await save()
    await waitFor(() => expect(banner()).not.toBeNull())
    expect(writes.map((write) => write.method)).toEqual(["POST", "PUT"])
    failing = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes.map((write) => write.method)).toEqual(["POST", "PUT", "PUT"])
  })

  it("validates and updates a created row edited after a later PUT and the recovery read fail", async () => {
    let failing = true
    let reads = 0
    const { writes } = await render({
      update: () => failing ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined,
      list: () => ++reads > 1 && failing ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined,
    })
    const row = await addAddress({ type: "Home", line1: "7 Bay Rd", city: "Tahoe", zip: "96150" })
    await click(primaryBox(row))
    await click(button("Expand 1 Pine St, SF, CA 94105"))
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await save()
    await waitFor(() => expect(banner()).not.toBeNull())
    expect(writes.map((write) => write.method)).toEqual(["POST", "PUT"])
    await click(button("Expand 7 Bay Rd, Tahoe 96150"))
    const createdRow = expandedRows().find((expanded) => textbox(expanded, "Address line 1").value === "7 Bay Rd") as HTMLElement
    await type(textbox(createdRow, "City"), "")
    failing = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(textbox(createdRow, "City").getAttribute("aria-invalid")).toBe("true"))
    expect(writes).toHaveLength(2)
    expect(isReadView()).toBe(false)
    await type(textbox(createdRow, "City"), "Reno")
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
      "POST /api/1h/v2/person/location",
      "PUT /api/1h/v2/person/location/2",
      "PUT /api/1h/v2/person/location/2",
      "PUT /api/1h/v2/person/location/31",
    ])
    expect(writes[3].body).toMatchObject({ cityName: "Reno", primary: true })
    expect(within(section()).getByText("7 Bay Rd, Reno 96150")).toBeTruthy()
  })

  it("a created row is never re-sent after a session end on the next step", async () => {
    const { writes } = await render({ update: () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }) })
    const row = await addAddress({ type: "Home", line1: "7 Bay Rd", city: "Tahoe", zip: "96150" })
    await click(primaryBox(row))
    await click(button("Expand 1 Pine St, SF, CA 94105"))
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await save()
    await waitFor(() => expect(writes.map((write) => write.method)).toEqual(["POST", "PUT"]))
    await waitFor(() => expect(within(footer()).getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBeNull())
    // The created row is a saved row now (its new id), no longer "New address".
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    await save()
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(writes.filter((write) => write.method === "POST")).toHaveLength(1)
  })

  it("a write that succeeds while the list refetch fails: \"Addresses saved.\", read view, and a later Save sends nothing", async () => {
    let failList = false
    const { writes } = await render({ list: () => (failList ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined) })
    await kebabEdit("1 Pine St, SF, CA 94105")
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    failList = true
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(toastSuccess).toHaveBeenCalledWith("Addresses saved.")
    expect(writes).toHaveLength(1)
    await click(button("Edit"))
    await save()
    expect(isReadView()).toBe(true)
    expect(writes).toHaveLength(1)
  })

  it("a mapped field error on a later step: PUT ok, then the POST's zip error lands on the new row's Zip, expanded and focused", async () => {
    const { writes } = await render({ create: upstream("Operation failed. Location zip is not provided.") })
    await kebabEdit("1 Pine St, SF, CA 94105")
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await addAddress({ type: "Home", line1: "7 Bay Rd", city: "Tahoe", zip: "96150" })
    await click(button("Collapse New address"))
    await save()
    await waitFor(() => expect(writes.map((write) => write.method)).toEqual(["PUT", "POST"]))
    await waitFor(() => expect(within(section()).queryByRole("button", { name: "Collapse New address" })).not.toBeNull())
    const newRow = expandedRows()[expandedRows().length - 1]
    const zip = textbox(newRow, "Zip")
    await waitFor(() => expect(document.activeElement).toBe(zip))
    expect(described(zip)).toEqual(["Enter a ZIP code"])
    expect(banner()).toBeNull()
  })

  it("with two primary:true rows, the one shown as plain has Set as primary unchecked and its edit sends primary: false", async () => {
    const { writes } = await render({ rows: [location({ id: 2, primary: true, addressLine1: "2 Elm St" }), location({ id: 1, primary: true })] })
    await kebabEdit("1 Pine St, SF, CA 94105")
    const [row] = expandedRows()
    expect(primaryBox(row).getAttribute("aria-checked")).toBe("false")
    await type(textbox(row, "City"), "Oakland")
    await save()
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: "/api/1h/v2/person/location/1", body: { primary: false } })
  })

  it("Primary rule: a PUT answered \"first set another Location as the primary one\" shows at the row's box; stays in edit", async () => {
    const { writes } = await render({ update: upstream("Operation failed. Please, first set another Location as the primary one.") })
    await kebabEdit("1 Pine St, SF, CA 94105")
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await save()
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ primary: false })
    await waitFor(() => expect(described(primaryBox(expandedRows()[0]))).toEqual(["Set another address as primary first"]))
    await waitFor(() => expect(document.activeElement).toBe(primaryBox(expandedRows()[0])))
    expect(isReadView()).toBe(false)
    expect(banner()).toBeNull()
  })

  it("a POST required-field error lands at that field of the failed row (collapsed rows expand)", async () => {
    const { writes } = await render({ create: upstream("Operation failed. Location zip is not provided.") })
    await addAddress({ type: "Home", line1: "7 Bay Rd", city: "Tahoe", zip: "96150" })
    await click(button("Collapse New address"))
    await save()
    await waitFor(() => expect(writes).toHaveLength(1))
    await waitFor(() => expect(expandedRows()).toHaveLength(1))
    const zip = textbox(expandedRows()[0], "Zip")
    await waitFor(() => expect(document.activeElement).toBe(zip))
    expect(described(zip)).toEqual(["Enter a ZIP code"])
  })

  it("an unknown 400 shows at Section level with Retry", async () => {
    await render({ update: upstream("Operation failed. Something else.") })
    await kebabEdit("1 Pine St, SF, CA 94105")
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save addresses."))
    expect(within(banner() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
  })

  it("a network failure: \"Couldn't save addresses. Check your connection.\" + Retry (banner and toast)", async () => {
    await render({ update: () => HttpResponse.error() })
    await kebabEdit("1 Pine St, SF, CA 94105")
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save addresses. Check your connection."))
    expect(toastError).toHaveBeenCalledWith("Couldn't save addresses. Check your connection.", expect.objectContaining({ onRetry: expect.any(Function) }))
    expect(isReadView()).toBe(false)
  })

  it("Countries fail: \"Couldn't load countries · Retry\"; a new row can't save, a saved row can; Retry reloads the countries", async () => {
    let failCountries = true
    const { writes, counts } = await render({ countries: () => (failCountries ? HttpResponse.json({ message: "boom" }, { status: 500 }) : HttpResponse.json(COUNTRY_LIST)) })
    expect(counts.countries).toBe(0)
    const row = await addAddress({ type: "Home", line1: "7 Bay Rd", city: "Tahoe", zip: "96150" })
    await waitFor(() => expect(within(row).getByText("Couldn't load countries")).toBeTruthy())
    expect(described(countryTrigger(row))).toEqual(["Couldn't load countries·Retry"])
    await save()
    await waitFor(() => expect(described(countryTrigger(expandedRows()[0]))).toContain("Countries need to load before this address can be saved"))
    expect(writes).toEqual([])

    // Retry reloads the countries; then the new row saves.
    failCountries = false
    await click(within(expandedRows()[0]).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(within(section()).queryByText("Couldn't load countries")).toBeNull())
    expect(counts.countries).toBeGreaterThanOrEqual(2)
    await save()
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].method).toBe("POST")
  })

  it("Countries fail: a changed saved row still saves (its unchanged country left out)", async () => {
    const { writes } = await render({ countries: () => HttpResponse.json({ message: "boom" }, { status: 500 }) })
    await kebabEdit("1 Pine St, SF, CA 94105")
    await waitFor(() => expect(within(expandedRows()[0]).getByText("Couldn't load countries")).toBeTruthy())
    await type(textbox(expandedRows()[0], "City"), "Oakland")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toHaveLength(1)
    expect(writes[0].body).not.toHaveProperty("country")
    expect(writes[0].body).toMatchObject({ cityName: "Oakland", fullAddress: "1 Pine St, Oakland, 94105, United States" })
  })

  it("Unlisted: a saved Billing type and U.S.A. country show as they are and aren't sent unless changed", async () => {
    const { writes } = await render({ rows: [location({ id: 6, personLocationType: "Billing", country: "U.S.A.", countryCode: null })] })
    await kebabEdit("1 Pine St, SF, CA 94105")
    const [row] = expandedRows()
    expect(typeTrigger(row).textContent).toBe("Billing")
    await waitFor(() => expect(countryTrigger(row).getAttribute("aria-busy")).toBeNull())
    expect(countryTrigger(row).textContent).toBe("U.S.A.")
    await type(textbox(row, "City"), "Oakland")
    await save()
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).not.toHaveProperty("personLocationType")
    expect(writes[0].body).not.toHaveProperty("country")
    expect(writes[0].body).toMatchObject({ fullAddress: "1 Pine St, Oakland, 94105, U.S.A." })
  })

  it("Unlisted: a changed type and country are sent", async () => {
    const { writes } = await render({ rows: [location({ id: 6, personLocationType: "Billing", country: "U.S.A.", countryCode: null })] })
    await kebabEdit("1 Pine St, SF, CA 94105")
    const [row] = expandedRows()
    await pick(typeTrigger(row), "Other Work")
    await waitFor(() => expect(countryTrigger(row).getAttribute("aria-busy")).toBeNull())
    await pick(countryTrigger(row), "Canada")
    await type(textbox(row, "Zip"), "M5H 1A1")
    await save()
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ personLocationType: "Other Work", country: "Canada", postalCode: "M5H 1A1" })
  })

  it("Enter in a field never submits; Cancel reverts only Addresses, focus on the h2", async () => {
    const { writes } = await render()
    await kebabEdit("1 Pine St, SF, CA 94105")
    const city = textbox(expandedRows()[0], "City")
    await type(city, "Oakland")
    await act(async () => fireEvent.keyDown(city, { key: "Enter" }))
    await act(async () => fireEvent.keyDown(city, { key: "Escape" }))
    expect(writes).toEqual([])
    expect(isReadView()).toBe(false)
    await click(within(footer()).getByRole("button", { name: "Cancel" }))
    expect(isReadView()).toBe(true)
    expect(document.activeElement).toBe(heading())
    expect(within(section()).getByText("1 Pine St, SF, CA 94105")).toBeTruthy()
  })
})

describe("AddressesSection: edit view below 768 px", () => {
  it("collapsed rows are cards; an expanded row is the card body", async () => {
    stubViewport(360)
    await render()
    await kebabEdit("1 Pine St, SF, CA 94105")
    expect(within(section()).queryByRole("table")).toBeNull()
    const cards = within(within(section()).getByRole("list", { name: "Addresses" })).getAllByRole("listitem")
    expect(cards).toHaveLength(2)
    expect(cards[1].querySelector('[data-slot="address-expanded"]')).not.toBeNull()
    expect(within(cards[0]).getByRole("button", { name: "Expand 9 Oak Ave, Apt 4, SF, CA 94105" })).toBeTruthy()
  })
})

describe("AddressesSection: edit view accessibility", () => {
  it.each([
    ["light", 1024],
    ["dark", 1024],
    ["light", 360],
    ["dark", 360],
  ] as const)("has no axe violations in %s mode at %i px with an expanded saved row, a new row and an error", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await render()
    await kebabEdit("1 Pine St, SF, CA 94105")
    const row = await addAddress({ type: "Home", line1: "5 Elm St", city: "SF", zip: "941" })
    await blur(textbox(row, "Zip"))
    await waitFor(() => expect(described(textbox(row, "Zip"))).toEqual(["Enter a 5-digit ZIP code"]))
    expect(await axeViolations()).toEqual([])
  })
})
