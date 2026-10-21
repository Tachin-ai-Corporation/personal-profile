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

/**
 * The backend's own page type (`com.sirma.bocore.common.repository.PageImpl`,
 * not Spring's `Page`): `{ data, pageNumber, pageSize, …, lastPage, totalPages }`.
 */
const insurancePageSchema = z.object({
  data: z.array(z.object({ id: idSchema.optional().catch(undefined), frontSideCardFile: fileRef.optional(), backSideCardFile: fileRef.optional() })),
  lastPage: z.boolean().optional(),
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

/**
 * Every `PersonHasSignatureFile` relation of the caller, not only the newest
 * that `myself.signature` shows (Story 2.4): a Signature is replaced by an
 * upload (a new relation) and then the old file is deleted, so the old id
 * must still count as the caller's. The text is a server constant and the
 * only variable is the session's `userId` (as the picture document).
 */
export const SIGNATURE_FILES_QUERY =
  "query ($filter: PersonFilterInput) { Person (filter: $filter) { records { PersonHasSignatureFile { relations { record { id } } } } } }"

const signatureAnswerSchema = z.object({
  data: z.object({
    Person: z.object({
      records: z.array(
        z.object({
          PersonHasSignatureFile: z.object({ relations: z.array(z.object({ record: z.object({ id: idSchema }) })) }).nullish(),
        }),
      ),
    }),
  }),
})

const graphqlErrorsSchema = z.object({ errors: z.array(z.unknown()).min(1) })

/** Every Signature file id related to the caller, or `undefined` for an unusable answer (GraphQL `errors`, another shape). */
export function signatureFileIds(answer: unknown): number[] | undefined {
  if (graphqlErrorsSchema.safeParse(answer).success) return undefined
  const parsed = signatureAnswerSchema.safeParse(answer)
  if (!parsed.success) return undefined
  return (parsed.data.data.Person.records[0]?.PersonHasSignatureFile?.relations ?? []).map((relation) => relation.record.id)
}

/** The Signature relations lookup (GraphQL), for an id that isn't the newest Signature, picture or card. */
async function signatureRelationIds(upstream: UpstreamClient, userId: number): Promise<Lookup> {
  const result = await upstream.json({
    method: "POST",
    segments: ["graphql"],
    body: { query: SIGNATURE_FILES_QUERY, variables: { filter: { userId: { equal: userId } } } },
  })
  if (result.kind === "failed") return { kind: "response", response: failureResponse(result.failure) }
  const ids = result.kind === "ok" ? signatureFileIds(result.data) : undefined
  return ids === undefined ? { kind: "response", response: UNUSABLE() } : { kind: "ids", ids }
}

/** The `PersonHasProfilePictureFile` file ids (the `profile-picture-id` GraphQL document). */
async function pictureIds(upstream: UpstreamClient, userId: number): Promise<Lookup> {
  const result = await upstream.json(profilePictureRequest(userId))
  if (result.kind === "failed") return { kind: "response", response: failureResponse(result.failure) }
  const ids = result.kind === "ok" ? pictureFileIds(result.data) : undefined
  return ids === undefined ? { kind: "response", response: UNUSABLE() } : { kind: "ids", ids }
}

/**
 * `GET v2/health/patient/insurance` (the backend's `PageImpl<ResponseInsuranceDTO>`,
 * `{ data, lastPage, … }`): the front/back card file ids of the caller's own
 * policies (the newest of each side, all the list shows), page by page until
 * `lastPage` or an empty `data` (more than `INSURANCE_MAX_PAGES` pages fails
 * closed). The policy ids go into `policyIds` for `cardRelationIds`.
 */
async function cardIds(upstream: UpstreamClient, policyIds: number[]): Promise<Lookup> {
  const ids: number[] = []
  for (let page = 0; page < INSURANCE_MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ page: String(page), size: String(INSURANCE_PAGE_SIZE) })
    const result = await upstream.json({ method: "GET", segments: ["v2", "health", "patient", "insurance"], query })
    if (result.kind === "failed") return { kind: "response", response: failureResponse(result.failure) }
    if (result.kind === "client-error") return { kind: "response", response: UNUSABLE() }
    const parsed = insurancePageSchema.safeParse(result.data)
    if (!parsed.success) return { kind: "response", response: UNUSABLE() }
    for (const policy of parsed.data.data) {
      if (policy.id !== undefined) policyIds.push(policy.id)
      for (const file of [policy.frontSideCardFile, policy.backSideCardFile]) if (file?.id !== undefined) ids.push(file.id)
    }
    if (parsed.data.lastPage !== false || parsed.data.data.length === 0) return { kind: "ids", ids }
  }
  return { kind: "response", response: UNUSABLE() }
}

