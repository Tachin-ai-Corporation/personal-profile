import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { useEffect, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { FixtureParticipant } from "./__fixtures__/fixture-participant"
import { setTelemetrySink } from "@/lib/shared/telemetry"
import type { SectionRegistration } from "./nav-types"
import {
  createSectionRegistry,
  SectionRegistryProvider,
  useDirtyCount,
  useIsAnyDirty,
  useRegisterSection,
  useSectionRegistry,
  useSectionSavedCount,
  type SectionRegistry,
} from "./section-registry"

const reg = (overrides: Partial<SectionRegistration> = {}): SectionRegistration => ({
  id: "phone",
  label: "Phone",
  displayOrder: 2,
  isDirty: false,
  discard: vi.fn(),
  ...overrides,
})

describe("createSectionRegistry", () => {
  it("registers, orders by displayOrder, tracks dirty state and unregisters", () => {
    const registry = createSectionRegistry()
    const listener = vi.fn()
    const off = registry.subscribe(listener)
    const unregisterPhone = registry.register(reg({ save: async () => ({ ok: true }) }))
    registry.register(reg({ id: "personal", label: "Personal information", displayOrder: 1, isDirty: true }))
    expect(registry.getAll().map((s) => s.id)).toEqual(["personal", "phone"])
    expect(registry.getDirty().map((s) => s.id)).toEqual(["personal"])
    expect(registry.isAnyDirty()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(2)

    registry.update(reg({ isDirty: true, label: "Phones" }))
    expect(listener).toHaveBeenCalledTimes(3)
    registry.update(reg({ isDirty: true, label: "Phone" }))
    expect(listener).toHaveBeenCalledTimes(3)
    registry.update(reg({ id: "email" }))
    expect(registry.getAll()).toHaveLength(2)

    unregisterPhone()
    unregisterPhone()
    expect(registry.getAll().map((s) => s.id)).toEqual(["personal"])
    expect(listener).toHaveBeenCalledTimes(4)
    off()
  })

  it("throws in development when an id registers twice", () => {
    const registry = createSectionRegistry()
    registry.register(reg())
    expect(() => registry.register(reg())).toThrow('Section "phone" is already registered on this page')
  })

  it("ignores a duplicate in a production build", () => {
    vi.stubEnv("NODE_ENV", "production")
    const registry = createSectionRegistry()
    registry.register(reg({ label: "first" }))
    const off = registry.register(reg({ label: "second" }))
    off()
    expect(registry.getAll().map((s) => s.label)).toEqual(["first"])
  })

  it("records canSave and defaults validate to valid and draftFields to none", async () => {
    const registry = createSectionRegistry()
    registry.register(reg({ id: "insurance", isDirty: true }))
    const [section] = registry.getAll()
    expect(section.canSave).toBe(false)
    expect(section.draftFields).toEqual([])
    expect(await section.validate()).toEqual({ valid: true })
    expect(await section.save()).toEqual({ ok: false, error: { code: "UNEXPECTED" } })
  })

  it("turns a throwing or rejecting save into UNEXPECTED, and passes failedParts through", async () => {
    const registry = createSectionRegistry()
    registry.register(
      reg({
        id: "phone",
        save: () => {
          throw new Error("sync")
        },
      }),
    )
    registry.register(reg({ id: "email", save: () => Promise.reject(new Error("async")) }))
    registry.register(reg({ id: "account", draftFields: ["firstName"], describeDraftDiff: () => [], save: async () => ({ ok: false, error: { failedParts: ["timeZone"] } }) }))
    const byId = Object.fromEntries(registry.getAll().map((s) => [s.id, s]))
    expect(await byId.phone.save()).toEqual({ ok: false, error: { code: "UNEXPECTED" } })
    expect(await byId.email.save()).toEqual({ ok: false, error: { code: "UNEXPECTED" } })
    expect(await byId.account.save()).toEqual({ ok: false, error: { failedParts: ["timeZone"] } })
    expect(byId.account.draftFields).toEqual(["firstName"])
  })

  it("treats a throwing or rejecting validate as invalid", async () => {
    const registry = createSectionRegistry()
    registry.register(
      reg({
        id: "phone",
        validate: () => {
          throw new Error("sync")
        },
      }),
    )
    registry.register(reg({ id: "email", validate: () => Promise.reject(new Error("async")) }))
    for (const section of registry.getAll()) {
      const result = await section.validate()
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.invalidCount).toBe(1)
        expect(() => result.focusFirstInvalid()).not.toThrow()
      }
    }
  })

  it("calls the registered discard and validate", async () => {
    const registry = createSectionRegistry()
    const discard = vi.fn()
    const focusFirstInvalid = vi.fn()
    registry.register(reg({ discard, validate: () => ({ valid: false, invalidCount: 2, focusFirstInvalid }) }))
    const [section] = registry.getAll()
    section.discard()
    expect(discard).toHaveBeenCalledTimes(1)
    expect(await section.validate()).toEqual({ valid: false, invalidCount: 2, focusFirstInvalid })
  })
})

