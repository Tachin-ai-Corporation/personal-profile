import { act, render as renderPlain, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type HttpHandler } from "msw"
import { createElement, useEffect } from "react"
import useSWR, { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toastError, toastSuccess } from "@/features/shell"
import { fetchMyself, keys, sessionEvents, type SwrKey } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { contactPointWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { PhoneSection } from "."

// The Section's own toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// Confirm-then-save flows (a dialog, the POST, the refetch) take up to ~2 s here and several times that on a
// loaded CI runner. A timed-out test leaves its `act` scope open, and every later `renderInPage` in the
// file then throws "the Section registry was not mounted", so this file gets more than the default 5 s.
vi.setConfig({ testTimeout: 20_000 })
// The engine, made to throw on demand (a programmer error the Section must survive).
const engine = vi.hoisted(() => ({ fail: false }))
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    contactPointsDiffToManageDTO: (...args: Parameters<typeof actual.contactPointsDiffToManageDTO>) => {
      if (engine.fail) throw new Error("contactPointsDiffToManageDTO: refused")
      return actual.contactPointsDiffToManageDTO(...args)
    },
  }
})

/**
 * Story 3.4 (NG-9023, FR18–FR19): Make primary and the Primary's
 * notifications on `/`, rendered the way `PageFrame` hosts the Section
 * (`renderInPage`, MSW at `/api`). Covers every row of the I/O matrix in
 * `spec-3-4-make-a-phone-primary-and-manage-notifications.md`: eligibility
 * and its reasons, the confirm (copy, focus, Cancel, Escape), the one POST,
 * success and failure with Retry, the footnote, the notifications switch and
 * the per-rule Primary messages.
 */

const LIST = "/api/1h/v2/user/contact-point/list"
const DRAFT_KEY = "pp:draft:v1:demo:42:phone"
const MANAGE = "/api/1h/v2/health/contact-point"

type Wire = Record<string, unknown>
type Lists = Partial<Record<"Mobile" | "Landline", Wire[]>>
type Answer = () => Response | Promise<Response>

const PRIMARY_12 = contactPointWire({ id: 12, value: "+14155512125", label: "Primary", isVerified: true, isNotificationEnabled: true })
const WORK_13 = contactPointWire({ id: 13, value: "+14155550113", label: "Work", isVerified: true, isNotificationEnabled: false })
const WORK_11 = contactPointWire({ id: 11, value: "+14155550111", label: "Work", isVerified: false, isNotificationEnabled: false })
const HOME_14 = contactPointWire({ id: 14, value: "+14155550114", label: "Home", isVerified: false, isNotificationEnabled: false })
const LANDLINE_21 = contactPointWire({ id: 21, value: "+442071838750", type: "Landline", label: "Work", isVerified: false, phoneNumberRegion: "gb" })

/** The "Switch" row: Mobile [Primary 12 (notifications on), Verified Work 13]. */
const SWITCH: Lists = { Mobile: [PRIMARY_12, WORK_13] }
/** After the switch: 13 Primary with notifications on, 12 Old. */
const SWITCHED: Lists = {
  Mobile: [
    { ...PRIMARY_12, label: "Old" },
    { ...WORK_13, label: "Primary", isNotificationEnabled: true },
  ],
}

const ok: Answer = () => new HttpResponse(null, { status: 200 })
const upstream = (message: string, status = 400): Answer => () => HttpResponse.json({ message, code: status }, { status })
const ALREADY_PRIMARY = "Operation failed. Person already has primary contact point from type 'Mobile'."

interface ServerOptions {
  readonly lists: Lists
  /** Replaces the lists once a manage POST succeeds (its refetch). */
  readonly afterSave?: Lists
  /** The manage answers, in order (the last one repeats). */
  readonly manage?: readonly Answer[]
}

/** Answers the lists and the manage POST, recording every list read and manage body. */
function phoneServer({ lists, afterSave, manage = [ok] }: ServerOptions) {
  let current = lists
  const bodies: unknown[] = []
  const reads: string[] = []
  const handlers: HttpHandler[] = [
    http.get(LIST, ({ request }) => {
      const type = new URL(request.url).searchParams.get("type") as "Mobile" | "Landline"
      reads.push(type)
      return HttpResponse.json(current[type] ?? [])
    }),
    http.post(MANAGE, async ({ request }) => {
      bodies.push(await request.json())
      const response = await manage[Math.min(bodies.length, manage.length) - 1]()
      if (response.ok && afterSave) current = afterSave
      return response
    }),
  ]
  /** Changes what the lists answer from now on (another tab or device changed the phones). */
  const setLists = (next: Lists) => {
    current = next
  }
  return { bodies, reads, handlers, setLists }
}

