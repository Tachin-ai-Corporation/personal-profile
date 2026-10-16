import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import type { ContactPoint } from "./contact-points"
import {
  contactPointManagePath,
  contactPointsDiffToManageDTO,
  newUnverifiedContactPoints,
  saveContactPoints,
  type ContactPointEditRow,
  type ContactPointManageDTO,
} from "./contacts"
import { fetchMyself } from "./myself"

/**
 * Story 3.1 (NG-9023): the Contact Point engine. Every engine row of the
 * I/O matrix in `spec-3-1-contact-point-engine-and-phone-read-view.md`.
 */

function point(overrides: Partial<ContactPoint> = {}): ContactPoint {
  return {
    id: 5,
    name: null,
    value: "+14155550105",
    type: "Mobile",
    label: "Home",
    isVerified: true,
    isNotificationEnabled: false,
    phoneNumberRegion: "us",
    ...overrides,
  }
}

const added = (overrides: Partial<ContactPoint> = {}): ContactPointEditRow => point({ id: null, ...overrides })

/** A manage body: every list present, empty unless given (Story 3.2). */
const body = (lists: Partial<ContactPointManageDTO>): ContactPointManageDTO => ({ contactPointsToAdd: [], contactPointsToUpdate: [], contactPointsToRemove: [], ...lists })

describe("contactPointsDiffToManageDTO: add", () => {
  it("sends a row without an id as an add, with the phone's region", () => {
    const row = added({ value: "+14155550101", type: "Mobile", label: "Work", phoneNumberRegion: "us", isNotificationEnabled: false })
    expect(contactPointsDiffToManageDTO([], [row])).toEqual(
      body({ contactPointsToAdd: [{ value: "+14155550101", type: "Mobile", label: "Work", isNotificationEnabled: false, phoneNumberRegion: "us" }] }),
    )
  })

  it("sends a Landline's region, and none for a phone without one", () => {
    const dto = contactPointsDiffToManageDTO([], [
      added({ value: "+442071838750", type: "Landline", label: "Work", phoneNumberRegion: "gb" }),
      added({ value: "+14155550102", type: "Mobile", label: "Personal", phoneNumberRegion: null, isNotificationEnabled: null }),
    ])
    expect(dto?.contactPointsToAdd).toEqual([
      { value: "+442071838750", type: "Landline", label: "Work", isNotificationEnabled: false, phoneNumberRegion: "gb" },
      { value: "+14155550102", type: "Mobile", label: "Personal", isNotificationEnabled: false },
    ])
  })

  it("never sends a region for an email or a social link", () => {
    const dto = contactPointsDiffToManageDTO([], [
      added({ value: "ann@example.com", type: "Email", label: "Work", phoneNumberRegion: "us", isNotificationEnabled: true }),
      added({ value: "https://example.com/ann", type: "Social Media", label: "Personal", phoneNumberRegion: "us" }),
    ])
    expect(dto?.contactPointsToAdd).toEqual([
      { value: "ann@example.com", type: "Email", label: "Work", isNotificationEnabled: true },
      { value: "https://example.com/ann", type: "Social Media", label: "Personal", isNotificationEnabled: false },
    ])
  })

  it("leaves out a new row that was struck through", () => {
    expect(contactPointsDiffToManageDTO([], [{ ...added({ label: "Work" }), removed: true }])).toBeNull()
  })

  it.each(["value", "type", "label"] as const)("throws on a new row without a %s (missing, empty or blank)", (field) => {
    for (const missing of [null, "", "  "]) {
      expect(() => contactPointsDiffToManageDTO([], [added({ label: "Work", [field]: missing })])).toThrow(`row (new) has no ${field}`)
    }
  })

  it("always sends all three lists: an add-only body has empty update and remove lists (the backend's null bug)", () => {
    const dto = contactPointsDiffToManageDTO([point({ id: 5 })], [point({ id: 5 }), added({ value: "+14155550101", label: "Work" })])
    expect(dto?.contactPointsToUpdate).toStrictEqual([])
    expect(dto?.contactPointsToRemove).toStrictEqual([])
    expect(Object.keys(dto ?? {})).toEqual(["contactPointsToAdd", "contactPointsToUpdate", "contactPointsToRemove"])
  })

  it("sends the phone region in lower case", () => {
    const dto = contactPointsDiffToManageDTO([], [added({ value: "+14155550101", label: "Work", phoneNumberRegion: "US" })])
    expect(dto?.contactPointsToAdd?.[0].phoneNumberRegion).toBe("us")
  })
})

