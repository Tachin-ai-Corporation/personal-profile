import { renderHook, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import { TestProviders } from "@/test/providers"
import { usePersonOptions } from "./use-person-options"

/** Story 2.1: the Person option lists from the shared type-key loader, with the `lib/shared/person-options.ts` fallbacks. */

const PERSON_TYPE = "/api/1h/v2/type/key/Person"

const wrapper = ({ children }: { readonly children: ReactNode }) => <TestProviders>{children}</TestProviders>

const valueList = (attrKey: string, names: string[]) => ({
  attrKey,
  name: attrKey,
  type: "VALUE_LIST",
  attributeValues: names.map((name, id) => ({ id, name })),
})

function answerPerson(response: () => Response): () => number {
  let count = 0
  server.use(
    http.get(PERSON_TYPE, () => {
      count += 1
      return response()
    }),
  )
  return () => count
}

const RACE_FALLBACK = [
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Middle Eastern or North African",
  "Native Hawaiian or other Pacific Islander",
  "White",
  "Other Race",
  "Unknown",
]
const ETHNICITY_FALLBACK = ["Not Hispanic or Latino", "Hispanic or Latino", "Unknown"]
const GENDER_IDENTITY = ["Asked but not answered", "Female", "Male", "Other"]

describe("usePersonOptions", () => {
  it("offers the type key's VALUE_LISTs sorted, with n/a dropped", async () => {
    const requests = answerPerson(() =>
      HttpResponse.json({
        boKey: "Person",
        attributes: [
          valueList("race", ["White", "n/a", "Asian", "Black or African American"]),
          valueList("ethnicity", ["Unknown", "N/A", "Hispanic or Latino"]),
          valueList("biologicalGender", ["Male", "Female", "n/a", "Asked but not answered"]),
        ],
      }),
    )
    const { result } = renderHook(() => usePersonOptions("Female"), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.race).toEqual(["Asian", "Black or African American", "White"])
    expect(result.current.ethnicity).toEqual(["Hispanic or Latino", "Unknown"])
    expect(result.current.biologicalGender).toEqual(["Asked but not answered", "Female", "Male"])
    expect(result.current.genderIdentity).toEqual(GENDER_IDENTITY)
    expect(requests()).toBe(1)
  })

  it("falls back on a 500: addendum §C race and ethnicity, biological gender = Asked but not answered + the current value", async () => {
    answerPerson(() => HttpResponse.json({ message: "boom" }, { status: 500 }))
    const { result } = renderHook(() => usePersonOptions("Female"), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.race).toEqual(RACE_FALLBACK)
    expect(result.current.ethnicity).toEqual(ETHNICITY_FALLBACK)
    expect(result.current.biologicalGender).toEqual(["Asked but not answered", "Female"])
    expect(result.current.genderIdentity).toEqual(GENDER_IDENTITY)
  })

  it("falls back per list when a list is empty or missing", async () => {
    answerPerson(() => HttpResponse.json({ boKey: "Person", attributes: [valueList("race", ["Asian"]), valueList("ethnicity", ["n/a"])] }))
    const { result } = renderHook(() => usePersonOptions(null), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.race).toEqual(["Asian"])
    expect(result.current.ethnicity).toEqual(ETHNICITY_FALLBACK)
    expect(result.current.biologicalGender).toEqual(["Asked but not answered"])
  })

  it("keeps the same references across re-renders with the same inputs", async () => {
    answerPerson(() => HttpResponse.json({ boKey: "Person", attributes: [valueList("race", ["Asian"])] }))
    const { result, rerender } = renderHook(({ current }) => usePersonOptions(current), { wrapper, initialProps: { current: "Female" } })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const first = result.current
    rerender({ current: "Female" })
    expect(result.current).toBe(first)
    expect(result.current.race).toBe(first.race)
    expect(result.current.biologicalGender).toBe(first.biologicalGender)
    rerender({ current: "Male" })
    expect(result.current).not.toBe(first)
    expect(result.current.biologicalGender).toEqual(["Asked but not answered", "Male"])
  })

  it("holds the fallbacks while the type key loads", () => {
    answerPerson(() => new Promise<Response>(() => undefined) as unknown as Response)
    const { result } = renderHook(() => usePersonOptions("Male"), { wrapper })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.race).toEqual(RACE_FALLBACK)
    expect(result.current.biologicalGender).toEqual(["Asked but not answered", "Male"])
  })
})

describe("usePersonOptions: offered (Story 2.2, ∩ the user/edit enums)", () => {
  it("drops platform values the PUT would reject and keeps the preselects", async () => {
    answerPerson(() =>
      HttpResponse.json({
        boKey: "Person",
        attributes: [
          valueList("race", ["White", "Martian", "Asian"]),
          valueList("ethnicity", ["Hispanic or Latino", "Pending"]),
          valueList("biologicalGender", ["Male", "Female", "Intersex"]),
        ],
      }),
    )
    const { result } = renderHook(() => usePersonOptions("Female"), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.race).toEqual(["Asian", "Martian", "White"])
    expect(result.current.offered.race).toEqual(["Asian", "White", "Unknown"])
    expect(result.current.offered.ethnicity).toEqual(["Hispanic or Latino", "Unknown"])
    expect(result.current.offered.biologicalGender).toEqual(["Female", "Male", "Asked but not answered"])
  })

  it("an empty intersection offers the fallback's accepted values; a platform-only current value is never offered", async () => {
    answerPerson(() =>
      HttpResponse.json({ boKey: "Person", attributes: [valueList("race", ["Martian"]), valueList("biologicalGender", ["Intersex"])] }),
    )
    const { result } = renderHook(() => usePersonOptions("Intersex"), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.offered.race).toEqual(RACE_FALLBACK)
    expect(result.current.offered.ethnicity).toEqual(ETHNICITY_FALLBACK)
    expect(result.current.offered.biologicalGender).toEqual(["Asked but not answered"])
  })
})