describe("dirty count and saveAll", () => {
  it("counts only dirty Save-all Sections; isAnyDirty includes guard-only participants", () => {
    const registry = createSectionRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)
    const save = async () => ({ ok: true }) as const
    registry.register(reg({ id: "phone", isDirty: true, save }))
    registry.register(reg({ id: "email", isDirty: false, save }))
    registry.register(reg({ id: "insurance", isDirty: true, saveAll: false, save }))
    registry.register(reg({ id: "social", isDirty: true }))
    expect(registry.getDirtyCount()).toBe(1)
    expect(registry.isAnyDirty()).toBe(true)
    expect(registry.getAll().map((s) => [s.id, s.saveAll])).toEqual([
      ["phone", true],
      ["email", true],
      ["insurance", false],
      ["social", false],
    ])
    registry.update(reg({ id: "email", isDirty: true, save }))
    expect(registry.getDirtyCount()).toBe(2)
    // A saveAll change alone notifies (the count changes); so does losing `save`.
    listener.mockClear()
    registry.update(reg({ id: "email", isDirty: true, saveAll: false, save }))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(registry.getDirtyCount()).toBe(1)
    registry.update(reg({ id: "phone", isDirty: true }))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(registry.getDirtyCount()).toBe(0)
  })

  it("useDirtyCount re-renders with the count, ignoring guard-only participants", () => {
    function Count() {
      return <span data-testid="count">{useDirtyCount()}</span>
    }
    render(
      <SectionRegistryProvider>
        <FixtureParticipant id="phone" label="Phone" displayOrder={2} />
        <FixtureParticipant id="email" label="Email" displayOrder={3} />
        <FixtureParticipant id="insurance" label="Insurance" displayOrder={6} saveAll={false} />
        <Count />
      </SectionRegistryProvider>,
    )
    expect(screen.getByTestId("count").textContent).toBe("0")
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText("Insurance"), { target: { value: "1" } })
    expect(screen.getByTestId("count").textContent).toBe("1")
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "1" } })
    expect(screen.getByTestId("count").textContent).toBe("2")
  })
})

describe("draft hooks (F4 contract)", () => {
  it("are passed through, absent when not registered", () => {
    const registry = createSectionRegistry()
    registry.register(reg())
    const [plain] = registry.getAll()
    expect(plain.getDraftValues).toBeUndefined()
    expect(plain.getDraftBase).toBeUndefined()
    expect(plain.applyDraft).toBeUndefined()
    expect(plain.describeDraftDiff).toBeUndefined()
  })

  it("always call the latest render's hooks through useRegisterSection", () => {
    let registry: ReturnType<typeof createSectionRegistry> | undefined
    const applied: unknown[] = []
    function Section({ value }: { value: string }) {
      const current = useSectionRegistry()
      useEffect(() => {
        registry = current
      })
      useRegisterSection(
        reg({
          save: async () => ({ ok: true }),
          draftFields: ["value"],
          getDraftValues: () => ({ value }),
          getDraftBase: () => ({ value: `base-${value}` }),
          applyDraft: (values) => applied.push([value, values]) > 0,
          describeDraftDiff: (draft, current) => [{ field: "value", label: "Value", mine: String(draft.value), current: `${String(current.value)}-${value}` }],
        }),
      )
      return null
    }
    const view = render(
      <SectionRegistryProvider>
        <Section value="a" />
      </SectionRegistryProvider>,
    )
    view.rerender(
      <SectionRegistryProvider>
        <Section value="b" />
      </SectionRegistryProvider>,
    )
    const [section] = registry?.getAll() ?? []
    expect(section.getDraftValues?.()).toEqual({ value: "b" })
    expect(section.getDraftBase?.()).toEqual({ value: "base-b" })
    section.applyDraft?.({ value: "x" })
    expect(applied).toEqual([["b", { value: "x" }]])
    expect(section.describeDraftDiff?.({ value: "x" }, { value: "y" })).toEqual([{ field: "value", label: "Value", mine: "x", current: "y-b" }])
  })
})

