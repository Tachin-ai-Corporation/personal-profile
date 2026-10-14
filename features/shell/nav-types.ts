/**
 * Navigation and Section types of the shell (AD-7, AD-26). Tab ids are typed
 * enums: no component passes a bare tab string.
 */

export const PROFILE_TABS = ["contacts", "insurance", "medical"] as const
export type ProfileTab = (typeof PROFILE_TABS)[number]
export const DEFAULT_PROFILE_TAB: ProfileTab = "contacts"

export const ACCOUNT_TABS = ["personal", "provider", "organizations"] as const
export type AccountTab = (typeof ACCOUNT_TABS)[number]
export const DEFAULT_ACCOUNT_TAB: AccountTab = "personal"

export type PageId = "profile" | "account"

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

/** The page a pathname belongs to, or `null` outside the two pages. */
export function pageOfPath(pathname: string): PageId | null {
  if (pathname === PAGE_PATHS.profile) return "profile"
  if (pathname === PAGE_PATHS.account) return "account"
  return null
}

/** Section ids (Story 1.11), shared with lib/api and telemetry. */
import type { SectionId } from "@/lib/shared/section-ids"

export type { SectionId }

/** The parts of the `/account` Account settings save (Epic 7). */
export type AccountSavePart = "details" | "timeZone" | "locale"

export interface SaveError {
  /** `UNEXPECTED` when `save()` threw or rejected; otherwise a mapped code. */
  readonly code?: string
  /** The `/account` Account settings parts that weren't saved (AD-7 exception). */
  readonly failedParts?: readonly AccountSavePart[]
}

export type SaveResult = { readonly ok: true } | { readonly ok: false; readonly error: SaveError }

export type ValidateResult =
  | { readonly valid: true }
  /** `focusFirstInvalid` moves focus to the Section's first invalid field. */
  | { readonly valid: false; readonly focusFirstInvalid: () => void }

/** What a Section (or a guard-only participant) registers (Story 1.11). */
export interface SectionRegistration {
  readonly id: SectionId
  readonly label: string
  readonly displayOrder: number
  readonly isDirty: boolean
  /** Defaults to valid. */
  readonly validate?: () => ValidateResult | Promise<ValidateResult>
  /** Omitted by a guard-only participant that can't save: it is then `canSave: false`. */
  readonly save?: () => Promise<SaveResult>
  readonly discard: () => void
  /** The fields a draft may hold (Story 1.15). */
  readonly draftFields?: readonly string[]
}
