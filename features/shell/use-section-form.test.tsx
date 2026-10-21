import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setTelemetrySink, type TelemetryEvents } from "@/lib/shared/telemetry"
import { axeViolations } from "@/test/axe"
import { stubViewport } from "@/test/media"
import { FIXTURE_BASELINE, fixtureDraftDiff, FixtureSection, type FixtureSectionProps } from "./__fixtures__/fixture-section"
import { fixtureSectionSchema, type FixtureSectionValues } from "./__fixtures__/schema"
import { z } from "zod"
import { CONTACT_MESSAGES, PERSON_MESSAGES } from "@/lib/shared/messages"
import type { DraftValues, SaveResult } from "./nav-types"
import { SectionFooter } from "./section-footer"
import { SectionHeader } from "./section-header"
import { useSectionForm, type SectionForm, type UseSectionFormOptions } from "./use-section-form"
import { runSaveSteps } from "./run-save-steps"
import { runSaveAll } from "./save-all"
import { createSectionRegistry, type SectionRegistry } from "./section-registry"
import { SectionRegistryProvider, useSectionRegistry } from "./section-registry"
import { toastError, toastSuccess } from "./toasts"

const dismissErrorToast = vi.fn()
vi.mock("./toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: dismissErrorToast })), toastPartial: vi.fn() }))

const OK: SaveResult = { ok: true }
const NETWORK: SaveResult = { ok: false, error: { code: "NETWORK_ERROR", mapped: { kind: "network" } } }
const SESSION: SaveResult = { ok: false, error: { code: "SESSION_EXPIRED", mapped: { kind: "session" } } }

let registry: SectionRegistry | undefined

/** Hands the page registry to the test (after render). */
function Capture({ onRegistry }: { readonly onRegistry: (registry: SectionRegistry) => void }) {
  const current = useSectionRegistry()
  useEffect(() => onRegistry(current), [current, onRegistry])
  return null
}

function setup(props: FixtureSectionProps = {}) {
  let captured: SectionRegistry | undefined
  const onRegistry = (next: SectionRegistry) => {
    captured = next
  }
  const view = render(
    <SectionRegistryProvider>
      <Capture onRegistry={onRegistry} />
      <FixtureSection {...props} />
    </SectionRegistryProvider>,
  )
  const rerender = (next: FixtureSectionProps) =>
    view.rerender(
      <SectionRegistryProvider>
        <Capture onRegistry={onRegistry} />
        <FixtureSection {...next} />
      </SectionRegistryProvider>,
    )
  registry = captured
  return { ...view, rerender }
}

const heading = () => screen.getByRole("heading", { level: 2, name: "Phone" })
const number = () => screen.getByRole("textbox", { name: "Number" }) as HTMLInputElement
const note = () => screen.getByRole("textbox", { name: /Note/ }) as HTMLInputElement
const button = (name: string | RegExp) => screen.getByRole("button", { name })
const container = () => screen.getByTestId("fixture-section").querySelector("[data-slot='section-container']") as HTMLElement
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } })
const flush = () => act(async () => undefined)

async function edit(): Promise<void> {
  await act(async () => fireEvent.click(button("Edit")))
}
async function save(): Promise<void> {
  await act(async () => fireEvent.click(button("Save")))
}

let events: [string, unknown][] = []
let restoreSink = () => undefined as void
beforeEach(() => {
  stubViewport(1280)
  events = []
  restoreSink = setTelemetrySink((event, payload) => void events.push([event, payload]))
})
afterEach(() => {
  restoreSink()
  registry = undefined
})

describe("useSectionForm via the fixture Section: read and edit views", () => {
  it("reads by default: h2 (tabIndex -1), count, outline Edit, key/value values with Not provided", () => {
    setup()
    expect(heading().id).toBe("phone-heading")
    expect(heading().getAttribute("tabindex")).toBe("-1")
    expect(screen.getByText("1").getAttribute("data-slot")).toBe("section-meta")
    expect(screen.getByRole("rowheader", { name: "Number" })).toBeTruthy()
    expect(screen.getByRole("cell", { name: "4155512125" })).toBeTruthy()
    expect(screen.getByRole("cell", { name: "Not provided" })).toBeTruthy()
    expect(container().getAttribute("data-editing")).toBeNull()
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  })

  it("Edit: editing border + halo, header 'Editing' in place of the count, focus on the first input", async () => {
    setup()
    await edit()
    expect(container().getAttribute("data-editing")).toBe("true")
    expect(container().className).toContain("border-primary")
    expect(container().className).toContain("ring-[3px]")
    expect(screen.getByText("Editing")).toBeTruthy()
    expect(screen.queryByText("1")).toBeNull()
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
    expect(document.activeElement).toBe(number())
  })

  it("dirty = deep inequality: 'Unsaved changes' on the first change, gone after reverting; counted by the registry", async () => {
    setup()
    await edit()
    expect(screen.queryByText("Unsaved changes")).toBeNull()
    expect(registry?.getDirtyCount()).toBe(0)
    type(number(), "4155550000")
    expect(screen.getByText("Unsaved changes").closest("[aria-live='polite']")).toBeTruthy()
    expect(registry?.getDirtyCount()).toBe(1)
    type(number(), FIXTURE_BASELINE.number)
    expect(screen.queryByText("Unsaved changes")).toBeNull()
    expect(registry?.isAnyDirty()).toBe(false)
  })

  it("Cancel reverts only this Section with no confirm, clears errors and focuses the h2", async () => {
    setup()
    await edit()
    type(number(), "12")
    fireEvent.blur(number())
    await waitFor(() => expect(number().getAttribute("aria-invalid")).toBe("true"))
    await act(async () => fireEvent.click(button("Cancel")))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(screen.getByRole("cell", { name: "4155512125" })).toBeTruthy()
    expect(document.activeElement).toBe(heading())
    await edit()
    expect(number().value).toBe(FIXTURE_BASELINE.number)
    expect(number().getAttribute("aria-invalid")).toBeNull()
  })

  it("cancelFocus 'edit' returns focus to the Edit button", async () => {
    setup({ cancelFocus: "edit" })
    await edit()
    await act(async () => fireEvent.click(button("Cancel")))
    expect(document.activeElement).toBe(button("Edit"))
  })

  it("Enter in an input never submits; Escape never cancels", async () => {
    const saveFn = vi.fn(async () => OK)
    setup({ save: saveFn })
    await edit()
    type(number(), "4155550000")
    fireEvent.keyDown(number(), { key: "Enter" })
    fireEvent.keyDown(number(), { key: "Escape" })
    await flush()
    expect(saveFn).not.toHaveBeenCalled()
    expect(number().value).toBe("4155550000")
    expect(screen.getByText("Unsaved changes")).toBeTruthy()
  })
})

