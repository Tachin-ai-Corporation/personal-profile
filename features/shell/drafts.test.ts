import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setTelemetrySink } from "@/lib/shared/telemetry"
import {
  DRAFT_DEBOUNCE_MS,
  DRAFT_MAX_AGE_MS,
  allowedDraftFields,
  createDraftController,
  createDraftStore,
  defaultDraftDiff,
  draftKey,
  hashDraftBase,
  isDeniedDraftField,
  stableStringify,
  type DraftController,
  type DraftOwner,
  type DraftStore,
} from "./drafts"
import type { DraftValues, SectionRegistration } from "./nav-types"
import { createSectionRegistry, type SectionRegistry } from "./section-registry"

const NOW = 1_760_000_000_000
const sha = (text: string): string => createHash("sha256").update(text).digest("hex")
const own = (userId = 42, environment: DraftOwner["environment"] = "demo"): DraftOwner => ({ environment, userId })
const OK_CONTRACT = { savesAll: true, describes: true }

/** A Storage whose every method throws (private mode, blocked site data). */
const throwingStorage = (): Storage =>
  new Proxy({} as Storage, {
    get() {
      throw new Error("SecurityError")
    },
  })

let tracked: [string, unknown][] = []
let restoreSink = (): void => undefined
beforeEach(() => {
  window.localStorage.clear()
  tracked = []
  restoreSink = setTelemetrySink((event, payload) => void tracked.push([event, payload]))
})
afterEach(() => restoreSink())

