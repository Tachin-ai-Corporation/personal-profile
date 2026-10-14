import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { Input } from "@/components/ui/input"
import { axeViolations } from "@/test/axe"
import { stubViewport } from "@/test/media"
import { KeyValueEditTable, KeyValueTable, type KeyValueEditRow, type KeyValueRow } from "./key-value-table"

const READ_ROWS: KeyValueRow[] = [
  { key: "first", label: "First name", value: "Ann" },
  { key: "last", label: "Last name", value: "Lee" },
  { key: "middle", label: "Middle name", value: "" },
  { key: "birth", label: "Birth date", value: null },
  { key: "signature", label: "Signature", value: <span>thumb</span>, rowId: "signature" },
]

const EDIT_ROWS: KeyValueEditRow[] = [
  { key: "first", label: "First name", required: true, render: (control) => <Input {...control} defaultValue="Ann" /> },
  {
    key: "middle",
    label: "Middle name",
    optional: true,
    help: "As on your ID.",
    error: "Enter a valid name",
    labelAddon: <span data-testid="addon" />,
    render: (control) => <Input {...control} defaultValue="" />,
  },
  { key: "birth", label: "Birth date", controlId: "birth-date", rowId: "birth", render: (control) => <Input {...control} /> },
]

function Tables({ edit = false }: { edit?: boolean }) {
  return (
    <section aria-labelledby="h">
      <h2 id="h">Personal information</h2>
      {edit ? <KeyValueEditTable rows={EDIT_ROWS} labelledBy="h" /> : <KeyValueTable rows={READ_ROWS} labelledBy="h" />}
    </section>
  )
}

const cellsOf = (row: HTMLElement) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent)

describe("KeyValueTable (read)", () => {
  beforeEach(() => stubViewport(1280))

  it("desktop: four columns filled row by row, th scope=row keys, hairline between pairs, Not provided for empty", () => {
    render(<Tables />)
    const table = screen.getByRole("table", { name: "Personal information" })
    const rows = within(table).getAllByRole("row")
    expect(rows.map(cellsOf)).toEqual([
      ["First name", "Ann", "Last name", "Lee"],
      ["Middle name", "Not provided", "Birth date", "Not provided"],
      ["Signature", "thumb", ""],
    ])
    for (const header of within(table).getAllByRole("rowheader")) expect(header.getAttribute("scope")).toBe("row")
    expect(within(rows[0]).getByRole("rowheader", { name: "Last name" }).className).toContain("border-l")
    expect(table.querySelectorAll("col")).toHaveLength(4)
    expect(document.getElementById("signature")?.textContent).toBe("Signature")
  })

  it("desktop: each value cell names exactly its own key (headers ↔ id), the right-hand pair included", () => {
    render(<Tables />)
    const [first] = screen.getAllByRole("row")
    const [leftKey, leftValue, rightKey, rightValue] = [...first.querySelectorAll("th, td")]
    expect(leftValue.getAttribute("headers")).toBe(leftKey.id)
    expect(rightValue.getAttribute("headers")).toBe(rightKey.id)
    expect(rightKey.id).not.toBe(leftKey.id)
    expect(rightValue.getAttribute("headers")?.split(" ")).toHaveLength(1)
    // A row anchor doubles as the key id.
    const signature = document.getElementById("signature") as HTMLElement
    expect(signature.nextElementSibling?.getAttribute("headers")).toBe("signature")
  })

  it("mobile: one Field | Value pair per row", () => {
    stubViewport(360)
    render(<Tables />)
    const rows = screen.getAllByRole("row")
    expect(rows.map(cellsOf)).toEqual([
      ["First name", "Ann"],
      ["Last name", "Lee"],
      ["Middle name", "Not provided"],
      ["Birth date", "Not provided"],
      ["Signature", "thumb"],
    ])
    expect(screen.getByRole("table").querySelectorAll("col")).toHaveLength(2)
  })

  it.each([1280, 360])("has no axe violations at %i px", async (width) => {
    stubViewport(width)
    render(<Tables />)
    expect(await axeViolations()).toEqual([])
  })
})

describe("KeyValueEditTable (edit)", () => {
  it("desktop: Field | Value with a 240 px key column, 480 px controls, label/help/error wiring", () => {
    stubViewport(1280)
    render(<Tables edit />)
    const table = screen.getByRole("table", { name: "Personal information" })
    expect(within(table).getAllByRole("rowheader")[0].className).toContain("w-60")
    const first = screen.getByRole("textbox", { name: "First name" })
    expect(first.getAttribute("aria-required")).toBe("true")
    // No <form>: no native required (no browser validation bubble), only aria-required.
    expect(first.hasAttribute("required")).toBe(false)
    expect(first.getAttribute("aria-describedby")).toBeNull()
    expect(first.closest("div")?.className).toContain("max-w-[480px]")

    const middle = screen.getByRole("textbox", { name: "Middle name (optional)" })
    expect(middle.getAttribute("aria-invalid")).toBe("true")
    const describedBy = middle.getAttribute("aria-describedby")?.split(" ") ?? []
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual(["As on your ID.", "Enter a valid name"])
    expect(screen.getByTestId("addon")).toBeTruthy()

    expect(screen.getByRole("textbox", { name: "Birth date" }).id).toBe("birth-date")
    expect(document.getElementById("birth")?.tagName).toBe("TH")
  })

  it("mobile: each label above a full-width control, no table", () => {
    stubViewport(360)
    render(<Tables edit />)
    expect(screen.queryByRole("table")).toBeNull()
    const group = screen.getByRole("group", { name: "Personal information" })
    const first = within(group).getByRole("textbox", { name: "First name" })
    expect(first.getAttribute("aria-required")).toBe("true")
    expect(first.hasAttribute("required")).toBe(false)
    const middle = within(group).getByRole("textbox", { name: "Middle name (optional)" })
    expect(middle.getAttribute("aria-invalid")).toBe("true")
    const describedBy = middle.getAttribute("aria-describedby")?.split(" ") ?? []
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual(["As on your ID.", "Enter a valid name"])
    expect(document.getElementById("birth")?.tagName).toBe("DIV")
  })

  it.each([1280, 360])("has no axe violations at %i px", async (width) => {
    stubViewport(width)
    render(<Tables edit />)
    expect(await axeViolations()).toEqual([])
  })
})
