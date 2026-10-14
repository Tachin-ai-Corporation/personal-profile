import "server-only"

import { z } from "zod"
import type { ProfilePictureIdBody } from "@/lib/shared/bff-contract"
import { jsonError, jsonOk } from "@/lib/server/http/responses"
import { createNamedOp, failureResponse, type NamedOpDeps } from "@/lib/server/named-op"

export const PROFILE_PICTURE_ID_ROUTE = "/api/pp/profile-picture-id"

/**
 * The one GraphQL document of the app (Story 1.9, AD-2): the Launching user's
 * Person and its Profile Picture relation. The text is a server constant and
 * the only variable is the session's `userId`; GraphQL is never proxied.
 */
export const PROFILE_PICTURE_QUERY =
  "query ($filter: PersonFilterInput) { Person (filter: $filter) { records { PersonHasProfilePictureFile { relations { record { id } } } } } }"

/** GraphQL may serialize the Long id as a number or a decimal string; either must be a positive safe integer. */
const fileIdSchema = z
  .union([z.number(), z.string().regex(/^\d{1,19}$/)])
  .transform(Number)
  .refine((id) => Number.isSafeInteger(id) && id > 0)

const answerSchema = z.object({
  data: z.object({
    Person: z.object({
      records: z.array(
        z.object({
          PersonHasProfilePictureFile: z
            .object({ relations: z.array(z.object({ record: z.object({ id: fileIdSchema }) })) })
            .nullish(),
        }),
      ),
    }),
  }),
})

/** `errors` present and non-empty: the whole answer is an upstream error, whatever `data` holds. */
const errorsSchema = z.object({ errors: z.array(z.unknown()).min(1) })

/** The picture's file id, `null` when there is none, or `undefined` for an unusable answer. */
export function pictureFileId(answer: unknown): number | null | undefined {
  if (errorsSchema.safeParse(answer).success) return undefined
  const parsed = answerSchema.safeParse(answer)
  if (!parsed.success) return undefined
  return parsed.data.data.Person.records[0]?.PersonHasProfilePictureFile?.relations[0]?.record.id ?? null
}

/**
 * `GET /api/pp/profile-picture-id` (Story 1.9): `200 { fileId }` for the
 * session's user. Any upstream error, GraphQL `errors` or unexpected shape →
 * 502 `UPSTREAM_ERROR` without the upstream body; an upstream 401 stays
 * `TOKEN_EXPIRED` (the client refreshes and replays) and a timeout 504.
 */
export function createProfilePictureIdHandler(deps: NamedOpDeps = {}) {
  return createNamedOp(
    {
      route: PROFILE_PICTURE_ID_ROUTE,
      killSwitch: "pp",
      method: "GET",
      upstream: "1health",
      async handle({ session, upstream }) {
        const result = await upstream.json({
          method: "POST",
          segments: ["graphql"],
          body: { query: PROFILE_PICTURE_QUERY, variables: { filter: { userId: { equal: session.userId } } } },
        })
        if (result.kind === "failed") return failureResponse(result.failure)
        const fileId = result.kind === "ok" ? pictureFileId(result.data) : undefined
        if (fileId === undefined) return jsonError(502, "UPSTREAM_ERROR")
        const body: ProfilePictureIdBody = { fileId }
        return jsonOk(body)
      },
    },
    deps,
  )
}
