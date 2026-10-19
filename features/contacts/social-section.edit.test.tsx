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
import { SocialSection } from "."

// The Section's own toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// Full edit flows (a save, a refetch) take up to ~1 s here and several times that on a loaded CI runner; a
// timed-out test leaves its `act` scope open and breaks every later render in the file.
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
 * Story 3.7 (NG-9025): the Social media edit view and its save on `/`,
 * rendered the way `PageFrame` hosts it (`renderInPage`, MSW at `/api`).
 * Covers every edit row of the I/O matrix in
 * `spec-3-7-manage-social-media-links.md`.
 */

const LIST = "/api/1h/v2/user/contact-point/list"
const MANAGE = "/api/1h/v2/health/contact-point"
const VERIFY = "/api/1h/v2/health/contact-point/verify"
const DRAFT_KEY = "pp:draft:v1:demo:42:social"

type Wire = Record<string, unknown>
type List = Wire[] | (() => Response)

const link = (overrides: Wire): Wire => contactPointWire({ type: "Social Media", label: "Personal", isVerified: null, isNotificationEnabled: false, phoneNumberRegion: null, ...overrides })

/** The matrix's "Read" row: an https link 51 and a legacy handle 52. */
const LINKS: Wire[] = [link({ id: 51, value: "https://x.com/ann" }), link({ id: 52, value: "@ann" })]
/** A legacy Primary link 53 beside 51. */
const WITH_PRIMARY: Wire[] = [LINKS[0], link({ id: 53, value: "https://legacy.example/ann", label: "Primary" })]

/** `count` saved links (ids from `start`). */
const many = (count: number, start: number): Wire[] => Array.from({ length: count }, (_, index) => link({ id: start + index, value: `https://example.com/u${start + index}` }))

/** The body of one add: always Social Media, "Personal", notifications off. */
const addOf = (value: string) => ({ value, type: "Social Media", label: "Personal", isNotificationEnabled: false })

/** Answers the Social Media list (`[]` for any other type), and records each list read, each manage body and each verify. */
function socialServer(list: List, answer: () => Response | Promise<Response> = () => new HttpResponse(null, { status: 200 })) {
  const bodies: unknown[] = []
  const reads: string[] = []
  const verifies: unknown[] = []
  const handlers: HttpHandler[] = [
    http.get(LIST, ({ request }) => {
      const type = new URL(request.url).searchParams.get("type") ?? ""
      reads.push(type)
      if (type !== "Social Media") return HttpResponse.json([])
      return typeof list === "function" ? list() : HttpResponse.json(list)
    }),
    http.post(MANAGE, async ({ request }) => {
      bodies.push(await request.json())
      return answer()
    }),
    http.post(VERIFY, async ({ request }) => {
      verifies.push(await request.json())
      return HttpResponse.json({ success: true, contactPointIdsWithSendError: [] })
    }),
  ]
  return { bodies, reads, verifies, handlers }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Social media" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const heading = (): HTMLElement => screen.getByRole("heading", { level: 2, name: "Social media" })
const button = (name: string | RegExp): HTMLElement => within(section()).getByRole("button", { name })
const footer = (): HTMLElement => section().querySelector('[data-slot="section-footer"]') as HTMLElement
const isReadView = (): boolean => section().querySelector('[data-slot="section-footer"]') === null
const banner = (): HTMLElement | null => section().querySelector('[data-slot~="inline-banner"]')
/** The body rows of the edit table (desktop) or its cards (mobile). */
const editRows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>("tbody tr, li[data-slot='section-table-card']")]
const newRow = (): HTMLElement => {
  const rows = section().querySelectorAll<HTMLElement>('[data-state="new"]')
  return rows[rows.length - 1]
}
const linkInput = (row: HTMLElement): HTMLInputElement => within(row).getByRole("textbox", { name: "Link" }) as HTMLInputElement
const lockedInput = (row: HTMLElement): HTMLInputElement => row.querySelector('[data-slot="input-locked"] input') as HTMLInputElement
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

