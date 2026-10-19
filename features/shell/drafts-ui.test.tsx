import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { StrictMode, useEffect, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSessionEvents, type SessionEvents } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubViewport } from "@/test/media"
import { FIXTURE_BASELINE, FIXTURE_DRAFT_FIELDS, FixtureSection, fixtureDraftDiff, type FixtureSectionProps } from "./__fixtures__/fixture-section"
import { FixtureParticipant } from "./__fixtures__/fixture-participant"
import type { FixtureSectionValues } from "./__fixtures__/schema"
import { DraftsProvider } from "./draft-provider"
import { SectionDraftNotice } from "./draft-banner"
import { DRAFT_DEBOUNCE_MS, DRAFT_MAX_AGE_MS, createDraftStore, draftKey, hashDraftBase, type DraftOwner, type DraftStore } from "./drafts"
import { requestLeave, resetLeaveState } from "./leave"
import { LeaveGuard } from "./leave-guard"
import type { SaveResult } from "./nav-types"
import { navigate } from "./navigate"
import { PortalUrlProvider } from "./portal-url-provider"
import { runSaveAll } from "./save-all"
import { SectionRegistryProvider, useDirtyCount, useSectionRegistry, type SectionRegistry } from "./section-registry"
import { SessionDialog } from "./session-dialog"
import type { UseSectionFormOptions } from "./use-section-form"

vi.mock("./toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))

const PORTAL = "https://portal.test"
const USER = 42
const owner = (userId = USER): DraftOwner => ({ environment: "demo", userId })
const KEY = draftKey(owner(), "phone")
const CURRENT: FixtureSectionValues = { number: "4155550199", note: "" }

let registry: SectionRegistry | undefined

function Capture() {
  const current = useSectionRegistry()
  const count = useDirtyCount()
  useEffect(() => {
    registry = current
  })
  return <output data-testid="dirty-count">{count}</output>
}

interface PageProps extends FixtureSectionProps {
  readonly transformDraft?: UseSectionFormOptions<FixtureSectionValues>["transformDraft"]
  /** `null`: myself hasn't loaded. */
  readonly userId?: number | null
  readonly events?: SessionEvents
  readonly assign?: (url: string) => void
  readonly store?: DraftStore
  readonly extra?: ReactNode
  /** Wraps the page in `<StrictMode>` (as the App Router does in development). */
  readonly strict?: boolean
  /** Unmounts only the Section (e.g. a tab switch). */
  readonly hideSection?: boolean
}

function Page({ userId = USER, events, assign = vi.fn(), store, extra, strict = false, hideSection = false, ...section }: PageProps) {
  const page = (
    <PortalUrlProvider portalUrl={PORTAL}>
      <SectionRegistryProvider>
        <DraftsProvider userId={userId ?? undefined} environment="demo" store={store}>
          <Capture />
          {hideSection ? null : (
            <FixtureSection draftFields={[...FIXTURE_DRAFT_FIELDS]} describeDraftDiff={fixtureDraftDiff} dataStatus="loaded" {...section} />
          )}
          {extra}
          <LeaveGuard events={events} />
          <SessionDialog events={events} assign={assign} />
        </DraftsProvider>
      </SectionRegistryProvider>
    </PortalUrlProvider>
  )
  return strict ? <StrictMode>{page}</StrictMode> : page
}

async function storeDraft(base: FixtureSectionValues, values: Partial<FixtureSectionValues>, userId = USER, savedAt = Date.now()): Promise<void> {
  const baseHash = await hashDraftBase({ number: base.number, note: base.note })
  window.localStorage.setItem(draftKey(owner(userId), "phone"), JSON.stringify({ savedAt, baseHash, values }))
}

const stored = (key = KEY) => JSON.parse(window.localStorage.getItem(key) ?? "null") as { savedAt: number; baseHash: string; values: Record<string, unknown> } | null
const heading = () => screen.getByRole("heading", { level: 2, name: "Phone" })
const number = () => screen.getByRole("textbox", { name: "Number" }) as HTMLInputElement
const note = () => screen.getByRole("textbox", { name: /Note/ }) as HTMLInputElement
const button = (name: string | RegExp) => screen.getByRole("button", { name })
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } })
const restoreText = "You have unsaved changes from your last visit."
const conflictText = "This section changed since your draft. Choose which version to keep."

