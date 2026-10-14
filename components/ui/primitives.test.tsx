// Story 1.8a: the primitives read the DESIGN.md override tokens. The color gate
// only rejects hex and palette classes, so a fallback to another valid token
// (bg-destructive, text-primary, border-input, ...) is caught here instead.
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "./button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog"
import { Input } from "./input"

describe("primitive token classes", () => {
  it("destructive Button fills with destructive-fill and white foreground", () => {
    render(<Button variant="destructive">Delete</Button>)
    const btn = screen.getByRole("button", { name: "Delete" })
    expect(btn).toHaveClass("bg-destructive-fill", "text-destructive-foreground", "hover:bg-destructive-fill/90")
    expect(btn).not.toHaveClass("bg-destructive")
    expect(btn).not.toHaveClass("dark:bg-destructive/60")
    expect(btn).not.toHaveClass("text-white")
  })

  it("Button uses the shared focus-ring utility, not the shadcn ring classes (Story 1.8b)", () => {
    render(
      <>
        <Button>Save</Button>
        <Button variant="destructive">Remove</Button>
      </>,
    )
    for (const name of ["Save", "Remove"]) {
      const btn = screen.getByRole("button", { name })
      expect(btn).toHaveClass("focus-ring")
      expect(btn.className).not.toMatch(/focus-visible:ring/)
    }
  })

  it("link Button uses link-text", () => {
    render(<Button variant="link">Learn more</Button>)
    const btn = screen.getByRole("button", { name: "Learn more" })
    expect(btn).toHaveClass("text-link-text")
    expect(btn).not.toHaveClass("text-primary")
  })

  it("Input uses control-border and keeps the dark input fill", () => {
    render(<Input aria-label="Name" />)
    const input = screen.getByRole("textbox", { name: "Name" })
    expect(input).toHaveClass("border-control-border", "dark:bg-input/30")
    expect(input).not.toHaveClass("border-input")
  })

  it("open Dialog overlay uses the scrim token", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).not.toBeNull()
    expect(overlay).toHaveClass("bg-scrim")
    expect(overlay).not.toHaveClass("bg-black/50")
  })
})
