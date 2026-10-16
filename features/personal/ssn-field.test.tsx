import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { useEffect } from "react"
import { useSWRConfig, type Cache, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { keys, sessionEvents } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { PersonalSection } from "."
import { SSN_REVEAL_SECONDS, SsnValue } from "./ssn-field"

// The Section's own toasts, observed (nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))

/**
 * Story 2.3 (NG-9022): SSN Reveal in the read view (`SsnValue`) and the SSN
 * input in the edit view (`PersonalSection`), covering the I/O matrix of
 * `spec-2-3-ssn-entry-and-reveal.md`: Reveal, every auto-hide trigger under
 * fake timers, focus, reduced motion, the announcement, failures, typing and
 * the no-leak assertions.
 */

const EXPOSE = "/api/1h/v2/person/me/ssn/expose"
const EDIT = "/api/1h/v2/user/edit"
const MYSELF = "/api/1h/v2/user/myself"
const MASK = "***-**-6789"
const SSN = "123-45-6789"
/** Any nine-digit SSN, with or without hyphens (not part of a longer number such as a phone or a timestamp). */
const SSN_SHAPE = /(?<![\d-])\d{3}-?\d{2}-?\d{4}(?![\d-])/
const SHOWN = "Social Security number shown, hides in 30 seconds"
const FAILED = "Couldn't show your SSN. Try again."

/** Answers the expose call with `response()` (default: the 9 digits); returns the call count. */
function mockExpose(response: () => Response | Promise<Response> = () => HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" })) {
  let calls = 0
  server.use(
    http.get(EXPOSE, () => {
      calls += 1
      return response()
    }),
  )
  return () => calls
}

const revealButton = () => screen.getByRole("button", { name: "Reveal SSN" })
const hideButton = () => screen.getByRole("button", { name: "Hide SSN" })
const status = () => screen.getAllByRole("status").find((el) => el.getAttribute("data-slot") === "live-status") as HTMLElement

/** Clicks Reveal as a browser does (the button takes focus first) and waits for Hide. */
async function clickReveal() {
  revealButton().focus()
  await act(async () => fireEvent.click(revealButton()))
  await waitFor(() => expect(screen.queryByRole("button", { name: "Hide SSN" })).not.toBeNull())
}

async function renderRead(mask = MASK) {
  const result = render(<SsnValue mask={mask} />)
  return result
}

/** Fake timers that still advance with real time (MSW and `waitFor` keep working). */
function fakeTimers() {
  vi.useFakeTimers({ shouldAdvanceTime: true })
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

/** Every attribute value in the document (an SSN must never land in one). */
function attributeValues(): string[] {
  return [...document.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((attr) => `${attr.name}=${attr.value}`))
}

/** Every value in both storages. */
function storageValues(): string[] {
  const values: string[] = []
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) ?? ""
      values.push(`${key}=${storage.getItem(key) ?? ""}`)
    }
  }
  return values
}

/** Spies on every console method, so a leak through any of them is caught. */
function spyConsole() {
  return (["log", "info", "warn", "error", "debug", "group", "groupCollapsed", "table", "trace"] as const).map((method) => vi.spyOn(console, method))
}

function consoleText(spies: ReturnType<typeof spyConsole>): string {
  return spies.flatMap((spy) => spy.mock.calls).map((args) => args.map((arg) => (arg instanceof Error ? arg.message : JSON.stringify(arg) ?? String(arg))).join(" ")).join("\n")
}

/** Captures the SWR cache (and its mutate) of the page tree. */
let swrCache: Cache | undefined
let swrMutate: ScopedMutator | undefined
function CacheProbe() {
  const { cache, mutate } = useSWRConfig()
  useEffect(() => {
    swrCache = cache
    swrMutate = mutate
  }, [cache, mutate])
  return null
}

/**
 * The page's own `myself` refetch after a save (`mutateMyself` revalidates the
 * app's default cache; the test tree has its own).
 */
async function refetchMyself() {
  await act(async () => {
    await swrMutate?.(keys.myself())
  })
}

