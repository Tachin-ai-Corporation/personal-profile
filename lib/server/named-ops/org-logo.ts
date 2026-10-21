import "server-only"

import { z } from "zod"
import { environmentConfig, type Environment } from "@/lib/shared/environments"
import { discardBody, fetchWithTimeout } from "@/lib/server/http/fetch-with-timeout"
import { IMAGE_CONTENT_TYPES, sniffImage, type ImageKind } from "@/lib/server/http/image-sniff"
import { readStreamCapped } from "@/lib/server/http/read-capped"
import { jsonError } from "@/lib/server/http/responses"
import { createNamedOp, type NamedOpDeps, type NamedOpFailure, type NamedOpContext, type UpstreamClient } from "@/lib/server/named-op"

export const ORG_LOGO_ROUTE = "/api/pp/org-logo/[tenantId]"

/** AD-24 limits. */
export const ORG_PAGE_SIZE = 50
export const ORG_MAX_PAGES = 5
export const LOGO_TIMEOUT_MS = 5_000
export const LOGO_MAX_BYTES = 512 * 1024

const NUMERIC_ID = /^\d{1,19}$/
/** Logos are served for these kinds only; SVG and everything else is "no logo". */
const LOGO_KINDS: readonly ImageKind[] = ["png", "jpeg", "webp"]
const NO_LOGO: NamedOpFailure = { status: 404, errorCode: "NO_LOGO" }

/** One page of `GET v2/user/organization/portal` (`PageImpl<OrganizationPortalResponseDTO>`); only what the lookup needs. */
const pageSchema = z.object({
  data: z.array(
    z.object({
      tenantId: z.union([z.number(), z.string()]).nullish(),
      tenantLogo: z.object({ publicUrl: z.string().nullish() }).nullish().catch(undefined),
    }),
  ),
  totalPages: z.number().int().nonnegative().nullish(),
  lastPage: z.boolean().nullish(),
})

export interface OrgLogoDeps extends NamedOpDeps {
  /** The public-files origin of an environment (default: `lib/shared/environments.ts`). */
  readonly publicFilesOrigin?: (environment: Environment) => string | null
}

/** Only this projection can enter the handler's private memory; no names or contacts. */
interface MembershipPage {
  readonly data: readonly { readonly tenantId: string; readonly publicUrl: string | null }[]
  readonly totalPages: number | null | undefined
  readonly lastPage: boolean | null | undefined
}

/** A failed or malformed page is never retained. */
async function readMembershipPage(upstream: UpstreamClient, page: number, origin: string | null): Promise<MembershipPage | null> {
  const query = new URLSearchParams({ page: String(page), size: String(ORG_PAGE_SIZE) })
  const result = await upstream.json({ method: "GET", segments: ["v2", "user", "organization", "portal"], query })
  if (result.kind !== "ok") return null
  const parsed = pageSchema.safeParse(result.data)
  if (!parsed.success) return null
  return {
    data: parsed.data.data.map((candidate) => ({
      // Unsafe numeric ids may have rounded during JSON.parse; never match them.
      tenantId: typeof candidate.tenantId === "string" || Number.isSafeInteger(candidate.tenantId) ? String(candidate.tenantId) : "",
      publicUrl: candidate.tenantLogo?.publicUrl ? allowedLogoUrl(candidate.tenantLogo.publicUrl, origin) : null,
    })),
    totalPages: parsed.data.totalPages,
    lastPage: parsed.data.lastPage,
  }
}

/** Short-lived membership snapshots, including in-flight reads, bounded per handler. */
function createMembershipReader(now: () => number) {
  const pages = new Map<string, { expiresAt: number; pending: Promise<MembershipPage | null> }>()
  return (ctx: NamedOpContext<unknown, string>, page: number, origin: string | null): Promise<MembershipPage | null> => {
    const lookupAt = now()
    for (const [key, entry] of pages) if (entry.expiresAt <= lookupAt) pages.delete(key)
    const { environment, sid, userId, personId, tenantId, gen } = ctx.session
    const key = JSON.stringify([environment, sid, userId, personId, tenantId, gen, page])
    const existing = pages.get(key)
    if (existing) return existing.pending
    if (pages.size >= 256) pages.delete(pages.keys().next().value!)
    // Start the maximum five-second window before upstream work, not on completion.
    const entry = { expiresAt: ctx.now + 5_000, pending: readMembershipPage(ctx.upstream, page, origin) }
    pages.set(key, entry)
    void entry.pending.then((result) => {
      // An evicted in-flight read must never delete a newer read for the same key.
      if (result === null && pages.get(key) === entry) pages.delete(key)
    })
    return entry.pending
  }
}

