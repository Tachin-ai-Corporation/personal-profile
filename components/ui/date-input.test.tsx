import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CONTROL_MESSAGES, PERSON_MESSAGES } from "@/lib/shared/messages"
import { birthDateBounds } from "@/lib/shared/person-rules"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { DateInput, type DateInputProps } from "./date-input"
import { FormField } from "./form-field"

beforeEach(() => stubLayoutApis())

const TODAY = new Date(2026, 9, 14)
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

type HarnessProps = Partial<Omit<DateInputProps, "value" | "onChange">> & {
  readonly initial?: string
  readonly spy?: (value: string, text: string) => void
}

/** A Birth date field the way a feature wires it: FormField + the caller's own error. */
function Harness({ initial = "", spy, ...props }: HarnessProps) {
  const [value, setValue] = useState(initial)
  const [text, setText] = useState("")
  const [resets, setResets] = useState(0)
  const error = text !== "" && value === "" && text.length === 10 ? PERSON_MESSAGES.birthDateFormat : undefined
  return (
    <main>
      <FormField label="Birth date" required error={error}>
        {(control) => (
          <DateInput
            {...control}
            value={value}
            onChange={(next, detail) => {
              setValue(next)
              setText(detail.text)
              spy?.(next, detail.text)
            }}
            today={TODAY}
            resetKey={resets}
            {...props}
          />
        )}
      </FormField>
      <button type="button" onClick={() => setValue("1987-03-09")}>
        Load stored
      </button>
      <button
        type="button"
        onClick={() => {
          setValue("")
          setText("")
          setResets((n) => n + 1)
        }}
      >
        Reset
      </button>
      <output data-testid="value">{value}</output>
    </main>
  )
}

const field = () => screen.getByRole("textbox", { name: "Birth date" }) as HTMLInputElement

/** Types one character at the caret, as the browser does before React's onChange. */
function typeChar(input: HTMLInputElement, char: string): void {
  const caret = input.selectionStart ?? input.value.length
  const next = input.value.slice(0, caret) + char + input.value.slice(input.selectionEnd ?? caret)
  fireEvent.change(input, { target: { value: next, selectionStart: caret + 1, selectionEnd: caret + 1 } })
}

function typeText(input: HTMLInputElement, chars: string): void {
  act(() => input.focus())
  for (const char of chars) typeChar(input, char)
}

function paste(input: HTMLInputElement, text: string): boolean {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData: () => string } }
  event.clipboardData = { getData: () => text }
  act(() => {
    input.dispatchEvent(event)
  })
  return event.defaultPrevented
}

