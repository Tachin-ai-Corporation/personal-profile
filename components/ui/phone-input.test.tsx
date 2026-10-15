import { fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { phoneIssue, toE164, type PhoneInputValue } from "@/lib/shared/phone"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { FormField } from "./form-field"
import { PhoneInput, type PhoneInputProps } from "./phone-input"

beforeEach(() => stubLayoutApis())

function Harness({ initial = { region: "us", national: "" }, onBlur, ...props }: Partial<PhoneInputProps> & { readonly initial?: PhoneInputValue }) {
  const [value, setValue] = React.useState<PhoneInputValue>(initial)
  const issue = value.national === "" ? null : phoneIssue(value)
  return (
    <main>
      <FormField label="Phone number" help="Include the area code." error={issue ? `issue:${issue}` : undefined}>
        {(control) => <PhoneInput {...control} {...props} value={value} onChange={setValue} onBlur={onBlur} />}
      </FormField>
      <output data-testid="e164">{toE164(value) ?? ""}</output>
      <output data-testid="region">{value.region}</output>
    </main>
  )
}

const number = () => screen.getByRole("textbox", { name: "Phone number" }) as HTMLInputElement
const country = () => screen.getByRole("combobox", { name: /^Country code/ })

describe("PhoneInput (F6-2)", () => {
  it("is a country picker (flag + dial code) joined to a 44 px, 16 px tel input wired by FormField; axe clean", async () => {
    render(<Harness />)
    expect(country().textContent).toBe("🇺🇸+1")
    // Screen readers hear the label and the country's name (the flag is decorative).
    expect(screen.getByRole("combobox", { name: "Country code +1 United States" })).toBe(country())
    const input = number()
    expect(input.getAttribute("type")).toBe("tel")
    expect(input.getAttribute("inputmode")).toBe("tel")
    expect(input.getAttribute("autocomplete")).toBe("tel-national")
    expect(input.className).toContain("h-11")
    expect(input.className).toContain("text-body")
    expect(input.className).toContain("rounded-l-none")
    const helpId = input.getAttribute("aria-describedby") ?? ""
    expect(document.getElementById(helpId)?.textContent).toBe("Include the area code.")
    expect(await axeViolations()).toEqual([])
  })

  it("keeps typed digits, drops letters, drops digits past the country's maximum and formats on blur", () => {
    const onBlur = vi.fn()
    render(<Harness onBlur={onBlur} />)
    fireEvent.change(number(), { target: { value: "415a5552125" } })
    expect(number().value).toBe("4155552125")
    fireEvent.change(number(), { target: { value: "41555521259" } })
    expect(number().value).toBe("4155552125")
    // A too-long paste keeps its first digits (1health-fe clamps trailing ones).
    fireEvent.change(number(), { target: { value: "(415) 555-2125 ext 99" } })
    expect(number().value).toBe("4155552125")
    fireEvent.blur(number())
    expect(number().value).toBe("(415) 555-2125")
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("e164").textContent).toBe("+14155552125")
    fireEvent.blur(number())
    expect(number().value).toBe("(415) 555-2125")
  })

  it("marks an invalid number (aria-invalid on the input and the picker)", () => {
    render(<Harness initial={{ region: "us", national: "415 555" }} />)
    expect(number().getAttribute("aria-invalid")).toBe("true")
    expect(country().getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("issue:tenDigits")).toBeTruthy()
  })

  it("switches the country when an international number is pasted, and keeps an unparsable one as typed", () => {
    render(<Harness />)
    fireEvent.change(number(), { target: { value: "+44 20 7183 8750" } })
    expect(screen.getByTestId("region").textContent).toBe("gb")
    expect(number().value).toBe("020 7183 8750")
    expect(country().textContent).toBe("🇬🇧+44")
    fireEvent.change(number(), { target: { value: "+99" } })
    expect(number().value).toBe("+99")
    expect(screen.getByTestId("region").textContent).toBe("gb")
  })

  it("picks a country from the list and re-formats the number for it", async () => {
    render(<Harness initial={{ region: "us", national: "20 7183 8750" }} />)
    fireEvent.keyDown(country(), { key: "Enter" })
    const option = await screen.findByRole("option", { name: /United Kingdom/ })
    expect(option.textContent).toContain("+44")
    fireEvent.click(option)
    expect(screen.getByTestId("region").textContent).toBe("gb")
    expect(number().value).toBe("020 7183 8750")
    expect(screen.getByTestId("e164").textContent).toBe("+442071838750")
  })

  it("is read-only while saving: the number can't change and the picker never opens", () => {
    render(<Harness readOnly initial={{ region: "us", national: "4155552125" }} />)
    expect(number().readOnly).toBe(true)
    expect(country().getAttribute("aria-disabled")).toBe("true")
    fireEvent.keyDown(country(), { key: "Enter" })
    expect(screen.queryByRole("listbox")).toBeNull()
    // Blur never re-formats a read-only value.
    fireEvent.blur(number())
    expect(number().value).toBe("4155552125")
  })

  it("passes a ref to the number input and supports disabled", () => {
    const ref = React.createRef<HTMLInputElement>()
    render(<Harness inputRef={ref} disabled name="phone" />)
    expect(ref.current).toBe(number())
    expect(number().disabled).toBe(true)
    expect(number().name).toBe("phone")
  })
})
