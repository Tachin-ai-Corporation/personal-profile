import { http, HttpResponse, type HttpHandler } from "msw"
import type { ContactPointType } from "@/lib/api"

/**
 * Unit-test fixtures for the Launching user (spec F6-3): a full
 * `GET v2/user/myself` wire payload (every field `toMyself` reads, all
 * filled, so a test sees real values unless it overrides them) and MSW
 * handlers for `myself` and the per-type Contact Point lists. Both teams
 * build on these instead of hand-writing `myself` bodies.
 *
 *   server.use(...myselfHandlers({ myself: myselfWire({ middleName: "n/a" }), contacts: { Email: [contactPointWire()] } }))
 */

export type MyselfWire = Record<string, unknown>

/** Every wire field of `UserDTO` the app maps (`lib/api/myself.ts`), filled. */
export function myselfWire(overrides: MyselfWire = {}): MyselfWire {
  return {
    id: 42,
    personId: 4242,
    username: "ann.lee",
    firstName: "Ann",
    middleName: "Marie",
    lastName: "Lee",
    namePrefix: "Dr.",
    nameSuffix: "Jr.",
    otherNames: "Ann Smith",
    titles: "MD",
    birthDate: "1990-04-15",
    cityOfBirth: "Springfield",
    race: "Asian",
    ethnicity: "Not Hispanic or Latino",
    biologicalGender: "Female",
    genderIdentity: "Woman",
    sexualOrientation: "Straight",
    socialSecurityNumber: "***-**-1234",
    signature: { id: 501, name: "signature.png" },
    email: "ann.lee@example.com",
    phoneNumber: "+14155552671",
    roles: ["Patient"],
    preferredLanguage: "en",
    timeZone: "America/Chicago",
    locale: "en-US",
    tenants: [{ id: 7, name: "Acme Clinic" }],
    mfaEnabled: true,
    totpEnabled: false,
    ...overrides,
  }
}

/** One `ContactPointResponseDTO` row (a verified Primary Mobile by default). */
export function contactPointWire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    name: null,
    value: "+14155552671",
    type: "Mobile",
    label: "Primary",
    isVerified: true,
    isNotificationEnabled: true,
    phoneNumberRegion: "US",
    ...overrides,
  }
}

/** A canned answer: a body (200) or an explicit status + body. */
export type FixtureAnswer = unknown | { readonly status: number; readonly body: unknown }

function respond(answer: FixtureAnswer): Response {
  if (typeof answer === "object" && answer !== null && "status" in answer && "body" in answer && typeof answer.status === "number") {
    return HttpResponse.json(answer.body as Parameters<typeof HttpResponse.json>[0], { status: answer.status })
  }
  return HttpResponse.json(answer as Parameters<typeof HttpResponse.json>[0])
}

export interface MyselfHandlersOptions {
  /** `myself` answer; default `myselfWire()`. */
  readonly myself?: FixtureAnswer
  /** Contact Point lists by type; a type left out answers `[]`. */
  readonly contacts?: Partial<Record<ContactPointType, FixtureAnswer>>
}

/** MSW handlers for `GET /api/1h/v2/user/myself` and `GET /api/1h/v2/user/contact-point/list?type=…`. */
export function myselfHandlers(options: MyselfHandlersOptions = {}): HttpHandler[] {
  return [
    http.get("/api/1h/v2/user/myself", () => respond(options.myself ?? myselfWire())),
    http.get("/api/1h/v2/user/contact-point/list", ({ request }) => {
      const type = new URL(request.url).searchParams.get("type") as ContactPointType | null
      return respond((type && options.contacts?.[type]) ?? [])
    }),
  ]
}