function swrText(): string {
  if (!swrCache) throw new Error("no SWR cache")
  const cache = swrCache
  return [...cache.keys()].map((key) => `${key} ${JSON.stringify(cache.get(key) ?? null)}`).join("\n")
}

beforeEach(() => {
  stubViewport(360)
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.documentElement.classList.remove("dark")
  Reflect.deleteProperty(document, "visibilityState")
})

describe("SsnValue: Reveal (read view)", () => {
  it("shows the mask (aria-hidden, \"SSN ending in 6789\" for screen readers) and a 44 px underlined link-text Reveal with an eye icon", async () => {
    await renderRead()
    const mask = screen.getByText(MASK)
    expect(mask.classList.contains("mono-value")).toBe(true)
    expect(mask.getAttribute("aria-hidden")).toBe("true")
    expect(screen.getByText("SSN ending in 6789").classList.contains("sr-only")).toBe(true)
    const button = revealButton()
    expect(button.textContent).toBe("Reveal")
    expect(button.getAttribute("type")).toBe("button")
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    for (const name of ["text-link-text", "underline", "h-11", "min-w-11"]) expect(button.classList.contains(name), name).toBe(true)
  })

  it("a mask without digits stays readable as is", async () => {
    await renderRead("***-**-****")
    expect(screen.getByText("***-**-****").getAttribute("aria-hidden")).toBeNull()
    expect(screen.queryByText(/SSN ending in/)).toBeNull()
  })

  it("Reveal shows the full SSN in mono with the ring and Hide, announces it, and moves focus to Hide", async () => {
    const calls = mockExpose()
    await renderRead()
    await clickReveal()
    expect(calls()).toBe(1)
    const value = screen.getByText(SSN)
    expect(value.classList.contains("mono-value")).toBe(true)
    expect(screen.queryByText(MASK)).toBeNull()
    expect(screen.queryByRole("button", { name: "Reveal SSN" })).toBeNull()
    expect(document.activeElement).toBe(hideButton())
    expect(hideButton().textContent).toBe("Hide")
    expect(hideButton().classList.contains("h-11")).toBe(true)
    expect(status().textContent).toBe(SHOWN)
    const ring = document.querySelector('[data-slot="ssn-countdown-ring"]')
    expect(ring?.getAttribute("aria-hidden")).toBe("true")
    expect(ring?.getAttribute("width")).toBe("16")
  })

  it("reduced motion: the ring hides and the static \"Hides in 30 s\" shows instead", async () => {
    mockExpose()
    await renderRead()
    await clickReveal()
    const ring = document.querySelector('[data-slot="ssn-countdown-ring"]') as Element
    expect(ring.classList.contains("motion-reduce:hidden")).toBe(true)
    const text = screen.getByText("Hides in 30 s")
    expect(text.classList.contains("hidden")).toBe(true)
    expect(text.classList.contains("motion-reduce:inline")).toBe(true)
  })

  it.each([
    ["a 500", () => HttpResponse.json({ message: "boom" }, { status: 500 })],
    ["a 403", () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })],
    ["a 400", () => HttpResponse.json({ message: "No SSN" }, { status: 400 })],
    ["a network failure", () => HttpResponse.error()],
    ["n/a", () => HttpResponse.json({ id: 4242, socialSecurityNumber: "n/a" })],
    ["a bad shape", () => HttpResponse.json({ id: 4242 })],
  ])("%s keeps the mask and shows \"Couldn't show your SSN. Try again.\" (polite, not aria-invalid)", async (_name, response) => {
    mockExpose(response)
    await renderRead()
    revealButton().focus()
    await act(async () => fireEvent.click(revealButton()))
    const line = await screen.findByText(FAILED)
    expect(line.closest('[aria-live="polite"]')).not.toBeNull()
    expect(document.querySelector("[aria-invalid]")).toBeNull()
    expect(screen.getByText(MASK)).toBeTruthy()
    expect(document.activeElement).toBe(revealButton())
  })

  it("the next Reveal clears the failure line", async () => {
    let fail = true
    let release: () => void = () => undefined
    mockExpose(async () => {
      if (fail) return HttpResponse.json({ message: "boom" }, { status: 500 })
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" })
    })
    await renderRead()
    await act(async () => fireEvent.click(revealButton()))
    await screen.findByText(FAILED)
    fail = false
    await act(async () => fireEvent.click(revealButton()))
    expect(screen.queryByText(FAILED)).toBeNull()
    await act(async () => release())
    await screen.findByText(SSN)
  })

  it("a session failure shows nothing (the shell handles it)", async () => {
    mockExpose(() => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }))
    await renderRead()
    await act(async () => fireEvent.click(revealButton()))
    await waitFor(() => expect(sessionEvents.hasPublished("session-expired")).toBe(true))
    expect(screen.queryByText(FAILED)).toBeNull()
    expect(screen.getByText(MASK)).toBeTruthy()
  })

  it("after session-expired was published, Reveal reveals nothing (200) and shows no failure (401 SESSION_EXPIRED)", async () => {
    sessionEvents.publish("session-expired")
    mockExpose()
    await renderRead()
    await act(async () => fireEvent.click(revealButton()))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
    expect(screen.getByText(MASK)).toBeTruthy()
    mockExpose(() => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }))
    await act(async () => fireEvent.click(revealButton()))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText(FAILED)).toBeNull()
    expect(screen.getByText(MASK)).toBeTruthy()
  })

  it("focus moves to Hide when it is still on Reveal; an answer after the user moved focus elsewhere leaves it there", async () => {
    let release: () => void = () => undefined
    mockExpose(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" })
    })
    const { unmount } = await renderRead()
    revealButton().focus()
    await act(async () => fireEvent.click(revealButton()))
    await act(async () => release())
    await screen.findByText(SSN)
    expect(document.activeElement).toBe(hideButton())
    unmount()

    const other = document.createElement("button")
    document.body.append(other)
    await renderRead()
    revealButton().focus()
    await act(async () => fireEvent.click(revealButton()))
    other.focus()
    await act(async () => release())
    await screen.findByText(SSN)
    expect(document.activeElement).toBe(other)
    other.remove()
  })

  it("a second click while the first Reveal is in flight sends nothing more", async () => {
    let release: () => void = () => undefined
    const calls = mockExpose(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" })
    })
    await renderRead()
    await act(async () => fireEvent.click(revealButton()))
    await act(async () => fireEvent.click(revealButton()))
    await act(async () => release())
    await screen.findByText(SSN)
    expect(calls()).toBe(1)
  })
})

