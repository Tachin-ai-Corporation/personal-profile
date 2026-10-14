import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  type SelectProps,
} from "./select"

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

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

function Picker(props: Partial<SelectProps> & { readonly describedBy?: string; readonly initial?: string; readonly onChange?: (value: string) => void }) {
  const { describedBy, initial, onChange, ...selectProps } = props
  const [value, setValue] = useState(initial ?? "")
  return (
    <main>
      <label id="email-label">Primary email address</label>
      <Select
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
        {...selectProps}
      >
        <SelectTrigger aria-labelledby="email-label" aria-describedby={describedBy}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ann@work.test">ann@work.test</SelectItem>
          <SelectItem value="ann@home.test">ann@home.test</SelectItem>
        </SelectContent>
      </Select>
      <button type="button">After</button>
    </main>
  )
}

const picker = () => screen.getByRole("combobox", { name: "Primary email address" })

describe("Select F5-1: aria-disabled + helper", () => {
  const helper = (
    <>
      Add another verified email in <a href="#contacts">Contacts</a>
    </>
  )

  it("stays focusable and closed on Enter, Space, ArrowDown, typeahead, click and tap; the helper is its description", async () => {
    const onChange = vi.fn()
    render(<Picker ariaDisabled helper={helper} initial="ann@work.test" onChange={onChange} />)
    const trigger = picker()
    expect(trigger.getAttribute("aria-disabled")).toBe("true")
    expect(trigger.hasAttribute("disabled")).toBe(false)
    expect(trigger.className).toContain("aria-disabled:bg-muted")
    act(() => trigger.focus())
    for (const key of ["Enter", " ", "ArrowDown", "ArrowUp", "a"]) fireEvent.keyDown(trigger, { key })
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.pointerUp(trigger, { pointerType: "mouse" })
    fireEvent.click(trigger, { detail: 1 })
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "touch" })
    fireEvent.click(trigger, { detail: 1 })
    await settle()
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger.textContent).toBe("ann@work.test")

    const helperLine = document.getElementById(trigger.getAttribute("aria-describedby") ?? "")
    expect(helperLine?.textContent).toBe("Add another verified email in Contacts")
    expect(helperLine?.getAttribute("data-slot")).toBe("select-helper")
    expect(await axeViolations()).toEqual([])
  })

  it("Tab still moves on from an aria-disabled trigger (its keydown is not prevented)", () => {
    render(<Picker ariaDisabled />)
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    picker().dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  })

  it("a pointer press focuses the aria-disabled trigger and still calls the caller's handlers", () => {
    const onPointerDown = vi.fn()
    render(
      <Select ariaDisabled>
        <SelectTrigger aria-label="Locale" onPointerDown={onPointerDown}>
          <SelectValue />
        </SelectTrigger>
      </Select>,
    )
    const trigger = screen.getByRole("combobox", { name: "Locale" })
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
    expect(document.activeElement).toBe(trigger)
    expect(onPointerDown).toHaveBeenCalledTimes(1)
  })

  it("composes with FormField's description: field ids first, then the helper", () => {
    render(<Picker helper="Changing it changes your sign-in" describedBy="field-help field-error" />)
    const ids = picker().getAttribute("aria-describedby")?.split(" ") ?? []
    expect(ids.slice(0, 2)).toEqual(["field-help", "field-error"])
    expect(document.getElementById(ids[2])?.textContent).toBe("Changing it changes your sign-in")
    expect(picker().getAttribute("aria-disabled")).toBeNull()
  })

  it("without a helper adds no description; an enabled Select opens and reports changes", async () => {
    const onOpenChange = vi.fn()
    render(<Picker helper="" onOpenChange={onOpenChange} />)
    expect(picker().getAttribute("aria-describedby")).toBeNull()
    fireEvent.keyDown(picker(), { key: "Enter" })
    await screen.findByRole("listbox")
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it("loading sets aria-busy; placeholder comes from the prop (a SelectValue placeholder wins)", () => {
    const { unmount } = render(<Picker loading placeholder="Select a value" />)
    expect(picker().getAttribute("aria-busy")).toBe("true")
    expect(picker().textContent).toBe("Select a value")
    unmount()
    render(
      <Select placeholder="Select a value">
        <SelectTrigger aria-label="Time zone">
          <SelectValue placeholder="Select a time zone" />
        </SelectTrigger>
      </Select>,
    )
    const trigger = screen.getByRole("combobox", { name: "Time zone" })
    expect(trigger.textContent).toBe("Select a time zone")
    expect(trigger.getAttribute("aria-busy")).toBeNull()
  })
})

describe("Select F5-1: unlisted stored value", () => {
  it("shows the stored value's label, never offers it, and another value can be chosen", async () => {
    const onChange = vi.fn()
    render(<Picker initial="America/Phoenix" unlistedValue={{ value: "America/Phoenix", label: "Arizona" }} onChange={onChange} />)
    expect(picker().textContent).toBe("Arizona")
    fireEvent.keyDown(picker(), { key: "Enter" })
    await screen.findByRole("listbox")
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["ann@work.test", "ann@home.test"])
    fireEvent.click(screen.getByRole("option", { name: "ann@home.test" }))
    expect(onChange).toHaveBeenCalledWith("ann@home.test")
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(picker().textContent).toBe("ann@home.test")

    // Once changed, the stored value is not selectable again (hidden and disabled).
    fireEvent.keyDown(picker(), { key: "Enter" })
    await screen.findByRole("listbox")
    const unlisted = document.querySelector("[data-slot='select-unlisted-item']")
    expect(unlisted?.hasAttribute("hidden")).toBe(true)
    expect(unlisted?.getAttribute("aria-disabled")).toBe("true")
    expect(screen.getAllByRole("option")).toHaveLength(2)
  })

  it("shows the raw code when no label is known", () => {
    render(<Picker initial="xx-YY" unlistedValue={{ value: "xx-YY" }} />)
    expect(picker().textContent).toBe("xx-YY")
  })
})
