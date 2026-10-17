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
import { PhoneSection } from "."

// The Section's own toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))

/**
 * Story 3.3 (NG-9023, FR17): verify phones on `/`, rendered the way
 * `PageFrame` hosts the Section (`renderInPage`, MSW at `/api`). Covers every
 * row of the I/O matrix in `spec-3-3-verify-phones.md`: the auto-verify
 * inside `save()`, the send state held by the Section (countdown, send
 * error, cooldown), the read view's Verify / Resend verification action,
 * the announcement and the network toast.
 */

const LIST = "/api/1h/v2/user/contact-point/list"
const MANAGE = "/api/1h/v2/health/contact-point"
const VERIFY = "/api/1h/v2/health/contact-point/verify"
const COOLDOWN = "There is already a pending verification for Contact '+14155550111' submitted within the last 60 minutes."

type Wire = Record<string, unknown>
type Lists = Partial<Record<"Mobile" | "Landline", Wire[]>>
type Answer = () => Response | Promise<Response>

/** Mobile [Work 11 (unverified), Primary 12 (verified)], Landline [Home 21 (unverified)]: shown 12, 11, 21. */
const MOBILE: Wire[] = [
  contactPointWire({ id: 11, value: "+14155550111", label: "Work", isVerified: false, isNotificationEnabled: false }),
  contactPointWire({ id: 12, value: "+14155512125", label: "Primary", isVerified: true, isNotificationEnabled: true }),
]
const LANDLINE: Wire[] = [contactPointWire({ id: 21, value: "+442071838750", type: "Landline", label: "Home", isVerified: false, phoneNumberRegion: "gb" })]

/** A saved Mobile as the list answers it after the save: `id`, numbered from it, unverified Personal by default. */
const mobileWire = (id: number, overrides: Wire = {}): Wire =>
  contactPointWire({ id, value: `+1415555${String(id).padStart(4, "0")}`, label: "Personal", isVerified: false, isNotificationEnabled: false, phoneNumberRegion: "us", ...overrides })

const verifyOk = (contactPointIdsWithSendError: number[] = []): Answer => () =>
  HttpResponse.json({ success: contactPointIdsWithSendError.length === 0, contactPointIdsWithSendError })

interface ServerOptions {
  /** The lists as answered now; `afterSave` replaces them once the manage POST succeeds (its refetch). */
  readonly lists: Lists
  readonly afterSave?: Lists
  /** The verify answers, in order (the last one repeats). */
  readonly verify?: readonly Answer[]
}

