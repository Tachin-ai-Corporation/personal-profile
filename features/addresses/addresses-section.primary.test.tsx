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
vi.setConfig({ testTimeout: 20_000 })

/**
 * Story 4.4 (NG-9026): the Primary address and removal on `/`, rendered the
 * way `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers every row
 * of the I/O matrix in `spec-4-4-primary-address-and-removal.md` except
 * Proxy (`allowlist/addresses.test.ts`).
 */

const LIST = "/api/1h/v2/person/location/list"
const LOCATION = "/api/1h/v2/person/location"
const COUNTRIES = "/api/1h/v2/public/countries"

type Wire = Record<string, unknown>
type Answer = (body: Wire, id: number) => Response | Promise<Response | undefined> | undefined

const NOT_RELATED = (id: number) => `Operation failed. Location with id: '${id}' is not related to 'Person' with id: '7'.`
const SET_PRIMARY = "Operation failed. Please, first set another Location as the primary one."

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

/** A: 1 Oak Ave (Primary). B: 2 Elm St. C: 3 Bay Rd (validated). Shown A, B, C. */
const A = "1 Oak Ave, SF, CA 94105"
const B = "2 Elm St, SF, CA 94105"
const C = "3 Bay Rd, SF, CA 94105"
const ROWS: Wire[] = [
  location({ id: 1, addressLine1: "1 Oak Ave", primary: true }),
  location({ id: 2, addressLine1: "2 Elm St" }),
  location({ id: 3, addressLine1: "3 Bay Rd", validated: true }),
]

const WIRE_FIELDS = ["personLocationType", "addressLine1", "addressLine2", "cityName", "county", "stateName", "postalCode", "country", "primary", "validated"]

interface ServerOptions {
  readonly rows?: Wire[]
  readonly create?: (body: Wire) => Response | undefined
  readonly update?: Answer
  readonly remove?: (id: number) => Response | undefined
  /** Answers a list read instead of the mock backend (undefined → the mock backend). */
  readonly list?: () => Response | undefined
}

/**
 * A small address backend, as the real one behaves: a write with primary:
 * true unsets the old Primary; a DELETE soft-deletes (refused for the
 * Primary); a PUT or DELETE of an unknown or removed id answers "not
 * related". Records every write.
 */
