import "server-only"

import { z } from "zod"
import type { AllowlistEntry } from "../types"

/** A page number: 0 to 9999, no leading zero (the client sends `page=0`). */
const PAGE = /^(?:0|[1-9]\d{0,3})$/

/** A page size: 1 to 100, no leading zero (`size=0` makes the backend's `PageRequest` throw; the client sends `size=100`). */
const SIZE = /^(?:[1-9]\d?|100)$/

/**
 * The backend `PersonLocationType` values (`PersonConstants…PersonLocationType.Values`):
 * the four the edit view offers (decision 2a) and the three other clients may
 * have saved. Anything else is refused here, as the backend would.
 */
export const PERSON_LOCATION_TYPES = ["Home", "Main Work", "Other Work", "Vacation Home", "Billing", "Mailing", "Temporary"] as const

/** The longest text field a write may hold (Story 4.2). */
export const ADDRESS_TEXT_MAX_LENGTH = 255

/**
 * The longest `fullAddress` a PUT may hold: four 255-character parts (line 1,
 * city, zip, country) and their separators fit. The backend stores text
 * attributes as Postgres `text` (`TypeUtil`) and sets no limit in code; a
 * per-attribute `maxLength` would be database configuration (to confirm with
 * the backend, `deferred-work.md`).
 */
export const ADDRESS_FULL_ADDRESS_MAX_LENGTH = 1100

/** A JSON body cap of 24 KB: the eight 255-character fields and a 1,100-character `fullAddress` fit even fully `\uXXXX`-escaped. */
export const ADDRESS_WRITE_MAX_BYTES = 24 * 1024

const text = z.string().max(ADDRESS_TEXT_MAX_LENGTH).optional()

/**
 * The fields a write may send (backend `PersonLocationRequestDTO`), Story
 * 4.2: the type, the address parts and the two flags, always named `primary`
 * / `validated` (decision 1a: the DTO silently ignores `isPrimary` /
 * `isValidated`, and on PUT an ignored `primary` demotes the current
 * Primary). Both flags are required, so a write never falls into the
 * backend's defaults (a missing `primary` on PUT sets it as Primary; a
 * missing `validated` on POST stores `true`). Never `countryCode` (decision
 * 3a), `lat` / `lon`, an id or an owner.
 */
const addressWriteFields = {
  personLocationType: z.enum(PERSON_LOCATION_TYPES).optional(),
  addressLine1: text,
  addressLine2: text,
  cityName: text,
  county: text,
  stateName: text,
  postalCode: text,
  country: text,
  primary: z.boolean(),
  validated: z.boolean(),
}

/** The body of `POST v2/person/location` (Story 4.2). Strict: anything else is 400 `BAD_BODY`. */
export const addressCreateBodySchema = z.strictObject(addressWriteFields)

/**
 * The body of `PUT v2/person/location/{id}` (Story 4.2): the create fields
 * plus `fullAddress`, which the backend builds only on create. Strict:
 * anything else is 400 `BAD_BODY`.
 */
export const addressUpdateBodySchema = z.strictObject({ ...addressWriteFields, fullAddress: z.string().max(ADDRESS_FULL_ADDRESS_MAX_LENGTH).optional() })

/** Addresses (Epic 4) entries; each lands with the story that calls it. */
export const entries: readonly AllowlistEntry[] = [
  /**
   * The caller's own addresses (Story 4.1), a Spring Page sorted newest
   * updated first. Only `page` (0–9999) and `size` (1–100), each once, without leading zeros; any
   * other or repeated param is 400 `BAD_QUERY`. No body.
   */
  { method: "GET", template: "v2/person/location/list", query: { page: { pattern: PAGE }, size: { pattern: SIZE } } },
  /** The Country select's list (Story 4.2): `[{ id, name }]`, no ISO code. No query (400 `BAD_QUERY`). */
  { method: "GET", template: "v2/public/countries" },
  /**
   * Adds an address to the caller's own person (Story 4.2). No query (400
   * `BAD_QUERY`), JSON only (415 `UNSUPPORTED_MEDIA`), nothing forced; it
   * answers the created `PersonLocationResponseDTO` (with its `id`).
   */
  { method: "POST", template: "v2/person/location", body: addressCreateBodySchema, maxBytes: ADDRESS_WRITE_MAX_BYTES },
  /**
   * Updates one of the caller's addresses (Story 4.2); the id is numeric
   * (anything else never matches). The backend refuses an address that
   * isn't the caller's. No query, JSON only, nothing forced.
   */
  { method: "PUT", template: "v2/person/location/{locationId}", body: addressUpdateBodySchema, maxBytes: ADDRESS_WRITE_MAX_BYTES },
  /**
   * Removes one of the caller's addresses (Story 4.4), a soft delete; the id
   * is numeric (anything else never matches). No query (400 `BAD_QUERY`) and
   * no body (400 `BAD_BODY`). The backend refuses an address that isn't the
   * caller's (or is already removed) and the current Primary.
   */
  { method: "DELETE", template: "v2/person/location/{locationId}" },
]