/** Loads each key with a counting loader from the app's default SWR cache (the one `mutateMyself` revalidates). */
function watchAppCache(list: readonly SwrKey[]): Map<string, number> {
  const loads = new Map<string, number>()
  function Probe({ swrKey }: { readonly swrKey: SwrKey }) {
    useSWR(
      swrKey,
      async () => {
        loads.set(JSON.stringify(swrKey), (loads.get(JSON.stringify(swrKey)) ?? 0) + 1)
        return []
      },
      { dedupingInterval: 0 },
    )
    return null
  }
  renderPlain(createElement("div", null, ...list.map((swrKey) => createElement(Probe, { key: JSON.stringify(swrKey), swrKey }))))
  return loads
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Phone" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const heading = (): HTMLElement => screen.getByRole("heading", { level: 2, name: "Phone" })
const isReadView = (): boolean => section().querySelector('[data-slot="section-footer"]') === null
const footnote = (): HTMLElement | null => section().querySelector('[data-slot="phone-footnote"]')
const dialog = (): HTMLElement | null => screen.queryByRole("alertdialog")
/** The read-view rows (table rows or cards), in order. */
const bodyRows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>("tbody tr, li[data-slot='section-table-card']")]
/** The row (table row or card) holding `number`. */
const rowOf = (number: string): HTMLElement => bodyRows().find((row) => row.textContent?.includes(number)) as HTMLElement
const inlineAction = (number: string, name: string | RegExp): HTMLElement | null => within(rowOf(number)).queryByRole("button", { name })
/** The ids an element's `aria-describedby` names, as their text. */
const described = (element: HTMLElement): (string | undefined)[] =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? undefined)

async function render(options: ServerOptions) {
  const server = phoneServer(options)
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
    </>,
    { page: "profile", handlers: server.handlers },
  )
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  // D-A: a write goes out only once the page user is pinned (the safeguard re-reads myself per POST).
  await act(async () => {
    await fetchMyself()
  })
  /** Answers `next` from now on and revalidates both Phone keys in the Section's cache (a window-focus revalidation). */
  const refetch = (next: Lists) =>
    act(async () => {
      server.setLists(next)
      await Promise.all([scoped?.(keys.contactPoints("Mobile")), scoped?.(keys.contactPoints("Landline"))])
    })
  return { ...result, ...server, refetch }
}

async function click(element: HTMLElement) {
  await act(async () => fireEvent.click(element))
}

/** Focuses then presses the row's inline Make primary (the confirm returns focus to what was focused when it opened). */
async function pressMakePrimary(number: string): Promise<HTMLElement> {
  const trigger = inlineAction(number, "Make primary") as HTMLElement
  await act(async () => trigger.focus())
  await click(trigger)
  await waitFor(() => expect(dialog()).not.toBeNull())
  return trigger
}

async function confirm() {
  await click(within(dialog() as HTMLElement).getByRole("button", { name: "Make primary" }))
}

async function openKebab(number: string): Promise<HTMLElement> {
  await act(async () => fireEvent.keyDown(within(section()).getByRole("button", { name: `More actions for ${number}` }), { key: "Enter" }))
  return screen.findByRole("menu")
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 50)))

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  window.localStorage.clear()
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastError).mockClear()
  engine.fail = false
})
afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.classList.remove("dark")
})