describe("DateInput: typing", () => {
  it("masks MM/DD/YYYY as you type and reports the wire date", () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    const input = field()
    expect(input.getAttribute("inputmode")).toBe("numeric")
    expect(input.getAttribute("maxlength")).toBe("10")
    expect(input.placeholder).toBe(CONTROL_MESSAGES.datePlaceholder)
    expect(input.className).toContain("h-11")
    typeText(input, "02292024")
    expect(input.value).toBe("02/29/2024")
    expect(spy).toHaveBeenLastCalledWith("2024-02-29", "02/29/2024")
    expect(spy.mock.calls.map(([, text]) => text)).toEqual(["0", "02", "02/2", "02/29", "02/29/2", "02/29/20", "02/29/202", "02/29/2024"])
    expect(spy.mock.calls.slice(0, -1).every(([wire]) => wire === "")).toBe(true)
    expect(input.selectionStart).toBe(10)
  })

  it("an impossible date reports \"\" and the caller's schema shows its catalog message, wired by FormField", () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    typeText(field(), "02301990")
    expect(spy).toHaveBeenLastCalledWith("", "02/30/1990")
    const input = field()
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(input.getAttribute("aria-required")).toBe("true")
    expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent).toBe(PERSON_MESSAGES.birthDateFormat)
  })

  it("ignores non-digits and stops at 8 digits", () => {
    render(<Harness />)
    typeText(field(), "1a2/")
    expect(field().value).toBe("12")
    fireEvent.change(field(), { target: { value: "12/31/19991" } })
    expect(field().value).toBe("12/31/1999")
  })

  it("Backspace right after a slash removes the digit before it; other Backspaces are the browser's", () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    typeText(field(), "022")
    const input = field()
    input.setSelectionRange(3, 3)
    fireEvent.keyDown(input, { key: "Backspace" })
    expect(input.value).toBe("02")
    expect(input.selectionStart).toBe(1)
    expect(spy).toHaveBeenLastCalledWith("", "02")

    for (const [start, end] of [
      [2, 2],
      [0, 0],
      [0, 2],
    ]) {
      input.setSelectionRange(start, end)
      const event = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })
      act(() => {
        input.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(false)
    }
    fireEvent.keyDown(input, { key: "a" })
    expect(input.value).toBe("02")
  })

  it("keeps the caret on the same digit after an edit in the middle", () => {
    render(<Harness initial="2024-02-29" />)
    const input = field()
    act(() => input.focus())
    // The browser deleted the "2" of the day (index 3), caret at 3.
    fireEvent.change(input, { target: { value: "02/9/2024", selectionStart: 3, selectionEnd: 3 } })
    expect(input.value).toBe("02/92/024")
    expect(input.selectionStart).toBe(2)
  })

  it("accepts a pasted MM/DD/YYYY or YYYY-MM-DD whole; anything else is pasted as usual", () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    expect(paste(field(), " 2024-02-29 ")).toBe(true)
    expect(field().value).toBe("02/29/2024")
    expect(spy).toHaveBeenLastCalledWith("2024-02-29", "02/29/2024")
    expect(paste(field(), "03/09/1987")).toBe(true)
    expect(spy).toHaveBeenLastCalledWith("1987-03-09", "03/09/1987")
    expect(paste(field(), "0309")).toBe(false)
  })

  it("lets the caller's onKeyDown and onPaste run first and opt out", () => {
    const spy = vi.fn()
    render(
      <Harness
        spy={spy}
        onKeyDown={(event) => event.preventDefault()}
        onPaste={(event) => event.preventDefault()}
        initial="2024-02-29"
      />,
    )
    const input = field()
    input.setSelectionRange(3, 3)
    fireEvent.keyDown(input, { key: "Backspace" })
    expect(paste(input, "2020-01-01")).toBe(true)
    expect(input.value).toBe("02/29/2024")
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("DateInput: value sync", () => {
  it("shows a stored wire value, replaces the text when the value changes from outside, keeps partial text on its own echo", () => {
    render(<Harness initial="1990-02-28" />)
    expect(field().value).toBe("02/28/1990")
    typeText(field(), "")
    fireEvent.change(field(), { target: { value: "02/2" } })
    expect(field().value).toBe("02/2")
    expect(screen.getByTestId("value").textContent).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "Load stored" }))
    expect(field().value).toBe("03/09/1987")
  })

  it("an invalid stored value starts empty", () => {
    render(<Harness initial="1990-02-30" />)
    expect(field().value).toBe("")
  })

  it("without the calendar prop there is no calendar button; the ref reaches the input", () => {
    const ref = { current: null as HTMLInputElement | null }
    render(<DateInput aria-label="Effective date" value="" onChange={() => {}} ref={ref} />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Effective date" }))
  })
})