async function render(list: List = LINKS, answer?: () => Response | Promise<Response>) {
  const server = socialServer(list, answer)
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
      <SocialSection />
      <CacheProbe />
    </>,
    { page: "profile", handlers: server.handlers },
  )
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  // D-A: a write goes out only once the page user is pinned (the page's own `myself` read does it).
  await act(async () => {
    await fetchMyself()
  })
  /** Puts `rows` in the Section's cache for Social Media without a request. */
  const setList = (rows: Wire[]) =>
    act(async () => {
      await scoped?.(keys.contactPoints("Social Media"), rows.map((row) => ({ ...row })), { revalidate: false })
    })
  return { ...result, bodies: server.bodies, reads: server.reads, verifies: server.verifies, setList }
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

async function openKebab(value: string): Promise<HTMLElement> {
  await act(async () => fireEvent.keyDown(button(`More actions for ${value}`), { key: "Enter" }))
  return screen.findByRole("menu")
}

/** Escape closes the menu; then its kebab gets focus back (a later timer) before another menu may open. */
async function closeMenu(menu: HTMLElement) {
  await act(async () => fireEvent.keyDown(menu, { key: "Escape" }))
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
}

/** Adds a new row (header "Add link" in read view, the footer's Add row while editing) and fills it. */
async function addLink(value?: string) {
  await click(isReadView() ? button("Add link") : within(footer()).getByRole("button", { name: "Add row" }))
  const row = newRow()
  if (value !== undefined) await type(linkInput(row), value)
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

describe("SocialSection: read-view entry points", () => {
  it("the header has an outline Edit and Add link (44 px); the kebab holds Edit and Remove", async () => {
    await render()
    for (const name of ["Edit", "Add link"]) {
      const action = button(name)
      expect(action.className).toContain("h-11")
      expect(action.getAttribute("data-variant") ?? action.className).toMatch(/outline/)
      expect(action.getAttribute("aria-disabled")).toBeNull()
    }
    const menu = await openKebab("@ann")
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Remove"])
  })

  it("Edit switches the whole table in place: Editing, focus on the first link; every saved link an editable url input", async () => {
    await render()
    await click(button("Edit"))
    expect(within(section()).getByText("Editing")).toBeTruthy()
    expect(section().querySelector('[data-slot="section-container"]')?.getAttribute("data-editing")).toBe("true")
    const [first, second] = editRows()
    expect(document.activeElement).toBe(linkInput(first))
    expect([linkInput(first).value, linkInput(second).value]).toEqual(["https://x.com/ann", "@ann"])
    const input = linkInput(first)
    expect([input.type, input.getAttribute("autocomplete"), input.getAttribute("spellcheck"), input.getAttribute("autocapitalize"), input.getAttribute("aria-required")]).toEqual([
      "url",
      "off",
      "false",
      "none",
      "true",
    ])
    expect(section().querySelector('[data-slot="input-locked"]')).toBeNull()
    expect(within(footer()).getAllByRole("button").map((action) => action.textContent)).toEqual(["Add row", "Cancel", "Save"])
    expect(within(section()).queryByText("Unsaved changes")).toBeNull()
    // No labels, statuses, notifications or verify.
    expect(within(section()).queryByRole("combobox")).toBeNull()
    expect(within(section()).queryByRole("switch")).toBeNull()
  })

  it("Add link opens edit with one new row: focus on its url input, \"New · not saved\"", async () => {
    await render()
    await click(button("Add link"))
    expect(editRows()).toHaveLength(3)
    const row = newRow()
    expect(document.activeElement).toBe(linkInput(row))
    expect(linkInput(row).value).toBe("")
    expect(within(row).getByText("New · not saved")).toBeTruthy()
  })

  it("the empty-state Add link (and the header Edit with no links) opens edit with one new row focused", async () => {
    await render([])
    await click(within(section().querySelector('[data-slot="empty-state"]') as HTMLElement).getByRole("button", { name: "Add link" }))
    expect(editRows()).toHaveLength(1)
    expect(document.activeElement).toBe(linkInput(newRow()))
    await click(screen.getByRole("button", { name: "Cancel" }))
    await click(button("Edit"))
    expect(editRows()).toHaveLength(1)
    expect(document.activeElement).toBe(linkInput(newRow()))
    await click(within(newRow()).getByRole("button", { name: "Remove" }))
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    expect(section().querySelector('[data-slot="empty-state"]')?.textContent).toBe("No social links yet·Add link")
  })

  it("the kebab's Edit focuses that row's input", async () => {
    await render()
    const menu = await openKebab("@ann")
    await click(within(menu).getByRole("menuitem", { name: "Edit" }))
    await waitFor(() => expect(document.activeElement).toBe(linkInput(editRows()[1])))
  })

  it("the kebab's Remove opens edit with that row struck through and focus on its Restore", async () => {
    await render()
    const menu = await openKebab("https://x.com/ann")
    await click(within(menu).getByRole("menuitem", { name: "Remove" }))
    await waitFor(() => expect(isReadView()).toBe(false))
    const row = editRows()[0]
    await waitFor(() => expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Restore" })))
    expect(row.getAttribute("data-state")).toBe("removed")
    expect(described(within(row).getByRole("button", { name: "Restore" }))).toEqual(["Removed on save"])
    expect(linkInput(row).readOnly).toBe(true)
    expect(within(section()).getByText("Unsaved changes")).toBeTruthy()
  })

  it("registers as social, \"Social media\", display order 4, with drafts of rows", async () => {
    const { registry } = await render()
    expect(registry.get("social")).toMatchObject({ id: "social", label: "Social media", displayOrder: 4, draftFields: ["rows"] })
  })
})

describe("SocialSection: save", () => {
  it("Add: one POST with the trimmed link as Social Media / Personal; the key and myself revalidated; read view, toast, h2, draft cleared; no verify", async () => {
    const watched = [keys.myself(), keys.contactPoints("Email")]
    const loads = watchAppCache(watched)
    await waitFor(() => expect(loads.size).toBe(2))
    const { bodies, reads, verifies } = await render()
    await addLink(" https://linkedin.com/in/ann ")
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    const readsBefore = reads.length
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [addOf("https://linkedin.com/in/ann")], contactPointsToUpdate: [], contactPointsToRemove: [] }])
    expect(reads.slice(readsBefore)).toEqual(["Social Media"])
    expect(watched.map((key) => loads.get(JSON.stringify(key)))).toEqual([2, 1])
    expect(toastSuccess).toHaveBeenCalledWith("Social media saved.")
    expect(document.activeElement).toBe(heading())
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(verifies).toEqual([])
  })

  it("Replace: a changed saved link goes as remove [51] plus an add of the new value, in one POST", async () => {
    const { bodies } = await render()
    await click(button("Edit"))
    await type(linkInput(editRows()[0]), "https://x.com/ann2")
    expect(within(section()).getByText("Unsaved changes")).toBeTruthy()
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [addOf("https://x.com/ann2")], contactPointsToUpdate: [], contactPointsToRemove: [51] }])
  })

  it("a replacement of a link labelled Work goes as \"Personal\"; an unchanged link padded with spaces sends nothing", async () => {
    const { bodies } = await render([link({ id: 51, value: "https://x.com/ann", label: "Work" }), LINKS[1]])
    await click(button("Edit"))
    await type(linkInput(editRows()[0]), " https://x.com/ann ")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([])
    await click(button("Edit"))
    await type(linkInput(editRows()[0]), "https://x.com/ann3")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [addOf("https://x.com/ann3")], contactPointsToUpdate: [], contactPointsToRemove: [51] }])
  })

  it("Remove all: strike 51 and 52, Save → remove [51, 52], then the empty state (zero links is allowed)", async () => {
    let list: Wire[] = LINKS
    const { bodies } = await render(() => HttpResponse.json(list))
    await click(button("Edit"))
    for (const row of editRows()) {
      const remove = within(row).getByRole("button", { name: "Remove" })
      expect(remove.getAttribute("aria-disabled")).toBeNull()
      await click(remove)
    }
    list = []
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [], contactPointsToRemove: [51, 52] }])
    await waitFor(() => expect(section().querySelector('[data-slot="empty-state"]')?.textContent).toBe("No social links yet·Add link"))
  })

  it("the last link's Remove in the kebab is never disabled", async () => {
    await render([LINKS[0]])
    const menu = await openKebab("https://x.com/ann")
    expect(within(menu).getByRole("menuitem", { name: "Remove" }).getAttribute("aria-disabled")).toBeNull()
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
    const row = await addLink("https://new.example/ann")
    await click(within(row).getByRole("button", { name: "Remove" }))
    expect(editRows()).toHaveLength(2)
    await save()
    expect(isReadView()).toBe(true)
    expect(bodies).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(heading())
  })

  it("Cancel reverts only Social media (no confirm), deletes the draft and focuses the h2", async () => {
    const { bodies, registry } = await render()
    await addLink("https://new.example/ann")
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    expect(registry.get("social")?.isDirty).toBe(true)
    await click(screen.getByRole("button", { name: "Cancel" }))
    expect(isReadView()).toBe(true)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(heading())
    expect(registry.get("social")?.isDirty).toBe(false)
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(bodies).toEqual([])
  })

  it("Enter in the input never saves, and Escape never cancels", async () => {
    const { bodies } = await render()
    const row = await addLink("https://new.example/ann")
    await act(async () => fireEvent.keyDown(linkInput(row), { key: "Enter" }))
    await act(async () => fireEvent.keyDown(linkInput(row), { key: "Escape" }))
    expect(bodies).toEqual([])
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(within(section()).getByText("Unsaved changes")).toBeTruthy()
  })

  it("while saving, Save is busy, Cancel inert, the inputs read-only and Remove a no-op", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { bodies } = await render(LINKS, async () => {
      await gate
      return new HttpResponse(null, { status: 200 })
    })
    const row = await addLink("https://new.example/ann")
    await save()
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(screen.getByRole("button", { name: /Saving/ }).getAttribute("aria-busy")).toBe("true")
    expect(screen.getByRole("button", { name: "Cancel" }).getAttribute("aria-disabled")).toBe("true")
    expect(linkInput(row).readOnly).toBe(true)
    expect(linkInput(editRows()[0]).readOnly).toBe(true)
    await click(within(row).getByRole("button", { name: "Remove" }))
    expect(editRows()).toHaveLength(3)
    await act(async () => release())
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(1)
  })

  it("Save all reaches Social media: the registered save resolves without throwing", async () => {
    const { bodies, registry } = await render(LINKS, () => HttpResponse.error())
    await addLink("https://new.example/ann")
    let outcome: Awaited<ReturnType<typeof runSaveAll>> | undefined
    await act(async () => {
      outcome = await runSaveAll(registry)
    })
    expect(outcome).toMatchObject({ kind: "done", failed: [{ id: "social" }] })
    expect(bodies).toHaveLength(1)
  })

  it("a refetch that fails after a successful POST still reads saved: read view, toast, and nothing is sent again", async () => {
    globalMutate.fail = true
    const { bodies } = await render()
    await addLink("https://new.example/ann")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(1)
    expect(toastSuccess).toHaveBeenCalledWith("Social media saved.")
    expect(banner()).toBeNull()
  })
})

