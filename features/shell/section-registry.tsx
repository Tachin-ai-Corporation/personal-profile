"use client"

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { isProductionBuild } from "@/lib/shared/app-env"
import { allowedDraftFields } from "./drafts"
import type {
  DraftDiffRow,
  DraftValues,
  SaveResult,
  SectionDataStatus,
  SectionEvent,
  SectionId,
  SectionRegistration,
  ValidateResult,
} from "./nav-types"

/** A registered Section as the leave guard sees it. */
export interface RegisteredSection {
  readonly id: SectionId
  readonly label: string
  readonly displayOrder: number
  readonly isDirty: boolean
  /** `false` for a guard-only participant registered without `save`. */
  readonly canSave: boolean
  /**
   * `false` for a guard-only participant (`saveAll: false`) and for any
   * participant registered without `save`: not counted, not saved by Save all.
   */
  readonly saveAll: boolean
  /** The allowed draft fields (denylisted ones and a guard-only participant's are dropped). */
  readonly draftFields: readonly string[]
  /** F4 drafts: the user changed a value in this edit (defaults to `isDirty`). */
  readonly userChanged: boolean
  /** F4 drafts: the Section's server data (defaults to `loaded`). */
  readonly dataStatus: SectionDataStatus
  /** F4 draft hooks, as registered (absent when the Section keeps no draft). */
  readonly getDraftValues?: () => DraftValues
  readonly getDraftBase?: () => DraftValues
  readonly applyDraft?: (values: DraftValues) => boolean
  readonly describeDraftDiff?: (draft: DraftValues, current: DraftValues) => readonly DraftDiffRow[]
  /** Never rejects: a throw or rejection counts as invalid. */
  validate(): Promise<ValidateResult>
  /**
   * Never rejects: a throw or rejection resolves `{ ok: false, error: { code: "UNEXPECTED" } }`.
   * `{ ok: true }` reports `saved` (F4 deletes the Section's draft).
   */
  save(): Promise<SaveResult>
  /** Reports `discarded` (F4 deletes the Section's draft). */
  discard(): void
}

export interface SectionRegistry {
  /** Registers a Section; throws in development when the id is already registered. Returns unregister. */
  register(registration: SectionRegistration): () => void
  /** Replaces a registered Section's registration (the latest callbacks and dirty state). */
  update(registration: SectionRegistration): void
  /** Every registered Section, in `displayOrder`. */
  getAll(): readonly RegisteredSection[]
  /** The dirty Sections, in `displayOrder`. */
  getDirty(): readonly RegisteredSection[]
  /** The number of dirty Save-all Sections (`saveAll !== false` and a `save`; guard-only participants never count). */
  getDirtyCount(): number
  /** Any Section dirty, guard-only participants included. */
  isAnyDirty(): boolean
  /** One registered Section, if any. */
  get(id: SectionId): RegisteredSection | undefined
  /** Re-renders on dirty / Save-all changes only. */
  subscribe(listener: () => void): () => void
  /** Every registration change and lifecycle event, in order (F4 drafts). */
  observe(listener: (event: SectionEvent) => void): () => void
  /** A Section's own Save succeeded or its Cancel ran (`useSectionForm`); the registry's `save`/`discard` report themselves. */
  report(event: Extract<SectionEvent, { type: "saved" | "discarded" }>): void
}

const UNEXPECTED: SaveResult = { ok: false, error: { code: "UNEXPECTED" } }
const VALID: ValidateResult = { valid: true }

async function safeSave(save: () => Promise<SaveResult>): Promise<SaveResult> {
  try {
    return await save()
  } catch {
    return UNEXPECTED
  }
}

/** A throwing or rejecting `validate()` counts as invalid (one problem, nothing to focus). */
async function safeValidate(validate: SectionRegistration["validate"]): Promise<ValidateResult> {
  if (!validate) return VALID
  try {
    return await validate()
  } catch {
    return { valid: false, invalidCount: 1, focusFirstInvalid: () => undefined }
  }
}

