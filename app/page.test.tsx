import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import HomePage from "./page"

describe("placeholder home page", () => {
  it("renders the Personal Profile heading", () => {
    render(<HomePage />)
    expect(screen.getByRole("heading", { name: /personal profile/i })).toBeInTheDocument()
  })
})