async function edit(): Promise<void> {
  await act(async () => fireEvent.click(button("Edit")))
}

beforeEach(() => {
  stubViewport(1280)
  resetLeaveState()
  window.localStorage.clear()
  registry = undefined
})
afterEach(() => resetLeaveState())

describe("restore (same base)", () => {
  it("shows the info banner with Restore and Discard; Restore opens edit with the draft, dirty and counted by Save all", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "work" })
    render(<Page />)
    const banner = await screen.findByText(restoreText)
    expect(banner.getAttribute("role")).toBe("status")
    expect(banner.closest("[data-slot~='inline-banner']")?.getAttribute("data-variant")).toBe("info")
    expect(await axeViolations()).toEqual([])
    fireEvent.click(button("Restore"))
    await waitFor(() => expect(number().value).toBe("4155550000"))
    expect(note().value).toBe("work")
    expect(screen.queryByText(restoreText)).toBeNull()
    expect(screen.getByText("Unsaved changes")).toBeTruthy()
    expect(screen.getByTestId("dirty-count").textContent).toBe("1")
    expect(document.activeElement).toBe(heading())
  })

  it.each([
    { action: "Save", baseline: FIXTURE_BASELINE, choice: "Restore", notice: restoreText },
    { action: "Cancel", baseline: FIXTURE_BASELINE, choice: "Restore", notice: restoreText },
    { action: "Save", baseline: CURRENT, choice: "Keep mine", notice: conflictText },
    { action: "Cancel", baseline: CURRENT, choice: "Keep mine", notice: conflictText },
  ])("keeps a refused $choice offered, persists mapped retry against the current base, then cleans up once on $action", async ({ action, baseline, choice, notice }) => {
    const values = { number: "4155550000", note: "work" }
    await storeDraft(FIXTURE_BASELINE, values)
    const original = stored()
    const refused = vi.fn(() => null)
    const view = render(<Page baseline={baseline} transformDraft={refused} />)
    await screen.findByText(notice)
    const comparison = screen.queryByRole("table", { name: `Phone ${conflictText}` })?.textContent
    await act(async () => fireEvent.click(button(choice)))
    expect(refused).toHaveBeenCalledExactlyOnceWith(values, baseline)
    expect(screen.getByText(notice)).toBeTruthy()
    expect(screen.queryByRole("table", { name: `Phone ${conflictText}` })?.textContent).toBe(comparison)
    expect(button("Edit")).toBeTruthy()
    expect(registry?.get("phone")).toMatchObject({ isDirty: false, userChanged: false })
    expect(stored()).toEqual(original)

    const ready = vi.fn(() => ({ ...values, number: "4155550001" }))
    view.rerender(<Page baseline={baseline} transformDraft={ready} />)
    await act(async () => fireEvent.click(button(choice)))
    expect(ready).toHaveBeenCalledExactlyOnceWith(values, baseline)
    expect(number().value).toBe("4155550001")
    expect(note().value).toBe("work")
    expect(screen.queryByText(notice)).toBeNull()
    const baseHash = await hashDraftBase(baseline)
    await act(async () => fireEvent(window, new Event("pagehide")))
    await waitFor(() => expect(stored()).toMatchObject({ values: { ...values, number: "4155550001" }, baseHash }))
    const observed: string[] = []
    registry!.observe((event) => {
      if (event.type === "saved" || event.type === "discarded") observed.push(event.type)
    })
    const remove = vi.spyOn(Storage.prototype, "removeItem")
    await act(async () => fireEvent.click(button(action)))
    expect(observed).toEqual([action === "Save" ? "saved" : "discarded"])
    expect(remove.mock.calls.filter(([key]) => key === KEY)).toHaveLength(1)
    expect(stored()).toBeNull()
  })

  it.each(["Save", "Cancel"])("resolves a mapped draft equal to current data once, including clean %s and remount", async (action) => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "work" })
    const transformDraft: NonNullable<PageProps["transformDraft"]> = (_values, baseline) => baseline
    const save = vi.fn(async (): Promise<SaveResult> => ({ ok: true }))
    const view = render(<Page transformDraft={transformDraft} save={save} onNoChanges="status" />)
    await screen.findByText(restoreText)
    const observed: string[] = []
    registry!.observe((event) => {
      if (event.type === "saved" || event.type === "discarded") observed.push(event.type)
    })
    const remove = vi.spyOn(Storage.prototype, "removeItem")
    await act(async () => fireEvent.click(button("Restore")))
    expect(number().value).toBe(FIXTURE_BASELINE.number)
    expect(note().value).toBe(FIXTURE_BASELINE.note)
    expect(registry?.get("phone")).toMatchObject({ isDirty: false, userChanged: false })
    expect(screen.queryByText(restoreText)).toBeNull()
    expect(stored()).toBeNull()
    await act(async () => fireEvent(window, new Event("pagehide")))
    await act(async () => fireEvent.click(button(action)))
    expect(save).not.toHaveBeenCalled()
    expect(observed).toEqual(["discarded"])
    expect(remove.mock.calls.filter(([key]) => key === KEY)).toHaveLength(1)
    view.unmount()
    const store = createDraftStore()
    const read = vi.spyOn(store, "read")
    render(<Page transformDraft={transformDraft} store={store} />)
    await waitFor(() => expect(read).toHaveBeenCalledWith(owner(), "phone"))
    expect(read).toHaveReturnedWith(null)
    expect(screen.queryByText(restoreText)).toBeNull()
    expect(stored()).toBeNull()
    expect(button("Edit")).toBeTruthy()
    expect(remove.mock.calls.filter(([key]) => key === KEY)).toHaveLength(1)
  })

  it("preserves the omitted-callback behavior for a draft equal to current data", async () => {
    await storeDraft(FIXTURE_BASELINE, FIXTURE_BASELINE)
    const original = stored()
    const view = render(<Page />)
    await screen.findByText(restoreText)
    await act(async () => fireEvent.click(button("Restore")))
    await act(async () => fireEvent.click(button("Cancel")))
    expect(stored()).toEqual(original)
    view.unmount()
    render(<Page />)
    expect(await screen.findByText(restoreText)).toBeTruthy()
  })

  it("Discard deletes the draft and stays in the read view", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    render(<Page />)
    await screen.findByText(restoreText)
    fireEvent.click(button("Discard"))
    expect(screen.queryByText(restoreText)).toBeNull()
    expect(stored()).toBeNull()
    expect(button("Edit")).toBeTruthy()
    expect(document.activeElement).toBe(heading())
  })

  it("a Restore then Save sends the draft and deletes the key", async () => {
    const save = vi.fn(async (): Promise<SaveResult> => ({ ok: true }))
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    render(<Page save={save} />)
    await screen.findByText(restoreText)
    fireEvent.click(button("Restore"))
    await waitFor(() => expect(number().value).toBe("4155550000"))
    await act(async () => fireEvent.click(button("Save")))
    expect(save).toHaveBeenCalledWith({ number: "4155550000", note: "" }, FIXTURE_BASELINE, expect.any(Function))
    expect(stored()).toBeNull()
  })
})