/** Save all counts and saves a Section only when it can save and isn't guard-only. */
function countsForSaveAll(registration: SectionRegistration): boolean {
  return registration.saveAll !== false && registration.save !== undefined
}

/** A registration's draft contract inputs, compared to skip re-validating unchanged fields. */
function draftContractKey(registration: SectionRegistration): string {
  return JSON.stringify([registration.draftFields ?? [], countsForSaveAll(registration), registration.describeDraftDiff !== undefined])
}

interface Entry {
  current: SectionRegistration
  /** The allowed draft fields, validated once per contract change (throws in development). */
  draftFields: readonly string[]
  contractKey: string
  /** The cached view of `current`. */
  view: RegisteredSection
}

/** One registry per page (AD-7); no other module keeps dirty or save state. */
export function createSectionRegistry(): SectionRegistry {
  // Each registration lives in an entry box, so unregister removes only its own entry.
  const entries = new Map<SectionId, Entry>()
  const listeners = new Set<() => void>()
  const observers = new Set<(event: SectionEvent) => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const emit = (event: SectionEvent): void => {
    for (const observer of [...observers]) observer(event)
  }

  /** Validates the draft contract (throws in development; see `allowedDraftFields`). */
  const allowedFor = (registration: SectionRegistration): readonly string[] =>
    allowedDraftFields(registration.id, registration.draftFields, {
      savesAll: countsForSaveAll(registration),
      describes: registration.describeDraftDiff !== undefined,
    })

  const entryFor = (registration: SectionRegistration): Entry => {
    const draftFields = allowedFor(registration)
    return { current: registration, draftFields, contractKey: draftContractKey(registration), view: view(registration, draftFields) }
  }

  /** Re-validates the draft contract only when it changed, and refreshes the cached view. */
  const refresh = (entry: Entry, registration: SectionRegistration): void => {
    const contractKey = draftContractKey(registration)
    if (contractKey !== entry.contractKey) {
      entry.draftFields = allowedFor(registration)
      entry.contractKey = contractKey
    }
    entry.current = registration
    entry.view = view(registration, entry.draftFields)
  }

  const view = (registration: SectionRegistration, draftFields: readonly string[]): RegisteredSection => ({
    id: registration.id,
    label: registration.label,
    displayOrder: registration.displayOrder,
    isDirty: registration.isDirty,
    canSave: registration.save !== undefined,
    saveAll: countsForSaveAll(registration),
    draftFields,
    userChanged: registration.userChanged ?? registration.isDirty,
    // A Section with draft fields must say when its data loaded: a placeholder baseline would show a false conflict.
    dataStatus: registration.dataStatus ?? (draftFields.length > 0 ? "loading" : "loaded"),
    getDraftValues: registration.getDraftValues,
    getDraftBase: registration.getDraftBase,
    applyDraft: registration.applyDraft,
    describeDraftDiff: registration.describeDraftDiff,
    validate: () => safeValidate(registration.validate),
    save: async () => {
      const result = registration.save ? await safeSave(registration.save) : UNEXPECTED
      if (result.ok) emit({ type: "saved", id: registration.id })
      return result
    },
    discard: () => {
      const wasDirty = registration.isDirty
      registration.discard()
      // A clean Section's discard deletes nothing (e.g. a stored draft still on offer).
      if (wasDirty) emit({ type: "discarded", id: registration.id })
    },
  })

  const getAll = (): readonly RegisteredSection[] =>
    [...entries.values()].map((entry) => entry.view).toSorted((a, b) => a.displayOrder - b.displayOrder)

  return {
    register(registration) {
      if (entries.has(registration.id)) {
        if (!isProductionBuild()) throw new Error(`Section "${registration.id}" is already registered on this page`)
        return () => undefined
      }
      // Throws in development on a denylisted draft field, a guard-only participant's draft fields or no describeDraftDiff.
      const box = entryFor(registration)
      entries.set(registration.id, box)
      notify()
      emit({ type: "registered", id: registration.id })
      return () => {
        if (entries.get(registration.id) !== box) return
        // Sent while the Section is still readable, so drafts can keep its latest edit.
        emit({ type: "unregistered", id: registration.id })
        entries.delete(registration.id)
        notify()
      }
    },
    update(registration) {
      const box = entries.get(registration.id)
      if (!box) return
      const previous = box.current
      refresh(box, registration)
      if (previous.isDirty !== registration.isDirty || countsForSaveAll(previous) !== countsForSaveAll(registration)) notify()
      emit({ type: "updated", id: registration.id })
    },
    getAll,
    get: (id) => entries.get(id)?.view,
    getDirty: () => getAll().filter((section) => section.isDirty),
    getDirtyCount: () => [...entries.values()].filter((box) => box.current.isDirty && countsForSaveAll(box.current)).length,
    isAnyDirty: () => [...entries.values()].some((box) => box.current.isDirty),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    observe(observer) {
      observers.add(observer)
      return () => {
        observers.delete(observer)
      }
    },
    report(event) {
      emit(event)
    },
  }
}

