import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "./select"

beforeEach(() => stubLayoutApis())

function setup(onValueChange = vi.fn()) {
  render(
    <main>
      <label id="lang-label">Preferred language</label>
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-labelledby="lang-label">
          <SelectValue placeholder="Select a value" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Languages</SelectLabel>
            <SelectItem value="en">English</SelectItem>
            <SelectSeparator />
            <SelectItem value="es">Spanish</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </main>,
  )
  return { trigger: screen.getByRole("combobox", { name: "Preferred language" }), onValueChange }
}

describe("Select (ported from main b005536)", () => {
  it("is the input box: 44 px, 16 px text, control-border, focus-ring, 2 px error border when invalid", () => {
    const { trigger } = setup()
    for (const name of ["data-[size=default]:h-11", "data-[size=default]:text-body", "border-control-border", "bg-card", "focus-ring", "aria-invalid:border-2", "aria-invalid:border-error"]) {
      expect(trigger.className).toContain(name)
    }
    expect(trigger.getAttribute("data-size")).toBe("default")
    expect(trigger.textContent).toBe("Select a value")
  })

  it("opens from the keyboard and picks an option", async () => {
    const { trigger, onValueChange } = setup()
    trigger.focus()
    fireEvent.keyDown(trigger, { key: "Enter" })
    const option = await screen.findByRole("option", { name: "Spanish" })
    expect(option.className).toContain("min-h-11")
    expect(screen.getByRole("listbox").className).toContain("shadow-md")
    fireEvent.click(option)
    expect(onValueChange).toHaveBeenCalledWith("es")
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(trigger.textContent).toBe("Spanish")
  })

  it("supports the small size", () => {
    render(
      <Select>
        <SelectTrigger size="sm" aria-label="Jump to">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    )
    expect(screen.getByRole("combobox", { name: "Jump to" }).getAttribute("data-size")).toBe("sm")
  })

  it("has no axe violations closed and open", async () => {
    const { trigger } = setup()
    expect(await axeViolations()).toEqual([])
    fireEvent.keyDown(trigger, { key: "Enter" })
    await screen.findByRole("listbox")
    expect(await axeViolations()).toEqual([])
  })
})