describe("conflict (server data changed)", () => {
  it("shows the compare (Your version / Current, Not provided) with Use current and Keep mine; axe", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "work" })
    render(<Page baseline={{ number: CURRENT.number, note: "" }} />)
    await screen.findByText(conflictText)
    expect(screen.queryByText(restoreText)).toBeNull()
    const table = screen.getByRole("table", { name: `Phone ${conflictText}` })
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Your version", "Current"])
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows.map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent))).toEqual([
      ["Number", "4155550000", CURRENT.number],
      ["Note", "work", "Not provided"],
    ])
    const actions = [button("Use current"), button("Keep mine")]
    expect(actions[0].compareDocumentPosition(actions[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(await axeViolations()).toEqual([])
  })

  it("Keep mine opens edit with the draft over the current baseline: Save sends the diff against current", async () => {
    const save = vi.fn(async (): Promise<SaveResult> => ({ ok: true }))
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    render(<Page baseline={CURRENT} save={save} />)
    await screen.findByText(conflictText)
    fireEvent.click(button("Keep mine"))
    await waitFor(() => expect(number().value).toBe("4155550000"))
    expect(screen.queryByText(conflictText)).toBeNull()
    expect(document.activeElement).toBe(heading())
    await act(async () => fireEvent.click(button("Save")))
    expect(save).toHaveBeenCalledWith({ number: "4155550000", note: "" }, CURRENT, expect.any(Function))
    expect(stored()).toBeNull()
  })

  it("Use current deletes the draft and leaves the read view with current data", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    render(<Page baseline={CURRENT} />)
    await screen.findByText(conflictText)
    fireEvent.click(button("Use current"))
    expect(screen.queryByText(conflictText)).toBeNull()
    expect(stored()).toBeNull()
    expect(screen.getByRole("cell", { name: CURRENT.number })).toBeTruthy()
  })

  it("below 768 px stacks the two values under the field name, Your version first; axe", async () => {
    stubViewport(360)
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    render(<Page baseline={CURRENT} />)
    await screen.findByText(conflictText)
    const compare = document.querySelector("[data-slot='draft-compare']") as HTMLElement
    expect(compare.tagName).toBe("DIV")
    const row = within(compare).getByRole("group", { name: "Number" })
    expect([...row.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Your version", "Current"])
    expect([...row.querySelectorAll("dd")].map((value) => value.textContent)).toEqual(["4155550000", CURRENT.number])
    expect(await axeViolations()).toEqual([])
  })
})

