import { act, render, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { createElement } from "react"
import useSWR from "swr"
import { beforeEach, describe, expect, expectTypeOf, it } from "vitest"
import { myselfWire } from "@/test/myself-fixture"
import { server } from "@/test/msw-server"
import {
  fetchMyself,
  keys,
  PERSON_TYPE_KEY,
  PERSON_VALUE_LISTS,
  savePersonalInformation,
  ssnExposePath,
  type PersonalInformationField,
  type PersonalInformationPayload,
} from "."

/** Counts the loads of `keys.myself()` in the app's default SWR cache (the one `mutateMyself` revalidates). */
async function watchMyself(): Promise<() => number> {
  // SWR drops an earlier test's finished request from its dedupe table on a 0 ms timer: let it run first.
  await new Promise((resolve) => setTimeout(resolve, 10))
  let loads = 0
  function Probe() {
    useSWR(keys.myself(), async () => {
      loads += 1
      return null
    }, { dedupingInterval: 0, revalidateOnMount: true })
    return null
  }
  render(createElement(Probe))
  await waitFor(() => expect(loads).toBe(1))
  return () => loads - 1
}

/** Personal information (Team A, Epic 2). Team A adds its own cases here. */
describe("personal", () => {
  it("paths and constants", () => {
    expect(PERSON_TYPE_KEY).toBe("Person")
    expect(PERSON_VALUE_LISTS).toEqual(["race", "ethnicity", "biologicalGender"])
    expect(ssnExposePath()).toBe("/api/1h/v2/person/me/ssn/expose")
  })

  it("PersonalInformationPayload has exactly the PersonalInformationDTO fields, never email or phone (AD-9, spec F7-2)", () => {
    expectTypeOf<PersonalInformationField>().toEqualTypeOf<
      | "firstName"
      | "middleName"
      | "lastName"
      | "namePrefix"
      | "nameSuffix"
      | "otherNames"
      | "titles"
      | "birthDate"
      | "cityOfBirth"
      | "race"
      | "ethnicity"
      | "biologicalGender"
      | "genderIdentity"
      | "sexualOrientation"
      | "socialSecurityNumber"
    >()
    expectTypeOf<Extract<PersonalInformationField, "email" | "phoneNumber" | "phoneNumberRegion">>().toEqualTypeOf<never>()
    expectTypeOf<PersonalInformationPayload>().toEqualTypeOf<Partial<PersonalInformationPayload>>()
    // @ts-expect-error email is never part of a Personal-information payload
    const withEmail: PersonalInformationPayload = { email: "a@b.co" }
    expect(withEmail).toBeDefined()
  })
})

describe("savePersonalInformation (Story 2.2)", () => {
  const EDIT = "/api/1h/v2/user/edit"

  /** A body with every Personal-information field (AD-9: still no account field). */
  const FULL_DIFF: Required<Omit<PersonalInformationPayload, "socialSecurityNumber">> = {
    firstName: "Anna",
    middleName: "n/a",
    lastName: "Lee",
    namePrefix: "Dr.",
    nameSuffix: "Jr.",
    otherNames: "Ann Smith",
    titles: "MD",
    birthDate: "1990-04-15",
    cityOfBirth: "Springfield",
    race: "Asian",
    ethnicity: "Unknown",
    biologicalGender: "Female",
    genderIdentity: "Woman",
    sexualOrientation: "Straight",
  }

  /** Records each PUT's method and parsed body, answering with `answer()`. */
  function recordPuts(answer: () => Response = () => HttpResponse.json(myselfWire())) {
    const bodies: unknown[] = []
    server.use(
      http.put(EDIT, async ({ request }) => {
        bodies.push(await request.json())
        return answer()
      }),
    )
    return bodies
  }

  // A write goes out only for a loaded page user (D-A save safeguard, PR #7): load `myself` first,
  // as the page does, and answer the safeguard's fresh `/myself` check.
  let revalidations: () => number = () => 0

  beforeEach(async () => {
    revalidations = await watchMyself()
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  it("an empty diff sends nothing and resolves ok without revalidating", async () => {
    const bodies = recordPuts()
    expect(await act(() => savePersonalInformation({}))).toEqual({ ok: true })
    expect(bodies).toEqual([])
    expect(revalidations()).toBe(0)
  })

  it("PUTs only the diff as JSON, then revalidates myself and resolves ok", async () => {
    const bodies = recordPuts()
    expect(await act(() => savePersonalInformation({ firstName: "Anna", middleName: "n/a" }))).toEqual({ ok: true })
    expect(bodies).toEqual([{ firstName: "Anna", middleName: "n/a" }])
    expect(revalidations()).toBe(1)
  })

  it("a full diff's body has every Personal-information field and no email, phoneNumber or phoneNumberRegion (AD-9)", async () => {
    const bodies = recordPuts()
    expect(await act(() => savePersonalInformation(FULL_DIFF))).toEqual({ ok: true })
    expect(bodies).toEqual([FULL_DIFF])
    const keys = Object.keys(bodies[0] as object)
    for (const field of ["email", "phoneNumber", "phoneNumberRegion"]) expect(keys).not.toContain(field)
  })

  it("a 2xx with an empty or unreadable body still saved", async () => {
    recordPuts(() => new HttpResponse(null, { status: 204 }))
    expect(await act(() => savePersonalInformation({ firstName: "Anna" }))).toEqual({ ok: true })
    recordPuts(() => HttpResponse.text("OK", { status: 200 }))
    expect(await act(() => savePersonalInformation({ firstName: "Anna" }))).toEqual({ ok: true })
    expect(revalidations()).toBe(2)
  })

  it("a 400 SSN taken maps to the SSN field error", async () => {
    recordPuts(() => HttpResponse.json({ message: "The Social Security Number {123-45-6789} already belongs to another person." }, { status: 400 }))
    expect(await act(() => savePersonalInformation({ socialSecurityNumber: "123-45-6789" }))).toEqual({
      ok: false,
      error: { code: "FIELD", mapped: { kind: "field", field: "ssn", messageKey: "person.ssnTaken" } },
    })
    expect(revalidations()).toBe(0)
  })

  it("a 400 INVALID_ENUM_VALUE (or any unknown code) is a generic error", async () => {
    recordPuts(() => HttpResponse.json({ message: "Invalid value", code: "INVALID_ENUM_VALUE" }, { status: 400 }))
    expect(await act(() => savePersonalInformation({ race: "Asian" }))).toEqual({ ok: false, error: { code: "GENERIC", mapped: { kind: "generic", message: "Invalid value" } } })
    recordPuts(() => HttpResponse.json({ errorCode: "BAD_BODY", source: "proxy" }, { status: 400 }))
    expect(await act(() => savePersonalInformation({ race: "Asian" }))).toEqual({ ok: false, error: { code: "GENERIC", mapped: { kind: "generic" } } })
  })

  it("a 5xx or a network failure is a network error; never throws", async () => {
    recordPuts(() => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 }))
    expect(await act(() => savePersonalInformation({ firstName: "Anna" }))).toEqual({ ok: false, error: { code: "NETWORK_ERROR", mapped: { kind: "network" } } })
    server.use(http.put(EDIT, () => HttpResponse.error()))
    expect(await act(() => savePersonalInformation({ firstName: "Anna" }))).toEqual({ ok: false, error: { code: "NETWORK_ERROR", mapped: { kind: "network" } } })
    expect(revalidations()).toBe(0)
  })
})
