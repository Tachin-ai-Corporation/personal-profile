import "server-only"

import { createHmac } from "node:crypto"
import { z } from "zod"
import { PLACES_COUNTRIES, type PlaceAddress, type PlacesAutocompleteBody, type PlacesDetailsBody, type PlaceSuggestion } from "@/lib/shared/bff-contract"
import type { ServerEnv } from "@/lib/server/env"
import { discardBody, fetchWithTimeout } from "@/lib/server/http/fetch-with-timeout"
import { readStreamCapped } from "@/lib/server/http/read-capped"
import { jsonError, jsonOk } from "@/lib/server/http/responses"
import { createNamedOp, type NamedOpDeps } from "@/lib/server/named-op"

/**
 * Address suggestions (Story 4.3, AD-14): Google Places (New), server-side
 * only, with the deployment's `GOOGLE_PLACES_KEY`. No Google script, key or
 * URL reaches the browser, and typed text, place ids and addresses are never
 * logged (the wrapper logs the route template only).
 */

export const PLACES_AUTOCOMPLETE_ROUTE = "/api/places/autocomplete"
export const PLACES_DETAILS_ROUTE = "/api/places/details"

const PLACES_API = "https://places.googleapis.com/v1"
export const PLACES_TIMEOUT_MS = 5_000
const PLACES_MAX_BYTES = 256 * 1024
export const MAX_SUGGESTIONS = 5
/** The server-constant Place Details field mask: address components + formatted address only. */
export const DETAILS_FIELD_MASK = "addressComponents,formattedAddress"

/** One address lookup (typing then picking), chosen by the client per lookup: a UUID v4. */
const lookupId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

export const autocompleteBodySchema = z.object({
  /** 1–120 characters as sent, at least one that is not a space; forwarded trimmed. */
  input: z.string().max(120).trim().min(1),
  countryCode: z.string().max(8),
  lookupId,
})

export const detailsBodySchema = z.object({
  placeId: z.string().regex(/^[A-Za-z0-9_-]{10,300}$/),
  lookupId,
})

/**
 * The Places session token of one lookup (AD-14): HMAC of the session's `sid`
 * and the client's per-lookup UUID, so it is bound to the app session, never
 * chosen by the client, and new for every lookup (a details call ends one).
 * 27 HMAC bytes → 36 base64url characters (Google's limit).
 */
export function placesSessionToken(sid: string, lookup: string, secret: string): string {
  return createHmac("sha256", secret).update(`places:${sid}:${lookup.toLowerCase()}`).digest().subarray(0, 27).toString("base64url")
}

const textSchema = z.object({ text: z.string() })
const matchesSchema = z.array(z.object({ startOffset: z.number().int().nonnegative().optional(), endOffset: z.number().int().nonnegative() })).optional()

const autocompleteAnswerSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            text: textSchema.optional(),
            structuredFormat: z
              .object({ mainText: textSchema.extend({ matches: matchesSchema }), secondaryText: textSchema.optional() })
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
})

const detailsAnswerSchema = z.object({
  formattedAddress: z.string().optional(),
  addressComponents: z
    .array(z.object({ longText: z.string().optional(), shortText: z.string().optional(), types: z.array(z.string()).optional() }))
    .optional(),
})

/** A Google call's result; `reason` is a PHI-free code for the log line. */
type GoogleResult = { readonly kind: "ok"; readonly data: unknown } | { readonly kind: "timeout" | "error"; readonly reason: string }

async function callGoogle(url: string, init: RequestInit): Promise<GoogleResult> {
  const outcome = await fetchWithTimeout(url, init, { timeoutMs: PLACES_TIMEOUT_MS })
  if (outcome.kind === "timeout") return { kind: "timeout", reason: "google_timeout" }
  if (outcome.kind === "network") return { kind: "error", reason: "google_network" }
  if (outcome.response.status !== 200) {
    discardBody(outcome.response)
    return { kind: "error", reason: `google_status_${outcome.response.status}` }
  }
  const read = await readStreamCapped(outcome.response.body, PLACES_MAX_BYTES)
  if (read.kind === "timeout") return { kind: "timeout", reason: "google_timeout" }
  if (read.kind === "too-large") return { kind: "error", reason: "google_too_large" }
  if (read.kind !== "ok") return { kind: "error", reason: "google_body_error" }
  try {
    return { kind: "ok", data: JSON.parse(new TextDecoder().decode(read.bytes)) as unknown }
  } catch {
    return { kind: "error", reason: "google_parse" }
  }
}

/** The key, or `null` (then no Google call is made and `places_key_missing` is logged). */
function placesKey(env: ServerEnv): string | null {
  return env.GOOGLE_PLACES_KEY ? env.GOOGLE_PLACES_KEY : null
}

/** At most 5 suggestions with a place id and main text; anything else is dropped. */
export function toSuggestions(data: unknown): PlaceSuggestion[] {
  const parsed = autocompleteAnswerSchema.safeParse(data)
  if (!parsed.success) return []
  const out: PlaceSuggestion[] = []
  for (const suggestion of parsed.data.suggestions ?? []) {
    const prediction = suggestion.placePrediction
    const main = prediction?.structuredFormat?.mainText
    if (!prediction || !main) continue
    out.push({
      placeId: prediction.placeId,
      mainText: main.text,
      secondaryText: prediction.structuredFormat?.secondaryText?.text ?? "",
      matches: (main.matches ?? [])
        .map((match) => ({ start: match.startOffset ?? 0, end: match.endOffset }))
        .filter(({ start, end }) => start <= end && end <= main.text.length),
    })
    if (out.length === MAX_SUGGESTIONS) break
  }
  return out
}