function addressServer(options: ServerOptions = {}) {
  const state = { rows: [...(options.rows ?? ROWS)].map((row) => ({ ...row })), nextId: 31 }
  const writes: { method: string; path: string; body?: Wire }[] = []
  const counts = { list: 0 }
  const live = () => state.rows.filter((row) => row.active !== false)
  const apply = (target: Wire, body: Wire) => {
    if (body.primary === true) for (const row of state.rows) if (row !== target) row.primary = false
    for (const field of WIRE_FIELDS) if (field in body) target[field] = body[field]
  }
  const fail = (message: string) => HttpResponse.json({ message, code: 400 }, { status: 400 })
  const handlers: HttpHandler[] = [
    http.get(LIST, () => {
      counts.list += 1
      const answer = options.list?.()
      if (answer) return answer
      return HttpResponse.json({ data: live(), totalElements: live().length, lastPage: true })
    }),
    http.get(COUNTRIES, () => HttpResponse.json([{ id: 1, name: "United States" }, { id: 2, name: "Canada" }])),
    http.post("/api/places/autocomplete", () => HttpResponse.json({ enabled: false, suggestions: [] })),
    http.post(LOCATION, async ({ request }) => {
      const body = (await request.json()) as Wire
      writes.push({ method: "POST", path: new URL(request.url).pathname, body })
      const answer = options.create?.(body)
      if (answer) return answer
      const row = location({ id: state.nextId, addressLine2: null, stateName: null, county: null, primary: live().length === 0 })
      state.nextId += 1
      state.rows.push(row)
      apply(row, body)
      return HttpResponse.json(row)
    }),
    http.put(`${LOCATION}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Wire
      const id = Number(params.id)
      writes.push({ method: "PUT", path: new URL(request.url).pathname, body })
      const answer = await options.update?.(body, id)
      if (answer) return answer
      const row = live().find((candidate) => candidate.id === id)
      if (!row) return fail(NOT_RELATED(id))
      if (row.primary === true && body.primary === false) return fail(SET_PRIMARY)
      apply(row, body)
      return HttpResponse.json(row)
    }),
    http.delete(`${LOCATION}/:id`, ({ request, params }) => {
      const id = Number(params.id)
      writes.push({ method: "DELETE", path: new URL(request.url).pathname })
      const answer = options.remove?.(id)
      if (answer) return answer
      const row = live().find((candidate) => candidate.id === id)
      if (!row) return fail(NOT_RELATED(id))
      if (row.primary === true) return fail(SET_PRIMARY)
      row.active = false
      return HttpResponse.json({ id, name: "x" })
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
const expandedRows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>('[data-slot="address-expanded"]')]
/** The edit table's body row (or card) holding `text`. */
const rowOf = (text: string): HTMLElement =>
  [...section().querySelectorAll<HTMLElement>("tbody tr, li[data-slot='section-table-card']")].find((row) => row.textContent?.includes(text)) as HTMLElement
const readRows = (): string[] => [...section().querySelectorAll<HTMLElement>("tbody tr")].map((row) => row.querySelector("td")?.textContent ?? "")
const typeTrigger = (row: HTMLElement): HTMLElement => within(row).getByRole("combobox", { name: "Address Type" })
const textbox = (row: HTMLElement, name: string): HTMLInputElement =>
  within(row).getByRole(name === "Address line 1" ? "combobox" : "textbox", { name }) as HTMLInputElement
const primaryBox = (row: HTMLElement): HTMLElement => within(row).getByRole("checkbox", { name: "Set as primary" })
const described = (element: HTMLElement): (string | undefined)[] =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? undefined)
const writeLog = (writes: { method: string; path: string }[]): string[] => writes.map((write) => `${write.method} ${write.path.replace(LOCATION, "")}`)

async function render(options: ServerOptions = {}) {
  const server = addressServer(options)
  const result = renderInPage(<AddressesSection />, { page: "profile", handlers: server.handlers })
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
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

/** A kebab item by its label (a disabled one also holds its reason). */
const menuItem = (menu: HTMLElement, label: string): HTMLElement =>
  within(menu)
    .getAllByRole("menuitem")
    .find((item) => item.querySelector("span > span")?.textContent === label) as HTMLElement

async function kebab(address: string, label: string) {
  const menu = await openKebab(address)
  await click(menuItem(menu, label))
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
}

async function editAll() {
  await click(button("Edit"))
  await waitFor(() => expect(isReadView()).toBe(false))
}

/** Expands a collapsed row in edit view and returns its expanded body. */
async function expand(address: string): Promise<HTMLElement> {
  await click(button(`Expand ${address}`))
  return within(section()).getByRole("button", { name: `Collapse ${address}` }).closest('[data-slot="address-expanded"]') as HTMLElement
}

async function save() {
  await click(within(footer()).getByRole("button", { name: "Save" }))
}

const removeIn = (row: HTMLElement): HTMLElement => within(row).getByRole("button", { name: "Remove" })

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

describe("AddressesSection: Primary in edit (Story 4.4)", () => {
  it("First address: the only row is Primary (checked, aria-disabled with its reason) and is POSTed with primary: true", async () => {
    const { writes } = await render({ rows: [] })
    await click(within(section().querySelector('[data-slot="empty-state"]') as HTMLElement).getByRole("button", { name: "Add address" }))
    const [row] = expandedRows()
    const box = primaryBox(row)
    expect(box.getAttribute("aria-checked")).toBe("true")
    expect(box.getAttribute("aria-disabled")).toBe("true")
    // The only address: no other one could be set as primary.
    expect(described(box)).toEqual(["Your only address is your primary address"])
    // A first new address can still be removed (it isn't "the last saved address").
    expect(removeIn(row).getAttribute("aria-disabled")).toBeNull()
    await pick(typeTrigger(row), "Home")
    await type(textbox(row, "Address line 1"), "5 Elm St")
    await type(textbox(row, "City"), "SF")
    await type(textbox(row, "Zip"), "94105")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual([
      {
        method: "POST",
        path: LOCATION,
        body: { personLocationType: "Home", addressLine1: "5 Elm St", cityName: "SF", postalCode: "94105", country: "United States", primary: true, validated: false },
      },
    ])
  })

  it("Move Primary: checking B unchecks A (the collapsed chip follows); Save sends only PUT B primary: true", async () => {
    const { writes } = await render()
    await editAll()
    const b = await expand(B)
    await click(primaryBox(b))
    expect(primaryBox(b).getAttribute("aria-checked")).toBe("true")
    // A is collapsed: its Primary chip moved with the form.
    expect(within(rowOf(A)).queryByText("Primary")).toBeNull()
    const a = await expand(A)
    expect(primaryBox(a).getAttribute("aria-checked")).toBe("false")
    expect(primaryBox(a).getAttribute("aria-disabled")).toBeNull()
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /2"])
    expect(writes[0].body).toMatchObject({ primary: true })
    expect(readRows()[0]).toBe(B)
    expect(toastSuccess).toHaveBeenCalledWith("Addresses saved.")
  })

  it("Move Primary with another change of A: PUT B first, then PUT A primary: false", async () => {
    const { writes } = await render()
    await editAll()
    await click(primaryBox(await expand(B)))
    await type(textbox(await expand(A), "City"), "Oakland")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /2", "PUT /1"])
    expect(writes[1].body).toMatchObject({ cityName: "Oakland", primary: false })
  })

  it("Uncheck Primary: pressing A's checked box changes nothing; it stays focusable and names its reason", async () => {
    await render()
    await editAll()
    const a = await expand(A)
    const box = primaryBox(a)
    expect(box.getAttribute("aria-disabled")).toBe("true")
    expect(described(box)).toEqual(["Set another address as primary first"])
    await click(box)
    await act(async () => fireEvent.keyDown(box, { key: " " }))
    expect(box.getAttribute("aria-checked")).toBe("true")
    expect(within(footer()).queryByText("Unsaved changes")).toBeNull()
    box.focus()
    expect(document.activeElement).toBe(box)
  })
})

describe("AddressesSection: legacy rows (Story 4.4)", () => {
  const PINE9 = "9 Fir Ln, SF, CA 94105"

  it("a sole non-Primary saved row: header Edit alone changes nothing; a City change saves PUT /9 with primary: true", async () => {
    const { writes } = await render({ rows: [location({ id: 9, addressLine1: "9 Fir Ln" })] })
    await editAll()
    expect(within(footer()).queryByText("Unsaved changes")).toBeNull()
    await type(textbox(await expand(PINE9), "City"), "Oakland")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /9"])
    expect(writes[0].body).toMatchObject({ cityName: "Oakland", primary: true })
  })

  it("rows that can't be sent never count: an id-less row leaves A the last address, and auto-Primary picks A", async () => {
    // An id-less row shown as Primary, and A (id 1) not Primary.
    const { writes } = await render({ rows: [location({ id: null, addressLine1: "5 Ash Ct", primary: true }), location({ id: 1, addressLine1: "1 Oak Ave" })] })
    const menu = await openKebab(A)
    expect(described(menuItem(menu, "Remove"))).toEqual(["You need at least one address"])
    await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await editAll()
    expect(described(removeIn(rowOf(A)))).toEqual(["You need at least one address"])
    await type(textbox(await expand(A), "City"), "Oakland")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /1"])
    expect(writes[0].body).toMatchObject({ primary: true })
  })

  it("a repeated id's later occurrence never counts: B is the last address, in the kebab and in edit view", async () => {
    await render({ rows: [location({ id: 2, addressLine1: "2 Elm St" }), location({ id: 2, addressLine1: "2 Elm St" })] })
    const menu = await openKebab(B)
    expect(described(menuItem(menu, "Remove"))).toEqual(["You need at least one address"])
    await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await editAll()
    const removes = within(section()).getAllByRole("button", { name: "Remove" })
    expect(removes).toHaveLength(1)
    expect(described(removes[0])).toEqual(["You need at least one address"])
  })
})

describe("AddressesSection: Make primary (Story 4.4)", () => {
  it("one PUT B { primary: true }, refetch, B on top, \"Addresses saved.\", h2 focused; no confirm", async () => {
    const { writes, counts } = await render()
    const reads = counts.list
    await kebab(C, "Make primary")
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Addresses saved."))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(writes).toEqual([{ method: "PUT", path: `${LOCATION}/3`, body: { primary: true, validated: true } }])
    expect(counts.list).toBe(reads + 1)
    await waitFor(() => expect(readRows()[0]).toBe(C))
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(isReadView()).toBe(true)
  })

  it("a failure toasts with Retry; Retry re-reads the rows and sends again", async () => {
    let failing = true
    const { writes } = await render({ update: () => (failing ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined) })
    await kebab(B, "Make primary")
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't save addresses.", expect.objectContaining({ onRetry: expect.any(Function) })))
    expect(toastSuccess).not.toHaveBeenCalled()
    const retry = vi.mocked(toastError).mock.calls[0][1].onRetry
    failing = false
    await act(async () => retry())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Addresses saved."))
    expect(writeLog(writes)).toEqual(["PUT /2", "PUT /2"])
    await waitFor(() => expect(readRows()[0]).toBe(B))
    await waitFor(() => expect(document.activeElement).toBe(heading()))
  })

  it("Retry sends nothing when the refetch shows B already Primary (the failed PUT applied after all)", async () => {
    const { writes, state } = await render({
      update: (_body, id) => {
        for (const row of state.rows) row.primary = row.id === id
        return HttpResponse.json({ message: "boom" }, { status: 504 })
      },
    })
    await kebab(B, "Make primary")
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    await waitFor(() => expect(readRows()[0]).toBe(B))
    const retry = vi.mocked(toastError).mock.calls[0][1].onRetry
    await act(async () => retry())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Addresses saved."))
    expect(writeLog(writes)).toEqual(["PUT /2"])
  })

  it("Retry on a stale list: the row was removed after the failure; Retry re-reads the list, toasts \"removed elsewhere\" and sends no second PUT", async () => {
    let failing = true
    const { writes, state } = await render({ update: () => (failing ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined) })
    await kebab(B, "Make primary")
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't save addresses.", expect.anything()))
    const retry = vi.mocked(toastError).mock.calls[0][1].onRetry
    failing = false
    state.rows = state.rows.filter((row) => row.id !== 2)
    vi.mocked(toastError).mockClear()
    await act(async () => retry())
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("This address was removed elsewhere, so your changes to it weren't saved.", expect.anything()))
    expect(writeLog(writes)).toEqual(["PUT /2"])
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("single flight: a second Make primary while the first PUT is out sends nothing", async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { writes } = await render({
      update: async () => {
        await gate
        return undefined
      },
    })
    await kebab(B, "Make primary")
    await waitFor(() => expect(writes).toHaveLength(1))
    await kebab(C, "Make primary")
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(writes).toHaveLength(1)
    await act(async () => release())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1))
    expect(writeLog(writes)).toEqual(["PUT /2"])
  })

  it("while a Make primary is out, Edit, Add address and the kebab's Edit and Remove do nothing; its success then toasts and focuses the h2", async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { writes } = await render({
      update: async () => {
        await gate
        return undefined
      },
    })
    await kebab(B, "Make primary")
    await waitFor(() => expect(writes).toHaveLength(1))
    await click(button("Edit"))
    expect(isReadView()).toBe(true)
    await click(button("Add address"))
    expect(isReadView()).toBe(true)
    await kebab(C, "Edit")
    expect(isReadView()).toBe(true)
    await kebab(C, "Remove")
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(isReadView()).toBe(true)
    await act(async () => release())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Addresses saved."))
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(isReadView()).toBe(true)
    expect(writeLog(writes)).toEqual(["PUT /2"])
  })

  it("a failed Make primary, then Edit: the toast's Retry sends nothing while editing", async () => {
    const { writes } = await render({ update: () => HttpResponse.json({ message: "boom" }, { status: 500 }) })
    await kebab(B, "Make primary")
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const retry = vi.mocked(toastError).mock.calls[0][1].onRetry
    await editAll()
    await act(async () => retry())
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(writeLog(writes)).toEqual(["PUT /2"])
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(isReadView()).toBe(false)
  })

  it("a mapped field rule toasts that rule's catalog text", async () => {
    await render({ update: () => HttpResponse.json({ message: "Operation failed. Please, first set another Location as the primary one.", code: 400 }, { status: 400 }) })
    await kebab(B, "Make primary")
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Set another address as primary first", expect.objectContaining({ onRetry: expect.any(Function) })))
  })

  it("a network failure toasts \"Couldn't save addresses. Check your connection.\"", async () => {
    await render({ update: () => HttpResponse.error() })
    await kebab(B, "Make primary")
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't save addresses. Check your connection.", expect.anything()))
  })

  it("removed elsewhere: the toast says so, the list refetches (B leaves), Retry only reloads", async () => {
    const { writes, state, counts } = await render()
    state.rows = state.rows.filter((row) => row.id !== 2)
    const reads = counts.list
    await kebab(B, "Make primary")
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("This address was removed elsewhere, so your changes to it weren't saved.", expect.anything()))
    expect(counts.list).toBe(reads + 1)
    await waitFor(() => expect(readRows()).toEqual([A, C]))
    const retry = vi.mocked(toastError).mock.calls[0][1].onRetry
    await act(async () => retry())
    await waitFor(() => expect(counts.list).toBe(reads + 2))
    expect(writeLog(writes)).toEqual(["PUT /2"])
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("a session end shows nothing", async () => {
    await render({ update: () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }) })
    await kebab(B, "Make primary")
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

describe("AddressesSection: Remove (Story 4.4)", () => {
  it("B's kebab Remove: edit view, B struck through \"Removed on save\", focus on Restore; Save → DELETE B", async () => {
    const { writes } = await render()
    await kebab(B, "Remove")
    await waitFor(() => expect(isReadView()).toBe(false))
    const row = rowOf(B)
    expect(row.getAttribute("data-state")).toBe("removed")
    expect(within(row).getByText("Removed on save")).toBeTruthy()
    const restore = within(row).getByRole("button", { name: "Restore" })
    await waitFor(() => expect(document.activeElement).toBe(restore))
    expect(described(restore)).toEqual(["Removed on save"])
    // A struck-through row has no chevron (it can't be expanded).
    expect(within(row).queryByRole("button", { name: `Expand ${B}` })).toBeNull()
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["DELETE /2"])
    expect(readRows()).toEqual([A, C])
    expect(toastSuccess).toHaveBeenCalledWith("Addresses saved.")
  })

  it("Restore undoes it: the Section is clean again and focus stays on the action", async () => {
    const { writes } = await render()
    await editAll()
    const remove = removeIn(rowOf(B))
    remove.focus()
    await click(remove)
    const restore = within(rowOf(B)).getByRole("button", { name: "Restore" })
    expect(document.activeElement).toBe(restore)
    await click(restore)
    expect(rowOf(B).getAttribute("data-state")).toBe("saved")
    expect(document.activeElement).toBe(removeIn(rowOf(B)))
    await save()
    expect(isReadView()).toBe(true)
    expect(writes).toEqual([])
  })

  it("Remove inside an expanded row collapses it and moves focus to its Restore", async () => {
    await render()
    await editAll()
    const b = await expand(B)
    await click(removeIn(b))
    await waitFor(() => expect(document.activeElement).toBe(within(rowOf(B)).getByRole("button", { name: "Restore" })))
    expect(expandedRows()).toHaveLength(0)
  })

  it("a new row is deleted outright, never sent; focus moves to the h2", async () => {
    const { writes } = await render()
    await click(button("Add address"))
    expect(expandedRows()).toHaveLength(1)
    await click(removeIn(expandedRows()[0]))
    expect(expandedRows()).toHaveLength(0)
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    // Its Remove is gone: focus is on the Section h2, never <body>.
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    await save()
    expect(isReadView()).toBe(true)
    expect(writes).toEqual([])
  })

  it("Remove guards: the Primary's Remove and the only address's Remove are aria-disabled with their reasons; activation does nothing", async () => {
    await render()
    const menu = await openKebab(A)
    const remove = menuItem(menu, "Remove")
    expect(remove.getAttribute("aria-disabled")).toBe("true")
    expect(described(remove)).toEqual(["Make another address primary first"])
    await click(remove)
    expect(screen.getByRole("menu")).toBeTruthy()
    expect(isReadView()).toBe(true)
    await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
    await editAll()
    const editRemove = removeIn(rowOf(A))
    expect(editRemove.getAttribute("aria-disabled")).toBe("true")
    expect(described(editRemove)).toEqual(["Make another address primary first"])
    await click(editRemove)
    expect(rowOf(A).getAttribute("data-state")).toBe("saved")
  })

  it("the only address: \"You need at least one address\" in the kebab and in edit view, also after removing the others", async () => {
    await render({ rows: [location({ id: 9, addressLine1: "9 Fir Ln" })] })
    const only = "9 Fir Ln, SF, CA 94105"
    const menu = await openKebab(only)
    expect(described(menuItem(menu, "Remove"))).toEqual(["You need at least one address"])
    // A lone legacy non-Primary row still offers Make primary.
    expect(menuItem(menu, "Make primary")).toBeTruthy()
    await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
    await editAll()
    expect(described(removeIn(rowOf(only)))).toEqual(["You need at least one address"])
  })

  it("the reasons follow the draft: after removing B and C, A is the only one left", async () => {
    await render()
    await editAll()
    await click(primaryBox(await expand(B)))
    // A isn't Primary in the draft any more: its Remove is available.
    expect(removeIn(rowOf(A)).getAttribute("aria-disabled")).toBeNull()
    await click(within(section()).getByRole("button", { name: `Collapse ${B}` }))
    await click(removeIn(rowOf(C)))
    await click(removeIn(rowOf(A)))
    // B is the only one left: Primary, and its Remove says why it can't go.
    expect(described(removeIn(rowOf(B)))).toEqual(["You need at least one address"])
  })

  it("Remove the Primary after moving: PUT B, then DELETE A (A's own PUT skipped)", async () => {
    const { writes } = await render()
    await editAll()
    await click(primaryBox(await expand(B)))
    await click(removeIn(rowOf(A)))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /2", "DELETE /1"])
    expect(readRows()).toEqual([B, C])
  })

  it("auto-Primary after removals: a lone non-Primary row left is sent with primary: true before the deletes", async () => {
    const { writes } = await render({ rows: [location({ id: 1, addressLine1: "1 Oak Ave" }), location({ id: 2, addressLine1: "2 Elm St" })] })
    await editAll()
    await click(removeIn(rowOf(A)))
    expect(within(rowOf(B)).getByText("Primary")).toBeTruthy()
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /2", "DELETE /1"])
    expect(writes[0].body).toMatchObject({ primary: true })
  })
})

describe("AddressesSection: save order and failures (Story 4.4)", () => {
  it("Order: the new Primary first (a POST), then the other PUT, then the DELETE", async () => {
    const { writes } = await render()
    await editAll()
    await type(textbox(await expand(C), "City"), "Oakland")
    await click(within(footer()).getByRole("button", { name: "Add address" }))
    const added = expandedRows()[expandedRows().length - 1]
    await pick(typeTrigger(added), "Home")
    await type(textbox(added, "Address line 1"), "7 Bay Rd")
    await type(textbox(added, "City"), "Tahoe")
    await type(textbox(added, "Zip"), "96150")
    await click(primaryBox(added))
    await click(removeIn(rowOf(A)))
    await click(removeIn(rowOf(B)))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["POST ", "PUT /3", "DELETE /1", "DELETE /2"])
    expect(writes[0].body).toMatchObject({ primary: true })
    expect(writes[1].body).toMatchObject({ cityName: "Oakland", primary: false })
  })

  it("Fail mid-save: step 2 of 3 fails → step 3 not sent, refetch, error + Retry; Retry sends steps 2–3 only", async () => {
    let failing = true
    const { writes } = await render({ update: (body, id) => (failing && id === 3 ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined) })
    await editAll()
    await click(primaryBox(await expand(B)))
    await click(within(section()).getByRole("button", { name: `Collapse ${B}` }))
    await type(textbox(await expand(C), "City"), "Oakland")
    await click(within(section()).getByRole("button", { name: `Collapse ${C}` }))
    await click(removeIn(rowOf(A)))
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save addresses."))
    expect(writeLog(writes)).toEqual(["PUT /2", "PUT /3"])
    // Rebased: B is saved as Primary, A still struck through, C still edited.
    expect(rowOf(A).getAttribute("data-state")).toBe("removed")
    failing = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /2", "PUT /3", "PUT /3", "DELETE /1"])
    expect(readRows()).toEqual([B, "3 Bay Rd, Oakland, CA 94105"])
  })

  it("a failed DELETE shows at Section level; Retry sends only that DELETE", async () => {
    let failing = true
    const { writes } = await render({ remove: () => (failing ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined) })
    await kebab(B, "Remove")
    await waitFor(() => expect(isReadView()).toBe(false))
    await type(textbox(await expand(C), "City"), "Oakland")
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save addresses."))
    expect(writeLog(writes)).toEqual(["PUT /3", "DELETE /2"])
    failing = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /3", "DELETE /2", "DELETE /2"])
  })

  it("Removed elsewhere (PUT): the Section says so, the row leaves the form, Retry just closes the edit", async () => {
    const { writes, state } = await render()
    await editAll()
    await type(textbox(await expand(B), "City"), "Oakland")
    // B is removed on another device.
    state.rows = state.rows.filter((row) => row.id !== 2)
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("This address was removed elsewhere, so your changes to it weren't saved."))
    expect(within(banner() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
    expect(rowOf(B)).toBeUndefined()
    expect(writeLog(writes)).toEqual(["PUT /2"])
    // Nothing left to send: Retry just closes the edit.
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /2"])
    expect(readRows()).toEqual([A, C])
  })

  it("Removed elsewhere (PUT) with more to send: Retry sends only the rest", async () => {
    const { writes, state } = await render()
    await editAll()
    await type(textbox(await expand(B), "City"), "Oakland")
    await click(within(section()).getByRole("button", { name: `Collapse ${B}` }))
    await type(textbox(await expand(C), "City"), "Reno")
    state.rows = state.rows.filter((row) => row.id !== 2)
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("removed elsewhere"))
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /2", "PUT /3"])
  })

  it("Removed elsewhere (PUT) while the list refetch fails too: the row still leaves the form, Retry never PUTs it again", async () => {
    let failList = false
    const { writes, state } = await render({ list: () => (failList ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined) })
    await editAll()
    await type(textbox(await expand(B), "City"), "Oakland")
    await click(within(section()).getByRole("button", { name: `Collapse ${B}` }))
    await type(textbox(await expand(C), "City"), "Reno")
    state.rows = state.rows.filter((row) => row.id !== 2)
    failList = true
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("This address was removed elsewhere, so your changes to it weren't saved."))
    expect(rowOf(B)).toBeUndefined()
    expect(writeLog(writes)).toEqual(["PUT /2"])
    failList = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["PUT /2", "PUT /3"])
  })

  it("DELETE ok → a later step fails → the refetch fails: the deleted row leaves the form, error + Retry; Retry never DELETEs it again", async () => {
    let failing = true
    let failList = false
    const { writes } = await render({
      remove: (id) => (failing && id === 3 ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined),
      list: () => (failList ? HttpResponse.json({ message: "boom" }, { status: 500 }) : undefined),
    })
    await kebab(B, "Remove")
    await waitFor(() => expect(isReadView()).toBe(false))
    await click(removeIn(rowOf(C)))
    failList = true
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save addresses."))
    expect(within(banner() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
    expect(writeLog(writes)).toEqual(["DELETE /2", "DELETE /3"])
    // No rebase (the refetch failed): B, deleted, still leaves the form; C stays struck through, A stays.
    expect(rowOf(B)).toBeUndefined()
    expect(rowOf(C).getAttribute("data-state")).toBe("removed")
    expect(rowOf(A)).toBeTruthy()
    expect(isReadView()).toBe(false)
    failing = false
    failList = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["DELETE /2", "DELETE /3", "DELETE /3"])
    expect(readRows()).toEqual([A])
    expect(toastSuccess).toHaveBeenCalledWith("Addresses saved.")
  })

  it("Removed elsewhere (DELETE): the row already gone counts as done; the save succeeds", async () => {
    const { writes, state } = await render()
    await kebab(B, "Remove")
    await waitFor(() => expect(isReadView()).toBe(false))
    state.rows = state.rows.filter((row) => row.id !== 2)
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writeLog(writes)).toEqual(["DELETE /2"])
    expect(toastSuccess).toHaveBeenCalledWith("Addresses saved.")
    expect(banner()).toBeNull()
  })
})

describe("AddressesSection: Primary and removal accessibility (Story 4.4)", () => {
  it.each([
    ["light", 1024],
    ["dark", 1024],
    ["light", 360],
    ["dark", 360],
  ] as const)("has no axe violations in %s mode at %i px with a locked Primary box, a struck row and disabled Removes", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await render()
    await kebab(C, "Remove")
    await waitFor(() => expect(isReadView()).toBe(false))
    await expand(A)
    expect(await axeViolations()).toEqual([])
  })

  it("the read view with its kebabs has no axe violations", async () => {
    await render()
    expect(await axeViolations()).toEqual([])
  })
})
