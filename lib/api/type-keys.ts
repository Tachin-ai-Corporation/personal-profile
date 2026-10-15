/**
 * Platform type metadata (`GET v2/type/key/{Type}`, agents.md `TypeInfo`,
 * NFR10): the value lists of Person (Story 2.1: race, ethnicity, biological
 * gender), ContactPoint (Story 3.1: Contact Labels) and Insurance (Story 5.2:
 * type, precedence, relationship to insured). Built once in spec F6-3 so the
 * three stories share one loader (`registerFetcher` allows one per family).
 *
 * Owner: foundation (Team A consumes it). Endpoints: `GET v2/type/key/Person`
 * (`allowlist/personal.ts`), `GET v2/type/key/ContactPoint`
 * (`allowlist/contacts.ts`), `GET v2/type/key/Insurance`
 * (`allowlist/insurance.ts`). Read with `useSWR(keys.typeKey("Person"))`.
 */

import { isNotProvided } from "@/lib/shared/display-value"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { ApiResponseError, registerFetcher, unwrap } from "./fetcher"
import type { ApiResponse } from "./types"

/** The type keys the proxy allowlists (one literal entry each). */
export const TYPE_KEYS = ["Person", "ContactPoint", "Insurance"] as const

export type TypeKey = (typeof TYPE_KEYS)[number]

/** One value of a VALUE_LIST attribute (backend `IAttributeValue`). */
export interface TypeAttributeValue {
  readonly id: number | null
  readonly name: string
}

/** One attribute of a type (backend `AttributeInfo`); attributes without an `attrKey` are dropped. */
export interface TypeAttribute {
  readonly attrKey: string
  readonly name: string | null
  /** `"VALUE_LIST"`, `"TEXT"`, …; `null` when missing. */
  readonly type: string | null
  /** As sent (values without a string `name` dropped); use `valueListOptions` for a picker. */
  readonly values: readonly TypeAttributeValue[]
}

export interface TypeInfo {
  readonly boKey: string | null
  readonly attributes: readonly TypeAttribute[]
}

export function isTypeKey(value: unknown): value is TypeKey {
  return typeof value === "string" && (TYPE_KEYS as readonly string[]).includes(value)
}

type Wire = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is Wire {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null)

function toValue(raw: unknown): TypeAttributeValue | null {
  if (!isRecord(raw) || typeof raw.name !== "string") return null
  return { id: typeof raw.id === "number" && Number.isInteger(raw.id) ? raw.id : null, name: raw.name }
}

function toAttribute(raw: unknown): TypeAttribute | null {
  if (!isRecord(raw) || typeof raw.attrKey !== "string") return null
  const values = Array.isArray(raw.attributeValues) ? raw.attributeValues.flatMap((item) => toValue(item) ?? []) : []
  return { attrKey: raw.attrKey, name: text(raw.name), type: text(raw.type), values }
}

/**
 * The domain type, or `null` when the body is not an object. A malformed
 * attribute or value is dropped, so one bad item never fails the read.
 */
export function toTypeInfo(raw: unknown): TypeInfo | null {
  if (!isRecord(raw)) return null
  const attributes = Array.isArray(raw.attributes) ? raw.attributes.flatMap((item) => toAttribute(item) ?? []) : []
  return { boKey: text(raw.boKey), attributes }
}

/**
 * The picker options of one VALUE_LIST attribute: a superset of 1health-fe
 * `useValueListOptions` filtering (it drops only the exact `"n/a"` backend
 * default; this drops every PM3 not-provided name: `"n/a"` in any case,
 * blank, `"-1"`), sorted by `localeCompare` like 1health-fe. Empty when the type
 * has no such VALUE_LIST attribute (callers fall back to their own list).
 */
export function valueListOptions(info: TypeInfo | null | undefined, attrKey: string): TypeAttributeValue[] {
  const attribute = info?.attributes.find((candidate) => candidate.attrKey === attrKey && candidate.type === "VALUE_LIST")
  return (attribute?.values ?? []).filter((value) => !isNotProvided(value.name)).toSorted((a, b) => a.name.localeCompare(b.name))
}

export function typeKeyPath(type: TypeKey): string {
  return proxyPath(`v2/type/key/${type}`)
}

export async function fetchTypeKey(type: TypeKey): Promise<ApiResponse<TypeInfo>> {
  const res = await callApi<unknown>("type-keys/fetchTypeKey", typeKeyPath(type))
  if (!res.success) return { ...res, data: undefined }
  const info = toTypeInfo(res.data)
  return info
    ? { success: true, data: info, statusCode: res.statusCode }
    : { success: false, statusCode: res.statusCode, error: "type-keys/fetchTypeKey returned an unexpected shape" }
}

/** The SWR loader of `keys.typeKey(type)`. */
export function loadTypeKey(type: TypeKey): Promise<TypeInfo | undefined> {
  return unwrap(fetchTypeKey(type))
}

registerFetcher("type-key", (key) => {
  const type = key[2]
  if (!isTypeKey(type)) return Promise.reject(new ApiResponseError({ success: false, error: `Unknown type key ${String(type)}` }))
  return loadTypeKey(type)
})
