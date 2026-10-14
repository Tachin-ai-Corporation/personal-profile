"use client"

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { isProductionBuild } from "@/lib/shared/app-env"
import type { DraftDiffRow, DraftValues, SaveResult, SectionId, SectionRegistration, ValidateResult } from "./nav-types"

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
  readonly draftFields: readonly string[]
  /** F4 draft hooks, as registered (absent when the Section keeps no draft). */
  readonly getDraftValues?: () => DraftValues
  readonly getDraftBase?: () => DraftValues
  readonly applyDraft?: (values: DraftValues) => void
  readonly describeDraftDiff?: (draft: DraftValues, current: DraftValues) => readonly DraftDiffRow[]
  /** Never rejects: a throw or rejection counts as invalid. */
  validate(): Promise<ValidateResult>
  /** Never rejects: a throw or rejection resolves `{ ok: false, error: { code: "UNEXPECTED" } }`. */
  save(): Promise<SaveResult>
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
  subscribe(listener: () => void): () => void
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

/** One registry per page (AD-7); no other module keeps dirty or save state. */
export function createSectionRegistry(): SectionRegistry {
  // Each registration lives in a box, so unregister removes only its own entry.
  const entries = new Map<SectionId, { current: SectionRegistration }>()
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const view = (registration: SectionRegistration): RegisteredSection => ({
    id: registration.id,
    label: registration.label,
    displayOrder: registration.displayOrder,
    isDirty: registration.isDirty,
    canSave: registration.save !== undefined,
    saveAll: countsForSaveAll(registration),
    draftFields: registration.draftFields ?? [],
    getDraftValues: registration.getDraftValues,
    getDraftBase: registration.getDraftBase,
    applyDraft: registration.applyDraft,
    describeDraftDiff: registration.describeDraftDiff,
    validate: () => safeValidate(registration.validate),
    save: () => (registration.save ? safeSave(registration.save) : Promise.resolve(UNEXPECTED)),
    discard: () => registration.discard(),
  })

  const getAll = (): readonly RegisteredSection[] =>
    [...entries.values()].map((box) => view(box.current)).toSorted((a, b) => a.displayOrder - b.displayOrder)

  return {
    register(registration) {
      if (entries.has(registration.id)) {
        if (!isProductionBuild()) throw new Error(`Section "${registration.id}" is already registered on this page`)
        return () => undefined
      }
      const box = { current: registration }
      entries.set(registration.id, box)
      notify()
      return () => {
        if (entries.get(registration.id) !== box) return
        entries.delete(registration.id)
        notify()
      }
    },
    update(registration) {
      const box = entries.get(registration.id)
      if (!box) return
      const previous = box.current
      box.current = registration
      if (previous.isDirty !== registration.isDirty || countsForSaveAll(previous) !== countsForSaveAll(registration)) notify()
    },
    getAll,
    getDirty: () => getAll().filter((section) => section.isDirty),
    getDirtyCount: () => [...entries.values()].filter((box) => box.current.isDirty && countsForSaveAll(box.current)).length,
    isAnyDirty: () => [...entries.values()].some((box) => box.current.isDirty),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
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
