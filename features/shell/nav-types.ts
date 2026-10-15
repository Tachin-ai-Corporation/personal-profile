/**
 * Navigation and Section types of the shell (AD-7, AD-26). Tab ids are typed
 * enums: no component passes a bare tab string.
 */

import type { MappedError } from "@/lib/api"
import type { SectionId } from "@/lib/shared/section-ids"
import type { TelemetryErrorCode } from "@/lib/shared/telemetry"

export const PROFILE_TABS = ["contacts", "insurance", "medical"] as const
export type ProfileTab = (typeof PROFILE_TABS)[number]
export const DEFAULT_PROFILE_TAB: ProfileTab = "contacts"

export const ACCOUNT_TABS = ["personal", "provider", "organizations"] as const
export type AccountTab = (typeof ACCOUNT_TABS)[number]
export const DEFAULT_ACCOUNT_TAB: AccountTab = "personal"

export type PageId = "profile" | "account"

/** The URL query parameter that holds a page's tab (AD-7). */
export const TAB_PARAM = "tab"

/**
 * Each page's tab query parameter: part of the page config, read by
 * `navigate()` (and so by `PageNav`, `ReturnLink` and every caller) and by
 * `PageTabs`; never passed per call (F6-1 review L3).
 */
export const PAGE_TAB_PARAM: Readonly<Record<PageId, string>> = { profile: TAB_PARAM, account: TAB_PARAM }

/** A page's tab as a `navigate()` target; `null` when `tab` isn't one of that page's routable tabs. */
export function pageTabTarget(page: PageId, tab: string): NavTarget | null {
  if (page === "profile") return isProfileTab(tab) ? { page, tab } : null
  return isAccountTab(tab) ? { page, tab } : null
}

/** The app's two pages and their paths. */
export const PAGE_PATHS: Readonly<Record<PageId, string>> = { profile: "/", account: "/account" }

/** Every cross-page, tab and external move (AD-26). */
export type NavTarget =
  | { readonly page: "profile"; readonly tab?: ProfileTab; readonly hash?: string }
  | { readonly page: "account"; readonly tab?: AccountTab; readonly hash?: string }
  | { readonly external: "portal" }
  | { readonly external: "handoff"; readonly href: string }

export function isProfileTab(value: unknown): value is ProfileTab {
  return typeof value === "string" && (PROFILE_TABS as readonly string[]).includes(value)
}

export function isAccountTab(value: unknown): value is AccountTab {
  return typeof value === "string" && (ACCOUNT_TABS as readonly string[]).includes(value)
}

/**
 * Dispatched on `window` after a same-page `navigate()` that sets a hash: its
 * history replace fires no `hashchange`, so `useHashAnchors` follows this too.
 */
export const HASH_NAVIGATE_EVENT = "pp:hash-navigate"

/** The page a pathname belongs to, or `null` outside the two pages. */
export function pageOfPath(pathname: string): PageId | null {
  if (pathname === PAGE_PATHS.profile) return "profile"
  if (pathname === PAGE_PATHS.account) return "account"
  return null
}

/** Section ids (Story 1.11), shared with lib/api and telemetry. */
export type { SectionId }

/**
 * The id of a Section's (or `/account` anchor container's) `h2` (`tabIndex=-1`):
 * its `aria-labelledby` target and the focus target after Save, Cancel and
 * Section jumps. Takes any anchor id (e.g. `authenticator`), not only a `SectionId`.
 */
export function sectionHeadingId(id: string): string {
  return `${id}-heading`
}

/** The parts of the `/account` Account settings save (Epic 7). */
export type AccountSavePart = "details" | "timeZone" | "locale"

/**
 * A failed save's code: the PHI-free `section_save` telemetry code
 * (`mappedErrorCode()` of the mapped error, or `UNEXPECTED` for a throw).
 * `SESSION_EXPIRED` means the session ended: runners stop at once and the
 * session-expired dialog takes over (no error, no toast).
 */
export type SaveErrorCode = TelemetryErrorCode | typeof CANCELLED_CODE

export const SESSION_EXPIRED_CODE = "SESSION_EXPIRED" satisfies SaveErrorCode

/**
 * The user declined a step of the save (e.g. Story 2.4's "Remove your
 * signature?" Cancel), so nothing was sent for the Section (F6-1).
 * `useSectionForm` shows no error, moves no focus and fires no
 * `section_save` telemetry; the Section stays in edit. Save all and the
 * leave guard count it as not saved.
 */
export const CANCELLED_CODE = "CANCELLED"

