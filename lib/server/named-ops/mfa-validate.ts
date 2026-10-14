import "server-only"

import { z } from "zod"
import { jsonError, jsonOk } from "@/lib/server/http/responses"
import { createNamedOp, failureResponse, relayClientError, type NamedOpDeps } from "@/lib/server/named-op"

export const MFA_VALIDATE_ROUTE = "/api/pp/mfa/validate"

/** The client body (Story 8.2). The code travels only in this body and the server-to-server query, never in an app URL or log. */
export const mfaValidateBodySchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) })

/**
 * `POST /api/pp/mfa/validate` (Story 8.2, AD-2): moves `{ code }` into the
 * upstream `POST v2/mfa/validate?code=` and answers its boolean as JSON
 * (`false` = wrong code, not an error). Upstream 4xx are relayed in the
 * upstream envelope (403 → `FORBIDDEN` on the client); a non-boolean 2xx is
 * 502 `UPSTREAM_ERROR`. Switched off with the Profile module (`"account"`).
 */
export function createMfaValidateHandler(deps: NamedOpDeps = {}) {
  return createNamedOp(
    {
      route: MFA_VALIDATE_ROUTE,
      killSwitch: "account",
      method: "POST",
      upstream: "1health",
      body: mfaValidateBodySchema,
      async handle({ body, upstream }) {
        const result = await upstream.json({ method: "POST", segments: ["v2", "mfa", "validate"], query: new URLSearchParams({ code: body.code }) })
        if (result.kind === "failed") return failureResponse(result.failure)
        if (result.kind === "client-error") return relayClientError(result.status, result.data)
        return typeof result.data === "boolean" ? jsonOk(result.data) : jsonError(502, "UPSTREAM_ERROR")
      },
    },
    deps,
  )
}
