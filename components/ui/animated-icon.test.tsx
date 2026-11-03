import { act, render } from "@testing-library/react"
import { Phone } from "lucide-react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { ANIMATED_ICON_SUCCESS_MS, AnimatedIcon, type AnimatedIconTone } from "./animated-icon"

afterEach(() => vi.useRealTimers())

const root = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-slot='animated-icon']")
const tile = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-slot='animated-icon-tile']")
const check = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-slot='animated-icon-success']")

describe("AnimatedIcon", () => {
  it.each<[AnimatedIconTone, string, string]>([
    ["blue", "bg-tint-blue-tile", "text-tint-blue-strong-foreground"],
    ["teal", "bg-tint-teal-tile", "text-tint-teal-strong-foreground"],
    ["mint", "bg-tint-mint-tile", "text-tint-mint-strong-foreground"],
  ])("%s: the glyph on its tile tint, hidden from assistive tech", (tone, background, foreground) => {
    const { container } = render(<AnimatedIcon icon={Phone} tone={tone} />)
    expect(root(container)?.getAttribute("aria-hidden")).toBe("true")
    expect(root(container)?.getAttribute("data-tone")).toBe(tone)
    expect(tile(container)?.className).toContain(background)
    expect(tile(container)?.className).toContain(foreground)
    expect(tile(container)?.querySelector("svg")?.getAttribute("class")).toContain("lucide-phone")
  })

  it("fades a ring in the tone's brand hue in on hover or keyboard focus in the row (opacity only)", () => {
    const { container } = render(<AnimatedIcon icon={Phone} tone="teal" />)
    const classes = tile(container)?.className ?? ""
    expect(classes).toContain("after:ring-2")
    expect(classes).toContain("after:ring-brand-secondary/45")
    expect(classes).toContain("after:opacity-0")
    expect(classes).toContain("group-hover/icon-host:after:opacity-100")
    expect(classes).toContain("group-has-[:focus-visible]/icon-host:after:opacity-100")
    expect(classes).toContain("motion-safe:after:transition-opacity")
  })

  it("is 40 px with a 20 px glyph at size lg", () => {
    const { container } = render(<AnimatedIcon icon={Phone} size="lg" />)
    expect(tile(container)?.className).toContain("size-10")
    expect(tile(container)?.querySelector("svg")?.getAttribute("class")).toContain("size-5")
  })

  it("lifts 2 px and scales to 1.12 on hover or keyboard focus in the row, with a spring, only with motion allowed", () => {
    const { container } = render(<AnimatedIcon icon={Phone} />)
    const classes = tile(container)?.className ?? ""
    expect(classes).toContain("transition-transform")
    expect(classes).toContain("ease-spring")
    expect(classes).toContain("motion-safe:group-hover/icon-host:-translate-y-0.5")
    expect(classes).toContain("motion-safe:group-has-[:focus-visible]/icon-host:scale-112")
    // Every lift is gated by motion-safe: a motion-reduce reset would lose to the group-hover selectors' specificity.
    const lifts = classes.split(/\s+/).filter((name) => /translate-y|scale-112/.test(name))
    expect(lifts).toHaveLength(6)
    for (const lift of lifts) expect(lift).toMatch(/^motion-safe:/)
  })

  it("has no entrance by default; with one, the outer span animates with its stagger", () => {
    const { container, rerender } = render(<AnimatedIcon icon={Phone} />)
    expect(root(container)?.className).not.toContain("animate-icon-enter")
    expect(root(container)?.style.getPropertyValue("--stagger")).toBe("")
    rerender(<AnimatedIcon icon={Phone} entrance stagger={3} />)
    expect(root(container)?.className).toContain("animate-icon-enter")
    expect(root(container)?.style.getPropertyValue("--stagger")).toBe("3")
    // The hover transform sits on the inner tile, so the entrance never overrides it.
    expect(tile(container)?.className).not.toContain("animate-icon-enter")
  })

  it("shows the saved check per success count, then hides it; a newer save restarts it", () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<AnimatedIcon icon={Phone} />)
    expect(check(container)).toBeNull()
    rerender(<AnimatedIcon icon={Phone} success={1} />)
    expect(check(container)?.className).toContain("animate-icon-success")
    act(() => vi.advanceTimersByTime(ANIMATED_ICON_SUCCESS_MS - 1))
    rerender(<AnimatedIcon icon={Phone} success={2} />)
    const second = check(container)
    act(() => vi.advanceTimersByTime(ANIMATED_ICON_SUCCESS_MS - 1))
    expect(check(container)).toBe(second)
    act(() => vi.advanceTimersByTime(1))
    expect(check(container)).toBeNull()
  })

  it("has no axe violations", async () => {
    render(
      <main>
        <h2>
          <AnimatedIcon icon={Phone} entrance success={1} /> Phone
        </h2>
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})
