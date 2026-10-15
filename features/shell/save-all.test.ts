import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { callApi, mapApiError, mappedErrorCode, pageUser, sessionEvents } from "@/lib/api"
import { setTelemetrySink, type TelemetrySink } from "@/lib/shared/telemetry"
import { server } from "@/test/msw-server"
import type { SaveResult, SectionId, SectionRegistration, ValidateResult } from "./nav-types"
import { runSaveAll, saveAllSummary, type SaveAllOutcome } from "./save-all"
import { createSectionRegistry } from "./section-registry"

const OK: SaveResult = { ok: true }
const FAIL: SaveResult = { ok: false, error: { code: "GENERIC", mapped: { kind: "generic" } } }
const SESSION: SaveResult = { ok: false, error: { code: "SESSION_EXPIRED", mapped: { kind: "session" } } }

const LABELS: Record<SectionId, string> = {
  personal: "Personal information",
  phone: "Phone",
  email: "Email",
  social: "Social media",
  addresses: "Addresses",
  insurance: "Insurance",
  account: "Personal account settings",
}
const ORDER: Record<SectionId, number> = { personal: 1, phone: 2, email: 3, social: 4, addresses: 5, insurance: 6, account: 7 }

interface Spec {
  readonly dirty?: boolean
  readonly result?: SaveResult
  readonly invalid?: number
  readonly saveAll?: false
}

function setup(specs: Partial<Record<SectionId, Spec>>) {
  const registry = createSectionRegistry()
  const sent: SectionId[] = []
  const focused: SectionId[] = []
  for (const [id, spec] of Object.entries(specs) as [SectionId, Spec][]) {
    const registration: SectionRegistration = {
      id,
      label: LABELS[id],
      displayOrder: ORDER[id],
      isDirty: spec.dirty ?? true,
      saveAll: spec.saveAll,
      validate: (): ValidateResult =>
        spec.invalid ? { valid: false, invalidCount: spec.invalid, focusFirstInvalid: () => focused.push(id) } : { valid: true },
      save: async () => {
        sent.push(id)
        return spec.result ?? OK
      },
      discard: () => undefined,
    }
    registry.register(registration)
  }
  return { registry, sent, focused }
}

let events: [string, unknown][] = []
const sink: TelemetrySink = (event, payload) => void events.push([event, payload])
let restore = setTelemetrySink(sink)
afterEach(() => {
  restore()
  events = []
  restore = setTelemetrySink(sink)
})