describe("when nothing is offered", () => {
  it("a failed read shows no banner and keeps the draft; it is offered once the read succeeds", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    const view = render(<Page dataStatus="error" />)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByText(restoreText)).toBeNull()
    expect(stored()).not.toBeNull()
    view.rerender(<Page dataStatus="loaded" />)
    await screen.findByText(restoreText)
  })

  it("another user's draft is never offered nor touched", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" }, 7)
    render(<Page />)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByText(restoreText)).toBeNull()
    expect(stored(draftKey(owner(7), "phone"))).not.toBeNull()
  })

  it("a stale draft (> 24 h), an unparsable one and another version are purged on mount", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" }, USER, Date.now() - DRAFT_MAX_AGE_MS - 1)
    window.localStorage.setItem(draftKey(owner(7), "email"), "{")
    window.localStorage.setItem("pp:draft:v2:demo:42:phone", "{}")
    render(<Page />)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(window.localStorage.length).toBe(0)
    expect(screen.queryByText(restoreText)).toBeNull()
  })

  it("renders nothing outside a DraftsProvider", () => {
    render(<SectionDraftNotice sectionId="phone" />)
    expect(document.body.textContent).toBe("")
  })
})

describe("writing and deleting", () => {
  it("writes 500 ms after typing: only the draft fields, with the hash of the base the edit started from", async () => {
    render(<Page />)
    await edit()
    type(number(), "4155550000")
    expect(stored()).toBeNull()
    await waitFor(() => expect(stored()).not.toBeNull(), { timeout: DRAFT_DEBOUNCE_MS * 4 })
    expect(stored()).toMatchObject({ baseHash: await hashDraftBase({ number: FIXTURE_BASELINE.number, note: "" }), values: { number: "4155550000", note: "" } })
    // Back to the baseline: clean, so the key goes.
    type(number(), FIXTURE_BASELINE.number)
    await waitFor(() => expect(stored()).toBeNull())
  })

  it("the Section's own Save deletes the key; so does Cancel", async () => {
    render(<Page />)
    await edit()
    type(number(), "4155550000")
    fireEvent(window, new Event("pagehide"))
    expect(stored()).not.toBeNull()
    await act(async () => fireEvent.click(button("Save")))
    expect(stored()).toBeNull()
    await edit()
    type(number(), "4155550001")
    fireEvent(window, new Event("pagehide"))
    expect(stored()).not.toBeNull()
    await act(async () => fireEvent.click(button("Cancel")))
    expect(stored()).toBeNull()
  })

  it("Save all and the leave guard's Save delete the key", async () => {
    const events = createSessionEvents()
    render(<Page events={events} />)
    await edit()
    type(number(), "4155550000")
    fireEvent(window, new Event("pagehide"))
    expect(stored()).not.toBeNull()
    await act(async () => void (await runSaveAll(registry as SectionRegistry)))
    expect(stored()).toBeNull()

    await edit()
    type(number(), "4155550001")
    fireEvent(window, new Event("pagehide"))
    let left: Promise<boolean> = Promise.resolve(false)
    act(() => {
      left = requestLeave()
    })
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save" })))
    expect(await left).toBe(true)
    expect(stored()).toBeNull()
  })

  it("the leave guard's Discard deletes the key", async () => {
    render(<Page />)
    await edit()
    type(number(), "4155550000")
    fireEvent(window, new Event("pagehide"))
    expect(stored()).not.toBeNull()
    let left: Promise<boolean> = Promise.resolve(false)
    act(() => {
      left = requestLeave()
    })
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard" })))
    expect(await left).toBe(true)
    expect(stored()).toBeNull()
  })

  it("a guard-only participant (Insurance) never writes a draft", async () => {
    render(<Page extra={<FixtureParticipant id="insurance" label="Insurance" displayOrder={6} saveAll={false} />} />)
    fireEvent.change(screen.getByLabelText("Insurance"), { target: { value: "Aetna" } })
    fireEvent(window, new Event("pagehide"))
    expect(window.localStorage.length).toBe(0)
  })

  it("a storage that throws shows nothing and editing and saving still work", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    const save = vi.fn(async (): Promise<SaveResult> => ({ ok: true }))
    render(<Page save={save} />)
    await edit()
    type(number(), "4155550000")
    fireEvent(window, new Event("pagehide"))
    await act(async () => fireEvent.click(button("Save")))
    expect(save).toHaveBeenCalled()
    expect(screen.getByRole("cell", { name: "4155550000" })).toBeTruthy()
  })
})

