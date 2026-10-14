import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SHELL_COPY } from "@/lib/shared/messages"
import { axeViolations } from "../../test/axe"
import { SectionFrame, type SectionFrameState } from "./section-frame"
import { SECTION_COLUMNS } from "./sections"

/**
 * `SectionFrame` (Story 1.8): the Section region and h2, the loading skeleton
 * under the real column headers, the inline error banner with a per-frame Retry,
 * and the ready state.
 */

afterEach(cleanup)

function frame(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement
}

function container(id: string): HTMLElement {
  return frame(id).querySelector('[data-slot="section-frame"]') as HTMLElement
}

describe("SectionFrame — structure", () => {
  it("is a section labelled by its h2, which is focusable by script only", () => {
    render(<SectionFrame id="phone" title="Phone" columns={SECTION_COLUMNS.phone} state="loading" />)
    const region = screen.getByRole("region", { name: "Phone" })
    expect(region.tagName).toBe("SECTION")
    expect(region).toHaveAttribute("id", "phone")
    const h2 = screen.getByRole("heading", { level: 2, name: "Phone" })
    expect(region).toHaveAttribute("aria-labelledby", h2.id)
    expect(h2).toHaveAttribute("tabindex", "-1")
    expect(h2).toHaveClass("text-body", "font-semibold")
    expect(h2.parentElement).toHaveClass("min-h-11")
  })

  it("uses the card container: bg-card, 1 px border, rounded-md", () => {
    render(<SectionFrame id="email" title="Email" columns={SECTION_COLUMNS.email} state="loading" />)
    expect(container("email")).toHaveClass("bg-card", "border", "rounded-md")
  })
})

describe("SectionFrame — loading", () => {
  it("renders the column headers and three 44 px skeleton rows, marked aria-busy", () => {
    render(<SectionFrame id="phone" title="Phone" columns={SECTION_COLUMNS.phone} state="loading" />)
    const box = container("phone")
    expect(box).toHaveAttribute("aria-busy", "true")
    const header = box.querySelector('[data-slot="section-frame-header"]') as HTMLElement
    expect(header).toHaveClass("h-9", "bg-muted", "text-muted-foreground", "uppercase", "text-caption", "font-semibold", "tracking-[0.06em]")
    expect(Array.from(header.children).map((c) => c.textContent)).toEqual(["Number", "Label", "Type", "Status", "Notifications"])
    const rows = box.querySelectorAll('[data-slot="section-frame-skeleton-row"]')
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row).toHaveClass("h-11")
      expect(row.querySelector('[data-slot="skeleton"]')).toHaveClass("bg-muted", "animate-pulse")
      expect(row.querySelector('[data-slot="skeleton"]')).not.toHaveClass("bg-accent")
    }
  })

  it.each([
    ["email", ["Email address", "Label", "Status", "Notifications"]],
    ["social", ["Link"]],
    ["addresses", ["Address", "Label", "Type", "Status"]],
  ] as const)("the %s frame shows its own column headers", (id, columns) => {
    render(<SectionFrame id={id} title={id} columns={SECTION_COLUMNS[id]} state="loading" />)
    const header = container(id).querySelector('[data-slot="section-frame-header"]') as HTMLElement
    expect(Array.from(header.children).map((c) => c.textContent)).toEqual(columns)
  })

  it("has no header row for Personal information and Insurance (no columns)", () => {
    render(
      <>
        <SectionFrame id="personal" title="Personal information" columns={SECTION_COLUMNS.personal} state="loading" />
        <SectionFrame id="insurance" title="Insurance" columns={SECTION_COLUMNS.insurance} state="loading" />
      </>,
    )
    for (const id of ["personal", "insurance"]) {
      expect(container(id).querySelector('[data-slot="section-frame-header"]')).toBeNull()
      expect(container(id).querySelectorAll('[data-slot="section-frame-skeleton-row"]')).toHaveLength(3)
    }
  })

  it("renders anchors under the skeleton rows but not children", () => {
    render(
      <SectionFrame id="personal" title="Personal information" columns={[]} state="loading" anchors={<div id="signature">Signature</div>}>
        <p>content</p>
      </SectionFrame>,
    )
    expect(container("personal")).toContainElement(document.getElementById("signature"))
    expect(screen.queryByText("content")).toBeNull()
  })
})

