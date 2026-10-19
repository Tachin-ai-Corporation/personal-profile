import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type HttpHandler } from "msw"
import { useEffect } from "react"
import { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runSaveAll, toastError, toastSuccess } from "@/features/shell"
import { fetchMyself, keys } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { contactPointWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { EmailSection } from "."

// The Section's own toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// Save-then-verify flows take up to ~2 s here and several times that on a loaded CI runner. A timed-out
// test leaves its `act` scope open, and every later `renderInPage` in the file then throws "the Section
// registry was not mounted", so this file gets more than the default 5 s.
vi.setConfig({ testTimeout: 20_000 })

/**
 * Story 3.6 (NG-9024, FR21): verify emails on `/`, rendered the way
 * `PageFrame` hosts the Section (`renderInPage`, MSW at `/api`). Covers the
 * "Auto-verify" and "Manual verify" rows of the I/O matrix in
 * `spec-3-6-verify-emails-make-an-email-primary-and-manage-notifications.md`:
 * the auto-verify inside `save()`, the send state held by the Section
 * (countdown, send error, cooldown), the read view's Verify / Resend
 * verification action, the announcement and the network toast.
 */

const LIST = "/api/1h/v2/user/contact-point/list"
const MANAGE = "/api/1h/v2/health/contact-point"
const VERIFY = "/api/1h/v2/health/contact-point/verify"
const COOLDOWN = "There is already a pending verification for Contact 'ann@work.example' submitted within the last 60 minutes."
const COOLDOWN_HELP = "A link was already sent in the last hour. Check your email."

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

const email = (overrides: Wire): Wire => contactPointWire({ type: "Email", phoneNumberRegion: null, isNotificationEnabled: false, ...overrides })

/** Email [Work 41 (unverified), Primary 42 (verified, notifications on), Home 43 (unverified)]: shown 42, 41, 43. */
const EMAILS: Wire[] = [
  email({ id: 41, value: "ann@work.example", label: "Work", isVerified: false }),
  email({ id: 42, value: "ann@example.com", label: "Primary", isVerified: true, isNotificationEnabled: true }),
  email({ id: 43, value: "ann@home.example", label: "Home", isVerified: false }),
]

/** A saved email as the list answers it after the save: `id`, addressed from it, unverified Personal by default. */
const added = (id: number, overrides: Wire = {}): Wire => email({ id, value: `user${id}@example.com`, label: "Personal", isVerified: false, ...overrides })

const verifyOk = (contactPointIdsWithSendError: number[] = []): Answer => () =>
  HttpResponse.json({ success: contactPointIdsWithSendError.length === 0, contactPointIdsWithSendError })

interface ServerOptions {
  /** The Email list as answered now; `afterSave` replaces it once the manage POST succeeds (its refetch). */
  readonly list: Wire[]
  readonly afterSave?: Wire[]
  /** The verify answers, in order (the last one repeats). */
  readonly verify?: readonly Answer[]
}

/** Answers the Email list (`[]` for any other type), the manage POST (200) and the verify POST, recording every write in order. */
function emailServer({ list, afterSave, verify = [verifyOk()] }: ServerOptions) {
  let current = list
  const manage: unknown[] = []
  const verifies: unknown[] = []
  const writes: string[] = []
  const handlers: HttpHandler[] = [
    http.get(LIST, ({ request }) => HttpResponse.json(new URL(request.url).searchParams.get("type") === "Email" ? current : [])),
    http.post(MANAGE, async ({ request }) => {
      manage.push(await request.json())
      writes.push("manage")
      if (afterSave) current = afterSave
      return new HttpResponse(null, { status: 200 })
    }),
    http.post(VERIFY, async ({ request }) => {
      verifies.push(await request.json())
      writes.push("verify")
      return verify[Math.min(verifies.length, verify.length) - 1]()
    }),
  ]
  const setList = (next: Wire[]) => {
    current = next
  }
  return { manage, verifies, writes, handlers, setList }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Email" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const isReadView = (): boolean => section().querySelector('[data-slot="section-footer"]') === null
const liveStatus = (): HTMLElement => section().querySelector('[data-slot="live-status"]') as HTMLElement
/** The read-view row (table row or card) holding `address`. */
const rowOf = (address: string): HTMLElement =>
  [...section().querySelectorAll<HTMLElement>("tbody tr, li[data-slot='section-table-card']")].find((row) => row.textContent?.includes(address)) as HTMLElement
/** The Status cell's text of the row holding `address` (a card's cell without its "Status: " label). */
const statusOf = (address: string): string => {
  const row = rowOf(address)
  const cell = row.querySelector('[data-column="status"]') ?? row.querySelectorAll("td")[2]
  return (cell?.textContent ?? "").replace(/^Status: /, "")
}
const inlineAction = (address: string, name: string | RegExp): HTMLElement | null => within(rowOf(address)).queryByRole("button", { name })

async function render(options: ServerOptions = { list: EMAILS }) {
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
  /** Answers `next` from now on and revalidates the Email key in the Section's cache (what a window-focus revalidation does). */
  const refetch = (next: Wire[]) =>
    act(async () => {
      server.setList(next)
      await scoped?.(keys.contactPoints("Email"))
    })
  /** Puts `rows` in the Section's cache without a request (a revalidation landing meanwhile). */
  const putList = (rows: Wire[]) =>
    act(async () => {
      await scoped?.(keys.contactPoints("Email"), rows.map((row) => ({ ...row })), { revalidate: false })
    })
  return { ...result, ...server, refetch, putList }
}

async function click(element: HTMLElement) {
  await act(async () => fireEvent.click(element))
}

/** Opens a Select and picks the option named `name`. */
async function pick(trigger: HTMLElement, name: string | RegExp) {
  await act(async () => fireEvent.keyDown(trigger, { key: "Enter" }))
  const option = await screen.findByRole("option", { name })
  await act(async () => fireEvent.click(option))
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
}

/** Adds a new row and fills it (the header's Add email in read view, the footer's Add row while editing). */
async function addEmail(address: string, label: string) {
  const footer = section().querySelector<HTMLElement>('[data-slot="section-footer"]')
  await click(footer ? within(footer).getByRole("button", { name: "Add row" }) : within(section()).getByRole("button", { name: "Add email" }))
  const rows = section().querySelectorAll<HTMLElement>('[data-state="new"]')
  const row = rows[rows.length - 1]
  await act(async () => fireEvent.change(within(row).getByRole("textbox", { name: "Email address" }), { target: { value: address } }))
  await pick(within(row).getByRole("combobox", { name: "Label" }), label)
}

async function save() {
  await click(within(section()).getByRole("button", { name: "Save" }))
  // Loading also has no footer: wait for the completed save, after auto-verification.
  await waitFor(() => expect(within(section()).getByRole("button", { name: "Edit" })).toBeTruthy())
}

async function openKebab(address: string): Promise<HTMLElement> {
  await act(async () => fireEvent.keyDown(within(section()).getByRole("button", { name: `More actions for ${address}` }), { key: "Enter" }))
  return screen.findByRole("menu")
}

/** Every non-empty text the live region took, in order. */
function watchAnnouncements(): string[] {
  const seen: string[] = []
  const observer = new MutationObserver(() => {
    const text = liveStatus().textContent ?? ""
    if (text !== "") seen.push(text)
  })
  observer.observe(liveStatus(), { childList: true, characterData: true, subtree: true })
  return seen
}

/** A clock `advance(ms)` moves ahead: `Date.now` is shifted, the countdown's real 250 ms tick reads it. */
function shiftClock() {
  const realNow = Date.now.bind(Date)
  let offset = 0
  vi.spyOn(Date, "now").mockImplementation(() => realNow() + offset)
  return async (ms: number) => {
    offset += ms
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)))
  }
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 50)))

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  window.localStorage.clear()
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastError).mockClear()
})
afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.classList.remove("dark")
})

