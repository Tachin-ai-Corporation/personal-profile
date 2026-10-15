import { act, fireEvent, render, screen, within } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { RowActions, type RowAction } from "./row-actions"
import { RowEditStatus, RowRemoval, type RowEditState } from "./row-removal"
import { SectionTable, type SectionTableColumn } from "./section-table"

beforeEach(() => stubLayoutApis())

function actions(): { list: RowAction[]; verify: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; primary: ReturnType<typeof vi.fn> } {
  const verify = vi.fn()
  const remove = vi.fn()
  const primary = vi.fn()
  return {
    verify,
    remove,
    primary,
    list: [
      { id: "verify", label: "Verify", onSelect: verify, inline: true },
      { id: "primary", label: "Make primary", onSelect: primary, inline: true, disabledReason: "Verify this number first" },
      { id: "remove", label: "Remove", onSelect: remove, destructive: true },
      // A broken entry with no handler is never shown.
      { id: "ghost", label: "Ghost", onSelect: undefined as unknown as () => void },
    ],
  }
}

const openKebab = async (name = "More actions for +1 (415) 551-2125") => {
  fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" })
  return screen.findByRole("menu")
}

describe("RowActions (F6-2)", () => {
  it("shows inline actions (fading on row hover/focus-within, desktop only) and a named 44 px kebab", async () => {
    const { list, verify } = actions()
    render(
      <TooltipProvider>
        <RowActions actions={list} name="+1 (415) 551-2125" />
      </TooltipProvider>,
    )
    const inline = document.querySelector("[data-slot='row-actions-inline']") as HTMLElement
    for (const token of ["md:opacity-0", "md:group-hover/row:opacity-100", "md:group-focus-within/row:opacity-100", "duration-150", "motion-reduce:transition-none", "max-md:hidden"]) {
      expect(inline.className).toContain(token)
    }
    const kebab = screen.getByRole("button", { name: "More actions for +1 (415) 551-2125" })
    expect(kebab.className).toContain("h-11")
    expect(kebab.className).toContain("w-11")
    fireEvent.click(within(inline).getByRole("button", { name: "Verify" }))
    expect(verify).toHaveBeenCalledTimes(1)
    const makePrimary = within(inline).getByRole("button", { name: "Make primary" })
    expect(makePrimary.getAttribute("aria-disabled")).toBe("true")
    expect(await axeViolations()).toEqual([])
  })

  it("the kebab menu repeats every action with a handler; Remove is error-strong; a disabled item keeps its reason and does nothing", async () => {
    const { list, remove, primary } = actions()
    render(<RowActions actions={list} name="+1 (415) 551-2125" />)
    const menu = await openKebab()
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Verify", "Make primaryVerify this number first", "Remove"])
    const disabled = within(menu).getByRole("menuitem", { name: /Make primary/ })
    expect(disabled.getAttribute("aria-disabled")).toBe("true")
    expect(document.getElementById(disabled.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Verify this number first")
    fireEvent.click(disabled)
    expect(primary).not.toHaveBeenCalled()
    expect(screen.getByRole("menu")).toBeTruthy()
    expect(await axeViolations()).toEqual([])
    const removeItem = within(menu).getByRole("menuitem", { name: "Remove" })
    expect(removeItem.getAttribute("data-variant")).toBe("destructive")
    fireEvent.click(removeItem)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("showInline={false} keeps only the kebab, and kebabRef reaches it", () => {
    const ref = React.createRef<HTMLButtonElement>()
    render(<RowActions actions={actions().list} name="x" showInline={false} kebabRef={ref} />)
    expect(document.querySelector("[data-slot='row-actions-inline']")).toBeNull()
    expect(ref.current).toBe(screen.getByRole("button", { name: "More actions for x" }))
  })
})

describe("RowRemoval / RowEditStatus (F6-2)", () => {
  function Row({ initial = "saved" as RowEditState, disabledReason }: { readonly initial?: RowEditState; readonly disabledReason?: string }) {
    const [state, setState] = React.useState<RowEditState>(initial)
    const ref = React.useRef<HTMLButtonElement>(null)
    return (
      <TooltipProvider>
        <RowEditStatus state={state} />
        <RowRemoval ref={ref} state={state} disabledReason={disabledReason} onRemove={() => setState("removed")} onRestore={() => setState("saved")} />
        <button type="button" onClick={() => ref.current?.focus()}>
          Focus action
        </button>
      </TooltipProvider>
    )
  }

  it("Remove → 'Removed on save' + Restore (link-text, focusable by ref) → back to saved", async () => {
    render(<Row />)
    expect(document.querySelector("[data-slot='row-edit-status']")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(screen.getByText("Removed on save").className).toContain("inline-block")
    const restore = screen.getByRole("button", { name: "Restore" })
    expect(restore.className).toContain("text-link-text")
    fireEvent.click(screen.getByRole("button", { name: "Focus action" }))
    expect(document.activeElement).toBe(restore)
    expect(await axeViolations()).toEqual([])
    fireEvent.click(restore)
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy()
    expect(screen.queryByText("Removed on save")).toBeNull()
  })

  it("shows 'New · not saved' for a new row", () => {
    render(<Row initial="new" />)
    expect(screen.getByText("New · not saved")).toBeTruthy()
  })

  it("an unavailable Remove is aria-disabled with its reason and does nothing", () => {
    render(<Row disabledReason="You need at least one phone" />)
    const remove = screen.getByRole("button", { name: "Remove" })
    expect(remove.getAttribute("aria-disabled")).toBe("true")
    expect(remove.getAttribute("aria-describedby")).toBeTruthy()
    fireEvent.click(remove)
    expect(screen.queryByText("Removed on save")).toBeNull()
  })
})

interface Phone {
  readonly id: number
  readonly number: string
  readonly label: string
  readonly status: string
}

const PHONES: Phone[] = [
  { id: 1, number: "+1 (415) 551-2125", label: "Primary", status: "Verified" },
  { id: 2, number: "+1 (415) 555-0100", label: "Work", status: "Not verified" },
]

const COLUMNS: SectionTableColumn<Phone>[] = [
  { key: "number", header: "Number", cell: (row) => row.number, className: "font-semibold", mobileLine: 1 },
  { key: "label", header: "Label", cell: (row) => row.label },
  { key: "status", header: "Status", cell: (row) => row.status, mobileLine: 1 },
  { key: "hidden", header: "Notes", cell: () => "secret", mobileLine: "none" },
]

function Table({ rows = PHONES, editing, states }: { readonly rows?: Phone[]; readonly editing?: boolean; readonly states?: Record<number, RowEditState> }) {
  const onAdd = vi.fn()
  return (
    <TooltipProvider>
      <h2 id="phone-heading">Phone</h2>
      <SectionTable<Phone>
        rows={rows}
        columns={COLUMNS}
        getRowKey={(row) => String(row.id)}
        getRowId={(row) => `phone-${row.id}`}
        labelledBy="phone-heading"
        editing={editing}
        rowState={states ? (row) => states[row.id] ?? "saved" : undefined}
        empty={{ message: "No phones yet", action: { label: "Add phone", onClick: onAdd } }}
        actions={(row, layout) => (
          <RowActions actions={[{ id: "remove", label: "Remove", onSelect: vi.fn(), destructive: true }]} name={row.number} showInline={layout === "table"} />
        )}
      />
    </TooltipProvider>
  )
}

describe("SectionTable (F6-2)", () => {
  it("desktop: a real table named by the heading, column headers, hidden Actions header, hairline rows with hover fill", async () => {
    stubViewport(1280)
    render(<Table />)
    const table = screen.getByRole("table", { name: "Phone" })
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Number", "Label", "Status", "Notes", "Actions"])
    const header = within(table).getAllByRole("columnheader")[0]
    for (const token of ["bg-muted", "h-9", "uppercase", "tracking-[0.06em]", "text-caption"]) expect(header.className).toContain(token)
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)
    for (const token of ["group/row", "border-b", "last:border-b-0", "hover:bg-accent", "focus-within:bg-accent"]) expect(rows[0].className).toContain(token)
    expect(rows[0].id).toBe("phone-1")
    expect(within(rows[0]).getAllByRole("cell")[0].className).toContain("h-11")
    expect(screen.getByRole("button", { name: "More actions for +1 (415) 555-0100" })).toBeTruthy()
    expect(await axeViolations()).toEqual([])
  })

  it("desktop edit view: no hover fill, top-aligned cells, new and removed row styles (status and actions not struck)", () => {
    stubViewport(1280)
    render(<Table editing states={{ 1: "removed", 2: "new" }} />)
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows[0].className).not.toContain("hover:bg-accent")
    expect(rows[0].getAttribute("data-state")).toBe("removed")
    expect(rows[0].className).toContain("line-through")
    expect(rows[0].className).toContain("[&>td:not([data-slot=row-actions-cell])]:line-through")
    expect(rows[1].className).toContain("bg-background")
    expect(within(rows[0]).getAllByRole("cell")[0].className).toContain("align-top")
  })

  it("empty: one row spanning every column with the action", async () => {
    stubViewport(1280)
    render(<Table rows={[]} />)
    const cell = screen.getAllByRole("cell")
    expect(cell).toHaveLength(1)
    expect(cell[0].getAttribute("colspan")).toBe("5")
    expect(screen.getByRole("button", { name: "Add phone" })).toBeTruthy()
    expect(await axeViolations()).toEqual([])
  })

  it("below 768 px: stacked cards in a list, line 1 / line 2, column names for screen readers, kebab only", async () => {
    stubViewport(360)
    render(<Table states={{ 1: "removed", 2: "new" }} />)
    expect(screen.queryByRole("table")).toBeNull()
    const list = screen.getByRole("list", { name: "Phone" })
    const cards = within(list).getAllByRole("listitem")
    expect(cards).toHaveLength(2)
    expect(cards[0].textContent).toContain("Number: +1 (415) 551-2125")
    expect(cards[0].textContent).toContain("Label: Primary")
    expect(cards[0].textContent).not.toContain("secret")
    expect(cards[0].getAttribute("data-state")).toBe("removed")
    expect(cards[0].className).toContain("text-muted-foreground")
    expect(cards[1].className).toContain("bg-background")
    expect(document.querySelector("[data-slot='row-actions-inline']")).toBeNull()
    expect(within(cards[1]).getByRole("button", { name: "More actions for +1 (415) 555-0100" })).toBeTruthy()
    expect(await axeViolations()).toEqual([])
  })

  it("below 768 px with no rows: the empty line as the only card; follows a resize to desktop", () => {
    const resize = stubViewport(360)
    render(<Table rows={[]} />)
    expect(screen.getByRole("listitem").textContent).toBe("No phones yet·Add phone")
    act(() => resize(1024))
    expect(screen.getByRole("table")).toBeTruthy()
  })

  it("renders without actions, row states or empty state", () => {
    stubViewport(1280)
    render(<SectionTable<Phone> rows={[]} columns={COLUMNS} getRowKey={(row) => String(row.id)} />)
    expect(screen.getAllByRole("columnheader")).toHaveLength(4)
    expect(screen.queryAllByRole("cell")).toHaveLength(0)
  })

  it("mobile without actions or empty state", () => {
    stubViewport(360)
    render(<SectionTable<Phone> rows={PHONES} columns={COLUMNS} getRowKey={(row) => String(row.id)} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(document.querySelector("[data-slot='row-actions-cell']")).toBeNull()
  })
})
