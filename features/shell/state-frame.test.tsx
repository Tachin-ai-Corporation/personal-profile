import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { MappedError } from "@/lib/api"
import { SECTION_LOAD_NOUNS, type LoadNounSection } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { FrameSkeleton, loadErrorMessage, NoAccess, ORG_GRID_CLASSES, StateFrame, type FrameState, type SkeletonVariant, type StateFrameProps } from "./state-frame"

/**
 * `StateFrame` (F3-3): skeleton variants, the two load-error copies with the
 * per-Section nouns, NoAccess at tab and Section level, session → nothing,
 * Retry isolation across frames, `onReady`, anchors, axe.
 */

const LOAD_ERROR = "Something went wrong while loading profile information"
const NO_ACCESS = "You don't have access to this in your current account"

afterEach(() => document.documentElement.classList.remove("dark"))

const hasClasses = (el: Element | null | undefined, ...names: string[]): void => {
  for (const name of names) expect(el?.classList.contains(name), `${name} on ${el?.outerHTML.slice(0, 80)}`).toBe(true)
}

function frame(props: Partial<StateFrameProps> = {}) {
  return (
    <StateFrame state="loading" skeleton="table" loadError={{ kind: "page" }} level="section" onRetry={vi.fn()} {...props}>
      {props.children ?? <p>Ready content</p>}
    </StateFrame>
  )
}

const root = (container: HTMLElement): HTMLElement => container.querySelector('[data-slot="state-frame"]') as HTMLElement

describe("skeleton variants", () => {
  it("table: the real 36 px column headers and three 44 px rows, busy, bars hidden and static under reduced motion", () => {
    const { container } = render(frame({ columns: ["Number", "Label"] }))
    const box = root(container)
    expect(box.getAttribute("aria-busy")).toBe("true")
    expect(box.getAttribute("data-state")).toBe("loading")
    hasClasses(box, "bg-card", "border", "rounded-md", "overflow-hidden")
    const header = box.querySelector('[data-slot="frame-skeleton-header"]')
    hasClasses(header, "h-9", "bg-muted", "uppercase", "text-caption", "font-semibold", "tracking-[0.06em]")
    expect(Array.from(header?.children ?? []).map((c) => c.textContent)).toEqual(["Number", "Label"])
    const rows = box.querySelectorAll('[data-slot="frame-skeleton-row"]')
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      hasClasses(row, "h-11")
      expect(row.closest('[aria-hidden="true"]')).not.toBeNull()
      hasClasses(row.querySelector('[data-slot="skeleton"]'), "bg-muted", "animate-pulse", "motion-reduce:animate-none")
    }
    expect(screen.queryByText("Ready content")).toBeNull()
  })

  it("table: the whole skeleton (column headers included) is aria-hidden; the busy frame is named Loading {noun}", () => {
    const { container, rerender } = render(frame({ columns: ["Number", "Label"], loadError: { kind: "section", sectionId: "phone" } }))
    const skeleton = container.querySelector('[data-slot="frame-skeleton"]')
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true")
    expect(skeleton?.contains(container.querySelector('[data-slot="frame-skeleton-header"]'))).toBe(true)
    const label = container.querySelector('[data-slot="frame-loading-label"]')
    expect(label?.textContent).toBe("Loading phones")
    hasClasses(label, "sr-only")
    expect(label?.closest('[aria-hidden="true"]')).toBeNull()
    rerender(frame({ level: "tab", skeleton: "cards" }))
    expect(container.querySelector('[data-slot="frame-loading-label"]')?.textContent).toBe("Loading profile information")
    rerender(frame({ state: "ready" }))
    expect(container.querySelector('[data-slot="frame-loading-label"]')).toBeNull()
  })

  it("table without columns has no header row", () => {
    const { container } = render(frame())
    expect(container.querySelector('[data-slot="frame-skeleton-header"]')).toBeNull()
    expect(container.querySelectorAll('[data-slot="frame-skeleton-row"]')).toHaveLength(3)
  })

  it.each<[SkeletonVariant, string, number, string[]]>([
    ["kv", '[data-slot="frame-skeleton-row"]', 4, ["h-11"]],
    ["tiles", '[data-slot="skeleton"]', 5, ["h-28"]],
    ["bars", '[data-slot="skeleton"]', 2, ["h-11", "max-w-[480px]"]],
    ["cards", '[data-slot="frame-skeleton-card"]', 12, ["border", "rounded-md"]],
  ])("%s: %s × %i", (variant, selector, count, classes) => {
    const { container } = render(<FrameSkeleton variant={variant} />)
    const skeleton = container.querySelector('[data-slot="frame-skeleton"]')
    expect(skeleton?.getAttribute("data-variant")).toBe(variant)
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true")
    const items = container.querySelectorAll(selector)
    expect(items).toHaveLength(count)
    for (const item of items) hasClasses(item, ...classes)
    for (const bar of container.querySelectorAll('[data-slot="skeleton"]')) hasClasses(bar, "bg-muted", "motion-reduce:animate-none")
  })

  it("cards use the org grid classes (4 / 3 / 2 / 1 columns) and 72 px logo bars", () => {
    const { container } = render(<FrameSkeleton variant="cards" />)
    const grid = container.querySelector('[data-slot="frame-skeleton"]')
    expect(grid?.className).toBe(ORG_GRID_CLASSES)
    hasClasses(grid, "grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-3", "xl:grid-cols-4", "gap-4")
    hasClasses(container.querySelector('[data-slot="frame-skeleton-card"] [data-slot="skeleton"]'), "size-18")
  })

  it("a tab-level frame has no container of its own", () => {
    const { container } = render(frame({ level: "tab", skeleton: "cards" }))
    expect(root(container).classList.contains("border")).toBe(false)
    expect(root(container).getAttribute("aria-busy")).toBe("true")
  })
})