describe("EmailSection: auto-verify after a save (Story 3.6)", () => {
  it("Auto-verify: the manage POST, then one verify for the new unverified email; \"Email saved.\"; the row counts down; \"Link sent\" announced once", async () => {
    const { manage, verifies, writes } = await render({ list: EMAILS, afterSave: [...EMAILS, added(44, { value: "b@x.com" })] })
    const announced = watchAnnouncements()
    await addEmail("b@x.com", "Personal")
    await save()
    expect(manage).toEqual([{ contactPointsToAdd: [{ value: "b@x.com", type: "Email", label: "Personal", isNotificationEnabled: false }], contactPointsToUpdate: [], contactPointsToRemove: [] }])
    expect(verifies).toEqual([{ contactPointIds: [44] }])
    expect(writes).toEqual(["manage", "verify"])
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
    expect(toastError).not.toHaveBeenCalled()
    await waitFor(() => expect(statusOf("b@x.com")).toBe("Link sent · Resend in 60 s"))
    expect(rowOf("b@x.com").querySelector('[data-slot="status-badge"]')?.getAttribute("data-status")).toBe("pending")
    // The other unverified email was saved before: never verified by the save.
    expect(statusOf("ann@work.example")).toBe("Not verified")
    expect(announced).toEqual(["Link sent"])
  })

  it("Excluded: a new Home email gets no verify request", async () => {
    const { manage, verifies } = await render({ list: EMAILS, afterSave: [...EMAILS, added(44, { value: "b@x.com", label: "Home" })] })
    await addEmail("b@x.com", "Home")
    await save()
    expect(manage).toHaveLength(1)
    expect(verifies).toEqual([])
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
  })

  it("Send error: the listed id reads \"Couldn't send the link\" with Resend available now; the other counts down", async () => {
    const { verifies } = await render({ list: EMAILS, afterSave: [...EMAILS, added(44), added(45)], verify: [verifyOk([44]), verifyOk()] })
    await addEmail("user44@example.com", "Personal")
    await addEmail("user45@example.com", "Personal")
    await save()
    expect(verifies).toEqual([{ contactPointIds: [44, 45] }])
    await waitFor(() => expect(statusOf("user45@example.com")).toBe("Link sent · Resend in 60 s"))
    expect(statusOf("user44@example.com")).toBe("Not verifiedCouldn't send the link")
    const resend = inlineAction("user44@example.com", "Resend verification") as HTMLElement
    expect(resend.getAttribute("aria-disabled")).toBeNull()
    await click(resend)
    await waitFor(() => expect(verifies).toEqual([{ contactPointIds: [44, 45] }, { contactPointIds: [44] }]))
    await waitFor(() => expect(statusOf("user44@example.com")).toBe("Link sent · Resend in 60 s"))
  })

  it.each<[string, Answer]>([
    ["network", () => HttpResponse.error()],
    ["500", () => HttpResponse.json({ message: "Boom", code: 500 }, { status: 500 })],
  ])("Verify fails (%s): the save is ok and toasts; the row reads \"Couldn't send the link\"; no error toast", async (_case, answer) => {
    const { verifies } = await render({ list: EMAILS, afterSave: [...EMAILS, added(44, { value: "b@x.com" })], verify: [answer] })
    await addEmail("b@x.com", "Personal")
    await save()
    expect(verifies).toHaveLength(1)
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
    expect(toastError).not.toHaveBeenCalled()
    await waitFor(() => expect(statusOf("b@x.com")).toBe("Not verifiedCouldn't send the link"))
    expect(liveStatus().textContent).toBe("Couldn't send the link")
  })

  it("a cooldown answer to the auto-verify shows the email cooldown help with Resend available", async () => {
    await render({ list: EMAILS, afterSave: [...EMAILS, added(44)], verify: [() => HttpResponse.json({ message: COOLDOWN, code: 400 }, { status: 400 })] })
    await addEmail("user44@example.com", "Personal")
    await save()
    await waitFor(() => expect(statusOf("user44@example.com")).toBe(`Not verified${COOLDOWN_HELP}`))
    expect(inlineAction("user44@example.com", "Resend verification")?.getAttribute("aria-disabled")).toBeNull()
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
  })

  it("a refetch that didn't bring the new row sends no verify; the save is still ok", async () => {
    const { manage, verifies } = await render({ list: EMAILS, afterSave: EMAILS })
    await addEmail("b@x.com", "Personal")
    await save()
    expect(manage).toHaveLength(1)
    expect(verifies).toEqual([])
    expect(toastSuccess).toHaveBeenCalledWith("Email saved.")
  })

  it("Save all reaches the auto-verify: manage, then verify, before the save resolves", async () => {
    const { verifies, writes, registry } = await render({ list: EMAILS, afterSave: [...EMAILS, added(44)] })
    await addEmail("user44@example.com", "Personal")
    let outcome: Awaited<ReturnType<typeof runSaveAll>> | undefined
    await act(async () => {
      outcome = await runSaveAll(registry)
    })
    expect(outcome).toMatchObject({ kind: "done", saved: [{ id: "email" }], failed: [] })
    expect(writes).toEqual(["manage", "verify"])
    expect(verifies).toEqual([{ contactPointIds: [44] }])
  })
})

