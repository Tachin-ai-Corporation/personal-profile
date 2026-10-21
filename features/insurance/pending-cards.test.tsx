import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { InsuranceCardSide } from "@/lib/api"
import {
  clearInsurancePendingCards,
  dropInsurancePendingCard,
  dropInsurancePendingCards,
  insurancePendingCard,
  setInsurancePendingCard,
  useInsurancePendingCard,
} from "./pending-cards"

/** Story 5.3: the in-memory store of failed card uploads (decision 2A), keyed by policy id + side. */

const blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" })
const card = (name: string, oldFileId: number | null = null) => ({ blob, name, oldFileId })

afterEach(() => clearInsurancePendingCards())

function Probe({ policyId, side }: { readonly policyId: number | null; readonly side: InsuranceCardSide }) {
  const pending = useInsurancePendingCard(policyId, side)
  return <p>{pending ? pending.name : "none"}</p>
}

describe("pending card images", () => {
  it("keeps one entry per policy and side, replacing an earlier one; drops one side or a whole policy", () => {
    setInsurancePendingCard(55, "front", card("a.png"))
    setInsurancePendingCard(55, "back", card("b.png", 901))
    setInsurancePendingCard(56, "front", card("c.png"))
    setInsurancePendingCard(556, "front", card("d.png"))
    setInsurancePendingCard(55, "front", card("a2.png"))
    expect(insurancePendingCard(55, "front")).toEqual(card("a2.png"))
    expect(insurancePendingCard(55, "back")).toEqual(card("b.png", 901))
    dropInsurancePendingCard(55, "front")
    expect(insurancePendingCard(55, "front")).toBeUndefined()
    dropInsurancePendingCard(55, "front")
    dropInsurancePendingCards(55)
    expect(insurancePendingCard(55, "back")).toBeUndefined()
    // Policy 556 isn't policy 55's (keys are "55:front", "556:front").
    expect(insurancePendingCard(556, "front")).toEqual(card("d.png"))
    expect(insurancePendingCard(56, "front")).toEqual(card("c.png"))
    dropInsurancePendingCards(99)
    expect(insurancePendingCard(56, "front")).toEqual(card("c.png"))
  })

  it("a component sees the entry come and go; a null policy never has one", () => {
    render(
      <>
        <Probe policyId={55} side="back" />
        <Probe policyId={null} side="back" />
      </>,
    )
    expect(screen.getAllByRole("paragraph").map((p) => p.textContent)).toEqual(["none", "none"])
    act(() => setInsurancePendingCard(55, "back", card("back.png")))
    expect(screen.getAllByRole("paragraph").map((p) => p.textContent)).toEqual(["back.png", "none"])
    act(() => dropInsurancePendingCards(55))
    expect(screen.getAllByRole("paragraph").map((p) => p.textContent)).toEqual(["none", "none"])
    act(() => setInsurancePendingCard(55, "back", card("again.png")))
    act(() => clearInsurancePendingCards())
    expect(screen.getAllByRole("paragraph").map((p) => p.textContent)).toEqual(["none", "none"])
    clearInsurancePendingCards()
  })
})
