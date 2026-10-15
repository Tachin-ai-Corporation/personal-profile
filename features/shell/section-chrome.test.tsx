import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { sectionHeadingId } from "./nav-types"
import { SectionContainer } from "./section-container"
import { SectionFooter, type SectionFooterProps } from "./section-footer"
import { SectionHeader } from "./section-header"

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

describe("SectionContainer", () => {
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