describe("SocialSection: validation", () => {
  it.each([
    ["http", "http://x.com"],
    ["javascript", "javascript:alert(1)"],
    ["a handle", "@ann"],
  ])("%s reads \"Enter a link that starts with https://\" on blur; Save sends nothing and focuses it", async (_case, value) => {
    const { bodies } = await render()
    const row = await addLink(value)
    await blur(linkInput(row))
    await waitFor(() => expect(described(linkInput(row))).toContain("Enter a link that starts with https://"))
    expect(linkInput(row).getAttribute("aria-invalid")).toBe("true")
    await save()
    expect(bodies).toEqual([])
    expect(document.activeElement).toBe(linkInput(row))
  })

  it("an empty new link reads \"Enter a link\"; an emptied saved link too", async () => {
    const { bodies } = await render()
    const row = await addLink()
    await save()
    expect(bodies).toEqual([])
    await waitFor(() => expect(described(linkInput(row))).toContain("Enter a link"))
    await click(within(row).getByRole("button", { name: "Remove" }))
    const saved = editRows()[0]
    await type(linkInput(saved), "  ")
    await save()
    await waitFor(() => expect(described(linkInput(saved))).toContain("Enter a link"))
    expect(document.activeElement).toBe(linkInput(saved))
    expect(bodies).toEqual([])
  })

  it("a duplicate of a struck-through link reads \"This link is already on your profile\"", async () => {
    const { bodies } = await render()
    await click(button("Edit"))
    await click(within(editRows()[0]).getByRole("button", { name: "Remove" }))
    const row = await addLink("https://X.com/Ann")
    await save()
    expect(bodies).toEqual([])
    await waitFor(() => expect(described(linkInput(row))).toContain("This link is already on your profile"))
    expect(document.activeElement).toBe(linkInput(row))
  })

  it("an unchanged legacy handle never blocks a save", async () => {
    const { bodies } = await render()
    await addLink("https://new.example/ann")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [addOf("https://new.example/ann")], contactPointsToUpdate: [], contactPointsToRemove: [] }])
  })
})