/** Whether a save was cancelled by the user. */
export function isCancelled(result: SaveResult): boolean {
  return !result.ok && result.error.code === CANCELLED_CODE
}

export interface SaveError {
  /** `UNEXPECTED` when `save()` threw or rejected; otherwise the mapped error's code. */
  readonly code?: SaveErrorCode
  /** What the Section shows (field or Section-level error), when the failure was mapped. */
  readonly mapped?: MappedError
  /** The `/account` Account settings parts that weren't saved (AD-7 exception). */
  readonly failedParts?: readonly AccountSavePart[]
}

export type SaveResult = { readonly ok: true } | { readonly ok: false; readonly error: SaveError }

/** Whether a save failed because the session ended. */
export function isSessionExpired(result: SaveResult): boolean {
  return !result.ok && result.error.code === SESSION_EXPIRED_CODE
}

export type ValidateResult =
  | { readonly valid: true }
  /**
   * `invalidCount` is the number of fields to fix (Save all's "{Section} has
   * {n} fields to fix"); `focusFirstInvalid` moves focus to the first one.
   */
  | { readonly valid: false; readonly invalidCount: number; readonly focusFirstInvalid: () => void }

/** A draft's values: only the keys listed in `draftFields` (Story 1.15, F4). */
export type DraftValues = Readonly<Record<string, unknown>>

/** One changed field of a draft conflict compare: "Your version" vs "Current" (Story 1.15, F4). */
export interface DraftDiffRow {
  readonly field: string
  readonly label: string
  readonly mine: string
  readonly current: string
}

/**
 * Where a Section's server data stands (F4 drafts): a stored draft is offered
 * only once it is `loaded`, and never while the read failed (`error`).
 */
export type SectionDataStatus = "loading" | "loaded" | "error"

/**
 * A registry event for F4 drafts. `registered` / `unregistered` (sent while
 * the Section is still readable, so its draft can be written) and `updated`
 * (sent on every `update()`, i.e. each render of a registered Section, since
 * draft values change without any registration field changing). `saved`: a
 * save that resolved `{ ok: true }` (own Save, Save all, leave-guard Save);
 * `discarded`: a discard of a dirty Section (Cancel, Discard all, leave-guard
 * Discard). Both delete the Section's draft.
 */
export type SectionEvent =
  | { readonly type: "registered" | "updated" | "unregistered"; readonly id: SectionId }
  | { readonly type: "saved" | "discarded"; readonly id: SectionId }

/** What a Section (or a guard-only participant) registers (Story 1.11). */
export interface SectionRegistration {
  readonly id: SectionId
  readonly label: string
  readonly displayOrder: number
  readonly isDirty: boolean
  /**
   * `false` for a guard-only participant (e.g. the Insurance editor): never
   * counted by `getDirtyCount()` nor saved by Save all, but the leave guard
   * still asks for it, validates it and calls its `save()`. A registration
   * without `save` is treated as `saveAll: false` too.
   */
  readonly saveAll?: false
  /** Defaults to valid. */
  readonly validate?: () => ValidateResult | Promise<ValidateResult>
  /** Omitted by a guard-only participant that can't save: it is then `canSave: false`. */
  readonly save?: () => Promise<SaveResult>
  readonly discard: () => void
  /**
   * The fields a draft may hold (Story 1.15). Never a denylisted field (SSN,
   * Signature, MFA/QR codes, NPI selections, username, password) and never on
   * a guard-only participant: the registry throws in development and drops
   * them in production.
   */
  readonly draftFields?: readonly string[]
  /**
   * F4 drafts: the user changed a value in this edit (not only app-preselected
   * defaults); no draft is written before. Defaults to `isDirty`.
   */
  readonly userChanged?: boolean
  /** F4 drafts: the Section's server data; defaults to `loading` for a Section with draft fields (nothing offered until it says `loaded`), else `loaded`. */
  readonly dataStatus?: SectionDataStatus
  /** F4 drafts: the current values of `draftFields` (written while dirty). */
  readonly getDraftValues?: () => DraftValues
  /** F4 drafts: the server values of `draftFields` the edit started from (hashed into `baseHash`). */
  readonly getDraftBase?: () => DraftValues
  /**
   * F4 drafts: opens edit view with a restored draft's values; `false` when it
   * couldn't (e.g. while saving), so the draft stays offered. A Section
   * without it keeps no draft.
   */
  readonly applyDraft?: (values: DraftValues) => boolean
  /** F4 drafts: the changed fields between a draft and the current server values, for the conflict compare (required with draft fields: development throws without it). */
  readonly describeDraftDiff?: (draft: DraftValues, current: DraftValues) => readonly DraftDiffRow[]
}
