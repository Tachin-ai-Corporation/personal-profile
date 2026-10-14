import "server-only"

import { z } from "zod"
import type { PracticeSupportBody } from "@/lib/shared/bff-contract"
import { jsonError, jsonOk } from "@/lib/server/http/responses"
import { createNamedOp, failureResponse, relayClientError, type NamedOpDeps, type UpstreamJsonResult } from "@/lib/server/named-op"

export const PRACTICE_SUPPORT_ROUTE = "/api/pp/practice-support"

const NUMERIC_ID = /^\d{1,19}$/

/** `GET v2/user/npi` (`PersonWithNpiDTO`): only the practice organization's tenant id is read. */
const npiSchema = z.object({
  practiceNpi: z
    .object({ organization: z.object({ tenantId: z.union([z.number(), z.string().regex(NUMERIC_ID)]).nullish() }).nullish() })
    .nullish(),
})

/** A usable tenant id: a non-negative safe integer (a larger id cannot be read exactly), else `null`. */
function safeTenantId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id >= 0 ? id : null
}

const text = z.string().nullish().catch(undefined)

/** `GET v2/tenant/sys-config` (`SysTenantConfigResponseDTO[]`): only the support contact is read. */
const sysConfigSchema = z.array(
  z.object({
    tenantId: z.union([z.number(), z.string()]).nullish(),
    tenantName: text,
    supportEmail: text,
    supportPhone: text,
    supportPhoneRegion: text,
    organization: z.object({ name: text, shortOrganizationName: text }).nullish().catch(undefined),
  }),
)

type SysConfig = z.infer<typeof sysConfigSchema>[number]

function present(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** The whitelisted support contact; nothing else from the upstream body reaches the client (AD-25). */
export function supportContact(config: SysConfig | undefined): PracticeSupportBody {
  if (!config) return {}
  const fields: Record<keyof PracticeSupportBody, string | undefined> = {
    name: present(config.organization?.shortOrganizationName) ?? present(config.organization?.name) ?? present(config.tenantName),
    phone: present(config.supportPhone),
    phoneRegion: present(config.supportPhoneRegion),
    email: present(config.supportEmail),
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

/** A failed or unexpected upstream answer: upstream 403 relayed (→ `FORBIDDEN`), other 4xx masked. */
function upstreamFailure(result: Exclude<UpstreamJsonResult, { kind: "ok" }>): Response {
  if (result.kind === "failed") return failureResponse(result.failure)
  return result.status === 403 ? relayClientError(403, result.data) : jsonError(502, "UPSTREAM_ERROR")
}

/**
 * `GET /api/pp/practice-support` (Story 9.3, AD-25): reads `GET v2/user/npi`,
 * takes `practiceNpi.organization.tenantId` (absent → 404 `NO_PRACTICE`),
 * then calls `v2/tenant/sys-config` with exactly `Tenant IDs=<id>` and
 * `includeAllRelations=true`, and answers only `{ name?, phone?,
 * phoneRegion?, email? }`. The tenant id never comes from the browser.
 */
export function createPracticeSupportHandler(deps: NamedOpDeps = {}) {
  return createNamedOp(
    {
      route: PRACTICE_SUPPORT_ROUTE,
      killSwitch: "account",
      method: "GET",
      upstream: "1health",
      async handle({ upstream }) {
        const npi = await upstream.json({ method: "GET", segments: ["v2", "user", "npi"] })
        // A user without an NPI record: no practice (the backend answers nulls today; a 404 means the same).
        if (npi.kind === "client-error" && npi.status === 404) return jsonError(404, "NO_PRACTICE")
        if (npi.kind !== "ok") return upstreamFailure(npi)
        const parsedNpi = npiSchema.safeParse(npi.data ?? {})
        if (!parsedNpi.success) return jsonError(502, "UPSTREAM_ERROR")
        const tenantId = safeTenantId(parsedNpi.data.practiceNpi?.organization?.tenantId)
        if (tenantId === null) return jsonError(404, "NO_PRACTICE")

        const id = String(tenantId)
        const query = new URLSearchParams([
          ["Tenant IDs", id],
          ["includeAllRelations", "true"],
        ])
        const config = await upstream.json({ method: "GET", segments: ["v2", "tenant", "sys-config"], query })
        if (config.kind !== "ok") return upstreamFailure(config)
        const parsedConfig = sysConfigSchema.safeParse(config.data)
        if (!parsedConfig.success) return jsonError(502, "UPSTREAM_ERROR")
        const match = parsedConfig.data.find((item) => String(item.tenantId) === id)
        return jsonOk(supportContact(match))
      },
    },
    deps,
  )
}
