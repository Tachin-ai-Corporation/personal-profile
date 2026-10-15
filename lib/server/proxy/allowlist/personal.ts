import "server-only"

import { z } from "zod"
import {
  NAME_MAX_LENGTH,
  normalizeName,
  PREFIX_SUFFIX_MAX_LENGTH,
  SHORT_TEXT_MAX_LENGTH,
  textIssue,
} from "@/lib/shared/person-rules"
import type { AllowlistEntry } from "../types"

/**
 * `PUT v2/user/edit`, shared by Personal information (Epic 2) and Account
 * settings (Epic 7). The body is the backend `PersonalInformationDTO` with the
 * limits of `UserServiceImpl#validateUserAttributes` (`OneHealthConstants`,
 * `PersonConstants` enums, `StringUtil` SSN pattern).
 */

/**
 * A person text field, checked with the client's own rule
 * (`lib/shared/person-rules#textIssue`: trimmed, 1–`max` code points,
 * printable only) and forwarded trimmed, so a value the form accepts is never
 * a 400 here.
 */
const text = (max: number) =>
  z
    .string()
    .transform(normalizeName)
    .refine((value) => textIssue(value, max) === null)

/** `PersonConstants.Race` literals. */
export const RACES = [
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Middle Eastern or North African",
  "Native Hawaiian or other Pacific Islander",
  "White",
  "Other Race",
  "Unknown",
] as const
/** `PersonConstants.Ethnicity` literals. */
export const ETHNICITIES = ["Unknown", "Hispanic or Latino", "Not Hispanic or Latino"] as const
/** `PersonConstants.BiologicalGender` literals. */
export const BIOLOGICAL_GENDERS = ["Male", "Female", "Other", "Unknown", "Asked but not answered"] as const

/**
 * The body (strict: anything else is 400 `BAD_BODY`). `locale` (its own
 * endpoint), `username`, `enabled`, `receiveNotifications` and admin-only
 * fields are never accepted. `email`, `phoneNumber` and `phoneNumberRegion`
 * are accepted only because `updateAccount()` (Story 7.6) builds them; lint
 * restricts that builder to `features/account` (AD-9). `phoneNumber` and
 * `phoneNumberRegion` travel only together.
 */
export const userEditBodySchema = z
  .strictObject({
    firstName: text(NAME_MAX_LENGTH).optional(),
    middleName: text(NAME_MAX_LENGTH).optional(),
    lastName: text(NAME_MAX_LENGTH).optional(),
    otherNames: text(NAME_MAX_LENGTH).optional(),
    titles: text(NAME_MAX_LENGTH).optional(),
    namePrefix: text(PREFIX_SUFFIX_MAX_LENGTH).optional(),
    nameSuffix: text(PREFIX_SUFFIX_MAX_LENGTH).optional(),
    cityOfBirth: text(SHORT_TEXT_MAX_LENGTH).optional(),
    sexualOrientation: text(SHORT_TEXT_MAX_LENGTH).optional(),
    genderIdentity: text(SHORT_TEXT_MAX_LENGTH).optional(),
    race: z.enum(RACES).optional(),
    ethnicity: z.enum(ETHNICITIES).optional(),
    biologicalGender: z.enum(BIOLOGICAL_GENDERS).optional(),
    /** A backend `LocalDate`: `YYYY-MM-DD` only ("n/a" is not a date). */
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    preferredLanguage: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Za-z]{2})?$/)
      .optional(),
    socialSecurityNumber: z
      .string()
      .regex(/^(\d{3}-\d{2}-\d{4}|\d{9}|n\/a)$/)
      .optional(),
    email: z.email().max(254).optional(),
    phoneNumber: z
      .string()
      .regex(/^\+?[0-9 ()-]{4,32}$/)
      .optional(),
    phoneNumberRegion: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .optional(),
  })
  .refine((body) => (body.phoneNumber === undefined) === (body.phoneNumberRegion === undefined))

/** AD-13: a Signature is a PNG of at most 1 MB (Story 2.4). */
export const SIGNATURE_MAX_BYTES = 1024 * 1024

export const entries: readonly AllowlistEntry[] = [
  { method: "PUT", template: "v2/user/edit", body: userEditBodySchema },
  /** First Signature (Story 2.4): private, one `file` part, PNG only. */
  {
    method: "POST",
    template: "v2/health/type/Person/{personId}/relation/PersonHasSignatureFile/file/upload",
    fixedQuery: { isPublic: "false" },
    upload: { part: "file", types: ["png"] },
    maxBytes: SIGNATURE_MAX_BYTES,
  },
  /** A new Signature version (Story 2.4): made current, one `fileNewVersion` part, PNG only. */
  {
    method: "POST",
    template: "v2/file/{fileId}/version",
    fixedQuery: { current: "true" },
    upload: { part: "fileNewVersion", types: ["png"] },
    maxBytes: SIGNATURE_MAX_BYTES,
  },
  /** Person value lists (Story 2.1: race, ethnicity, biological gender), read by the shared `type-key` loader (spec F6-3). */
  { method: "GET", template: "v2/type/key/Person" },
]