describe("contactPointsDiffToManageDTO: update", () => {
  it("sends a relabel and a notification change with id, type, label and notifications (never the value)", () => {
    const before = [point({ id: 5, label: "Home" }), point({ id: 6, value: "+14155550106", label: "Work", isNotificationEnabled: false })]
    const after = [point({ id: 5, label: "Work" }), point({ id: 6, value: "+14155550106", label: "Work", isNotificationEnabled: true })]
    expect(contactPointsDiffToManageDTO(before, after)).toEqual(
      body({
        contactPointsToUpdate: [
          { id: 5, type: "Mobile", label: "Work", isNotificationEnabled: false },
          { id: 6, type: "Mobile", label: "Work", isNotificationEnabled: true },
        ],
      }),
    )
  })

  it("treats missing notifications as off", () => {
    expect(contactPointsDiffToManageDTO([point({ isNotificationEnabled: null })], [point({ isNotificationEnabled: false })])).toBeNull()
  })

  it("never sends an unchanged row", () => {
    const before = [point({ id: 5 }), point({ id: 6, value: "+14155550106", label: "Work" })]
    const after = [point({ id: 5, label: "Personal" }), point({ id: 6, value: "+14155550106", label: "Work" })]
    expect(contactPointsDiffToManageDTO(before, after)?.contactPointsToUpdate).toEqual([{ id: 5, type: "Mobile", label: "Personal", isNotificationEnabled: false }])
  })

  it("returns null for an empty diff", () => {
    const rows = [point({ id: 5 }), point({ id: 6, value: "+14155550106", label: "Primary", isNotificationEnabled: true })]
    expect(contactPointsDiffToManageDTO(rows, rows.map((row) => ({ ...row })))).toBeNull()
    expect(contactPointsDiffToManageDTO([], [])).toBeNull()
  })

  it("ignores a saved row without an id (it can't be updated or removed)", () => {
    expect(contactPointsDiffToManageDTO([point({ id: null })], [])).toBeNull()
  })

  it.each([
    ["value", { value: "+14155550199" }],
    ["type", { type: "Landline" }],
  ] as const)("throws when a saved row's %s changed", (_field, change) => {
    expect(() => contactPointsDiffToManageDTO([point({ id: 5 })], [point({ id: 5, ...change })])).toThrow("the value or type of saved row 5 changed")
  })

  it("throws on an id repeated in before or in after", () => {
    expect(() => contactPointsDiffToManageDTO([point({ id: 5 }), point({ id: 5, label: "Work" })], [point({ id: 5 })])).toThrow("saved row 5 is listed twice")
    expect(() => contactPointsDiffToManageDTO([point({ id: 5 })], [point({ id: 5 }), point({ id: 5, label: "Work" })])).toThrow("row 5 is listed twice")
  })

  it("throws on an id that isn't a saved row", () => {
    expect(() => contactPointsDiffToManageDTO([point({ id: 5 })], [point({ id: 5 }), point({ id: 9 })])).toThrow("row 9 is not a saved row")
  })

  it("throws when a changed saved row has no label to send", () => {
    expect(() => contactPointsDiffToManageDTO([point({ id: 5, label: null })], [point({ id: 5, label: null, isNotificationEnabled: true })])).toThrow("row 5 has no label")
  })
})

describe("contactPointsDiffToManageDTO: remove", () => {
  it("sends a saved id that is missing from after, or marked removed, as a number", () => {
    const before = [point({ id: 7 }), point({ id: 8, value: "+14155550108" }), point({ id: 9, value: "+14155550109" })]
    const after: ContactPointEditRow[] = [{ ...point({ id: 8, value: "+14155550108" }), removed: true }, point({ id: 9, value: "+14155550109" })]
    expect(contactPointsDiffToManageDTO(before, after)).toEqual(body({ contactPointsToRemove: [7, 8] }))
  })

  it("sends adds, updates and removes in one body", () => {
    const before = [point({ id: 5 }), point({ id: 7, value: "+14155550107" })]
    const after = [point({ id: 5, label: "Work" }), added({ value: "+14155550101", label: "Personal" })]
    expect(contactPointsDiffToManageDTO(before, after)).toStrictEqual({
      contactPointsToAdd: [{ value: "+14155550101", type: "Mobile", label: "Personal", isNotificationEnabled: false, phoneNumberRegion: "us" }],
      contactPointsToUpdate: [{ id: 5, type: "Mobile", label: "Work", isNotificationEnabled: false }],
      contactPointsToRemove: [7],
    })
  })
})