describe("useRegisterSection", () => {
  it("registers while mounted, follows dirty state and always calls the latest callbacks", async () => {
    function Probe() {
      const registry = useSectionRegistry()
      const dirty = useIsAnyDirty()
      return (
        <>
          <span data-testid="dirty">{String(dirty)}</span>
          <button type="button" onClick={() => void registry.getAll()[0]?.save()}>
            save first
          </button>
        </>
      )
    }
    const saved: string[] = []
    const view = render(
      <SectionRegistryProvider>
        <FixtureParticipant id="phone" label="Phone" displayOrder={2} onSave={(value) => saved.push(value)} />
        <Probe />
      </SectionRegistryProvider>,
    )
    expect(screen.getByTestId("dirty").textContent).toBe("false")
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "a" } })
    expect(screen.getByTestId("dirty").textContent).toBe("true")
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "ab" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "save first" })))
    expect(saved).toEqual(["ab"])
    expect(screen.getByTestId("dirty").textContent).toBe("false")
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "" } })
    expect(screen.getByTestId("dirty").textContent).toBe("true")
    view.unmount()
  })

  it("unregisters on unmount", () => {
    let registry: ReturnType<typeof createSectionRegistry> | undefined
    function Capture() {
      const current = useSectionRegistry()
      useEffect(() => {
        registry = current
      })
      return null
    }
    const tree = (show: boolean) => (
      <SectionRegistryProvider>
        <Capture />
        {show ? <FixtureParticipant id="email" label="Email" displayOrder={3} /> : null}
      </SectionRegistryProvider>
    )
    const view = render(tree(true))
    expect(registry?.getAll().map((s) => s.id)).toEqual(["email"])
    view.rerender(tree(false))
    expect(registry?.getAll()).toEqual([])
  })

  it("refuses use outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(() => renderHook(() => useRegisterSection(reg()))).toThrow("useSectionRegistry must be used inside SectionRegistryProvider")
  })
})


const describeDraftDiff = () => []
const OK = async () => ({ ok: true }) as const

describe("draft contract (F4)", () => {
  it("throws in development on a denylisted draft field, a guard-only participant's draft fields or no describeDraftDiff", () => {
    const registry = createSectionRegistry()
    expect(() => registry.register(reg({ id: "personal", save: OK, describeDraftDiff, draftFields: ["firstName", "SSN"] }))).toThrow(/denylisted/)
    expect(() => registry.register(reg({ id: "insurance", saveAll: false, save: OK, describeDraftDiff, draftFields: ["insurer"] }))).toThrow(/guard-only/)
    expect(() => registry.register(reg({ id: "email", describeDraftDiff, draftFields: ["value"] }))).toThrow(/guard-only/)
    expect(() => registry.register(reg({ id: "social", save: OK, draftFields: ["value"] }))).toThrow(/describeDraftDiff/)
    expect(registry.getAll()).toEqual([])
  })

  it("validates update() too, only when the draft contract changed", () => {
    const registry = createSectionRegistry()
    registry.register(reg({ save: OK, describeDraftDiff, draftFields: ["number"] }))
    expect(() => registry.update(reg({ save: OK, describeDraftDiff, draftFields: ["number", "password"] }))).toThrow(/denylisted/)
    vi.stubEnv("NODE_ENV", "production")
    const tracked: unknown[] = []
    const restore = setTelemetrySink((event, payload) => void tracked.push([event, payload]))
    registry.update(reg({ save: OK, describeDraftDiff, draftFields: ["number", "npi"] }))
    // Same contract on later renders (a new but equal array): not re-validated, no repeated telemetry.
    registry.update(reg({ save: OK, describeDraftDiff, draftFields: ["number", "npi"], isDirty: true }))
    restore()
    expect(registry.get("phone")?.draftFields).toEqual(["number"])
    expect(tracked).toEqual([["draft_fields_dropped", { sectionId: "phone", count: 1, reason: "denylisted" }]])
  })

  it("drops them in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    const registry = createSectionRegistry()
    registry.register(reg({ id: "personal", save: OK, describeDraftDiff, draftFields: ["firstName", "signature", "socialSecurityNumber"] }))
    registry.register(reg({ id: "insurance", saveAll: false, save: OK, draftFields: ["insurer"] }))
    expect(registry.getAll().map((section) => [section.id, section.draftFields])).toEqual([
      ["personal", ["firstName"]],
      ["insurance", []],
    ])
  })

  it("defaults userChanged to isDirty, and dataStatus to loading with draft fields (else loaded)", () => {
    const registry = createSectionRegistry()
    registry.register(reg({ isDirty: true }))
    registry.register(reg({ id: "email", save: OK, describeDraftDiff, draftFields: ["value"] }))
    expect(registry.get("phone")).toMatchObject({ userChanged: true, dataStatus: "loaded" })
    expect(registry.get("email")).toMatchObject({ dataStatus: "loading" })
    registry.update(reg({ isDirty: true, userChanged: false, dataStatus: "error" }))
    expect(registry.get("phone")).toMatchObject({ userChanged: false, dataStatus: "error" })
    expect(registry.get("social")).toBeUndefined()
  })

  it("reports registered, updated, saved (ok only), discarded (dirty only) and unregistered (still readable) to observers; report() relays", async () => {
    const registry = createSectionRegistry()
    const events: string[] = []
    const off = registry.observe((event) => events.push(`${event.type}:${event.id}:${registry.get(event.id) ? "readable" : "gone"}`))
    let ok = true
    const save = async () => (ok ? { ok: true as const } : { ok: false as const, error: { code: "GENERIC" as const } })
    const unregister = registry.register(reg({ save }))
    registry.get("phone")?.discard()
    registry.update(reg({ isDirty: true, save }))
    const [section] = registry.getAll()
    await section.save()
    ok = false
    await section.save()
    section.discard()
    registry.report({ type: "saved", id: "phone" })
    unregister()
    off()
    registry.report({ type: "discarded", id: "phone" })
    expect(events).toEqual([
      "registered:phone:readable",
      "updated:phone:readable",
      "saved:phone:readable",
      "discarded:phone:readable",
      "saved:phone:readable",
      "unregistered:phone:readable",
    ])
    expect(registry.get("phone")).toBeUndefined()
  })
})

