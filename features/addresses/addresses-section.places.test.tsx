import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type HttpHandler } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchMyself } from "@/lib/api"
import { COMBOBOX_MESSAGES } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { renderInPage } from "@/test/providers"
import { AddressesSection } from "."

vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// Full edit flows (a search, a pick, a save, a refetch) take up to ~1 s here and several times that on a loaded CI runner.
vi.setConfig({ testTimeout: 20_000 })

/**
 * Story 4.3 (NG-9026): address line 1 suggestions in the Addresses edit view
 * on `/` (`renderInPage`, MSW at `/api`): every row of the I/O matrix in
 * `spec-4-3-address-suggestions-via-server.md`, the keyboard and axe with the
 * listbox open. The server side (`PLACES_ENABLED`, limits, Google) is F2's
 * (`lib/server/named-ops/places.test.ts`).
 */

const LIST = "/api/1h/v2/person/location/list"
const CREATE = "/api/1h/v2/person/location"
const COUNTRIES = "/api/1h/v2/public/countries"
const AUTOCOMPLETE = "/api/places/autocomplete"
const DETAILS = "/api/places/details"
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type Wire = Record<string, unknown>

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

/** Main Work 2 (validated), then Home 1 (Primary, not validated). Shown as 1, 2. */
const ADDRESSES: Wire[] = [
  location({ id: 2, personLocationType: "Main Work", validated: true }),
  location({ id: 1, addressLine1: "9 Oak Ave", addressLine2: "Apt 4", primary: true }),
]

const COUNTRY_LIST = [{ id: 1, name: "Germany" }, { id: 2, name: "Canada" }, { id: 4, name: "United States" }, { id: 5, name: "Australia" }]

const suggestion = (n: number, mainText = `${n} Pine Street`) => ({ placeId: `ChIJ-place-${n}`, mainText, secondaryText: "San Francisco, CA, USA", matches: [] })

/** Six suggestions: the client keeps 5. */
const SUGGESTIONS = [1, 2, 3, 4, 5, 6].map((n) => suggestion(n))

const COMPLETE = {
  enabled: true,
  addressLine1: "1 Pine Street",
  cityName: "San Francisco",
  county: "San Francisco County",
  stateName: "California",
  postalCode: "94104",
  countryCode: "US",
  country: "United States",
  fullAddress: "1 Pine Street, San Francisco, CA 94104, USA",
  complete: true,
}

const WIRE_FIELDS = ["personLocationType", "addressLine1", "addressLine2", "cityName", "county", "stateName", "postalCode", "country", "primary", "validated"]

interface ServerOptions {
  readonly autocomplete?: (body: Wire) => Response | Promise<Response>
  readonly details?: (body: Wire) => Response | Promise<Response>
  /** Address writes (POST, PUT) answer only once this settles. */
  readonly holdWrites?: Promise<void>
}

