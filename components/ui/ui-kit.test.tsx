import { act, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { Checkbox } from "./checkbox"
import { Chip, OverflowChip } from "./chip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./dropdown-menu"
import { EmptyState } from "./empty-state"
import { LiveStatus, useAnnounce } from "./live-status"
import { Switch } from "./switch"

beforeEach(() => stubLayoutApis())

describe("DropdownMenu (F6-2 row-menu)", () => {
  function setup() {
    const onEdit = vi.fn()
    const onRemove = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Row</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              Remove
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    return { onEdit, onRemove, trigger: screen.getByRole("button", { name: "Actions" }) }
  }

  it("opens from the keyboard as a row-menu with 44 px items and a red-text destructive item", async () => {
    const { trigger, onRemove } = setup()
    fireEvent.keyDown(trigger, { key: "Enter" })
    const menu = await screen.findByRole("menu")
    for (const token of ["bg-popover", "rounded-md", "shadow-md", "motion-reduce:animate-none"]) expect(menu.className).toContain(token)
    const remove = screen.getByRole("menuitem", { name: "Remove" })
    expect(remove.className).toContain("min-h-11")
    expect(remove.getAttribute("data-variant")).toBe("destructive")
    expect(remove.className).toContain("data-[variant=destructive]:text-error-strong")
    expect(await axeViolations()).toEqual([])
    fireEvent.click(remove)
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
  })
})

describe("Checkbox and Switch (F6-2)", () => {
  function Controls() {
    const [primary, setPrimary] = React.useState(false)
    const [notify, setNotify] = React.useState(true)
    return (
      <main>
        <Checkbox id="primary" checked={primary} onCheckedChange={(value) => setPrimary(value === true)} />
        <label htmlFor="primary">Set as primary</label>
        <Switch id="notify" checked={notify} onCheckedChange={setNotify} />
        <label htmlFor="notify">Notifications</label>
      </main>
    )
  }

  it("are 44 px named controls that toggle by click and keyboard, axe clean", async () => {
    render(<Controls />)
    const checkbox = screen.getByRole("checkbox", { name: "Set as primary" })
    const toggle = screen.getByRole("switch", { name: "Notifications" })
    expect(checkbox.className).toContain("size-11")
    expect(toggle.className).toContain("h-11")
    for (const el of [checkbox, toggle]) expect(el.className).toContain("focus-ring")
    expect(checkbox.getAttribute("aria-checked")).toBe("false")
    fireEvent.click(checkbox)
    expect(checkbox.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByText("Set as primary"))
    expect(checkbox.getAttribute("aria-checked")).toBe("false")
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-checked")).toBe("false")
    expect(await axeViolations()).toEqual([])
  })
})

describe("Checkbox and Switch ariaDisabled (F6-2 review)", () => {
  it("stay focusable, look disabled and never change on click, Space or a label press", () => {
    const onCheckbox = vi.fn()
    const onSwitch = vi.fn()
    const onClick = vi.fn()
    render(
      <main>
        <Checkbox id="primary" ariaDisabled aria-describedby="why" onCheckedChange={onCheckbox} />
        <label htmlFor="primary">Set as primary</label>
        <Switch id="notify" ariaDisabled defaultChecked onCheckedChange={onSwitch} />
        <label htmlFor="notify">Notifications</label>
        <Checkbox id="enabled" onClick={onClick} />
        <label htmlFor="enabled">Enabled</label>
        <p id="why">Verify this address first</p>
      </main>,
    )
    const checkbox = screen.getByRole("checkbox", { name: "Set as primary" })
    const toggle = screen.getByRole("switch", { name: "Notifications" })
    for (const control of [checkbox, toggle]) {
      expect(control.getAttribute("aria-disabled")).toBe("true")
      expect(control.className).toContain("aria-disabled:opacity-50")
      expect(control.hasAttribute("disabled")).toBe(false)
      control.focus()
      expect(document.activeElement).toBe(control)
      fireEvent.click(control)
      fireEvent.keyDown(control, { key: " " })
    }
    fireEvent.click(screen.getByText("Set as primary"))
    expect(checkbox.getAttribute("aria-checked")).toBe("false")
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    expect(onCheckbox).not.toHaveBeenCalled()
    expect(onSwitch).not.toHaveBeenCalled()
    // An enabled one still calls the caller's onClick and toggles.
    fireEvent.click(screen.getByRole("checkbox", { name: "Enabled" }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("checkbox", { name: "Enabled" }).getAttribute("aria-checked")).toBe("true")
  })
})

describe("Chip (F6-2)", () => {
  it.each([
    ["label", "bg-muted"],
    ["primary", "bg-primary"],
    ["deleted", "text-muted-foreground"],
    ["overflow", "border-border"],
  ] as const)("%s: square 22 px chip type, %s", (variant, token) => {
    render(<Chip variant={variant}>Work</Chip>)
    const chip = screen.getByText("Work")
    for (const name of ["rounded-sm", "h-[22px]", "text-caption", "font-semibold", token]) expect(chip.className).toContain(name)
    expect(chip.className).not.toContain("rounded-full")
  })

  it("defaults to the label chip", () => {
    render(<Chip>Old</Chip>)
    expect(screen.getByText("Old").getAttribute("data-variant")).toBe("label")
  })

  it("OverflowChip: a 44 px button named by its list, showing +N, forwarding its ref", async () => {
    const ref = React.createRef<HTMLButtonElement>()
    render(<OverflowChip ref={ref} count={2} aria-label="2 more types: Insurance, Population Health" />)
    const button = screen.getByRole("button", { name: "2 more types: Insurance, Population Health" })
    expect(ref.current).toBe(button)
    expect(button.textContent).toBe("+2")
    expect(button.className).toContain("min-h-11")
    expect(button.getAttribute("type")).toBe("button")
    expect(await axeViolations()).toEqual([])
  })
})

describe("EmptyState (F6-2)", () => {
  it("row: one row spanning the columns with copy · link action", async () => {
    const onAdd = vi.fn()
    render(
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>Label</th>
          </tr>
        </thead>
        <tbody>
          <EmptyState variant="row" colSpan={2} message="No phones yet" action={{ label: "Add phone", onClick: onAdd }} />
        </tbody>
      </table>,
    )
    const cell = screen.getByRole("cell")
    expect(cell.getAttribute("colspan")).toBe("2")
    expect(cell.textContent).toBe("No phones yet·Add phone")
    const add = screen.getByRole("button", { name: "Add phone" })
    expect(add.className).toContain("text-link-text")
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(await axeViolations()).toEqual([])
  })

  it("row without an action is just the line", () => {
    render(
      <table>
        <tbody>
          <EmptyState variant="row" colSpan={3} message="No social links yet" />
        </tbody>
      </table>,
    )
    expect(screen.getByRole("cell").textContent).toBe("No social links yet")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("card: dashed card with optional title, children and a primary action", async () => {
    const onAdd = vi.fn()
    render(
      <EmptyState variant="card" title="No insurance" message="No insurance on file. Add a policy before your next visit." action={{ label: "Add insurance", onClick: onAdd }}>
        <p>Extra</p>
      </EmptyState>,
    )
    const card = document.querySelector("[data-slot='empty-state']") as HTMLElement
    for (const token of ["border-dashed", "rounded-md", "bg-card"]) expect(card.className).toContain(token)
    expect(screen.getByText("No insurance").className).toContain("section-title")
    expect(screen.getByText("Extra")).toBeTruthy()
    const add = screen.getByRole("button", { name: "Add insurance" })
    expect(add.className).toContain("bg-primary")
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(await axeViolations()).toEqual([])
  })

  it("card title takes a heading level with titleAs", () => {
    render(<EmptyState variant="card" title="You aren't managing any organizations yet" titleAs="h3" message="Register one." />)
    expect(screen.getByRole("heading", { level: 3, name: "You aren't managing any organizations yet" }).className).toContain("section-title")
  })

  it("an action with a reason is aria-disabled and does nothing, in both variants", () => {
    const onAdd = vi.fn()
    render(
      <>
        <EmptyState variant="card" message="None" action={{ label: "Add insurance", onClick: onAdd, disabledReason: "Not now" }} />
        <table>
          <tbody>
            <EmptyState variant="row" colSpan={1} message="None yet" action={{ label: "Add phone", onClick: onAdd, disabledReason: "Not now" }} />
          </tbody>
        </table>
      </>,
    )
    for (const name of ["Add insurance", "Add phone"]) {
      const button = screen.getByRole("button", { name })
      expect(button.getAttribute("aria-disabled")).toBe("true")
      fireEvent.click(button)
    }
    expect(onAdd).not.toHaveBeenCalled()
    const card = document.querySelector("[data-slot='empty-state'][data-variant='card']") as HTMLElement
    expect(card.querySelector("p.section-title")).toBeNull()
  })
})

describe("LiveStatus / useAnnounce (F6-2)", () => {
  function Announcing({ clearAfterMs }: { readonly clearAfterMs?: number }) {
    const { message, announce, clear } = useAnnounce({ clearAfterMs })
    return (
      <>
        <button type="button" onClick={() => announce("Link sent")}>
          Send
        </button>
        <button type="button" onClick={clear}>
          Clear
        </button>
        <LiveStatus message={message} />
        <LiveStatus message="Unsaved changes" visible className="text-warning-strong" />
      </>
    )
  }

  it("announces politely, re-announces identical text, and clears", () => {
    render(<Announcing />)
    const [region, visible] = screen.getAllByRole("status")
    expect(region.getAttribute("aria-live")).toBe("polite")
    expect(region.getAttribute("aria-atomic")).toBe("true")
    expect(region.className).toContain("sr-only")
    expect(visible.className).not.toContain("sr-only")
    expect(visible.className).toContain("text-warning-strong")
    expect(region.textContent).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(region.textContent).toBe("Link sent")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(region.textContent).toBe("Link sent ")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(region.textContent).toBe("Link sent")
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(region.textContent).toBe("")
  })

  it("clears by itself after clearAfterMs", () => {
    vi.useFakeTimers()
    try {
      render(<Announcing clearAfterMs={5000} />)
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
      const region = screen.getAllByRole("status")[0]
      act(() => vi.advanceTimersByTime(4999))
      expect(region.textContent).toBe("Link sent")
      act(() => vi.advanceTimersByTime(1))
      expect(region.textContent).toBe("")
    } finally {
      vi.useRealTimers()
    }
  })
})
