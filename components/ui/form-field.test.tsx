import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import { FieldError, FormField } from "./form-field"
import { Input } from "./input"

describe("FormField", () => {
  it("labels the control and wires nothing else when there is no help or error", () => {
    render(<FormField label="First name">{(control) => <Input {...control} />}</FormField>)
    const input = screen.getByRole("textbox", { name: "First name" })
    expect(input.getAttribute("aria-describedby")).toBeNull()
    expect(input.getAttribute("aria-invalid")).toBeNull()
  })

  it("adds the muted (optional) suffix; required fields carry no marker", () => {
    render(
      <FormField label="Middle name" optional>
        {(control) => <Input {...control} />}
      </FormField>,
    )
    const input = screen.getByRole("textbox", { name: "Middle name (optional)" })
    const suffix = document.querySelector(`label[for='${input.id}'] span`)
    expect(suffix?.textContent).toBe("(optional)")
    expect(suffix?.className).toContain("text-muted-foreground")
  })

  it("uses the given id and describes the control by its help", () => {
    render(
      <FormField label="Other names" id="other-names" help="Former or other legal names." optional>
        {(control) => <Input {...control} />}
      </FormField>,
    )
    const input = screen.getByRole("textbox", { name: "Other names (optional)" })
    expect(input.id).toBe("other-names")
    expect(input.getAttribute("aria-describedby")).toBe("other-names-help")
    expect(document.getElementById("other-names-help")?.textContent).toBe("Former or other legal names.")
  })

  it("with an error: aria-invalid, describedby help then error, error-strong line with an alert icon, 2 px error border", () => {
    render(
      <FormField label="Email address" id="email" help="Use the one you check." error="Enter a valid email address">
        {(control) => <Input {...control} />}
      </FormField>,
    )
    const input = screen.getByRole("textbox", { name: "Email address" })
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(input.getAttribute("aria-describedby")).toBe("email-help email-error")
    const error = document.getElementById("email-error")
    expect(error?.textContent).toBe("Enter a valid email address")
    expect(error?.className).toContain("text-error-strong")
    expect(error?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    // The error sits in a polite live region, so it is announced when it appears on blur.
    expect(error?.parentElement?.getAttribute("aria-live")).toBe("polite")
    expect(input.className).toContain("aria-invalid:border-2")
    expect(input.className).toContain("aria-invalid:border-error")
  })

  it("treats an empty error as no error", () => {
    render(
      <FormField label="City of birth" error="">
        {(control) => <Input {...control} />}
      </FormField>,
    )
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBeNull()
  })

  it("required: sets required and aria-required on the control, with no visible marker", () => {
    render(
      <FormField label="First name" required>
        {(control) => <Input {...control} />}
      </FormField>,
    )
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "First name" })
    expect(input.required).toBe(true)
    expect(input.getAttribute("aria-required")).toBe("true")
    expect(document.querySelector("label")?.textContent).toBe("First name")
  })

  it("not required: neither attribute", () => {
    render(<FormField label="First name">{(control) => <Input {...control} />}</FormField>)
    const input = screen.getByRole("textbox")
    expect(input.hasAttribute("required")).toBe(false)
    expect(input.hasAttribute("aria-required")).toBe(false)
  })

  it("treats help like error: only undefined, null, false and empty string are empty (0 is shown)", () => {
    const { unmount } = render(
      <FormField label="Count" id="count" help={0}>
        {(control) => <Input {...control} />}
      </FormField>,
    )
    expect(screen.getByRole("textbox").getAttribute("aria-describedby")).toBe("count-help")
    expect(document.getElementById("count-help")?.textContent).toBe("0")
    unmount()
    render(
      <FormField label="Count" id="count" help="" error={false}>
        {(control) => <Input {...control} />}
      </FormField>,
    )
    expect(screen.getByRole("textbox").getAttribute("aria-describedby")).toBeNull()
    expect(document.getElementById("count-help")).toBeNull()
  })

  it("renders a label addon after the label", () => {
    render(
      <FormField label="Birth date" labelAddon={<button type="button">About birth date</button>}>
        {(control) => <Input {...control} />}
      </FormField>,
    )
    expect(screen.getByRole("button", { name: "About birth date" })).not.toBeNull()
  })

  it("inputs are 44 px with 16 px text and the control-border boundary", () => {
    render(<FormField label="First name">{(control) => <Input {...control} />}</FormField>)
    const input = screen.getByRole("textbox")
    for (const name of ["h-11", "text-body", "border-control-border", "rounded-md", "focus-ring"]) expect(input.className).toContain(name)
  })

  it("has no axe violations, valid and invalid", async () => {
    render(
      <main>
        <FormField label="First name" help="As on your ID.">
          {(control) => <Input {...control} />}
        </FormField>
        <FormField label="Email address" optional error="Enter a valid email address">
          {(control) => <Input {...control} />}
        </FormField>
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})

describe("FieldError", () => {
  it("renders the message with its id", () => {
    render(<FieldError id="x-error">This number is already on your profile</FieldError>)
    expect(document.getElementById("x-error")?.textContent).toBe("This number is already on your profile")
  })
})
