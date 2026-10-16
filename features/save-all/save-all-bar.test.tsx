import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Input } from "@/components/ui/input"
import {
  KeyValueEditTable,
  KeyValueTable,
  SAVE_ORDER,
  SESSION_EXPIRED_CODE,
  SectionFooter,
  SectionLandmark,
  sectionHeadingId,
  toastPartial,
  toastSuccess,
  useRegisterSection,
  useSectionForm,
  type SaveResult,
  type SectionId,
} from "@/features/shell"
import { FixtureParticipant, type FixtureParticipantProps } from "@/features/shell/__fixtures__/fixture-participant"
import { fixtureSectionSchema, type FixtureSectionValues } from "@/features/shell/__fixtures__/schema"
import { pageUser } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { renderInPage } from "@/test/providers"
import { PILL_TOAST_OFFSET, SaveAllBar, TOAST_OFFSET_PROPERTY } from "./save-all-bar"
import { KEYBOARD_MIN_SHRINK_PX } from "./use-on-screen-keyboard"

vi.mock("@/features/shell/toasts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/shell/toasts")>()),
  toastSuccess: vi.fn(() => ({ id: "t", dismiss: () => undefined })),
  toastPartial: vi.fn(() => ({ id: "t", dismiss: () => undefined })),
  toastError: vi.fn(() => ({ id: "t", dismiss: () => undefined })),
}))

/* ---------- environment: viewport width, reduced motion, visual viewport, layout ---------- */

const media = { width: 1024, reduced: false }
const mediaListeners = new Set<() => void>()

function stubMedia(width: number, reduced = false): void {
  media.width = width
  media.reduced = reduced
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      if (query.includes("prefers-reduced-motion: reduce")) return media.reduced
      const min = /min-width:\s*(\d+)px/.exec(query)
      return !min || media.width >= Number(min[1])
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
  }))
}

function resizeTo(width: number): void {
  act(() => {
    media.width = width
    for (const listener of [...mediaListeners]) listener()
  })
}

/** A `visualViewport` whose height the test sets (an on-screen keyboard shrinks it). */
class FakeVisualViewport extends EventTarget {
  height = window.innerHeight
  shrinkBy(px: number): void {
    act(() => {
      this.height = window.innerHeight - px
      this.dispatchEvent(new Event("resize"))
    })
  }
}

const BAR_HEIGHT = 57
let scrolls: { el: Element; options: ScrollIntoViewOptions | boolean | undefined }[] = []
const savedScrollIntoView = Element.prototype.scrollIntoView
const savedRect = HTMLElement.prototype.getBoundingClientRect

beforeEach(() => {
  mediaListeners.clear()
  stubMedia(1024)
  scrolls = []
  Element.prototype.scrollIntoView = function (this: Element, options?: ScrollIntoViewOptions | boolean) {
    scrolls.push({ el: this, options })
  }
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const height = this.dataset.slot === "save-all-bar" ? BAR_HEIGHT : 0
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) } as DOMRect
  }
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastPartial).mockClear()
})

afterEach(() => {
  Element.prototype.scrollIntoView = savedScrollIntoView
  HTMLElement.prototype.getBoundingClientRect = savedRect
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty(TOAST_OFFSET_PROPERTY)
})

/* ---------- test Sections ---------- */

const BASELINE: FixtureSectionValues = { number: "4155512125", note: "" }
const OK: SaveResult = { ok: true }
const GENERIC: SaveResult = { ok: false, error: { code: "GENERIC", mapped: { kind: "generic" } } }
const DUPLICATE: SaveResult = { ok: false, error: { code: "FIELD", mapped: { kind: "field", field: "value", messageKey: "contacts.duplicatePhone" } } }

interface FormSectionProps {
  readonly id: SectionId
  readonly title: string
  readonly displayOrder: number
  readonly save?: (values: FixtureSectionValues) => Promise<SaveResult>
}

