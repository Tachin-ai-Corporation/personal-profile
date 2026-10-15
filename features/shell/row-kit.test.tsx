import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
    // Hidden until hover/focus only with a fine pointer: on touch from 768 px they stay visible (never invisible but tappable).
    for (const token of ["md:pointer-fine:opacity-0", "md:pointer-fine:group-hover/row:opacity-100", "md:pointer-fine:group-focus-within/row:opacity-100", "duration-150", "motion-reduce:transition-none", "max-md:hidden"]) {
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
    // The action runs once the menu has closed and focus is back on the kebab.
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More actions for +1 (415) 551-2125" }))
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
    const statusId = React.useId()
    const [state, setState] = React.useState<RowEditState>(initial)
    const ref = React.useRef<HTMLButtonElement>(null)
    return (
      <TooltipProvider>
        <RowEditStatus id={statusId} state={state} />
        <RowRemoval ref={ref} statusId={statusId} state={state} disabledReason={disabledReason} onRemove={() => setState("removed")} onRestore={() => setState("saved")} />
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

  it("desktop: fixed layout with column widths and wrapping cells; cells get their header id", () => {
    stubViewport(1280)
    const cell = vi.fn((row: Phone, context: { headerId: string; layout: string }) => `${row.number} (${context.layout})`)
    render(
      <SectionTable<Phone>
        rows={PHONES}
        columns={[{ key: "number", header: "Number", cell, width: "w-[40%]" }]}
        getRowKey={(row) => String(row.id)}
        actions={() => <button type="button">Act</button>}
        actionsWidth="w-24"
      />,
    )
    const table = screen.getByRole("table")
    expect(table.className).toContain("table-fixed")
    expect([...table.querySelectorAll("col")].map((col) => col.className)).toEqual(["w-[40%]", "w-24"])
    expect(screen.getAllByRole("cell")[0].className).toContain("[overflow-wrap:anywhere]")
    const headerId = cell.mock.calls[0][1].headerId
    expect(document.getElementById(headerId)?.textContent).toBe("Number")
    expect(cell.mock.calls[0][1].layout).toBe("table")
  })

  it("desktop edit view defaults the actions column narrower", () => {
    stubViewport(1280)
    render(<Table editing />)
    expect([...screen.getByRole("table").querySelectorAll("col")].at(-1)?.className).toBe("w-32")
  })

  it("an expanded row is one full-width cell on desktop and the card body on mobile", () => {
    const resize = stubViewport(1280)
    render(
      <SectionTable<Phone>
        rows={PHONES}
        columns={COLUMNS}
        getRowKey={(row) => String(row.id)}
        editing
        renderExpanded={(row) => (row.id === 2 ? <div data-testid="expanded">Address grid {row.number}</div> : null)}
        actions={(row) => <button type="button">Remove {row.id}</button>}
      />,
    )
    const expandedCell = screen.getByTestId("expanded").closest("td")
    expect(expandedCell?.getAttribute("colspan")).toBe("5")
    expect(expandedCell?.closest("tr")?.getAttribute("data-expanded")).toBe("true")
    expect(screen.queryByRole("button", { name: "Remove 2" })).toBeNull()
    expect(screen.getByRole("button", { name: "Remove 1" })).toBeTruthy()
    act(() => resize(360))
    const cards = screen.getAllByRole("listitem")
    expect(within(cards[1]).getByTestId("expanded")).toBeTruthy()
    expect(within(cards[1]).getByRole("button", { name: "Remove 2" })).toBeTruthy()
  })

  it("mobile edit view: one full-width block per column under its visible header, named by it", async () => {
    stubViewport(360)
    render(
      <TooltipProvider>
        <h2 id="edit-heading">Phone</h2>
        <SectionTable<Phone>
          rows={PHONES}
          labelledBy="edit-heading"
          columns={[
            { key: "number", header: "Number", cell: (row) => row.number },
            { key: "label", header: "Label", cell: (row, { headerId }) => <input aria-labelledby={headerId} defaultValue={row.label} /> },
          ]}
          getRowKey={(row) => String(row.id)}
          editing
          rowState={(row) => (row.id === 2 ? "removed" : "saved")}
          actions={(row) => <RowRemoval state={row.id === 2 ? "removed" : "saved"} onRemove={vi.fn()} onRestore={vi.fn()} />}
        />
      </TooltipProvider>,
    )
    const cards = screen.getAllByRole("listitem")
    expect(within(cards[0]).getByText("Number")).toBeTruthy()
    expect(within(cards[0]).getByRole("textbox", { name: "Label" })).toBeTruthy()
    expect(cards[0].className).toContain("items-start")
    expect(within(cards[1]).getByText("+1 (415) 555-0100").className).toContain("line-through")
    expect(await axeViolations()).toEqual([])
  })
})

describe("RowActions: focus and empty lists (F6-2 review)", () => {
  function WithConfirm() {
    const [open, setOpen] = React.useState(false)
    return (
      <>
        <RowActions name="+1 (415) 551-2125" actions={[{ id: "primary", label: "Make primary", onSelect: () => setOpen(true) }]} />
        <ConfirmDialog
          open={open}
          title="This changes how you sign in"
          body="Body"
          confirmLabel="Make primary"
          variant="standard"
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </>
    )
  }

  it.each([false, true])("a dialog opened from a menu item returns focus to the kebab (reduced motion: %s)", async (reduced) => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduced && query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    render(<WithConfirm />)
    const kebab = screen.getByRole("button", { name: "More actions for +1 (415) 551-2125" })
    kebab.focus()
    const menu = await openKebab()
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Make primary" }))
    const dialog = await screen.findByRole("alertdialog", { name: "This changes how you sign in" })
    fireEvent.keyDown(dialog, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(kebab))
    vi.unstubAllGlobals()
  })

  it("renders nothing (no kebab, no empty menu) without a usable action", () => {
    const { container } = render(<RowActions name="x" actions={[{ id: "ghost", label: "Ghost", onSelect: undefined as unknown as () => void }]} />)
    expect(container.innerHTML).toBe("")
  })
})

describe("RowRemoval: focus across the swap and Restore's description (F6-2 review)", () => {
  it("keeps focus when Remove becomes Restore and back; Restore is described by 'Removed on save'", () => {
    function Row() {
      const [state, setState] = React.useState<RowEditState>("saved")
      return (
        <>
          <RowEditStatus id="status-1" state={state} />
          <RowRemoval statusId="status-1" state={state} onRemove={() => setState("removed")} onRestore={() => setState("saved")} />
        </>
      )
    }
    render(<Row />)
    const remove = screen.getByRole("button", { name: "Remove" })
    remove.focus()
    fireEvent.click(remove)
    const restore = screen.getByRole("button", { name: "Restore" })
    expect(document.activeElement).toBe(restore)
    expect(restore.getAttribute("aria-describedby")).toBe("status-1")
    expect(document.getElementById("status-1")?.textContent).toBe("Removed on save")
    fireEvent.click(restore)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove" }))
  })

  it("doesn't take focus when the press came from elsewhere (pointer without focus)", () => {
    function Row() {
      const [state, setState] = React.useState<RowEditState>("saved")
      return <RowRemoval state={state} onRemove={() => setState("removed")} onRestore={() => setState("saved")} />
    }
    render(<Row />)
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(document.activeElement).toBe(document.body)
  })
})
