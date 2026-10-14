import { act, render, waitFor } from "@testing-library/react"
import { createElement } from "react"
import useSWR from "swr"
import { describe, expect, it } from "vitest"
import { CONTACT_POINT_TYPES, keys, mutateContactPoints, mutateMyself, SWR_RESOURCES, type SwrKey } from "./keys"

describe("keys", () => {
  it("declares every planned key", () => {
    expect(keys.myself()).toEqual(["pp", "myself"])
    expect(keys.profilePictureId()).toEqual(["pp", "profile-picture-id"])
    expect(keys.typeKey("ContactPoint")).toEqual(["pp", "type-key", "ContactPoint"])
    expect(keys.contactPoints("Social Media")).toEqual(["pp", "contact-points", "Social Media"])
    expect(keys.addresses()).toEqual(["pp", "addresses"])
    expect(keys.insurance()).toEqual(["pp", "insurance"])
    expect(keys.npi()).toEqual(["pp", "npi"])
    expect(keys.practiceSupport()).toEqual(["pp", "practice-support"])
    expect(keys.orgs("acme", 2)).toEqual(["pp", "orgs", "acme", 2])
    expect(CONTACT_POINT_TYPES).toEqual(["Email", "Mobile", "Landline", "Social Media"])
  })

  it("lists every key family as a resource", () => {
    const families = Object.values(keys).map((build) => (build as (...args: never[]) => readonly unknown[])()[1])
    expect(families.toSorted()).toEqual([...SWR_RESOURCES].toSorted())
  })
})

/** Loads each key with a counting loader from the app's default SWR cache (the one the helpers revalidate). */
function watch(list: readonly SwrKey[]): Map<string, number> {
  const loads = new Map<string, number>()
  function Probe({ swrKey }: { readonly swrKey: SwrKey }) {
    useSWR(swrKey, async () => {
      loads.set(JSON.stringify(swrKey), (loads.get(JSON.stringify(swrKey)) ?? 0) + 1)
      return swrKey
    }, { dedupingInterval: 0 })
    return null
  }
  render(createElement("div", null, ...list.map((swrKey) => createElement(Probe, { key: JSON.stringify(swrKey), swrKey }))))
  return loads
}

const count = (loads: Map<string, number>, key: SwrKey): number | undefined => loads.get(JSON.stringify(key))

describe("revalidate helpers", () => {
  it("mutateMyself revalidates only the myself key", async () => {
    const loads = watch([keys.myself(), keys.npi()])
    await waitFor(() => expect(loads.size).toBe(2))
    await act(() => mutateMyself())
    expect(count(loads, keys.myself())).toBe(2)
    expect(count(loads, keys.npi())).toBe(1)
  })

  it("mutateContactPoints revalidates only the given types, or every type with none", async () => {
    const all = CONTACT_POINT_TYPES.map((type) => keys.contactPoints(type))
    const loads = watch([...all, keys.insurance()])
    await waitFor(() => expect(loads.size).toBe(5))
    await act(() => mutateContactPoints("Mobile", "Social Media"))
    expect(all.map((key) => count(loads, key))).toEqual([1, 2, 1, 2])
    await act(() => mutateContactPoints())
    expect(all.map((key) => count(loads, key))).toEqual([2, 3, 2, 3])
    expect(count(loads, keys.insurance())).toBe(1)
  })
})