describe("SsnValue: auto-hide (fake timers)", () => {
  /** Reveals, with focus on Hide; `SSN` shows. */
  async function revealed() {
    fakeTimers()
    mockExpose()
    const result = await renderRead()
    await clickReveal()
    expect(screen.getByText(SSN)).toBeTruthy()
    return result
  }

  /** The SSN is gone at once, the mask is back, the announcement cleared. */
  function expectHidden() {
    expect(screen.queryByText(SSN)).toBeNull()
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
    expect(screen.getByText(MASK)).toBeTruthy()
    expect(status().textContent).toBe("")
  }

  it("after 30 s (not before); focus on Hide moves to Reveal", async () => {
    await revealed()
    await advance((SSN_REVEAL_SECONDS - 1) * 1000)
    expect(screen.getByText(SSN)).toBeTruthy()
    await advance(1000)
    expectHidden()
    expect(document.activeElement).toBe(revealButton())
  })

  it("Hide hides at once and focuses Reveal", async () => {
    await revealed()
    await advance(5000)
    await act(async () => fireEvent.click(hideButton()))
    expectHidden()
    expect(document.activeElement).toBe(revealButton())
    // The countdown is gone with it: nothing changes later.
    await advance(SSN_REVEAL_SECONDS * 1000)
    expectHidden()
  })

  it("window blur", async () => {
    await revealed()
    await advance(1000)
    await act(async () => fireEvent.blur(window))
    expectHidden()
    expect(document.activeElement).toBe(revealButton())
  })

  it("visibilitychange to hidden (not to visible)", async () => {
    await revealed()
    await advance(1000)
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
    await act(async () => document.dispatchEvent(new Event("visibilitychange")))
    expect(screen.getByText(SSN)).toBeTruthy()
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
    await act(async () => document.dispatchEvent(new Event("visibilitychange")))
    expectHidden()
  })

  it("pagehide", async () => {
    await revealed()
    await advance(1000)
    await act(async () => fireEvent(window, new Event("pagehide")))
    expectHidden()
  })

  it("session-expired", async () => {
    await revealed()
    await advance(1000)
    await act(async () => sessionEvents.publish("session-expired"))
    expectHidden()
  })

  it("focus elsewhere stays where it is when the SSN hides", async () => {
    await revealed()
    const other = document.createElement("button")
    document.body.append(other)
    other.focus()
    await advance(SSN_REVEAL_SECONDS * 1000)
    expectHidden()
    expect(document.activeElement).toBe(other)
    other.remove()
  })

  it("unmount clears it and stops the countdown", async () => {
    fakeTimers()
    const idle = vi.getTimerCount()
    mockExpose()
    const { unmount } = await renderRead()
    await clickReveal()
    expect(vi.getTimerCount()).toBeGreaterThan(idle)
    await advance(1000)
    unmount()
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
    // Nothing of the reveal keeps running (the request's own timers end too).
    await advance(60_000)
    expect(vi.getTimerCount()).toBe(idle)
  })

  it.each([
    ["window blur", () => fireEvent.blur(window), true],
    ["pagehide", () => fireEvent(window, new Event("pagehide")), true],
    // The session is over: no later Reveal either.
    ["session-expired", () => sessionEvents.publish("session-expired"), false],
  ])("an answer that arrives after %s is dropped", async (_name, trigger, revealsLater) => {
    fakeTimers()
    let release: () => void = () => undefined
    mockExpose(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" })
    })
    await renderRead()
    await act(async () => fireEvent.click(revealButton()))
    await act(async () => trigger())
    await act(async () => release())
    await advance(100)
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
    expect(screen.getByText(MASK)).toBeTruthy()
    if (!revealsLater) return
    // A later Reveal works again.
    mockExpose()
    await clickReveal()
    expect(screen.getByText(SSN)).toBeTruthy()
  })

  it("an answer that arrives after unmount is dropped", async () => {
    fakeTimers()
    let release: () => void = () => undefined
    mockExpose(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" })
    })
    const { unmount } = await renderRead()
    await act(async () => fireEvent.click(revealButton()))
    unmount()
    await act(async () => release())
    await advance(100)
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
  })
})

