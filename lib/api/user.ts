/**
 * =============================================================================
 * User — the signed-in user (`GET /v2/user/myself`)
 * =============================================================================
 */

import { callApi, type ApiResponse } from "./client"

/** The signed-in user, as the app uses it. */
export interface Myself {
  id: number
  personId: number
  firstName: string
  lastName: string
}

/** Raw wire shape (only the fields we read). */
interface MyselfWire {
  id?: number
  personId?: number
  firstName?: string | null
  lastName?: string | null
}

function toMyself(wire: MyselfWire | undefined): Myself {
  return {
    id: Number(wire?.id),
    personId: Number(wire?.personId),
    firstName: typeof wire?.firstName === "string" ? wire.firstName : "",
    lastName: typeof wire?.lastName === "string" ? wire.lastName : "",
  }
}

/** Fetch the signed-in user through the proxy. */
export async function fetchMyself(): Promise<ApiResponse<Myself>> {
  const res = await callApi<MyselfWire>("user/fetchMyself", "/api/1h/v2/user/myself")
  if (!res.success) return res as ApiResponse<never>
  return { ...res, data: toMyself(res.data) }
}
