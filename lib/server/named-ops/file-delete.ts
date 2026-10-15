import "server-only"

import { z } from "zod"
import { jsonError, noContent } from "@/lib/server/http/responses"
import { createNamedOp, failureResponse, relayClientError, type NamedOpDeps, type RouteParams, type UpstreamClient } from "@/lib/server/named-op"
import { pictureFileIds, profilePictureRequest } from "./profile-picture-id"

export const FILE_DELETE_ROUTE = "/api/pp/file/[fileId]"

/** Insurance pages read for the card-file check: 100 policies each, at most 5 pages (fail closed beyond). */
export const INSURANCE_PAGE_SIZE = 100
export const INSURANCE_MAX_PAGES = 5

const FILE_ID = /^\d{1,19}$/

/** A positive safe-integer id (number or decimal string), else `undefined`. */
const idSchema = z
  .union([z.number(), z.string().regex(FILE_ID)])
  .transform(Number)
  .refine((id) => Number.isSafeInteger(id) && id > 0)

const fileRef = z.object({ id: idSchema.optional().catch(undefined) }).nullish().catch(null)

const myselfSchema = z.object({ signature: fileRef.optional() })

const insurancePageSchema = z.object({
  content: z.array(z.object({ frontSideCardFile: fileRef.optional(), backSideCardFile: fileRef.optional() })),
  last: z.boolean().optional(),
})

type Lookup = { readonly kind: "ids"; readonly ids: readonly number[] } | { readonly kind: "response"; readonly response: Response }

const NOT_OWNED = (): Response => jsonError(404, "NO_FILE")
const UNUSABLE = (): Response => jsonError(502, "UPSTREAM_ERROR")

/** The route's `fileId`, or `null` (→ 404 `NO_FILE`, the same answer as "not yours"). */
export function parseFileIdParam(raw: RouteParams): number | null {
  const value = raw.fileId
  if (typeof value !== "string" || !FILE_ID.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** `GET v2/user/myself` → the Signature file id (`OneHealthUserDTO.signature`, an `IdNameDTO`). */
async function signatureIds(upstream: UpstreamClient): Promise<Lookup> {
  const result = await upstream.json({ method: "GET", segments: ["v2", "user", "myself"] })
  if (result.kind === "failed") return { kind: "response", response: failureResponse(result.failure) }
  if (result.kind === "client-error") return { kind: "response", response: UNUSABLE() }
  const parsed = myselfSchema.safeParse(result.data)
  if (!parsed.success) return { kind: "response", response: UNUSABLE() }
  const id = parsed.data.signature?.id
  return { kind: "ids", ids: id === undefined ? [] : [id] }
}

/** The `PersonHasProfilePictureFile` file ids (the `profile-picture-id` GraphQL document). */
async function pictureIds(upstream: UpstreamClient, userId: number): Promise<Lookup> {
  const result = await upstream.json(profilePictureRequest(userId))
  if (result.kind === "failed") return { kind: "response", response: failureResponse(result.failure) }
  const ids = result.kind === "ok" ? pictureFileIds(result.data) : undefined
  return ids === undefined ? { kind: "response", response: UNUSABLE() } : { kind: "ids", ids }
}

/**
 * `GET v2/health/patient/insurance` (`PageImpl<ResponseInsuranceDTO>`): the
 * front/back card file ids of the caller's own policies, page by page until
 * `last` (more than `INSURANCE_MAX_PAGES` pages fails closed).
 */
async function cardIds(upstream: UpstreamClient): Promise<Lookup> {
  const ids: number[] = []
  for (let page = 0; page < INSURANCE_MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ page: String(page), size: String(INSURANCE_PAGE_SIZE) })
    const result = await upstream.json({ method: "GET", segments: ["v2", "health", "patient", "insurance"], query })
    if (result.kind === "failed") return { kind: "response", response: failureResponse(result.failure) }
    if (result.kind === "client-error") return { kind: "response", response: UNUSABLE() }
    const parsed = insurancePageSchema.safeParse(result.data)
    if (!parsed.success) return { kind: "response", response: UNUSABLE() }
    for (const policy of parsed.data.content) {
      for (const file of [policy.frontSideCardFile, policy.backSideCardFile]) if (file?.id !== undefined) ids.push(file.id)
    }
    if (parsed.data.last !== false || parsed.data.content.length === 0) return { kind: "ids", ids }
  }
  return { kind: "response", response: UNUSABLE() }
}

/**
 * `DELETE /api/pp/file/<fileId>` (spec F7-2; Stories 1.10, 2.4, 5.3): hard-
 * deletes one of the caller's own files. The backend's `DELETE v2/file/{id}`
 * checks only the tenant, so the proxy has no generic delete entry; this op
 * first proves, with the session's token, that the id is the caller's
 * profile picture, Signature or an insurance card of their own policies, and
 * only then sends `DELETE v2/file/{id}?hardDelete=true`.
 *
 * - Not owned or a malformed id → 404 `NO_FILE` (one answer, no oracle).
 * - A failed or unusable ownership lookup fails closed (nothing deleted):
 *   401 `TOKEN_EXPIRED` (the client refreshes and replays), 502/504.
 * - The delete itself: 2xx → 204; an upstream 4xx is relayed; else 502/504.
 *
 * The lookups stop at the first match (myself, then the picture, then the
 * insurance pages).
 */
export function createFileDeleteHandler(deps: NamedOpDeps = {}) {
  return createNamedOp<undefined, number>(
    {
      route: FILE_DELETE_ROUTE,
      killSwitch: "pp",
      method: "DELETE",
      upstream: "1health",
      params: parseFileIdParam,
      failures: { badParams: { status: 404, errorCode: "NO_FILE" } },
      async handle({ session, params: fileId, upstream, setOutcome }) {
        const lookups = [() => signatureIds(upstream), () => pictureIds(upstream, session.userId), () => cardIds(upstream)]
        let owned = false
        for (const lookup of lookups) {
          const found = await lookup()
          if (found.kind === "response") {
            setOutcome("ownership_lookup_failed")
            return found.response
          }
          if (found.ids.includes(fileId)) {
            owned = true
            break
          }
        }
        if (!owned) {
          setOutcome("not_owned")
          return NOT_OWNED()
        }

        const result = await upstream.json({
          method: "DELETE",
          segments: ["v2", "file", String(fileId)],
          query: new URLSearchParams({ hardDelete: "true" }),
        })
        if (result.kind === "failed") return failureResponse(result.failure)
        if (result.kind === "client-error") return relayClientError(result.status, result.data)
        return noContent()
      },
    },
    deps,
  )
}
