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
import { EmailSection } from "."

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
 * Story 3.6 (NG-9024, FR22–FR23): Make primary and the Primary's
 * notifications for emails on `/`, rendered the way `PageFrame` hosts the
 * Section (`renderInPage`, MSW at `/api`). Covers the "Switch", "Reasons",
 * "In use" and "Notifications" rows of the I/O matrix in
 * `spec-3-6-verify-emails-make-an-email-primary-and-manage-notifications.md`:
 * eligibility and its reasons, the confirm (copy, focus, Cancel, Escape), the
 * one POST, success and failure with Retry, the switch and the per-rule
 * Primary messages.
 */

const LIST = "/api/1h/v2/user/contact-point/list"
const DRAFT_KEY = "pp:draft:v1:demo:42:email"
const MANAGE = "/api/1h/v2/health/contact-point"

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

const email = (overrides: Wire): Wire => contactPointWire({ type: "Email", phoneNumberRegion: null, isNotificationEnabled: false, ...overrides })

const PRIMARY_42 = email({ id: 42, value: "ann@example.com", label: "Primary", isVerified: true, isNotificationEnabled: true })
const WORK_41 = email({ id: 41, value: "ann@work.example", label: "Work", isVerified: true })
const OTHER_45 = email({ id: 45, value: "ann@other.example", label: "Work", isVerified: false })
const HOME_43 = email({ id: 43, value: "ann@home.example", label: "Home", isVerified: false })

/** The "Switch" row: [Primary 42 (notifications on), Verified Work 41]. */
const SWITCH: Wire[] = [PRIMARY_42, WORK_41]
/** After the switch: 41 Primary with notifications on, 42 Old. */
const SWITCHED: Wire[] = [
  { ...PRIMARY_42, label: "Old" },
  { ...WORK_41, label: "Primary", isNotificationEnabled: true },
]

const ok: Answer = () => new HttpResponse(null, { status: 200 })
const upstream = (message: string, status = 400): Answer => () => HttpResponse.json({ message, code: status }, { status })
const IN_USE = "User with email 'ann@work.example' already exists."

interface ServerOptions {
  readonly list: Wire[]
  /** Replaces the list once a manage POST succeeds (its refetch). */
  readonly afterSave?: Wire[]
  /** The manage answers, in order (the last one repeats). */
  readonly manage?: readonly Answer[]
}

/** Answers the Email list (`[]` for any other type) and the manage POST, recording every Email read and manage body. */
function emailServer({ list, afterSave, manage = [ok] }: ServerOptions) {
  let current = list
  const bodies: unknown[] = []
  const reads: string[] = []
  const handlers: HttpHandler[] = [
    http.get(LIST, ({ request }) => {
      const type = new URL(request.url).searchParams.get("type") ?? ""
      if (type !== "Email") return HttpResponse.json([])
      reads.push(type)
      return HttpResponse.json(current)
    }),
    http.post(MANAGE, async ({ request }) => {
      bodies.push(await request.json())
      const response = await manage[Math.min(bodies.length, manage.length) - 1]()
      if (response.ok && afterSave) current = afterSave
      return response
    }),
  ]
  /** Changes what the list answers from now on (another tab or device changed the emails). */
  const setList = (next: Wire[]) => {
    current = next
  }
  return { bodies, reads, handlers, setList }
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

const section = (): HTMLElement => screen.getByRole("region", { name: "Email" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const heading = (): HTMLElement => screen.getByRole("heading", { level: 2, name: "Email" })
const isReadView = (): boolean => section().querySelector('[data-slot="section-footer"]') === null && within(section()).queryByRole("button", { name: "Edit" }) !== null
const dialog = (): HTMLElement | null => screen.queryByRole("alertdialog")
/** The read-view rows (table rows or cards), in order. */
const bodyRows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>("tbody tr, li[data-slot='section-table-card']")]
/** The row (table row or card) holding `address`. */
const rowOf = (address: string): HTMLElement => bodyRows().find((row) => row.textContent?.includes(address)) as HTMLElement
const inlineAction = (address: string, name: string | RegExp): HTMLElement | null => within(rowOf(address)).queryByRole("button", { name })
/** The ids an element's `aria-describedby` names, as their text. */
const described = (element: HTMLElement): (string | undefined)[] =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? undefined)

async function render(options: ServerOptions) {
  const server = emailServer(options)
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
    { page: "profile", handlers: server.handlers },
  )
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  // D-A: a write goes out only once the page user is pinned (the safeguard re-reads myself per POST).
  await act(async () => {
    await fetchMyself()
  })
  /** Answers `next` from now on and revalidates the Email key in the Section's cache (a window-focus revalidation). */
  const refetch = (next: Wire[]) =>
    act(async () => {
      server.setList(next)
      await scoped?.(keys.contactPoints("Email"))
    })
  return { ...result, ...server, refetch }
}

