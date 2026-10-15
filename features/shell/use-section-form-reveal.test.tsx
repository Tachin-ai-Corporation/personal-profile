import { act, fireEvent, render, screen } from "@testing-library/react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CONTACT_MESSAGES } from "@/lib/shared/messages"
import { setTelemetrySink } from "@/lib/shared/telemetry"
import { stubViewport } from "@/test/media"
import { FixtureSection, type FixtureSectionProps } from "./__fixtures__/fixture-section"
import type { SaveResult } from "./nav-types"
import { SectionFooter } from "./section-footer"
import { SectionHeader } from "./section-header"
import { SectionRegistryProvider, useSectionRegistry, type SectionRegistry } from "./section-registry"
import { toastError } from "./toasts"
import { useSectionForm } from "./use-section-form"

vi.mock("./toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))

/**
 * F6-1 additions to `useSectionForm`: the `CANCELLED` save outcome (Story
 * 2.4), `startEdit({ focus })` and `revealField` for collapsed rows (Story 4.2).
 */

const OK: SaveResult = { ok: true }
const CANCELLED: SaveResult = { ok: false, error: { code: "CANCELLED" } }

let events: [string, unknown][] = []
let restoreSink = () => undefined as void
beforeEach(() => {
  stubViewport(1280)
  events = []
  restoreSink = setTelemetrySink((event, payload) => void events.push([event, payload]))
})
afterEach(() => restoreSink())

const button = (name: string | RegExp) => screen.getByRole("button", { name })
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } })
const edit = () => act(async () => fireEvent.click(button("Edit")))
const save = () => act(async () => fireEvent.click(button("Save")))

function Capture({ onRegistry }: { readonly onRegistry: (registry: SectionRegistry) => void }) {
  const current = useSectionRegistry()
  useEffect(() => onRegistry(current), [current, onRegistry])
  return null
}

describe("CANCELLED (Story 2.4)", () => {
  function setup(props: FixtureSectionProps) {
    let registry: SectionRegistry | undefined
    render(
      <SectionRegistryProvider>
        <Capture onRegistry={(next) => void (registry = next)} />
        <FixtureSection {...props} />
      </SectionRegistryProvider>,
    )
    return () => registry
  }
  const number = () => screen.getByRole("textbox", { name: "Number" }) as HTMLInputElement

  it("own Save: stays in edit with the edits, no error, no toast, focus kept, no telemetry", async () => {
    setup({ save: async () => CANCELLED })
    await edit()
    type(number(), "4155550000")
    const saveButton = button("Save")
    saveButton.focus()
    await save()
    expect(screen.getByText("Editing")).toBeTruthy()
    expect(number().value).toBe("4155550000")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(document.querySelector("[data-slot~='inline-banner']")).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
    expect(events).toEqual([])
    expect(document.activeElement).toBe(saveButton)
  })

  it("registered save hands CANCELLED to the runner (Save all counts it as not saved)", async () => {
    const registry = setup({ save: async () => CANCELLED })
    await edit()
    type(number(), "4155550000")
    const [section] = registry()?.getAll() ?? []
    let result: SaveResult | undefined
    await act(async () => {
      result = await section.save()
    })
    expect(result).toEqual(CANCELLED)
    expect(screen.getByText("Editing")).toBeTruthy()
  })
})

const rowsSchema = z
  .object({ links: z.array(z.object({ url: z.string().min(1, { message: CONTACT_MESSAGES.phoneTenDigits }) })) })
  .refine(
    (value) => {
      const urls = value.links.map((link) => link.url).filter(Boolean)
      return new Set(urls).size === urls.length
    },
    { message: CONTACT_MESSAGES.duplicateSocial },
  )
type RowsValues = z.infer<typeof rowsSchema>

interface RowsProps {
  readonly save: (values: RowsValues) => Promise<SaveResult>
  readonly baseline?: RowsValues
  /** Whether `revealField` can expand a row. */
  readonly reveal?: boolean
  /** The rows `revealField` may expand; default all. */
  readonly revealRows?: readonly number[]
  /** `revealField` answers `true` but mounts nothing (a broken reveal). */
  readonly fakeReveal?: boolean
}

/** Rows after the first start collapsed (their inputs unmounted), like Story 4.2's address rows. */
function RowsSection({ save, baseline = { links: [{ url: "a" }, { url: "b" }] }, reveal = true, revealRows, fakeReveal = false }: RowsProps) {
  const [open, setOpen] = useState<readonly boolean[]>(() => baseline.links.map((_, i) => i === 0))
  const section = useSectionForm<RowsValues>({
    id: "addresses",
    label: "Addresses",
    displayOrder: 5,
    schema: rowsSchema,
    baseline,
    save,
    fieldOrder: ["links.0.url"],
    errorFields: { value: "links.1.url" },
    revealField: (path) => {
      const index = /^links\.(\d+)\./.exec(path)?.[1]
      if (!reveal || index === undefined || (revealRows && !revealRows.includes(Number(index)))) return false
      if (fakeReveal) return true
      setOpen((rows) => rows.map((value, i) => value || i === Number(index)))
      return true
    },
  })
  return (
    <section aria-labelledby="addresses-heading">
      <SectionHeader id="addresses" title="Addresses" editing={section.isEditing} />
      {section.isEditing ? (
        <>
          {open.map((isOpen, index) =>
            isOpen ? (
              <input key={index} aria-label={`Row ${index + 1}`} {...section.field(`links.${index}.url`)} />
            ) : (
              <p key={index}>collapsed {index + 1}</p>
            ),
          )}
          <SectionFooter {...section.footerProps} />
        </>
      ) : (
        <>
          <button type="button" {...section.editButtonProps}>
            Edit
          </button>
          <button type="button" onClick={() => section.startEdit({ focus: "links.1.url" })}>
            Edit row 2
          </button>
        </>
      )}
    </section>
  )
}

