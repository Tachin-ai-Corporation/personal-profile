import { act, render as renderPlain, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type HttpHandler } from "msw"
import { createElement, useEffect, type ReactNode } from "react"
import useSWR, { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { Input } from "@/components/ui/input"
import { runSaveAll, SectionFooter, toastError, toastSuccess, useSectionForm } from "@/features/shell"
import { fetchMyself, keys, sessionEvents, type SwrKey } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { contactPointWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { PhoneSection } from "."

// The Section's own toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// The global `mutate` the revalidate helpers load (`lib/api/keys.ts`), made to reject on demand.
const globalMutate = vi.hoisted(() => ({ fail: false }))
vi.mock("swr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("swr")>()
  return {
    ...actual,
    mutate: (...args: Parameters<typeof actual.mutate>) => (globalMutate.fail ? Promise.reject(new Error("refetch failed")) : actual.mutate(...args)),
  }
})

/**
 * Story 3.2 (NG-9023): the Phone edit view and its save on `/`, rendered the
 * way `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers every row
 * of the I/O matrix in `spec-3-2-add-relabel-and-remove-phones.md`.
 */

const LIST = "/api/1h/v2/user/contact-point/list"
const MANAGE = "/api/1h/v2/health/contact-point"
const CONTACT_TYPE = "/api/1h/v2/type/key/ContactPoint"
const DRAFT_KEY = "pp:draft:v1:demo:42:phone"

type Wire = Record<string, unknown>
type Lists = Partial<Record<"Mobile" | "Landline", Wire[] | (() => Response)>>

/** Mobile [Work 11 (unverified), Primary 12 (notifications on)], Landline [Home 21, GB]: shown 12, 11, 21. */
const MOBILE: Wire[] = [
  contactPointWire({ id: 11, value: "+14155550111", label: "Work", isVerified: false, isNotificationEnabled: false }),
  contactPointWire({ id: 12, value: "+14155512125", label: "Primary", isVerified: true, isNotificationEnabled: true }),
]
const LANDLINE: Wire[] = [contactPointWire({ id: 21, value: "+442071838750", type: "Landline", label: "Home", isVerified: false, phoneNumberRegion: "gb" })]
const DEFAULT_LISTS: Lists = { Mobile: MOBILE, Landline: LANDLINE }

/** `count` saved phones of `type` (ids from `start`), none Primary. */
const many = (type: "Mobile" | "Landline", count: number, start: number): Wire[] =>
  Array.from({ length: count }, (_, index) =>
    contactPointWire({ id: start + index, type, value: `+1415555${String(start + index).padStart(4, "0")}`, label: "Work", phoneNumberRegion: "us" }),
  )

/** Answers the Contact Point lists per type (`[]` for any other), and records each manage body. */
function phoneServer(lists: Lists, answer: () => Response | Promise<Response> = () => new HttpResponse(null, { status: 200 })) {
  const bodies: unknown[] = []
  const handlers: HttpHandler[] = [
    http.get(LIST, ({ request }) => {
      const type = new URL(request.url).searchParams.get("type") as "Mobile" | "Landline"
      const list = lists[type] ?? []
      return typeof list === "function" ? list() : HttpResponse.json(list)
    }),
    http.post(MANAGE, async ({ request }) => {
      bodies.push(await request.json())
      return answer()
    }),
  ]
  return { bodies, handlers }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Phone" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const heading = (): HTMLElement => screen.getByRole("heading", { level: 2, name: "Phone" })
const button = (name: string | RegExp): HTMLElement => within(section()).getByRole("button", { name })
const isReadView = (): boolean => section().querySelector('[data-slot="section-footer"]') === null
/** The body rows of the edit table (desktop) or its cards (mobile). */
const editRows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>("tbody tr, li[data-slot='section-table-card']")]
const newRow = (): HTMLElement => {
  const rows = section().querySelectorAll<HTMLElement>('[data-state="new"]')
  return rows[rows.length - 1]
}
const numberInput = (row: HTMLElement): HTMLInputElement => within(row).getByRole("textbox", { name: "Number" }) as HTMLInputElement
const labelTrigger = (row: HTMLElement): HTMLElement => within(row).getByRole("combobox", { name: "Label" })
const typeTrigger = (row: HTMLElement): HTMLElement => within(row).getByRole("combobox", { name: "Type" })
/** The ids an element's `aria-describedby` names, as their text. */
const described = (element: HTMLElement): (string | undefined)[] =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? undefined)

/**
 * Loads each key with a counting loader from the app's default SWR cache: the
 * one `mutateContactPoints` / `mutateMyself` revalidate (in the app the root
 * `SwrProvider` uses it; `renderInPage` gives the Section its own cache).
 */
function watchAppCache(list: readonly SwrKey[]): Map<string, number> {
  const loads = new Map<string, number>()
  function Probe({ swrKey }: { readonly swrKey: SwrKey }) {
    useSWR(swrKey, async () => {
      loads.set(JSON.stringify(swrKey), (loads.get(JSON.stringify(swrKey)) ?? 0) + 1)
      return []
    }, { dedupingInterval: 0 })
    return null
  }
  renderPlain(createElement("div", null, ...list.map((swrKey) => createElement(Probe, { key: JSON.stringify(swrKey), swrKey }))))
  return loads
}