/** Normalizes Place Details `addressComponents` (missing parts are `""`). */
export function toAddress(data: unknown): PlaceAddress | null {
  const parsed = detailsAnswerSchema.safeParse(data)
  if (!parsed.success) return null
  const components = parsed.data.addressComponents ?? []
  const part = (type: string, form: "longText" | "shortText" = "longText"): string =>
    components.find((component) => component.types?.includes(type))?.[form]?.trim() ?? ""

  const streetNumber = part("street_number")
  const route = part("route")
  const cityName = part("locality") || part("postal_town") || part("sublocality")
  const postalCode = part("postal_code")
  const countryCode = part("country", "shortText")
  return {
    addressLine1: [streetNumber, route].filter(Boolean).join(" "),
    cityName,
    county: part("administrative_area_level_2"),
    stateName: part("administrative_area_level_1"),
    postalCode,
    countryCode,
    country: part("country"),
    fullAddress: parsed.data.formattedAddress?.trim() ?? "",
    complete: Boolean(streetNumber && route && cityName && postalCode && countryCode),
  }
}

function isPlacesCountry(value: string): value is (typeof PLACES_COUNTRIES)[number] {
  return (PLACES_COUNTRIES as readonly string[]).includes(value)
}

/**
 * `POST /api/places/autocomplete { input, countryCode }`. `PLACES_ENABLED` off
 * → `{ enabled: false, suggestions: [] }`; a country outside US/CA/AU, or any
 * Google failure → `{ enabled: true, suggestions: [] }` (manual entry always
 * works). Input must be 1–120 characters (else 400 `BAD_BODY`).
 */
export function createPlacesAutocompleteHandler(deps: NamedOpDeps = {}) {
  return createNamedOp(
    {
      route: PLACES_AUTOCOMPLETE_ROUTE,
      killSwitch: "pp",
      method: "POST",
      upstream: "external",
      body: autocompleteBodySchema,
      async handle({ body, env, session, setOutcome }) {
        if (!env.PLACES_ENABLED) return jsonOk({ enabled: false, suggestions: [] } satisfies PlacesAutocompleteBody)
        const country = body.countryCode.toUpperCase()
        if (!isPlacesCountry(country)) return jsonOk({ enabled: true, suggestions: [] } satisfies PlacesAutocompleteBody)
        const key = placesKey(env)
        if (key === null) {
          setOutcome("places_key_missing")
          return jsonOk({ enabled: true, suggestions: [] } satisfies PlacesAutocompleteBody)
        }

        const result = await callGoogle(`${PLACES_API}/places:autocomplete`, {
          method: "POST",
          headers: new Headers({ "X-Goog-Api-Key": key, "Content-Type": "application/json" }),
          body: JSON.stringify({
            input: body.input,
            includedRegionCodes: [country.toLowerCase()],
            sessionToken: placesSessionToken(session.sid, body.lookupId, env.SESSION_SECRET),
          }),
        })
        if (result.kind !== "ok") setOutcome(result.reason)
        const suggestions = result.kind === "ok" ? toSuggestions(result.data) : []
        return jsonOk({ enabled: true, suggestions } satisfies PlacesAutocompleteBody)
      },
    },
    deps,
  )
}

/**
 * `POST /api/places/details { placeId }`: the normalized address of one
 * suggestion, ending the Places session. `PLACES_ENABLED` off →
 * `{ enabled: false }`; Google timeout → 504, any other Google failure → 502.
 */
export function createPlacesDetailsHandler(deps: NamedOpDeps = {}) {
  return createNamedOp(
    {
      route: PLACES_DETAILS_ROUTE,
      killSwitch: "pp",
      method: "POST",
      upstream: "external",
      body: detailsBodySchema,
      async handle({ body, env, session, setOutcome }) {
        if (!env.PLACES_ENABLED) return jsonOk({ enabled: false } satisfies PlacesDetailsBody)
        const key = placesKey(env)
        if (key === null) {
          setOutcome("places_key_missing")
          return jsonError(502, "UPSTREAM_ERROR")
        }

        const query = new URLSearchParams({ sessionToken: placesSessionToken(session.sid, body.lookupId, env.SESSION_SECRET) })
        const result = await callGoogle(`${PLACES_API}/places/${encodeURIComponent(body.placeId)}?${query}`, {
          method: "GET",
          headers: new Headers({ "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_FIELD_MASK }),
        })
        if (result.kind !== "ok") {
          setOutcome(result.reason)
          return result.kind === "timeout" ? jsonError(504, "UPSTREAM_TIMEOUT") : jsonError(502, "UPSTREAM_ERROR")
        }
        const address = toAddress(result.data)
        if (address === null) {
          setOutcome("google_shape")
          return jsonError(502, "UPSTREAM_ERROR")
        }
        return jsonOk({ enabled: true, ...address } satisfies PlacesDetailsBody)
      },
    },
    deps,
  )
}