describe("SsnValue: never stored", () => {
  it("after a reveal no 9-digit SSN is in the SWR cache, either storage, the console, the URL, the drafts or any attribute", async () => {
    const spies = spyConsole()
    mockExpose()
    renderInPage(
      <>
        <PersonalSection />
        <CacheProbe />
      </>,
      { page: "profile", myself: myselfWire({ socialSecurityNumber: MASK }) },
    )
    await screen.findByRole("table", { name: "Personal information" })
    await clickReveal()
    expect(screen.getByText(SSN)).toBeTruthy()
    // Give the drafts store its debounce, so anything it would write is written.
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(swrText()).not.toMatch(SSN_SHAPE)
    expect(storageValues().join("\n")).not.toMatch(SSN_SHAPE)
    expect(consoleText(spies)).not.toMatch(SSN_SHAPE)
    expect(window.location.href).not.toMatch(SSN_SHAPE)
    expect(attributeValues().join("\n")).not.toMatch(SSN_SHAPE)
  })
})

// --- Edit view ----------------------------------------------------------------------------------

const FULL = myselfWire({ birthDate: "1987-03-09", socialSecurityNumber: MASK })
const DRAFT_KEY = "pp:draft:v1:demo:42:personal"

/** Records each `PUT v2/user/edit` body; the follow-up `myself` answers `after` once a PUT went out. */
function recordSaves(after: Record<string, unknown> = FULL, answer: () => Response = () => HttpResponse.json(after)) {
  const bodies: Record<string, unknown>[] = []
  const handlers = [
    http.put(EDIT, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return answer()
    }),
    http.get(MYSELF, () => HttpResponse.json(bodies.length > 0 ? after : FULL)),
  ]
  return { bodies, handlers }
}