describe("PhoneSection: Make primary eligibility (Story 3.4)", () => {
  it("Reasons: a Landline, an unverified Mobile and an unverified Home Mobile are aria-disabled with their reasons; Verify sits beside the unverified one", async () => {
    await render({ lists: { Mobile: [PRIMARY_12, WORK_13, WORK_11, HOME_14], Landline: [LANDLINE_21] } })
    expect(inlineAction("+1 (415) 555-0113", "Make primary")?.getAttribute("aria-disabled")).toBeNull()
    const cases: [string, string][] = [
      ["+44 20 7183 8750", "Landlines can't be primary"],
      ["+1 (415) 555-0111", "Verify this number first"],
      ["+1 (415) 555-0114", "Change the label from Home, then verify this number"],
    ]
    for (const [number, reason] of cases) {
      const action = inlineAction(number, "Make primary") as HTMLElement
      expect(action.getAttribute("aria-disabled"), number).toBe("true")
      expect(described(action), number).toContain(reason)
    }
    // Verify beside "Verify this number first" (inline, before Make primary); none on the Home row.
    const inline = within(rowOf("+1 (415) 555-0111")).getAllByRole("button").map((button) => button.textContent)
    expect(inline.slice(0, 2)).toEqual(["Verify", "Make primary"])
    expect(inlineAction("+1 (415) 555-0114", "Verify")).toBeNull()
    // A disabled one does nothing.
    await click(inlineAction("+1 (415) 555-0111", "Make primary") as HTMLElement)
    await settle()
    expect(dialog()).toBeNull()
  })

  it("the kebab lists it after Verify and before Edit, aria-disabled with the reason as its second line", async () => {
    await render({ lists: { Mobile: [PRIMARY_12, WORK_13, WORK_11] } })
    const menu = await openKebab("+1 (415) 555-0111")
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Verify", "Make primaryVerify this number first", "Edit", "Remove"])
    expect(within(menu).getByRole("menuitem", { name: /Make primary/ }).getAttribute("aria-disabled")).toBe("true")
  })

  it("Not offered: on the Primary row, an id-less row, a repeated id's later occurrence, or a second Primary-labelled row", async () => {
    await render({
      lists: {
        Mobile: [
          PRIMARY_12,
          contactPointWire({ id: null, value: "+14155550130", label: "Work", isVerified: true }),
          contactPointWire({ id: 13, value: "+14155550113", label: "Work", isVerified: true }),
          contactPointWire({ id: 13, value: "+14155550131", label: "Work", isVerified: true }),
          contactPointWire({ id: 15, value: "+14155550115", label: "Primary", isVerified: true }),
        ],
      },
    })
    const offered = ["+1 (415) 551-2125", "+1 (415) 555-0130", "+1 (415) 555-0113", "+1 (415) 555-0131", "+1 (415) 555-0115"].filter(
      (number) => inlineAction(number, "Make primary") !== null,
    )
    expect(offered).toEqual(["+1 (415) 555-0113"])
    const primaryMenu = await openKebab("+1 (415) 551-2125")
    expect(within(primaryMenu).queryByRole("menuitem", { name: /Make primary/ })).toBeNull()
  })

  it("Not offered in edit view (a new row included)", async () => {
    await render({ lists: SWITCH })
    await click(within(section()).getByRole("button", { name: "Add phone" }))
    expect(isReadView()).toBe(false)
    expect(within(section()).queryByRole("button", { name: /Make primary/ })).toBeNull()
    expect(within(section()).queryByRole("button", { name: /More actions/ })).toBeNull()
  })

  it("RC2: with no Verified and no Primary phone, an unverified Mobile is enabled (Home and Landline still aren't)", async () => {
    await render({ lists: { Mobile: [WORK_11, HOME_14], Landline: [LANDLINE_21] } })
    expect(inlineAction("+1 (415) 555-0111", "Make primary")?.getAttribute("aria-disabled")).toBeNull()
    expect(inlineAction("+1 (415) 555-0114", "Make primary")?.getAttribute("aria-disabled")).toBe("true")
    expect(inlineAction("+44 20 7183 8750", "Make primary")?.getAttribute("aria-disabled")).toBe("true")
  })

  it("RC2 looks at every shown phone: a Verified Landline ends the exception", async () => {
    await render({ lists: { Mobile: [WORK_11], Landline: [{ ...LANDLINE_21, isVerified: true }] } })
    expect(inlineAction("+1 (415) 555-0111", "Make primary")?.getAttribute("aria-disabled")).toBe("true")
  })
})