async function click(element: HTMLElement) {
  await act(async () => fireEvent.click(element))
}

/** Focuses then presses the row's inline Make primary (the confirm returns focus to what was focused when it opened). */
async function pressMakePrimary(address: string): Promise<HTMLElement> {
  const trigger = inlineAction(address, "Make primary") as HTMLElement
  await act(async () => trigger.focus())
  await click(trigger)
  await waitFor(() => expect(dialog()).not.toBeNull())
  return trigger
}

async function confirm() {
  await click(within(dialog() as HTMLElement).getByRole("button", { name: "Make primary" }))
}

async function openKebab(address: string): Promise<HTMLElement> {
  await act(async () => fireEvent.keyDown(within(section()).getByRole("button", { name: `More actions for ${address}` }), { key: "Enter" }))
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

describe("EmailSection: Make primary eligibility (Story 3.6)", () => {
  it("Reasons: an unverified email and an unverified Home email are aria-disabled with their reasons; Verify sits beside the first", async () => {
    await render({ list: [PRIMARY_42, WORK_41, OTHER_45, HOME_43] })
    expect(inlineAction("ann@work.example", "Make primary")?.getAttribute("aria-disabled")).toBeNull()
    const cases: [string, string][] = [
      ["ann@other.example", "Verify this email first"],
      ["ann@home.example", "Change the label from Home, then verify this email"],
    ]
    for (const [address, reason] of cases) {
      const action = inlineAction(address, "Make primary") as HTMLElement
      expect(action.getAttribute("aria-disabled"), address).toBe("true")
      expect(described(action), address).toContain(reason)
    }
    // Verify beside "Verify this email first" (inline, before Make primary); none on the Home row.
    // The row actions (the copy button, design refresh, sits in the value cell before them).
    const inline = within(rowOf("ann@other.example")).getAllByRole("button").filter((button) => button.dataset.slot !== "copy-button").map((button) => button.textContent)
    expect(inline.slice(0, 2)).toEqual(["Verify", "Make primary"])
    expect(inlineAction("ann@home.example", "Verify")).toBeNull()
    // A disabled one does nothing.
    await click(inlineAction("ann@other.example", "Make primary") as HTMLElement)
    await settle()
    expect(dialog()).toBeNull()
  })

  it("the kebab lists it after Verify and before Edit, aria-disabled with the reason as its second line", async () => {
    await render({ list: [PRIMARY_42, OTHER_45] })
    const menu = await openKebab("ann@other.example")
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Verify", "Make primaryVerify this email first", "Edit", "Remove"])
    expect(within(menu).getByRole("menuitem", { name: /Make primary/ }).getAttribute("aria-disabled")).toBe("true")
  })

  it("Not offered: on the Primary row, an id-less row, a repeated id's later occurrence, or a second Primary-labelled row", async () => {
    await render({
      list: [
        PRIMARY_42,
        email({ id: null, value: "none@example.com", label: "Work", isVerified: true }),
        WORK_41,
        email({ id: 41, value: "again@example.com", label: "Work", isVerified: true }),
        email({ id: 46, value: "legacy@example.com", label: "Primary", isVerified: true }),
      ],
    })
    const offered = ["ann@example.com", "none@example.com", "ann@work.example", "again@example.com", "legacy@example.com"].filter(
      (address) => inlineAction(address, "Make primary") !== null,
    )
    expect(offered).toEqual(["ann@work.example"])
    const primaryMenu = await openKebab("ann@example.com")
    expect(within(primaryMenu).queryByRole("menuitem", { name: /Make primary/ })).toBeNull()
  })

  it("Not offered in edit view (a new row included)", async () => {
    await render({ list: SWITCH })
    await click(within(section()).getByRole("button", { name: "Add email" }))
    expect(isReadView()).toBe(false)
    expect(within(section()).queryByRole("button", { name: /Make primary/ })).toBeNull()
    expect(within(section()).queryByRole("button", { name: /More actions/ })).toBeNull()
  })

  it("no exception for emails: with no Verified and no Primary email, an unverified one stays disabled", async () => {
    await render({ list: [OTHER_45] })
    const action = inlineAction("ann@other.example", "Make primary") as HTMLElement
    expect(action.getAttribute("aria-disabled")).toBe("true")
    expect(described(action)).toContain("Verify this email first")
  })
})

describe("EmailSection: Make primary confirm and send (Story 3.6)", () => {
  it("Switch: the confirm (copy, focus on Cancel), one POST (41 Primary with notifications on, 42 Old), the refetch, \"Email saved.\", focus on the h2", async () => {
    const loads = watchAppCache([keys.myself()])
    await waitFor(() => expect(loads.size).toBe(1))
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { bodies, reads } = await render({
      list: SWITCH,
      afterSave: SWITCHED,
      manage: [
        async () => {
          await held
          return new HttpResponse(null, { status: 200 })
        },
      ],
    })
    await pressMakePrimary("ann@work.example")
    const open = dialog() as HTMLElement
    expect(within(open).getByRole("heading", { name: "This changes how you sign in" })).toBeTruthy()
    expect(open.textContent).toContain("ann@work.example becomes your primary email and sign-in email. Your current primary is relabeled Old.")
    // A long address has no spaces to break at: the body wraps anywhere (the confirm fits at 360 px).
    const body = open.querySelector('[data-slot="make-primary-body"]') as HTMLElement
    expect(body.className).toContain("break-words")
    expect(body.textContent).toBe("ann@work.example becomes your primary email and sign-in email. Your current primary is relabeled Old.")
    expect(document.activeElement).toBe(within(open).getByRole("button", { name: "Cancel" }))
    expect(within(open).getAllByRole("button").map((button) => button.textContent)).toEqual(["Cancel", "Make primary"])

    const readsBefore = reads.length
    await confirm()
    // Busy while the POST is out: the dialog stays open.
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(dialog()?.getAttribute("aria-busy")).toBe("true")
    await act(async () => release())

    await waitFor(() => expect(dialog()).toBeNull())
    expect(bodies).toEqual([
      {
        contactPointsToAdd: [],
        contactPointsToUpdate: [
          { id: 41, type: "Email", label: "Primary", isNotificationEnabled: true },
          { id: 42, type: "Email", label: "Old", isNotificationEnabled: true },
        ],
        contactPointsToRemove: [],
      },
    ])
    expect(reads.slice(readsBefore)).toEqual(["Email"])
    expect(loads.get(JSON.stringify(keys.myself()))).toBe(2)
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
    expect(toastError).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    // 41 first with the Primary chip and "On"; 42 reads "Old".
    const [first, second] = bodyRows()
    expect(first.textContent).toContain("ann@work.example")
    expect(first.querySelector('[data-slot="chip"]')?.getAttribute("data-variant")).toBe("primary")
    expect(first.querySelectorAll("td")[3]?.textContent).toBe("On")
    expect(second.textContent).toContain("ann@example.com")
    expect(second.querySelector('[data-slot="chip"]')?.textContent).toBe("Old")
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
    const { bodies } = await render({ list: SWITCH })
    const trigger = await pressMakePrimary("ann@work.example")
    await close(within(dialog() as HTMLElement).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(dialog()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    await settle()
    expect(bodies).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("the kebab's Make primary opens the same confirm; Cancel returns focus to the kebab", async () => {
    const { bodies } = await render({ list: SWITCH })
    const menu = await openKebab("ann@work.example")
    await act(async () => fireEvent.click(within(menu).getByRole("menuitem", { name: "Make primary" })))
    await waitFor(() => expect(dialog()).not.toBeNull())
    await click(within(dialog() as HTMLElement).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(dialog()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("button", { name: "More actions for ann@work.example" })))
    expect(bodies).toEqual([])
  })

  it("with no current Primary the body has only its first sentence; the update holds only 41", async () => {
    const { bodies } = await render({ list: [WORK_41], afterSave: [{ ...WORK_41, label: "Primary", isNotificationEnabled: true }] })
    await pressMakePrimary("ann@work.example")
    expect((dialog() as HTMLElement).textContent).toContain("ann@work.example becomes your primary email and sign-in email.")
    expect((dialog() as HTMLElement).textContent).not.toContain("relabeled Old")
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 41, type: "Email", label: "Primary", isNotificationEnabled: true }], contactPointsToRemove: [] }])
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
  })

  it("In use: the 400 toasts \"This email is used by another account. Choose a different one.\" with Retry; the view is unchanged; the keys refetch first", async () => {
    const loads = watchAppCache([keys.myself()])
    await waitFor(() => expect(loads.size).toBe(1))
    let readsAtToast = -1
    vi.mocked(toastError).mockImplementationOnce(() => {
      readsAtToast = reads.length
      return { id: "t", dismiss: vi.fn() }
    })
    const { bodies, reads } = await render({ list: SWITCH, afterSave: SWITCHED, manage: [upstream(IN_USE), ok] })
    const trigger = await pressMakePrimary("ann@work.example")
    const readsBefore = reads.length
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(bodies).toHaveLength(1)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(vi.mocked(toastError).mock.calls[0][0]).toBe("This email is used by another account. Choose a different one.")
    // The refetch (the Email key and myself) finished before the toast showed.
    expect(readsAtToast).toBe(readsBefore + 1)
    expect(loads.get(JSON.stringify(keys.myself()))).toBe(2)
    // Unchanged: 42 still first and Primary, 41 still Work.
    expect(bodyRows()[0].textContent).toContain("ann@example.com")
    expect(bodyRows()[0].querySelector('[data-slot="chip"]')?.getAttribute("data-variant")).toBe("primary")
    expect(rowOf("ann@work.example").querySelector('[data-slot="chip"]')?.textContent).toBe("Work")
    expect(isReadView()).toBe(true)

    // Retry: no confirm, the same body, then the success.
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Email saved."))
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual(bodies[0])
    expect(dialog()).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    await waitFor(() => expect(bodyRows()[0].textContent).toContain("ann@work.example"))
  })

  it.each<[string, Answer, string]>([
    ["an Email Primary rule", upstream("Operation failed. Person already has primary contact point from type 'Email'."), "Your primary email changed. Check your email addresses and try again."],
    ["the unverified rule", upstream("Operation failed. You can't update contact point with id '41' as primary, because it's not verified."), "Verify this email first"],
    ["a network failure", () => HttpResponse.error(), "Couldn't save email. Check your connection."],
    ["an unmapped failure (never the upstream text)", upstream("Something else."), "Couldn't save email."],
  ])("Failure (%s) toasts %j", async (_case, answer, text) => {
    await render({ list: SWITCH, manage: [answer] })
    await pressMakePrimary("ann@work.example")
    await confirm()
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toastError).mock.calls[0][0]).toBe(text)
    await waitFor(() => expect(dialog()).toBeNull())
  })

  it("a session end shows nothing (the shell owns it)", async () => {
    await render({ list: SWITCH, manage: [() => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 })] })
    await pressMakePrimary("ann@work.example")
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("a Retry re-checks the latest rows: once the revalidation shows the row unverified, it sends nothing", async () => {
    const { bodies, setList } = await render({ list: SWITCH, manage: [upstream(IN_USE)] })
    await pressMakePrimary("ann@work.example")
    setList([PRIMARY_42, { ...WORK_41, isVerified: false }])
    await confirm()
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(inlineAction("ann@work.example", "Make primary")?.getAttribute("aria-disabled")).toBe("true")
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await settle()
    expect(bodies).toHaveLength(1)
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("a late Retry from edit view sends nothing (Make primary is read view only)", async () => {
    const { bodies } = await render({ list: SWITCH, afterSave: SWITCHED, manage: [upstream(IN_USE)] })
    await pressMakePrimary("ann@work.example")
    await confirm()
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    // Meanwhile the user opened edit view: Make primary is never sent from there.
    await click(within(section()).getByRole("button", { name: "Edit" }))
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await settle()
    expect(bodies).toHaveLength(1)
  })

  it("a confirm whose row stopped being eligible while it was open sends nothing and closes", async () => {
    const { bodies, refetch } = await render({ list: SWITCH })
    await pressMakePrimary("ann@work.example")
    await refetch([PRIMARY_42, { ...WORK_41, isVerified: false }])
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    await settle()
    expect(bodies).toEqual([])
    expect(toastError).not.toHaveBeenCalled()
  })

  it("an engine refusal (a programmer error) sends nothing and toasts \"Couldn't save email.\"; its Retry only revalidates", async () => {
    const { bodies, reads } = await render({ list: SWITCH })
    await pressMakePrimary("ann@work.example")
    engine.fail = true
    await confirm()
    await waitFor(() => expect(dialog()).toBeNull())
    expect(bodies).toEqual([])
    expect(vi.mocked(toastError).mock.calls[0][0]).toBe("Couldn't save email.")
    const readsBefore = reads.length
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await waitFor(() => expect(reads.length).toBe(readsBefore + 1))
    await settle()
    expect(bodies).toEqual([])
  })

  it("has no axe violations in light and dark with the confirm open", async () => {
    await render({ list: SWITCH })
    await pressMakePrimary("ann@work.example")
    expect(await axeViolations()).toEqual([])
    document.documentElement.classList.add("dark")
    expect(await axeViolations()).toEqual([])
  })
})