describe("draftKey, stableStringify, hashDraftBase", () => {
  it("keys drafts as pp:draft:v1:<environment>:<userId>:<sectionId>", () => {
    expect(draftKey(own(), "phone")).toBe("pp:draft:v1:demo:42:phone")
    expect(draftKey(own(42, "prod"), "account")).toBe("pp:draft:v1:prod:42:account")
  })

  it("sorts object keys at every depth and keeps array order", () => {
    expect(stableStringify({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}')
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })

  it("hashes the sorted-key JSON with SHA-256 (hex), stable across key order", async () => {
    const hash = await hashDraftBase({ number: "4155512125", note: "" })
    expect(hash).toBe(sha('{"note":"","number":"4155512125"}'))
    expect(await hashDraftBase({ note: "", number: "4155512125" })).toBe(hash)
    expect(await hashDraftBase({ note: "x", number: "4155512125" })).not.toBe(hash)
  })
})

describe("allowedDraftFields (denylist)", () => {
  it("passes ordinary fields through and returns [] for none", () => {
    expect(allowedDraftFields("personal", ["firstName", "lastName"], OK_CONTRACT)).toEqual(["firstName", "lastName"])
    expect(allowedDraftFields("personal", undefined, OK_CONTRACT)).toEqual([])
    expect(allowedDraftFields("insurance", [], { savesAll: false, describes: false })).toEqual([])
  })

  it.each(["ssn", "socialSecurityNumber", "signature", "signatureFile", "code", "mfaCode", "qrCode", "providerNpiId", "practiceNpiId", "npi", "username", "password", "SSN", "SocialSecurityNumber", "NPI", "Password"])(
    "throws in development on the denylisted %s (any case)",
    (field) => {
      expect(isDeniedDraftField(field)).toBe(true)
      expect(() => allowedDraftFields("personal", ["firstName", field], OK_CONTRACT)).toThrow(/denylisted draft fields/)
    },
  )

  it("throws in development on draft fields of a guard-only Section, or without describeDraftDiff", () => {
    expect(() => allowedDraftFields("insurance", ["insurer"], { savesAll: false, describes: true })).toThrow(/guard-only/)
    expect(() => allowedDraftFields("personal", ["firstName"], { savesAll: true, describes: false })).toThrow(/describeDraftDiff/)
  })

  it("drops them in production, with PHI-free telemetry (counts, never names)", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(allowedDraftFields("personal", ["firstName", "SSN", "signature"], { savesAll: true, describes: false })).toEqual(["firstName"])
    expect(allowedDraftFields("insurance", ["insurer"], { savesAll: false, describes: true })).toEqual([])
    expect(allowedDraftFields("phone", ["number"], OK_CONTRACT)).toEqual(["number"])
    expect(tracked).toEqual([
      ["draft_fields_dropped", { sectionId: "personal", count: 2, reason: "denylisted" }],
      ["draft_fields_dropped", { sectionId: "insurance", count: 1, reason: "guardOnly" }],
    ])
  })
})

describe("createDraftStore", () => {
  let now = NOW
  let store: DraftStore
  beforeEach(() => {
    now = NOW
    store = createDraftStore({ now: () => now })
  })

  it("writes JSON { savedAt, baseHash, values } under the key and reads it back; owners are per environment", () => {
    store.write(own(), "phone", { baseHash: "abc", values: { number: "1" } })
    expect(JSON.parse(window.localStorage.getItem("pp:draft:v1:demo:42:phone") ?? "")).toEqual({ savedAt: NOW, baseHash: "abc", values: { number: "1" } })
    expect(store.read(own(), "phone")).toEqual({ savedAt: NOW, baseHash: "abc", values: { number: "1" } })
    expect(store.read(own(7), "phone")).toBeNull()
    expect(store.read(own(42, "prod"), "phone")).toBeNull()
  })

  it("deletes a draft older than 24 h, or one that isn't a draft, when read", () => {
    store.write(own(), "phone", { baseHash: "abc", values: {} })
    now = NOW + DRAFT_MAX_AGE_MS
    expect(store.read(own(), "phone")).not.toBeNull()
    now = NOW + DRAFT_MAX_AGE_MS + 1
    expect(store.read(own(), "phone")).toBeNull()
    expect(window.localStorage.length).toBe(0)
    now = NOW
    for (const raw of ["{", "null", "[]", '{"savedAt":"x","baseHash":"a","values":{}}', `{"savedAt":${NOW},"baseHash":1,"values":{}}`, `{"savedAt":${NOW},"baseHash":"a","values":[]}`]) {
      window.localStorage.setItem("pp:draft:v1:demo:42:email", raw)
      expect(store.read(own(), "email"), raw).toBeNull()
      expect(window.localStorage.length, raw).toBe(0)
    }
  })

  it("removes one key", () => {
    store.write(own(), "phone", { baseHash: "a", values: {} })
    store.remove(own(), "phone")
    expect(window.localStorage.length).toBe(0)
  })

  it("purgeUser deletes only the current user's drafts in the current environment", () => {
    store.write(own(), "phone", { baseHash: "a", values: {} })
    store.write(own(), "account", { baseHash: "a", values: {} })
    store.write(own(420), "phone", { baseHash: "a", values: {} })
    store.write(own(42, "prod"), "phone", { baseHash: "a", values: {} })
    window.localStorage.setItem("pp:login-intent", "/")
    store.purgeUser(own())
    expect(Object.keys(window.localStorage).toSorted()).toEqual(["pp:draft:v1:demo:420:phone", "pp:draft:v1:prod:42:phone", "pp:login-intent"])
  })

  it("purgeStale deletes drafts older than 24 h, unparsable, not v1 or without a known environment; keeps fresh ones and other keys", () => {
    store.write(own(), "phone", { baseHash: "a", values: {} })
    store.write(own(7, "prod"), "email", { baseHash: "a", values: {} })
    now = NOW - 1
    store.write(own(7), "personal", { baseHash: "a", values: {} })
    const fresh = JSON.stringify({ savedAt: NOW, baseHash: "a", values: {} })
    window.localStorage.setItem("pp:draft:v1:demo:7:social", "not json")
    window.localStorage.setItem("pp:draft:v0:demo:42:phone", fresh)
    window.localStorage.setItem("pp:draft:v1:42:phone", fresh)
    window.localStorage.setItem("pp:draft:", "x")
    window.localStorage.setItem("other", "kept")
    now = NOW + DRAFT_MAX_AGE_MS
    store.purgeStale()
    expect(Object.keys(window.localStorage).toSorted()).toEqual(["other", "pp:draft:v1:demo:42:phone", "pp:draft:v1:prod:7:email"])
  })

  it("swallows every storage failure: missing, throwing accessor, throwing methods, quota", () => {
    for (const storage of [() => null, () => throwingStorage(), () => { throw new Error("SecurityError") }]) {
      const broken = createDraftStore({ storage })
      expect(() => broken.write(own(), "phone", { baseHash: "a", values: {} })).not.toThrow()
      expect(broken.read(own(), "phone")).toBeNull()
      expect(() => broken.remove(own(), "phone")).not.toThrow()
      expect(() => broken.purgeUser(own())).not.toThrow()
      expect(() => broken.purgeStale()).not.toThrow()
    }
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(() => createDraftStore().write(own(), "phone", { baseHash: "a", values: {} })).not.toThrow()
  })

  it("swallows a throwing localStorage accessor", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError")
    })
    expect(createDraftStore().read(own(), "phone")).toBeNull()
  })

  it("uses no storage without a window", () => {
    vi.stubGlobal("window", undefined)
    expect(createDraftStore().read(own(), "phone")).toBeNull()
  })
})

