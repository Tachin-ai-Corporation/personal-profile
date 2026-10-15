/**
 * The Launching user (`GET v2/user/myself`, backend `UserDTO`), mapped once to
 * the domain type every page uses (Epics 1, 2, 7, 8, 9, 10). Every field but
 * `id` is nullable, as on the wire; `"n/a"` values are kept as sent. The
 * backend withholds `birthDate` (null) until terms are accepted.
 */

import { parseWireDate } from "@/lib/shared/dates"
import { hasProctorRole } from "@/lib/shared/person-rules"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { registerFetcher, unwrap } from "./fetcher"
import { pageUser } from "./page-user"
import type { ApiResponse } from "./types"

export interface MyselfTenant {
  readonly id: number
  readonly name: string | null
}

export interface MyselfSignature {
  readonly id: number
  readonly name: string | null
}

export interface Myself {
  readonly id: number
  /** A user may have no person record. */
  readonly personId: number | null
  readonly username: string | null
  readonly firstName: string | null
  readonly middleName: string | null
  readonly lastName: string | null
  readonly namePrefix: string | null
  readonly nameSuffix: string | null
  readonly otherNames: string | null
  /** Free text; may be `"n/a"`. */
  readonly titles: string | null
  /** `YYYY-MM-DD`, or null when unset or withheld. */
  readonly birthDate: string | null
  readonly cityOfBirth: string | null
  readonly race: string | null
  readonly ethnicity: string | null
  readonly biologicalGender: string | null
  readonly genderIdentity: string | null
  readonly sexualOrientation: string | null
  /** Already masked by the backend (`***-**-1234`) or `"n/a"`. */
  readonly socialSecurityNumber: string | null
  readonly signature: MyselfSignature | null
  /** The Primary Email Contact Point's value. */
  readonly email: string | null
  /** The Primary Mobile Contact Point's value. Its region is on the Contact Point row, not here. */
  readonly phoneNumber: string | null
  readonly roles: readonly string[] | null
  readonly preferredLanguage: string | null
  readonly timeZone: string | null
  readonly locale: string | null
  /** The tenants the user belongs to (AD-23 membership source). */
  readonly tenants: readonly MyselfTenant[] | null
  readonly mfaEnabled: boolean | null
  readonly totpEnabled: boolean | null
}

type Wire = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is Wire {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null)
const integer = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null)
const flag = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null)

/** A list, keeping only the items `item` accepts; `null` when not a list. */
function list<T>(value: unknown, item: (raw: unknown) => T | null): T[] | null {
  return Array.isArray(value) ? value.flatMap((raw) => item(raw) ?? []) : null
}

/** A backend `IdNameDTO` with a numeric id, else `null`. */
function idName(value: unknown): MyselfTenant | null {
  if (!isRecord(value)) return null
  const id = integer(value.id)
  return id === null ? null : { id, name: text(value.name) }
}

/**
 * The domain type, or `null` when the body is not a user (not an object, or
 * no integer `id`). Every other field is read on its own: a malformed one
 * becomes `null` (a list drops its malformed items) and the user is kept, so
 * one bad optional field never turns into a page load error.
 */
export function toMyself(raw: unknown): Myself | null {
  if (!isRecord(raw)) return null
  const id = integer(raw.id)
  if (id === null) return null
  const birthDate = text(raw.birthDate)
  return {
    id,
    personId: integer(raw.personId),
    username: text(raw.username),
    firstName: text(raw.firstName),
    middleName: text(raw.middleName),
    lastName: text(raw.lastName),
    namePrefix: text(raw.namePrefix),
    nameSuffix: text(raw.nameSuffix),
    otherNames: text(raw.otherNames),
    titles: text(raw.titles),
    birthDate: parseWireDate(birthDate) ? birthDate : null,
    cityOfBirth: text(raw.cityOfBirth),
    race: text(raw.race),
    ethnicity: text(raw.ethnicity),
    biologicalGender: text(raw.biologicalGender),
    genderIdentity: text(raw.genderIdentity),
    sexualOrientation: text(raw.sexualOrientation),
    socialSecurityNumber: text(raw.socialSecurityNumber),
    signature: idName(raw.signature),
    email: text(raw.email),
    phoneNumber: text(raw.phoneNumber),
    roles: list(raw.roles, text),
    preferredLanguage: text(raw.preferredLanguage),
    timeZone: text(raw.timeZone),
    locale: text(raw.locale),
    tenants: list(raw.tenants, idName),
    mfaEnabled: flag(raw.mfaEnabled),
    totpEnabled: flag(raw.totpEnabled),
  }
}

/** `roles` includes exactly `"Proctor"` (the 21–120 age rule, AD-11). */
export function isProctor(roles: Myself["roles"]): boolean {
  return hasProctorRole(roles)
}

/** Practice membership (AD-23): the one place it is computed, from `myself.tenants` only. */
export function isTenantMember(myself: Pick<Myself, "tenants">, tenantId: number): boolean {
  return myself.tenants?.some((tenant) => tenant.id === tenantId) ?? false
}

export function myselfPath(): string {
  return proxyPath("v2/user/myself")
}

/**
 * The Launching user. The first one this page loads is pinned as the page
 * user (`pageUser`, D-A): a later, different id never replaces it.
 */
export async function fetchMyself(): Promise<ApiResponse<Myself>> {
  const res = await callApi<unknown>("myself/fetchMyself", myselfPath())
  if (!res.success) return { ...res, data: undefined }
  const myself = toMyself(res.data)
  if (!myself) return { success: false, statusCode: res.statusCode, error: "myself/fetchMyself returned an unexpected shape" }
  pageUser.pin(myself.id)
  return { success: true, data: myself, statusCode: res.statusCode }
}

/** The SWR loader of `keys.myself()`. */
export function loadMyself(): Promise<Myself | undefined> {
  return unwrap(fetchMyself())
}

registerFetcher("myself", loadMyself)
