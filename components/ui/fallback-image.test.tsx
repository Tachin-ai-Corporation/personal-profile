import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { FallbackImage } from "./fallback-image"

const Tile = () => <span data-testid="tile">AL</span>

describe("FallbackImage (spec F7-2)", () => {
  it.each([null, undefined, ""])("shows the fallback at once without a src (%j)", (src) => {
    const { container } = render(<FallbackImage src={src} alt="" fallback={<Tile />} />)
    expect(screen.getByTestId("tile")).toBeTruthy()
    expect(container.querySelector("img")).toBeNull()
  })

  it("renders the image with its props until it fails, then the fallback (no broken image), notifying once", () => {
    const onFallback = vi.fn()
    const onLoad = vi.fn()
    const { container } = render(
      <FallbackImage src="/api/pp/org-logo/7" alt="" fallback={<Tile />} onFallback={onFallback} onLoad={onLoad} className="h-18" width={72} />,
    )
    const img = container.querySelector("img")
    expect(img?.getAttribute("src")).toBe("/api/pp/org-logo/7")
    expect(img?.getAttribute("alt")).toBe("")
    expect(img?.getAttribute("class")).toBe("h-18")
    expect(img?.getAttribute("width")).toBe("72")
    expect(img?.getAttribute("decoding")).toBe("async")
    expect(screen.queryByTestId("tile")).toBeNull()
    fireEvent.load(img as HTMLImageElement)
    expect(onLoad).toHaveBeenCalledTimes(1)
    fireEvent.error(img as HTMLImageElement)
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByTestId("tile")).toBeTruthy()
    expect(onFallback).toHaveBeenCalledTimes(1)
  })

  it("retries a new src after a failure", () => {
    const { container, rerender } = render(<FallbackImage src="/a.png" alt="Ann Lee" fallback={<Tile />} />)
    fireEvent.error(container.querySelector("img") as HTMLImageElement)
    expect(screen.getByTestId("tile")).toBeTruthy()
    rerender(<FallbackImage src="/b.png" alt="Ann Lee" fallback={<Tile />} />)
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/b.png")
    expect(screen.queryByTestId("tile")).toBeNull()
  })

  it("falls back for an image that already failed before hydration (complete, no pixels)", () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true)
    const width = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0)
    const onFallback = vi.fn()
    render(<FallbackImage src="/broken.png" alt="" fallback={<Tile />} onFallback={onFallback} />)
    expect(screen.getByTestId("tile")).toBeTruthy()
    expect(onFallback).toHaveBeenCalledTimes(1)
    complete.mockRestore()
    width.mockRestore()
  })

  it("keeps an image that already loaded before hydration", () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true)
    const width = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(40)
    const { container } = render(<FallbackImage src="/ok.png" alt="" fallback={<Tile />} />)
    expect(container.querySelector("img")).not.toBeNull()
    complete.mockRestore()
    width.mockRestore()
  })

  it("has no axe violations as an image or as its fallback", async () => {
    const { container } = render(
      <main>
        <FallbackImage src="/a.png" alt="Ann Lee" fallback={<Tile />} />
        <FallbackImage src={null} alt="" fallback={<span>Not provided</span>} />
      </main>,
    )
    expect(await axeViolations()).toEqual([])
    fireEvent.error(container.querySelector("img") as HTMLImageElement)
    expect(await axeViolations()).toEqual([])
  })
})
