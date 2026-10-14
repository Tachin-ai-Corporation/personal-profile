import { act, fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import { FormField } from "./form-field"
import { InputLocked } from "./input-locked"

const HELP = "Your username can't be changed here."

describe("InputLocked", () => {
  it("is readOnly + aria-readonly, focusable, shows the value and is described by its help line", () => {
    render(<InputLocked aria-label="Username" value="ann.lee" help={HELP} />)
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Username" })
    expect(input.readOnly).toBe(true)
    expect(input.getAttribute("aria-readonly")).toBe("true")
    expect(input.hasAttribute("disabled")).toBe(false)
    expect(input.value).toBe("ann.lee")
    act(() => input.focus())
    expect(document.activeElement).toBe(input)
    expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent).toBe(HELP)
  })

  it("is not editable", () => {
    render(<InputLocked aria-label="Username" value="ann.lee" help={HELP} />)
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Username" })
    fireEvent.change(input, { target: { value: "other" } })
    expect(input.value).toBe("ann.lee")
  })

  it("has the muted fill and a decorative lock icon", () => {
    const { container } = render(<InputLocked aria-label="Username" value="ann.lee" help={HELP} />)
    expect(screen.getByRole("textbox").className).toContain("bg-muted")
    const icon = container.querySelector("svg")
    expect(icon?.getAttribute("aria-hidden")).toBe("true")
    expect(icon?.getAttribute("class")).toContain("lucide-lock")
  })

  it("inside a FormField: labelled, keeps the field's help and adds its own, forwards its ref", () => {
    const ref = createRef<HTMLInputElement>()
    render(
      <FormField label="Email address" id="email" help="Field help.">
        {(control) => <InputLocked ref={ref} {...control} value="ann@example.com" help="Locked. This is the address you sign in with." />}
      </FormField>,
    )
    const input = screen.getByRole("textbox", { name: "Email address" })
    expect(ref.current).toBe(input)
    expect(input.id).toBe("email")
    // Visual order: the locked help (under the input) first, then the field help.
    expect(input.getAttribute("aria-describedby")).toBe("email-locked-help email-help")
    expect(document.getElementById("email-locked-help")?.textContent).toBe("Locked. This is the address you sign in with.")
  })

  it("keeps the right padding clear of the lock icon when invalid", () => {
    render(<InputLocked aria-label="Username" aria-invalid value="ann.lee" help={HELP} />)
    const className = screen.getByRole("textbox").className
    expect(className).toContain("pr-10")
    expect(className).toContain("aria-invalid:pr-[39px]")
  })

  it("has no axe violations", async () => {
    render(
      <main>
        <FormField label="Username">{(control) => <InputLocked {...control} value="ann.lee" help={HELP} />}</FormField>
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})
