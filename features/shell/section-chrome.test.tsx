import { act, fireEvent, render, screen } from "@testing-library/react"
import { Phone } from "lucide-react"
import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { sectionHeadingId } from "./nav-types"
import { SectionContainer } from "./section-container"
import { SectionFooter, type SectionFooterProps } from "./section-footer"
import { SectionHeader } from "./section-header"
import { SectionRegistryProvider, useSectionRegistry, type SectionRegistry } from "./section-registry"

beforeEach(() => stubLayoutApis())

describe("sectionHeadingId", () => {
  it("is '<id>-heading'", () => {
    expect(sectionHeadingId("email")).toBe("email-heading")
  })
})

describe("SectionHeader", () => {
  it("renders the h2, the count, and the actions; 'Editing' replaces the count", () => {
    const { rerender } = render(<SectionHeader id="email" title="Email" count={3} editing={false} actions={<button type="button">Edit</button>} />)
    const heading = screen.getByRole("heading", { level: 2, name: "Email" })
    expect(heading.id).toBe("email-heading")
    expect(heading.tabIndex).toBe(-1)
    expect(screen.getByText("3")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy()
    rerender(<SectionHeader id="email" title="Email" count={3} editing />)
    expect(screen.getByText("Editing")).toBeTruthy()
    expect(screen.queryByText("3")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("shows no meta without a count", () => {
    render(<SectionHeader id="social" title="Social media" editing={false} />)
    expect(document.querySelector("[data-slot='section-meta']")).toBeNull()
  })
})

/** Renders `ui` inside a Section registry and hands the registry back, to report `saved` events. */
function withRegistry(ui: ReactElement): SectionRegistry {
  let captured: SectionRegistry | undefined
  function Capture() {
    captured = useSectionRegistry()
    return null
  }
  render(
    <SectionRegistryProvider>
      <Capture />
      {ui}
    </SectionRegistryProvider>,
  )
  if (!captured) throw new Error("no registry")
  return captured
}

const iconOf = () => document.querySelector<HTMLElement>("[data-slot='animated-icon']")
const savedCheck = () => document.querySelector("[data-slot='animated-icon-success']")

describe("SectionHeader icon (design refresh, opt-in)", () => {
  it("renders no icon tile without the prop", () => {
    render(<SectionHeader id="phone" title="Phone" editing={false} />)
    expect(iconOf()).toBeNull()
    expect(document.querySelector("[data-slot='section-header']")?.className).not.toContain("group/icon-host")
    expect(screen.getByRole("heading", { level: 2 }).className).not.toContain("after:")
    // Without the opt-in, the ring still shows on any focus (F3-2).
    expect(screen.getByRole("heading", { level: 2 }).className).toContain("focus:outline-solid")
  })

  it("puts the decorative tile before the h2, entering at the Section's stagger step", () => {
    render(<SectionHeader id="phone" title="Phone" editing={false} icon={{ icon: Phone, tone: "teal" }} />)
    const icon = iconOf()
    expect(icon?.getAttribute("aria-hidden")).toBe("true")
    expect(icon?.getAttribute("data-tone")).toBe("teal")
    expect(icon?.nextElementSibling?.tagName).toBe("H2")
    expect(icon?.style.getPropertyValue("--stagger")).toBe("1")
    // Below 640 px the tile is hidden, so the header actions keep their row at 360 px.
    expect(icon?.className).toContain("max-sm:hidden")
    // The heading's ring only on :focus-visible (keyboard), not after a click moves focus to it.
    const heading = screen.getByRole("heading", { level: 2 })
    expect(heading.className).toContain("focus-visible:outline-solid")
    expect(heading.className).toContain("focus-visible:shadow-glow")
    expect(heading.className).not.toContain("focus:outline-solid")
    // A short accent line in the tone's hue under the title.
    expect(screen.getByRole("heading", { level: 2 }).className).toContain("after:bg-brand-secondary")
    // The 40 px tile fits the 44 px header row.
    expect(document.querySelector("[data-slot='animated-icon-tile']")?.className).toContain("size-10")
    expect(document.querySelector("[data-slot='section-header']")?.className).toContain("group/icon-host")
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Phone")
  })

  it("shows the saved check when its own Section reports saved, not another's", () => {
    const registry = withRegistry(<SectionHeader id="phone" title="Phone" editing={false} icon={{ icon: Phone, tone: "teal" }} />)
    act(() => registry.report({ type: "saved", id: "email" }))
    act(() => registry.report({ type: "discarded", id: "phone" }))
    expect(savedCheck()).toBeNull()
    act(() => registry.report({ type: "saved", id: "phone" }))
    expect(savedCheck()).not.toBeNull()
  })

  it("an /account landmark with an icon still renders outside the registry", () => {
    render(<SectionHeader id="authenticator" title="Authenticator app" editing={false} icon={{ icon: Phone, tone: "blue" }} />)
    expect(iconOf()?.style.getPropertyValue("--stagger")).toBe("0")
    expect(savedCheck()).toBeNull()
  })
})

describe("SectionContainer", () => {
  it("is unchanged without `animated`: no entrance, no stagger, no flash", () => {
    const registry = withRegistry(<SectionContainer editing={false} sectionId="email">x</SectionContainer>)
    const box = screen.getByText("x")
    expect(box.className).not.toContain("animate-section-enter")
    expect(box.style.getPropertyValue("--stagger")).toBe("")
    act(() => registry.report({ type: "saved", id: "email" }))
    expect(box.querySelector("[data-slot='section-saved-flash']")).toBeNull()
  })

  it("`animated`: enters at its Section's step and flashes once per save of its Section", () => {
    const registry = withRegistry(
      <SectionContainer editing={false} sectionId="email" animated>
        x
      </SectionContainer>,
    )
    const box = screen.getByText("x")
    expect(box.className).toContain("animate-section-enter")
    expect(box.style.getPropertyValue("--stagger")).toBe("2")
    expect(box.querySelector("[data-slot='section-saved-flash']")).toBeNull()
    act(() => registry.report({ type: "saved", id: "phone" }))
    expect(box.querySelector("[data-slot='section-saved-flash']")).toBeNull()
    act(() => registry.report({ type: "saved", id: "email" }))
    const flash = box.querySelector("[data-slot='section-saved-flash']")
    expect(flash?.getAttribute("aria-hidden")).toBe("true")
    expect(flash?.className).toContain("animate-saved-flash")
    act(() => registry.report({ type: "saved", id: "email" }))
    // A new element per save, so the animation restarts.
    expect(box.querySelector("[data-slot='section-saved-flash']")).not.toBe(flash)
  })

  it("`accent`: a 4 px bar in the tone's brand hue over the left border; none by default", () => {
    const { rerender } = render(<SectionContainer editing={false}>x</SectionContainer>)
    const box = screen.getByText("x")
    expect(box.className).not.toContain("before:")
    for (const [tone, hue] of [["blue", "brand-primary"], ["teal", "brand-secondary"], ["mint", "brand-tertiary"]] as const) {
      rerender(<SectionContainer editing={false} accent={tone}>x</SectionContainer>)
      expect(box.className).toContain(`before:bg-${hue}`)
      expect(box.className).toContain("before:w-1")
      expect(box.className).toContain("relative")
    }
  })

  it("is a flat hairline card that turns primary with a 3 px accent halo while editing", () => {
    const { rerender } = render(<SectionContainer editing={false}>x</SectionContainer>)
    const box = screen.getByText("x")
    expect(box.className).toContain("border-border")
    expect(box.className).not.toContain("ring-[3px]")
    rerender(<SectionContainer editing>x</SectionContainer>)
    expect(box.className).toContain("border-primary")
    expect(box.className).toContain("ring-accent")
    expect(box.className).toContain("ring-[3px]")
  })
})

function footer(props: Partial<SectionFooterProps> = {}) {
  const onCancel = vi.fn()
  const onSave = vi.fn()
  render(
    <TooltipProvider>
      <SectionFooter dirty={false} saving={false} onCancel={onCancel} onSave={onSave} {...props} />
    </TooltipProvider>,
  )
  return { onCancel, onSave }
}

describe("SectionFooter", () => {
  it("Cancel (secondary) and Save (primary) are plain buttons; the indicator shows only while dirty", () => {
    const { onCancel, onSave } = footer()
    const buttons = screen.getAllByRole("button")
    expect(buttons.map((b) => [b.textContent, b.getAttribute("type")])).toEqual([
      ["Cancel", "button"],
      ["Save", "button"],
    ])
    expect(screen.queryByText("Unsaved changes")).toBeNull()
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("dirty: warning dot + 'Unsaved changes' in a polite live region", () => {
    footer({ dirty: true })
    const indicator = screen.getByText("Unsaved changes")
    expect(indicator.className).toContain("text-warning-strong")
    expect(indicator.querySelector("[aria-hidden='true']")?.className).toContain("bg-warning")
    expect(indicator.parentElement?.getAttribute("aria-live")).toBe("polite")
  })

  it("saving: Save busy 'Saving…' and inert, Cancel inert", () => {
    const { onCancel, onSave } = footer({ saving: true })
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Cancel" }).getAttribute("aria-disabled")).toBe("true")
  })

  it("Section error above the row, with Retry; status in a polite status", () => {
    const onRetry = vi.fn()
    footer({ error: { message: "Couldn't save phone.", onRetry }, status: "There are no changes" })
    expect(screen.getByRole("alert").textContent).toBe("Couldn't save phone.")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.getByText("There are no changes").getAttribute("role")).toBe("status")
  })

  it("Add row: ghost action, or a DisabledAction with its reason", () => {
    const onClick = vi.fn()
    const { unmount } = render(
      <SectionFooter dirty={false} saving={false} onCancel={() => undefined} onSave={() => undefined} addRow={{ label: "Add phone", onClick }} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }))
    expect(onClick).toHaveBeenCalledTimes(1)
    unmount()
    footer({ addRow: { label: "Add phone", onClick, disabledReason: "You've reached the limit of 20 phones" } })
    const disabled = screen.getByRole("button", { name: "Add phone" })
    expect(disabled.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(disabled)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("has no axe violations with every part shown", async () => {
    footer({ dirty: true, status: "There are no changes", error: { message: "Couldn't save phone.", onRetry: () => undefined }, addRow: { label: "Add phone", onClick: () => undefined } })
    expect(await axeViolations()).toEqual([])
  })
})
