/**
 * Drafts (Story 1.15, AD-12, spec F4): unsaved Section edits kept in
 * `localStorage` across an expired session, offered back after a relaunch.
 *
 * - Key `pp:draft:v1:<environment>:<userId>:<sectionId>` (demo and prod share
 *   the app origin and their user ids can collide), value
 *   `{ savedAt, baseHash, values }` with only the Section's `draftFields`
 *   (never a denylisted field, at any depth).
 * - Only this module reads, writes and deletes draft keys; Sections never
 *   touch storage. Every storage failure is swallowed: editing and saving
 *   keep working.
 * - `baseHash` is the SHA-256 hex of the sorted-key JSON of the Section's
 *   `getDraftBase()` (the server values of its draft fields). It is computed
 *   and cached whenever that base changes, because the session-expired flush
 *   is synchronous and never hashes.
 * - Multi-tab is last-writer-wins on one key: there is no `storage`-event sync.
 */

import { deepEqual } from "@/lib/shared/deep-equal"
import { isProductionBuild } from "@/lib/shared/app-env"
import { isEnvironment, type Environment } from "@/lib/shared/environments"
import { telemetry, type TelemetryEvents } from "@/lib/shared/telemetry"
import type { DraftDiffRow, DraftValues, SectionEvent, SectionId } from "./nav-types"
import type { RegisteredSection, SectionRegistry } from "./section-registry"

export const DRAFT_KEY_PREFIX = "pp:draft:"
export const DRAFT_VERSION = "v1"
/** A draft is written this long after the last user change. */
export const DRAFT_DEBOUNCE_MS = 500
/** Older drafts are purged on shell mount and when read. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Fields no draft may ever hold (FR2, NFR1; Story 7.5 adds username and password). Matched case-insensitively. */
export const DRAFT_DENYLIST: ReadonlySet<string> = new Set([
  "ssn",
  "socialSecurityNumber",
  "signature",
  "signatureFile",
  "code",
  "mfaCode",
  "qrCode",
  "providerNpiId",
  "practiceNpiId",
  "npi",
  "username",
  "password",
])

const DENIED = new Set([...DRAFT_DENYLIST].map((name) => name.toLowerCase()))

/** Whether a field name is denylisted (any case). */
export function isDeniedDraftField(name: string): boolean {
  return DENIED.has(name.toLowerCase())
}

/** Whether a value holds a denylisted key at any depth (objects and arrays). */
function holdsDeniedKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(holdsDeniedKey)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, item]) => isDeniedDraftField(key) || holdsDeniedKey(item))
}

/** Whose drafts: the session's environment and the Launching user (`myself.id`). */
export interface DraftOwner {
  readonly environment: Environment
  readonly userId: number
}

/** One stored draft. */
export interface StoredDraft {
  /** Epoch ms of the write. */
  readonly savedAt: number
  readonly baseHash: string
  readonly values: DraftValues
}

function ownerPrefix(owner: DraftOwner): string {
  return `${DRAFT_KEY_PREFIX}${DRAFT_VERSION}:${owner.environment}:${owner.userId}:`
}

export function draftKey(owner: DraftOwner, sectionId: SectionId): string {
  return `${ownerPrefix(owner)}${sectionId}`
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** JSON with every object's keys sorted (arrays keep their order), so equal values hash equally. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, raw: unknown) =>
    isRecord(raw) ? Object.fromEntries(Object.keys(raw).toSorted().map((key) => [key, raw[key]])) : raw,
  )
}

/** SHA-256 hex of the sorted-key JSON of a Section's draft base. */
export async function hashDraftBase(base: DraftValues): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableStringify(base)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

type DropReason = TelemetryEvents["draft_fields_dropped"]["reason"]

function reportDropped(sectionId: SectionId, count: number, reason: DropReason): void {
  if (count > 0) telemetry.track("draft_fields_dropped", { sectionId, count, reason })
}

export interface DraftContract {
  /** Save all saves the Section (not a guard-only participant). */
  readonly savesAll: boolean
  /** The Section supplies `describeDraftDiff`. */
  readonly describes: boolean
}