/** A promise released by hand (a held answer). */
function held() {
  let release: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

/** The address backend of the 4.2 tests (list, countries, POST, PUT) plus the two Places routes; records every call. */
function placesServer(options: ServerOptions = {}) {
  const state = { rows: ADDRESSES.map((row) => ({ ...row })), nextId: 31 }
  const writes: { method: string; body: Wire }[] = []
  const calls = { autocomplete: [] as Wire[], details: [] as Wire[] }
  const apply = (target: Wire, body: Wire) => {
    for (const field of WIRE_FIELDS) if (field in body) target[field] = body[field]
  }
  const handlers: HttpHandler[] = [
    http.get(LIST, () => HttpResponse.json({ data: state.rows, totalElements: state.rows.length, lastPage: true })),
    http.get(COUNTRIES, () => HttpResponse.json(COUNTRY_LIST)),
    http.post(CREATE, async ({ request }) => {
      const body = (await request.json()) as Wire
      writes.push({ method: "POST", body })
      await options.holdWrites
      const row = location({ id: state.nextId })
      state.nextId += 1
      apply(row, body)
      state.rows.push(row)
      return HttpResponse.json(row)
    }),
    http.put(`${CREATE}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Wire
      writes.push({ method: "PUT", body })
      await options.holdWrites
      const row = state.rows.find((candidate) => candidate.id === Number(params.id))
      if (row) apply(row, body)
      return HttpResponse.json(row ?? {})
    }),
    http.post(AUTOCOMPLETE, async ({ request }) => {
      const body = (await request.json()) as Wire
      calls.autocomplete.push(body)
      return options.autocomplete ? options.autocomplete(body) : HttpResponse.json({ enabled: true, suggestions: SUGGESTIONS })
    }),
    http.post(DETAILS, async ({ request }) => {
      const body = (await request.json()) as Wire
      calls.details.push(body)
      return options.details ? options.details(body) : HttpResponse.json(COMPLETE)
    }),
  ]
  return { state, writes, calls, handlers }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Addresses" })
const button = (name: string | RegExp): HTMLElement => within(section()).getByRole("button", { name })
const footer = (): HTMLElement => section().querySelector('[data-slot="section-footer"]') as HTMLElement
const isReadView = (): boolean => section().querySelector('[data-slot="section-footer"]') === null
const banner = (): HTMLElement | null => section().querySelector('[data-slot~="inline-banner"]')
const expandedRows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>('[data-slot="address-expanded"]')]
const line1 = (row: HTMLElement): HTMLInputElement => within(row).getByRole("combobox", { name: "Address line 1" }) as HTMLInputElement
const textbox = (row: HTMLElement, name: string): HTMLInputElement => within(row).getByRole("textbox", { name }) as HTMLInputElement
const typeTrigger = (row: HTMLElement): HTMLElement => within(row).getByRole("combobox", { name: "Address Type" })
const countryTrigger = (row: HTMLElement): HTMLElement => within(row).getByRole("combobox", { name: "Country" })
const suggestionsList = (): HTMLElement | null => screen.queryByRole("listbox", { name: "Address line 1" })
const described = (element: HTMLElement): (string | undefined)[] =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? undefined)
const helpShown = (row: HTMLElement): boolean => row.textContent?.includes(COMBOBOX_MESSAGES.addressHelp) === true
/** The Section's polite status (a pick's announcement). */
const status = (): string => section().querySelector('[data-slot="live-status"]')?.textContent ?? ""
/** The collapsed edit row holding `text`, and its Verified badge. */
const badgeOf = (text: string): Element | null | undefined =>
  [...section().querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(text))?.querySelector('[data-slot="status-badge"]')

async function render(options: ServerOptions = {}) {
  const server = placesServer(options)
  const result = renderInPage(<AddressesSection />, { page: "profile", handlers: server.handlers })
  await waitFor(() => expect(section().querySelector('[data-slot="state-frame"]')?.getAttribute("data-state")).toBe("ready"))
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

async function key(element: HTMLElement, name: string) {
  await act(async () => fireEvent.keyDown(element, { key: name }))
}

async function pickSelect(trigger: HTMLElement, name: string) {
  await key(trigger, "Enter")
  await click(await screen.findByRole("option", { name }))
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
}

/** The kebab's Edit on the row named `address`: that row expanded. */
async function kebabEdit(address: string): Promise<HTMLElement> {
  await key(button(`More actions for ${address}`), "Enter")
  await click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Edit" }))
  await waitFor(() => expect(isReadView()).toBe(false))
  return expandedRows()[0]
}

/** Add address (the header's in read view, the footer's while editing): one new row, expanded, its Address Type picked. */
async function addAddress(addressType = "Home"): Promise<HTMLElement> {
  const host = isReadView() ? (section().querySelector('[data-slot="section-header"]') as HTMLElement) : footer()
  await click(within(host).getByRole("button", { name: "Add address" }))
  const rows = expandedRows()
  const row = rows[rows.length - 1]
  await pickSelect(typeTrigger(row), addressType)
  return row
}

/** Types into line 1 and waits for the suggestions. */
async function search(row: HTMLElement, text: string): Promise<HTMLElement> {
  await type(line1(row), text)
  return screen.findByRole("listbox", { name: "Address line 1" })
}

/** Picks the first suggestion with the keyboard (Arrow Down, Enter). */
async function pickFirst(row: HTMLElement) {
  await key(line1(row), "ArrowDown")
  await key(line1(row), "Enter")
}

async function save() {
  await click(within(footer()).getByRole("button", { name: "Save" }))
}

/** Waits past the 250 ms debounce. */
async function pastDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
}

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  window.localStorage.clear()
})
afterEach(() => {
  document.documentElement.classList.remove("dark")
})

describe("AddressesSection: address suggestions (Story 4.3)", () => {
  it("Suggest: a US row, \"1 Pin\" → one POST after the debounce; 5 options (44 px), the match in 600, the help line and \"Powered by Google\"", async () => {
    const { calls } = await render()
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    const input = line1(row)
    expect(input.value).toBe("1 Pine St")
    expect(input.getAttribute("aria-required")).toBe("true")
    // WCAG 1.3.5: line 1 keeps its autofill purpose.
    expect(input.getAttribute("autocomplete")).toBe("address-line1")
    // No answer yet: no help line (with Places off it never shows).
    expect(described(input)).toEqual([])
    // Under 3 characters (trimmed): no search.
    await type(input, " 1 ")
    await pastDebounce()
    expect(calls.autocomplete).toEqual([])
    await type(input, "1 Pi")
    const listbox = await search(row, "1 Pin")
    expect(calls.autocomplete).toHaveLength(1)
    expect(calls.autocomplete[0]).toMatchObject({ input: "1 Pin", countryCode: "US" })
    expect(String(calls.autocomplete[0].lookupId)).toMatch(UUID_V4)
    const options = within(listbox).getAllByRole("option").filter((option) => option.getAttribute("aria-disabled") !== "true")
    expect(options.map((option) => option.getAttribute("aria-label"))).toEqual(SUGGESTIONS.slice(0, 5).map((s) => `${s.mainText}, ${s.secondaryText}`))
    for (const option of options) expect(option.className).toContain("min-h-11")
    expect(options[0].querySelector(".font-semibold")?.textContent).toBe("1 Pin")
    expect(within(listbox).getByText("Powered by Google").closest('[role="option"]')?.getAttribute("aria-disabled")).toBe("true")
    expect(input.getAttribute("aria-expanded")).toBe("true")
    // An enabled: true answer was seen: the help line shows.
    expect(described(line1(row))).toEqual([COMBOBOX_MESSAGES.addressHelp])
    expect(banner()).toBeNull()
  })

  it("stale answers are discarded: only the latest query's suggestions show", async () => {
    let releaseFirst: () => void = () => undefined
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const { calls } = await render({
      autocomplete: async (body) => {
        if (body.input === "1 Pi") {
          await firstHeld
          return HttpResponse.json({ enabled: true, suggestions: [suggestion(9, "1 Pier Road")] })
        }
        return HttpResponse.json({ enabled: true, suggestions: [suggestion(1)] })
      },
    })
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await type(line1(row), "1 Pi")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(1))
    const listbox = await search(row, "1 Pin")
    await act(async () => releaseFirst())
    await pastDebounce()
    expect(within(listbox).queryByText(/Pier/)).toBeNull()
    expect(within(listbox).getAllByRole("option")[0].getAttribute("aria-label")).toBe("1 Pine Street, San Francisco, CA, USA")
  })

  it("Complete pick on a new row: details with the same lookupId fill every part, Verified; Save POSTs validated true; read view \"Verified\"", async () => {
    const { calls, writes } = await render()
    const row = await addAddress()
    await search(row, "1 Pin")
    await pickFirst(row)
    await waitFor(() => expect(textbox(row, "City").value).toBe("San Francisco"))
    expect(calls.details).toEqual([{ placeId: "ChIJ-place-1", lookupId: calls.autocomplete[0].lookupId }])
    expect(line1(row).value).toBe("1 Pine Street")
    expect(textbox(row, "County (optional)").value).toBe("San Francisco County")
    expect(textbox(row, "State/Province (optional)").value).toBe("California")
    expect(textbox(row, "Zip").value).toBe("94104")
    expect(countryTrigger(row).textContent).toBe("United States")
    expect(suggestionsList()).toBeNull()
    await waitFor(() => expect(status()).toBe("Address filled from the suggestion and verified."))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual([
      {
        method: "POST",
        body: {
          personLocationType: "Home",
          addressLine1: "1 Pine Street",
          cityName: "San Francisco",
          county: "San Francisco County",
          stateName: "California",
          postalCode: "94104",
          country: "United States",
          primary: false,
          validated: true,
        },
      },
    ])
    const saved = [...section().querySelectorAll("tbody tr")].find((tr) => tr.textContent?.startsWith("1 Pine Street"))
    expect(saved?.querySelector('[data-slot="status-badge"]')?.textContent).toBe("Verified")
  })

  it("Complete pick on a saved unverified row: the collapsed row shows Verified; Save PUTs validated true", async () => {
    const { writes } = await render()
    const row = await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    await search(row, "1 Pin")
    await pickFirst(row)
    await waitFor(() => expect(textbox(row, "Zip").value).toBe("94104"))
    // Line 2 never clears Verified (decision 2a).
    await type(textbox(row, "Address line 2 (optional)"), "Floor 3")
    await click(button("Collapse 9 Oak Ave, Apt 4, SF, CA 94105"))
    const collapsed = [...section().querySelectorAll("tbody tr")].find((tr) => tr.textContent?.startsWith("1 Pine Street"))
    expect(collapsed?.querySelector('[data-slot="status-badge"]')?.textContent).toBe("Verified")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ method: "PUT", body: { addressLine1: "1 Pine Street", addressLine2: "Floor 3", cityName: "San Francisco", validated: true, primary: true } })
  })

  it("Partial pick: the returned parts fill, the zip stays empty, not Verified; Save shows \"Enter a ZIP code\" and sends nothing", async () => {
    const { writes } = await render({ details: () => HttpResponse.json({ ...COMPLETE, postalCode: "", county: "", complete: false }) })
    const row = await addAddress()
    await search(row, "1 Pin")
    await pickFirst(row)
    await waitFor(() => expect(textbox(row, "City").value).toBe("San Francisco"))
    expect(line1(row).value).toBe("1 Pine Street")
    expect(textbox(row, "Zip").value).toBe("")
    await waitFor(() => expect(status()).toBe("Address filled from the suggestion."))
    await save()
    await waitFor(() => expect(described(textbox(row, "Zip"))).toEqual(["Enter a ZIP code"]))
    expect(writes).toEqual([])
  })

  it("Edit after pick: typing in the city clears Verified; Save sends validated false", async () => {
    const { writes } = await render()
    const row = await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    await search(row, "1 Pin")
    await pickFirst(row)
    await waitFor(() => expect(textbox(row, "City").value).toBe("San Francisco"))
    await type(textbox(row, "City"), "Oakland")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes[0]).toMatchObject({ method: "PUT", body: { addressLine1: "1 Pine Street", cityName: "Oakland", validated: false } })
  })

  it("a manual edit of a saved verified row's line 1 or country clears Verified (the collapsed row shows none)", async () => {
    await render({ autocomplete: () => HttpResponse.json({ enabled: true, suggestions: [] }) })
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await type(line1(row), "1 Pine Street")
    await click(button("Collapse 1 Pine St, SF, CA 94105"))
    const collapsed = () => [...section().querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes("Main Work"))
    expect(collapsed()?.querySelector('[data-slot="status-badge"]')).toBeNull()
    await click(within(footer()).getByRole("button", { name: "Cancel" }))
    const again = await kebabEdit("1 Pine St, SF, CA 94105")
    await pickSelect(countryTrigger(again), "Canada")
    await click(button("Collapse 1 Pine St, SF, CA 94105"))
    expect(collapsed()?.querySelector('[data-slot="status-badge"]')).toBeNull()
  })

  it("Other country: a Germany row makes no request and shows no listbox or help line; manual Save works", async () => {
    const { calls, writes } = await render()
    const row = await addAddress()
    await search(row, "1 Pin")
    expect(helpShown(row)).toBe(true)
    await key(line1(row), "Escape")
    await pickSelect(countryTrigger(row), "Germany")
    expect(helpShown(row)).toBe(false)
    expect(described(line1(row))).toEqual([])
    await type(line1(row), "Hauptstraße 1")
    await pastDebounce()
    await key(line1(row), "ArrowDown")
    await pastDebounce()
    expect(calls.autocomplete).toHaveLength(1)
    expect(suggestionsList()).toBeNull()
    await type(textbox(row, "City"), "Berlin")
    await type(textbox(row, "Zip"), "10115")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes[0]).toMatchObject({ method: "POST", body: { addressLine1: "Hauptstraße 1", country: "Germany", validated: false } })
  })

  it("Off: an enabled: false answer hides the listbox and help line for the rest of the Section's life; manual Save works", async () => {
    const { calls, writes } = await render({ autocomplete: () => HttpResponse.json({ enabled: false, suggestions: [] }) })
    const row = await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    expect(helpShown(row)).toBe(false)
    await type(line1(row), "1 Pin")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(1))
    await pastDebounce()
    expect(helpShown(row)).toBe(false)
    expect(suggestionsList()).toBeNull()
    await type(line1(row), "1 Pine")
    await pastDebounce()
    expect(calls.autocomplete).toHaveLength(1)
    // Another row, and a later edit: still off.
    const added = await addAddress()
    expect(helpShown(added)).toBe(false)
    await type(line1(added), "7 Bay Rd")
    await pastDebounce()
    expect(calls.autocomplete).toHaveLength(1)
    await click(within(footer()).getByRole("button", { name: "Cancel" }))
    const again = await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    expect(helpShown(again)).toBe(false)
    await type(textbox(again, "City"), "Oakland")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ method: "PUT", body: { cityName: "Oakland", validated: false } })
  })

  it("Failure: autocomplete 502 or a network error shows no listbox and no banner", async () => {
    let network = false
    const { calls } = await render({
      autocomplete: () => (network ? HttpResponse.error() : HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })),
    })
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await type(line1(row), "1 Pin")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(1))
    await pastDebounce()
    expect(suggestionsList()).toBeNull()
    network = true
    await type(line1(row), "1 Pine")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(2))
    await pastDebounce()
    expect(suggestionsList()).toBeNull()
    expect(banner()).toBeNull()
  })

  it("Failure: details 504 keeps the typed text and Verified as they were, with no banner", async () => {
    const { calls } = await render({ details: () => HttpResponse.json({ errorCode: "UPSTREAM_TIMEOUT", source: "proxy" }, { status: 504 }) })
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await search(row, "1 Pine")
    await pickFirst(row)
    await waitFor(() => expect(calls.details).toHaveLength(1))
    await waitFor(() => expect(line1(row).value).toBe("1 Pine"))
    expect(textbox(row, "City").value).toBe("SF")
    expect(banner()).toBeNull()
    expect(suggestionsList()).toBeNull()
  })

  it("details enabled: false keeps the typed text and turns suggestions off", async () => {
    await render({ details: () => HttpResponse.json({ enabled: false }) })
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await search(row, "1 Pin")
    await pickFirst(row)
    await waitFor(() => expect(line1(row).value).toBe("1 Pin"))
    await waitFor(() => expect(helpShown(row)).toBe(false))
  })

  it("Session: two picks in one row use two lookups; each details call ends its own", async () => {
    const { calls } = await render()
    const row = await addAddress()
    await type(line1(row), "1 Pi")
    await search(row, "1 Pin")
    await pickFirst(row)
    await waitFor(() => expect(calls.details).toHaveLength(1))
    await waitFor(() => expect(line1(row).value).toBe("1 Pine Street"))
    // The old list shows during the debounce: wait for the new lookup's answer before picking.
    await search(row, "2 Pin")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(2))
    await pastDebounce()
    await pickFirst(row)
    await waitFor(() => expect(calls.details).toHaveLength(2))
    const [first, second] = calls.autocomplete.map((body) => body.lookupId)
    expect(calls.autocomplete).toHaveLength(2)
    expect(first).not.toBe(second)
    expect(calls.details.map((body) => body.lookupId)).toEqual([first, second])
  })

  it("emptying line 1 starts a new lookup", async () => {
    const { calls } = await render({ autocomplete: () => HttpResponse.json({ enabled: true, suggestions: [] }) })
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await type(line1(row), "1 Pin")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(1))
    await type(line1(row), "1 Pine")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(2))
    await type(line1(row), "")
    await type(line1(row), "2 Oak")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(3))
    const ids = calls.autocomplete.map((body) => body.lookupId)
    expect(ids[1]).toBe(ids[0])
    expect(ids[2]).not.toBe(ids[0])
  })

  it("a Save while the details call is held sends the street (main text), never the whole label; the late answer changes nothing", async () => {
    const answer = held()
    const { writes } = await render({
      details: async () => {
        await answer.promise
        return HttpResponse.json(COMPLETE)
      },
    })
    const row = await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    await search(row, "1 Pin")
    await pickFirst(row)
    expect(line1(row).value).toBe("1 Pine Street")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ method: "PUT", body: { addressLine1: "1 Pine Street", cityName: "SF", validated: false } })
    await act(async () => answer.release())
    await pastDebounce()
    expect(isReadView()).toBe(true)
    expect(writes).toHaveLength(1)
  })

  it("a late details answer after Cancel changes nothing", async () => {
    const answer = held()
    await render({
      details: async () => {
        await answer.promise
        return HttpResponse.json(COMPLETE)
      },
    })
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await search(row, "1 Pin")
    await pickFirst(row)
    await click(within(footer()).getByRole("button", { name: "Cancel" }))
    expect(isReadView()).toBe(true)
    await act(async () => answer.release())
    await pastDebounce()
    expect(isReadView()).toBe(true)
    const again = await kebabEdit("1 Pine St, SF, CA 94105")
    expect(line1(again).value).toBe("1 Pine St")
    expect(textbox(again, "City").value).toBe("SF")
    expect(within(footer()).queryByText("Unsaved changes")).toBeNull()
  })

  it("typing after a pick drops its held details answer: nothing is filled, not Verified", async () => {
    const answer = held()
    const { calls } = await render({
      details: async () => {
        await answer.promise
        return HttpResponse.json(COMPLETE)
      },
    })
    const row = await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    await search(row, "1 Pin")
    await pickFirst(row)
    await waitFor(() => expect(calls.details).toHaveLength(1))
    await type(line1(row), "12 Elm St")
    await key(line1(row), "Escape")
    await act(async () => answer.release())
    await pastDebounce()
    expect(line1(row).value).toBe("12 Elm St")
    expect(textbox(row, "City").value).toBe("SF")
    expect(status()).toBe("")
    await click(button("Collapse 9 Oak Ave, Apt 4, SF, CA 94105"))
    expect(badgeOf("12 Elm St")).toBeNull()
  })

  it.each([
    ["City", "Oakland"],
    ["Zip", "94612"],
    ["State/Province (optional)", "Oregon"],
    ["County (optional)", "Alameda"],
    ["Address line 2 (optional)", "Suite 12"],
  ])("a manual %s edit after a pick survives its held details answer", async (field, value) => {
    const answer = held()
    const { calls, writes } = await render({
      details: async () => {
        await answer.promise
        return HttpResponse.json(COMPLETE)
      },
    })
    const row = await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    await search(row, "1 Pin")
    await pickFirst(row)
    await waitFor(() => expect(calls.details).toHaveLength(1))
    await type(textbox(row, field), value)
    await act(async () => answer.release())
    await pastDebounce()
    expect(line1(row).value).toBe("1 Pine Street")
    expect(textbox(row, field).value).toBe(value)
    // Dropping the entire stale fill keeps the untouched parts and never claims verification.
    if (field !== "City") expect(textbox(row, "City").value).toBe("SF")
    if (field !== "Zip") expect(textbox(row, "Zip").value).toBe("94105")
    expect(status()).toBe("")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toHaveLength(1)
    expect(writes[0].body.validated).toBe(false)
    // A details request ends its billing session even if a later edit makes its answer stale.
    expect(calls.details[0].lookupId).toBe(calls.autocomplete[0].lookupId)
  })

  it("a Country change after a pick empties the parts and drops its held details answer (NG-9026)", async () => {
    const answer = held()
    const { calls, writes } = await render({
      details: async () => {
        await answer.promise
        return HttpResponse.json(COMPLETE)
      },
    })
    const row = await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    await search(row, "1 Pin")
    await pickFirst(row)
    await waitFor(() => expect(calls.details).toHaveLength(1))
    await pickSelect(countryTrigger(row), "Canada")
    await act(async () => answer.release())
    await pastDebounce()
    expect(countryTrigger(row).textContent).toBe("Canada")
    expect([line1(row).value, ...["Address line 2 (optional)", "City", "County (optional)", "State/Province (optional)", "Zip"].map((name) => textbox(row, name).value)]).toEqual(["", "", "", "", "", ""])
    expect(status()).toBe("")
    await save()
    await waitFor(() => expect(described(textbox(row, "City"))).toEqual(["Enter a city"]))
    expect(writes).toEqual([])
    expect(calls.details[0].lookupId).toBe(calls.autocomplete[0].lookupId)
  })

  it("line 1 is read-only while saving: readOnly + aria-readonly, a change is ignored (value and body), no search", async () => {
    const writesHeld = held()
    const { calls, writes } = await render({ holdWrites: writesHeld.promise })
    const row = await kebabEdit("9 Oak Ave, Apt 4, SF, CA 94105")
    await type(textbox(row, "City"), "Oakland")
    await save()
    await waitFor(() => expect(writes).toHaveLength(1))
    const input = line1(row)
    expect(input.readOnly).toBe(true)
    expect(input.getAttribute("aria-readonly")).toBe("true")
    await type(input, "1 Pine")
    expect(line1(row).value).toBe("9 Oak Ave")
    await pastDebounce()
    expect(calls.autocomplete).toEqual([])
    await act(async () => writesHeld.release())
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toHaveLength(1)
    expect(writes[0].body).toMatchObject({ addressLine1: "9 Oak Ave", cityName: "Oakland" })
  })

  it("Cancel and reopen: the next search starts a new lookup", async () => {
    const { calls } = await render()
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await search(row, "1 Pin")
    await click(within(footer()).getByRole("button", { name: "Cancel" }))
    const again = await kebabEdit("1 Pine St, SF, CA 94105")
    await type(line1(again), "2 Pin")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(2))
    expect(calls.autocomplete[1].lookupId).not.toBe(calls.autocomplete[0].lookupId)
  })

  it("a country change (US → Canada) ends the lookup and closes the old suggestions: the next search uses a new lookupId", async () => {
    const { calls } = await render()
    const row = await addAddress()
    await search(row, "1 Pin")
    await key(line1(row), "Escape")
    await pickSelect(countryTrigger(row), "Canada")
    expect(suggestionsList()).toBeNull()
    await type(line1(row), "1 Pine")
    await waitFor(() => expect(calls.autocomplete).toHaveLength(2))
    expect(calls.autocomplete[1]).toMatchObject({ input: "1 Pine", countryCode: "CA" })
    expect(calls.autocomplete[1].lookupId).not.toBe(calls.autocomplete[0].lookupId)
  })

  it("Keyboard: Escape closes only the listbox (the Section stays in edit); leaving the field keeps the typed text", async () => {
    await render()
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await search(row, "1 Pin")
    await key(line1(row), "ArrowDown")
    expect(line1(row).getAttribute("aria-activedescendant")).toBeTruthy()
    await key(line1(row), "Escape")
    expect(suggestionsList()).toBeNull()
    expect(isReadView()).toBe(false)
    expect(line1(row).value).toBe("1 Pin")
    await search(row, "1 Pine")
    // Tab: focus moves on to line 2; free text keeps "1 Pine".
    const next = textbox(row, "Address line 2 (optional)")
    await act(async () => {
      line1(row).focus()
      fireEvent.blur(line1(row), { relatedTarget: next })
      next.focus()
    })
    await waitFor(() => expect(suggestionsList()).toBeNull())
    expect(line1(row).value).toBe("1 Pine")
  })

  it.each(["light", "dark"] as const)("has no axe violations in %s mode with the suggestions open", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    await render()
    const row = await kebabEdit("1 Pine St, SF, CA 94105")
    await search(row, "1 Pin")
    await key(line1(row), "ArrowDown")
    expect(await axeViolations()).toEqual([])
  })
})