/** Stops at the matching member, empty/last page, or the five-page limit. */
async function findLogoUrl(readPage: (page: number) => Promise<MembershipPage | null>, tenantId: string): Promise<string | null> {
  for (let page = 0; page < ORG_MAX_PAGES; page += 1) {
    const result = await readPage(page)
    if (result === null) return null
    const item = result.data.find((candidate) => candidate.tenantId === tenantId)
    if (item) return item.publicUrl
    const { totalPages, lastPage, data } = result
    if (data.length === 0 || lastPage === true || (typeof totalPages === "number" && page + 1 >= totalPages)) return null
  }
  return null
}

/** `publicUrl` only when its origin is exactly the environment's public-files origin (AD-24). */
function allowedLogoUrl(publicUrl: string, origin: string | null): string | null {
  if (origin === null) return null
  try {
    const url = new URL(publicUrl)
    return url.origin === origin && url.username === "" && url.password === "" ? publicUrl : null
  } catch {
    return null
  }
}

/**
 * Fetches the logo with no credentials, no redirects, a 5 s deadline over the
 * whole body and a 512 KB cap (declared and while streaming); serves PNG,
 * JPEG or WebP by their leading bytes only.
 */
async function fetchLogo(url: string): Promise<Response | null> {
  const outcome = await fetchWithTimeout(url, { method: "GET", credentials: "omit", headers: { Accept: "image/png, image/jpeg, image/webp" } }, { timeoutMs: LOGO_TIMEOUT_MS })
  if (outcome.kind !== "response") return null
  const { response } = outcome
  const declared = Number(response.headers.get("Content-Length") ?? "0")
  if (response.status !== 200 || !(declared <= LOGO_MAX_BYTES)) {
    discardBody(response)
    return null
  }
  const read = await readStreamCapped(response.body, LOGO_MAX_BYTES)
  if (read.kind !== "ok") return null
  const kind = sniffImage(read.bytes)
  if (kind === null || !LOGO_KINDS.includes(kind)) return null
  return new Response(read.bytes, { status: 200, headers: { "Content-Type": IMAGE_CONTENT_TYPES[kind], "Content-Disposition": "inline" } })
}

/**
 * `GET /api/pp/org-logo/{tenantId}` (Story 10.2, AD-24): the logo of one of
 * the user's organizations, for `<img src>`. Every failure, including a bad
 * id, a stale token, not a member, a host mismatch, a redirect, a timeout, too
 * many bytes or the wrong bytes, is 404 `NO_LOGO` (the card shows initials).
 * Only a missing session (401) and the kill switch (503) differ.
 */
export function createOrgLogoHandler(deps: OrgLogoDeps = {}) {
  const filesOrigin = deps.publicFilesOrigin ?? ((environment: Environment) => environmentConfig(environment).publicFilesOrigin)
  const readPage = createMembershipReader(deps.now ?? Date.now)
  return createNamedOp(
    {
      route: ORG_LOGO_ROUTE,
      killSwitch: "account",
      method: "GET",
      upstream: "1health",
      params: (raw) => {
        const tenantId = raw.tenantId
        return typeof tenantId === "string" && NUMERIC_ID.test(tenantId) ? tenantId : null
      },
      failures: { badParams: NO_LOGO, tokenExpired: NO_LOGO },
      async handle(ctx) {
        const origin = filesOrigin(ctx.session.environment)
        const url = await findLogoUrl((page) => readPage(ctx, page, origin), ctx.params)
        const logo = url === null ? null : await fetchLogo(url)
        return logo ?? jsonError(NO_LOGO.status, NO_LOGO.errorCode)
      },
    },
    deps,
  )
}