describe("load error copy", () => {
  it.each<[LoadNounSection, string]>([
    ["personal", "Couldn't load personal information"],
    ["phone", "Couldn't load phones"],
    ["email", "Couldn't load emails"],
    ["social", "Couldn't load social links"],
    ["addresses", "Couldn't load addresses"],
    ["insurance", "Couldn't load insurance"],
  ])("/ %s → %j", (sectionId, text) => {
    expect(loadErrorMessage({ kind: "section", sectionId })).toBe(text)
    render(frame({ state: { error: { kind: "network" } }, loadError: { kind: "section", sectionId } }))
    expect(screen.getByRole("alert").textContent).toBe(text)
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy()
  })

  it("covers a noun for every Profile Section", () => {
    expect(Object.keys(SECTION_LOAD_NOUNS).toSorted()).toEqual(["addresses", "email", "insurance", "personal", "phone", "social"])
  })

  it("/account uses the page copy, at tab and Section level", () => {
    const { container, rerender } = render(frame({ state: { error: { kind: "generic" } }, level: "tab" }))
    expect(screen.getByRole("alert").textContent).toBe(LOAD_ERROR)
    expect(root(container).getAttribute("data-state")).toBe("error")
    expect(root(container).getAttribute("aria-busy")).toBeNull()
    rerender(frame({ state: { error: { kind: "generic" } }, level: "section" }))
    expect(screen.getByRole("alert").textContent).toBe(LOAD_ERROR)
  })

  it.each<MappedError>([
    { kind: "generic", message: "Raw platform text" },
    { kind: "network" },
    { kind: "field", field: "ssn", messageKey: "person.ssnTaken" },
    { kind: "coded", code: "MFA_NOT_ENABLED" },
  ])("%j shows the load error, never raw text or a form", (error) => {
    const { container } = render(frame({ state: { error } }))
    expect(container.textContent).toContain(LOAD_ERROR)
    expect(container.textContent).not.toContain("Raw platform text")
    expect(screen.queryByText("Ready content")).toBeNull()
  })
})

describe("no access and session", () => {
  it("tab level: the centred bordered panel with a lock and one line, no action", () => {
    const { container } = render(frame({ state: { error: { kind: "forbidden" } }, level: "tab" }))
    const panel = screen.getByRole("status")
    expect(panel.textContent).toBe(NO_ACCESS)
    expect(panel.getAttribute("data-level")).toBe("tab")
    hasClasses(panel, "bg-card", "border", "rounded-md", "items-center", "text-center", "px-4", "py-6")
    hasClasses(panel.querySelector("svg"), "size-5")
    expect(container.querySelectorAll("button, a")).toHaveLength(0)
    expect(root(container).getAttribute("data-state")).toBe("forbidden")
  })

  it("Section level: one row inside the Section's container", () => {
    render(frame({ state: { error: { kind: "forbidden" } }, level: "section" }))
    const row = screen.getByRole("status")
    expect(row.getAttribute("data-level")).toBe("section")
    hasClasses(row, "min-h-11", "px-3")
    expect(row.classList.contains("border")).toBe(false)
  })

  it("NoAccess defaults to the tab level", () => {
    render(<NoAccess />)
    expect(screen.getByRole("status").getAttribute("data-level")).toBe("tab")
  })

  it("a session end renders nothing (the session dialog owns it), anchors included", () => {
    const { container } = render(frame({ state: { error: { kind: "session" } }, anchors: <div id="anchor" /> }))
    expect(container.innerHTML).toBe("")
  })
})