describe("contactPointsDiffToManageDTO: Primary switch (AD-9)", () => {
  const before = [
    point({ id: 1, value: "+14155550001", label: "Primary", isNotificationEnabled: true }),
    point({ id: 2, value: "+14155550002", label: "Work", isNotificationEnabled: false }),
  ]

  it("sends the new Primary with notifications on and relabels the old Primary Old, in one body", () => {
    const after = [before[0], { ...before[1], label: "Primary" }]
    expect(contactPointsDiffToManageDTO(before, after)).toEqual(
      body({
        contactPointsToUpdate: [
          { id: 1, type: "Mobile", label: "Old", isNotificationEnabled: true },
          { id: 2, type: "Mobile", label: "Primary", isNotificationEnabled: true },
        ],
      }),
    )
  })

  it("gives the same body when after already relabels the old Primary Old", () => {
    const after = [{ ...before[0], label: "Old" }, { ...before[1], label: "Primary" }]
    expect(contactPointsDiffToManageDTO(before, after)?.contactPointsToUpdate).toEqual([
      { id: 1, type: "Mobile", label: "Old", isNotificationEnabled: true },
      { id: 2, type: "Mobile", label: "Primary", isNotificationEnabled: true },
    ])
  })

  it("keeps a label after gives the old Primary", () => {
    const after = [{ ...before[0], label: "Personal" }, { ...before[1], label: "Primary" }]
    expect(contactPointsDiffToManageDTO(before, after)?.contactPointsToUpdate?.[0]).toEqual({ id: 1, type: "Mobile", label: "Personal", isNotificationEnabled: true })
  })

  it("relabels only the old Primary of the same type", () => {
    const email = point({ id: 3, value: "ann@example.com", type: "Email", label: "Primary", isNotificationEnabled: true, phoneNumberRegion: null })
    const after = [before[0], { ...before[1], label: "Primary" }, email]
    expect(contactPointsDiffToManageDTO([...before, email], after)?.contactPointsToUpdate?.map((row) => row.id)).toEqual([1, 2])
  })

  it("leaves an unchanged Primary alone", () => {
    expect(contactPointsDiffToManageDTO(before, [before[0], { ...before[1], label: "Home" }])?.contactPointsToUpdate).toEqual([
      { id: 2, type: "Mobile", label: "Home", isNotificationEnabled: false },
    ])
  })

  it("throws when two rows of one type would be Primary", () => {
    const third = point({ id: 3, value: "+14155550003", label: "Work" })
    expect(() => contactPointsDiffToManageDTO([...before, third], [before[0], { ...before[1], label: "Primary" }, { ...third, label: "Primary" }])).toThrow(
      "two rows of one type would be Primary",
    )
    const noPrimary = [{ ...before[0], label: "Work" }, before[1]]
    expect(() => contactPointsDiffToManageDTO(noPrimary, noPrimary.map((row) => ({ ...row, label: "Primary" })))).toThrow("two rows of one type would be Primary")
  })

  it.each([
    ["removed", [] as ContactPointEditRow[]],
    ["struck through", [{ ...point({ id: 1, label: "Primary" }), removed: true as const }]],
    ["relabelled", [point({ id: 1, label: "Work" })]],
  ])("throws when the only Mobile Primary is %s with no replacement", (_case, after) => {
    expect(() => contactPointsDiffToManageDTO([point({ id: 1, label: "Primary" })], after)).toThrow("the Mobile Primary 1 needs another Mobile made Primary")
  })

  it("throws when the Email Primary is removed while a Mobile becomes Primary", () => {
    const email = point({ id: 3, value: "ann@example.com", type: "Email", label: "Primary", phoneNumberRegion: null })
    expect(() => contactPointsDiffToManageDTO([...before, email], [before[0], { ...before[1], label: "Primary" }])).toThrow("the Email Primary 3 needs another Email made Primary")
  })

  it("lets a Primary go when another row of its type becomes Primary (removed or relabelled)", () => {
    expect(contactPointsDiffToManageDTO(before, [{ ...before[1], label: "Primary" }])).toEqual(
      body({ contactPointsToUpdate: [{ id: 2, type: "Mobile", label: "Primary", isNotificationEnabled: true }], contactPointsToRemove: [1] }),
    )
    expect(contactPointsDiffToManageDTO(before, [{ ...before[0], label: "Work" }, { ...before[1], label: "Primary" }])?.contactPointsToUpdate).toEqual([
      { id: 1, type: "Mobile", label: "Work", isNotificationEnabled: true },
      { id: 2, type: "Mobile", label: "Primary", isNotificationEnabled: true },
    ])
  })

  it("leaves legacy Landline, Social Media and untyped Primaries to the backend", () => {
    for (const type of ["Landline", "Social Media", null]) {
      expect(contactPointsDiffToManageDTO([point({ id: 1, type, label: "Primary" })], [])).toEqual(body({ contactPointsToRemove: [1] }))
    }
  })

  it("throws on a new row labelled Primary", () => {
    expect(() => contactPointsDiffToManageDTO(before, [...before, added({ value: "+14155550009", label: "Primary" })])).toThrow("a new row can't be Primary")
  })
})