describe("SocialSection: legacy Primary link", () => {
  it("its input is locked and its Remove (edit view and kebab) is aria-disabled with the reason; nothing is ever sent for it", async () => {
    const { bodies } = await render(WITH_PRIMARY)
    const menu = await openKebab("https://legacy.example/ann")
    const item = within(menu).getByRole("menuitem", { name: /Remove/ })
    expect(item.getAttribute("aria-disabled")).toBe("true")
    expect(item.textContent).toBe("RemoveThis link can't be removed or changed here.")
    await closeMenu(menu)
    await click(button("Edit"))
    const [, primary] = editRows()
    // The one control named Link is the locked input.
    expect(within(primary).getByRole("textbox", { name: "Link" })).toBe(lockedInput(primary))
    expect([lockedInput(primary).value, lockedInput(primary).readOnly]).toEqual(["https://legacy.example/ann", true])
    expect(described(lockedInput(primary))).toEqual(["This link can't be removed or changed here."])
    const remove = within(primary).getByRole("button", { name: "Remove" })
    expect(remove.getAttribute("aria-disabled")).toBe("true")
    expect(described(remove)).toContain("This link can't be removed or changed here.")
    await click(remove)
    expect(primary.getAttribute("data-state")).toBe("saved")
    await addLink("https://new.example/ann")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [addOf("https://new.example/ann")], contactPointsToUpdate: [], contactPointsToRemove: [] }])
  })

  it("the kebab's Edit on it focuses its locked input; with nothing else editable Edit focuses it too", async () => {
    await render([WITH_PRIMARY[1]])
    const menu = await openKebab("https://legacy.example/ann")
    await click(within(menu).getByRole("menuitem", { name: "Edit" }))
    await waitFor(() => expect(document.activeElement).toBe(lockedInput(editRows()[0])))
    await click(screen.getByRole("button", { name: "Cancel" }))
    await click(button("Edit"))
    expect(document.activeElement).toBe(lockedInput(editRows()[0]))
  })

  it("a stale draft striking a link that became a Primary sends nothing for it", async () => {
    const first = await render()
    await click(button("Edit"))
    await click(within(editRows()[0]).getByRole("button", { name: "Remove" }))
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    first.unmount()
    sessionEvents.reset()

    const { bodies } = await render([link({ id: 51, value: "https://x.com/ann", label: "Primary" }), LINKS[1]])
    await click(await within(section()).findByRole("button", { name: /^(Restore|Keep mine)$/ }))
    const keepMine = within(section()).queryByRole("button", { name: "Keep mine" })
    if (keepMine) await click(keepMine)
    await waitFor(() => expect(section().querySelector('[data-state="removed"]')).not.toBeNull())
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([])
  })
})

