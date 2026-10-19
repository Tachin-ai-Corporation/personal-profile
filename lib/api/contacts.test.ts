import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import type { ContactPoint } from "./contact-points"
import {
  CONTACT_VERIFY_MAX_IDS,
  contactPointManagePath,
  contactPointsDiffToManageDTO,
  contactPointVerifyPath,
  newUnverifiedContactPoints,
  saveContactPoints,
  sendContactVerification,
  verifyContactPoints,
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

describe("contactPointsDiffToManageDTO: replace mode (Story 3.7)", () => {
  const social = (overrides: Partial<ContactPoint> = {}): ContactPoint =>
    point({ id: 51, value: "https://x.com/ann", type: "Social Media", label: "Personal", isVerified: null, phoneNumberRegion: null, ...overrides })
  const REPLACE = { valueChange: "replace" } as const

  it("sends a saved row whose value changed as a remove of its id plus an add of the new value, in one body", () => {
    const before = [social(), social({ id: 52, value: "@ann" })]
    const after = [social({ value: "https://x.com/ann2" }), social({ id: 52, value: "@ann" })]
    expect(contactPointsDiffToManageDTO(before, after, REPLACE)).toStrictEqual({
      contactPointsToAdd: [{ value: "https://x.com/ann2", type: "Social Media", label: "Personal", isNotificationEnabled: false }],
      contactPointsToUpdate: [],
      contactPointsToRemove: [51],
    })
  })

  it("adds the replacement with the label and notifications after gives it", () => {
    const after = [social({ value: "https://x.com/ann2", label: "Work", isNotificationEnabled: true })]
    expect(contactPointsDiffToManageDTO([social({ label: "Home" })], after, REPLACE)?.contactPointsToAdd).toEqual([
      { value: "https://x.com/ann2", type: "Social Media", label: "Work", isNotificationEnabled: true },
    ])
  })

  it("only removes a changed row that is struck through", () => {
    expect(contactPointsDiffToManageDTO([social()], [{ ...social({ value: "https://x.com/ann2" }), removed: true }], REPLACE)).toEqual(body({ contactPointsToRemove: [51] }))
  })

  it("sends replaces, adds, updates and removes together, and nothing for an unchanged row", () => {
    const before = [social(), social({ id: 52, value: "https://b.example/ann" }), social({ id: 53, value: "https://c.example/ann" })]
    const after: ContactPointEditRow[] = [
      social({ value: "https://x.com/ann2" }),
      social({ id: 52, value: "https://b.example/ann", label: "Work" }),
      { ...social({ id: 53, value: "https://c.example/ann" }), removed: true },
      social({ id: null, value: "https://d.example/ann" }),
    ]
    expect(contactPointsDiffToManageDTO(before, after, REPLACE)).toStrictEqual({
      contactPointsToAdd: [
        { value: "https://x.com/ann2", type: "Social Media", label: "Personal", isNotificationEnabled: false },
        { value: "https://d.example/ann", type: "Social Media", label: "Personal", isNotificationEnabled: false },
      ],
      contactPointsToUpdate: [{ id: 52, type: "Social Media", label: "Work", isNotificationEnabled: false }],
      contactPointsToRemove: [51, 53],
    })
    expect(contactPointsDiffToManageDTO(before, before.map((row) => ({ ...row })), REPLACE)).toBeNull()
  })

  it("still throws when the type changed", () => {
    expect(() => contactPointsDiffToManageDTO([social()], [social({ type: "Email" })], REPLACE)).toThrow("the value or type of saved row 51 changed")
    expect(() => contactPointsDiffToManageDTO([social()], [social({ value: "https://x.com/ann2", type: "Email" })], REPLACE)).toThrow(
      "the value or type of saved row 51 changed",
    )
  })

  it("still refuses a Primary replacement (a new row can't be Primary)", () => {
    expect(() => contactPointsDiffToManageDTO([social({ label: "Primary" })], [social({ value: "https://x.com/ann2", label: "Primary" })], REPLACE)).toThrow(
      "a new row can't be Primary",
    )
  })

  it("still throws in replace mode when a Mobile, Landline or Email value changed (or a row with no type)", () => {
    const mobile = point({ id: 5 })
    const landline = point({ id: 6, value: "+14155550106", type: "Landline" })
    const mail = point({ id: 41, value: "ann@x.com", type: "Email", label: "Work", phoneNumberRegion: null })
    const untyped = point({ id: 7, value: "+14155550107", type: null })
    for (const [row, value] of [
      [mobile, "+14155550199"],
      [landline, "+14155550198"],
      [mail, "ann@y.com"],
      [untyped, "+14155550197"],
    ] as const) {
      expect(() => contactPointsDiffToManageDTO([row], [{ ...row, value }], REPLACE)).toThrow(`the value or type of saved row ${row.id} changed`)
    }
  })

  it("keeps the immutable guard without the option, or with \"locked\": Social, Phone and Email", () => {
    for (const options of [undefined, { valueChange: "locked" } as const]) {
      expect(() => contactPointsDiffToManageDTO([social()], [social({ value: "https://x.com/ann2" })], options)).toThrow("the value or type of saved row 51 changed")
      expect(() => contactPointsDiffToManageDTO([point({ id: 5 })], [point({ id: 5, value: "+14155550199" })], options)).toThrow("the value or type of saved row 5 changed")
      const mail = point({ id: 41, value: "ann@x.com", type: "Email", label: "Work", phoneNumberRegion: null })
      expect(() => contactPointsDiffToManageDTO([mail], [{ ...mail, value: "ann@y.com" }], options)).toThrow("the value or type of saved row 41 changed")
    }
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

describe("verifyContactPoints and sendContactVerification (Story 3.3)", () => {
  const VERIFY = "/api/1h/v2/health/contact-point/verify"
  const COOLDOWN = "There is already a pending verification for Contact '+14155550140' submitted within the last 60 minutes."
  const ok = (contactPointIdsWithSendError: number[] = []) => HttpResponse.json({ success: contactPointIdsWithSendError.length === 0, contactPointIdsWithSendError })
  const upstream = (status: number, message: string) => HttpResponse.json({ message, code: status }, { status })

  /** Records each verify body, answering the n-th call with `answers[n]` (the last one repeats). */
  function recordVerify(...answers: (() => Response)[]) {
    const bodies: unknown[] = []
    const searches: string[] = []
    server.use(
      http.post(VERIFY, async ({ request }) => {
        bodies.push(await request.json())
        searches.push(new URL(request.url).search)
        return answers[Math.min(bodies.length, answers.length) - 1]()
      }),
    )
    return { bodies, searches }
  }

  beforeEach(async () => {
    // D-A: a write goes out only once the page user is pinned.
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  it("is the verify path; the backend limit is 10 ids", () => {
    expect(contactPointVerifyPath()).toBe(VERIFY)
    expect(CONTACT_VERIFY_MAX_IDS).toBe(10)
  })

  it("verifyContactPoints sends one POST with { contactPointIds } and no query, and returns the answer", async () => {
    const { bodies, searches } = recordVerify(() => ok([41]))
    const res = await verifyContactPoints([40, 41])
    expect(res.success).toBe(true)
    expect(res.data).toEqual({ success: false, contactPointIdsWithSendError: [41] })
    expect(bodies).toEqual([{ contactPointIds: [40, 41] }])
    expect(searches).toEqual([""])
  })

  it("verifyContactPoints with no ids sends nothing and resolves a success with no send errors", async () => {
    const { bodies } = recordVerify(() => ok())
    expect(await verifyContactPoints([])).toEqual({ success: true, data: { success: true, contactPointIdsWithSendError: [] } })
    expect(bodies).toEqual([])
  })

  it("an empty list sends nothing and resolves an empty outcome", async () => {
    const { bodies } = recordVerify(() => ok())
    expect(await sendContactVerification([])).toEqual({ sent: [], failed: [], cooldown: [], network: false, session: false })
    expect(bodies).toEqual([])
  })

  it("all sent: one call with the de-duplicated ids", async () => {
    const { bodies } = recordVerify(() => ok())
    expect(await sendContactVerification([40, 41, 40])).toEqual({ sent: [40, 41], failed: [], cooldown: [], network: false, session: false })
    expect(bodies).toEqual([{ contactPointIds: [40, 41] }])
  })

  it("the listed send errors fail, the rest are sent", async () => {
    recordVerify(() => ok([40]))
    expect(await sendContactVerification([40, 41])).toEqual({ sent: [41], failed: [40], cooldown: [], network: false, session: false })
  })

  it("a 2xx body without a readable list counts every id as sent", async () => {
    recordVerify(() => HttpResponse.json({ success: true }))
    expect(await sendContactVerification([40])).toEqual({ sent: [40], failed: [], cooldown: [], network: false, session: false })
    recordVerify(() => HttpResponse.json({ success: false, contactPointIdsWithSendError: ["40", 41] }))
    expect(await sendContactVerification([40, 41])).toEqual({ sent: [40], failed: [41], cooldown: [], network: false, session: false })
  })

  it("a 2xx with no body counts every id as sent", async () => {
    recordVerify(() => new HttpResponse(null, { status: 200 }))
    expect(await sendContactVerification([40])).toEqual({ sent: [40], failed: [], cooldown: [], network: false, session: false })
  })

  it("12 ids go in two calls, 10 then 2, one after another", async () => {
    const ids = Array.from({ length: 12 }, (_, index) => 40 + index)
    const { bodies } = recordVerify(() => ok([45]), () => ok())
    expect(await sendContactVerification(ids)).toEqual({ sent: ids.filter((id) => id !== 45), failed: [45], cooldown: [], network: false, session: false })
    expect(bodies).toEqual([{ contactPointIds: ids.slice(0, 10) }, { contactPointIds: [50, 51] }])
  })

  it("a cooldown 400 puts the chunk's ids in cooldown", async () => {
    recordVerify(() => upstream(400, COOLDOWN))
    expect(await sendContactVerification([40, 41])).toEqual({ sent: [], failed: [], cooldown: [40, 41], network: false, session: false })
  })

  it("the cooldown rule is the phone scope's: another scope's chunk fails", async () => {
    recordVerify(() => upstream(400, COOLDOWN))
    expect(await sendContactVerification([40], "social")).toEqual({ sent: [], failed: [40], cooldown: [], network: false, session: false })
  })

  it.each<[string, () => Response]>([
    ["an unknown 400", () => upstream(400, "Contact point is already verified.")],
    ["a 500", () => upstream(500, "Boom")],
    ["a proxy BAD_BODY", () => HttpResponse.json({ errorCode: "BAD_BODY", source: "proxy" }, { status: 400 })],
    ["a 403", () => upstream(403, "Forbidden")],
  ])("%s fails every id of its chunk", async (_case, answer) => {
    recordVerify(answer)
    expect(await sendContactVerification([40, 41])).toEqual({ sent: [], failed: [40, 41], cooldown: [], network: false, session: false })
  })

  it("a network failure sets network and fails the chunk's ids; the next chunk is still sent", async () => {
    const ids = Array.from({ length: 11 }, (_, index) => 40 + index)
    const { bodies } = recordVerify(() => HttpResponse.error(), () => ok())
    expect(await sendContactVerification(ids)).toEqual({ sent: [50], failed: ids.slice(0, 10), cooldown: [], network: true, session: false })
    expect(bodies).toHaveLength(2)
  })

  it("a session end sets session, lists the chunk nowhere and sends no later chunk", async () => {
    const ids = Array.from({ length: 21 }, (_, index) => 40 + index)
    const { bodies } = recordVerify(
      () => ok(),
      () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }),
    )
    expect(await sendContactVerification(ids)).toEqual({ sent: ids.slice(0, 10), failed: [], cooldown: [], network: false, session: true })
    expect(bodies).toHaveLength(2)
  })
})
