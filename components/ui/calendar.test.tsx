import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { Calendar } from "./calendar"

const day = (label: RegExp) => screen.getByRole("button", { name: label })

describe("Calendar", () => {
  it("has month and year dropdowns bounded by start/end month, 44 px days, and disabled days outside the bounds", async () => {
    const onSelect = vi.fn()
    render(
      <Calendar
        mode="single"
        defaultMonth={new Date(2005, 9, 1)}
        startMonth={new Date(1906, 9, 14)}
        endMonth={new Date(2005, 9, 14)}
        disabled={[{ before: new Date(1906, 9, 14) }, { after: new Date(2005, 9, 14) }]}
        onSelect={onSelect}
      />,
    )
    const [month, year] = screen.getAllByRole("combobox")
    expect(month.getAttribute("aria-label")).toBe("Choose the Month")
    expect(year.getAttribute("aria-label")).toBe("Choose the Year")
    const years = Array.from((year as HTMLSelectElement).options).map((option) => option.textContent)
    expect(years[0]).toBe("1906")
    expect(years.at(-1)).toBe("2005")
    expect(month.className).toContain("h-11")

    const fourteenth = day(/October 14th, 2005/)
    expect(fourteenth.className).toContain("size-11")
    expect((day(/October 15th, 2005/) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(fourteenth)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect((onSelect.mock.calls[0][0] as Date).getDate()).toBe(14)
    // The next month is out of range.
    expect(screen.getByRole("button", { name: /next month/i }).getAttribute("aria-disabled")).toBe("true")
    expect(await axeViolations()).toEqual([])
  })

  it("moves through the grid with the arrow keys and changes month from the dropdown", () => {
    render(<Calendar mode="single" autoFocus defaultMonth={new Date(2024, 1, 1)} selected={new Date(2024, 1, 28)} today={new Date(2024, 1, 10)} />)
    const selected = day(/February 28th, 2024/)
    expect(document.activeElement).toBe(selected)
    act(() => {
      fireEvent.keyDown(selected, { key: "ArrowRight" })
    })
    expect(document.activeElement).toBe(day(/February 29th, 2024/))
    const [month] = screen.getAllByRole("combobox")
    fireEvent.change(month, { target: { value: "5" } })
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("June 2024")
  })
})