/** A real `useSectionForm` Section in its landmark: field errors (`aria-invalid`), the footer error banner and the `h2`. */
function FormSection({ id, title, displayOrder, save = async () => OK }: FormSectionProps) {
  const section = useSectionForm<FixtureSectionValues>({
    id,
    label: title,
    displayOrder,
    schema: fixtureSectionSchema,
    baseline: BASELINE,
    save: (values) => save(values),
    errorFields: { value: "number" },
  })
  const headingId = sectionHeadingId(id)
  return (
    <SectionLandmark
      id={id}
      title={title}
      tools={section.isEditing ? null : <button type="button" {...section.editButtonProps}>{`Edit ${title}`}</button>}
    >
      {section.isEditing ? (
        <>
          <KeyValueEditTable
            labelledBy={headingId}
            rows={[
              {
                key: "number",
                label: `${title} number`,
                required: true,
                error: section.errorFor("number"),
                render: (control) => <Input {...control} {...section.field("number")} />,
              },
            ]}
          />
          <SectionFooter {...section.footerProps} />
        </>
      ) : (
        <KeyValueTable labelledBy={headingId} rows={[{ key: "number", label: `${title} number`, value: section.baseline.number }]} />
      )}
    </SectionLandmark>
  )
}

/** A `FixtureParticipant` (save order via `onSave`), optionally inside its landmark (an `h2` and no error element). */
function Participant({ landmark = false, ...props }: FixtureParticipantProps & { readonly landmark?: boolean }) {
  const participant = <FixtureParticipant {...props} />
  return landmark ? (
    <SectionLandmark id={props.id} title={`${props.label} title`}>
      {participant}
    </SectionLandmark>
  ) : (
    participant
  )
}

const LABELS: Record<string, string> = { personal: "Personal", phone: "Phone", email: "Email", social: "Social", addresses: "Addresses" }
const ORDER: Record<string, number> = { personal: 1, phone: 2, email: 3, social: 4, addresses: 5, insurance: 6 }
const participant = (id: SectionId, props: Partial<FixtureParticipantProps> & { landmark?: boolean } = {}) => (
  <Participant key={id} id={id} label={LABELS[id] ?? id} displayOrder={ORDER[id]} {...props} />
)

