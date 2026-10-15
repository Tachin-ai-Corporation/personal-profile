/**
 * The Launching user's Contact Points (`GET v2/user/contact-point/list`), one
 * type per request (Story 1.9, AD-10). Maps the agents.md
 * `ContactPointResponseDTO`, where every field is nullable.
 */

import { z } from "zod"
import { normalizeRegion } from "@/lib/shared/phone"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { ApiResponseError, registerFetcher, unwrap } from "./fetcher"
import { CONTACT_POINT_TYPES, type ContactPointType } from "./keys"
import type { Myself } from "./myself"
import type { ApiResponse } from "./types"

export { CONTACT_POINT_TYPES, type ContactPointType }

/** The label the platform gives the primary row of a type. */
export const PRIMARY_LABEL = "Primary"

export interface ContactPoint {
  readonly id: number | null
  readonly name: string | null
  readonly value: string | null
  readonly type: string | null
  readonly label: string | null
  readonly isVerified: boolean | null
  readonly isNotificationEnabled: boolean | null
  readonly phoneNumberRegion: string | null
}

export function isContactPointType(value: unknown): value is ContactPointType {
  return typeof value === "string" && (CONTACT_POINT_TYPES as readonly string[]).includes(value)
}

const contactPointWireSchema = z.object({
  id: z.number().nullish(),
  name: z.string().nullish(),
  value: z.string().nullish(),
  type: z.string().nullish(),
  label: z.string().nullish(),
  isVerified: z.boolean().nullish(),
  isNotificationEnabled: z.boolean().nullish(),
  phoneNumberRegion: z.string().nullish(),
})

/** The domain rows, or `null` when the body is not a list of Contact Points. */
export function toContactPoints(raw: unknown): ContactPoint[] | null {
  const parsed = z.array(contactPointWireSchema).safeParse(raw)
  if (!parsed.success) return null
  return parsed.data.map((wire) => ({
    id: wire.id ?? null,
    name: wire.name ?? null,
    value: wire.value ?? null,
    type: wire.type ?? null,
    label: wire.label ?? null,
    isVerified: wire.isVerified ?? null,
    isNotificationEnabled: wire.isNotificationEnabled ?? null,
    phoneNumberRegion: wire.phoneNumberRegion ?? null,
  }))
}

/** The row labelled Primary with a value, if any. */
export function findPrimary(rows: readonly ContactPoint[] | undefined): ContactPoint | undefined {
  return rows?.find((row) => row.label === PRIMARY_LABEL && Boolean(row.value))
}

const digits = (value: string | null | undefined): string => (value ?? "").replace(/\D/g, "")

const isMobileRow = (row: ContactPoint): boolean => row.type === "Mobile" || row.type === null

/**
 * The region of `myself.phoneNumber` (`myself` has none), from the Mobile
 * rows (`keys.contactPoints("Mobile")`; a row with no `type` counts as
 * Mobile): the Primary row's, else the row whose number has the same digits
 * as `myself.phoneNumber`; `"us"` when neither exists or the row has no
 * region (spec F1, Story 7.4).
 */
export function primaryPhoneRegion(mobileRows: readonly ContactPoint[] | undefined, myself: Pick<Myself, "phoneNumber"> | undefined): string {
  const rows = (mobileRows ?? []).filter(isMobileRow)
  const wanted = digits(myself?.phoneNumber)
  const primary = rows.find((row) => row.label === PRIMARY_LABEL && Boolean(row.value))
  const matching = wanted ? rows.find((row) => digits(row.value) === wanted) : undefined
  return normalizeRegion((primary ?? matching)?.phoneNumberRegion)
}

export function contactPointsPath(type: ContactPointType): string {
  return proxyPath(`v2/user/contact-point/list?type=${encodeURIComponent(type)}`)
}

export async function fetchContactPoints(type: ContactPointType): Promise<ApiResponse<ContactPoint[]>> {
  const res = await callApi<unknown>("contact-points/fetchContactPoints", contactPointsPath(type))
  if (!res.success) return { ...res, data: undefined }
  const rows = toContactPoints(res.data)
  return rows
    ? { success: true, data: rows, statusCode: res.statusCode }
    : { success: false, statusCode: res.statusCode, error: "contact-points/fetchContactPoints returned an unexpected shape" }
}

/** The SWR loader of `keys.contactPoints(type)`. */
export function loadContactPoints(type: ContactPointType): Promise<ContactPoint[] | undefined> {
  return unwrap(fetchContactPoints(type))
}

registerFetcher("contact-points", (key) => {
  const type = key[2]
  if (!isContactPointType(type)) return Promise.reject(new ApiResponseError({ success: false, error: `Unknown contact type ${String(type)}` }))
  return loadContactPoints(type)
})