async function render(lists: Lists = DEFAULT_LISTS, answer?: () => Response | Promise<Response>, extra: HttpHandler[] = [], beside?: ReactNode) {
  const server = phoneServer(lists, answer)
  let scoped: ScopedMutator | undefined
  function CacheProbe() {
    const { mutate } = useSWRConfig()
    useEffect(() => {
      scoped = mutate
    }, [mutate])
    return null
  }
  const result = renderInPage(
    <>
      <PhoneSection />
      <CacheProbe />
      {beside}
    </>,
    { page: "profile", handlers: [...server.handlers, ...extra] },
  )
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  // D-A: a write goes out only once the page user is pinned (the page's own `myself` read does it).
  await act(async () => {
    await fetchMyself()
  })
  /** Revalidates the Section's own two Phone keys (its cache; the app helpers act on the default one). */
  const refetch = () =>
    act(async () => {
      await Promise.all([scoped?.(keys.contactPoints("Mobile")), scoped?.(keys.contactPoints("Landline"))])
    })
  /** Puts `rows` in the Section's cache for `type` without a request. */
  const setList = (type: "Mobile" | "Landline", rows: Wire[]) =>
    act(async () => {
      await scoped?.(keys.contactPoints(type), rows.map((row) => ({ ...row })), { revalidate: false })
    })
  return { ...result, bodies: server.bodies, refetch, setList }
}

async function click(element: HTMLElement) {
  await act(async () => fireEvent.click(element))
}

async function typeNumber(row: HTMLElement, value: string) {
  await act(async () => fireEvent.change(numberInput(row), { target: { value } }))
}

async function blur(element: HTMLElement) {
  await act(async () => fireEvent.blur(element))
}

/** Opens a Select and picks the option named `name`. */
async function pick(trigger: HTMLElement, name: string | RegExp) {
  await act(async () => fireEvent.keyDown(trigger, { key: "Enter" }))
  const option = await screen.findByRole("option", { name })
  await act(async () => fireEvent.click(option))
  // The listbox closes and hands focus back to its trigger.
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
}

async function openKebab(number: string): Promise<HTMLElement> {
  await act(async () => fireEvent.keyDown(button(`More actions for ${number}`), { key: "Enter" }))
  return screen.findByRole("menu")
}

/** Adds a new row (header "Add phone" in read view, the footer's while editing) and fills it. */
async function addPhone(fill?: { readonly number?: string; readonly label?: string; readonly type?: string }) {
  await click(isReadView() ? button("Add phone") : within(section().querySelector('[data-slot="section-footer"]') as HTMLElement).getByRole("button", { name: "Add row" }))
  const row = newRow()
  if (fill?.number !== undefined) await typeNumber(row, fill.number)
  if (fill?.label) await pick(labelTrigger(row), fill.label)
  if (fill?.type) await pick(typeTrigger(row), fill.type)
  return row
}

async function save() {
  await click(within(section()).getByRole("button", { name: "Save" }))
}

/** Escape closes the menu; then its kebab gets focus back (a later timer) before another menu may open. */
async function closeMenu(menu: HTMLElement) {
  await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
}

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  // An earlier test's unmount may still write its draft (the registry flushes it): start clean.
  window.localStorage.clear()
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastError).mockClear()
  globalMutate.fail = false
})
afterEach(() => {
  document.documentElement.classList.remove("dark")
})