describe("defaultDraftDiff (production fallback)", () => {
  it("names fields from their keys and shows readable values (empty for null or undefined)", () => {
    expect(
      defaultDraftDiff(
        { firstName: "x", same: "s", city_of_birth: null, tags: ["a", null, { label: "b" }], count: 3 },
        { firstName: "y", same: "s", city_of_birth: "z", tags: undefined, count: 4 },
      ),
    ).toEqual([
      { field: "firstName", label: "First name", mine: "x", current: "y" },
      { field: "city_of_birth", label: "City of birth", mine: "", current: "z" },
      { field: "tags", label: "Tags", mine: "a, b", current: "" },
      { field: "count", label: "Count", mine: "3", current: "4" },
    ])
  })
})

/** A mutable Section on a real registry, driven like `useRegisterSection`. */
interface FakeSection {
  values: DraftValues
  base: DraftValues
  isDirty: boolean
  userChanged?: boolean
  dataStatus?: "loading" | "loaded" | "error"
  accept: boolean
  readonly applied: DraftValues[]
  update(patch?: Partial<Pick<FakeSection, "values" | "base" | "isDirty" | "userChanged" | "dataStatus" | "accept">>): void
  unregister(): void
}

function fakeSection(registry: SectionRegistry, overrides: Partial<SectionRegistration> = {}): FakeSection {
  const section: FakeSection = {
    values: { number: "1", note: "" },
    base: { number: "1", note: "" },
    isDirty: false,
    dataStatus: "loaded",
    accept: true,
    applied: [],
    update(patch = {}) {
      Object.assign(section, patch)
      registry.update(registration())
    },
    unregister: () => undefined,
  }
  const registration = (): SectionRegistration => ({
    id: "phone",
    label: "Phone",
    displayOrder: 2,
    isDirty: section.isDirty,
    userChanged: section.userChanged,
    dataStatus: section.dataStatus,
    save: async () => ({ ok: true }),
    discard: () => undefined,
    draftFields: ["number", "note"],
    getDraftValues: () => ({ ...section.values, extra: "never stored" }),
    getDraftBase: () => section.base,
    applyDraft: (values) => {
      if (!section.accept) return false
      section.applied.push(values)
      return true
    },
    describeDraftDiff: (draft, current) =>
      ["number", "note"].filter((field) => draft[field] !== current[field]).map((field) => ({ field, label: field, mine: String(draft[field]), current: String(current[field]) })),
    ...overrides,
  })
  section.unregister = registry.register(registration())
  return section
}

const microtasks = async (): Promise<void> => {
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
}

