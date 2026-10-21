/** Practice support (Team B, Story 9.3); the server derives the tenant. */
import { z } from "zod"
import { BFF_PATHS, type PracticeSupportBody } from "@/lib/shared/bff-contract"
import { callApi } from "./client"
import { registerFetcher, unwrap } from "./fetcher"
import type { ApiResponse } from "./types"

export function practiceSupportPath(): string {
  return BFF_PATHS.practiceSupport
}

const supportSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  phoneRegion: z.string().optional(),
  email: z.string().optional(),
})

/** Validate once and whitelist only the named operation's public fields. */
export async function getPracticeSupport(): Promise<ApiResponse<PracticeSupportBody>> {
  const response = await callApi<unknown>("practice-support/get", practiceSupportPath())
  if (!response.success) return { ...response, data: undefined }
  const parsed = supportSchema.safeParse(response.data)
  if (!parsed.success) return { success: false, statusCode: response.statusCode }
  return { success: true, statusCode: response.statusCode, data: parsed.data }
}

registerFetcher("practice-support", () => unwrap(getPracticeSupport()))
