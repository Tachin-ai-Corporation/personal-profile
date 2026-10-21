import "server-only"

import { ACTIVITY_AT_HEADER, ACTIVITY_HEADER, ACTIVITY_USER } from "@/lib/shared/bff-contract"
import { canRenewLastSeen } from "./refresh"
import { renewLastSeen } from "./session"
import type { SessionPayload } from "./types"

/** Records marked user activity only while a late cookie cannot overwrite rotated tokens. */
export async function recordSessionActivity(request: Request, response: Response, session: SessionPayload, at: number, completedAt: number): Promise<Response> {
  if (response.status === 401) return response
  if (request.headers.get(ACTIVITY_HEADER) !== ACTIVITY_USER) return response
  if (!canRenewLastSeen(session, at) || !canRenewLastSeen(session, completedAt)) return response
  let cookie: string
  try {
    cookie = await renewLastSeen(session, at)
  } catch {
    // Activity bookkeeping must not hide an acknowledged operation result.
    return response
  }
  const headers = new Headers(response.headers)
  headers.append("Set-Cookie", cookie)
  headers.set(ACTIVITY_AT_HEADER, String(at))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