/**
 * Every card relation of the caller's own policies, not only the newest file
 * of each side that the list shows (Story 5.3, decision 1A): a card is
 * replaced by an upload (a new relation; the old file stays related) and then
 * the old file is deleted, so the old id must still count as the caller's.
 * The text is a server constant; the only variables are the policy ids the
 * caller's own list just returned (`id in [...]`, the `InsuranceFilterInput`
 * of `GraphQLQueryProvider`). Not verified against a live backend yet, so the
 * filter isn't trusted: each record's own `id` is read back, and only the
 * relations of records that are the caller's policies count.
 */
export const INSURANCE_CARD_FILES_QUERY =
  "query ($filter: InsuranceFilterInput) { Insurance (filter: $filter) { records { id InsuranceHasFrontSideCardFile { relations { record { id } } } InsuranceHasBackSideCardFile { relations { record { id } } } } } }"

const cardRelationsSchema = z.object({ relations: z.array(z.object({ record: z.object({ id: idSchema }) })) }).nullish()

const cardAnswerSchema = z.object({
  data: z.object({
    Insurance: z.object({
      records: z.array(z.object({ id: idSchema, InsuranceHasFrontSideCardFile: cardRelationsSchema, InsuranceHasBackSideCardFile: cardRelationsSchema })),
    }),
  }),
})

/**
 * Every card file id related to one of `policyIds` (records of any other
 * policy are ignored, whatever the filter did), or `undefined` for an
 * unusable answer (GraphQL `errors`, another shape, a record without an id).
 */
export function insuranceCardFileIds(answer: unknown, policyIds: readonly number[]): number[] | undefined {
  if (graphqlErrorsSchema.safeParse(answer).success) return undefined
  const parsed = cardAnswerSchema.safeParse(answer)
  if (!parsed.success) return undefined
  const own = new Set(policyIds)
  return parsed.data.data.Insurance.records
    .filter((record) => own.has(record.id))
    .flatMap((record) =>
      [record.InsuranceHasFrontSideCardFile, record.InsuranceHasBackSideCardFile].flatMap((side) => (side?.relations ?? []).map((relation) => relation.record.id)),
    )
}

/** The card relations lookup (GraphQL) of the caller's policies; no policies, no request. */
async function cardRelationIds(upstream: UpstreamClient, policyIds: readonly number[]): Promise<Lookup> {
  if (policyIds.length === 0) return { kind: "ids", ids: [] }
  const result = await upstream.json({
    method: "POST",
    segments: ["graphql"],
    body: { query: INSURANCE_CARD_FILES_QUERY, variables: { filter: { id: { in: [...policyIds] } } } },
  })
  if (result.kind === "failed") return { kind: "response", response: failureResponse(result.failure) }
  const ids = result.kind === "ok" ? insuranceCardFileIds(result.data, policyIds) : undefined
  return ids === undefined ? { kind: "response", response: UNUSABLE() } : { kind: "ids", ids }
}

/**
 * `DELETE /api/pp/file/<fileId>` (spec F7-2; Stories 1.10, 2.4, 5.3): hard-
 * deletes one of the caller's own files. The backend's `DELETE v2/file/{id}`
 * checks only the tenant, so the proxy has no generic delete entry; this op
 * first proves, with the session's token, that the id is the caller's
 * profile picture, Signature (the newest, or any older Signature relation,
 * Story 2.4) or an insurance card of their own policies (the newest, or any
 * older card relation, Story 5.3), and only then sends
 * `DELETE v2/file/{id}?hardDelete=true`.
 *
 * - Not owned or a malformed id → 404 `NO_FILE` (one answer, no oracle).
 * - A failed or unusable ownership lookup fails closed (nothing deleted):
 *   401 `TOKEN_EXPIRED` (the client refreshes and replays), 502/504.
 * - The delete itself: 2xx → 204; an upstream 4xx is relayed; else 502/504.
 *
 * The lookups stop at the first match (myself, then the picture, then the
 * insurance pages, then the Signature relations, then the card relations of
 * the policies those pages listed: a failure of either relations read only
 * ever blocks the delete of an older Signature or card).
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
        const policyIds: number[] = []
        const lookups = [
          () => signatureIds(upstream),
          () => pictureIds(upstream, session.userId),
          () => cardIds(upstream, policyIds),
          () => signatureRelationIds(upstream, session.userId),
          () => cardRelationIds(upstream, policyIds),
        ]
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