describe("DateInput: review fixes", () => {
  it("resetKey clears partial or impossible text even when the value already is \"\"", () => {
    render(<Harness />)
    typeText(field(), "02301990")
    expect(field().value).toBe("02/30/1990")
    fireEvent.click(screen.getByRole("button", { name: "Reset" }))
    expect(field().value).toBe("")
    typeText(field(), "022")
    fireEvent.click(screen.getByRole("button", { name: "Reset" }))
    expect(field().value).toBe("")
  })

  it.each([{ readOnly: true }, { disabled: true }])("%j blocks the slash Backspace/Delete and paste handlers", (props) => {
    const spy = vi.fn()
    render(<Harness initial="2024-02-29" spy={spy} {...props} />)
    const input = field()
    for (const [key, caret] of [
      ["Backspace", 3],
      ["Delete", 2],
    ] as const) {
      input.setSelectionRange(caret, caret)
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      act(() => {
        input.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(false)
    }
    expect(paste(input, "2020-01-01")).toBe(false)
    expect(input.value).toBe("02/29/2024")
    expect(spy).not.toHaveBeenCalled()
  })

  it("closes an open calendar when it becomes disabled or read-only", async () => {
    const { rerender } = render(<DateInput aria-label="Effective date" value="" onChange={() => {}} calendar today={TODAY} />)
    fireEvent.click(screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate }))
    await screen.findByRole("dialog")
    rerender(<DateInput aria-label="Effective date" value="" onChange={() => {}} calendar today={TODAY} readOnly />)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("Delete right before a slash removes the digit after it", () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    typeText(field(), "0229")
    const input = field()
    input.setSelectionRange(2, 2)
    fireEvent.keyDown(input, { key: "Delete" })
    expect(input.value).toBe("02/9")
    expect(input.selectionStart).toBe(2)
    expect(spy).toHaveBeenLastCalledWith("", "02/9")
    // Delete elsewhere is the browser's.
    input.setSelectionRange(3, 3)
    const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })
    act(() => {
      input.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)
  })

  it("keeps years 0001–0099 in their own century", async () => {
    render(<Harness calendar initial="0050-03-15" min="0040-01-01" max="0060-12-31" />)
    fireEvent.click(screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate }))
    await screen.findByRole("dialog")
    expect(screen.getByRole("grid").getAttribute("aria-label")).toMatch(/^March 0*50$/)
    const years = Array.from(screen.getByRole("combobox", { name: "Choose the Year" }).querySelectorAll("option")).map((option) => option.textContent)
    expect(years[0]).toMatch(/^0*40$/)
  })

  it("ignores inverted bounds (min after max) with a development warning instead of disabling every day", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    render(<Harness calendar min="2005-01-01" max="1990-01-01" />)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("min 2005-01-01 is after max 1990-01-01"))
    fireEvent.click(screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate }))
    await screen.findByRole("dialog")
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("October 2026")
    expect((screen.getByRole("button", { name: /October 14th, 2026/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe("DateInput: calendar", () => {
  const proctor = birthDateBounds(["Proctor"], TODAY)

  it("opens a calendar dialog bounded by min/max (Proctor today 2026-10-14: 1906-10-14 to 2005-10-14), starting at the latest allowed month", async () => {
    render(<Harness calendar min={proctor.min} max={proctor.max} />)
    const button = screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate })
    expect(button.className).toContain("size-11")
    expect(field().className).toContain("pr-12")
    fireEvent.click(button)
    const dialog = await screen.findByRole("dialog", { name: CONTROL_MESSAGES.chooseDate })
    expect(dialog.getAttribute("data-side")).toBe("bottom")
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("October 2005")
    expect((screen.getByRole("button", { name: /October 15th, 2005/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: /October 14th, 2005/ }) as HTMLButtonElement).disabled).toBe(false)
    const years = Array.from(screen.getByRole("combobox", { name: "Choose the Year" }).querySelectorAll("option")).map((option) => option.textContent)
    expect([years[0], years.at(-1)]).toEqual(["1906", "2005"])
    fireEvent.change(screen.getByRole("combobox", { name: "Choose the Year" }), { target: { value: "1906" } })
    expect((screen.getByRole("button", { name: /October 13th, 1906/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: /October 14th, 1906/ }) as HTMLButtonElement).disabled).toBe(false)
    expect(await axeViolations()).toEqual([])
  })

  it("picking a day fills the input and the wire value, closes, and returns focus to the button", async () => {
    const spy = vi.fn()
    render(<Harness calendar initial="1987-03-09" spy={spy} min={proctor.min} max={proctor.max} />)
    const button = screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate })
    act(() => button.focus())
    fireEvent.click(button)
    await screen.findByRole("dialog")
    // The selected day takes focus (grid keyboard).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /March 9th, 1987/ })))
    fireEvent.click(screen.getByRole("button", { name: /March 12th, 1987/ }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(field().value).toBe("03/12/1987")
    expect(spy).toHaveBeenLastCalledWith("1987-03-12", "03/12/1987")
    await settle()
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it("Escape closes the calendar with focus back on its button", async () => {
    render(<Harness calendar />)
    const button = screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate })
    act(() => button.focus())
    fireEvent.click(button)
    await screen.findByRole("dialog")
    // No bounds: starts at today's month.
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("October 2026")
    const years = Array.from(screen.getByRole("combobox", { name: "Choose the Year" }).querySelectorAll("option")).map((option) => option.textContent)
    expect([years[0], years.at(-1)]).toEqual(["1906", "2046"])
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it("starts at the earliest allowed month when today is before min; disabled or read-only disables the button", async () => {
    const { unmount } = render(<Harness calendar min="2030-01-15" calendarLabel="Pick effective date" />)
    fireEvent.click(screen.getByRole("button", { name: "Pick effective date" }))
    await screen.findByRole("dialog", { name: "Pick effective date" })
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("January 2030")
    const years = Array.from(screen.getByRole("combobox", { name: "Choose the Year" }).querySelectorAll("option")).map((option) => option.textContent)
    expect([years[0], years.at(-1)]).toEqual(["2030", "2050"])
    unmount()

    const { unmount: unmountMaxOnly } = render(<Harness calendar max="1850-06-30" />)
    fireEvent.click(screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate }))
    await screen.findByRole("dialog")
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("June 1850")
    const pastYears = Array.from(screen.getByRole("combobox", { name: "Choose the Year" }).querySelectorAll("option")).map((option) => option.textContent)
    expect([pastYears[0], pastYears.at(-1)]).toEqual(["1730", "1850"])
    unmountMaxOnly()

    const { unmount: unmountDisabled } = render(<Harness calendar disabled />)
    expect((screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate }) as HTMLButtonElement).disabled).toBe(true)
    unmountDisabled()
    render(<Harness calendar readOnly />)
    expect((screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("uses today's date when no today prop is given", async () => {
    render(<DateInput aria-label="Effective date" value="" onChange={() => {}} calendar />)
    fireEvent.click(screen.getByRole("button", { name: CONTROL_MESSAGES.chooseDate }))
    await screen.findByRole("dialog")
    const now = new Date()
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe(now.toLocaleString("en-US", { month: "long", year: "numeric" }))
  })
})