describe("validation", () => {
  it("on blur: 2 px error state via aria-invalid and an error line linked by aria-describedby", async () => {
    setup()
    await edit()
    type(number(), "")
    fireEvent.blur(number())
    await waitFor(() => expect(number().getAttribute("aria-invalid")).toBe("true"))
    const error = screen.getByText("Enter a 10-digit US number")
    const line = error.closest("[data-slot='field-error']") as HTMLElement
    expect(number().getAttribute("aria-describedby")).toContain(line.id)
  })

  it("Save with an invalid field sends nothing and focuses the first invalid field", async () => {
    const saveFn = vi.fn(async () => OK)
    setup({ save: saveFn })
    await edit()
    type(number(), "12")
    note().focus()
    await save()
    expect(saveFn).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(number())
    expect(number().getAttribute("aria-invalid")).toBe("true")
    expect(events).toEqual([])
    // Fixed after the failed Save: revalidates on change.
    type(number(), "4155550000")
    await waitFor(() => expect(number().getAttribute("aria-invalid")).toBeNull())
  })
})

describe("saving", () => {
  it("busy Save 'Saving…', inputs readOnly (never disabled), Cancel inert, one send on double click; then read view, h2 focus, toast, telemetry", async () => {
    let finish: (result: SaveResult) => void = () => undefined
    const saveFn = vi.fn<(values: FixtureSectionValues, baseline: FixtureSectionValues) => Promise<SaveResult>>(
      () => new Promise<SaveResult>((resolve) => (finish = resolve)),
    )
    setup({ save: saveFn })
    await edit()
    type(number(), "4155550000")
    await save()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Saving…" })))
    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(saveFn.mock.calls[0].slice(0, 2)).toEqual([{ number: "4155550000", note: "" }, FIXTURE_BASELINE])
    const busy = screen.getByRole("button", { name: "Saving…" })
    expect(busy.getAttribute("aria-busy")).toBe("true")
    expect(number().readOnly).toBe(true)
    expect(number().disabled).toBe(false)
    expect(note().readOnly).toBe(true)
    const cancel = button("Cancel")
    expect(cancel.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(cancel)
    expect(screen.getByText("Editing")).toBeTruthy()

    await act(async () => finish(OK))
    expect(screen.getByRole("cell", { name: "4155550000" })).toBeTruthy()
    expect(document.activeElement).toBe(heading())
    expect(toastSuccess).toHaveBeenCalledWith("Phone saved.")
    expect(events).toEqual([["section_save", { sectionId: "phone", ok: true, code: null }]])
    const payload = events[0][1] as TelemetryEvents["section_save"]
    expect(Object.keys(payload).toSorted()).toEqual(["code", "ok", "sectionId"])
    expect(registry?.isAnyDirty()).toBe(false)
  })

  it("successToast: custom text, or false for none", async () => {
    const first = setup({ successToast: "Personal account updated successfully" })
    await edit()
    type(number(), "4155550000")
    await save()
    expect(toastSuccess).toHaveBeenLastCalledWith("Personal account updated successfully")
    first.unmount()
    vi.mocked(toastSuccess).mockClear()
    setup({ successToast: false })
    await edit()
    type(number(), "4155550000")
    await save()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("network failure: stays in edit with edits kept, Section error + Retry (focused), error toast, telemetry code; Retry re-runs save", async () => {
    const saveFn = vi.fn<(values: FixtureSectionValues) => Promise<SaveResult>>().mockResolvedValueOnce(NETWORK).mockResolvedValueOnce(OK)
    setup({ save: saveFn })
    await edit()
    type(number(), "4155550000")
    await save()
    const message = "Couldn't save phone. Check your connection."
    const banner = screen.getByText(message).closest("[data-slot~='inline-banner']") as HTMLElement
    expect(banner).toBeTruthy()
    expect(document.activeElement).toBe(banner)
    expect(number().value).toBe("4155550000")
    expect(screen.getByText("Unsaved changes")).toBeTruthy()
    expect(toastError).toHaveBeenCalledWith(message, { onRetry: expect.any(Function) })
    expect(events).toEqual([["section_save", { sectionId: "phone", ok: false, code: "NETWORK_ERROR" }]])
    await act(async () => fireEvent.click(button("Retry")))
    expect(saveFn).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("cell", { name: "4155550000" })).toBeTruthy()
    // The toast's Retry also runs the latest submit (nothing left to save now: it is in read view).
    await act(async () => vi.mocked(toastError).mock.calls[0][1].onRetry())
    expect(saveFn).toHaveBeenCalledTimes(2)
  })

  it("a generic failure (and a throw) shows 'Couldn't save phone.' with no toast", async () => {
    const saveFn = vi.fn<(values: FixtureSectionValues) => Promise<SaveResult>>().mockRejectedValueOnce(new Error("boom"))
    setup({ save: saveFn })
    await edit()
    type(number(), "4155550000")
    await save()
    expect(screen.getByText("Couldn't save phone.")).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
    expect(events).toEqual([["section_save", { sectionId: "phone", ok: false, code: "UNEXPECTED" }]])
  })

  it("a failure without a code is GENERIC in telemetry; describeError overrides the copy", async () => {
    setup({ save: async () => ({ ok: false, error: {} }), describeError: () => "Time zone was not saved." })
    await edit()
    type(number(), "4155550000")
    await save()
    expect(screen.getByText("Time zone was not saved.")).toBeTruthy()
    expect(events).toEqual([["section_save", { sectionId: "phone", ok: false, code: "GENERIC" }]])
  })

  it("a mapped field error is shown at its field and focused; an unmapped one at Section level", async () => {
    const duplicate: SaveResult = { ok: false, error: { code: "FIELD", mapped: { kind: "field", field: "value", messageKey: "contacts.duplicatePhone" } } }
    const first = setup({ save: async () => duplicate })
    await edit()
    type(number(), "4155550000")
    note().focus()
    await save()
    expect(screen.getByText("This number is already on your profile").closest("[data-slot~='inline-banner']")).toBeTruthy()
    first.unmount()

    // With the error field mapped onto the form field.
    setup({ save: async () => duplicate, errorFields: { value: "number" } })
    await edit()
    type(number(), "4155550000")
    note().focus()
    await save()
    expect(number().getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(number())
    expect(screen.getByText("This number is already on your profile").closest("[data-slot='field-error']")).toBeTruthy()
  })

  it("SESSION_EXPIRED: stays in edit with no error and no toast", async () => {
    setup({ save: async () => SESSION })
    await edit()
    type(number(), "4155550000")
    await save()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
    expect(screen.getByText("Editing")).toBeTruthy()
    expect(events).toEqual([["section_save", { sectionId: "phone", ok: false, code: "SESSION_EXPIRED" }]])
  })
})

describe("no changes", () => {
  it("'close' (default): back to read view, nothing sent, focus per cancelFocus", async () => {
    const saveFn = vi.fn(async () => OK)
    setup({ save: saveFn })
    await edit()
    await save()
    expect(saveFn).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy()
    expect(document.activeElement).toBe(heading())
  })

  it("'status': polite 'There are no changes', stays in edit; a change clears it", async () => {
    const saveFn = vi.fn(async () => OK)
    setup({ save: saveFn, onNoChanges: "status" })
    await edit()
    await save()
    expect(saveFn).not.toHaveBeenCalled()
    expect(screen.getByText("There are no changes").getAttribute("role")).toBe("status")
    expect(screen.getByText("Editing")).toBeTruthy()
    type(number(), "4155550000")
    expect(screen.queryByText("There are no changes")).toBeNull()
  })
})

describe("registration (leave guard, Save all)", () => {
  it("registered save shows the saving state and fires telemetry, but never toasts or moves focus", async () => {
    setup()
    await edit()
    type(number(), "4155550000")
    const outside = document.body
    ;(document.activeElement as HTMLElement | null)?.blur()
    const [section] = registry?.getAll() ?? []
    let result: SaveResult | undefined
    await act(async () => {
      result = await section.save()
    })
    expect(result).toEqual(OK)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(outside)
    expect(events).toEqual([["section_save", { sectionId: "phone", ok: true, code: null }]])
    expect(screen.getByRole("cell", { name: "4155550000" })).toBeTruthy()
  })

  it("registered save joins a save already in flight (the Section's own or another registered one)", async () => {
    let finish: (result: SaveResult) => void = () => undefined
    const saveFn = vi.fn(() => new Promise<SaveResult>((resolve) => (finish = resolve)))
    setup({ save: saveFn })
    await edit()
    type(number(), "4155550000")
    await save()
    const [section] = registry?.getAll() ?? []
    let joined: Promise<SaveResult> = Promise.resolve(OK)
    let again: Promise<SaveResult> = Promise.resolve(OK)
    await act(async () => {
      joined = section.save()
      again = section.save()
    })
    await act(async () => finish(NETWORK))
    expect(await joined).toEqual(NETWORK)
    expect(await again).toEqual(NETWORK)
    expect(saveFn).toHaveBeenCalledTimes(1)
  })

  it("registered validate reports invalidCount and focuses the first invalid field; discard returns to read view", async () => {
    setup()
    await edit()
    type(number(), "1")
    note().focus()
    const [section] = registry?.getAll() ?? []
    let result: Awaited<ReturnType<typeof section.validate>> | undefined
    await act(async () => {
      result = await section.validate()
    })
    expect(result?.valid).toBe(false)
    if (result && !result.valid) {
      expect(result.invalidCount).toBe(1)
      act(() => result && !result.valid && result.focusFirstInvalid())
    }
    expect(document.activeElement).toBe(number())
    type(number(), "4155550000")
    await act(async () => {
      result = await section.validate()
    })
    expect(result).toEqual({ valid: true })
    act(() => section.discard())
    expect(screen.getByRole("cell", { name: "4155512125" })).toBeTruthy()
  })

  it("registers saveAll: false (never counted)", async () => {
    setup({ saveAll: false })
    await edit()
    type(number(), "4155550000")
    const [section] = registry?.getAll() ?? []
    expect(section.saveAll).toBe(false)
    expect(registry?.getDirtyCount()).toBe(0)
    expect(section.draftFields).toEqual([])
  })

  it("registers the draft hooks (F4)", async () => {
    setup({ draftFields: ["number"], describeDraftDiff: () => [] })
    await edit()
    type(number(), "4155550000")
    const [section] = registry?.getAll() ?? []
    expect(section.draftFields).toEqual(["number"])
    expect(section.userChanged).toBe(true)
    expect(section.getDraftValues?.()).toEqual({ number: "4155550000" })
    expect(section.getDraftBase?.()).toEqual({ number: FIXTURE_BASELINE.number })
    act(() => section.discard())
    let applied: boolean | undefined
    act(() => {
      applied = section.applyDraft?.({ number: "4155559999", other: "x" })
    })
    expect(applied).toBe(true)
    expect(number().value).toBe("4155559999")
    expect(screen.getByText("Unsaved changes")).toBeTruthy()
    // A restored draft counts as the user's change (it is written again with the current base).
    expect(registry?.getAll()[0].userChanged).toBe(true)
  })


  it("without draftFields registers no draft hooks", () => {
    setup()
    const [section] = registry?.getAll() ?? []
    expect(section.getDraftValues).toBeUndefined()
    expect(section.applyDraft).toBeUndefined()
  })
})

describe("baseline changes", () => {
  it("read view shows a new server baseline", async () => {
    const view = setup()
    view.rerender({ baseline: { number: "4155550001", note: "work" } })
    await flush()
    expect(screen.getByRole("cell", { name: "4155550001" })).toBeTruthy()
    expect(screen.getByRole("cell", { name: "work" })).toBeTruthy()
  })

  it("edit view rebases: unchanged fields take the new value, the user's edits are kept and stay dirty", async () => {
    const view = setup()
    await edit()
    type(number(), "4155550000")
    view.rerender({ baseline: { number: FIXTURE_BASELINE.number, note: "work" } })
    await flush()
    expect(note().value).toBe("work")
    expect(number().value).toBe("4155550000")
    expect(screen.getByText("Unsaved changes")).toBeTruthy()
    // An equal baseline object is no change.
    view.rerender({ baseline: { number: FIXTURE_BASELINE.number, note: "work" } })
    await flush()
    expect(number().value).toBe("4155550000")
  })

  it("rebase() after a stop-mode failure (runSaveSteps): Retry sends only the remaining diff", async () => {
    const server = { ...FIXTURE_BASELINE }
    const sent: string[] = []
    let attempt = 0
    const saveFn: FixtureSectionProps["save"] = async (values, baseline, rebase) => {
      attempt += 1
      const steps = (["note", "number"] as const).map((part) => ({
        part,
        skip: values[part] === baseline[part],
        run: async () => {
          sent.push(part)
          if (part === "number" && attempt === 1) return { success: false, statusCode: 500 }
          server[part] = values[part]
          return { success: true }
        },
      }))
      const result = await runSaveSteps(steps, { scope: "phone", mode: "stop", refetch: async () => ({ ...server }), rebase })
      return result.ok ? { ok: true } : { ok: false, error: { code: result.error.code, mapped: result.error.mapped } }
    }
    setup({ save: saveFn })
    await edit()
    type(number(), "4155550000")
    type(note(), "work")
    await save()
    expect(sent).toEqual(["note", "number"])
    expect(screen.getByText("Couldn't save phone.")).toBeTruthy()
    expect(number().value).toBe("4155550000")
    expect(note().value).toBe("work")
    expect(screen.getByText("Unsaved changes")).toBeTruthy()
    await act(async () => fireEvent.click(button("Retry")))
    expect(sent).toEqual(["note", "number", "number"])
    expect(screen.getByRole("cell", { name: "4155550000" })).toBeTruthy()
    expect(screen.getByRole("cell", { name: "work" })).toBeTruthy()
  })
})

describe("footer and accessibility", () => {
  it("shows Add row when the Section supports rows", async () => {
    const onAddRow = vi.fn()
    setup({ onAddRow })
    await edit()
    fireEvent.click(button("Add row"))
    expect(onAddRow).toHaveBeenCalledTimes(1)
  })

  it.each([1280, 360])("has no axe violations in read view, edit view with an error, and with a Section error (%i px)", async (width) => {
    stubViewport(width)
    setup({ save: async () => NETWORK, onAddRow: () => undefined })
    expect(await axeViolations()).toEqual([])
    await edit()
    type(number(), "")
    fireEvent.blur(number())
    await waitFor(() => expect(number().getAttribute("aria-invalid")).toBe("true"))
    expect(await axeViolations()).toEqual([])
    type(number(), "4155550000")
    await save()
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(await axeViolations()).toEqual([])
  })
})

describe("review fixes", () => {
  it("a failing registered save (network) shows the Section error but never toasts or moves focus", async () => {
    setup({ save: async () => NETWORK })
    await edit()
    type(number(), "4155550000")
    ;(document.activeElement as HTMLElement | null)?.blur()
    const [section] = registry?.getAll() ?? []
    await act(async () => void (await section.save()))
    expect(screen.getByRole("alert").textContent).toBe("Couldn't save phone. Check your connection.")
    expect(toastError).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it("a failing registered save (field error) shows it at the field but never moves focus", async () => {
    const duplicate: SaveResult = { ok: false, error: { code: "FIELD", mapped: { kind: "field", field: "value", messageKey: "contacts.duplicatePhone" } } }
    setup({ save: async () => duplicate, errorFields: { value: "number" } })
    await edit()
    type(number(), "4155550000")
    ;(document.activeElement as HTMLElement | null)?.blur()
    // Let the blur validation settle first, so it can't clear the server error afterwards.
    await flush()
    const [section] = registry?.getAll() ?? []
    await act(async () => void (await section.save()))
    expect(number().getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(document.body)
    expect(toastError).not.toHaveBeenCalled()
  })

  it("registered save preserves schema transformations and refuses invalid current values", async () => {
    const saveFn = vi.fn<(values: FixtureSectionValues) => Promise<SaveResult>>(async () => OK)
    setup({ save: saveFn })
    await edit()
    type(note(), "  work  ")
    await save()
    expect(saveFn.mock.calls[0][0]).toEqual({ number: FIXTURE_BASELINE.number, note: "work" })
    await edit()
    type(note(), "  home  ")
    const [section] = registry?.getAll() ?? []
    await act(async () => void (await section.save()))
    expect(saveFn.mock.calls[1][0]).toEqual({ number: FIXTURE_BASELINE.number, note: "home" })
    await edit()
    type(number(), "1")
    type(note(), " x ")
    let result: SaveResult | undefined
    await act(async () => { result = await section.save() })
    expect(result).toEqual({ ok: false, error: { code: "GENERIC" } })
    expect(saveFn).toHaveBeenCalledTimes(2)
    expect(number().value).toBe("1")
    expect(note().value).toBe(" x ")
    expect(number().getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText(CONTACT_MESSAGES.phoneTenDigits)).toBeTruthy()
    expect(registry?.isAnyDirty()).toBe(true)
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it("Save all refuses a later edit that becomes invalid while an earlier section saves", async () => {
    const saveFn = vi.fn(async () => OK)
    setup({ save: saveFn, draftFields: ["number", "note"], describeDraftDiff: fixtureDraftDiff })
    await edit()
    type(number(), "4155550000")
    let release = (): void => undefined
    const pending = new Promise<SaveResult>((resolve) => { release = () => resolve(OK) })
    const earlier = vi.fn(() => pending)
    registry?.register({ id: "personal", label: "Personal", displayOrder: 1, isDirty: true, validate: () => ({ valid: true }), save: earlier, discard: () => undefined })
    let batch: ReturnType<typeof runSaveAll> | undefined
    await act(async () => { batch = runSaveAll(registry!) })
    await waitFor(() => expect(earlier).toHaveBeenCalledOnce())
    type(number(), "1")
    await act(async () => { release(); await batch })
    expect(saveFn).not.toHaveBeenCalled()
    expect(await batch).toMatchObject({ kind: "done", saved: [{ id: "personal" }], failed: [{ id: "phone" }] })
    expect(number().value).toBe("1")
    expect(number().getAttribute("aria-invalid")).toBe("true")
    expect(registry?.get("phone")?.getDraftValues?.()).toEqual({ number: "1", note: "" })
    expect(registry?.get("phone")?.isDirty).toBe(true)
  })

  it("after a save, a new server baseline replaces the saved values; A → B → A never resurrects the saved override", async () => {
    const view = setup()
    await edit()
    type(number(), "4155550000")
    await save()
    expect(screen.getByRole("cell", { name: "4155550000" })).toBeTruthy()
    view.rerender({ baseline: { number: "4155550001", note: "" } })
    await flush()
    expect(screen.getByRole("cell", { name: "4155550001" })).toBeTruthy()
    view.rerender({ baseline: FIXTURE_BASELINE })
    await flush()
    expect(screen.getByRole("cell", { name: FIXTURE_BASELINE.number })).toBeTruthy()
  })

  it("applyDraft: read → edit like Edit (baseline, no messages), validates the values; ignored while saving", async () => {
    let finish: (result: SaveResult) => void = () => undefined
    setup({ draftFields: ["number"], describeDraftDiff: () => [], save: () => new Promise<SaveResult>((resolve) => (finish = resolve)) })
    const [section] = registry?.getAll() ?? []
    await act(async () => section.applyDraft?.({ number: "12" }))
    expect(screen.getByText("Editing")).toBeTruthy()
    expect(number().value).toBe("12")
    expect(note().value).toBe("")
    await waitFor(() => expect(number().getAttribute("aria-invalid")).toBe("true"))
    type(number(), "4155550000")
    await save()
    await act(async () => section.applyDraft?.({ number: "4155559999" }))
    expect(number().value).toBe("4155550000")
    await act(async () => finish(OK))
  })

  it("Retry keeps focus on Save while the banner unmounts; the network error toast is dismissed on success and on Cancel", async () => {
    let finish: (result: SaveResult) => void = () => undefined
    const saveFn = vi
      .fn<(values: FixtureSectionValues) => Promise<SaveResult>>()
      .mockResolvedValueOnce(NETWORK)
      .mockImplementationOnce(() => new Promise<SaveResult>((resolve) => (finish = resolve)))
      .mockResolvedValueOnce(NETWORK)
    setup({ save: saveFn })
    await edit()
    type(number(), "4155550000")
    await save()
    dismissErrorToast.mockClear()
    await act(async () => fireEvent.click(button("Retry")))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Saving…" }))
    await act(async () => finish(OK))
    expect(dismissErrorToast).toHaveBeenCalled()

    await edit()
    type(number(), "4155550001")
    await save()
    dismissErrorToast.mockClear()
    await act(async () => fireEvent.click(button("Cancel")))
    expect(dismissErrorToast).toHaveBeenCalled()
  })
})

const listSchema = z
  .object({ links: z.array(z.object({ url: z.string().min(1, { message: CONTACT_MESSAGES.phoneTenDigits }) })) })
  .refine(
    (value) => {
      const urls = value.links.map((link) => link.url).filter(Boolean)
      return new Set(urls).size === urls.length
    },
    { message: CONTACT_MESSAGES.duplicateSocial },
  )
type ListValues = z.infer<typeof listSchema>
const LIST_BASELINE: ListValues = { links: [{ url: "a" }, { url: "b" }] }

function ListSection({ save }: { save: (values: ListValues) => Promise<SaveResult> }) {
  const section = useSectionForm<ListValues>({ id: "social", label: "Social media", displayOrder: 4, schema: listSchema, baseline: LIST_BASELINE, save })
  return (
    <section aria-labelledby="social-heading">
      <SectionHeader
        id="social"
        title="Social media"
        editing={section.isEditing}
        actions={
          section.isEditing ? null : (
            <button type="button" {...section.editButtonProps}>
              Edit
            </button>
          )
        }
      />
      {section.isEditing ? (
        <>
          {LIST_BASELINE.links.map((_, index) => (
            <input key={index} aria-label={`Link ${index + 1}`} {...section.field(`links.${index}.url`)} />
          ))}
          <SectionFooter {...section.footerProps} />
        </>
      ) : null}
    </section>
  )
}

describe("nested and list fields", () => {
  function renderList() {
    const saveFn = vi.fn(async () => OK)
    let captured: SectionRegistry | undefined
    render(
      <SectionRegistryProvider>
        <Capture
          onRegistry={(next) => {
            captured = next
          }}
        />
        <ListSection save={saveFn} />
      </SectionRegistryProvider>,
    )
    return { saveFn, registry: () => captured }
  }
  const link = (n: number) => screen.getByRole("textbox", { name: `Link ${n}` }) as HTMLInputElement

  it("counts every nested error and focuses the first invalid list item in page order", async () => {
    const { saveFn, registry: list } = renderList()
    await edit()
    type(link(2), "")
    type(link(1), "")
    const [section] = list()?.getAll() ?? []
    let result: Awaited<ReturnType<typeof section.validate>> | undefined
    await act(async () => {
      result = await section.validate()
    })
    expect(result).toMatchObject({ valid: false, invalidCount: 2 })
    link(2).focus()
    act(() => (result && !result.valid ? result.focusFirstInvalid() : undefined))
    expect(document.activeElement).toBe(link(1))
    link(2).focus()
    await save()
    expect(saveFn).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(link(1))
  })

  it("a refine error with no registered field shows the Section error (focused) and sends nothing", async () => {
    const { saveFn } = renderList()
    await edit()
    type(link(2), "a")
    await save()
    expect(saveFn).not.toHaveBeenCalled()
    const banner = screen.getByText("This link is already on your profile").closest("[data-slot~='inline-banner']")
    expect(banner).toBeTruthy()
    expect(document.activeElement).toBe(banner)
  })
})

describe("createSectionRegistry with the fixture", () => {
  it("is independent per provider", () => {
    expect(createSectionRegistry().getDirtyCount()).toBe(0)
  })
})

describe("F4 draft signals", () => {
  function Presetting({ observed }: { readonly observed: string[] }) {
    const current = useSectionRegistry()
    useEffect(() => current.observe((event) => void (event.type === "saved" || event.type === "discarded" ? observed.push(event.type) : undefined)), [current, observed])
    const section = useSectionForm<FixtureSectionValues>({
      id: "phone",
      label: "Phone",
      displayOrder: 2,
      schema: fixtureSectionSchema,
      baseline: FIXTURE_BASELINE,
      save: async () => OK,
      draftFields: ["number", "note"],
      describeDraftDiff: () => [],
      dataStatus: "error",
    })
    useEffect(() => {
      registry = current
    })
    return (
      <>
        <button type="button" onClick={() => section.startEdit()}>
          Edit
        </button>
        <button type="button" onClick={() => section.form.setValue("note", "preset")}>
          Preset
        </button>
        {section.isEditing ? <input aria-label="Number" {...section.field("number")} /> : null}
        <button type="button" onClick={section.cancel}>
          Cancel
        </button>
        <button type="button" onClick={() => void section.submit()}>
          Save
        </button>
      </>
    )
  }

  it("a preset value makes the Section dirty but not user-changed; typing does; Cancel and Save report and reset it", async () => {
    const observed: string[] = []
    render(
      <SectionRegistryProvider>
        <Presetting observed={observed} />
      </SectionRegistryProvider>,
    )
    const section = () => registry?.getAll()[0]
    expect(section()?.dataStatus).toBe("error")
    await act(async () => fireEvent.click(button("Edit")))
    await act(async () => fireEvent.click(button("Preset")))
    expect(section()).toMatchObject({ isDirty: true, userChanged: false })
    type(screen.getByRole("textbox", { name: "Number" }) as HTMLInputElement, "4155550000")
    await flush()
    expect(section()).toMatchObject({ isDirty: true, userChanged: true })
    // Reverting the user's edit: presets still make it dirty, but it is no longer the user's change.
    type(screen.getByRole("textbox", { name: "Number" }) as HTMLInputElement, FIXTURE_BASELINE.number)
    await flush()
    expect(section()).toMatchObject({ isDirty: true, userChanged: false })
    await act(async () => fireEvent.click(button("Cancel")))
    expect(section()).toMatchObject({ isDirty: false, userChanged: false })
    expect(observed).toEqual(["discarded"])
    // Cancel of a clean Section reports nothing (a stored draft may still be on offer).
    await act(async () => fireEvent.click(button("Edit")))
    await act(async () => fireEvent.click(button("Cancel")))
    expect(observed).toEqual(["discarded"])
    // Clean again after a revert: a later preset alone isn't a user change.
    await act(async () => fireEvent.click(button("Edit")))
    type(screen.getByRole("textbox", { name: "Number" }) as HTMLInputElement, "4155550009")
    await flush()
    type(screen.getByRole("textbox", { name: "Number" }) as HTMLInputElement, FIXTURE_BASELINE.number)
    await flush()
    expect(section()).toMatchObject({ isDirty: false, userChanged: false })
    await act(async () => fireEvent.click(button("Preset")))
    expect(section()).toMatchObject({ isDirty: true, userChanged: false })
    await act(async () => fireEvent.click(button("Cancel")))
    expect(observed).toEqual(["discarded", "discarded"])
    await act(async () => fireEvent.click(button("Edit")))
    type(screen.getByRole("textbox", { name: "Number" }) as HTMLInputElement, "4155550001")
    await act(async () => fireEvent.click(button("Save")))
    expect(observed).toEqual(["discarded", "discarded", "saved"])
    expect(section()).toMatchObject({ isDirty: false, userChanged: false })
  })
})

describe("control(name): non-native controls", () => {
  const choiceSchema = z.object({ note: z.string(), choice: z.string().min(1, { message: CONTACT_MESSAGES.phoneTenDigits }) })
  type ChoiceValues = z.infer<typeof choiceSchema>
  const CHOICE_BASELINE: ChoiceValues = { note: "", choice: "a" }

  /** A Section whose `choice` is a native `<select>` driven only through `control()` (no `register`). */
  function ChoiceSection({ save = async () => OK, showChoice = true }: { readonly save?: (values: ChoiceValues) => Promise<SaveResult>; readonly showChoice?: boolean }) {
    const current = useSectionRegistry()
    const section = useSectionForm<ChoiceValues>({
      id: "phone",
      label: "Phone",
      displayOrder: 2,
      schema: choiceSchema,
      baseline: CHOICE_BASELINE,
      save,
      errorFields: { ssn: "choice" },
      draftFields: ["note", "choice"],
      describeDraftDiff: () => [],
    })
    useEffect(() => {
      registry = current
    })
    const { ref: choiceRef, ...choice } = section.control("choice")
    return (
      <>
        <button type="button" onClick={() => section.startEdit()}>
          Edit
        </button>
        <button type="button" onClick={() => section.form.setValue("choice", "b", { shouldDirty: true })}>
          Preset
        </button>
        {section.isEditing ? (
          <>
            <input aria-label="Note" {...section.field("note")} />
            {showChoice ? (
              <select
                aria-label="Choice"
                name={choice.name}
                ref={choiceRef}
                value={choice.value}
                data-readonly={choice.readOnly ? "true" : undefined}
                onChange={(event) => choice.onChange(event.target.value)}
                onBlur={choice.onBlur}
              >
                <option value="">None</option>
                <option value="a">A</option>
                <option value="b">B</option>
              </select>
            ) : null}
            <p data-testid="choice-error">{section.errorFor("choice") ?? ""}</p>
            <SectionFooter {...section.footerProps} />
          </>
        ) : null}
      </>
    )
  }

  function renderChoice(props: Parameters<typeof ChoiceSection>[0] = {}) {
    const view = render(
      <SectionRegistryProvider>
        <ChoiceSection {...props} />
      </SectionRegistryProvider>,
    )
    return {
      ...view,
      rerender: (next: Parameters<typeof ChoiceSection>[0]) =>
        view.rerender(
          <SectionRegistryProvider>
            <ChoiceSection {...next} />
          </SectionRegistryProvider>,
        ),
    }
  }
  const choice = () => screen.getByRole("combobox", { name: "Choice" }) as HTMLSelectElement
  const entry = () => registry?.getAll()[0]

  it("shows the form value; onChange is the user's change (dirty, drafted); a setValue preset is not; Cancel resets it", async () => {
    renderChoice()
    await edit()
    expect(choice().value).toBe("a")
    await act(async () => fireEvent.click(button("Preset")))
    expect(choice().value).toBe("b")
    expect(entry()).toMatchObject({ isDirty: true, userChanged: false })
    await act(async () => fireEvent.change(choice(), { target: { value: "a" } }))
    await act(async () => fireEvent.change(choice(), { target: { value: "" } }))
    expect(entry()).toMatchObject({ isDirty: true, userChanged: true })
    expect(entry()?.getDraftValues?.()).toEqual({ note: "", choice: "" })
    await act(async () => fireEvent.click(button("Cancel")))
    await edit()
    expect(choice().value).toBe("a")
  })

  it("onBlur validates (onBlur mode, like field()): the error shows and clears on blur", async () => {
    renderChoice()
    await edit()
    await act(async () => fireEvent.change(choice(), { target: { value: "" } }))
    expect(screen.getByTestId("choice-error").textContent).toBe("")
    await act(async () => fireEvent.blur(choice()))
    await waitFor(() => expect(screen.getByTestId("choice-error").textContent).toBe(CONTACT_MESSAGES.phoneTenDigits))
    await act(async () => fireEvent.change(choice(), { target: { value: "b" } }))
    await act(async () => fireEvent.blur(choice()))
    await waitFor(() => expect(screen.getByTestId("choice-error").textContent).toBe(""))
  })

  it("Save with the control invalid sends nothing and focuses the control itself, not a Section error", async () => {
    const send = vi.fn(async () => OK)
    renderChoice({ save: send })
    await edit()
    await act(async () => fireEvent.change(choice(), { target: { value: "" } }))
    await save()
    expect(send).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(choice())
    expect(document.querySelector("[data-slot~='inline-banner']")).toBeNull()
  })

  it("is readOnly while saving; a mapped server field error lands on the control and focuses it", async () => {
    let resolve: (result: SaveResult) => void = () => undefined
    renderChoice({ save: () => new Promise<SaveResult>((done) => (resolve = done)) })
    await edit()
    await act(async () => fireEvent.change(choice(), { target: { value: "b" } }))
    await save()
    expect(choice().dataset.readonly).toBe("true")
    await act(async () => resolve({ ok: false, error: { code: "FIELD", mapped: { kind: "field", field: "ssn", messageKey: "person.ssnTaken" } } }))
    expect(choice().dataset.readonly).toBeUndefined()
    expect(screen.getByTestId("choice-error").textContent).toBe(PERSON_MESSAGES.ssnTaken)
    expect(document.activeElement).toBe(choice())
  })

  it("an unmounted control leaves the focus map: its error then shows at Section level", async () => {
    const { rerender } = renderChoice()
    await edit()
    await act(async () => fireEvent.change(choice(), { target: { value: "" } }))
    rerender({ showChoice: false })
    await save()
    expect(document.activeElement?.closest("[data-slot~='inline-banner']")).not.toBeNull()
  })
})


describe("draft transformation", () => {
  type Options = Partial<UseSectionFormOptions<FixtureSectionValues>>
  let form: SectionForm<FixtureSectionValues>

  function DraftSection(options: Options) {
    const section = useSectionForm<FixtureSectionValues>({
      id: "phone", label: "Phone", displayOrder: 2, schema: fixtureSectionSchema,
      baseline: FIXTURE_BASELINE, save: async () => OK,
      draftFields: ["number"], describeDraftDiff: () => [], ...options,
    })
    useEffect(() => { form = section })
    return (
      <>
        <input aria-label="Number" {...section.field("number")} />
        <input aria-label="Note" {...section.field("note")} />
        <output>{section.errorFor("number")}</output>
      </>
    )
  }

  function renderDraft(options: Options = {}) {
    const tree = (next: Options) => (
      <SectionRegistryProvider>
        <Capture onRegistry={(next) => { registry = next }} />
        <DraftSection {...next} />
      </SectionRegistryProvider>
    )
    const view = render(tree(options))
    return { rerender: (next: Options) => view.rerender(tree(next)) }
  }
  const entry = () => registry!.get("phone")!
  async function restore(values: DraftValues) {
    let applied: boolean | undefined
    await act(async () => { applied = entry().applyDraft?.(values) })
    return applied
  }

  it("without a callback restores only declared fields and retains field validation", async () => {
    renderDraft()
    expect(await restore({ number: "12", note: "ignored", unknown: "ignored", password: "ignored" })).toBe(true)
    expect(form.mode).toBe("edit")
    expect(form.form.getValues()).toEqual({ number: "12", note: "" })
    expect(form.errorFor("number")).toBe(CONTACT_MESSAGES.phoneTenDigits)
    expect(entry()).toMatchObject({ isDirty: true, userChanged: true })
  })

  it("maps before entering edit, filters replacement keys and validates mapped values", async () => {
    const values = { number: "4155550000" }
    const transformDraft = vi.fn(() => {
      expect(form.mode).toBe("read")
      expect(form.form.getValues()).toEqual(FIXTURE_BASELINE)
      return { number: "12", note: "ignored", unknown: "ignored", password: "ignored" }
    })
    renderDraft({ transformDraft })
    expect(await restore(values)).toBe(true)
    expect(transformDraft).toHaveBeenCalledExactlyOnceWith(values, FIXTURE_BASELINE)
    expect(form.form.getValues()).toEqual({ number: "12", note: "" })
    expect(form.errorFor("number")).toBe(CONTACT_MESSAGES.phoneTenDigits)
    expect(form.baseline).toEqual(FIXTURE_BASELINE)
    expect(entry()).toMatchObject({ isDirty: true, userChanged: true })
  })

  it("refusal leaves read and edit values, errors and dirty signals untouched", async () => {
    renderDraft({ transformDraft: () => null })
    expect(await restore({ number: "4155550000" })).toBe(false)
    expect(form.mode).toBe("read")
    expect(form.form.getValues()).toEqual(FIXTURE_BASELINE)
    expect(entry()).toMatchObject({ isDirty: false, userChanged: false })
    await act(async () => form.startEdit())
    await act(async () => form.form.setValue("note", "preset"))
    type(number(), "12")
    await act(async () => form.form.trigger())
    const before = form.form.getValues()
    expect(await restore({ number: "4155550000" })).toBe(false)
    expect(form.mode).toBe("edit")
    expect(form.form.getValues()).toEqual(before)
    expect(form.errorFor("number")).toBe(CONTACT_MESSAGES.phoneTenDigits)
    expect(entry()).toMatchObject({ isDirty: true, userChanged: true })
    type(number(), FIXTURE_BASELINE.number)
    await flush()
    expect(entry()).toMatchObject({ isDirty: true, userChanged: false })
  })

  it("refuses during saving before invoking the callback", async () => {
    let finish: (result: SaveResult) => void = () => undefined
    const transformDraft = vi.fn((values: DraftValues) => values)
    renderDraft({ transformDraft, save: () => new Promise((resolve) => { finish = resolve }) })
    await restore({ number: "4155550000" })
    let saving: Promise<SaveResult> = Promise.resolve(OK)
    act(() => { saving = entry().save() })
    await waitFor(() => expect(form.mode).toBe("saving"))
    transformDraft.mockClear()
    expect(await restore({ number: "4155559999" })).toBe(false)
    expect(transformDraft).not.toHaveBeenCalled()
    expect(form.form.getValues("number")).toBe("4155550000")
    await act(async () => { finish(OK); await saving })
  })

  it("uses the latest callback and current baseline through an existing registration", async () => {
    const old = vi.fn(() => null)
    const view = renderDraft({ transformDraft: old })
    const apply = entry().applyDraft!
    const baseline = { number: "4155550199", note: "current" }
    const latest = vi.fn((values: DraftValues, current: FixtureSectionValues) => ({ ...values, number: current.number }))
    view.rerender({ baseline, transformDraft: latest })
    const values = { number: "4155550000" }
    await act(async () => { expect(apply(values)).toBe(true) })
    expect(old).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledExactlyOnceWith(values, baseline)
    expect(form.form.getValues()).toEqual(baseline)
    expect(entry()).toMatchObject({ isDirty: false, userChanged: false })
  })

  it("passes the effective rebase override while the parent baseline stays unchanged", async () => {
    const transformDraft = vi.fn((_values: DraftValues, baseline: FixtureSectionValues) => baseline)
    const view = renderDraft({ transformDraft })
    const apply = entry().applyDraft!
    const override = { number: "4155550199", note: "rebased" }
    await act(async () => form.rebase(override))
    view.rerender({ baseline: FIXTURE_BASELINE, transformDraft })
    expect(form.baseline).toEqual(override)
    const values = { number: "4155550000" }
    await act(async () => { expect(apply(values)).toBe(true) })
    expect(transformDraft).toHaveBeenCalledExactlyOnceWith(values, override)
    expect(form.form.getValues()).toEqual(override)
    expect(entry()).toMatchObject({ isDirty: false, userChanged: false })
  })

  it("preserves the pre-restore preset baseline and reports each save/cancel once", async () => {
    const send = vi.fn(async () => OK)
    renderDraft({ save: send, transformDraft: (values) => values })
    const observed: string[] = []
    registry!.observe((event) => {
      if (event.type === "saved" || event.type === "discarded") observed.push(event.type)
    })
    await act(async () => form.startEdit())
    await act(async () => form.form.setValue("note", "preset"))
    expect(await restore({ number: "4155550000" })).toBe(true)
    expect(entry()).toMatchObject({ isDirty: true, userChanged: true })
    type(number(), FIXTURE_BASELINE.number)
    await flush()
    expect(entry()).toMatchObject({ isDirty: true, userChanged: false })
    await act(async () => form.cancel())
    expect(form.form.getValues()).toEqual(FIXTURE_BASELINE)
    expect(observed).toEqual(["discarded"])
    await restore({ number: "4155550000" })
    await act(async () => form.submit())
    expect(send).toHaveBeenCalledExactlyOnceWith({ number: "4155550000", note: "" }, FIXTURE_BASELINE)
    expect(observed).toEqual(["discarded", "saved"])
    expect(entry()).toMatchObject({ isDirty: false, userChanged: false })
  })
})