describe("Retry isolation", () => {
  it("Retry calls only its own frame's onRetry; the other frames keep their state", () => {
    const phoneRetry = vi.fn()
    const emailRetry = vi.fn()
    function Harness() {
      const [phone, setPhone] = useState<FrameState>({ error: { kind: "network" } })
      return (
        <>
          <section aria-label="phone">
            <StateFrame
              state={phone}
              skeleton="table"
              loadError={{ kind: "section", sectionId: "phone" }}
              level="section"
              onRetry={() => {
                phoneRetry()
                setPhone("loading")
              }}
            />
          </section>
          <section aria-label="email">
            <StateFrame state={{ error: { kind: "generic" } }} skeleton="table" loadError={{ kind: "section", sectionId: "email" }} level="section" onRetry={emailRetry} />
          </section>
          <section aria-label="social">
            <StateFrame state="loading" skeleton="table" loadError={{ kind: "section", sectionId: "social" }} level="section" onRetry={vi.fn()} />
          </section>
        </>
      )
    }
    render(<Harness />)
    const region = (name: string): HTMLElement => screen.getByRole("region", { name })
    fireEvent.click(within(region("phone")).getByRole("button", { name: "Retry" }))
    expect(phoneRetry).toHaveBeenCalledOnce()
    expect(emailRetry).not.toHaveBeenCalled()
    expect(region("phone").querySelector('[data-slot="state-frame"]')?.getAttribute("data-state")).toBe("loading")
    expect(within(region("email")).getByRole("alert").textContent).toBe("Couldn't load emails")
    expect(region("social").querySelector('[data-slot="state-frame"]')?.getAttribute("aria-busy")).toBe("true")
  })

  it("a new attempt re-announces the alert", () => {
    const { rerender } = render(frame({ state: { error: { kind: "network" } }, attempt: 1 }))
    const first = screen.getByRole("alert")
    rerender(frame({ state: { error: { kind: "network" } }, attempt: 2 }))
    expect(screen.getByRole("alert")).not.toBe(first)
  })
})

describe("ready, anchors and onReady", () => {
  it("renders children only when ready, and anchors only before", () => {
    const { container, rerender } = render(frame({ anchors: <div id="signature">Signature</div> }))
    expect(root(container).contains(document.getElementById("signature"))).toBe(true)
    rerender(frame({ state: { error: { kind: "forbidden" } }, anchors: <div id="signature">Signature</div> }))
    expect(document.getElementById("signature")).not.toBeNull()
    rerender(frame({ state: "ready", anchors: <div id="signature">Signature</div> }))
    expect(document.getElementById("signature")).toBeNull()
    expect(screen.getByText("Ready content")).toBeTruthy()
    expect(root(container).getAttribute("data-state")).toBe("ready")
  })

  it("onReady fires once per transition into ready, with the latest callback", () => {
    const first = vi.fn()
    const latest = vi.fn()
    const { rerender } = render(frame({ onReady: first }))
    expect(first).not.toHaveBeenCalled()
    rerender(frame({ state: "ready", onReady: latest }))
    expect(latest).toHaveBeenCalledOnce()
    rerender(frame({ state: "ready", onReady: latest }))
    expect(latest).toHaveBeenCalledOnce()
    rerender(frame({ state: "loading", onReady: latest }))
    rerender(frame({ state: "ready", onReady: latest }))
    expect(latest).toHaveBeenCalledTimes(2)
    expect(first).not.toHaveBeenCalled()
  })
})

describe("accessibility", () => {
  const states: [string, FrameState][] = [
    ["loading", "loading"],
    ["error", { error: { kind: "network" } }],
    ["forbidden", { error: { kind: "forbidden" } }],
    ["ready", "ready"],
  ]
  for (const theme of ["light", "dark"]) {
    it.each(states)(`axe: %s (${theme})`, async (_label, state) => {
      if (theme === "dark") document.documentElement.classList.add("dark")
      render(
        <main>
          {frame({ state, columns: ["Number"], loadError: { kind: "section", sectionId: "phone" } })}
          <StateFrame state={state} skeleton="cards" loadError={{ kind: "page" }} level="tab" onRetry={vi.fn()} />
          <FrameSkeleton variant="tiles" />
          <FrameSkeleton variant="bars" />
          <FrameSkeleton variant="kv" />
        </main>,
      )
      expect(await axeViolations()).toEqual([])
    })
  }
})
