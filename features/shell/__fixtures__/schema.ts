import { z } from "zod"
import { CONTACT_MESSAGES } from "@/lib/shared/messages"

/** The fixture Section's schema (F3-2): one required 10-digit number and an optional (trimmed) note. Messages are catalog copy. */
export const fixtureSectionSchema = z.object({
  number: z.string().regex(/^\d{10}$/, { message: CONTACT_MESSAGES.phoneTenDigits }),
  /** Trimmed on parse: the parsed values (sent) differ from the raw ones. */
  note: z.string().trim(),
})

export type FixtureSectionValues = z.infer<typeof fixtureSectionSchema>