/** Answers the lists, the manage POST (200, then the `afterSave` lists) and the verify POST, recording every write in order. */
function phoneServer({ lists, afterSave, verify = [verifyOk()] }: ServerOptions) {
  let current: Lists = lists
  const manage: unknown[] = []
  const verifies: unknown[] = []
  const writes: string[] = []
  const handlers: HttpHandler[] = [
    http.get(LIST, ({ request }) => {
      const type = new URL(request.url).searchParams.get("type") as "Mobile" | "Landline"
      return HttpResponse.json(current[type] ?? [])
    }),
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
  const setLists = (next: Lists) => {
    current = next
  }
  return { manage, verifies, writes, handlers, setLists }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Phone" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const isReadView = (): boolean => section().querySelector('[data-slot="section-footer"]') === null
const liveStatus = (): HTMLElement => section().querySelector('[data-slot="live-status"]') as HTMLElement
/** The read-view row (table row or card) holding `number`. */
const rowOf = (number: string): HTMLElement =>
  [...section().querySelectorAll<HTMLElement>("tbody tr, li[data-slot='section-table-card']")].find((row) => row.textContent?.includes(number)) as HTMLElement
/** The Status cell's text of the row holding `number` (a card's cell without its "Status: " label). */
const statusOf = (number: string): string => {
  const row = rowOf(number)
  const cell = row.querySelector('[data-column="status"]') ?? row.querySelectorAll("td")[3]
  return (cell?.textContent ?? "").replace(/^Status: /, "")
}
const inlineAction = (number: string, name: string | RegExp): HTMLElement | null => within(rowOf(number)).queryByRole("button", { name })

async function render(options: ServerOptions = { lists: { Mobile: MOBILE, Landline: LANDLINE } }) {
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
  /** Revalidates both Phone keys in the Section's cache (what a window-focus revalidation does). */
  const refetch = (next: Lists) =>
    act(async () => {
      server.setLists(next)
      await Promise.all([scoped?.(keys.contactPoints("Mobile")), scoped?.(keys.contactPoints("Landline"))])
    })
  /** Puts `rows` in the Section's cache for `type` without a request (a revalidation landing meanwhile). */
  const setList = (type: "Mobile" | "Landline", rows: Wire[]) =>
    act(async () => {
      await scoped?.(keys.contactPoints(type), rows.map((row) => ({ ...row })), { revalidate: false })
    })
  return { ...result, ...server, refetch, setList }
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

/** Adds a new row and fills it (the header's Add phone in read view, the footer's Add row while editing). */
async function addPhone(number: string, label: string, type: "Mobile" | "Landline") {
  const footer = section().querySelector<HTMLElement>('[data-slot="section-footer"]')
  await click(footer ? within(footer).getByRole("button", { name: "Add row" }) : within(section()).getByRole("button", { name: "Add phone" }))
  const rows = section().querySelectorAll<HTMLElement>('[data-state="new"]')
  const row = rows[rows.length - 1]
  await act(async () => fireEvent.change(within(row).getByRole("textbox", { name: "Number" }), { target: { value: number } }))
  await pick(within(row).getByRole("combobox", { name: "Label" }), label)
  await pick(within(row).getByRole("combobox", { name: "Type" }), type)
}

async function save() {
  await click(within(section()).getByRole("button", { name: "Save" }))
  await waitFor(() => expect(isReadView()).toBe(true))
}

async function openKebab(number: string): Promise<HTMLElement> {
  await act(async () => fireEvent.keyDown(within(section()).getByRole("button", { name: `More actions for ${number}` }), { key: "Enter" }))
  return screen.findByRole("menu")
}

/** Every non-empty text the live region took, in order (a repeat of the same text adds a trailing no-break space). */
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

describe("PhoneSection: auto-verify after a save (Story 3.3)", () => {
  it("Auto-verify: the manage POST, then one verify for the new unverified Mobile; \"Phone saved.\"; the row counts down; \"Link sent\" announced once", async () => {
    const { manage, verifies, writes } = await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      afterSave: { Mobile: [...MOBILE, mobileWire(40, { value: "+14155550101" })], Landline: LANDLINE },
    })
    const announced = watchAnnouncements()
    await addPhone("4155550101", "Personal", "Mobile")
    await save()
    expect(manage).toHaveLength(1)
    expect(verifies).toEqual([{ contactPointIds: [40] }])
    expect(writes).toEqual(["manage", "verify"])
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
    expect(toastError).not.toHaveBeenCalled()
    await waitFor(() => expect(statusOf("+1 (415) 555-0101")).toBe("Link sent · Resend in 60 s"))
    expect(rowOf("+1 (415) 555-0101").querySelector('[data-slot="status-badge"]')?.getAttribute("data-status")).toBe("pending")
    // The other unverified Mobile was saved before: never verified by the save.
    expect(statusOf("+1 (415) 555-0111")).toBe("Not verified")
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1300)))
    await waitFor(() => expect(statusOf("+1 (415) 555-0101")).toMatch(/^Link sent · Resend in 5[89] s$/))
    // Announced once per send, never each second.
    expect(announced).toEqual(["Link sent"])
  })

  it.each<[string, string, "Mobile" | "Landline", Wire]>([
    ["a Landline", "Work", "Landline", mobileWire(40, { value: "+14155550101", type: "Landline", label: "Work" })],
    ["a Home Mobile", "Home", "Mobile", mobileWire(40, { value: "+14155550101", label: "Home" })],
  ])("Excluded: %s gets no verify request", async (_case, label, type, added) => {
    const lists = { Mobile: MOBILE, Landline: LANDLINE }
    const afterSave = type === "Landline" ? { ...lists, Landline: [...LANDLINE, added] } : { ...lists, Mobile: [...MOBILE, added] }
    const { manage, verifies } = await render({ lists, afterSave })
    await addPhone("4155550101", label, type)
    await save()
    expect(manage).toHaveLength(1)
    expect(verifies).toEqual([])
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
  })

  it("Send error: the listed id reads \"Couldn't send the link\" with Resend available now; the other counts down", async () => {
    const { verifies } = await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      afterSave: { Mobile: [...MOBILE, mobileWire(40), mobileWire(41)], Landline: LANDLINE },
      verify: [verifyOk([40]), verifyOk()],
    })
    await addPhone("4155550040", "Personal", "Mobile")
    await addPhone("4155550041", "Personal", "Mobile")
    await save()
    expect(verifies).toEqual([{ contactPointIds: [40, 41] }])
    await waitFor(() => expect(statusOf("+1 (415) 555-0041")).toBe("Link sent · Resend in 60 s"))
    expect(statusOf("+1 (415) 555-0040")).toBe("Not verifiedCouldn't send the link")
    const resend = inlineAction("+1 (415) 555-0040", "Resend verification") as HTMLElement
    expect(resend.getAttribute("aria-disabled")).toBeNull()
    expect(inlineAction("+1 (415) 555-0041", "Resend verification")?.getAttribute("aria-disabled")).toBe("true")
    await click(resend)
    await waitFor(() => expect(verifies).toEqual([{ contactPointIds: [40, 41] }, { contactPointIds: [40] }]))
    await waitFor(() => expect(statusOf("+1 (415) 555-0040")).toBe("Link sent · Resend in 60 s"))
  })

  it.each<[string, Answer]>([
    ["network", () => HttpResponse.error()],
    ["500", () => HttpResponse.json({ message: "Boom", code: 500 }, { status: 500 })],
  ])("Verify fails (%s): the save is ok and toasts; every id reads \"Couldn't send the link\"; no error UI", async (_case, answer) => {
    const { verifies } = await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      afterSave: { Mobile: [...MOBILE, mobileWire(40), mobileWire(41)], Landline: LANDLINE },
      verify: [answer],
    })
    await addPhone("4155550040", "Personal", "Mobile")
    await addPhone("4155550041", "Personal", "Mobile")
    await save()
    expect(verifies).toHaveLength(1)
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
    expect(toastError).not.toHaveBeenCalled()
    await waitFor(() => expect(statusOf("+1 (415) 555-0040")).toBe("Not verifiedCouldn't send the link"))
    expect(statusOf("+1 (415) 555-0041")).toBe("Not verifiedCouldn't send the link")
    expect(section().querySelector('[data-slot~="inline-banner"]')).toBeNull()
    // No toast for the auto-verify: the failure is announced instead.
    expect(liveStatus().textContent).toBe("Couldn't send the link")
  })

  it("12 new: two verify calls, 10 then 2, one after another", async () => {
    const added = Array.from({ length: 12 }, (_, index) => mobileWire(40 + index))
    const { verifies } = await render({ lists: { Mobile: MOBILE, Landline: LANDLINE }, afterSave: { Mobile: [...MOBILE, ...added], Landline: LANDLINE } })
    await addPhone("4155550040", "Personal", "Mobile")
    await save()
    const ids = added.map((row) => row.id)
    expect(verifies).toEqual([{ contactPointIds: ids.slice(0, 10) }, { contactPointIds: ids.slice(10) }])
  })

  it("a cooldown answer to the auto-verify shows the cooldown help with Resend available", async () => {
    const { verifies } = await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      afterSave: { Mobile: [...MOBILE, mobileWire(40)], Landline: LANDLINE },
      verify: [() => HttpResponse.json({ message: COOLDOWN, code: 400 }, { status: 400 })],
    })
    await addPhone("4155550040", "Personal", "Mobile")
    await save()
    expect(verifies).toHaveLength(1)
    await waitFor(() => expect(statusOf("+1 (415) 555-0040")).toBe("Not verifiedA link was already sent in the last hour. Check your texts."))
    expect(inlineAction("+1 (415) 555-0040", "Resend verification")?.getAttribute("aria-disabled")).toBeNull()
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
  })

  it("a refetch that didn't bring the new row sends no verify; the save is still ok", async () => {
    const { manage, verifies } = await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      afterSave: { Mobile: MOBILE, Landline: LANDLINE },
    })
    await addPhone("4155550040", "Personal", "Mobile")
    await save()
    expect(manage).toHaveLength(1)
    expect(verifies).toEqual([])
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
  })

  it("Save all reaches the auto-verify: manage, then verify, before the save resolves", async () => {
    const { verifies, writes, registry } = await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      afterSave: { Mobile: [...MOBILE, mobileWire(40)], Landline: LANDLINE },
    })
    await addPhone("4155550040", "Personal", "Mobile")
    let outcome: Awaited<ReturnType<typeof runSaveAll>> | undefined
    await act(async () => {
      outcome = await runSaveAll(registry)
    })
    expect(outcome).toMatchObject({ kind: "done", saved: [{ id: "phone" }], failed: [] })
    expect(writes).toEqual(["manage", "verify"])
    expect(verifies).toEqual([{ contactPointIds: [40] }])
  })

  it("a session end on the verify does nothing: the save is ok, the row stays \"Not verified\" with no help", async () => {
    await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      afterSave: { Mobile: [...MOBILE, mobileWire(40)], Landline: LANDLINE },
      verify: [() => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 })],
    })
    await addPhone("4155550040", "Personal", "Mobile")
    await save()
    await waitFor(() => expect(statusOf("+1 (415) 555-0040")).toBe("Not verified"))
    expect(inlineAction("+1 (415) 555-0040", "Verify")).not.toBeNull()
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe("PhoneSection: Verify / Resend verification in the read view (Story 3.3)", () => {
  it("Manual: Verify on the unverified Mobile 11 sends [11] with no edit mode; the countdown; the kebab item aria-disabled with the countdown", async () => {
    const { verifies, manage } = await render()
    const announced = watchAnnouncements()
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(verifies).toEqual([{ contactPointIds: [11] }]))
    expect(isReadView()).toBe(true)
    expect(manage).toEqual([])
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 60 s"))
    expect(announced).toEqual(["Link sent"])
    const inline = inlineAction("+1 (415) 555-0111", "Resend verification") as HTMLElement
    expect(inline.getAttribute("aria-disabled")).toBe("true")
    const menu = await openKebab("+1 (415) 555-0111")
    const item = within(menu).getByRole("menuitem", { name: /Resend verification/ })
    expect(item.getAttribute("aria-disabled")).toBe("true")
    expect(item.textContent).toMatch(/^Resend verificationLink sent · Resend in (60|59) s$/)
    // Activation during the countdown does nothing.
    await click(inline)
    await act(async () => fireEvent.click(item))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(verifies).toHaveLength(1)
  })

  it("the kebab item sends at once too, and a repeat press while the send is in flight does nothing", async () => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { verifies } = await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      verify: [
        async () => {
          await held
          return HttpResponse.json({ success: true, contactPointIdsWithSendError: [] })
        },
      ],
    })
    const menu = await openKebab("+1 (415) 555-0111")
    expect(within(menu).getAllByRole("menuitem").map((entry) => entry.firstElementChild?.firstElementChild?.textContent)).toEqual(["Verify", "Edit", "Remove"])
    await act(async () => fireEvent.click(within(menu).getByRole("menuitem", { name: "Verify" })))
    await waitFor(() => expect(verifies).toHaveLength(1))
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(verifies).toHaveLength(1)
    await act(async () => release())
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 60 s"))
    expect(verifies).toHaveLength(1)
  })

  it("Countdown: 60 s later the row reads \"Not verified\" and \"Resend verification\" is enabled", async () => {
    const advance = shiftClock()
    const { verifies } = await render()
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 60 s"))
    await advance(1_500)
    expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 59 s")
    await advance(58_600)
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Not verified"))
    const resend = inlineAction("+1 (415) 555-0111", "Resend verification") as HTMLElement
    expect(resend.getAttribute("aria-disabled")).toBeNull()
    await click(resend)
    await waitFor(() => expect(verifies).toEqual([{ contactPointIds: [11] }, { contactPointIds: [11] }]))
  })

  it("the 768 px layout swap keeps the right time (the deadline is the Section's)", async () => {
    const resize = stubViewport(1024)
    const advance = shiftClock()
    await render()
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 60 s"))
    await advance(10_200)
    await act(async () => resize(360))
    expect(section().querySelector("table")).toBeNull()
    expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 50 s")
    await act(async () => resize(1024))
    expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 50 s")
  })

  it("Manual network: the error toast with Retry (which resends [11]); the row stays \"Not verified\" as it was", async () => {
    const { verifies } = await render({ lists: { Mobile: MOBILE, Landline: LANDLINE }, verify: [() => HttpResponse.error(), verifyOk()] })
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toastError).mock.calls[0][0]).toBe("Couldn't send the link. Check your connection.")
    expect(statusOf("+1 (415) 555-0111")).toBe("Not verified")
    expect(inlineAction("+1 (415) 555-0111", "Verify")).not.toBeNull()
    expect(liveStatus().textContent).toBe("")
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await waitFor(() => expect(verifies).toEqual([{ contactPointIds: [11] }, { contactPointIds: [11] }]))
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 60 s"))
  })

  it("a late Retry goes through the row checks: once the row reads verified, it sends nothing", async () => {
    const { verifies, refetch } = await render({ lists: { Mobile: MOBILE, Landline: LANDLINE }, verify: [() => HttpResponse.error(), verifyOk()] })
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    await refetch({ Mobile: [{ ...MOBILE[0], isVerified: true }, MOBILE[1]], Landline: LANDLINE })
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Verified"))
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(verifies).toHaveLength(1)
  })

  it.each<[string, Wire[]]>([
    ["dropped", [MOBILE[1]]],
    ["now verified", [{ ...MOBILE[0], isVerified: true }, MOBILE[1]]],
  ])("a kebab Verify whose row a revalidation %s meanwhile sends nothing", async (_case, mobile) => {
    const { verifies, setList } = await render()
    const menu = await openKebab("+1 (415) 555-0111")
    const item = within(menu).getByRole("menuitem", { name: "Verify" })
    await act(async () => {
      fireEvent.click(item)
      await setList("Mobile", mobile)
    })
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(verifies).toEqual([])
    expect(isReadView()).toBe(true)
  })

  it("Cooldown: the 400 shows the cooldown help, announced; Resend stays available", async () => {
    const { verifies } = await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      verify: [() => HttpResponse.json({ message: COOLDOWN, code: 400 }, { status: 400 })],
    })
    const announced = watchAnnouncements()
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Not verifiedA link was already sent in the last hour. Check your texts."))
    expect(announced).toEqual(["A link was already sent in the last hour. Check your texts."])
    const resend = inlineAction("+1 (415) 555-0111", "Resend verification") as HTMLElement
    expect(resend.getAttribute("aria-disabled")).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
    await click(resend)
    await waitFor(() => expect(verifies).toHaveLength(2))
  })

  it("another failure reads \"Couldn't send the link\", announced, with Resend available at once", async () => {
    // `EXISTING_VERIFIED_CONTACT_POINT_WITH_VALUE_ERROR`: the number is verified on another account.
    await render({
      lists: { Mobile: MOBILE, Landline: LANDLINE },
      verify: [() => HttpResponse.json({ message: "Operation failed. Unable to process the verification request.", code: 400 }, { status: 400 })],
    })
    const announced = watchAnnouncements()
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Not verifiedCouldn't send the link"))
    expect(announced).toEqual(["Couldn't send the link"])
    expect(inlineAction("+1 (415) 555-0111", "Resend verification")?.getAttribute("aria-disabled")).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("no action on Verified, Landline, Home-labelled, id-less or repeated rows; an unverified Primary counts", async () => {
    await render({
      lists: {
        Mobile: [
          mobileWire(30, { label: "Primary", isVerified: false }),
          mobileWire(31, { isVerified: true }),
          mobileWire(32, { label: "Home" }),
          mobileWire(33, { id: null, value: "+14155550033" }),
          mobileWire(34),
          // A repeated id: its later occurrence is locked, with no action.
          mobileWire(34, { value: "+14155550134" }),
        ],
        Landline: [mobileWire(35, { type: "Landline", label: "Work" })],
      },
    })
    const withVerify = ["+1 (415) 555-0030", "+1 (415) 555-0031", "+1 (415) 555-0032", "+1 (415) 555-0033", "+1 (415) 555-0034", "+1 (415) 555-0035", "+1 (415) 555-0134"].filter(
      (number) => inlineAction(number, "Verify") !== null,
    )
    expect(withVerify).toEqual(["+1 (415) 555-0030", "+1 (415) 555-0034"])
    const menu = await openKebab("+1 (415) 555-0031")
    expect(within(menu).queryByRole("menuitem", { name: /Verify/ })).toBeNull()
  })

  it("Verified on focus: a refetch showing 11 verified reads \"Verified\" with no action, whatever was sent", async () => {
    const { refetch } = await render()
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 60 s"))
    await refetch({ Mobile: [{ ...MOBILE[0], isVerified: true }, MOBILE[1]], Landline: LANDLINE })
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Verified"))
    expect(inlineAction("+1 (415) 555-0111", /Verif/)).toBeNull()
  })

  it("Verified on focus while editing: the badge updates and the user's edits are kept", async () => {
    const { refetch } = await render()
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 60 s"))
    await click(within(section()).getByRole("button", { name: "Edit" }))
    const work = () =>
      [...section().querySelectorAll<HTMLElement>("tbody tr")].find((row) => row.querySelector('input[value="+1 (415) 555-0111"]')) as HTMLElement
    // The edit view's saved row shows the same countdown.
    expect(within(work()).getByText("Link sent · Resend in 60 s")).toBeTruthy()
    await pick(within(work()).getByRole("combobox", { name: "Label" }), "Personal")
    await refetch({ Mobile: [{ ...MOBILE[0], isVerified: true }, MOBILE[1]], Landline: LANDLINE })
    await waitFor(() => expect(within(work()).getByText("Verified")).toBeTruthy())
    expect(within(work()).getByRole("combobox", { name: "Label" }).textContent).toBe("Personal")
    expect(isReadView()).toBe(false)
  })

  it("has no axe violations in light and dark with a countdown, a send error and the cooldown help", async () => {
    await render({
      lists: { Mobile: [...MOBILE, mobileWire(40), mobileWire(41)], Landline: LANDLINE },
      verify: [verifyOk(), verifyOk([40]), () => HttpResponse.json({ message: COOLDOWN, code: 400 }, { status: 400 })],
    })
    await click(inlineAction("+1 (415) 555-0111", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("+1 (415) 555-0111")).toBe("Link sent · Resend in 60 s"))
    await click(inlineAction("+1 (415) 555-0040", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("+1 (415) 555-0040")).toBe("Not verifiedCouldn't send the link"))
    await click(inlineAction("+1 (415) 555-0041", "Verify") as HTMLElement)
    await waitFor(() => expect(statusOf("+1 (415) 555-0041")).toBe("Not verifiedA link was already sent in the last hour. Check your texts."))
    expect(await axeViolations()).toEqual([])
    document.documentElement.classList.add("dark")
    expect(await axeViolations()).toEqual([])
  })
})