describe("session end and exits", () => {
  it("writes the draft before the session dialog opens; the dialog's Return keeps it", async () => {
    const events = createSessionEvents()
    const assign = vi.fn()
    const order: string[] = []
    const store = createDraftStore()
    const write = store.write
    store.write = (...args) => {
      order.push(`write, dialog=${String(screen.queryByRole("alertdialog") !== null)}`)
      write(...args)
    }
    render(<Page events={events} assign={assign} store={store} />)
    await edit()
    type(number(), "4155550000")
    // The base hash is cached when the base is first seen: the flush never hashes.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    act(() => events.publish("session-expired"))
    expect(order).toEqual(["write, dialog=false"])
    expect(screen.getByRole("alertdialog", { name: "Your session ended" })).toBeTruthy()
    expect(stored()).toMatchObject({ values: { number: "4155550000", note: "" } })
    fireEvent.click(button("Return to 1health"))
    expect(assign).toHaveBeenCalledWith(PORTAL)
    expect(stored()).not.toBeNull()
  })

  it("the portal exit purges only this user's drafts; a hand-off keeps them", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" }, 7)
    render(<Page />)
    await screen.findByText(restoreText)
    const location = { pathname: "/", search: "", assign: vi.fn() }
    const deps = { router: { push: vi.fn() }, portalUrl: PORTAL, location, logout: async () => undefined }
    await act(async () => void (await navigate({ external: "handoff", href: "/handoff/portal" }, deps)))
    expect(stored()).not.toBeNull()
    resetLeaveState()
    await act(async () => void (await navigate({ external: "portal" }, deps)))
    expect(location.assign).toHaveBeenLastCalledWith(PORTAL)
    expect(stored()).toBeNull()
    expect(stored(draftKey(owner(7), "phone"))).not.toBeNull()
  })

  it("nothing is written before myself loads", async () => {
    const view = render(<Page userId={null} />)
    await edit()
    type(number(), "4155550000")
    fireEvent(window, new Event("pagehide"))
    expect(window.localStorage.length).toBe(0)
    view.unmount()
  })
})