function renderBar(sections: React.ReactNode) {
  return renderInPage(
    <>
      {sections}
      <SaveAllBar />
    </>,
    { page: "profile" },
  )
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const bar = () => document.querySelector<HTMLElement>('[data-slot="save-all-bar"]')
const pill = () => document.querySelector<HTMLElement>('[data-slot="save-all-pill"]')
const pillSpacer = () => document.querySelector<HTMLElement>('[data-slot="save-all-pill-spacer"]')
const subLine = () => document.querySelector<HTMLElement>('[data-slot="save-all-subline"]')
const saveAllButton = () => screen.getByRole("button", { name: /^Save all \(\d+\)$|^Saving…$/ })
const discardAllButton = () => screen.getByRole("button", { name: "Discard all" })
const offset = () => document.documentElement.style.getPropertyValue(TOAST_OFFSET_PROPERTY)

async function clickSaveAll(): Promise<void> {
  const button = saveAllButton()
  button.focus()
  await act(async () => fireEvent.click(button))
}

/** Opens a `useSectionForm` Section and types a number into it. */
function editForm(title: string, value: string): void {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${title}` }))
  type(`${title} number`, value)
}

/* ---------- tests ---------- */

describe("SaveAllBar: presence and count", () => {
  it("is absent at 0, shows the desktop bar from 1 (singular / plural) and leaves the DOM at 0", () => {
    renderBar([participant("phone"), participant("email")])
    expect(bar()).toBeNull()
    expect(pill()).toBeNull()
    type("Phone", "1")
    expect(bar()).not.toBeNull()
    expect(screen.getByText("1 unsaved section")).toBeTruthy()
    expect(saveAllButton().textContent).toBe("Save all (1)")
    type("Email", "2")
    expect(screen.getByText("2 unsaved sections")).toBeTruthy()
    expect(discardAllButton()).toBeTruthy()
    expect(saveAllButton().textContent).toBe("Save all (2)")
    // The count and the sub-line are polite live regions (only the pill lacks Discard all).
    expect(screen.getByText("2 unsaved sections").getAttribute("role")).toBe("status")
    expect(subLine()?.getAttribute("role")).toBe("status")
    expect(subLine()?.textContent).toBe("")
    type("Phone", "")
    type("Email", "")
    expect(bar()).toBeNull()
  })

  it("counts no guard-only participant: only insurance (saveAll false) dirty shows no bar and no pill", () => {
    renderBar([participant("phone"), participant("insurance", { saveAll: false, label: "Insurance" })])
    type("Insurance", "x")
    expect(bar()).toBeNull()
    resizeTo(360)
    expect(pill()).toBeNull()
  })

  it("below 768 px shows a centered pill 'Save all (N)' with no Discard and no count line; switches with the viewport", async () => {
    stubMedia(360)
    renderBar([participant("phone"), participant("email")])
    type("Phone", "1")
    type("Email", "2")
    expect(bar()).toBeNull()
    expect(pill()).not.toBeNull()
    // An in-flow spacer of the pill's footprint, so the fixed pill never covers the end of the page.
    expect(pillSpacer()?.getAttribute("aria-hidden")).toBe("true")
    expect(pillSpacer()?.style.height).toBe(PILL_TOAST_OFFSET)
    expect(pillSpacer()?.nextElementSibling).toBe(pill())
    expect(saveAllButton().textContent).toBe("Save all (2)")
    expect(saveAllButton().className).toContain("rounded-full")
    expect(saveAllButton().className).toContain("shadow-md")
    expect(saveAllButton().className).toContain("h-11")
    expect(screen.queryByRole("button", { name: "Discard all" })).toBeNull()
    expect(screen.queryByText("2 unsaved sections")).toBeNull()
    expect(await axeViolations()).toEqual([])
    resizeTo(1024)
    expect(pill()).toBeNull()
    expect(pillSpacer()).toBeNull()
    expect(bar()).not.toBeNull()
  })

  it("the bar: sticky bottom card with a top border, flat, 6 px by the page gutter, 44 px actions, axe clean", async () => {
    renderBar([participant("phone")])
    type("Phone", "1")
    const el = bar()!
    for (const name of ["sticky", "bottom-0", "border-t", "bg-card", "py-1.5", "px-6"]) expect(el.className).toContain(name)
    expect(el.className).not.toMatch(/shadow/)
    expect(saveAllButton().className).toContain("h-11")
    expect(discardAllButton().className).toContain("h-11")
    expect(el.querySelector('[aria-hidden="true"].bg-warning.size-2')).not.toBeNull()
    // Save all is the bar's last control (last in the page's tab order: the slot follows <main>).
    const controls = [...el.querySelectorAll("button")]
    expect(controls.at(-1)).toBe(saveAllButton())
    expect(await axeViolations()).toEqual([])
  })
})

describe("SaveAllBar: --toast-bottom-offset", () => {
  it("is the bar's height while the bar shows, the pill hint while the pill shows, removed at 0 and on unmount", () => {
    const { unmount } = renderBar([participant("phone")])
    expect(offset()).toBe("")
    type("Phone", "1")
    expect(offset()).toBe(`${BAR_HEIGHT}px`)
    // The bar's sticky top (100dvh minus its height) keeps it on the bottom edge of a short page.
    expect(bar()!.style.getPropertyValue("--save-all-bar-height")).toBe(`${BAR_HEIGHT}px`)
    expect(bar()!.className).toContain("top-[calc(100dvh-var(--save-all-bar-height))]")
    resizeTo(360)
    expect(offset()).toBe(PILL_TOAST_OFFSET)
    type("Phone", "")
    expect(offset()).toBe("")
    type("Phone", "2")
    expect(offset()).toBe(PILL_TOAST_OFFSET)
    unmount()
    expect(offset()).toBe("")
  })
})

describe("SaveAllBar: --toast-bottom-offset (re-measure)", () => {
  it("follows the bar's height when its ResizeObserver fires, and disconnects on unmount", () => {
    const observers: { callback: () => void; observed: Element[]; disconnect: ReturnType<typeof vi.fn> }[] = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        readonly observed: Element[] = []
        readonly disconnect = vi.fn()
        constructor(readonly callback: () => void) {
          observers.push(this)
        }
        observe(el: Element): void {
          this.observed.push(el)
        }
        unobserve(): void {}
      },
    )
    const { unmount } = renderBar([participant("phone")])
    type("Phone", "1")
    expect(offset()).toBe(`${BAR_HEIGHT}px`)
    const observer = observers.find((o) => o.observed.includes(bar()!))
    expect(observer).toBeDefined()
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const height = this.dataset.slot === "save-all-bar" ? 96 : 0
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) } as DOMRect
    }
    act(() => observer!.callback())
    expect(bar()!.style.getPropertyValue("--save-all-bar-height")).toBe("96px")
    expect(offset()).toBe("96px")
    unmount()
    expect(observer!.disconnect).toHaveBeenCalled()
    expect(offset()).toBe("")
  })
})

describe("SaveAllBar: the on-screen keyboard (mobile)", () => {
  it("hides the pill and removes the offset while an input has focus and the viewport shrank ≥ 150 px; back on blur or resize", async () => {
    stubMedia(360)
    const viewport = new FakeVisualViewport()
    vi.stubGlobal("visualViewport", viewport)
    renderBar([participant("phone")])
    type("Phone", "1")
    const input = screen.getByLabelText("Phone")
    act(() => input.focus())
    expect(pill()).not.toBeNull()
    viewport.shrinkBy(KEYBOARD_MIN_SHRINK_PX - 1)
    expect(pill()).not.toBeNull()
    viewport.shrinkBy(KEYBOARD_MIN_SHRINK_PX)
    expect(pill()).toBeNull()
    expect(offset()).toBe("")
    act(() => input.blur())
    await waitFor(() => expect(pill()).not.toBeNull())
    expect(offset()).toBe(PILL_TOAST_OFFSET)
    act(() => input.focus())
    expect(pill()).toBeNull()
    viewport.shrinkBy(0)
    expect(pill()).not.toBeNull()
  })

  it("never hides the desktop bar, and treats a missing visualViewport as no keyboard", () => {
    const viewport = new FakeVisualViewport()
    vi.stubGlobal("visualViewport", viewport)
    renderBar([participant("phone")])
    type("Phone", "1")
    act(() => screen.getByLabelText("Phone").focus())
    viewport.shrinkBy(300)
    expect(bar()).not.toBeNull()
    vi.stubGlobal("visualViewport", undefined)
    resizeTo(360)
    expect(pill()).not.toBeNull()
  })
})

describe("SaveAllBar: Save all", () => {
  it("invalid: nothing sent, the sub-line names it, focus on its first invalid field, scrolled into view (smooth)", async () => {
    const onSave = vi.fn()
    renderBar([participant("phone", { onSave }), participant("email", { onSave })])
    type("Phone", "1")
    type("Email", "invalid")
    await clickSaveAll()
    expect(onSave).not.toHaveBeenCalled()
    expect(subLine()?.textContent).toBe("Email has 1 field to fix")
    const input = screen.getByLabelText("Email")
    expect(document.activeElement).toBe(input)
    await waitFor(() => expect(scrolls.some((s) => s.el === input)).toBe(true))
    expect(scrolls.find((s) => s.el === input)?.options).toEqual({ behavior: "smooth", block: "center" })
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastPartial).not.toHaveBeenCalled()
    expect(bar()).not.toBeNull()
  })

  it("invalid with reduced motion: the field scrolls into view without animation; two invalid Sections, two lines in page order", async () => {
    stubMedia(1024, true)
    renderBar([participant("phone"), participant("email")])
    type("Email", "invalid")
    type("Phone", "invalid")
    await clickSaveAll()
    expect([...subLine()!.children].map((line) => line.textContent)).toEqual(["Phone has 1 field to fix", "Email has 1 field to fix"])
    const input = screen.getByLabelText("Phone")
    expect(document.activeElement).toBe(input)
    await waitFor(() => expect(scrolls.find((s) => s.el === input)?.options).toEqual({ behavior: "auto", block: "center" }))
  })

  it("the sub-line drops the line of a Section that is no longer dirty (count 2 → 1)", async () => {
    renderBar([participant("phone"), participant("email")])
    type("Phone", "invalid")
    type("Email", "invalid")
    await clickSaveAll()
    expect([...subLine()!.children].map((line) => line.textContent)).toEqual(["Phone has 1 field to fix", "Email has 1 field to fix"])
    // Phone reverted on its own: only Email's line stays.
    type("Phone", "")
    expect(screen.getByText("1 unsaved section")).toBeTruthy()
    expect([...subLine()!.children].map((line) => line.textContent)).toEqual(["Email has 1 field to fix"])
  })

  it("invalid with nothing focused by the Section: the Save all button is not scrolled", async () => {
    function Unfocusable() {
      useRegisterSection({
        id: "social",
        label: "Social",
        displayOrder: 4,
        isDirty: true,
        validate: () => ({ valid: false, invalidCount: 1, focusFirstInvalid: () => undefined }),
        save: async () => OK,
        discard: () => undefined,
      })
      return null
    }
    renderBar([<Unfocusable key="social" />])
    await clickSaveAll()
    expect(subLine()?.textContent).toBe("Social has 1 field to fix")
    expect(document.activeElement).toBe(saveAllButton())
    await act(async () => undefined)
    expect(scrolls.filter((s) => bar()!.contains(s.el))).toEqual([])
  })

  it("invalid in a useSectionForm Section: its field shows the error and takes focus", async () => {
    renderBar([<FormSection key="phone" id="phone" title="Phone" displayOrder={2} />])
    editForm("Phone", "12")
    await clickSaveAll()
    expect(subLine()?.textContent).toBe("Phone has 1 field to fix")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Phone number/)))
  })

  it("clears the sub-line when a run starts, on Discard all and when the count reaches 0", async () => {
    let release: () => void = () => undefined
    const save = vi.fn(
      () =>
        new Promise<SaveResult>((resolve) => {
          release = () => resolve(OK)
        }),
    )
    renderBar([<FormSection key="phone" id="phone" title="Phone" displayOrder={2} save={save} />, participant("email")])
    type("Email", "invalid")
    await clickSaveAll()
    expect(subLine()?.textContent).toBe("Email has 1 field to fix")
    // A run clears it as it starts.
    type("Email", "ok")
    editForm("Phone", "4155550000")
    await clickSaveAll()
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(subLine()?.textContent).toBe("")
    await act(async () => release())
    expect(bar()).toBeNull()
    // Discard all clears it.
    type("Email", "invalid")
    await clickSaveAll()
    expect(subLine()?.textContent).toBe("Email has 1 field to fix")
    await act(async () => fireEvent.click(discardAllButton()))
    expect(bar()).toBeNull()
    type("Email", "again")
    expect(subLine()?.textContent).toBe("")
    // The count reaching 0 clears it.
    type("Email", "invalid")
    await clickSaveAll()
    expect(subLine()?.textContent).toBe("Email has 1 field to fix")
    type("Email", "ok")
    expect(bar()).toBeNull()
    type("Email", "once more")
    expect(subLine()?.textContent).toBe("")
  })

  it("all succeed: 'All saved.', saves in SAVE_ORDER, focus on the first saved h2 in page order, the bar goes", async () => {
    const saves: string[] = []
    renderBar([
      participant("personal", { landmark: true, onSave: () => saves.push("personal") }),
      participant("phone", { landmark: true, onSave: () => saves.push("phone") }),
      participant("email", { landmark: true, onSave: () => saves.push("email") }),
    ])
    type("Phone", "1")
    type("Email", "2")
    await clickSaveAll()
    expect(saves).toEqual(SAVE_ORDER.filter((id) => id === "phone" || id === "email"))
    expect(saves).toEqual(["email", "phone"])
    expect(toastSuccess).toHaveBeenCalledExactlyOnceWith("All saved.")
    // Email saved first, but Phone comes first on the page.
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(sectionHeadingId("phone"))))
    expect(scrolls.at(-1)).toEqual({ el: document.getElementById(sectionHeadingId("phone")), options: { behavior: "smooth", block: "center" } })
    expect(bar()).toBeNull()
    expect(offset()).toBe("")
  })

  it("one Section saved: '{Section} saved.'", async () => {
    renderBar([participant("email", { landmark: true })])
    type("Email", "2")
    await clickSaveAll()
    expect(toastSuccess).toHaveBeenCalledExactlyOnceWith("Email saved.")
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(sectionHeadingId("email"))))
  })

  it("one fails (Section error): '1 saved, 1 failed', the bar stays at 'Save all (1)', focus on the failed Section's error banner", async () => {
    renderBar([
      <FormSection key="phone" id="phone" title="Phone" displayOrder={2} save={async () => GENERIC} />,
      participant("email", { landmark: true }),
    ])
    editForm("Phone", "4155550000")
    type("Email", "2")
    await clickSaveAll()
    expect(toastPartial).toHaveBeenCalledExactlyOnceWith("1 saved, 1 failed")
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(saveAllButton().textContent).toBe("Save all (1)")
    expect(screen.getByText("1 unsaved section")).toBeTruthy()
    const banner = document.querySelector('section#phone [data-slot~="inline-banner"][data-variant="error"]')
    expect(banner?.textContent).toContain("Couldn't save phone.")
    await waitFor(() => expect(document.activeElement).toBe(banner))
  })

  it("one fails (field error): focus on the failed Section's first aria-invalid control", async () => {
    renderBar([<FormSection key="phone" id="phone" title="Phone" displayOrder={2} save={async () => DUPLICATE} />, participant("email")])
    editForm("Phone", "4155550000")
    type("Email", "2")
    await clickSaveAll()
    expect(toastPartial).toHaveBeenCalledExactlyOnceWith("1 saved, 1 failed")
    const input = screen.getByLabelText(/^Phone number/)
    await waitFor(() => expect(document.activeElement).toBe(input))
    expect(input.getAttribute("aria-invalid")).toBe("true")
  })

  it("one fails with no error element: focus on its h2; several fail: the first in page order, not save order", async () => {
    renderBar([participant("phone", { landmark: true, saveBehavior: "fail" }), participant("email", { landmark: true, saveBehavior: "fail" })])
    type("Phone", "1")
    type("Email", "2")
    await clickSaveAll()
    expect(toastPartial).toHaveBeenCalledExactlyOnceWith("0 saved, 2 failed")
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(sectionHeadingId("phone"))))
    expect(saveAllButton().textContent).toBe("Save all (2)")
  })

  it("a failed Section with no landmark on the page: no focus move (nothing to land on)", async () => {
    renderBar([participant("phone", { saveBehavior: "fail" })])
    type("Phone", "1")
    await clickSaveAll()
    expect(toastPartial).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(saveAllButton())
  })

  it("session (another user, D-A batch check): nothing saved, no toast, no focus move", async () => {
    pageUser.pin(42)
    const onSave = vi.fn()
    renderInPage(
      <>
        {participant("phone", { landmark: true, onSave })}
        <SaveAllBar />
      </>,
      { page: "profile", handlers: [http.get("/api/1h/v2/user/myself", () => HttpResponse.json({ id: 43 }))] },
    )
    type("Phone", "1")
    await clickSaveAll()
    expect(onSave).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastPartial).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(saveAllButton())
    expect(subLine()?.textContent).toBe("")
  })

  it("session (a save ends it): the run stops, no toast, no focus move", async () => {
    const onSave = vi.fn()
    renderBar([
      <FormSection key="personal" id="personal" title="Personal" displayOrder={1} save={async () => ({ ok: false, error: { code: SESSION_EXPIRED_CODE } })} />,
      participant("email", { landmark: true, onSave }),
    ])
    editForm("Personal", "4155550000")
    type("Email", "2")
    await clickSaveAll()
    expect(onSave).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastPartial).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(saveAllButton())
  })

  it("double activation: one run; busy 'Saving…' while it runs, Discard all inert, a second click does nothing", async () => {
    let release: () => void = () => undefined
    const save = vi.fn(
      () =>
        new Promise<SaveResult>((resolve) => {
          release = () => resolve(OK)
        }),
    )
    renderBar([<FormSection key="phone" id="phone" title="Phone" displayOrder={2} save={save} />])
    editForm("Phone", "4155550000")
    const button = saveAllButton()
    button.focus()
    await act(async () => fireEvent.click(button))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(button.getAttribute("aria-busy")).toBe("true")
    expect(button.textContent).toBe("Saving…")
    expect(discardAllButton().getAttribute("aria-disabled")).toBe("true")
    await act(async () => fireEvent.click(button))
    await act(async () => fireEvent.click(discardAllButton()))
    expect(save).toHaveBeenCalledOnce()
    expect((screen.getByLabelText(/^Phone number/) as HTMLInputElement).value).toBe("4155550000")
    await act(async () => release())
    expect(toastSuccess).toHaveBeenCalledExactlyOnceWith("Phone saved.")
    expect(save).toHaveBeenCalledOnce()
  })

  it("the pill runs Save all too", async () => {
    stubMedia(360)
    renderBar([participant("phone", { landmark: true })])
    type("Phone", "1")
    await clickSaveAll()
    expect(toastSuccess).toHaveBeenCalledExactlyOnceWith("Phone saved.")
    expect(pill()).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(sectionHeadingId("phone"))))
  })
})

describe("SaveAllBar: Discard all", () => {
  it("discards every dirty Save-all Section with no confirm, keeps guard-only edits, focuses the first discarded h2", async () => {
    renderBar([
      participant("phone", { landmark: true }),
      participant("email", { landmark: true }),
      participant("insurance", { saveAll: false, label: "Insurance" }),
    ])
    type("Email", "2")
    type("Phone", "1")
    type("Insurance", "x")
    await act(async () => fireEvent.click(discardAllButton()))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("Insurance") as HTMLInputElement).value).toBe("x")
    expect(bar()).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(sectionHeadingId("phone"))))
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