describe("useSectionSavedCount (design refresh)", () => {
  /** Renders the hook for `id` inside a registry; `registry()` reports events, `rerender({ id })` changes the observed Section. */
  function renderCount(initial: Parameters<typeof useSectionSavedCount>[0]) {
    let captured: SectionRegistry | undefined
    const wrapper = ({ children }: { readonly children: ReactNode }) => <SectionRegistryProvider>{children}</SectionRegistryProvider>
    const view = renderHook(
      ({ id }) => {
        captured = useSectionRegistry()
        return useSectionSavedCount(id)
      },
      { wrapper, initialProps: { id: initial } },
    )
    const save = (id: NonNullable<Parameters<typeof useSectionSavedCount>[0]>) => act(() => captured?.report({ type: "saved", id }))
    const registry = (): SectionRegistry => {
      if (!captured) throw new Error("no registry")
      return captured
    }
    return { ...view, save, registry }
  }

  it("counts its own Section's saves only", () => {
    const { result, save } = renderCount("phone")
    expect(result.current).toBe(0)
    save("email")
    expect(result.current).toBe(0)
    save("phone")
    save("phone")
    expect(result.current).toBe(2)
  })

  it("phone → null: 0, and a save meanwhile isn't counted", () => {
    const { result, rerender, save } = renderCount("phone")
    save("phone")
    rerender({ id: null })
    expect(result.current).toBe(0)
    save("phone")
    expect(result.current).toBe(0)
  })

  it("phone → email: starts at 0 and counts only email's saves", () => {
    const { result, rerender, save } = renderCount("phone")
    save("phone")
    rerender({ id: "email" })
    expect(result.current).toBe(0)
    save("phone")
    expect(result.current).toBe(0)
    save("email")
    expect(result.current).toBe(1)
  })

  it("re-enabling (phone → null → phone) starts a fresh count", () => {
    const { result, rerender, save } = renderCount("phone")
    save("phone")
    save("phone")
    rerender({ id: null })
    rerender({ id: "phone" })
    expect(result.current).toBe(0)
    save("phone")
    expect(result.current).toBe(1)
  })

  it("is 0 outside a registry", () => {
    const { result } = renderHook(() => useSectionSavedCount("phone"))
    expect(result.current).toBe(0)
  })

  it("is read-only: the registry's other observers get the same saves", () => {
    const { result, save, registry } = renderCount("phone")
    const observer = vi.fn()
    registry().observe(observer)
    save("phone")
    expect(result.current).toBe(1)
    expect(observer).toHaveBeenCalledWith({ type: "saved", id: "phone" })
  })
})