/**
 * The draft fields a registration may keep. In development a denylisted
 * field (any case), any draft field of a Section Save all doesn't save
 * (guard-only, e.g. Insurance) or draft fields without `describeDraftDiff`
 * throw; in production the first two are dropped (with PHI-free telemetry)
 * and the compare falls back to `defaultDraftDiff`.
 */
export function allowedDraftFields(sectionId: SectionId, fields: readonly string[] | undefined, contract: DraftContract): readonly string[] {
  if (!fields || fields.length === 0) return []
  const denied = fields.filter(isDeniedDraftField)
  if (!isProductionBuild()) {
    if (denied.length > 0) throw new Error(`Section "${sectionId}" registers denylisted draft fields: ${denied.join(", ")}`)
    if (!contract.savesAll) throw new Error(`Section "${sectionId}" is guard-only (saveAll: false) and can't keep a draft`)
    if (!contract.describes) throw new Error(`Section "${sectionId}" keeps a draft without describeDraftDiff`)
  }
  if (!contract.savesAll) {
    reportDropped(sectionId, fields.length, "guardOnly")
    return []
  }
  reportDropped(sectionId, denied.length, "denylisted")
  return fields.filter((field) => !isDeniedDraftField(field))
}

/** Only the allowed fields of a values object. */
function pickFields(values: DraftValues, fields: readonly string[]): DraftValues {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(values, field)).map((field) => [field, values[field]]))
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

/** A parsed draft, or `null` when the value isn't one (any shape problem). */
function parseDraft(raw: string | null): StoredDraft | null {
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const { savedAt, baseHash, values } = parsed
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null
  if (typeof baseHash !== "string" || !isRecord(values)) return null
  return { savedAt, baseHash, values }
}

export interface DraftStore {
  /** This owner's non-expired draft of a Section; an expired or unreadable value is deleted and reads `null`. */
  read(owner: DraftOwner, sectionId: SectionId): StoredDraft | null
  write(owner: DraftOwner, sectionId: SectionId, draft: Omit<StoredDraft, "savedAt">): void
  remove(owner: DraftOwner, sectionId: SectionId): void
  /** Deletes every `pp:draft:v1:<environment>:<userId>:*` key (portal exit only, via `onBeforeExit`). */
  purgeUser(owner: DraftOwner): void
  /** Deletes every `pp:draft:*` key older than 24 h, unparsable, not `v1` or without a known environment (shell mount). */
  purgeStale(): void
}

export interface DraftStoreDeps {
  readonly storage?: () => Storage | null
  readonly now?: () => number
}

/** The draft storage; every storage failure is swallowed. */
export function createDraftStore({ storage = defaultStorage, now = Date.now }: DraftStoreDeps = {}): DraftStore {
  /** Runs `action` on the storage; nothing happens (and `fallback` returns) when it is missing or throws. */
  function attempt<R>(action: (store: Storage) => R, fallback: R): R {
    try {
      const store = storage()
      return store ? action(store) : fallback
    } catch {
      return fallback
    }
  }

  const expired = (draft: StoredDraft): boolean => now() - draft.savedAt > DRAFT_MAX_AGE_MS

  /** Every key under `prefix` (collected first: deleting while iterating shifts the indexes). */
  const keysWith = (store: Storage, prefix: string): string[] => {
    const keys: string[] = []
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    return keys
  }

  return {
    read(owner, sectionId) {
      return attempt((store) => {
        const key = draftKey(owner, sectionId)
        const raw = store.getItem(key)
        const draft = parseDraft(raw)
        if (draft && !expired(draft)) return draft
        if (raw !== null) store.removeItem(key)
        return null
      }, null)
    },
    write(owner, sectionId, draft) {
      attempt((store) => store.setItem(draftKey(owner, sectionId), JSON.stringify({ savedAt: now(), baseHash: draft.baseHash, values: draft.values })), undefined)
    },
    remove(owner, sectionId) {
      attempt((store) => store.removeItem(draftKey(owner, sectionId)), undefined)
    },
    purgeUser(owner) {
      attempt((store) => {
        for (const key of keysWith(store, ownerPrefix(owner))) store.removeItem(key)
      }, undefined)
    },
    purgeStale() {
      attempt((store) => {
        for (const key of keysWith(store, DRAFT_KEY_PREFIX)) {
          const [version, environment] = key.slice(DRAFT_KEY_PREFIX.length).split(":")
          const draft = version === DRAFT_VERSION && isEnvironment(environment) ? parseDraft(store.getItem(key)) : null
          if (!draft || expired(draft)) store.removeItem(key)
        }
      }, undefined)
    },
  }
}

