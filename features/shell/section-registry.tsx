"use client"

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { isProductionBuild } from "@/lib/shared/app-env"
import type { SaveResult, SectionId, SectionRegistration, ValidateResult } from "./nav-types"

/** A registered Section as the leave guard sees it. */
export interface RegisteredSection {
  readonly id: SectionId
  readonly label: string
  readonly displayOrder: number
  readonly isDirty: boolean
  /** `false` for a guard-only participant registered without `save`. */
  readonly canSave: boolean
  readonly draftFields: readonly string[]
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

/** A throwing or rejecting `validate()` counts as invalid (with nothing to focus). */
async function safeValidate(validate: SectionRegistration["validate"]): Promise<ValidateResult> {
  if (!validate) return VALID
  try {
    return await validate()
  } catch {
    return { valid: false, focusFirstInvalid: () => undefined }
  }
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
    draftFields: registration.draftFields ?? [],
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
      const wasDirty = box.current.isDirty
      box.current = registration
      if (wasDirty !== registration.isDirty) notify()
    },
    getAll,
    getDirty: () => getAll().filter((section) => section.isDirty),
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

/** A registration whose callbacks always call the latest render's ones. */
function delegateTo(latest: { readonly current: SectionRegistration }): SectionRegistration {
  const { validate, save } = latest.current
  return {
    ...latest.current,
    validate: validate ? () => (latest.current.validate ?? validate)() : undefined,
    save: save ? () => (latest.current.save ?? save)() : undefined,
    discard: () => latest.current.discard(),
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