describe("PhoneSection: read-view entry points (Story 3.2)", () => {
  it("the header has an outline Edit and Add phone (44 px); each row's kebab is named by its number and holds Edit and Remove", async () => {
    await render()
    for (const name of ["Edit", "Add phone"]) {
      const action = button(name)
      expect(action.className).toContain("h-11")
      expect(action.getAttribute("data-variant") ?? action.className).toMatch(/outline/)
      expect(action.getAttribute("aria-disabled")).toBeNull()
    }
    for (const number of ["+1 (415) 551-2125", "+1 (415) 555-0111", "+44 20 7183 8750"]) expect(button(`More actions for ${number}`)).toBeTruthy()
    const menu = await openKebab("+1 (415) 555-0111")
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Remove"])
  })

  it("Edit switches the whole table in place: Editing, the editing container, focus on the first editable Label; saved Number and Type locked with the help; the Primary label locked", async () => {
    await render()
    await click(button("Edit"))
    expect(within(section()).getByText("Editing")).toBeTruthy()
    expect(section().querySelector('[data-slot="section-container"]')?.getAttribute("data-editing")).toBe("true")
    const [primary, work, home] = editRows()
    expect(document.activeElement).toBe(labelTrigger(work))
    for (const row of [primary, work, home]) {
      const locked = [...row.querySelectorAll<HTMLInputElement>('[data-slot="input-locked"] input')]
      expect(locked.map((input) => [input.value, input.readOnly, input.getAttribute("aria-readonly")])).toEqual([
        [locked[0].value, true, "true"],
        [locked[1].value, true, "true"],
      ])
      // The locked help sits under the Number only (not repeated on the Type).
      expect(described(locked[0])).toEqual(["Saved numbers can't be changed. Remove it and add a new one."])
      expect(described(locked[1]).filter(Boolean)).toEqual([])
    }
    expect([...work.querySelectorAll<HTMLInputElement>('[data-slot="input-locked"] input')].map((input) => input.value)).toEqual(["+1 (415) 555-0111", "Mobile"])
    expect([...home.querySelectorAll<HTMLInputElement>('[data-slot="input-locked"] input')].map((input) => input.value)).toEqual(["+44 20 7183 8750", "Landline"])
    // The Primary row's label is the locked chip: no Label control.
    expect(within(primary).queryByRole("combobox", { name: "Label" })).toBeNull()
    expect(within(primary).getByText("Primary").getAttribute("data-variant")).toBe("primary")
    expect(labelTrigger(work).textContent).toBe("Work")
    // Footer: Add row, Cancel, Save; "Unsaved changes" only after a change.
    const footer = section().querySelector('[data-slot="section-footer"]') as HTMLElement
    expect(within(footer).getAllByRole("button").map((action) => action.textContent)).toEqual(["Add row", "Cancel", "Save"])
    expect(within(section()).queryByText("Unsaved changes")).toBeNull()
  })

  it("the Label list is the type key's labels in display order, without Primary (the enum while it hasn't loaded)", async () => {
    const typeKey = http.get(CONTACT_TYPE, () =>
      HttpResponse.json({
        boKey: "ContactPoint",
        attributes: [{ attrKey: "label", type: "VALUE_LIST", attributeValues: ["Work", "Primary", "Home", "Partnership Organization", "Personal"].map((name, id) => ({ id, name })) }],
      }),
    )
    await render(DEFAULT_LISTS, undefined, [typeKey])
    await click(button("Edit"))
    await act(async () => fireEvent.keyDown(labelTrigger(editRows()[1]), { key: "Enter" }))
    const listbox = await screen.findByRole("listbox")
    await waitFor(() => expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual(["Home", "Personal", "Work"]))
  })

  it("Add phone opens edit with one new row: focus on its number, its help, an empty Label and Type, \"New · not saved\"", async () => {
    await render()
    await click(button("Add phone"))
    const rows = editRows()
    expect(rows).toHaveLength(4)
    const row = newRow()
    expect(row).toBe(rows[3])
    expect(document.activeElement).toBe(numberInput(row))
    expect(described(numberInput(row))).toEqual(["Include the area code. Mobile numbers get a verification link by text after you save."])
    expect(within(row).getByRole("combobox", { name: /Country code/ }).textContent).toBe("🇺🇸+1")
    expect(labelTrigger(row).textContent).toBe("Choose a label")
    expect(typeTrigger(row).textContent).toBe("Choose Mobile or Landline")
    expect(within(row).getByText("New · not saved")).toBeTruthy()
    // The Type is Mobile or Landline, with nothing preselected.
    await act(async () => fireEvent.keyDown(typeTrigger(row), { key: "Enter" }))
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual(["Mobile", "Landline"])
  })

  it("the empty-state Add phone (and the header Edit with no phones) opens edit with one new row focused", async () => {
    await render({})
    await click(within(section().querySelector('[data-slot="empty-state"]') as HTMLElement).getByRole("button", { name: "Add phone" }))
    expect(editRows()).toHaveLength(1)
    expect(document.activeElement).toBe(numberInput(newRow()))
    await click(screen.getByRole("button", { name: "Cancel" }))
    await click(button("Edit"))
    expect(editRows()).toHaveLength(1)
    expect(document.activeElement).toBe(numberInput(newRow()))
  })

  it("the kebab's Edit opens edit with that row's Label focused (the Primary row: its locked number)", async () => {
    await render()
    const menu = await openKebab("+44 20 7183 8750")
    await click(within(menu).getByRole("menuitem", { name: "Edit" }))
    await waitFor(() => expect(document.activeElement).toBe(labelTrigger(editRows()[2])))
    await click(screen.getByRole("button", { name: "Cancel" }))

    const primaryMenu = await openKebab("+1 (415) 551-2125")
    await click(within(primaryMenu).getByRole("menuitem", { name: "Edit" }))
    await waitFor(() => expect(document.activeElement).toBe(editRows()[0].querySelector('[data-slot="input-locked"] input')))
  })

  it("the kebab's Remove opens edit with that row struck through and focus on its Restore", async () => {
    await render()
    const menu = await openKebab("+1 (415) 555-0111")
    await click(within(menu).getByRole("menuitem", { name: "Remove" }))
    await waitFor(() => expect(isReadView()).toBe(false))
    const work = editRows()[1]
    await waitFor(() => expect(document.activeElement).toBe(within(work).getByRole("button", { name: "Restore" })))
    expect(work.getAttribute("data-state")).toBe("removed")
    expect(within(work).getByText("Removed on save")).toBeTruthy()
    expect(described(within(work).getByRole("button", { name: "Restore" }))).toEqual(["Removed on save"])
    expect(within(section()).getByText("Unsaved changes")).toBeTruthy()
  })

  it("registers as phone, \"Phone\", display order 2, with drafts of rows", async () => {
    const { registry } = await render()
    expect(registry.get("phone")).toMatchObject({ id: "phone", label: "Phone", displayOrder: 2, draftFields: ["rows"] })
  })
})