describe("SectionFrame — error", () => {
  it("replaces the rows with the banner: alert icon, error-strong copy and a Retry button", () => {
    render(<SectionFrame id="phone" title="Phone" columns={SECTION_COLUMNS.phone} state="error" onRetry={() => {}} />)
    const box = container("phone")
    expect(box).not.toHaveAttribute("aria-busy")
    expect(box.querySelectorAll('[data-slot="section-frame-skeleton-row"]')).toHaveLength(0)
    const banner = box.querySelector('[data-slot="section-frame-error"]') as HTMLElement
    expect(banner).toHaveClass("text-error-strong")
    expect(banner).toHaveAttribute("role", "alert")
    expect(screen.getByRole("alert")).toBe(banner)
    expect(banner).toHaveTextContent("Couldn't load phone · Retry")
    expect(SHELL_COPY.loadError("Social media")).toBe("Couldn't load social media")
    expect(banner.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    expect(within(banner).getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })

  it("Retry has a ≥ 44 × 44 hit area, link-text color and the focus ring", () => {
    render(<SectionFrame id="email" title="Email" columns={SECTION_COLUMNS.email} state="error" onRetry={() => {}} />)
    const retry = screen.getByRole("button", { name: "Retry" })
    expect(retry).toHaveClass("min-h-11", "min-w-11", "text-link-text", "focus-ring")
    expect(retry).toHaveAttribute("type", "button")
  })

  it("Retry calls only its own frame's onRetry, and the other frames keep their state", () => {
    const phoneRetry = vi.fn()
    const emailRetry = vi.fn()
    function Harness() {
      const [phone, setPhone] = useState<SectionFrameState>("error")
      const [email] = useState<SectionFrameState>("error")
      const [social] = useState<SectionFrameState>("loading")
      return (
        <>
          <SectionFrame
            id="phone"
            title="Phone"
            columns={SECTION_COLUMNS.phone}
            state={phone}
            onRetry={() => {
              phoneRetry()
              setPhone("loading")
            }}
          />
          <SectionFrame id="email" title="Email" columns={SECTION_COLUMNS.email} state={email} onRetry={emailRetry} />
          <SectionFrame id="social" title="Social media" columns={SECTION_COLUMNS.social} state={social} />
        </>
      )
    }
    render(<Harness />)
    fireEvent.click(within(frame("phone")).getByRole("button", { name: "Retry" }))
    expect(phoneRetry).toHaveBeenCalledOnce()
    expect(emailRetry).not.toHaveBeenCalled()
    expect(container("phone")).toHaveAttribute("data-state", "loading")
    expect(container("email")).toHaveAttribute("data-state", "error")
    expect(within(frame("email")).getByRole("button", { name: "Retry" })).toBeInTheDocument()
    expect(container("social")).toHaveAttribute("data-state", "loading")
    expect(container("social")).toHaveAttribute("aria-busy", "true")
  })
})

describe("SectionFrame — ready", () => {
  it("renders children only, with no skeleton, banner or anchors", () => {
    render(
      <SectionFrame id="social" title="Social media" columns={SECTION_COLUMNS.social} state="ready" anchors={<div id="anchor" />}>
        <p>No social links yet</p>
      </SectionFrame>,
    )
    const box = container("social")
    expect(box).not.toHaveAttribute("aria-busy")
    expect(within(box).getByText("No social links yet")).toBeInTheDocument()
    expect(box.querySelector('[data-slot="section-frame-skeleton-row"]')).toBeNull()
    expect(box.querySelector('[data-slot="section-frame-error"]')).toBeNull()
    expect(document.getElementById("anchor")).toBeNull()
  })
})

describe("SectionFrame — accessibility", () => {
  it.each(["loading", "error", "ready"] as const)("axe-core reports zero violations in the %s state", async (state) => {
    render(
      <main>
        <SectionFrame id="phone" title="Phone" columns={SECTION_COLUMNS.phone} state={state} onRetry={() => {}}>
          <p>Ready</p>
        </SectionFrame>
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})