describe("runSaveAll", () => {
  it("zero dirty: clean, nothing sent, no telemetry", async () => {
    const { registry, sent } = setup({ phone: { dirty: false } })
    expect(await runSaveAll(registry)).toEqual({ kind: "clean" })
    expect(sent).toEqual([])
    expect(events).toEqual([])
  })

  it("two dirty, one invalid: nothing sent; the invalid list has counts; focus goes to the first invalid in page order", async () => {
    const { registry, sent, focused } = setup({ email: { invalid: 1 }, phone: {}, addresses: { invalid: 3 } })
    const outcome = await runSaveAll(registry, { order: ["addresses", "email", "phone"] })
    expect(sent).toEqual([])
    expect(outcome.kind).toBe("invalid")
    if (outcome.kind !== "invalid") return
    expect(outcome.invalid).toEqual([
      { id: "email", label: "Email", invalidCount: 1 },
      { id: "addresses", label: "Addresses", invalidCount: 3 },
    ])
    outcome.focusFirstInvalid()
    expect(focused).toEqual(["email"])
    expect(events).toEqual([])
    expect(saveAllSummary(outcome)).toEqual({ tone: "invalid", lines: ["Email has 1 field to fix", "Addresses has 3 fields to fix"] })
  })

  it("saves sequentially in the given order (unlisted Sections after, in displayOrder), skipping clean ones", async () => {
    const { registry, sent } = setup({ personal: {}, phone: {}, email: {}, social: { dirty: false }, addresses: {}, account: {} })
    const outcome = await runSaveAll(registry, { order: ["email", "personal", "phone"] })
    expect(sent).toEqual(["email", "personal", "phone", "addresses", "account"])
    expect(outcome.kind).toBe("done")
  })

  it("defaults to displayOrder and waits for each save before the next", async () => {
    const registry = createSectionRegistry()
    const log: string[] = []
    for (const id of ["email", "phone"] as const) {
      registry.register({
        id,
        label: LABELS[id],
        displayOrder: ORDER[id],
        isDirty: true,
        save: async () => {
          log.push(`start ${id}`)
          await new Promise((resolve) => setTimeout(resolve, 5))
          log.push(`end ${id}`)
          return OK
        },
        discard: () => undefined,
      })
    }
    await runSaveAll(registry)
    expect(log).toEqual(["start phone", "end phone", "start email", "end email"])
  })

  it("partial: A ok, B 500 → both attempted, summary '1 saved, 1 failed', one save_all event", async () => {
    const { registry, sent } = setup({ phone: {}, email: { result: FAIL } })
    const outcome = await runSaveAll(registry)
    expect(sent).toEqual(["phone", "email"])
    expect(outcome).toEqual({ kind: "done", saved: [{ id: "phone", label: "Phone" }], failed: [{ id: "email", label: "Email" }], cancelled: [] })
    expect(saveAllSummary(outcome)).toEqual({ tone: "partial", text: "1 saved, 1 failed" })
    expect(events).toEqual([["save_all", { saved: 1, failed: 1 }]])
  })

  it("continues after a failure: '0 saved, 2 failed', never 'All saved'", async () => {
    const { registry, sent } = setup({ phone: { result: FAIL }, email: { result: FAIL } })
    const outcome = await runSaveAll(registry)
    expect(sent).toEqual(["phone", "email"])
    const summary = saveAllSummary(outcome)
    expect(summary).toEqual({ tone: "partial", text: "0 saved, 2 failed" })
    expect(JSON.stringify(summary)).not.toContain("All saved")
  })

  it("all saved: 'All saved.' for several, '{Section} saved.' for one; telemetry has exactly the two numbers", async () => {
    const several = setup({ phone: {}, email: {} })
    expect(saveAllSummary(await runSaveAll(several.registry))).toEqual({ tone: "success", text: "All saved." })
    expect(events).toEqual([["save_all", { saved: 2, failed: 0 }]])
    expect(Object.keys(events[0][1] as object).toSorted()).toEqual(["failed", "saved"])

    const one = setup({ email: {} })
    expect(saveAllSummary(await runSaveAll(one.registry))).toEqual({ tone: "success", text: "Email saved." })
  })

  it("stops at SESSION_EXPIRED: no later Section, no summary, telemetry for what was sent", async () => {
    const { registry, sent } = setup({ personal: {}, phone: { result: SESSION }, email: {} })
    const outcome = await runSaveAll(registry)
    expect(sent).toEqual(["personal", "phone"])
    expect(outcome).toEqual({ kind: "session", saved: [{ id: "personal", label: "Personal information" }], failed: [{ id: "phone", label: "Phone" }], cancelled: [] })
    expect(saveAllSummary(outcome)).toBeNull()
    expect(events).toEqual([["save_all", { saved: 1, failed: 1 }]])
  })

  it("leaves guard-only participants out unless includeGuardOnly; then validates them first and saves them last", async () => {
    const { registry, sent } = setup({ insurance: { saveAll: false }, email: {} })
    await runSaveAll(registry)
    expect(sent).toEqual(["email"])

    sent.length = 0
    await runSaveAll(registry, { includeGuardOnly: true, order: ["email"] })
    expect(sent).toEqual(["email", "insurance"])

    const invalid = setup({ insurance: { saveAll: false, invalid: 2 }, email: {} })
    const outcome = await runSaveAll(invalid.registry, { includeGuardOnly: true })
    expect(outcome.kind).toBe("invalid")
    expect(invalid.sent).toEqual([])
  })

  it("only guard-only participants dirty: clean for Save all", async () => {
    const { registry } = setup({ insurance: { saveAll: false } })
    expect(await runSaveAll(registry)).toEqual({ kind: "clean" })
  })

  it("a throwing save counts as failed (registry wrapper) and the run continues", async () => {
    const registry = createSectionRegistry()
    registry.register({ id: "phone", label: "Phone", displayOrder: 2, isDirty: true, save: vi.fn().mockRejectedValue(new Error("x")), discard: () => undefined })
    registry.register({ id: "email", label: "Email", displayOrder: 3, isDirty: true, save: async () => OK, discard: () => undefined })
    const outcome: SaveAllOutcome = await runSaveAll(registry)
    expect(outcome).toEqual({ kind: "done", saved: [{ id: "email", label: "Email" }], failed: [{ id: "phone", label: "Phone" }], cancelled: [] })
  })
})