describe("EmailSection: Verify / Resend verification in the read view (Story 3.6)", () => {
  it("Manual: Verify on the unverified Work 41 sends [41] with no edit mode; the countdown; the kebab item aria-disabled with it", async () => {
    const { verifies, manage } = await render()
    const announced = watchAnnouncements()
    await click(inlineAction("ann@work.example", "Verify") as HTMLElement)
    await waitFor(() => expect(verifies).toEqual([{ contactPointIds: [41] }]))
    expect(isReadView()).toBe(true)
    expect(manage).toEqual([])
    await waitFor(() => expect(statusOf("ann@work.example")).toBe("Link sent · Resend in 60 s"))
    expect(announced).toEqual(["Link sent"])
    const inline = inlineAction("ann@work.example", "Resend verification") as HTMLElement
    expect(inline.getAttribute("aria-disabled")).toBe("true")
    const menu = await openKebab("ann@work.example")
    const item = within(menu).getByRole("menuitem", { name: /Resend verification/ })
    expect(item.getAttribute("aria-disabled")).toBe("true")
    expect(item.textContent).toMatch(/^Resend verificationLink sent · Resend in (60|59) s$/)
    // Activation during the countdown does nothing.
    await click(inline)
    await act(async () => fireEvent.click(item))
    await settle()
    expect(verifies).toHaveLength(1)
  })

  it("Countdown: 60 s later the row reads \"Not verified\" and \"Resend verification\" is enabled", async () => {
    const advance = shiftClock()
    const { verifies } = await render()
    await click(inlineAction("ann@work.example", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("ann@work.example")).toBe("Link sent · Resend in 60 s"))
    await advance(60_100)
    await waitFor(() => expect(statusOf("ann@work.example")).toBe("Not verified"))
    await click(inlineAction("ann@work.example", "Resend verification") as HTMLElement)
    await waitFor(() => expect(verifies).toEqual([{ contactPointIds: [41] }, { contactPointIds: [41] }]))
  })

  it("Manual network: the error toast with Retry (which resends [41]); the row stays \"Not verified\" as it was", async () => {
    const { verifies } = await render({ list: EMAILS, verify: [() => HttpResponse.error(), verifyOk()] })
    await click(inlineAction("ann@work.example", "Verify") as HTMLElement)
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toastError).mock.calls[0][0]).toBe("Couldn't send the link. Check your connection.")
    expect(statusOf("ann@work.example")).toBe("Not verified")
    expect(inlineAction("ann@work.example", "Verify")).not.toBeNull()
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await waitFor(() => expect(verifies).toEqual([{ contactPointIds: [41] }, { contactPointIds: [41] }]))
    await waitFor(() => expect(statusOf("ann@work.example")).toBe("Link sent · Resend in 60 s"))
  })

  it("a kebab Verify whose row a revalidation verified meanwhile sends nothing", async () => {
    const { verifies, putList } = await render()
    const menu = await openKebab("ann@work.example")
    const item = within(menu).getByRole("menuitem", { name: "Verify" })
    await act(async () => {
      fireEvent.click(item)
      await putList([{ ...EMAILS[0], isVerified: true }, EMAILS[1], EMAILS[2]])
    })
    await settle()
    expect(verifies).toEqual([])
  })

  it("Cooldown: the 400 shows the email cooldown help, announced; Resend stays available", async () => {
    const { verifies } = await render({ list: EMAILS, verify: [() => HttpResponse.json({ message: COOLDOWN, code: 400 }, { status: 400 })] })
    const announced = watchAnnouncements()
    await click(inlineAction("ann@work.example", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("ann@work.example")).toBe(`Not verified${COOLDOWN_HELP}`))
    expect(announced).toEqual([COOLDOWN_HELP])
    const resend = inlineAction("ann@work.example", "Resend verification") as HTMLElement
    expect(resend.getAttribute("aria-disabled")).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
    await click(resend)
    await waitFor(() => expect(verifies).toHaveLength(2))
  })

  it("no action on Verified, Home-labelled, id-less or repeated rows; an unverified Primary counts", async () => {
    await render({
      list: [
        added(30, { label: "Primary" }),
        added(31, { isVerified: true }),
        added(32, { label: "Home" }),
        added(33, { id: null, value: "user33@example.com" }),
        added(34),
        // A repeated id: its later occurrence is locked, with no action.
        added(34, { value: "again34@example.com" }),
      ],
    })
    const withVerify = ["user30@example.com", "user31@example.com", "user32@example.com", "user33@example.com", "user34@example.com", "again34@example.com"].filter(
      (address) => inlineAction(address, "Verify") !== null,
    )
    expect(withVerify).toEqual(["user30@example.com", "user34@example.com"])
    // An unverified Primary keeps its Primary chip and shows Verify.
    expect(rowOf("user30@example.com").querySelector('[data-slot="chip"]')?.getAttribute("data-variant")).toBe("primary")
    const menu = await openKebab("user31@example.com")
    expect(within(menu).queryByRole("menuitem", { name: /Verify/ })).toBeNull()
  })

  it("Verified on focus: a refetch showing 41 verified reads \"Verified\" with no Verify action", async () => {
    const { refetch } = await render()
    await click(inlineAction("ann@work.example", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("ann@work.example")).toBe("Link sent · Resend in 60 s"))
    await refetch([{ ...EMAILS[0], isVerified: true }, EMAILS[1], EMAILS[2]])
    await waitFor(() => expect(statusOf("ann@work.example")).toBe("Verified"))
    expect(inlineAction("ann@work.example", /Verif/)).toBeNull()
  })

  it("the edit view's saved row shows the same countdown", async () => {
    await render()
    await click(inlineAction("ann@work.example", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("ann@work.example")).toBe("Link sent · Resend in 60 s"))
    await click(within(section()).getByRole("button", { name: "Edit" }))
    const work = [...section().querySelectorAll<HTMLElement>("tbody tr")].find((row) => row.querySelector('input[value="ann@work.example"]')) as HTMLElement
    expect(within(work).getByText("Link sent · Resend in 60 s")).toBeTruthy()
  })

  it("has no axe violations in light and dark with a countdown, a send error and the cooldown help", async () => {
    await render({
      list: [...EMAILS, added(44), added(45)],
      verify: [verifyOk(), verifyOk([44]), () => HttpResponse.json({ message: COOLDOWN, code: 400 }, { status: 400 })],
    })
    await click(inlineAction("ann@work.example", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("ann@work.example")).toBe("Link sent · Resend in 60 s"))
    await click(inlineAction("user44@example.com", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("user44@example.com")).toBe("Not verifiedCouldn't send the link"))
    await click(inlineAction("user45@example.com", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("user45@example.com")).toBe(`Not verified${COOLDOWN_HELP}`))
    expect(await axeViolations()).toEqual([])
    document.documentElement.classList.add("dark")
    expect(await axeViolations()).toEqual([])
  })
})