describe("PhoneSection: save (Story 3.2)", () => {
  it("Add US: one POST with the exact DTO; both Phone keys and myself revalidated; read view, \"Phone saved.\", focus on the h2, draft cleared", async () => {
    const watched = [keys.contactPoints("Mobile"), keys.contactPoints("Landline"), keys.myself(), keys.contactPoints("Email")]
    const loads = watchAppCache(watched)
    await waitFor(() => expect(loads.size).toBe(4))
    const { bodies } = await render()
    await addPhone({ number: "4155550101", label: "Personal", type: "Mobile" })
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      {
        contactPointsToAdd: [{ value: "+14155550101", type: "Mobile", label: "Personal", isNotificationEnabled: false, phoneNumberRegion: "us" }],
        contactPointsToUpdate: [],
        contactPointsToRemove: [],
      },
    ])
    // The header and the `/account` pickers read the same keys: Mobile, Landline and myself revalidated, Email untouched.
    expect(watched.map((key) => loads.get(JSON.stringify(key)))).toEqual([2, 2, 2, 1])
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
    expect(document.activeElement).toBe(heading())
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it("a new GB Landline goes out as E.164 with its region", async () => {
    const { bodies } = await render()
    const row = await addPhone({ label: "Work", type: "Landline" })
    await pick(within(row).getByRole("combobox", { name: /Country code/ }), /United Kingdom/)
    await typeNumber(row, "20 7946 0958")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      {
        contactPointsToAdd: [{ value: "+442079460958", type: "Landline", label: "Work", isNotificationEnabled: false, phoneNumberRegion: "gb" }],
        contactPointsToUpdate: [],
        contactPointsToRemove: [],
      },
    ])
  })

  it("Relabel: Home → Work sends one update with id, type, label and notifications", async () => {
    const { bodies } = await render()
    await click(button("Edit"))
    await pick(labelTrigger(editRows()[2]), "Work")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      { contactPointsToAdd: [], contactPointsToUpdate: [{ id: 21, type: "Landline", label: "Work", isNotificationEnabled: true }], contactPointsToRemove: [] },
    ])
  })

  it("Remove + Restore + Remove: the row is struck through \"Removed on save\"; Save sends contactPointsToRemove [7]", async () => {
    const lists: Lists = { Mobile: [contactPointWire({ id: 12, value: "+14155512125", label: "Primary" }), contactPointWire({ id: 7, value: "+14155550107", label: "Work" })] }
    const { bodies } = await render(lists)
    await click(button("Edit"))
    const row = editRows()[1]
    const remove = within(row).getByRole("button", { name: "Remove" })
    act(() => remove.focus())
    await click(remove)
    expect(row.getAttribute("data-state")).toBe("removed")
    expect(within(row).getByText("Removed on save")).toBeTruthy()
    // Focus stays on the action as Remove and Restore swap.
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Restore" }))
    await click(within(row).getByRole("button", { name: "Restore" }))
    expect(row.getAttribute("data-state")).toBe("saved")
    expect(within(section()).queryByText("Unsaved changes")).toBeNull()
    await click(within(row).getByRole("button", { name: "Remove" }))
    expect(bodies).toEqual([])
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [], contactPointsToRemove: [7] }])
  })

  it("Remove on a new row deletes it outright; Save then sends nothing and closes", async () => {
    const { bodies } = await render()
    const row = await addPhone({ number: "4155550101" })
    await click(within(row).getByRole("button", { name: "Remove" }))
    expect(editRows()).toHaveLength(3)
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    await save()
    expect(isReadView()).toBe(true)
    expect(bodies).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(heading())
  })

  it("Save with no changes sends nothing, returns to read view without a toast and focuses the h2", async () => {
    const { bodies } = await render()
    await click(button("Edit"))
    await save()
    expect(isReadView()).toBe(true)
    expect(bodies).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(heading())
  })

  it("Cancel reverts only Phone (no confirm), deletes the draft and focuses the h2", async () => {
    const { bodies, registry } = await render()
    await addPhone({ number: "4155550101" })
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    expect(registry.get("phone")?.isDirty).toBe(true)
    await click(screen.getByRole("button", { name: "Cancel" }))
    expect(isReadView()).toBe(true)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(within(section()).getAllByRole("button", { name: /More actions for/ })).toHaveLength(3)
    expect(document.activeElement).toBe(heading())
    expect(registry.get("phone")?.isDirty).toBe(false)
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(bodies).toEqual([])
  })

  it("Enter in an input never saves, and Escape never cancels", async () => {
    const { bodies } = await render()
    const row = await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    await act(async () => fireEvent.keyDown(numberInput(row), { key: "Enter" }))
    await act(async () => fireEvent.keyDown(numberInput(row), { key: "Escape" }))
    expect(bodies).toEqual([])
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(within(section()).getByText("Unsaved changes")).toBeTruthy()
  })

  it("while saving, Save is busy, Cancel inert and the inputs read-only", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { bodies } = await render(DEFAULT_LISTS, async () => {
      await gate
      return new HttpResponse(null, { status: 200 })
    })
    const row = await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    await save()
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(screen.getByRole("button", { name: /Saving/ }).getAttribute("aria-busy")).toBe("true")
    expect(screen.getByRole("button", { name: "Cancel" }).getAttribute("aria-disabled")).toBe("true")
    expect(numberInput(row).readOnly).toBe(true)
    expect(labelTrigger(row).getAttribute("aria-readonly")).toBe("true")
    // Remove does nothing while saving.
    await click(within(row).getByRole("button", { name: "Remove" }))
    expect(editRows()).toHaveLength(4)
    await act(async () => release())
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(1)
  })

  it("Save all reaches Phone: the registered save resolves without throwing", async () => {
    const { bodies, registry } = await render(DEFAULT_LISTS, () => HttpResponse.error())
    await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    let outcome: Awaited<ReturnType<typeof runSaveAll>> | undefined
    await act(async () => {
      outcome = await runSaveAll(registry)
    })
    expect(outcome).toMatchObject({ kind: "done", failed: [{ id: "phone" }] })
    expect(bodies).toHaveLength(1)
  })
})