describe("EmailSection: notifications (Story 3.6)", () => {
  const notificationsSwitch = (address: string): HTMLElement => screen.getByRole("switch", { name: `Notifications for ${address}` })
  const save = async () => {
    await click(within(section()).getByRole("button", { name: "Save" }))
  }

  it("RC3: in edit view only the Primary row has a switch, reflecting its setting; the others show \"—\"", async () => {
    await render({ list: [PRIMARY_42, WORK_41, HOME_43] })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    expect(within(section()).getAllByRole("switch")).toHaveLength(1)
    expect(notificationsSwitch("ann@example.com").getAttribute("aria-checked")).toBe("true")
    for (const row of bodyRows().slice(1)) expect(row.querySelectorAll("td")[3]?.textContent).toBe("—Not applicable")
  })

  it("Notifications: switching the Primary off; Save sends only 42 with notifications off; the read view shows \"Off\"", async () => {
    const { bodies } = await render({ list: SWITCH, afterSave: [{ ...PRIMARY_42, isNotificationEnabled: false }, WORK_41] })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    await click(notificationsSwitch("ann@example.com"))
    expect(notificationsSwitch("ann@example.com").getAttribute("aria-checked")).toBe("false")
    expect(section().querySelector('[data-slot="section-footer"]')?.textContent).toContain("Unsaved changes")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 42, type: "Email", label: "Primary", isNotificationEnabled: false }], contactPointsToRemove: [] }])
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
    await waitFor(() => expect(bodyRows()[0].querySelectorAll("td")[3]?.textContent).toBe("Off"))
  })

  it("toggling off and back on is no change: Save sends nothing", async () => {
    const { bodies } = await render({ list: SWITCH })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    await click(notificationsSwitch("ann@example.com"))
    await click(notificationsSwitch("ann@example.com"))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([])
  })

  it("an id-less Primary shows its setting as text (nothing to update)", async () => {
    await render({ list: [{ ...PRIMARY_42, id: null }] })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    expect(within(section()).queryByRole("switch")).toBeNull()
    expect(bodyRows()[0].querySelectorAll("td")[3]?.textContent).toBe("On")
  })

  /** Stores a real draft (Work 41 relabelled Personal), rewrites its rows with `edit`, then remounts the Section and restores it. */
  async function restoreEditedDraft(edit: (row: Record<string, unknown>) => Record<string, unknown>, list: Wire[] = SWITCH) {
    const first = await render({ list: SWITCH })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    const work = bodyRows().find((row) => row.querySelector('input[value="ann@work.example"]')) as HTMLElement
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

    const second = await render({ list })
    await click(await within(section()).findByRole("button", { name: /^(Restore|Keep mine)$/ }))
    const keepMine = within(section()).queryByRole("button", { name: "Keep mine" })
    if (keepMine) await click(keepMine)
    await waitFor(() => expect(isReadView()).toBe(false))
    return second
  }

  it("a draft stored before Story 3.6 (no notifications): the switch reads the saved On, and Save sends no update for the Primary", async () => {
    const { bodies } = await restoreEditedDraft((row) => {
      const copy = { ...row }
      delete copy.notifications
      return copy
    })
    expect(notificationsSwitch("ann@example.com").getAttribute("aria-checked")).toBe("true")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 41, type: "Email", label: "Personal", isNotificationEnabled: false }], contactPointsToRemove: [] }])
  })

  it("a restored draft never changes a non-Primary row's notifications (it has no control for them)", async () => {
    const { bodies } = await restoreEditedDraft((row) => (row.id === 41 ? { ...row, notifications: true } : row))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ contactPointsToAdd: [], contactPointsToUpdate: [{ id: 41, type: "Email", label: "Personal", isNotificationEnabled: false }], contactPointsToRemove: [] }])
  })

  it("a stale draft stored before 41 was made Primary elsewhere never turns the new Primary's notifications off", async () => {
    const { bodies } = await restoreEditedDraft((row) => (row.id === 41 ? { ...row, label: "Work", notifications: false } : row), SWITCHED)
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    // No notifications change for 41 (nor a label change for either row: Make primary owns them).
    expect(bodies).toEqual([])
  })

  it.each<[string, string]>([
    ["Operation failed. In order to downgrade a primary contact point from type 'Email', you must update another one as primary.", "Make another email primary before you change this one's label"],
    ["Operation failed. You can create or update one primary contact point per type.", "Only one email can be primary"],
  ])("Messages: %j on save shows %j at Section level", async (message, copy) => {
    await render({ list: SWITCH, manage: [upstream(message)] })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    await click(notificationsSwitch("ann@example.com"))
    await save()
    await waitFor(() => expect(section().querySelector('[data-slot~="inline-banner"]')?.textContent).toContain(copy))
    expect(isReadView()).toBe(false)
  })

  it("has no axe violations in light and dark in edit view with the switch", async () => {
    await render({ list: [PRIMARY_42, WORK_41, HOME_43] })
    await click(within(section()).getByRole("button", { name: "Edit" }))
    expect(await axeViolations()).toEqual([])
    document.documentElement.classList.add("dark")
    expect(await axeViolations()).toEqual([])
  })
})
