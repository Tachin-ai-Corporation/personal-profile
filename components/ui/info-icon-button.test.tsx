import { act, render, screen, waitFor } from "@testing-library/react"
import { createRef } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { InfoIconButton } from "./info-icon-button"
import { Tooltip } from "./tooltip"

beforeEach(() => stubLayoutApis())

describe("InfoIconButton", () => {
  it("is a 44 px muted icon button named by its aria-label, with the 18 px help icon by default", () => {
    render(<InfoIconButton aria-label="About birth date" />)
    const button = screen.getByRole("button", { name: "About birth date" })
    expect(button.getAttribute("type")).toBe("button")
    for (const name of ["size-11", "text-muted-foreground", "hover:bg-muted", "rounded-md", "focus-ring"]) expect(button.className).toContain(name)
    const icon = button.querySelector("svg")
    expect(icon?.getAttribute("aria-hidden")).toBe("true")
    expect(icon?.getAttribute("class")).toContain("size-[18px]")
    expect(icon?.getAttribute("class")).toContain("circle-question-mark")
  })

  it("shows the (i) icon for icon='info'", () => {
    render(<InfoIconButton aria-label="About this organization" icon="info" />)
    expect(screen.getByRole("button").querySelector("svg")?.getAttribute("class")).toContain("lucide-info")
  })

  it("forwards its ref", () => {
    const ref = createRef<HTMLButtonElement>()
    render(<InfoIconButton ref={ref} aria-label="About birth date" />)
    expect(ref.current).toBe(screen.getByRole("button"))
  })

  it("triggers a Tooltip", async () => {
    render(
      <Tooltip content="The signature can be changed from the Personal Profile">
        <InfoIconButton aria-label="About the signature" />
      </Tooltip>,
    )
    const button = screen.getByRole("button", { name: "About the signature" })
    act(() => button.focus())
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe("The signature can be changed from the Personal Profile"))
    expect(button.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
  })

  it("has no axe violations", async () => {
    render(
      <main>
        <InfoIconButton aria-label="About birth date" />
        <InfoIconButton aria-label="About this organization" icon="info" />
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})