describe("PhoneSection: validation (Story 3.2)", () => {
  it("a short US number reads \"Enter a 10-digit US number\" on blur; Save sends nothing and focuses it", async () => {
    const { bodies } = await render()
    const row = await addPhone({ number: "41555", label: "Work", type: "Mobile" })
    await blur(numberInput(row))
    await waitFor(() => expect(described(numberInput(row))).toContain("Enter a 10-digit US number"))
    expect(numberInput(row).getAttribute("aria-invalid")).toBe("true")
    await save()
    expect(bodies).toEqual([])
    expect(document.activeElement).toBe(numberInput(row))
  })

  it("an invalid non-US number reads \"Enter a valid phone number\"", async () => {
    await render()
    const row = await addPhone({ label: "Work", type: "Landline" })
    await pick(within(row).getByRole("combobox", { name: /Country code/ }), /United Kingdom/)
    await typeNumber(row, "123")
    await blur(numberInput(row))
    await waitFor(() => expect(described(numberInput(row))).toContain("Enter a valid phone number"))
  })

  it("a number already on a struck-through row reads \"This number is already on your profile\"", async () => {
    const { bodies } = await render()
    await click(button("Edit"))
    await click(within(editRows()[1]).getByRole("button", { name: "Remove" }))
    const row = await addPhone({ number: "(415) 555-0111", label: "Work", type: "Mobile" })
    await save()
    expect(bodies).toEqual([])
    await waitFor(() => expect(described(numberInput(row))).toContain("This number is already on your profile"))
    expect(document.activeElement).toBe(numberInput(row))
  })

  it("an empty Label and Type read \"Choose a label\" and \"Choose Mobile or Landline\"; focus goes to the first invalid field", async () => {
    const { bodies } = await render()
    const row = await addPhone({ number: "4155550101" })
    await save()
    expect(bodies).toEqual([])
    expect(described(labelTrigger(row))).toContain("Choose a label")
    expect(described(typeTrigger(row))).toContain("Choose Mobile or Landline")
    expect(document.activeElement).toBe(labelTrigger(row))
    const empty = await addPhone()
    await save()
    // The first invalid field in page order: the first new row's Label.
    expect(document.activeElement).toBe(labelTrigger(row))
    expect(described(numberInput(empty))).toContain("Enter a 10-digit US number")
  })
})

describe("PhoneSection: Remove rules (Story 3.2)", () => {
  it("the last phone: Remove is aria-disabled with \"You need at least one phone\" in the kebab and in edit view", async () => {
    await render({ Mobile: [contactPointWire({ id: 5, value: "+14155550105", label: "Work" })] })
    const menu = await openKebab("+1 (415) 555-0105")
    const item = within(menu).getByRole("menuitem", { name: /Remove/ })
    expect(item.getAttribute("aria-disabled")).toBe("true")
    expect(item.textContent).toBe("RemoveYou need at least one phone")
    await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
    await click(button("Edit"))
    const remove = within(editRows()[0]).getByRole("button", { name: "Remove" })
    expect(remove.getAttribute("aria-disabled")).toBe("true")
    expect(described(remove)).toContain("You need at least one phone")
    await click(remove)
    expect(editRows()[0].getAttribute("data-state")).toBe("saved")
  })

  it("striking all but one leaves the last one's Remove disabled; a new row counts", async () => {
    await render({ Mobile: [contactPointWire({ id: 5, value: "+14155550105", label: "Work" }), contactPointWire({ id: 6, value: "+14155550106", label: "Home" })] })
    await click(button("Edit"))
    await click(within(editRows()[0]).getByRole("button", { name: "Remove" }))
    expect(within(editRows()[1]).getByRole("button", { name: "Remove" }).getAttribute("aria-disabled")).toBe("true")
    await addPhone()
    expect(within(editRows()[1]).getByRole("button", { name: "Remove" }).getAttribute("aria-disabled")).toBeNull()
  })

  it("the Primary row: Remove is aria-disabled with \"Make another phone primary first\"", async () => {
    await render()
    const menu = await openKebab("+1 (415) 551-2125")
    expect(within(menu).getByRole("menuitem", { name: /Remove/ }).textContent).toBe("RemoveMake another phone primary first")
    await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
    await click(button("Edit"))
    const remove = within(editRows()[0]).getByRole("button", { name: "Remove" })
    expect(remove.getAttribute("aria-disabled")).toBe("true")
    expect(described(remove)).toContain("Make another phone primary first")
  })
})