describe("PhoneSection: Make primary confirm and send (Story 3.4)", () => {
  it("Switch: the confirm (copy, focus on Cancel), one POST (13 Primary with notifications on, 12 Old), the refetch, \"Phone saved.\", focus on the h2", async () => {
    const watched = [keys.myself()]
    const loads = watchAppCache(watched)
    await waitFor(() => expect(loads.size).toBe(1))
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { bodies, reads } = await render({
      lists: SWITCH,
      afterSave: SWITCHED,
      manage: [
        async () => {
          await held
          return new HttpResponse(null, { status: 200 })
        },
      ],
    })
    expect(footnote()?.textContent).toBe("Changing your primary phone changes how you sign in.")
    await pressMakePrimary("+1 (415) 555-0113")
    const open = dialog() as HTMLElement
    expect(within(open).getByRole("heading", { name: "This changes how you sign in" })).toBeTruthy()
    expect(open.textContent).toContain("+1 (415) 555-0113 becomes your primary phone and sign-in number. Your current primary is relabeled Old.")
    expect(document.activeElement).toBe(within(open).getByRole("button", { name: "Cancel" }))
    expect(within(open).getAllByRole("button").map((button) => button.textContent)).toEqual(["Cancel", "Make primary"])

    const readsBefore = reads.length
    await confirm()
    // Busy while the POST is out: the dialog stays open and Escape doesn't close it.
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(dialog()?.getAttribute("aria-busy")).toBe("true")
    await act(async () => fireEvent.keyDown(dialog() as HTMLElement, { key: "Escape" }))
    expect(dialog()).not.toBeNull()
    await act(async () => release())

    await waitFor(() => expect(dialog()).toBeNull())
    expect(bodies).toEqual([
      {
        contactPointsToAdd: [],
        contactPointsToUpdate: [
          { id: 13, type: "Mobile", label: "Primary", isNotificationEnabled: true },
          { id: 12, type: "Mobile", label: "Old", isNotificationEnabled: true },
        ],
        contactPointsToRemove: [],
      },
    ])
    expect(reads.slice(readsBefore).toSorted()).toEqual(["Landline", "Mobile"])
    expect(loads.get(JSON.stringify(keys.myself()))).toBe(2)
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
    expect(toastError).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    // 13 first with the Primary chip and "On"; 12 reads "Old".
    const [first, second] = bodyRows()
    expect(first.textContent).toContain("+1 (415) 555-0113")
    expect(first.querySelector('[data-slot="chip"]')?.getAttribute("data-variant")).toBe("primary")
    expect(first.querySelectorAll("td")[4]?.textContent).toBe("On")
    expect(second.textContent).toContain("+1 (415) 551-2125")
    expect(second.querySelector('[data-slot="chip"]')?.textContent).toBe("Old")
    expect(isReadView()).toBe(true)
  })

  it.each<[string, (cancel: HTMLElement) => Promise<void>]>([
    ["Cancel", (cancel) => click(cancel)],
    [
      "Escape",
      (cancel) =>
        act(async () => {
          fireEvent.keyDown(cancel, { key: "Escape" })
        }),
    ],
  ])("%s sends nothing and returns focus to the trigger", async (_case, close) => {
    const { bodies } = await render({ lists: SWITCH })
    const trigger = await pressMakePrimary("+1 (415) 555-0113")
    await close(within(dialog() as HTMLElement).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(dialog()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    await settle()
    expect(bodies).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("the kebab's Make primary opens the same confirm; Cancel returns focus to the kebab", async () => {
    const { bodies } = await render({ lists: SWITCH })
    const menu = await openKebab("+1 (415) 555-0113")
    await act(async () => fireEvent.click(within(menu).getByRole("menuitem", { name: "Make primary" })))
    await waitFor(() => expect(dialog()).not.toBeNull())
    await click(within(dialog() as HTMLElement).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(dialog()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("button", { name: "More actions for +1 (415) 555-0113" })))
    expect(bodies).toEqual([])
  })

  it("RC2: the body has only its first sentence; the update holds only 11", async () => {
    const { bodies } = await render({ lists: { Mobile: [WORK_11] }, afterSave: { Mobile: [{ ...WORK_11, label: "Primary", isNotificationEnabled: true }] } })
    await pressMakePrimary("+1 (415) 555-0111")
    expect((dialog() as HTMLElement).textContent).toContain("+1 (415) 555-0111 becomes your primary phone and sign-in number.")
    expect((dialog() as HTMLElement).textContent).not.toContain("relabeled Old")
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 11, type: "Mobile", label: "Primary", isNotificationEnabled: true }], contactPointsToRemove: [] }])
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
  })

  it("Failure: the dialog closes (focus back on the trigger), the view is unchanged, the mapped message toasts with Retry; both Phone keys and myself refetch first; Retry resends once", async () => {
    const loads = watchAppCache([keys.myself()])
    await waitFor(() => expect(loads.size).toBe(1))
    let readsAtToast = -1
    let myselfAtToast = -1
    vi.mocked(toastError).mockImplementationOnce(() => {
      readsAtToast = reads.length
      myselfAtToast = loads.get(JSON.stringify(keys.myself())) ?? 0
      return { id: "t", dismiss: vi.fn() }
    })
    const { bodies, reads } = await render({ lists: SWITCH, afterSave: SWITCHED, manage: [upstream(ALREADY_PRIMARY), ok] })
    const trigger = await pressMakePrimary("+1 (415) 555-0113")
    const readsBefore = reads.length
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(bodies).toHaveLength(1)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toastError).mock.calls[0][0]).toBe("Your primary phone changed. Check your phones and try again.")
    await waitFor(() => expect(reads.slice(readsBefore).toSorted()).toEqual(["Landline", "Mobile"]))
    // The refetch finished before the toast showed.
    expect(readsAtToast).toBe(readsBefore + 2)
    expect(myselfAtToast).toBe(2)
    // Unchanged: 12 still first and Primary.
    expect(bodyRows()[0].textContent).toContain("+1 (415) 551-2125")
    expect(bodyRows()[0].querySelector('[data-slot="chip"]')?.getAttribute("data-variant")).toBe("primary")
    expect(isReadView()).toBe(true)

    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Phone saved."))
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual(bodies[0])
    expect(dialog()).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    await waitFor(() => expect(bodyRows()[0].textContent).toContain("+1 (415) 555-0113"))
  })

  it("Network: \"Couldn't save phone. Check your connection.\" with Retry", async () => {
    await render({ lists: SWITCH, manage: [() => HttpResponse.error()] })
    await pressMakePrimary("+1 (415) 555-0113")
    await confirm()
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toastError).mock.calls[0][0]).toBe("Couldn't save phone. Check your connection.")
    await waitFor(() => expect(dialog()).toBeNull())
  })

  it("an unmapped failure toasts \"Couldn't save phone.\" (never the upstream text)", async () => {
    await render({ lists: SWITCH, manage: [upstream("Something else.")] })
    await pressMakePrimary("+1 (415) 555-0113")
    await confirm()
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toastError).mock.calls[0][0]).toBe("Couldn't save phone.")
  })

  it("a session end shows nothing (the shell owns it)", async () => {
    await render({ lists: SWITCH, manage: [() => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 })] })
    await pressMakePrimary("+1 (415) 555-0113")
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("a Retry re-checks the latest rows: once the revalidation shows the row unverified (12 still Primary), it sends nothing", async () => {
    const { bodies, setLists } = await render({ lists: SWITCH, manage: [upstream(ALREADY_PRIMARY)] })
    await pressMakePrimary("+1 (415) 555-0113")
    // The failure's refetch shows 13 no longer verified: the engine would still build a body, only the re-check stops it.
    setLists({ Mobile: [PRIMARY_12, { ...WORK_13, isVerified: false }] })
    await confirm()
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(inlineAction("+1 (415) 555-0113", "Make primary")?.getAttribute("aria-disabled")).toBe("true")
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await settle()
    expect(bodies).toHaveLength(1)
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("a confirm whose row stopped being eligible while it was open sends nothing and closes", async () => {
    const { bodies, refetch } = await render({ lists: SWITCH })
    await pressMakePrimary("+1 (415) 555-0113")
    await refetch({ Mobile: [PRIMARY_12, { ...WORK_13, isVerified: false }] })
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    await settle()
    expect(bodies).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("an engine refusal (a programmer error) closes the dialog, sends nothing and toasts \"Couldn't save phone.\"; its Retry only revalidates", async () => {
    const { bodies, reads } = await render({ lists: SWITCH })
    await pressMakePrimary("+1 (415) 555-0113")
    engine.fail = true
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    expect(bodies).toEqual([])
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toastError).mock.calls[0][0]).toBe("Couldn't save phone.")
    const readsBefore = reads.length
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await waitFor(() => expect(reads.slice(readsBefore).toSorted()).toEqual(["Landline", "Mobile"]))
    await settle()
    expect(bodies).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("a late Retry from edit view sends nothing (Make primary is read view only)", async () => {
    const { bodies } = await render({ lists: SWITCH, afterSave: SWITCHED, manage: [upstream(ALREADY_PRIMARY)] })
    await pressMakePrimary("+1 (415) 555-0113")
    await confirm()
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    // Meanwhile the user opened edit view: Make primary is never sent from there.
    await click(within(section()).getByRole("button", { name: "Edit" }))
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await settle()
    expect(bodies).toHaveLength(1)
  })

  it("has no axe violations in light and dark with the confirm open", async () => {
    await render({ lists: SWITCH })
    await pressMakePrimary("+1 (415) 555-0113")
    expect(await axeViolations()).toEqual([])
    document.documentElement.classList.add("dark")
    expect(await axeViolations()).toEqual([])
  })
})

describe("PhoneSection: notifications and the footnote (Story 3.4)", () => {
  const notificationsSwitch = (number: string): HTMLElement => screen.getByRole("switch", { name: `Notifications for ${number}` })
  const save = async () => {
    await click(within(section()).getByRole("button", { name: "Save" }))
  }

  it("RC3: in edit view only the Primary row has a switch, reflecting its setting; the others show \"—\"; the footnote stays", async () => {
    await render({ lists: { Mobile: [PRIMARY_12, WORK_13], Landline: [LANDLINE_21] } })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    expect(within(section()).getAllByRole("switch")).toHaveLength(1)
    expect(notificationsSwitch("+1 (415) 551-2125").getAttribute("aria-checked")).toBe("true")
    const rows = bodyRows()
    for (const row of rows.slice(1)) expect(row.querySelectorAll("td")[4]?.textContent).toBe("—Not applicable")
    expect(footnote()?.textContent).toBe("Changing your primary phone changes how you sign in.")
  })

  it("an unverified Primary gets the switch too", async () => {
    await render({ lists: { Mobile: [{ ...PRIMARY_12, isVerified: false, isNotificationEnabled: false }] } })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    expect(notificationsSwitch("+1 (415) 551-2125").getAttribute("aria-checked")).toBe("false")
  })

  it("Notifications: toggling the Primary's switch off makes the Section dirty; Save sends only that row; the read view shows \"Off\"", async () => {
    const { bodies } = await render({ lists: SWITCH, afterSave: { Mobile: [{ ...PRIMARY_12, isNotificationEnabled: false }, WORK_13] } })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    await click(notificationsSwitch("+1 (415) 551-2125"))
    expect(notificationsSwitch("+1 (415) 551-2125").getAttribute("aria-checked")).toBe("false")
    expect(section().querySelector('[data-slot="section-footer"]')?.textContent).toContain("Unsaved changes")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 12, type: "Mobile", label: "Primary", isNotificationEnabled: false }], contactPointsToRemove: [] }])
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
    await waitFor(() => expect(bodyRows()[0].querySelectorAll("td")[4]?.textContent).toBe("Off"))
  })

  it("toggling off and back on is no change: Save sends nothing", async () => {
    const { bodies } = await render({ lists: SWITCH })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    await click(notificationsSwitch("+1 (415) 551-2125"))
    await click(notificationsSwitch("+1 (415) 551-2125"))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([])
  })

  it("an id-less Primary shows its setting as text (nothing to update)", async () => {
    await render({ lists: { Mobile: [{ ...PRIMARY_12, id: null }] } })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    expect(within(section()).queryByRole("switch")).toBeNull()
    expect(bodyRows()[0].querySelectorAll("td")[4]?.textContent).toBe("On")
  })

  it("the footnote shows below the read table, and not before the lists load", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const server = phoneServer({ lists: SWITCH })
    renderInPage(<PhoneSection />, { page: "profile", handlers: [http.get(LIST, async () => gate.then(() => undefined)), ...server.handlers] })
    expect(frame()?.getAttribute("data-state")).not.toBe("ready")
    expect(footnote()).toBeNull()
    await act(async () => release())
    await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
    const note = footnote() as HTMLElement
    expect(note.className).toContain("text-muted-foreground")
    expect(note.className).toContain("text-body-sm")
    expect(section().querySelector("table")?.compareDocumentPosition(note) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it("while saving, the switch is read-only: aria-readonly and a press changes nothing", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { bodies } = await render({
      lists: SWITCH,
      manage: [
        async () => {
          await gate
          return new HttpResponse(null, { status: 200 })
        },
      ],
    })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    await click(notificationsSwitch("+1 (415) 551-2125"))
    await save()
    await waitFor(() => expect(bodies).toHaveLength(1))
    const toggle = notificationsSwitch("+1 (415) 551-2125")
    expect(toggle.getAttribute("aria-readonly")).toBe("true")
    expect(toggle.getAttribute("aria-checked")).toBe("false")
    await click(toggle)
    expect(notificationsSwitch("+1 (415) 551-2125").getAttribute("aria-checked")).toBe("false")
    await act(async () => release())
    await waitFor(() => expect(isReadView()).toBe(true))
  })

  /**
   * Stores a real draft (Work 13 relabelled Personal), rewrites its rows with
   * `edit`, then remounts the Section and restores it.
   */
  async function restoreEditedDraft(edit: (row: Record<string, unknown>) => Record<string, unknown>) {
    const first = await render({ lists: SWITCH })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    const work = bodyRows().find((row) => row.querySelector('input[value="+1 (415) 555-0113"]')) as HTMLElement
    await act(async () => fireEvent.keyDown(within(work).getByRole("combobox", { name: "Label" }), { key: "Enter" }))
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Personal" })))
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    // Unmounted first, so nothing writes the draft again over the rewrite.
    first.unmount()
    sessionEvents.reset()
    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}") as { values: { rows: Record<string, unknown>[] } }
    stored.values.rows = stored.values.rows.map(edit)
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(stored))

    const second = await render({ lists: SWITCH })
    await click(await within(section()).findByRole("button", { name: /^(Restore|Keep mine)$/ }))
    const keepMine = within(section()).queryByRole("button", { name: "Keep mine" })
    if (keepMine) await click(keepMine)
    await waitFor(() => expect(isReadView()).toBe(false))
    return second
  }

  it("a draft stored before Story 3.4 (no notifications): the switch reads the saved On, and Save sends no update for the Primary", async () => {
    const { bodies } = await restoreEditedDraft((row) => {
      const copy = { ...row }
      delete copy.notifications
      return copy
    })
    expect(notificationsSwitch("+1 (415) 551-2125").getAttribute("aria-checked")).toBe("true")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 13, type: "Mobile", label: "Personal", isNotificationEnabled: false }], contactPointsToRemove: [] }])
  })

  it("a restored draft never changes a non-Primary row's notifications (it has no control for them)", async () => {
    const { bodies } = await restoreEditedDraft((row) => (row.id === 13 ? { ...row, notifications: true } : row))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 13, type: "Mobile", label: "Personal", isNotificationEnabled: false }], contactPointsToRemove: [] }])
  })

  const BACKEND_RULES: [string, string][] = [
    ["Operation failed. In order to delete a primary contact of type 'Mobile', please update another one as primary.", "Make another phone primary first"],
    ["Operation failed. In order to downgrade a primary contact point from type 'Mobile', you must update another one as primary.", "Make another phone primary before you change this one's label"],
    ["Operation failed. You can provide only one replacement as primary contact from type 'Landline'.", "Only one phone can replace your primary phone"],
    ["Operation failed. You can create or update one primary contact point per type.", "Only one phone can be primary"],
    ["Operation failed. You aren't allowed to create a Primary contact point from types '[MOBILE, EMAIL]'.", "A new phone can't be primary. Save it, then make it primary."],
    [ALREADY_PRIMARY, "Your primary phone changed. Check your phones and try again."],
    ["Operation failed. You can't update contact point with id '12' as primary, because it's not verified.", "Verify this number first"],
  ]

  it.each(BACKEND_RULES)("Messages: %j on save shows %j at Section level", async (message, copy) => {
    await render({ lists: SWITCH, manage: [upstream(message)] })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    await click(notificationsSwitch("+1 (415) 551-2125"))
    await save()
    await waitFor(() => expect(section().querySelector('[data-slot~="inline-banner"]')?.textContent).toContain(copy))
    expect(isReadView()).toBe(false)
  })

  it("has no axe violations in light and dark in edit view with the switch", async () => {
    await render({ lists: { Mobile: [PRIMARY_12, WORK_13], Landline: [LANDLINE_21] } })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    expect(await axeViolations()).toEqual([])
    document.documentElement.classList.add("dark")
    expect(await axeViolations()).toEqual([])
  })
})