describe("createDraftController", () => {
  let registry: SectionRegistry
  let controller: DraftController
  let now = NOW
  const store = createDraftStore({ now: () => now })
  const hash = async (base: DraftValues): Promise<string> => `h:${stableStringify(base)}`
  const stored = (owner = own()) => JSON.parse(window.localStorage.getItem(draftKey(owner, "phone")) ?? "null") as unknown

  function start(owner: DraftOwner | null = own(), deps: Partial<Parameters<typeof createDraftController>[0]> = {}): void {
    controller = createDraftController({ store, registry, hash, ...deps })
    registry.observe((event) => controller.handle(event))
    controller.setOwner(owner)
  }

  /** A registry view that can pretend a Section is gone. */
  function vanishing(): { readonly view: Pick<SectionRegistry, "getAll" | "get">; hide(): void } {
    let hidden = false
    return {
      view: { getAll: () => (hidden ? [] : registry.getAll()), get: (id) => (hidden ? undefined : registry.get(id)) },
      hide: () => {
        hidden = true
      },
    }
  }

  const write = (base: DraftValues, values: DraftValues, owner = own()) =>
    window.localStorage.setItem(draftKey(owner, "phone"), JSON.stringify({ savedAt: NOW, baseHash: `h:${stableStringify(base)}`, values }))

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    now = NOW
    registry = createSectionRegistry()
  })
  afterEach(() => {
    controller.dispose()
    vi.useRealTimers()
  })

  it("writes 500 ms after the last user change (not at 499), only the draft fields, with the base hash", async () => {
    const section = fakeSection(registry)
    start()
    await microtasks()
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS - 1)
    section.update({ values: { number: "23", note: "" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS - 1)
    expect(stored()).toBeNull()
    // A re-render with the same values doesn't restart the debounce.
    section.update()
    vi.advanceTimersByTime(1)
    expect(stored()).toEqual({ savedAt: NOW, baseHash: 'h:{"note":"","number":"1"}', values: { number: "23", note: "" } })
  })

  it("deletes the key when the Section turns clean again", async () => {
    const section = fakeSection(registry)
    start()
    await microtasks()
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    expect(stored()).not.toBeNull()
    section.update({ isDirty: false, values: section.base })
    expect(stored()).toBeNull()
  })

  it("writes nothing for a Section dirty only through preset defaults; deletes the key when the user's change is gone but presets keep it dirty", async () => {
    const section = fakeSection(registry)
    start()
    await microtasks()
    section.update({ isDirty: true, userChanged: false, values: { number: "1", note: "preset" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    controller.flush()
    expect(stored()).toBeNull()
    section.update({ userChanged: true, values: { number: "2", note: "preset" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    expect(stored()).toMatchObject({ values: { number: "2", note: "preset" } })
    // The user reverted their edit; the preset keeps the Section dirty.
    section.update({ userChanged: false, values: { number: "1", note: "preset" } })
    expect(stored()).toBeNull()
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    controller.flush()
    expect(stored()).toBeNull()
  })

  it("writes nothing before the owner is known", async () => {
    const section = fakeSection(registry)
    start(null)
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    controller.flush()
    controller.purgeUser()
    expect(window.localStorage.length).toBe(0)
  })

  it("flush writes every dirty draftable Section synchronously and cancels the debounce", async () => {
    const section = fakeSection(registry)
    start()
    await microtasks()
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    controller.flush()
    expect(stored()).toMatchObject({ values: { number: "2", note: "" } })
    window.localStorage.clear()
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    expect(stored()).toBeNull()
  })

  it("flush never hashes: with the hash pending the write waits for it (not lost)", async () => {
    let release: (value: string) => void = () => undefined
    const section = fakeSection(registry)
    start(own(), { hash: () => new Promise<string>((resolve) => (release = resolve)) })
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    controller.flush()
    expect(stored()).toBeNull()
    release("late")
    await microtasks()
    expect(stored()).toMatchObject({ baseHash: "late", values: { number: "2", note: "" } })
  })

  it.each(["unregister", "dispose"] as const)("finishes a captured dirty draft after %s while its hash is pending", async (detach) => {
    let release: (value: string) => void = () => undefined
    const section = fakeSection(registry)
    start(own(), { hash: () => new Promise<string>((resolve) => { release = resolve }) })
    section.update({ isDirty: true, values: { number: "2", note: [{ deep: { SSN: "123-45-6789" } }] } })
    if (detach === "unregister") section.unregister()
    else { controller.flush(); controller.dispose() }
    // Form objects may be reused after React unmount; the captured edit must not change.
    section.values = { number: "later", note: "later" }
    release("captured-base")
    await microtasks()
    expect(stored()).toEqual({ savedAt: NOW, baseHash: "captured-base", values: { number: "2" } })
    expect(JSON.stringify(stored())).not.toContain("6789")
  })

  it("captures nested allowed values before an unmounted form can mutate them", async () => {
    let release: (value: string) => void = () => undefined
    const section = fakeSection(registry)
    start(own(), { hash: () => new Promise<string>((resolve) => { release = resolve }) })
    const note = [{ label: "original" }]
    section.update({ isDirty: true, values: { number: "2", note } })
    section.unregister()
    note[0].label = "later"
    release("base")
    await microtasks()
    expect(stored()).toMatchObject({ values: { number: "2", note: [{ label: "original" }] } })
  })

  it.each([
    ["saved", false], ["discarded", false], ["drop", false], ["purge", false], ["owner", false],
    ["saved", true], ["discarded", true], ["drop", true], ["purge", true], ["owner", true],
  ] as const)("cancels a captured hash-pending draft on %s (detached=%s)", async (cancel, detached) => {
    let release: (value: string) => void = () => undefined
    const section = fakeSection(registry)
    start(own(), { hash: () => new Promise<string>((resolve) => { release = resolve }) })
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    controller.flush()
    const finishHash = release
    if (detached) { section.unregister(); controller.dispose() }
    if (cancel === "saved" || cancel === "discarded") registry.report({ type: cancel, id: "phone" })
    else if (cancel === "drop") controller.drop("phone")
    else if (cancel === "purge") controller.purgeUser()
    else controller.setOwner(own(43))
    finishHash("late")
    await microtasks()
    expect(stored()).toBeNull()
    expect(stored(own(43))).toBeNull()
  })

  it("a newer edit cancels an older pending snapshot before the new debounce expires", async () => {
    let release: (value: string) => void = () => undefined
    const section = fakeSection(registry)
    start(own(), { hash: () => new Promise<string>((resolve) => { release = resolve }) })
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    controller.flush()
    section.update({ values: { number: "3", note: "" } })
    release("base")
    await microtasks()
    expect(stored()).toBeNull()
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    expect(stored()).toMatchObject({ values: { number: "3", note: "" } })
  })

  it.each(["same controller", "new controller"] as const)("a remount through %s supersedes a detached pending draft", async (remount) => {
    const releases: ((value: string) => void)[] = []
    const section = fakeSection(registry)
    start(own(), { hash: () => new Promise<string>((resolve) => { releases.push(resolve) }) })
    section.update({ isDirty: true, values: { number: "old", note: "" } })
    section.unregister()
    const previous = controller
    if (remount === "new controller") {
      previous.dispose()
      registry = createSectionRegistry()
      start()
    }
    const replacement = fakeSection(registry)
    replacement.update({ isDirty: true, values: { number: "new", note: "" } })
    await microtasks()
    controller.flush()
    if (remount === "same controller") releases[1]("new-base")
    releases[0]("old-base")
    await microtasks()
    expect(stored()).toMatchObject({ values: { number: "new", note: "" } })
  })

  it("an older mounted controller cannot overwrite or remove a newer controller's draft", async () => {
    const olderSection = fakeSection(registry)
    const older = createDraftController({ store, registry, hash })
    controller = older
    registry.observe((event) => older.handle(event))
    older.setOwner(own())
    await microtasks()
    olderSection.update({ isDirty: true, values: { number: "old", note: "" } })
    older.flush()
    registry = createSectionRegistry()
    const newerSection = fakeSection(registry)
    start()
    await microtasks()
    newerSection.update({ isDirty: true, values: { number: "new", note: "" } })
    controller.flush()
    olderSection.update({ values: { number: "stale", note: "" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    older.drop("phone")
    olderSection.unregister()
    older.drop("phone")
    older.setOwner(null)
    older.dispose()
    expect(stored()).toMatchObject({ values: { number: "new", note: "" } })
  })

  it("a rejected detached hash writes nothing", async () => {
    let reject: (reason: Error) => void = () => undefined
    const section = fakeSection(registry)
    start(own(), { hash: () => new Promise<string>((_resolve, fail) => { reject = fail }) })
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    section.unregister()
    reject(new Error("unavailable digest"))
    await microtasks()
    expect(stored()).toBeNull()
  })

  it("a debounced write also waits for a pending hash", async () => {
    let release: (value: string) => void = () => undefined
    const section = fakeSection(registry)
    start(own(), { hash: () => new Promise<string>((resolve) => (release = resolve)) })
    section.update({ isDirty: true, values: { number: "3", note: "" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    expect(stored()).toBeNull()
    release("late")
    await microtasks()
    expect(stored()).toMatchObject({ baseHash: "late", values: { number: "3", note: "" } })
  })

  it("ignores a hash that resolves after the base changed, the owner changed or the controller was disposed", async () => {
    const resolvers: ((value: string) => void)[] = []
    const section = fakeSection(registry)
    start(own(), { hash: () => new Promise<string>((resolve) => resolvers.push(resolve)) })
    section.update({ base: { number: "9", note: "" } })
    resolvers[0]("stale")
    await microtasks()
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    controller.flush()
    expect(stored()).toBeNull()
    controller.setOwner(own(43))
    resolvers[1]("old user")
    await microtasks()
    expect(stored()).toBeNull()
    controller.dispose()
    resolvers[2]("disposed")
    await microtasks()
    expect(window.localStorage.length).toBe(0)
  })

  it("survives a rejected hash", async () => {
    const section = fakeSection(registry)
    start(own(), { hash: () => Promise.reject(new Error("no subtle")) })
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    await microtasks()
    expect(() => controller.flush()).not.toThrow()
    expect(stored()).toBeNull()
  })

  it("dispose stops writing; revive (StrictMode re-run) re-hashes and writes again", async () => {
    const section = fakeSection(registry)
    start()
    await microtasks()
    controller.dispose()
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    controller.flush()
    expect(stored()).toBeNull()
    controller.revive()
    controller.revive()
    await microtasks()
    controller.flush()
    expect(stored()).toMatchObject({ values: { number: "2", note: "" } })
  })

  it("drops a draft field whose value holds a denylisted key at any depth (with telemetry)", async () => {
    const section = fakeSection(registry)
    start()
    await microtasks()
    section.update({ isDirty: true, values: { number: "2", note: [{ deep: { SSN: "123-45-6789" } }] } })
    controller.flush()
    expect(stored()).toMatchObject({ values: { number: "2" } })
    expect(JSON.stringify(stored())).not.toContain("6789")
    expect(tracked).toContainEqual(["draft_fields_dropped", { sectionId: "phone", count: 1, reason: "nestedDenylisted" }])
  })

  it("never drafts a guard-only participant (Insurance), a Section without draft fields or without applyDraft", async () => {
    registry.register({ id: "insurance", label: "Insurance", displayOrder: 6, isDirty: true, saveAll: false, discard: () => undefined, save: async () => ({ ok: true }) })
    registry.register({ id: "email", label: "Email", displayOrder: 3, isDirty: true, discard: () => undefined, save: async () => ({ ok: true }) })
    write({ number: "1", note: "" }, { number: "2", note: "" })
    fakeSection(registry, { isDirty: true, applyDraft: undefined })
    start()
    await microtasks()
    expect(controller.offerFor("phone")).toEqual({ kind: "none" })
    window.localStorage.clear()
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    controller.flush()
    // Saved/discarded of a Section the controller doesn't track create nothing.
    registry.report({ type: "saved", id: "email" })
    expect(window.localStorage.length).toBe(0)
    expect(controller.offerFor("insurance")).toEqual({ kind: "none" })
  })

  it("deletes the key on saved and discarded events and on drop", async () => {
    const section = fakeSection(registry)
    start()
    await microtasks()
    let round = 0
    for (const finish of [
      () => registry.report({ type: "saved", id: "phone" }),
      () => registry.report({ type: "discarded", id: "phone" }),
      () => controller.drop("phone"),
    ]) {
      round += 1
      section.update({ isDirty: true, values: { number: String(round), note: "" } })
      controller.flush()
      expect(stored()).not.toBeNull()
      finish()
      expect(stored()).toBeNull()
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
      expect(stored()).toBeNull()
      section.update({ isDirty: false })
    }
    controller.drop("email")
  })

  it("after saved, a stale still-dirty update writes nothing until the Section reports clean", async () => {
    const section = fakeSection(registry)
    start()
    await microtasks()
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    registry.report({ type: "saved", id: "phone" })
    // The registration from before the re-render: still dirty, new values.
    section.update({ values: { number: "3", note: "" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    controller.flush()
    expect(stored()).toBeNull()
    // The re-render reports clean: the next edit writes again.
    section.update({ isDirty: false })
    section.update({ isDirty: true, values: { number: "4", note: "" } })
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    expect(stored()).toMatchObject({ values: { number: "4", note: "" } })
  })

  it("writes an unmounting dirty Section at once; forgets it", async () => {
    const section = fakeSection(registry)
    start()
    await microtasks()
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    section.unregister()
    expect(stored()).toMatchObject({ values: { number: "2", note: "" } })
    window.localStorage.clear()
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    expect(stored()).toBeNull()
    expect(controller.offerFor("phone")).toEqual({ kind: "none" })
    controller.handle({ type: "unregistered", id: "social" })
  })

  it("a debounced write is dropped when the Section is gone when it fires", async () => {
    const section = fakeSection(registry)
    const gone = vanishing()
    start(own(), { registry: gone.view })
    await microtasks()
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    gone.hide()
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    expect(stored()).toBeNull()
  })

  it("purgeUser deletes only this owner's drafts and blocks any later write (timer, flush)", async () => {
    store.write(own(7), "phone", { baseHash: "a", values: {} })
    const section = fakeSection(registry)
    start()
    await microtasks()
    section.update({ isDirty: true, values: { number: "2", note: "" } })
    controller.flush()
    section.update({ values: { number: "3", note: "" } })
    controller.purgeUser()
    expect(stored()).toBeNull()
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
    controller.flush()
    section.unregister()
    expect(Object.keys(window.localStorage)).toEqual(["pp:draft:v1:demo:7:phone"])
  })

  describe("offers", () => {
    it("offers restore when the current base hashes to the draft's baseHash; apply restores the draft fields only", async () => {
      write({ number: "1", note: "" }, { number: "2", note: "n", ssn: "123" })
      const section = fakeSection(registry)
      start()
      const listener = vi.fn()
      controller.subscribe(listener)
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "restore" })
      expect(listener).toHaveBeenCalled()
      controller.apply("phone")
      expect(section.applied).toEqual([{ number: "2", note: "n" }])
      expect(controller.offerFor("phone")).toEqual({ kind: "none" })
      // The stored key stays until the restored edit is written again (or saved/discarded).
      expect(stored()).not.toBeNull()
      controller.apply("phone")
      expect(section.applied).toHaveLength(1)
    })

    it("a refused apply (e.g. while saving) keeps the offer", async () => {
      write({ number: "1", note: "" }, { number: "2", note: "" })
      const section = fakeSection(registry)
      start()
      await microtasks()
      section.accept = false
      controller.apply("phone")
      expect(controller.offerFor("phone")).toEqual({ kind: "restore" })
      section.accept = true
      controller.apply("phone")
      expect(section.applied).toEqual([{ number: "2", note: "" }])
    })

    it("offers a conflict with the Section's rows when the base changed; the rows follow later base changes", async () => {
      write({ number: "0", note: "" }, { number: "2", note: "" })
      const section = fakeSection(registry)
      start()
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "conflict", rows: [{ field: "number", label: "number", mine: "2", current: "1" }] })
      const first = controller.offerFor("phone")
      // Same rows: the same offer object (no re-render).
      section.update()
      expect(controller.offerFor("phone")).toBe(first)
      section.update({ base: { number: "5", note: "" } })
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "conflict", rows: [{ field: "number", label: "number", mine: "2", current: "5" }] })
      // Back to the draft's base: restore.
      section.update({ base: { number: "0", note: "" } })
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "restore" })
    })

    it("drops a conflict whose compare has no rows (the draft equals the current data)", async () => {
      write({ number: "0", note: "" }, { number: "1", note: "" })
      fakeSection(registry)
      start()
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "none" })
      expect(stored()).toBeNull()
    })

    it("uses the readable default compare in production without describeDraftDiff", async () => {
      vi.stubEnv("NODE_ENV", "production")
      write({ number: "0", note: "" }, { number: "2", note: "" })
      fakeSection(registry, { describeDraftDiff: undefined })
      start()
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "conflict", rows: [{ field: "number", label: "Number", mine: "2", current: "1" }] })
    })

    it("offers nothing while loading or after a read error, keeps the draft, and offers once loaded", async () => {
      write({ number: "1", note: "" }, { number: "2", note: "" })
      const section = fakeSection(registry)
      section.update({ dataStatus: "loading" })
      start()
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "none" })
      section.update({ dataStatus: "error" })
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "none" })
      expect(stored()).not.toBeNull()
      section.update({ dataStatus: "loaded" })
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "restore" })
    })

    it("never offers another user's or environment's draft, nor an expired one, and leaves others alone", async () => {
      write({ number: "1", note: "" }, { number: "2", note: "" }, own(7))
      write({ number: "1", note: "" }, { number: "2", note: "" }, own(42, "prod"))
      fakeSection(registry)
      start()
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "none" })
      expect(stored(own(7))).not.toBeNull()
      expect(stored(own(42, "prod"))).not.toBeNull()
      write({ number: "1", note: "" }, { number: "2", note: "" })
      now = NOW + DRAFT_MAX_AGE_MS + 1
      controller.setOwner(null)
      controller.setOwner(own())
      await microtasks()
      expect(controller.offerFor("phone")).toEqual({ kind: "none" })
    })

    it("a user change before choosing supersedes the offer; the new edit becomes the draft", async () => {
      write({ number: "1", note: "" }, { number: "2", note: "" })
      const section = fakeSection(registry)
      start()
      await microtasks()
      expect(controller.offerFor("phone").kind).toBe("restore")
      section.update({ isDirty: true, values: { number: "7", note: "" } })
      expect(controller.offerFor("phone")).toEqual({ kind: "none" })
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS)
      expect(stored()).toMatchObject({ values: { number: "7", note: "" } })
    })

    it("drop deletes the draft and the offer", async () => {
      write({ number: "0", note: "" }, { number: "2", note: "" })
      fakeSection(registry)
      start()
      await microtasks()
      controller.drop("phone")
      expect(controller.offerFor("phone")).toEqual({ kind: "none" })
      expect(stored()).toBeNull()
    })

    it("cross-page invalidation through myself: a shared field saved elsewhere turns a restore into a conflict", async () => {
      // Page A (e.g. /account) wrote the draft over myself's phone number…
      write({ number: "1", note: "" }, { number: "2", note: "" })
      // …page B saved the shared field, so myself now carries another value: the base hash differs.
      const section = fakeSection(registry)
      section.update({ base: { number: "8", note: "" } })
      start()
      await microtasks()
      expect(controller.offerFor("phone").kind).toBe("conflict")
    })
  })

  it("tolerates a Section without value hooks and events before the owner", async () => {
    registry.register({
      id: "phone",
      label: "Phone",
      displayOrder: 2,
      isDirty: true,
      draftFields: ["number"],
      save: async () => ({ ok: true }),
      discard: () => undefined,
      applyDraft: () => true,
      describeDraftDiff: () => [],
    })
    start(null)
    registry.report({ type: "saved", id: "phone" })
    controller.handle({ type: "updated", id: "email" })
    controller.setOwner(own())
    await microtasks()
    controller.flush()
    expect(stored()).toEqual({ savedAt: NOW, baseHash: "h:{}", values: {} })
  })

  it("drops a hash result for a Section that was unregistered meanwhile", async () => {
    let release: (value: string) => void = () => undefined
    fakeSection(registry)
    const gone = vanishing()
    start(own(), { registry: gone.view, hash: () => new Promise<string>((resolve) => (release = resolve)) })
    gone.hide()
    release("late")
    await microtasks()
    expect(controller.offerFor("phone")).toEqual({ kind: "none" })
  })

  it("setOwner with the same owner does nothing; unsubscribe stops notifications", () => {
    start()
    const listener = vi.fn()
    const off = controller.subscribe(listener)
    controller.setOwner(own())
    expect(listener).not.toHaveBeenCalled()
    off()
    controller.setOwner(own(43))
    expect(listener).not.toHaveBeenCalled()
  })
})