describe("PhoneSection: the 20-per-type limit (Story 3.2)", () => {
  it("both types full: the header Add phone and the footer's Add row are aria-disabled with the limit; the header Edit stays usable", async () => {
    await render({ Mobile: many("Mobile", 20, 100), Landline: many("Landline", 20, 200) })
    const add = button("Add phone")
    expect(add.getAttribute("aria-disabled")).toBe("true")
    expect(described(add)).toContain("You've reached the limit of 20 phones")
    await click(add)
    expect(isReadView()).toBe(true)
    const edit = button("Edit")
    expect(edit.getAttribute("aria-disabled")).toBeNull()
    await click(edit)
    expect(isReadView()).toBe(false)
    const footerAdd = within(section().querySelector('[data-slot="section-footer"]') as HTMLElement).getByRole("button", { name: "Add row" })
    expect(footerAdd.getAttribute("aria-disabled")).toBe("true")
    expect(described(footerAdd)).toContain("You've reached the limit of 20 phones")
    await click(footerAdd)
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    // Striking one through frees its type again.
    await click(within(editRows()[0]).getByRole("button", { name: "Remove" }))
    const free = within(section().querySelector('[data-slot="section-footer"]') as HTMLElement).getByRole("button", { name: "Add row" })
    expect(free.getAttribute("aria-disabled")).toBeNull()
  })

  it("Mobile full: a new row's Mobile option is disabled; Landline stays open", async () => {
    await render({ Mobile: many("Mobile", 20, 100) })
    const row = await addPhone()
    await act(async () => fireEvent.keyDown(typeTrigger(row), { key: "Enter" }))
    const mobile = await screen.findByRole("option", { name: "Mobile" })
    expect(mobile.getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByRole("option", { name: "Landline" }).getAttribute("aria-disabled")).toBeNull()
  })
})

