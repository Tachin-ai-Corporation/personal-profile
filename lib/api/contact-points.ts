/**
 * The Launching user's Contact Points (`GET v2/user/contact-point/list`), one
 * type per request (Story 1.9, AD-10). Maps the agents.md
 * `ContactPointResponseDTO`, where every field is nullable.
 */

import { z } from "zod"
import { callApi } from "./client"
import { endpoints } from "./config"
import type { ApiResponse } from "./types"

/** The types the proxy allowlist accepts for this endpoint. */
export const CONTACT_POINT_TYPES = ["Email", "Mobile", "Landline"] as const

export type ContactPointType = (typeof CONTACT_POINT_TYPES)[number]

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

export async function fetchContactPoints(type: ContactPointType): Promise<ApiResponse<ContactPoint[]>> {
  const res = await callApi<unknown>("contact-points/fetchContactPoints", endpoints.contactPoints(type))
  if (!res.success) return { ...res, data: undefined }
  const rows = toContactPoints(res.data)
  return rows
    ? { success: true, data: rows, statusCode: res.statusCode }
    : { success: false, statusCode: res.statusCode, error: "contact-points/fetchContactPoints returned an unexpected shape" }
}
