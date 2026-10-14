import "server-only"

import { z } from "zod"
import type { AllowlistEntry } from "./types"

/**
 * The shipped allowlist (AD-2). Adding an endpoint means adding an entry here
 * in the same change as the code that calls it.
 */

const name = z.string().max(100)

/** Backend PersonalInformationDTO: names are 1–24 characters (a middle name may be "n/a"). */
const personName = z.string().min(1).max(24)

/**
 * `PUT v2/user/edit` body. `email`, `phoneNumber`, `phoneNumberRegion` and
 * `locale` are rejected (strict object): only Story 7.6 opens the first three,
 * through `updateAccount()`. Admin-only fields (`roleId`, invitation fields)
 * are never accepted.
 */
export const userEditBodySchema = z.strictObject({
  firstName: personName.optional(),
  lastName: personName.optional(),
  middleName: personName.optional(),
  /** A backend `LocalDate`: `YYYY-MM-DD` only ("n/a" is not a date). */
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  biologicalGender: name.optional(),
  genderIdentity: name.optional(),
  sexualOrientation: name.optional(),
  ethnicity: name.optional(),
  race: name.optional(),
  preferredLanguage: z.string().max(10).optional(),
  socialSecurityNumber: z
    .string()
    .regex(/^(\d{3}-\d{2}-\d{4}|\d{9}|n\/a)$/)
    .optional(),
})

export const ALLOWLIST: readonly AllowlistEntry[] = [
  { method: "GET", template: "v2/user/myself" },
  {
    method: "GET",
    template: "v2/user/contact-point/list",
    query: { type: { pattern: /^(Email|Mobile|Landline)$/, repeatable: true } },
  },
  { method: "PUT", template: "v2/user/edit", body: userEditBodySchema },
]