describe("PhoneSection: save failures (Story 3.2)", () => {
  const upstream = (message: string, status = 400) => () => HttpResponse.json({ message, code: status }, { status })
  const banner = (): HTMLElement | null => section().querySelector('[data-slot~="inline-banner"]')

  it("a duplicate 400 with one new row shows \"This number is already on your profile\" at that row's number; stays in edit", async () => {
    const { bodies } = await render(DEFAULT_LISTS, upstream("Operation failed. Person with id '42' already has contact point with value '+14155550101'."))
    const row = await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    await save()
    await waitFor(() => expect(described(numberInput(row))).toContain("This number is already on your profile"))
    expect(bodies).toHaveLength(1)
    expect(document.activeElement).toBe(numberInput(row))
    expect(banner()).toBeNull()
    expect(numberInput(row).value).toBe("(415) 555-0101")
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
  })

  it("a limit 400 with two new rows shows \"You've reached the limit of 20 phones\" at Section level with Retry", async () => {
    await render(DEFAULT_LISTS, upstream("Operation failed. Person can have maximum of 20 contact points per type."))
    await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    await addPhone({ number: "4155550102", label: "Home", type: "Mobile" })
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("You've reached the limit of 20 phones"))
    expect(within(banner() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
  })

  it("a limit 400 with one new row shows the message at its Type", async () => {
    await render(DEFAULT_LISTS, upstream("Operation failed. Person can have maximum of 20 contact points per type."))
    const row = await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    await save()
    await waitFor(() => expect(described(typeTrigger(row))).toContain("You've reached the limit of 20 phones"))
  })

  it("a Primary rule 400 shows \"Make another phone primary first\" at Section level", async () => {
    await render(DEFAULT_LISTS, upstream("Operation failed. In order to delete a primary contact of type 'Landline', please create or update another one as primary."))
    await click(button("Edit"))
    await click(within(editRows()[2]).getByRole("button", { name: "Remove" }))
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Make another phone primary first"))
  })

  it("an unknown 400 shows \"Couldn't save phone.\" with Retry; stays in edit", async () => {
    await render(DEFAULT_LISTS, upstream("Something else."))
    await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save phone."))
    expect(screen.queryByText("Something else.")).toBeNull()
    expect(within(banner() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("a network failure shows \"Couldn't save phone. Check your connection.\"; Retry resends the same diff", async () => {
    let fail = true
    const { bodies } = await render(DEFAULT_LISTS, () => (fail ? HttpResponse.error() : new HttpResponse(null, { status: 200 })))
    await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save phone. Check your connection."))
    expect(toastError).toHaveBeenCalledWith("Couldn't save phone. Check your connection.", expect.anything())
    fail = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual(bodies[0])
  })
})

describe("PhoneSection: drafts (Story 3.2)", () => {
  it("a new row is drafted as rows; after the session ends, a restore shows it again", async () => {
    const first = await render()
    await addPhone({ number: "4155550101", label: "Personal", type: "Mobile" })
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}") as { values: Record<string, unknown> }
    expect(Object.keys(stored.values)).toEqual(["rows"])
    expect((stored.values.rows as unknown[]).length).toBe(4)
    first.unmount()
    sessionEvents.reset()

    const { bodies } = await render()
    await click(await within(section()).findByRole("button", { name: "Restore" }))
    await waitFor(() => expect(section().querySelector('[data-state="new"]')).not.toBeNull())
    const row = newRow()
    expect(numberInput(row).value).toBe("(415) 555-0101")
    expect(labelTrigger(row).textContent).toBe("Personal")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      {
        contactPointsToAdd: [{ value: "+14155550101", type: "Mobile", label: "Personal", isNotificationEnabled: false, phoneNumberRegion: "us" }],
        contactPointsToUpdate: [],
        contactPointsToRemove: [],
      },
    ])
  })
})

describe("PhoneSection: edit view below 768 px (Story 3.2)", () => {
  it("each card stacks its labelled inputs full width in place, every control 44 px", async () => {
    stubViewport(360)
    await render()
    await click(button("Edit"))
    await addPhone()
    expect(within(section()).queryByRole("table")).toBeNull()
    const card = newRow()
    expect(card.tagName).toBe("LI")
    expect([...card.querySelectorAll("[data-column]")].map((block) => block.getAttribute("data-column"))).toEqual(["number", "label", "type", "status", "notifications"])
    expect(numberInput(card).className).toContain("h-11")
    for (const trigger of [labelTrigger(card), typeTrigger(card)]) {
      expect(trigger.getAttribute("data-size")).toBe("default")
      expect(trigger.className).toContain("w-full")
    }
    expect(within(card).getByRole("button", { name: "Remove" }).className).toContain("h-11")
  })
})

describe("PhoneSection: edit view accessibility (Story 3.2)", () => {
  it.each([
    ["light", 360],
    ["dark", 360],
    ["light", 1024],
    ["dark", 1024],
  ] as const)("has no axe violations in %s mode at %i px, with a new row, a struck row and field errors", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await render()
    await click(button("Edit"))
    await click(within(editRows()[1]).getByRole("button", { name: "Remove" }))
    await addPhone({ number: "415" })
    await save()
    await waitFor(() => expect(numberInput(newRow()).getAttribute("aria-invalid")).toBe("true"))
    expect(await axeViolations()).toEqual([])
  })

  it("has no axe violations in read view with the kebabs and the disabled limit actions", async () => {
    await render({ Mobile: many("Mobile", 20, 100), Landline: many("Landline", 20, 200) })
    expect(await axeViolations()).toEqual([])
  })
})

describe("PhoneSection: review fixes (Story 3.2)", () => {
  it("a refetch that fails after a successful POST still reads saved: read view, toast, and nothing is sent again", async () => {
    globalMutate.fail = true
    const { bodies } = await render()
    await addPhone({ number: "4155550101", label: "Personal", type: "Mobile" })
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(1)
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
    expect(section().querySelector('[data-slot~="inline-banner"]')).toBeNull()
  })

  it("Edit after a save: the refetched phone is a saved, locked row (no \"New · not saved\"); a relabel then sends no add", async () => {
    const lists: Lists = { Mobile: [...MOBILE], Landline: LANDLINE }
    const { bodies, refetch } = await render(lists)
    await addPhone({ number: "4155550101", label: "Personal", type: "Mobile" })
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    lists.Mobile = [...MOBILE, contactPointWire({ id: 13, value: "+14155550101", label: "Personal", isVerified: false, isNotificationEnabled: false })]
    await refetch()
    await waitFor(() => expect(within(section()).getAllByRole("button", { name: /More actions for/ })).toHaveLength(4))
    await click(button("Edit"))
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    const added = editRows().find((row) => row.querySelector('input[value="+1 (415) 555-0101"]')) as HTMLElement
    expect(added.getAttribute("data-state")).toBe("saved")
    expect(added.querySelector('[data-slot="phone-input"]')).toBeNull()
    await pick(labelTrigger(added), "Work")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies[1]).toEqual({ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 13, type: "Mobile", label: "Work", isNotificationEnabled: false }], contactPointsToRemove: [] })
  })

  it("a saved phone the form doesn't hold (a draft from before it existed) is kept: never removed or updated", async () => {
    const first = await render()
    await addPhone({ number: "4155550101", label: "Personal", type: "Mobile" })
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    first.unmount()
    sessionEvents.reset()

    const extra = contactPointWire({ id: 30, value: "+14155550130", label: "Work", isNotificationEnabled: false })
    const { bodies } = await render({ Mobile: [...MOBILE, extra], Landline: LANDLINE })
    const restore = await within(section()).findByRole("button", { name: /^(Restore|Keep mine)$/ })
    await click(restore)
    const keepMine = within(section()).queryByRole("button", { name: "Keep mine" })
    if (keepMine) await click(keepMine)
    await waitFor(() => expect(section().querySelector('[data-state="new"]')).not.toBeNull())
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      {
        contactPointsToAdd: [{ value: "+14155550101", type: "Mobile", label: "Personal", isNotificationEnabled: false, phoneNumberRegion: "us" }],
        contactPointsToUpdate: [],
        contactPointsToRemove: [],
      },
    ])
  })

  it("rows without an id: the kebab holds only Edit, edit view has no Remove or Label, kebab Edit focuses the locked number; they never count as the phone left", async () => {
    await render({ Mobile: [contactPointWire({ id: 5, value: "+14155550105", label: "Work" }), contactPointWire({ id: null, value: "+14155550199", label: "Home" })] })
    const idLess = await openKebab("+1 (415) 555-0199")
    expect(within(idLess).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit"])
    await closeMenu(idLess)
    // The only phone with an id is the last one that can be removed.
    const menu = await openKebab("+1 (415) 555-0105")
    expect(within(menu).getByRole("menuitem", { name: /Remove/ }).textContent).toBe("RemoveYou need at least one phone")
    await closeMenu(menu)

    const again = await openKebab("+1 (415) 555-0199")
    await click(within(again).getByRole("menuitem", { name: "Edit" }))
    await waitFor(() => expect(isReadView()).toBe(false))
    const [withId, withoutId] = editRows()
    await waitFor(() => expect(document.activeElement).toBe(withoutId.querySelector('[data-slot="input-locked"] input')))
    expect(within(withoutId).queryByRole("button", { name: /Remove|Restore/ })).toBeNull()
    expect(within(withoutId).queryByRole("combobox", { name: "Label" })).toBeNull()
    expect(within(withoutId).getByText("Home")).toBeTruthy()
    const remove = within(withId).getByRole("button", { name: "Remove" })
    expect(remove.getAttribute("aria-disabled")).toBe("true")
    expect(described(remove)).toContain("You need at least one phone")
  })

  it("a kebab item whose row a revalidation dropped meanwhile does nothing", async () => {
    const { setList } = await render()
    const menu = await openKebab("+1 (415) 555-0111")
    const item = within(menu).getByRole("menuitem", { name: "Edit" })
    await act(async () => {
      fireEvent.click(item)
      await setList("Mobile", [MOBILE[1]])
    })
    await waitFor(() => expect(within(section()).getAllByRole("button", { name: /More actions for/ })).toHaveLength(2))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(isReadView()).toBe(true)
    const removeMenu = await openKebab("+44 20 7183 8750")
    const remove = within(removeMenu).getByRole("menuitem", { name: "Remove" })
    await act(async () => {
      fireEvent.click(remove)
      await setList("Landline", [])
    })
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(isReadView()).toBe(true)
  })

  it("a reordered refetch keeps each saved row's key: its edit, Status and Notifications stay with it", async () => {
    const { bodies, setList } = await render()
    await click(button("Edit"))
    await pick(labelTrigger(editRows()[1]), "Personal")
    // The Mobile list comes back in another order (Primary still first on screen, then the API order).
    await setList("Mobile", [MOBILE[1], contactPointWire({ id: 14, value: "+14155550114", label: "Main" }), MOBILE[0]])
    const work = editRows().find((row) => row.querySelector('input[value="+1 (415) 555-0111"]')) as HTMLElement
    expect(labelTrigger(work).textContent).toBe("Personal")
    expect(within(work).getByText("Not verified")).toBeTruthy()
    expect(within(work).getByText("Not applicable")).toBeTruthy()
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 11, type: "Mobile", label: "Personal", isNotificationEnabled: false }], contactPointsToRemove: [] }])
  })

  it("an id repeated across the two lists: shown twice, the repeat locked; a save sends that id once", async () => {
    const { bodies } = await render({
      Mobile: [contactPointWire({ id: 7, value: "+14155550107", label: "Work", isNotificationEnabled: false })],
      Landline: [contactPointWire({ id: 7, value: "+14155550108", type: "Landline", label: "Home", isNotificationEnabled: false })],
    })
    await click(button("Edit"))
    const [first, repeat] = editRows()
    expect(within(repeat).queryByRole("combobox", { name: "Label" })).toBeNull()
    expect(within(repeat).queryByRole("button", { name: /Remove|Restore/ })).toBeNull()
    await pick(labelTrigger(first), "Personal")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 7, type: "Mobile", label: "Personal", isNotificationEnabled: false }], contactPointsToRemove: [] }])
  })

  it("a saved label the list doesn't offer shows on its trigger and an untouched save sends no update for it", async () => {
    const { bodies } = await render({ Mobile: [MOBILE[1], contactPointWire({ id: 40, value: "+14155550140", label: "Partnership Organization", isNotificationEnabled: false })] })
    await click(button("Edit"))
    expect(labelTrigger(editRows()[1]).textContent).toBe("Partnership Organization")
    await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      {
        contactPointsToAdd: [{ value: "+14155550101", type: "Mobile", label: "Work", isNotificationEnabled: false, phoneNumberRegion: "us" }],
        contactPointsToUpdate: [],
        contactPointsToRemove: [],
      },
    ])
  })
})