describe("SocialSection: the limit of 20", () => {
  it("20 saved: the header Add link and the footer's Add row are aria-disabled with the limit; Edit still works", async () => {
    await render(many(20, 100))
    const add = button("Add link")
    expect(add.getAttribute("aria-disabled")).toBe("true")
    expect(described(add)).toContain("You've reached the limit of 20 links")
    await click(add)
    expect(isReadView()).toBe(true)
    await click(button("Edit"))
    expect(isReadView()).toBe(false)
    const footerAdd = within(footer()).getByRole("button", { name: "Add row" })
    expect(footerAdd.getAttribute("aria-disabled")).toBe("true")
    expect(described(footerAdd)).toContain("You've reached the limit of 20 links")
    await click(footerAdd)
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    // Striking one through frees a place.
    await click(within(editRows()[0]).getByRole("button", { name: "Remove" }))
    expect(within(footer()).getByRole("button", { name: "Add row" }).getAttribute("aria-disabled")).toBeNull()
  })
})

describe("SocialSection: save failures", () => {
  it("a 400 \"Invalid URL provided '…'.\" with one changed row shows the invalid-link message at that row; stays in edit", async () => {
    const { bodies } = await render(LINKS, upstream("Invalid URL provided 'https://x.com/ann2'."))
    await click(button("Edit"))
    const row = editRows()[0]
    await type(linkInput(row), "https://x.com/ann2")
    await save()
    await waitFor(() => expect(described(linkInput(row))).toContain("Enter a link that starts with https://"))
    expect(bodies).toHaveLength(1)
    expect(document.activeElement).toBe(linkInput(row))
    expect(banner()).toBeNull()
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
  })

  it("a duplicate 400 with one new row shows \"This link is already on your profile\" at that row", async () => {
    await render(LINKS, upstream("Operation failed. Person with id '42' already has contact point with value 'https://new.example/ann'."))
    const row = await addLink("https://new.example/ann")
    await save()
    await waitFor(() => expect(described(linkInput(row))).toContain("This link is already on your profile"))
  })

  it("a limit 400 shows \"You've reached the limit of 20 links\" at Section level with Retry", async () => {
    await render(LINKS, upstream("Operation failed. Person can have maximum of 20 contact points per type."))
    await addLink("https://new.example/ann")
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("You've reached the limit of 20 links"))
    expect(within(banner() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
  })

  it("an invalid-URL 400 with two changed rows shows at Section level", async () => {
    await render(LINKS, upstream("Invalid URL provided 'https://x.com/ann2'."))
    await click(button("Edit"))
    await type(linkInput(editRows()[0]), "https://x.com/ann2")
    await addLink("https://new.example/ann")
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Enter a link that starts with https://"))
  })

  it("an unknown 400 shows \"Couldn't save social media.\" with Retry; stays in edit", async () => {
    await render(LINKS, upstream("Something else."))
    await addLink("https://new.example/ann")
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save social media."))
    expect(screen.queryByText("Something else.")).toBeNull()
    expect(within(banner() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("a network failure shows \"Couldn't save social media. Check your connection.\"; Retry resends the same diff", async () => {
    let fail = true
    const { bodies } = await render(LINKS, () => (fail ? HttpResponse.error() : new HttpResponse(null, { status: 200 })))
    await addLink("https://new.example/ann")
    await save()
    await waitFor(() => expect(banner()?.textContent).toContain("Couldn't save social media. Check your connection."))
    expect(toastError).toHaveBeenCalledWith("Couldn't save social media. Check your connection.", expect.anything())
    fail = false
    await click(within(banner() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual(bodies[0])
  })
})

describe("SocialSection: drafts", () => {
  it("a new row and a changed link are drafted as rows; after the session ends, a restore shows them again and saves them", async () => {
    const first = await render()
    await click(button("Edit"))
    await type(linkInput(editRows()[0]), "https://x.com/ann2")
    await addLink("https://new.example/ann")
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}") as { values: Record<string, unknown> }
    expect(Object.keys(stored.values)).toEqual(["rows"])
    expect((stored.values.rows as unknown[]).length).toBe(3)
    first.unmount()
    sessionEvents.reset()

    const { bodies } = await render()
    await click(await within(section()).findByRole("button", { name: "Restore" }))
    await waitFor(() => expect(section().querySelector('[data-state="new"]')).not.toBeNull())
    expect(linkInput(newRow()).value).toBe("https://new.example/ann")
    expect(linkInput(editRows()[0]).value).toBe("https://x.com/ann2")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      { contactPointsToAdd: [addOf("https://x.com/ann2"), addOf("https://new.example/ann")], contactPointsToUpdate: [], contactPointsToRemove: [51] },
    ])
  })

  it("a saved link the form doesn't hold (a draft from before it existed) is kept: never removed", async () => {
    const first = await render()
    await addLink("https://new.example/ann")
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    first.unmount()
    sessionEvents.reset()

    const { bodies } = await render([...LINKS, link({ id: 60, value: "https://later.example/ann" })])
    await click(await within(section()).findByRole("button", { name: /^(Restore|Keep mine)$/ }))
    const keepMine = within(section()).queryByRole("button", { name: "Keep mine" })
    if (keepMine) await click(keepMine)
    await waitFor(() => expect(section().querySelector('[data-state="new"]')).not.toBeNull())
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [addOf("https://new.example/ann")], contactPointsToUpdate: [], contactPointsToRemove: [] }])
  })
})

describe("SocialSection: review guards", () => {
  it("Edit after a save: the refetched link is a saved row; a change then replaces it", async () => {
    let list: Wire[] = [...LINKS]
    const { bodies } = await render(() => HttpResponse.json(list))
    await addLink("https://new.example/ann")
    list = [...LINKS, link({ id: 54, value: "https://new.example/ann" })]
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    await waitFor(() => expect(within(section()).getAllByRole("button", { name: /More actions for/ })).toHaveLength(3))
    await click(button("Edit"))
    expect(section().querySelector('[data-state="new"]')).toBeNull()
    const added = editRows().find((row) => linkInput(row).value === "https://new.example/ann") as HTMLElement
    expect(added.getAttribute("data-state")).toBe("saved")
    await type(linkInput(added), "https://new.example/ann2")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies[1]).toEqual({ contactPointsToAdd: [addOf("https://new.example/ann2")], contactPointsToUpdate: [], contactPointsToRemove: [54] })
  })

  it("a kebab item whose row a revalidation dropped meanwhile does nothing", async () => {
    const { setList } = await render()
    const menu = await openKebab("@ann")
    const item = within(menu).getByRole("menuitem", { name: "Edit" })
    await act(async () => {
      fireEvent.click(item)
      await setList([LINKS[0]])
    })
    await waitFor(() => expect(within(section()).getAllByRole("button", { name: /More actions for/ })).toHaveLength(1))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(isReadView()).toBe(true)

    await setList(LINKS)
    const removeMenu = await openKebab("@ann")
    const remove = within(removeMenu).getByRole("menuitem", { name: "Remove" })
    await act(async () => {
      fireEvent.click(remove)
      await setList([LINKS[0]])
    })
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(isReadView()).toBe(true)
  })

  it("rows without an id and repeated ids: the kebab holds only Edit; edit view locks them with no Remove; a save sends the id once", async () => {
    const { bodies } = await render([
      link({ id: 7, value: "https://seven.example/ann" }),
      link({ id: 7, value: "https://again.example/ann" }),
      link({ id: null, value: "https://none.example/ann" }),
    ])
    for (const value of ["https://again.example/ann", "https://none.example/ann"]) {
      const menu = await openKebab(value)
      expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit"])
      await closeMenu(menu)
    }
    await click(button("Edit"))
    const [first, repeat, none] = editRows()
    for (const row of [repeat, none]) {
      expect(within(row).getByRole("textbox", { name: "Link" })).toBe(lockedInput(row))
      expect(lockedInput(row).readOnly).toBe(true)
      expect(within(row).queryByRole("button", { name: /Remove|Restore/ })).toBeNull()
    }
    await type(linkInput(first), "https://seven.example/ann2")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [addOf("https://seven.example/ann2")], contactPointsToUpdate: [], contactPointsToRemove: [7] }])
  })
})