describe("runSaveAll options", () => {
  it("trackTelemetry: false sends but fires no save_all", async () => {
    const { registry, sent } = setup({ phone: {}, email: { result: FAIL } })
    await runSaveAll(registry, { trackTelemetry: false })
    expect(sent).toEqual(["phone", "email"])
    expect(events).toEqual([])
  })

  it("a participant without save defaults to saveAll false: not counted, never queued (even with includeGuardOnly)", async () => {
    const registry = createSectionRegistry()
    const save = vi.fn(async () => OK)
    registry.register({ id: "insurance", label: "Insurance", displayOrder: 6, isDirty: true, discard: () => undefined })
    registry.register({ id: "phone", label: "Phone", displayOrder: 2, isDirty: true, save, discard: () => undefined })
    expect(registry.getDirtyCount()).toBe(1)
    expect(registry.getAll().find((s) => s.id === "insurance")?.saveAll).toBe(false)
    expect(await runSaveAll(registry, { includeGuardOnly: true })).toEqual({ kind: "done", saved: [{ id: "phone", label: "Phone" }], failed: [], cancelled: [] })
    expect(save).toHaveBeenCalledTimes(1)
    events = []
    // Nothing that can save is dirty: nothing sent, no telemetry.
    const onlyUnsaveable = createSectionRegistry()
    onlyUnsaveable.register({ id: "insurance", label: "Insurance", displayOrder: 6, isDirty: true, discard: () => undefined })
    expect(await runSaveAll(onlyUnsaveable, { includeGuardOnly: true })).toEqual({ kind: "done", saved: [], failed: [], cancelled: [] })
    expect(events).toEqual([])
  })
})

describe("saveAllSummary", () => {
  it("is null for a clean run", () => {
    expect(saveAllSummary({ kind: "clean" })).toBeNull()
  })
})

describe("CANCELLED (F6-1 review H2)", () => {
  const CANCELLED: SaveResult = { ok: false, error: { code: "CANCELLED" } }

  it("a cancelled Section is its own bucket: not failed, not in save_all failed; the run continues", async () => {
    const { registry, sent } = setup({ personal: { result: CANCELLED }, phone: {}, email: {} })
    const outcome = await runSaveAll(registry)
    expect(sent).toEqual(["personal", "phone", "email"])
    expect(outcome).toEqual({
      kind: "done",
      saved: [
        { id: "phone", label: "Phone" },
        { id: "email", label: "Email" },
      ],
      failed: [],
      cancelled: [{ id: "personal", label: "Personal information" }],
    })
    expect(events).toEqual([["save_all", { saved: 2, failed: 0 }]])
    expect(saveAllSummary(outcome)).toEqual({ tone: "success", text: "2 saved." })
  })

  it("no 'failed' copy for cancels: one saved names it; none saved shows nothing; a real failure still reads partial", async () => {
    const one = await runSaveAll(setup({ personal: { result: CANCELLED }, phone: {} }).registry)
    expect(saveAllSummary(one)).toEqual({ tone: "success", text: "Phone saved." })
    const none = await runSaveAll(setup({ personal: { result: CANCELLED } }).registry)
    expect(saveAllSummary(none)).toBeNull()
    const mixed = await runSaveAll(setup({ personal: { result: CANCELLED }, phone: { result: FAIL }, email: {} }).registry)
    expect(saveAllSummary(mixed)).toEqual({ tone: "partial", text: "1 saved, 1 failed" })
  })
})