/** Another registered Section on the page (one text field), to prove Phone leaves it alone. */
function OtherSection() {
  const section = useSectionForm<{ note: string }>({
    id: "email",
    label: "Other",
    displayOrder: 3,
    schema: z.object({ note: z.string() }),
    baseline: { note: "" },
    save: async () => ({ ok: true }),
  })
  return (
    <div data-testid="other">
      <button type="button" onClick={() => section.startEdit()}>
        Edit other
      </button>
      {section.isEditing ? (
        <>
          <Input aria-label="Other note" {...section.field("note")} />
          <SectionFooter {...section.footerProps} />
        </>
      ) : null}
    </div>
  )
}

describe("PhoneSection: other Sections (Story 3.2)", () => {
  it("Phone's Cancel leaves another dirty Section dirty, and that Section stays editable while a Phone save is held", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { registry } = await render(
      DEFAULT_LISTS,
      async () => {
        await gate
        return new HttpResponse(null, { status: 200 })
      },
      [],
      <OtherSection />,
    )
    const other = screen.getByTestId("other")
    await click(within(other).getByRole("button", { name: "Edit other" }))
    await act(async () => fireEvent.change(within(other).getByLabelText("Other note"), { target: { value: "draft" } }))
    expect(registry.get("email")?.isDirty).toBe(true)

    await addPhone({ number: "4155550101" })
    await click(within(section()).getByRole("button", { name: "Cancel" }))
    expect(isReadView()).toBe(true)
    expect(registry.get("email")?.isDirty).toBe(true)
    expect((within(other).getByLabelText("Other note") as HTMLInputElement).value).toBe("draft")

    await addPhone({ number: "4155550101", label: "Work", type: "Mobile" })
    await save()
    expect(within(section()).getByRole("button", { name: /Saving/ })).toBeTruthy()
    const note = within(other).getByLabelText("Other note") as HTMLInputElement
    expect(note.readOnly).toBe(false)
    await act(async () => fireEvent.change(note, { target: { value: "still typing" } }))
    expect(note.value).toBe("still typing")
    await act(async () => release())
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(registry.get("email")?.isDirty).toBe(true)
  })
})