describe("SocialSection: edit view below 768 px", () => {
  it("each card stacks its labelled input full width in place, every control 44 px", async () => {
    stubViewport(360)
    await render()
    await addLink()
    expect(within(section()).queryByRole("table")).toBeNull()
    const card = newRow()
    expect(card.tagName).toBe("LI")
    expect([...card.querySelectorAll("[data-column]")].map((block) => block.getAttribute("data-column"))).toEqual(["link"])
    expect(linkInput(card).className).toContain("h-11")
    expect(linkInput(card).className).toContain("w-full")
    expect(within(card).getByRole("button", { name: "Remove" }).className).toContain("h-11")
  })
})

describe("SocialSection: edit view accessibility", () => {
  it.each([
    ["light", 360],
    ["dark", 360],
    ["light", 1024],
    ["dark", 1024],
  ] as const)("has no axe violations in %s mode at %i px, with a new row, a struck row, a locked row and field errors", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await render([...LINKS, WITH_PRIMARY[1]])
    await click(button("Edit"))
    await click(within(editRows()[1]).getByRole("button", { name: "Remove" }))
    await addLink("@ann2")
    await save()
    await waitFor(() => expect(linkInput(newRow()).getAttribute("aria-invalid")).toBe("true"))
    expect(await axeViolations()).toEqual([])
  })

  it("has no axe violations in read view with the kebabs and the disabled limit action", async () => {
    await render(many(20, 100))
    expect(await axeViolations()).toEqual([])
  })
})