describe("runSaveAll save safeguard (D-A, spec NG-9027: one check per batch)", () => {
  const MYSELF = "/api/1h/v2/user/myself"
  const EDIT = "/api/1h/v2/user/edit"

  /** Every request as "METHOD path"; myself answers `myself` (default the page user, 42). */
  function upstream(myself: () => Response = () => HttpResponse.json({ id: 42 })): string[] {
    const log: string[] = []
    server.use(
      http.get(MYSELF, () => {
        log.push("GET myself")
        return myself()
      }),
      http.put(EDIT, async ({ request }) => {
        log.push(`PUT ${((await request.json()) as { id: string }).id}`)
        return HttpResponse.json({})
      }),
    )
    return log
  }

  /** Dirty Sections whose save is one real `callApi` PUT, mapped like a Section save. */
  function writingSections(ids: readonly SectionId[], saveAll?: false) {
    const registry = createSectionRegistry()
    for (const id of ids) {
      registry.register({
        id,
        label: LABELS[id],
        displayOrder: ORDER[id],
        isDirty: true,
        saveAll: id === "insurance" ? saveAll : undefined,
        save: async (): Promise<SaveResult> => {
          const response = await callApi("fixture/save", EDIT, { method: "PUT", body: JSON.stringify({ id }) })
          if (response.success) return OK
          const mapped = mapApiError(id, response)
          return { ok: false, error: { code: mappedErrorCode(mapped), mapped } }
        },
        discard: () => undefined,
      })
    }
    return registry
  }

  const FIVE = ["personal", "phone", "email", "social", "addresses"] as const

  it("same user: exactly one myself GET, then the five Sections' writes with no further checks", async () => {
    pageUser.pin(42)
    const log = upstream()
    const outcome = await runSaveAll(writingSections(FIVE), { order: ["personal", "email", "phone", "social", "addresses"] })
    expect(outcome.kind).toBe("done")
    expect(log).toEqual(["GET myself", "PUT personal", "PUT email", "PUT phone", "PUT social", "PUT addresses"])
    expect(pageUser.isVerified()).toBe(false)
    // After the batch, a single write checks again.
    await callApi("x", EDIT, { method: "PUT", body: JSON.stringify({ id: "after" }) })
    expect(log.slice(6)).toEqual(["GET myself", "PUT after"])
  })

  it("another user: nothing saved, the session outcome, session-expired once, no telemetry", async () => {
    pageUser.pin(42)
    const log = upstream(() => HttpResponse.json({ id: 43 }))
    const ended = vi.fn()
    const off = sessionEvents.subscribe("session-expired", ended)
    const outcome = await runSaveAll(writingSections(FIVE))
    off()
    expect(outcome).toEqual({ kind: "session", saved: [], failed: [], cancelled: [] })
    expect(saveAllSummary(outcome)).toBeNull()
    expect(log).toEqual(["GET myself"])
    expect(ended).toHaveBeenCalledTimes(1)
    expect(events).toEqual([])
  })

  it("the batch check fails: the run continues unflagged, so each write checks itself (fail closed)", async () => {
    pageUser.pin(42)
    const log = upstream(() => HttpResponse.error())
    const outcome = await runSaveAll(writingSections(["phone", "email"]))
    expect(log).toEqual(["GET myself", "GET myself", "GET myself"])
    expect(outcome).toEqual({
      kind: "done",
      saved: [],
      failed: [
        { id: "phone", label: "Phone" },
        { id: "email", label: "Email" },
      ],
      cancelled: [],
    })
  })

  it("the batch check finds the session expired: nothing saved, the session outcome at once, no telemetry", async () => {
    pageUser.pin(42)
    const log = upstream(() => HttpResponse.json({ errorCode: "TOKEN_EXPIRED", source: "proxy" }, { status: 401 }))
    server.use(http.post("/api/session/refresh", () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 })))
    const outcome = await runSaveAll(writingSections(["phone", "email"]))
    expect(outcome).toEqual({ kind: "session", saved: [], failed: [], cancelled: [] })
    expect(log).toEqual(["GET myself"])
    expect(sessionEvents.hasPublished("session-expired")).toBe(true)
    expect(events).toEqual([])
  })

  it("the batch check fails, then recovers: each write checks itself and is sent", async () => {
    pageUser.pin(42)
    let calls = 0
    const log = upstream(() => (++calls === 1 ? HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 }) : HttpResponse.json({ id: 42 })))
    expect((await runSaveAll(writingSections(["phone", "email"]))).kind).toBe("done")
    expect(log).toEqual(["GET myself", "GET myself", "PUT phone", "GET myself", "PUT email"])
  })

  it("no page user pinned yet: nothing is sent, each Section fails as a network error; once pinned, the run saves", async () => {
    const log = upstream()
    const registry = writingSections(["phone", "email"])
    expect(await runSaveAll(registry)).toEqual({
      kind: "done",
      saved: [],
      failed: [
        { id: "phone", label: "Phone" },
        { id: "email", label: "Email" },
      ],
      cancelled: [],
    })
    expect(log).toEqual([])
    pageUser.pin(42)
    expect((await runSaveAll(registry)).kind).toBe("done")
    expect(log).toEqual(["GET myself", "PUT phone", "PUT email"])
  })

  it("the leave guard's run (includeGuardOnly) checks once for the Sections and the guard-only participants", async () => {
    pageUser.pin(42)
    const log = upstream()
    await runSaveAll(writingSections(["phone", "insurance"], false), { includeGuardOnly: true, trackTelemetry: false })
    expect(log).toEqual(["GET myself", "PUT phone", "PUT insurance"])
  })

  it("nothing that can save is dirty: no check", async () => {
    pageUser.pin(42)
    const log = upstream()
    const registry = createSectionRegistry()
    registry.register({ id: "insurance", label: "Insurance", displayOrder: 6, isDirty: true, discard: () => undefined })
    await runSaveAll(registry, { includeGuardOnly: true })
    expect(log).toEqual([])
  })

  it("an invalid Section: nothing validated past, no check", async () => {
    pageUser.pin(42)
    const log = upstream()
    const { registry } = setup({ phone: { invalid: 1 } })
    expect((await runSaveAll(registry)).kind).toBe("invalid")
    expect(log).toEqual([])
  })
})
