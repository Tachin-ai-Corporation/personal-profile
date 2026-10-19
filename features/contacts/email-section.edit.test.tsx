import { act, render as renderPlain, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type HttpHandler } from "msw"
import { createElement, useEffect } from "react"
import useSWR, { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runSaveAll, toastError, toastSuccess } from "@/features/shell"
import { fetchMyself, keys, sessionEvents, type SwrKey } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { contactPointWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { EmailSection } from "."

// The Section's own toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// Full edit flows (Selects, a save, a refetch) take up to ~1 s here and several times that on a loaded CI
// runner; a timed-out test leaves its `act` scope open and breaks every later render in the file.
vi.setConfig({ testTimeout: 20_000 })
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
 * Story 3.5 (NG-9024): the Email edit view and its save on `/`, rendered the
 * way `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers every
 * edit row of the I/O matrix in `spec-3-5-view-add-relabel-and-remove-emails.md`.
 */

const LIST = "/api/1h/v2/user/contact-point/list"
const MANAGE = "/api/1h/v2/health/contact-point"
const CONTACT_TYPE = "/api/1h/v2/type/key/ContactPoint"
const DRAFT_KEY = "pp:draft:v1:demo:42:email"

type Wire = Record<string, unknown>
type List = Wire[] | (() => Response)

const email = (overrides: Wire): Wire => contactPointWire({ type: "Email", phoneNumberRegion: null, isNotificationEnabled: false, ...overrides })

/** Email [Work 41 (unverified), Primary 42 (notifications on), Home 43]: shown 42, 41, 43. */
const EMAILS: Wire[] = [
  email({ id: 41, value: "ann@work.example", label: "Work", isVerified: false }),
  email({ id: 42, value: "ann@example.com", label: "Primary", isVerified: true, isNotificationEnabled: true }),
  email({ id: 43, value: "ann@home.example", label: "Home", isVerified: false }),
]

/** `count` saved emails (ids from `start`), none Primary. */
const many = (count: number, start: number): Wire[] =>
  Array.from({ length: count }, (_, index) => email({ id: start + index, value: `user${start + index}@example.com`, label: "Work" }))

/** Answers the Email list (`[]` for any other type), and records each list read and each manage body. */
function emailServer(list: List, answer: () => Response | Promise<Response> = () => new HttpResponse(null, { status: 200 })) {
  const bodies: unknown[] = []
  const reads: string[] = []
  const handlers: HttpHandler[] = [
    http.get(LIST, ({ request }) => {
      const type = new URL(request.url).searchParams.get("type") ?? ""
      reads.push(type)
      if (type !== "Email") return HttpResponse.json([])
      return typeof list === "function" ? list() : HttpResponse.json(list)
    }),
    http.post(MANAGE, async ({ request }) => {
      bodies.push(await request.json())
      return answer()
    }),
  ]
  return { bodies, reads, handlers }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Email" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const heading = (): HTMLElement => screen.getByRole("heading", { level: 2, name: "Email" })
const button = (name: string | RegExp): HTMLElement => within(section()).getByRole("button", { name })
const footer = (): HTMLElement => section().querySelector('[data-slot="section-footer"]') as HTMLElement
const isReadView = (): boolean => section().querySelector('[data-slot="section-footer"]') === null && within(section()).queryByRole("button", { name: "Edit" }) !== null
const banner = (): HTMLElement | null => section().querySelector('[data-slot~="inline-banner"]')
/** The body rows of the edit table (desktop) or its cards (mobile). */
const editRows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>("tbody tr, li[data-slot='section-table-card']")]
const newRow = (): HTMLElement => {
  const rows = section().querySelectorAll<HTMLElement>('[data-state="new"]')
  return rows[rows.length - 1]
}
const addressInput = (row: HTMLElement): HTMLInputElement => within(row).getByRole("textbox", { name: "Email address" }) as HTMLInputElement
const lockedInput = (row: HTMLElement): HTMLInputElement => row.querySelector('[data-slot="input-locked"] input') as HTMLInputElement
const labelTrigger = (row: HTMLElement): HTMLElement => within(row).getByRole("combobox", { name: "Label" })
/** The ids an element's `aria-describedby` names, as their text. */
const described = (element: HTMLElement): (string | undefined)[] =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? undefined)

/** Loads each key with a counting loader from the app's default SWR cache (the one `mutateMyself` revalidates). */
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

async function render(list: List = EMAILS, answer?: () => Response | Promise<Response>, extra: HttpHandler[] = []) {
  const server = emailServer(list, answer)
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
      <EmailSection />
      <CacheProbe />
    </>,
    { page: "profile", handlers: [...server.handlers, ...extra] },
  )
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  // D-A: a write goes out only once the page user is pinned (the page's own `myself` read does it).
  await act(async () => {
    await fetchMyself()
  })
  /** Puts `rows` in the Section's cache for Email without a request. */
  const setList = (rows: Wire[]) =>
    act(async () => {
      await scoped?.(keys.contactPoints("Email"), rows.map((row) => ({ ...row })), { revalidate: false })
    })
  return { ...result, bodies: server.bodies, reads: server.reads, setList }
}

async function click(element: HTMLElement) {
  await act(async () => fireEvent.click(element))
}

async function typeAddress(row: HTMLElement, value: string) {
  await act(async () => fireEvent.change(addressInput(row), { target: { value } }))
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
  await waitFor(() => expect(document.activeElement).toBe(trigger))
}

async function openKebab(value: string): Promise<HTMLElement> {
  await act(async () => fireEvent.keyDown(button(`More actions for ${value}`), { key: "Enter" }))
  return screen.findByRole("menu")
}

/** Escape closes the menu; then its kebab gets focus back (a later timer) before another menu may open. */
async function closeMenu(menu: HTMLElement) {
  await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
}

/** Adds a new row (header "Add email" in read view, the footer's Add row while editing) and fills it. */
async function addEmail(fill?: { readonly value?: string; readonly label?: string }) {
  await click(isReadView() ? button("Add email") : within(footer()).getByRole("button", { name: "Add row" }))
  const row = newRow()
  if (fill?.value !== undefined) await typeAddress(row, fill.value)
  if (fill?.label) await pick(labelTrigger(row), fill.label)
  return row
}

async function save() {
  await click(within(section()).getByRole("button", { name: "Save" }))
}

const upstream = (message: string, status = 400) => () => HttpResponse.json({ message, code: status }, { status })

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

describe("EmailSection: read-view entry points", () => {
  it("the header has an outline Edit and Add email (44 px); an unverified row's kebab holds Verify, Make primary, Edit and Remove", async () => {
    await render()
    for (const name of ["Edit", "Add email"]) {
      const action = button(name)
      expect(action.className).toContain("h-11")
      expect(action.getAttribute("data-variant") ?? action.className).toMatch(/outline/)
      expect(action.getAttribute("aria-disabled")).toBeNull()
    }
    // Story 3.6 adds Verify and Make primary (aria-disabled with its reason) before Edit.
    const menu = await openKebab("ann@work.example")
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Verify", "Make primaryVerify this email first", "Edit", "Remove"])
  })

  it("Edit switches the whole table in place: Editing, focus on the first editable Label; addresses locked with their help; the Primary label locked", async () => {
    await render()
    await click(button("Edit"))
    expect(within(section()).getByText("Editing")).toBeTruthy()
    expect(section().querySelector('[data-slot="section-container"]')?.getAttribute("data-editing")).toBe("true")
    const [primary, work, home] = editRows()
    expect(document.activeElement).toBe(labelTrigger(work))
    expect([primary, work, home].map((row) => [lockedInput(row).value, lockedInput(row).readOnly, lockedInput(row).getAttribute("aria-readonly")])).toEqual([
      ["ann@example.com", true, "true"],
      ["ann@work.example", true, "true"],
      ["ann@home.example", true, "true"],
    ])
    expect(described(lockedInput(primary))).toEqual(["Locked. This is the address you sign in with."])
    expect(described(lockedInput(work))).toEqual(["Saved addresses can't be changed. Remove it and add a new one."])
    expect(described(lockedInput(home))).toEqual(["Saved addresses can't be changed. Remove it and add a new one."])
    // The Primary row's label is the locked chip; Status shows as read and Notifications as its switch (Story 3.6).
    expect(within(primary).queryByRole("combobox", { name: "Label" })).toBeNull()
    expect(within(primary).getByText("Primary").getAttribute("data-variant")).toBe("primary")
    expect(within(primary).getByText("Verified")).toBeTruthy()
    expect(within(primary).getByRole("switch", { name: "Notifications for ann@example.com" }).getAttribute("aria-checked")).toBe("true")
    expect(within(work).getByText("Not verified")).toBeTruthy()
    expect(within(work).getByText("Not applicable")).toBeTruthy()
    expect(labelTrigger(work).textContent).toBe("Work")
    expect(within(footer()).getAllByRole("button").map((action) => action.textContent)).toEqual(["Add row", "Cancel", "Save"])
    expect(within(section()).queryByText("Unsaved changes")).toBeNull()
  })

  it("the Label list is the type key's labels in display order, without Primary", async () => {
    const typeKey = http.get(CONTACT_TYPE, () =>
      HttpResponse.json({
        boKey: "ContactPoint",
        attributes: [{ attrKey: "label", type: "VALUE_LIST", attributeValues: ["Work", "Primary", "Main", "Partnership Organization", "Personal"].map((name, id) => ({ id, name })) }],
      }),
    )
    await render(EMAILS, undefined, [typeKey])
    await click(button("Edit"))
    await act(async () => fireEvent.keyDown(labelTrigger(editRows()[1]), { key: "Enter" }))
    const listbox = await screen.findByRole("listbox")
    await waitFor(() => expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual(["Main", "Personal", "Work"]))
  })

  it("Add email opens edit with one new row: focus on its email input, an empty Label, \"New · not saved\"", async () => {
    await render()
    await click(button("Add email"))
    expect(editRows()).toHaveLength(4)
    const row = newRow()
    const input = addressInput(row)
    expect(document.activeElement).toBe(input)
    expect([input.type, input.getAttribute("autocomplete"), input.getAttribute("spellcheck"), input.getAttribute("autocapitalize"), input.getAttribute("aria-required")]).toEqual([
      "email",
      "off",
      "false",
      "none",
      "true",
    ])
    expect(labelTrigger(row).textContent).toBe("Choose a label")
    expect(within(row).getByText("New · not saved")).toBeTruthy()
    expect(within(row).getByText("Not applicable")).toBeTruthy()
  })

  it("the empty-state Add email (and the header Edit with no emails) opens edit with one new row focused", async () => {
    await render([])
    await click(within(section().querySelector('[data-slot="empty-state"]') as HTMLElement).getByRole("button", { name: "Add email" }))
    expect(editRows()).toHaveLength(1)
    expect(document.activeElement).toBe(addressInput(newRow()))
    await click(screen.getByRole("button", { name: "Cancel" }))
    await click(button("Edit"))
    expect(editRows()).toHaveLength(1)
    expect(document.activeElement).toBe(addressInput(newRow()))
    // With no saved emails the only new row can still be removed.
    const remove = within(newRow()).getByRole("button", { name: "Remove" })
    expect(remove.getAttribute("aria-disabled")).toBeNull()
    await click(remove)
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    expect(section().querySelector('[data-slot="empty-state"]')?.textContent).toBe("No emails yet·Add email")
  })

  it("the kebab's Edit focuses that row's Label (the Primary row: its locked address)", async () => {
    await render()
    const menu = await openKebab("ann@home.example")
    await click(within(menu).getByRole("menuitem", { name: "Edit" }))
    await waitFor(() => expect(document.activeElement).toBe(labelTrigger(editRows()[2])))
    await click(screen.getByRole("button", { name: "Cancel" }))

    const primaryMenu = await openKebab("ann@example.com")
    await click(within(primaryMenu).getByRole("menuitem", { name: "Edit" }))
    await waitFor(() => expect(document.activeElement).toBe(lockedInput(editRows()[0])))
  })

  it("the kebab's Remove opens edit with that row struck through and focus on its Restore", async () => {
    await render()
    const menu = await openKebab("ann@work.example")
    await click(within(menu).getByRole("menuitem", { name: "Remove" }))
    await waitFor(() => expect(isReadView()).toBe(false))
    const work = editRows()[1]
    await waitFor(() => expect(document.activeElement).toBe(within(work).getByRole("button", { name: "Restore" })))
    expect(work.getAttribute("data-state")).toBe("removed")
    expect(described(within(work).getByRole("button", { name: "Restore" }))).toEqual(["Removed on save"])
    expect(within(section()).getByText("Unsaved changes")).toBeTruthy()
  })

  it("registers as email, \"Email\", display order 3, with drafts of rows", async () => {
    const { registry } = await render()
    expect(registry.get("email")).toMatchObject({ id: "email", label: "Email", displayOrder: 3, draftFields: ["rows"] })
  })
})

describe("EmailSection: save", () => {
  it("Add: one POST with the trimmed address; the Email key and myself revalidated; read view, \"Email saved.\", focus on the h2, draft cleared", async () => {
    const watched = [keys.myself(), keys.contactPoints("Mobile")]
    const loads = watchAppCache(watched)
    await waitFor(() => expect(loads.size).toBe(2))
    const { bodies, reads } = await render([EMAILS[1], EMAILS[2]])
    await addEmail({ value: " Ann@Work.example ", label: "Personal" })
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    const readsBefore = reads.length
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      {
        contactPointsToAdd: [{ value: "Ann@Work.example", type: "Email", label: "Personal", isNotificationEnabled: false }],
        contactPointsToUpdate: [],
        contactPointsToRemove: [],
      },
    ])
    // The Email key through the Section's hook (in the app the root cache the header and `/account` read), myself through the app helper.
    expect(reads.slice(readsBefore)).toEqual(["Email"])
    expect(watched.map((key) => loads.get(JSON.stringify(key)))).toEqual([2, 1])
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
    expect(document.activeElement).toBe(heading())
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it("Relabel and remove: Work → Main and Home struck through go in one POST", async () => {
    const { bodies } = await render()
    await click(button("Edit"))
    const [, work, home] = editRows()
    await pick(labelTrigger(work), "Main")
    await click(within(home).getByRole("button", { name: "Remove" }))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      { contactPointsToAdd: [], contactPointsToUpdate: [{ id: 41, type: "Email", label: "Main", isNotificationEnabled: false }], contactPointsToRemove: [43] },
    ])
  })

  it("Remove + Restore on a saved row: struck through, then back; focus stays on the action", async () => {
    const { bodies } = await render()
    await click(button("Edit"))
    const row = editRows()[1]
    const remove = within(row).getByRole("button", { name: "Remove" })
    act(() => remove.focus())
    await click(remove)
    expect(row.getAttribute("data-state")).toBe("removed")
    expect(within(row).getByText("Removed on save")).toBeTruthy()
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Restore" }))
    await click(within(row).getByRole("button", { name: "Restore" }))
    expect(row.getAttribute("data-state")).toBe("saved")
    expect(within(section()).queryByText("Unsaved changes")).toBeNull()
    expect(bodies).toEqual([])
  })

  it("Remove on a new row deletes it outright; Save then sends nothing and closes", async () => {
    const { bodies } = await render()
    const row = await addEmail({ value: "new@example.com" })
    await click(within(row).getByRole("button", { name: "Remove" }))
    expect(editRows()).toHaveLength(3)
    await save()
    expect(isReadView()).toBe(true)
    expect(bodies).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(heading())
  })

  it("Cancel reverts only Email (no confirm), deletes the draft and focuses the h2", async () => {
    const { bodies, registry } = await render()
    await addEmail({ value: "new@example.com" })
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    expect(registry.get("email")?.isDirty).toBe(true)
    await click(screen.getByRole("button", { name: "Cancel" }))
    expect(isReadView()).toBe(true)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(heading())
    expect(registry.get("email")?.isDirty).toBe(false)
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(bodies).toEqual([])
  })

  it("Enter in the input never saves, and Escape never cancels", async () => {
    const { bodies } = await render()
    const row = await addEmail({ value: "new@example.com", label: "Work" })
    await act(async () => fireEvent.keyDown(addressInput(row), { key: "Enter" }))
    await act(async () => fireEvent.keyDown(addressInput(row), { key: "Escape" }))
    expect(bodies).toEqual([])
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(within(section()).getByText("Unsaved changes")).toBeTruthy()
  })

  it("while saving, Save is busy, Cancel inert, the input and Label read-only and Remove a no-op", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { bodies } = await render(EMAILS, async () => {
      await gate
      return new HttpResponse(null, { status: 200 })
    })
    const row = await addEmail({ value: "new@example.com", label: "Work" })
    await save()
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(screen.getByRole("button", { name: /Saving/ }).getAttribute("aria-busy")).toBe("true")
    expect(screen.getByRole("button", { name: "Cancel" }).getAttribute("aria-disabled")).toBe("true")
    expect(addressInput(row).readOnly).toBe(true)
    expect(labelTrigger(row).getAttribute("aria-readonly")).toBe("true")
    await click(within(row).getByRole("button", { name: "Remove" }))
    expect(editRows()).toHaveLength(4)
    await act(async () => release())
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(1)
  })

  it("Save all reaches Email: the registered save resolves without throwing", async () => {
    const { bodies, registry } = await render(EMAILS, () => HttpResponse.error())
    await addEmail({ value: "new@example.com", label: "Work" })
    let outcome: Awaited<ReturnType<typeof runSaveAll>> | undefined
    await act(async () => {
      outcome = await runSaveAll(registry)
    })
    expect(outcome).toMatchObject({ kind: "done", failed: [{ id: "email" }] })
    expect(bodies).toHaveLength(1)
  })

  it("a refetch that fails after a successful POST still reads saved: read view, toast, and nothing is sent again", async () => {
    globalMutate.fail = true
    const { bodies } = await render()
    await addEmail({ value: "new@example.com", label: "Personal" })
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(1)
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
    expect(banner()).toBeNull()
  })
})

describe("EmailSection: validation", () => {
  it("\"ann@\" reads \"Enter a valid email address\" on blur; Save sends nothing and focuses it", async () => {
    const { bodies } = await render()
    const row = await addEmail({ value: "ann@", label: "Work" })
    await blur(addressInput(row))
    await waitFor(() => expect(described(addressInput(row))).toContain("Enter a valid email address"))
    expect(addressInput(row).getAttribute("aria-invalid")).toBe("true")
    await save()
    expect(bodies).toEqual([])
    expect(document.activeElement).toBe(addressInput(row))
  })

  it("\"ANN@x.com\" against a struck-through \"ann@x.com\" reads \"This email is already on your profile\"", async () => {
    const { bodies } = await render([email({ id: 42, value: "ann@example.com", label: "Primary" }), email({ id: 41, value: "ann@x.com", label: "Work" })])
    await click(button("Edit"))
    await click(within(editRows()[1]).getByRole("button", { name: "Remove" }))
    const row = await addEmail({ value: "ANN@x.com", label: "Work" })
    await save()
    expect(bodies).toEqual([])
    await waitFor(() => expect(described(addressInput(row))).toContain("This email is already on your profile"))
    expect(document.activeElement).toBe(addressInput(row))
  })

  it("an empty Label reads \"Choose a label\"; focus goes to the first invalid field in page order", async () => {
    const { bodies } = await render()
    const row = await addEmail({ value: "new@example.com" })
    await save()
    expect(bodies).toEqual([])
    expect(described(labelTrigger(row))).toContain("Choose a label")
    expect(document.activeElement).toBe(labelTrigger(row))
    const empty = await addEmail()
    await save()
    expect(document.activeElement).toBe(labelTrigger(row))
    expect(described(addressInput(empty))).toContain("Enter a valid email address")
  })
})

describe("EmailSection: Remove rules", () => {
  it("the last email: Remove is aria-disabled with \"You need at least one email\" in the kebab and in edit view", async () => {
    await render([email({ id: 5, value: "only@example.com", label: "Work" })])
    const menu = await openKebab("only@example.com")
    const item = within(menu).getByRole("menuitem", { name: /Remove/ })
    expect(item.getAttribute("aria-disabled")).toBe("true")
    expect(item.textContent).toBe("RemoveYou need at least one email")
    await closeMenu(menu)
    await click(button("Edit"))
    const remove = within(editRows()[0]).getByRole("button", { name: "Remove" })
    expect(remove.getAttribute("aria-disabled")).toBe("true")
    expect(described(remove)).toContain("You need at least one email")
    await click(remove)
    expect(editRows()[0].getAttribute("data-state")).toBe("saved")
    // A new row counts as an email left.
    await addEmail()
    expect(within(editRows()[0]).getByRole("button", { name: "Remove" }).getAttribute("aria-disabled")).toBeNull()
  })

  it("the Primary row: Remove is aria-disabled with \"Make another email primary first\"", async () => {
    await render()
    const menu = await openKebab("ann@example.com")
    expect(within(menu).getByRole("menuitem", { name: /Remove/ }).textContent).toBe("RemoveMake another email primary first")
    await closeMenu(menu)
    await click(button("Edit"))
    const remove = within(editRows()[0]).getByRole("button", { name: "Remove" })
    expect(remove.getAttribute("aria-disabled")).toBe("true")
    expect(described(remove)).toContain("Make another email primary first")
  })

  it("rows without an id: the kebab holds only Edit, edit view has no Remove or Label; they never count as the email left", async () => {
    await render([email({ id: 5, value: "five@example.com", label: "Work" }), email({ id: null, value: "noid@example.com", label: "Home" })])
    // The id-less row never counts as an email left: the only one with an id is the last one.
    const withIdMenu = await openKebab("five@example.com")
    const lastRemove = within(withIdMenu).getByRole("menuitem", { name: /Remove/ })
    expect(lastRemove.getAttribute("aria-disabled")).toBe("true")
    expect(lastRemove.textContent).toBe("RemoveYou need at least one email")
    await closeMenu(withIdMenu)
    const idLess = await openKebab("noid@example.com")
    expect(within(idLess).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit"])
    await click(within(idLess).getByRole("menuitem", { name: "Edit" }))
    await waitFor(() => expect(isReadView()).toBe(false))
    const [withId, withoutId] = editRows()
    await waitFor(() => expect(document.activeElement).toBe(lockedInput(withoutId)))
    expect(within(withoutId).queryByRole("button", { name: /Remove|Restore/ })).toBeNull()
    expect(within(withoutId).queryByRole("combobox", { name: "Label" })).toBeNull()
    expect(within(withoutId).getByText("Home")).toBeTruthy()
    expect(within(withId).getByRole("button", { name: "Remove" }).getAttribute("aria-disabled")).toBe("true")
  })
})

describe("EmailSection: the limit of 20", () => {
  it("20 saved: the header Add email and the footer's Add row are aria-disabled with the limit; Edit still works", async () => {
    await render(many(20, 100))
    const add = button("Add email")
    expect(add.getAttribute("aria-disabled")).toBe("true")
    expect(described(add)).toContain("You've reached the limit of 20 emails")
    await click(add)
    expect(isReadView()).toBe(true)
    const edit = button("Edit")
    expect(edit.getAttribute("aria-disabled")).toBeNull()
    await click(edit)
    expect(isReadView()).toBe(false)
    const footerAdd = within(footer()).getByRole("button", { name: "Add row" })
    expect(footerAdd.getAttribute("aria-disabled")).toBe("true")
    expect(described(footerAdd)).toContain("You've reached the limit of 20 emails")
    await click(footerAdd)
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    // Striking one through frees a place.
    await click(within(editRows()[0]).getByRole("button", { name: "Remove" }))
    expect(within(footer()).getByRole("button", { name: "Add row" }).getAttribute("aria-disabled")).toBeNull()
  })
})

describe("EmailSection: save failures", () => {
  it("a 400 \"x is not a valid email.\" with one new row shows \"Enter a valid email address\" at that row; stays in edit", async () => {
    const { bodies } = await render(EMAILS, upstream("new@example.com is not a valid email."))
    const row = await addEmail({ value: "new@example.com", label: "Work" })
    await save()
    await waitFor(() => expect(described(addressInput(row))).toContain("Enter a valid email address"))
    expect(bodies).toHaveLength(1)
    expect(document.activeElement).toBe(addressInput(row))
    expect(banner()).toBeNull()
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
  })

  it("a duplicate 400 with one new row shows \"This email is already on your profile\" at that row", async () => {
    await render(EMAILS, upstream("Operation failed. Person with id '42' already has contact point with value 'new@example.com'."))
    const row = await addEmail({ value: "new@example.com", label: "Work" })
    await save()
    await waitFor(() => expect(described(addressInput(row))).toContain("This email is already on your profile"))
  })

  it("an invalid label 400 with one new row shows \"Choose a label from the list\" at its Label", async () => {
    await render(EMAILS, upstream("Invalid 'Label' specified. Possible values are [Primary, Work]."))
    const row = await addEmail({ value: "new@example.com", label: "Work" })
    await save()
    await waitFor(() => expect(described(labelTrigger(row))).toContain("Choose a label from the list"))
  })

  it("a limit 400 shows \"You've reached the limit of 20 emails\" at Section level with Retry", async () => {
    await render(EMAILS, upstream("Operation failed. Person can have maximum of 20 contact points per type."))
    await addEmail({ value: "new@example.com", label: "Work" })
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("You've reached the limit of 20 emails"))
    expect(within(banner() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
  })

  it("an invalid-address 400 with two new rows shows at Section level", async () => {
    await render(EMAILS, upstream("new@example.com is not a valid email."))
    await addEmail({ value: "new@example.com", label: "Work" })
    await addEmail({ value: "other@example.com", label: "Home" })
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Enter a valid email address"))
  })

  it("an unknown 400 shows \"Couldn't save email.\" with Retry; stays in edit", async () => {
    await render(EMAILS, upstream("Something else."))
    await addEmail({ value: "new@example.com", label: "Work" })
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save email."))
    expect(screen.queryByText("Something else.")).toBeNull()
    expect(within(banner() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("a network failure shows \"Couldn't save email. Check your connection.\"; Retry resends the same diff", async () => {
    let fail = true
    const { bodies } = await render(EMAILS, () => (fail ? HttpResponse.error() : new HttpResponse(null, { status: 200 })))
    await addEmail({ value: "new@example.com", label: "Work" })
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save email. Check your connection."))
    expect(toastError).toHaveBeenCalledWith("Couldn't save email. Check your connection.", expect.anything())
    fail = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual(bodies[0])
  })
})

describe("EmailSection: drafts", () => {
  it("a new row is drafted as rows; after the session ends, a restore shows it again and saves it", async () => {
    const first = await render()
    await addEmail({ value: "new@example.com", label: "Personal" })
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
    expect(addressInput(row).value).toBe("new@example.com")
    expect(labelTrigger(row).textContent).toBe("Personal")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [{ value: "new@example.com", type: "Email", label: "Personal", isNotificationEnabled: false }], contactPointsToUpdate: [], contactPointsToRemove: [] }])
  })

  it("a restored draft's new address padded with spaces goes out trimmed", async () => {
    const first = await render()
    await addEmail({ value: "ann@x.com", label: "Personal" })
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    first.unmount()
    sessionEvents.reset()
    // The input (type="email") strips spaces as typed, so pad the stored value itself: only `save()` trims it then.
    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}") as { values: { rows: { isNew: boolean; value: string }[] } }
    stored.values.rows = stored.values.rows.map((row) => (row.isNew ? { ...row, value: " ann@x.com " } : row))
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(stored))

    const { bodies } = await render()
    await click(await within(section()).findByRole("button", { name: "Restore" }))
    await waitFor(() => expect(section().querySelector('[data-state="new"]')).not.toBeNull())
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [{ value: "ann@x.com", type: "Email", label: "Personal", isNotificationEnabled: false }], contactPointsToUpdate: [], contactPointsToRemove: [] }])
  })

  it("a saved email the form doesn't hold (a draft from before it existed) is kept: never removed or updated", async () => {
    const first = await render()
    await addEmail({ value: "new@example.com", label: "Personal" })
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    first.unmount()
    sessionEvents.reset()

    const { bodies } = await render([...EMAILS, email({ id: 50, value: "later@example.com", label: "Work" })])
    await click(await within(section()).findByRole("button", { name: /^(Restore|Keep mine)$/ }))
    const keepMine = within(section()).queryByRole("button", { name: "Keep mine" })
    if (keepMine) await click(keepMine)
    await waitFor(() => expect(section().querySelector('[data-state="new"]')).not.toBeNull())
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [{ value: "new@example.com", type: "Email", label: "Personal", isNotificationEnabled: false }], contactPointsToUpdate: [], contactPointsToRemove: [] }])
  })

  it("a stale draft that strikes an email made Primary meanwhile is refused: \"Couldn't save email.\", nothing sent", async () => {
    const first = await render()
    await click(button("Edit"))
    await click(within(editRows()[1]).getByRole("button", { name: "Remove" }))
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    first.unmount()
    sessionEvents.reset()

    // 41 is the Primary now (made so on `/account`), 42 relabelled Old.
    const { bodies } = await render([
      email({ id: 41, value: "ann@work.example", label: "Primary", isVerified: true }),
      email({ id: 42, value: "ann@example.com", label: "Old", isVerified: true }),
      EMAILS[2],
    ])
    await click(await within(section()).findByRole("button", { name: /^(Restore|Keep mine)$/ }))
    const keepMine = within(section()).queryByRole("button", { name: "Keep mine" })
    if (keepMine) await click(keepMine)
    await waitFor(() => expect(section().querySelector('[data-state="removed"]')).not.toBeNull())
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save email."))
    expect(bodies).toEqual([])
  })
})

describe("EmailSection: stale drafts never switch the Primary", () => {
  it("a draft holding the old Primary label sends only its new row, never a Primary change", async () => {
    const first = await render()
    await addEmail({ value: "new@example.com", label: "Personal" })
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    first.unmount()
    sessionEvents.reset()

    const { bodies } = await render([
      email({ id: 41, value: "ann@work.example", label: "Primary", isVerified: true }),
      email({ id: 42, value: "ann@example.com", label: "Old", isVerified: true }),
      EMAILS[2],
    ])
    await click(await within(section()).findByRole("button", { name: /^(Restore|Keep mine)$/ }))
    const keepMine = within(section()).queryByRole("button", { name: "Keep mine" })
    if (keepMine) await click(keepMine)
    await waitFor(() => expect(section().querySelector('[data-state="new"]')).not.toBeNull())
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [{ value: "new@example.com", type: "Email", label: "Personal", isNotificationEnabled: false }], contactPointsToUpdate: [], contactPointsToRemove: [] }])
  })
})

describe("EmailSection: review guards", () => {
  it("Edit after a save: the refetched email is a saved, locked row; a relabel then sends no add", async () => {
    let list: Wire[] = [...EMAILS]
    const { bodies } = await render(() => HttpResponse.json(list))
    await addEmail({ value: "new@example.com", label: "Personal" })
    list = [...EMAILS, email({ id: 44, value: "new@example.com", label: "Personal", isVerified: false })]
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    await waitFor(() => expect(within(section()).getAllByRole("button", { name: /More actions for/ })).toHaveLength(4))
    await click(button("Edit"))
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    const added = editRows().find((row) => lockedInput(row).value === "new@example.com") as HTMLElement
    expect(added.getAttribute("data-state")).toBe("saved")
    await pick(labelTrigger(added), "Work")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies[1]).toEqual({ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 44, type: "Email", label: "Work", isNotificationEnabled: false }], contactPointsToRemove: [] })
  })

  it("a kebab item whose row a revalidation dropped meanwhile does nothing", async () => {
    const { setList } = await render()
    const menu = await openKebab("ann@work.example")
    const item = within(menu).getByRole("menuitem", { name: "Edit" })
    await act(async () => {
      fireEvent.click(item)
      await setList([EMAILS[1]])
    })
    await waitFor(() => expect(within(section()).getAllByRole("button", { name: /More actions for/ })).toHaveLength(1))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(isReadView()).toBe(true)

    await setList(EMAILS)
    const removeMenu = await openKebab("ann@home.example")
    const remove = within(removeMenu).getByRole("menuitem", { name: "Remove" })
    await act(async () => {
      fireEvent.click(remove)
      await setList([EMAILS[1]])
    })
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(isReadView()).toBe(true)
  })

  it("a repeated id: shown twice, the repeat locked; a save sends that id once", async () => {
    const { bodies } = await render([email({ id: 7, value: "seven@example.com", label: "Work" }), email({ id: 7, value: "again@example.com", label: "Home" })])
    // The repeat's kebab holds only Edit (nothing to remove or make primary); the first occurrence keeps Make primary and Remove.
    const repeatMenu = await openKebab("again@example.com")
    expect(within(repeatMenu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit"])
    await closeMenu(repeatMenu)
    const firstMenu = await openKebab("seven@example.com")
    expect(within(firstMenu).getAllByRole("menuitem").map((item) => item.firstElementChild?.firstElementChild?.textContent ?? item.textContent)).toEqual(["Make primary", "Edit", "Remove"])
    await closeMenu(firstMenu)
    await click(button("Edit"))
    const [first, repeat] = editRows()
    expect(within(repeat).queryByRole("combobox", { name: "Label" })).toBeNull()
    expect(within(repeat).queryByRole("button", { name: /Remove|Restore/ })).toBeNull()
    await pick(labelTrigger(first), "Personal")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 7, type: "Email", label: "Personal", isNotificationEnabled: false }], contactPointsToRemove: [] }])
  })

  it("a saved email without a label is never updated: a save with a new email sends only the add", async () => {
    const { bodies } = await render([EMAILS[1], email({ id: 45, value: "nolabel@example.com", label: null })])
    await addEmail({ value: "new@example.com", label: "Work" })
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [{ value: "new@example.com", type: "Email", label: "Work", isNotificationEnabled: false }], contactPointsToUpdate: [], contactPointsToRemove: [] }])
  })

  it("a saved label the list doesn't offer shows on its trigger, and an untouched save sends no update for it", async () => {
    const { bodies } = await render([EMAILS[1], email({ id: 40, value: "org@example.com", label: "Partnership Organization" })])
    await click(button("Edit"))
    expect(labelTrigger(editRows()[1]).textContent).toBe("Partnership Organization")
    await addEmail({ value: "new@example.com", label: "Work" })
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [{ value: "new@example.com", type: "Email", label: "Work", isNotificationEnabled: false }], contactPointsToUpdate: [], contactPointsToRemove: [] }])
  })
})

describe("EmailSection: edit view below 768 px", () => {
  it("each card stacks its labelled controls full width in place, every control 44 px", async () => {
    stubViewport(360)
    await render()
    await addEmail()
    expect(within(section()).queryByRole("table")).toBeNull()
    const card = newRow()
    expect(card.tagName).toBe("LI")
    expect([...card.querySelectorAll("[data-column]")].map((block) => block.getAttribute("data-column"))).toEqual(["address", "label", "status", "notifications"])
    expect(addressInput(card).className).toContain("h-11")
    expect(labelTrigger(card).getAttribute("data-size")).toBe("default")
    expect(labelTrigger(card).className).toContain("w-full")
    expect(within(card).getByRole("button", { name: "Remove" }).className).toContain("h-11")
  })
})

describe("EmailSection: edit view accessibility", () => {
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
    await addEmail({ value: "ann@" })
    await save()
    await waitFor(() => expect(addressInput(newRow()).getAttribute("aria-invalid")).toBe("true"))
    expect(await axeViolations()).toEqual([])
  })

  it("has no axe violations in read view with the kebabs and the disabled limit action", async () => {
    await render(many(20, 100))
    expect(await axeViolations()).toEqual([])
  })
})

it("a restored removal cannot delete the last currently saved non-Primary email", async () => {
  const original = many(2, 61)
  const first = await render(original)
  const menu = await openKebab("user61@example.com")
  await click(within(menu).getByRole("menuitem", { name: "Remove" }))
  await act(async () => sessionEvents.publish("session-expired"))
  await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
  first.unmount()
  sessionEvents.reset()
  const second = await render([original[0]])
  await click(await within(section()).findByRole("button", { name: /^(Restore|Keep mine)$/ }))
  const keepMine = within(section()).queryByRole("button", { name: "Keep mine" })
  if (keepMine) await click(keepMine)
  await save()
  await waitFor(() => expect(banner()?.textContent).toContain("You need at least one email"))
  expect(second.bodies).toEqual([])
  expect(isReadView()).toBe(false)
})
