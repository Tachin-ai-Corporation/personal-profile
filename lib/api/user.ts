/**
 * The Launching user (`GET v2/user/myself`), mapped to a clean domain type.
 */

import { z } from "zod"
import { callApi } from "./client"
import { endpoints } from "./config"
import type { ApiResponse } from "./types"

export interface Myself {
  readonly id: number
  /** Nullable per OneHealthUserDTO (a user may have no person record). */
  readonly personId: number | null
  readonly username: string
  readonly firstName: string
  readonly lastName: string
  readonly email: string
  readonly roles: readonly string[]
}

const myselfWireSchema = z.object({
  id: z.number(),
  personId: z.number().nullish(),
  username: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  email: z.string().nullish(),
  roles: z.array(z.string()).nullish(),
})

export function toMyself(raw: unknown): Myself | null {
  const parsed = myselfWireSchema.safeParse(raw)
  if (!parsed.success) return null
  const wire = parsed.data
  return {
    id: wire.id,
    personId: wire.personId ?? null,
    username: wire.username ?? "",
    firstName: wire.firstName ?? "",
    lastName: wire.lastName ?? "",
    email: wire.email ?? "",
    roles: wire.roles ?? [],
  }
}

export async function fetchMyself(): Promise<ApiResponse<Myself>> {
  const res = await callApi<unknown>("user/fetchMyself", endpoints.myself())
  if (!res.success) return { ...res, data: undefined }
  const myself = toMyself(res.data)
  return myself
    ? { success: true, data: myself, statusCode: res.statusCode }
    : { success: false, statusCode: res.statusCode, error: "user/fetchMyself returned an unexpected shape" }
}