/** The app's draft store (`window.localStorage`). */
export const drafts: DraftStore = createDraftStore()

/** What a Section shows about a stored draft. */
export type DraftOffer =
  | { readonly kind: "none" }
  | { readonly kind: "restore" }
  /** `rows`: the Section's `describeDraftDiff(draft, current)`. */
  | { readonly kind: "conflict"; readonly rows: readonly DraftDiffRow[] }

const NO_OFFER: DraftOffer = { kind: "none" }
const RESTORE_OFFER: DraftOffer = { kind: "restore" }

/** "firstName" → "First name". */
function humanize(field: string): string {
  const words = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A readable value: text as is, lists and objects as their readable items joined by ", ", nothing as "". */
function readable(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join(", ")
  if (isRecord(value)) return Object.values(value).map(readable).filter(Boolean).join(", ")
  return String(value)
}

/**
 * Production fallback only (development requires `describeDraftDiff` with
 * draft fields): one row per differing field, named from its key, values
 * made readable.
 */
export function defaultDraftDiff(draft: DraftValues, current: DraftValues): readonly DraftDiffRow[] {
  return Object.keys(draft)
    .filter((field) => !deepEqual(draft[field], current[field]))
    .map((field) => ({ field, label: humanize(field), mine: readable(draft[field]), current: readable(current[field]) }))
}

interface BaseCache {
  readonly json: string
  readonly values: DraftValues
  hash: string | null
}

interface SectionDraftState {
  base: BaseCache | null
  timer: ReturnType<typeof setTimeout> | null
  /** The values last scheduled or written (sorted JSON). */
  lastValues: string | null
  /** A write is waiting for the base hash. */
  writeWaiting: boolean
  /** The controller saw this Section dirty with a user change (losing it then deletes the key). */
  wasDirty: boolean
  /** Saved or discarded: no write until the Section reports clean (a registration from before the re-render is stale). */
  suppressed: boolean
  /** `undefined`: not looked up yet; `null`: none, or resolved (chosen, superseded, saved, discarded). */
  stored: StoredDraft | null | undefined
  offer: DraftOffer
}

export interface DraftController {
  /** The session's environment and `myself.id`; `null` until both are known. Nothing is read or written before. */
  setOwner(owner: DraftOwner | null): void
  /** Follows the page's Section registry. */
  handle(event: SectionEvent): void
  /** Re-reads every registered Section (after subscribing, or an owner change). */
  sync(): void
  /** Writes every dirty draftable Section now, synchronously (before the session dialog, on `pagehide` / hidden). */
  flush(): void
  /** Deletes this user's drafts (portal exit); no draft is written afterwards. */
  purgeUser(): void
  offerFor(sectionId: SectionId): DraftOffer
  /** Restore / Keep mine: the Section opens in edit view with the draft over its current baseline. */
  apply(sectionId: SectionId): void
  /** Discard / Use current: the draft is deleted; the Section stays in read view. */
  drop(sectionId: SectionId): void
  subscribe(listener: () => void): () => void
  /** Stops timers and hash callbacks; `revive()` undoes it (React StrictMode re-runs effects). */
  dispose(): void
  revive(): void
}

export interface DraftControllerDeps {
  readonly registry: Pick<SectionRegistry, "getAll" | "get">
  readonly store?: DraftStore
  readonly hash?: (base: DraftValues) => Promise<string>
  readonly debounceMs?: number
}

/**
 * The draft writer and restorer of one page (one per Section registry).
 *
 * Writing: debounced `debounceMs` after the last user change while a
 * draftable Section is dirty; a Section dirty only through preselected
 * defaults (`userChanged: false`) writes nothing; the key is deleted when the
 * user's change is gone (clean, or only presets left), on save or discard.
 * An unmounting dirty Section is written at once.
 *
 * Restoring: once the Section's data has loaded, a stored non-expired draft
 * of this owner is offered as `restore` (its base hash equals the current
 * one) or `conflict` (it doesn't; a conflict whose compare has no rows is
 * dropped). A read error offers nothing and keeps the draft. A user change in
 * the Section before a choice supersedes the offer (the new edits become the
 * draft). Nothing is ever merged automatically.
 */
export function createDraftController({ registry, store = drafts, hash = hashDraftBase, debounceMs = DRAFT_DEBOUNCE_MS }: DraftControllerDeps): DraftController {
  let owner: DraftOwner | null = null
  let disposed = false
  let purged = false
  const states = new Map<SectionId, SectionDraftState>()
  const listeners = new Set<() => void>()

  const stateOf = (id: SectionId): SectionDraftState => {
    let state = states.get(id)
    if (!state) {
      state = { base: null, timer: null, lastValues: null, writeWaiting: false, wasDirty: false, suppressed: false, stored: undefined, offer: NO_OFFER }
      states.set(id, state)
    }
    return state
  }

  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const isDraftable = (section: RegisteredSection): boolean => section.saveAll && section.draftFields.length > 0 && section.applyDraft !== undefined
  const userChanged = (section: RegisteredSection): boolean => section.isDirty && section.userChanged

  /** The draft fields' values, minus any whose value holds a denylisted key at any depth. */
  function draftValues(section: RegisteredSection): DraftValues {
    const values = pickFields(section.getDraftValues?.() ?? {}, section.draftFields)
    const unsafe = Object.keys(values).filter((field) => holdsDeniedKey(values[field]))
    reportDropped(section.id, unsafe.length, "nestedDenylisted")
    return Object.fromEntries(Object.entries(values).filter(([field]) => !unsafe.includes(field)))
  }

  const draftBase = (section: RegisteredSection): DraftValues => pickFields(section.getDraftBase?.() ?? {}, section.draftFields)

  function clearTimer(state: SectionDraftState): void {
    if (state.timer !== null) clearTimeout(state.timer)
    state.timer = null
    state.writeWaiting = false
  }

  /** Writes the Section's draft now; `false` when its base hash isn't known yet (the caller marks it waiting). */
  function writeNow(section: RegisteredSection, state: SectionDraftState): boolean {
    if (owner === null || purged || disposed) return true
    if (!state.base || state.base.hash === null) return false
    store.write(owner, section.id, { baseHash: state.base.hash, values: draftValues(section) })
    return true
  }

  /** Writes now, or as soon as the base hash is known. */
  function writeOrWait(section: RegisteredSection, state: SectionDraftState): void {
    clearTimer(state)
    if (!writeNow(section, state)) state.writeWaiting = true
  }

  /** Caches the base and starts hashing it when it changed. */
  function trackBase(section: RegisteredSection, state: SectionDraftState): void {
    const values = draftBase(section)
    const json = stableStringify(values)
    if (state.base?.json === json) return
    const cache: BaseCache = { json, values, hash: null }
    state.base = cache
    void hash(values).then(
      (digest) => {
        if (disposed || state.base !== cache || states.get(section.id) !== state) return
        cache.hash = digest
        // A waiting write and the offer both needed this hash.
        const current = registry.get(section.id)
        if (!current) return
        if (state.writeWaiting && userChanged(current)) writeOrWait(current, state)
        state.writeWaiting = false
        refreshOffer(current, state)
      },
      () => undefined,
    )
  }

  function setOffer(state: SectionDraftState, offer: DraftOffer): void {
    if (state.offer === offer) return
    state.offer = offer
    notify()
  }

  /** The Section's offer from its stored draft, data status and base hash. */
  function refreshOffer(section: RegisteredSection, state: SectionDraftState): void {
    if (owner === null || section.dataStatus !== "loaded") {
      setOffer(state, NO_OFFER)
      return
    }
    if (state.stored === undefined) state.stored = store.read(owner, section.id)
    const stored = state.stored
    if (!stored || !state.base || state.base.hash === null) {
      setOffer(state, NO_OFFER)
      return
    }
    if (stored.baseHash === state.base.hash) {
      setOffer(state, RESTORE_OFFER)
      return
    }
    const describe = section.describeDraftDiff ?? defaultDraftDiff
    const rows = describe(pickFields(stored.values, section.draftFields), state.base.values)
    if (rows.length === 0) {
      // The draft equals the current data: nothing to choose, nothing lost.
      forget(section.id, state, false)
      return
    }
    const previous = state.offer
    if (previous.kind === "conflict" && deepEqual(previous.rows, rows)) return
    setOffer(state, { kind: "conflict", rows })
  }

  /** The writer: debounce while dirty with a user change; delete once the user's change is gone. */
  function trackWrites(section: RegisteredSection, state: SectionDraftState): void {
    if (state.suppressed) {
      if (!section.isDirty) state.suppressed = false
      return
    }
    if (userChanged(section)) {
      // A user change before choosing supersedes a stored draft's offer (the new edits become the draft).
      state.stored = null
      setOffer(state, NO_OFFER)
      state.wasDirty = true
      const values = stableStringify(draftValues(section))
      if (values === state.lastValues) return
      state.lastValues = values
      clearTimer(state)
      state.timer = setTimeout(() => {
        state.timer = null
        const current = registry.get(section.id)
        if (current && userChanged(current)) writeOrWait(current, state)
      }, debounceMs)
      return
    }
    if (state.wasDirty) forget(section.id, state, false)
  }

  /** Deletes the Section's key and resets what the writer knows; `suppress` blocks writes until it reports clean. */
  function forget(id: SectionId, state: SectionDraftState, suppress: boolean): void {
    clearTimer(state)
    state.wasDirty = false
    state.lastValues = null
    state.stored = null
    state.suppressed = suppress
    /* v8 ignore next -- a Section state exists only while an owner is set */
    if (owner !== null) store.remove(owner, id)
    setOffer(state, NO_OFFER)
  }

  function syncSection(section: RegisteredSection): void {
    if (owner === null || !isDraftable(section)) return
    const state = stateOf(section.id)
    trackBase(section, state)
    trackWrites(section, state)
    refreshOffer(section, state)
  }

  function sync(): void {
    for (const section of registry.getAll()) syncSection(section)
  }

  return {
    setOwner(next) {
      if (next?.environment === owner?.environment && next?.userId === owner?.userId) return
      for (const state of states.values()) clearTimer(state)
      states.clear()
      owner = next
      purged = false
      notify()
      sync()
    },
    handle(event) {
      const state = states.get(event.id)
      if (event.type === "saved" || event.type === "discarded") {
        if (state) forget(event.id, state, true)
        return
      }
      if (event.type === "unregistered") {
        // Still readable: an unmounting dirty Section keeps its latest edit.
        const section = registry.get(event.id)
        if (state && section && !state.suppressed && userChanged(section)) writeOrWait(section, state)
        if (state) clearTimer(state)
        states.delete(event.id)
        notify()
        return
      }
      const section = registry.get(event.id)
      if (section) syncSection(section)
    },
    sync,
    flush() {
      if (owner === null) return
      for (const section of registry.getAll()) {
        const state = states.get(section.id)
        if (!state || state.suppressed || !isDraftable(section) || !userChanged(section)) continue
        // The flush never hashes: with the hash still pending, the write waits for it.
        writeOrWait(section, state)
      }
    },
    purgeUser() {
      if (owner === null) return
      purged = true
      for (const state of states.values()) clearTimer(state)
      store.purgeUser(owner)
    },
    offerFor(sectionId) {
      return states.get(sectionId)?.offer ?? NO_OFFER
    },
    apply(sectionId) {
      const state = states.get(sectionId)
      const section = registry.get(sectionId)
      if (!state?.stored || !section?.applyDraft) return
      // Cleared only once applied: a refused apply (e.g. while saving) keeps the offer.
      if (!section.applyDraft(pickFields(state.stored.values, section.draftFields))) return
      state.stored = null
      setOffer(state, NO_OFFER)
    },
    drop(sectionId) {
      const state = states.get(sectionId)
      if (state) forget(sectionId, state, false)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      disposed = true
      for (const state of states.values()) clearTimer(state)
    },
    revive() {
      if (!disposed) return
      disposed = false
      // Base hashes dropped while disposed are recomputed.
      for (const state of states.values()) state.base = null
      sync()
    },
  }
}