async function renderEditing(myself: Record<string, unknown> = FULL, handlers: Parameters<typeof renderInPage>[1]["handlers"] = []) {
  const result = renderInPage(
    <>
      <PersonalSection />
      <CacheProbe />
    </>,
    { page: "profile", myself, handlers },
  )
  await screen.findByRole("table", { name: "Personal information" })
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
  return result
}

const ssnInput = () => screen.getByLabelText(/^SSN \(optional\)$/) as HTMLInputElement
const section = () => screen.getByRole("region", { name: "Personal information" })
const isReadView = () => screen.queryByRole("table", { name: "Personal information" }) !== null && screen.queryByRole("button", { name: "Save" }) === null

async function typeSsn(value: string) {
  await act(async () => fireEvent.change(ssnInput(), { target: { value } }))
}

async function save() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
}

/** The texts the SSN input's `aria-describedby` points at. */
function describedBy(element: HTMLElement): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
    .join(" | ")
}

describe("SsnInput: the edit view's SSN field", () => {
  it("is a 15th field after Sexual orientation, kept out of autofill: no ssn/social in its name or id", async () => {
    await renderEditing()
    const input = ssnInput()
    expect(input.id).toBe("personal-ref-number")
    expect(input.name).toBe("pp-ref-number")
    expect(`${input.id} ${input.name}`).not.toMatch(/ssn|social/i)
    expect(input.getAttribute("autocomplete")).toBe("off")
    expect(input.getAttribute("spellcheck")).toBe("false")
    expect(input.getAttribute("autocapitalize")).toBe("off")
    expect(input.getAttribute("autocorrect")).toBe("off")
    expect(input.getAttribute("inputmode")).toBe("numeric")
    expect(input.hasAttribute("data-1p-ignore")).toBe(true)
    expect(input.getAttribute("data-lpignore")).toBe("true")
    expect(input.getAttribute("data-form-type")).toBe("other")
    expect(input.value).toBe(MASK)
    expect(input.hasAttribute("value")).toBe(false)
    expect(describedBy(input)).toBe("Type a new number to replace it.")
    expect(within(section()).getByRole("button", { name: "Reveal SSN" })).toBeTruthy()
  })

  it("without a saved SSN the input is empty, with no Reveal and no help", async () => {
    await renderEditing(myselfWire({ birthDate: "1987-03-09", socialSecurityNumber: "n/a" }))
    expect(ssnInput().value).toBe("")
    expect(screen.queryByRole("button", { name: "Reveal SSN" })).toBeNull()
    expect(ssnInput().getAttribute("aria-describedby")).toBeNull()
  })

  it("Reveal in edit shows the value in the input (form value stays the mask), the revealed help and Hide with focus", async () => {
    mockExpose()
    const { registry } = await renderEditing()
    await clickReveal()
    expect(ssnInput().value).toBe(SSN)
    expect(ssnInput().hasAttribute("value")).toBe(false)
    expect(describedBy(ssnInput())).toBe("Format XXX-XX-XXXX. Hides in 30 s. Clear it to remove your SSN.")
    expect(document.activeElement).toBe(hideButton())
    expect(status().textContent).toBe(SHOWN)
    // Not a change: the form still holds the mask.
    expect(registry.get("personal")?.isDirty).toBe(false)
    expect(attributeValues().join("\n")).not.toMatch(SSN_SHAPE)
    await act(async () => fireEvent.click(hideButton()))
    expect(ssnInput().value).toBe(MASK)
    expect(document.activeElement).toBe(revealButton())
  })

  it("auto-hides in edit after 30 s (fake timers), and on Cancel", async () => {
    fakeTimers()
    mockExpose()
    await renderEditing()
    await clickReveal()
    await advance(SSN_REVEAL_SECONDS * 1000)
    expect(ssnInput().value).toBe(MASK)
    await clickReveal()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })))
    expect(isReadView()).toBe(true)
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
    expect(screen.getByText(MASK)).toBeTruthy()
  })

  it("Save while revealed and untouched (fake timers): the edit view unmounts, no SSN is sent, the mask is back", async () => {
    fakeTimers()
    mockExpose()
    const { bodies, handlers } = recordSaves()
    await renderEditing(FULL, handlers)
    await clickReveal()
    await act(async () => fireEvent.change(screen.getByLabelText(/^First name$/), { target: { value: "Anna" } }))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ firstName: "Anna" }])
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
    await advance(SSN_REVEAL_SECONDS * 1000)
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
  })

  it("an untouched mask (revealed or not) is never sent", async () => {
    mockExpose()
    const { bodies, handlers } = recordSaves()
    await renderEditing(FULL, handlers)
    await act(async () => fireEvent.change(screen.getByLabelText(/^First name$/), { target: { value: "Anna" } }))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ firstName: "Anna" }])
  })

  it("typing 123456789 over the mask gives 123-45-6789 and Save sends it", async () => {
    const { bodies, handlers } = recordSaves({ ...FULL, socialSecurityNumber: "***-**-6789" })
    await renderEditing(myselfWire({ birthDate: "1987-03-09", socialSecurityNumber: "***-**-1234" }), handlers)
    await typeSsn("123456789")
    expect(ssnInput().value).toBe(SSN)
    expect(screen.queryByRole("button", { name: "Reveal SSN" })).toBeNull()
    expect(ssnInput().getAttribute("aria-describedby")).toBeNull()
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ socialSecurityNumber: SSN }])
  })

  it.each(["123 45 6789", "123-45-6789", "123456789"])("a paste of %j into the empty field gives 123-45-6789", async (pasted) => {
    await renderEditing(myselfWire({ socialSecurityNumber: null }))
    await typeSsn(pasted)
    expect(ssnInput().value).toBe(SSN)
  })

  it("non-digits are ignored and at most nine digits are kept", async () => {
    await renderEditing(myselfWire({ socialSecurityNumber: null }))
    await typeSsn("12a")
    expect(ssnInput().value).toBe("12")
    await typeSsn("12a3")
    expect(ssnInput().value).toBe("123")
    await typeSsn("1234")
    expect(ssnInput().value).toBe("123-4")
    await typeSsn("123-4x")
    expect(ssnInput().value).toBe("123-4")
    await typeSsn(SSN)
    // A tenth digit typed into a full number is ignored.
    await typeSsn(`${SSN}0`)
    expect(ssnInput().value).toBe(SSN)
  })

  it("keeps the caret on its digit, and Backspace / Delete across a hyphen remove the digit beyond it", async () => {
    await renderEditing(myselfWire({ socialSecurityNumber: null }))
    await typeSsn("12345")
    const input = ssnInput()
    expect(input.value).toBe("123-45")
    input.setSelectionRange(4, 4)
    await act(async () => fireEvent.keyDown(input, { key: "Backspace" }))
    expect(input.value).toBe("124-5")
    expect(input.selectionStart).toBe(2)
    await typeSsn("123-45")
    input.setSelectionRange(3, 3)
    await act(async () => fireEvent.keyDown(input, { key: "Delete" }))
    expect(input.value).toBe("123-5")
    expect(input.selectionStart).toBe(3)
    // A digit typed before the hyphen: the caret stays after it.
    await typeSsn("1293-5")
    expect(input.value).toBe("129-35")
  })

  it("over the mask: a typed digit replaces it, a deletion clears the field, a letter changes nothing", async () => {
    await renderEditing()
    await typeSsn(`${MASK}5`)
    expect(ssnInput().value).toBe("5")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
    await typeSsn("***-**-678")
    expect(ssnInput().value).toBe("")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
    await typeSsn(`${MASK}x`)
    expect(ssnInput().value).toBe(MASK)
    expect(screen.getByRole("button", { name: "Reveal SSN" })).toBeTruthy()
  })

  it("the selection recorded on the paste (or key) is what the pasted digits replace, even next to matching mask digits", async () => {
    await renderEditing()
    const input = ssnInput()
    input.setSelectionRange(6, 11)
    await act(async () => fireEvent.paste(input))
    await typeSsn("***-**123456789")
    expect(input.value).toBe(SSN)
    expect(input.selectionStart).toBe(SSN.length)
  })

  it("typing over the mask while a Reveal is in flight: the late answer is dropped, the typed value stays", async () => {
    let release: () => void = () => undefined
    mockExpose(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" })
    })
    await renderEditing()
    await act(async () => fireEvent.click(revealButton()))
    await typeSsn("5")
    await act(async () => release())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(ssnInput().value).toBe("5")
    expect(screen.queryByRole("button", { name: "Hide SSN" })).toBeNull()
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
  })

  it("the first edit after a failed Reveal clears the failure line", async () => {
    mockExpose(() => HttpResponse.json({ message: "boom" }, { status: 500 }))
    await renderEditing()
    await act(async () => fireEvent.click(revealButton()))
    await screen.findByText(FAILED)
    await typeSsn("5")
    expect(screen.queryByText(FAILED)).toBeNull()
    expect(screen.queryByRole("button", { name: "Reveal SSN" })).toBeNull()
  })

  it("while saving nothing is revealed and there is no Reveal; after a failed save it stays masked", async () => {
    mockExpose()
    let releasePut: () => void = () => undefined
    const handlers = [
      http.put(EDIT, async () => {
        await new Promise<void>((resolve) => {
          releasePut = resolve
        })
        return HttpResponse.json({ message: "boom" }, { status: 500 })
      }),
    ]
    await renderEditing(FULL, handlers)
    await clickReveal()
    expect(ssnInput().value).toBe(SSN)
    await act(async () => fireEvent.change(screen.getByLabelText(/^First name$/), { target: { value: "Anna" } }))
    await save()
    await waitFor(() => expect(ssnInput().readOnly).toBe(true))
    expect(ssnInput().value).toBe(MASK)
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
    expect(screen.queryByRole("button", { name: "Reveal SSN" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Hide SSN" })).toBeNull()
    await act(async () => releasePut())
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeTruthy())
    expect(ssnInput().value).toBe(MASK)
    expect(document.body.textContent).not.toMatch(SSN_SHAPE)
    expect(revealButton()).toBeTruthy()
  })

  it("a paste of a full SSN into a partly filled field is the pasted number (paste event, or an insert)", async () => {
    await renderEditing(myselfWire({ socialSecurityNumber: null }))
    await typeSsn("12")
    await act(async () => fireEvent.paste(ssnInput(), { clipboardData: { getData: () => "123456789" } }))
    expect(ssnInput().value).toBe(SSN)
    await typeSsn("12")
    await typeSsn("12123456789")
    expect(ssnInput().value).toBe(SSN)
  })

  it("a paste of ten or more digits over a full value keeps the pasted first nine; a single tenth typed digit is ignored", async () => {
    await renderEditing(myselfWire({ socialSecurityNumber: null }))
    await typeSsn(SSN)
    ssnInput().setSelectionRange(0, SSN.length)
    await act(async () => fireEvent.paste(ssnInput(), { clipboardData: { getData: () => "9876543210" } }))
    expect(ssnInput().value).toBe("987-65-4321")
    await typeSsn("9876543210")
    expect(ssnInput().value).toBe("987-65-4321")
    await typeSsn("987-65-43210")
    expect(ssnInput().value).toBe("987-65-4321")
  })

  it("a partial SSN reads \"Enter all 9 digits of your SSN\" on blur and on Save; nothing is sent", async () => {
    const { bodies, handlers } = recordSaves()
    await renderEditing(FULL, handlers)
    await typeSsn("12345")
    await act(async () => fireEvent.blur(ssnInput()))
    await waitFor(() => expect(describedBy(ssnInput())).toContain("Enter all 9 digits of your SSN"))
    expect(ssnInput().getAttribute("aria-invalid")).toBe("true")
    await save()
    expect(document.activeElement).toBe(ssnInput())
    expect(bodies).toEqual([])
  })

  it("clearing a saved SSN sends exactly n/a; the read view then says \"Not provided\"", async () => {
    const { bodies, handlers } = recordSaves({ ...FULL, socialSecurityNumber: "n/a" })
    await renderEditing(FULL, handlers)
    await typeSsn("")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ socialSecurityNumber: "n/a" }])
    await refetchMyself()
    const key = screen.getByRole("rowheader", { name: "SSN" })
    await waitFor(() => expect(document.querySelector(`td[headers="${key.id}"]`)?.textContent).toBe("Not provided"))
  })

  it("editing a revealed value (fake timers) makes it a new entry: no countdown, still shown after 30 s, Save sends it", async () => {
    fakeTimers()
    mockExpose()
    const { bodies, handlers } = recordSaves()
    await renderEditing(FULL, handlers)
    await clickReveal()
    await typeSsn("123-45-678")
    expect(ssnInput().value).toBe("123-45-678")
    expect(screen.queryByRole("button", { name: "Hide SSN" })).toBeNull()
    expect(document.querySelector('[data-slot="ssn-countdown-ring"]')).toBeNull()
    await typeSsn("123-45-6780")
    await advance((SSN_REVEAL_SECONDS + 1) * 1000)
    await act(async () => fireEvent.blur(window))
    expect(ssnInput().value).toBe("123-45-6780")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ socialSecurityNumber: "123-45-6780" }])
  })

  it("a non-digit typed into a revealed value changes nothing (still revealed)", async () => {
    mockExpose()
    await renderEditing()
    await clickReveal()
    await typeSsn(`${SSN}x`)
    expect(ssnInput().value).toBe(SSN)
    expect(hideButton()).toBeTruthy()
  })

  it("after a typed save no SSN stays in the form, the drafts, SWR, storage, the URL or the console", async () => {
    const spies = spyConsole()
    const { bodies, handlers } = recordSaves({ ...FULL, socialSecurityNumber: "***-**-6789" })
    await renderEditing(myselfWire({ birthDate: "1987-03-09", socialSecurityNumber: "***-**-1234" }), handlers)
    await typeSsn(SSN)
    await act(async () => fireEvent.change(screen.getByLabelText(/^First name$/), { target: { value: "Anna" } }))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    expect(window.localStorage.getItem(DRAFT_KEY)).not.toMatch(SSN_SHAPE)
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ firstName: "Anna", socialSecurityNumber: SSN }])
    await refetchMyself()
    await waitFor(() => expect(screen.getByText("***-**-6789")).toBeTruthy())
    expect(swrText()).not.toMatch(SSN_SHAPE)
    expect(storageValues().join("\n")).not.toMatch(SSN_SHAPE)
    expect(consoleText(spies)).not.toMatch(SSN_SHAPE)
    expect(window.location.href).not.toMatch(SSN_SHAPE)
    expect(document.body.innerHTML).not.toMatch(SSN_SHAPE)
    // The form baseline is the new mask (the typed SSN left the form state): no change, nothing sent.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
    expect(ssnInput().value).toBe("***-**-6789")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(1)
  })
})

describe("SSN accessibility", () => {
  it.each(["light", "dark"])("read view revealed has no axe violations in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    mockExpose()
    renderInPage(<PersonalSection />, { page: "profile", myself: FULL })
    await screen.findByRole("table", { name: "Personal information" })
    expect(await axeViolations()).toEqual([])
    await clickReveal()
    expect(await axeViolations()).toEqual([])
  })

  it.each([
    ["light", 360],
    ["dark", 1024],
  ] as const)("edit view revealed, and with the reveal failure, has no axe violations in %s mode at %i px", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    let fail = false
    mockExpose(() => (fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" })))
    await renderEditing()
    await clickReveal()
    expect(await axeViolations()).toEqual([])
    await act(async () => fireEvent.click(hideButton()))
    fail = true
    await act(async () => fireEvent.click(revealButton()))
    await screen.findByText(FAILED)
    expect(await axeViolations()).toEqual([])
  })
})