function renderRows(props: RowsProps) {
  let registry: SectionRegistry | undefined
  render(
    <SectionRegistryProvider>
      <Capture onRegistry={(next) => void (registry = next)} />
      <RowsSection {...props} />
    </SectionRegistryProvider>,
  )
  return () => registry
}

const row = (n: number) => screen.getByRole("textbox", { name: `Row ${n}` }) as HTMLInputElement

describe("startEdit({ focus }) and revealField (Story 4.2)", () => {
  it("Edit without options focuses the first field; the collapsed row stays collapsed", async () => {
    renderRows({ save: async () => OK })
    await edit()
    expect(document.activeElement).toBe(row(1))
    expect(screen.getByText("collapsed 2")).toBeTruthy()
  })

  it("startEdit({ focus }) reveals a collapsed row and focuses its field", async () => {
    renderRows({ save: async () => OK })
    await act(async () => fireEvent.click(button("Edit row 2")))
    expect(document.activeElement).toBe(row(2))
  })

  it("startEdit({ focus }) on a field nothing can reveal falls back to react-hook-form's focus (no throw)", async () => {
    renderRows({ save: async () => OK, reveal: false })
    await act(async () => fireEvent.click(button("Edit row 2")))
    expect(screen.getByText("collapsed 2")).toBeTruthy()
  })

  it("own Save: the invalid field in a collapsed row is revealed, then focused; nothing sent, no Section error", async () => {
    const saveFn = vi.fn(async () => OK)
    renderRows({ save: saveFn, baseline: { links: [{ url: "a" }, { url: "" }] } })
    await edit()
    type(row(1), "a2")
    await save()
    expect(saveFn).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(row(2))
    expect(document.querySelector("[data-slot~='inline-banner']")).toBeNull()
  })

  it("registered validate (Save all, leave guard): focusFirstInvalid reveals then focuses", async () => {
    const registry = renderRows({ save: async () => OK, baseline: { links: [{ url: "a" }, { url: "" }] } })
    await edit()
    type(row(1), "a2")
    const [section] = registry()?.getAll() ?? []
    let result: Awaited<ReturnType<typeof section.validate>> | undefined
    await act(async () => {
      result = await section.validate()
    })
    expect(result).toMatchObject({ valid: false, invalidCount: 1 })
    act(() => (result && !result.valid ? result.focusFirstInvalid() : undefined))
    expect(document.activeElement).toBe(row(2))
  })

  it("a visible invalid field before a hidden one: both are errors, focus goes to the first in page order", async () => {
    const saveFn = vi.fn(async () => OK)
    renderRows({ save: saveFn, baseline: { links: [{ url: "a" }, { url: "" }] } })
    await edit()
    type(row(1), "")
    await save()
    expect(document.activeElement).toBe(row(1))
  })

  it("without a reveal, the hidden error is the Section error (focused)", async () => {
    const saveFn = vi.fn(async () => OK)
    renderRows({ save: saveFn, baseline: { links: [{ url: "a" }, { url: "" }] }, reveal: false })
    await edit()
    type(row(1), "a2")
    await save()
    expect(saveFn).not.toHaveBeenCalled()
    expect(document.activeElement?.closest("[data-slot~='inline-banner']")).toBeTruthy()
  })

  it("one hidden error revealable, another not: the Section error names the second, the revealed field gets focus", async () => {
    const saveFn = vi.fn(async () => OK)
    renderRows({ save: saveFn, baseline: { links: [{ url: "a" }, { url: "" }, { url: "" }] }, revealRows: [1] })
    await edit()
    type(row(1), "a2")
    await save()
    expect(saveFn).not.toHaveBeenCalled()
    expect(screen.getByText(CONTACT_MESSAGES.phoneTenDigits)).toBeTruthy()
    expect(screen.getByText("collapsed 3")).toBeTruthy()
    expect(document.activeElement).toBe(row(2))
  })

  it("a reveal that mounts nothing: the second pass shows the Section error and focuses it (F6-1 review L1)", async () => {
    const saveFn = vi.fn(async () => OK)
    renderRows({ save: saveFn, baseline: { links: [{ url: "a" }, { url: "" }] }, fakeReveal: true })
    await edit()
    type(row(1), "a2")
    await save()
    expect(saveFn).not.toHaveBeenCalled()
    expect(screen.getByText(CONTACT_MESSAGES.phoneTenDigits)).toBeTruthy()
    expect(document.activeElement?.closest("[data-slot~='inline-banner']")).toBeTruthy()
  })

  it("a server field error on a collapsed row reveals and focuses it", async () => {
    renderRows({
      save: async () => ({ ok: false, error: { code: "FIELD", mapped: { kind: "field", field: "value", messageKey: "contacts.duplicateSocial" } } }),
    })
    await edit()
    type(row(1), "c")
    await save()
    expect(document.activeElement).toBe(row(2))
  })
})