describe("review fixes", () => {
  it("works under StrictMode (the controller survives the effect re-run): offers, restores and writes", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    render(<Page strict />)
    await screen.findByText(restoreText)
    fireEvent.click(button("Restore"))
    await waitFor(() => expect(number().value).toBe("4155550000"))
    type(number(), "4155550002")
    fireEvent(window, new Event("pagehide"))
    expect(stored()).toMatchObject({ values: { number: "4155550002", note: "" } })
  })

  it("Keep mine with no further typing: the next flush rewrites the draft with the CURRENT base hash", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "work" })
    render(<Page baseline={CURRENT} />)
    await screen.findByText(conflictText)
    fireEvent.click(button("Keep mine"))
    await waitFor(() => expect(number().value).toBe("4155550000"))
    expect(registry?.get("phone")?.userChanged).toBe(true)
    fireEvent(window, new Event("pagehide"))
    expect(stored()?.baseHash).toBe(await hashDraftBase({ number: CURRENT.number, note: CURRENT.note }))
    expect(stored()?.values).toEqual({ number: "4155550000", note: "work" })
  })

  it("Edit then Cancel with no change keeps the offered draft", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    render(<Page />)
    await screen.findByText(restoreText)
    await edit()
    await act(async () => fireEvent.click(button("Cancel")))
    expect(stored()).not.toBeNull()
    expect(screen.getByText(restoreText)).toBeTruthy()
  })

  it("a conflict whose compare has no rows is dropped: no banner, no key", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: CURRENT.number, note: "" })
    render(<Page baseline={CURRENT} />)
    await waitFor(() => expect(stored()).toBeNull())
    expect(screen.queryByText(conflictText)).toBeNull()
  })

  it("a draftable Section that doesn't say its data loaded offers nothing (no false conflict from a placeholder)", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    render(<Page baseline={CURRENT} dataStatus={undefined} />)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByText(conflictText)).toBeNull()
    expect(stored()).not.toBeNull()
  })

  it("flushes when the page turns hidden (not when visible)", async () => {
    render(<Page />)
    await edit()
    type(number(), "4155550000")
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    fireEvent(document, new Event("visibilitychange"))
    expect(stored()).toBeNull()
    visibility.mockReturnValue("hidden")
    fireEvent(document, new Event("visibilitychange"))
    expect(stored()).toMatchObject({ values: { number: "4155550000", note: "" } })
  })

  it("unmounting a dirty Section writes its latest edit at once; so does unmounting the whole page", async () => {
    const view = render(<Page />)
    await edit()
    type(number(), "4155550000")
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    view.rerender(<Page hideSection />)
    expect(stored()).toMatchObject({ values: { number: "4155550000", note: "" } })
    view.rerender(<Page />)
    await edit()
    type(number(), "4155550001")
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    view.unmount()
    expect(stored()).toMatchObject({ values: { number: "4155550001", note: "" } })
  })

  it("after the portal purge, nothing rewrites a draft (pagehide, pending debounce)", async () => {
    render(<Page />)
    await edit()
    type(number(), "4155550000")
    fireEvent(window, new Event("pagehide"))
    type(number(), "4155550001")
    const location = { pathname: "/", search: "", assign: vi.fn() }
    let left: Promise<boolean> = Promise.resolve(false)
    act(() => {
      left = navigate({ external: "portal" }, { router: { push: vi.fn() }, portalUrl: PORTAL, location, logout: async () => undefined })
    })
    // The leave guard asks first; Discard, then the purge runs.
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard" })))
    expect(await left).toBe(true)
    fireEvent(window, new Event("pagehide"))
    await act(async () => new Promise((resolve) => setTimeout(resolve, DRAFT_DEBOUNCE_MS + 50)))
    expect(stored()).toBeNull()
  })

  it("names the Section in each choice's accessible description", async () => {
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    const view = render(<Page />)
    await screen.findByText(restoreText)
    for (const name of ["Restore", "Discard"]) expect(button(name).getAttribute("aria-describedby")).toBe("phone-heading")
    expect(screen.getByText(restoreText).getAttribute("role")).toBe("status")
    view.unmount()
    window.localStorage.clear()
    await storeDraft(FIXTURE_BASELINE, { number: "4155550000", note: "" })
    render(<Page baseline={CURRENT} />)
    await screen.findByText(conflictText)
    for (const name of ["Use current", "Keep mine"]) expect(button(name).getAttribute("aria-describedby")).toBe("phone-heading")
    expect(screen.getByText(conflictText).getAttribute("role")).toBe("status")
  })
})