const RegistryContext = createContext<SectionRegistry | null>(null)

/** Mounted once per page by the page frame. */
export function SectionRegistryProvider({ children }: { readonly children: ReactNode }) {
  const [registry] = useState(createSectionRegistry)
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>
}

export function useSectionRegistry(): SectionRegistry {
  const registry = useContext(RegistryContext)
  if (registry === null) throw new Error("useSectionRegistry must be used inside SectionRegistryProvider")
  return registry
}

/**
 * How many times the Section `id` reported `saved` since mount (its own Save
 * or Save all); `0` with `id` `null` or outside a registry (the design
 * refresh's saved pulse, PROPOSAL). Read-only: it never changes a save.
 */
export function useSectionSavedCount(id: SectionId | null): number {
  const registry = useContext(RegistryContext)
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (registry === null || id === null) return
    return registry.observe((event) => {
      if (event.type === "saved" && event.id === id) setCount((current) => current + 1)
    })
  }, [registry, id])
  return count
}

/** Re-renders when any Section's dirty state changes. */
export function useIsAnyDirty(): boolean {
  const registry = useSectionRegistry()
  return useSyncExternalStore(registry.subscribe, registry.isAnyDirty, () => false)
}

/** The number of dirty Save-all Sections; re-renders when it changes (Save all bar, Story 1.14). */
export function useDirtyCount(): number {
  const registry = useSectionRegistry()
  return useSyncExternalStore(registry.subscribe, registry.getDirtyCount, () => 0)
}

/** A registration whose callbacks always call the latest render's ones. */
function delegateTo(latest: { readonly current: SectionRegistration }): SectionRegistration {
  const { validate, save, getDraftValues, getDraftBase, applyDraft, describeDraftDiff } = latest.current
  return {
    ...latest.current,
    validate: validate ? () => (latest.current.validate ?? validate)() : undefined,
    save: save ? () => (latest.current.save ?? save)() : undefined,
    discard: () => latest.current.discard(),
    getDraftValues: getDraftValues ? () => (latest.current.getDraftValues ?? getDraftValues)() : undefined,
    getDraftBase: getDraftBase ? () => (latest.current.getDraftBase ?? getDraftBase)() : undefined,
    applyDraft: applyDraft ? (values) => (latest.current.applyDraft ?? applyDraft)(values) : undefined,
    describeDraftDiff: describeDraftDiff
      ? (draft, current) => (latest.current.describeDraftDiff ?? describeDraftDiff)(draft, current)
      : undefined,
  }
}

/**
 * Registers the calling Section for the page's lifetime (unregistered on
 * unmount). Pass the current `isDirty` on every render; the latest callbacks
 * are always the ones called.
 */
export function useRegisterSection(registration: SectionRegistration): void {
  const registry = useSectionRegistry()
  const latest = useRef(registration)
  const { id } = registration

  useEffect(() => registry.register(delegateTo(latest)), [registry, id])

  useEffect(() => {
    latest.current = registration
    registry.update(delegateTo(latest))
  })
}