describe("newUnverifiedContactPoints", () => {
  it("returns only the new, unverified Mobile and Email rows not labelled Home", () => {
    const before = [point({ id: 1, isVerified: false, label: "Work" })]
    const after = [
      point({ id: 1, isVerified: false, label: "Work" }), // pre-existing unverified
      point({ id: 10, isVerified: false, label: "Work" }), // new Mobile unverified Work
      point({ id: 11, isVerified: false, label: "Home" }), // new Home
      point({ id: 12, isVerified: false, type: "Landline", label: "Work" }), // new Landline
      point({ id: 13, isVerified: false, type: "Social Media", label: "Personal" }), // new Social
      point({ id: 14, isVerified: true, label: "Work" }), // new verified
      point({ id: 15, isVerified: null, label: "Work" }), // unknown verification
      point({ id: 16, isVerified: false, type: null, label: "Work" }), // no type: a Mobile-list row
      point({ id: null, isVerified: false, label: "Work" }), // no id
    ]
    expect(newUnverifiedContactPoints(before, after)).toEqual([10, 16])
  })

  it("returns new unverified emails too", () => {
    expect(newUnverifiedContactPoints([], [point({ id: 20, type: "Email", value: "ann@example.com", label: "Work", isVerified: false })])).toEqual([20])
  })
})

describe("saveContactPoints (Story 3.2)", () => {
  const MANAGE = "/api/1h/v2/health/contact-point"
  const DTO: ContactPointManageDTO = body({
    contactPointsToAdd: [{ value: "+14155550101", type: "Mobile", label: "Personal", isNotificationEnabled: false, phoneNumberRegion: "us" }],
  })
  const upstream = (status: number, message: string) => () => HttpResponse.json({ message, code: status }, { status })

  /** Records each manage body, answering with `answer()`. */
  function recordPosts(answer: () => Response) {
    const bodies: unknown[] = []
    const searches: string[] = []
    server.use(
      http.post(MANAGE, async ({ request }) => {
        bodies.push(await request.json())
        searches.push(new URL(request.url).search)
        return answer()
      }),
    )
    return { bodies, searches }
  }

  beforeEach(async () => {
    // D-A: a write goes out only once the page user is pinned.
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  it("is the manage path", () => {
    expect(contactPointManagePath()).toBe(MANAGE)
  })

  it("sends exactly one POST with the DTO as is (no query) and resolves ok on the 200 with no body", async () => {
    const { bodies, searches } = recordPosts(() => new HttpResponse(null, { status: 200 }))
    expect(await saveContactPoints(DTO)).toEqual({ ok: true })
    expect(bodies).toEqual([DTO])
    expect(searches).toEqual([""])
  })

  it("a 2xx whose body can't be read is still saved", async () => {
    recordPosts(() => HttpResponse.text("OK", { status: 200 }))
    expect(await saveContactPoints(DTO)).toEqual({ ok: true })
  })

  it.each<[string, () => Response, unknown]>([
    [
      "a duplicate",
      upstream(400, "Operation failed. Person with id '42' already has contact point with value '+14155550101'."),
      { code: "FIELD", mapped: { kind: "field", field: "value", messageKey: "contacts.duplicatePhone" } },
    ],
    [
      "the limit",
      upstream(400, "Operation failed. Person can have maximum of 20 contact points per type."),
      { code: "FIELD", mapped: { kind: "field", field: "type", messageKey: "contacts.phoneLimit" } },
    ],
    ["an unknown 400", upstream(400, "Something else."), { code: "GENERIC", mapped: { kind: "generic", message: "Something else." } }],
    ["a 500", upstream(500, "Boom"), { code: "GENERIC", mapped: { kind: "generic" } }],
    ["a proxy BAD_BODY", () => HttpResponse.json({ errorCode: "BAD_BODY", source: "proxy" }, { status: 400 }), { code: "GENERIC", mapped: { kind: "generic" } }],
    ["a network failure", () => HttpResponse.error(), { code: "NETWORK_ERROR", mapped: { kind: "network" } }],
  ])("%s resolves { ok: false } with the mapped error, never throwing", async (_case, answer, error) => {
    recordPosts(answer)
    expect(await saveContactPoints(DTO)).toEqual({ ok: false, error })
  })

  it("maps for the given scope", async () => {
    recordPosts(upstream(400, "Duplicate Contact Points specified."))
    expect(await saveContactPoints(DTO, "email")).toEqual({ ok: false, error: { code: "FIELD", mapped: { kind: "field", field: "value", messageKey: "contacts.duplicateEmail" } } })
  })
})
