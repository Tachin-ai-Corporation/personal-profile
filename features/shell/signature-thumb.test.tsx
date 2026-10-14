import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import { SignatureThumb } from "./signature-thumb"

/** `SignatureThumb` (F3-3; Stories 2.1, 9.3): load, error fallback, skeleton, per-file reset. */

afterEach(() => document.documentElement.classList.remove("dark"))

const hasClasses = (el: Element | null | undefined, ...names: string[]): void => {
  for (const name of names) expect(el?.classList.contains(name), `${name} on ${el?.outerHTML.slice(0, 80)}`).toBe(true)
}
const thumb = (): HTMLElement | null => document.querySelector('[data-slot="signature-thumb"]')
const skeleton = (): HTMLElement | null => document.querySelector('[data-slot="signature-thumb-skeleton"]')

describe("SignatureThumb", () => {
  it("loads the proxied download as a 112 × 32 object-contain image, with a skeleton until it loads", () => {
    render(<SignatureThumb fileId={42} fallback="Not provided" />)
    const img = screen.getByRole("img", { name: "Your signature" })
    expect(img.getAttribute("src")).toBe("/api/1h/v2/file/42/download")
    expect(img.getAttribute("width")).toBe("112")
    expect(img.getAttribute("height")).toBe("32")
    hasClasses(img, "object-contain", "opacity-0")
    hasClasses(thumb(), "w-28", "h-8", "rounded-sm", "border", "bg-background")
    expect(thumb()?.getAttribute("aria-busy")).toBe("true")
    hasClasses(skeleton(), "bg-muted", "motion-reduce:animate-none")
    expect(skeleton()?.getAttribute("aria-hidden")).toBe("true")

    fireEvent.load(img)
    expect(skeleton()).toBeNull()
    expect(thumb()?.getAttribute("data-state")).toBe("loaded")
    expect(thumb()?.getAttribute("aria-busy")).toBeNull()
    expect(img.classList.contains("opacity-0")).toBe(false)
  })

  it.each(["Not provided", "No signature available"])("a failed load shows the caller's fallback (%s), never a broken image", (fallback) => {
    render(<SignatureThumb fileId="7" fallback={fallback} alt="Signature image" />)
    fireEvent.error(screen.getByRole("img", { name: "Signature image" }))
    expect(screen.queryByRole("img")).toBeNull()
    expect(screen.getByText(fallback).getAttribute("data-slot")).toBe("signature-thumb-fallback")
  })

  it.each([null, undefined, 0, "abc"])("no usable file id (%j) shows the fallback", (fileId) => {
    render(<SignatureThumb fileId={fileId} fallback="Not provided" />)
    expect(screen.queryByRole("img")).toBeNull()
    hasClasses(screen.getByText("Not provided"), "text-muted-foreground")
  })

  it("a new file id starts over (key={fileId}): loading again, the old failure forgotten", () => {
    const { rerender } = render(<SignatureThumb fileId={1} fallback="Not provided" />)
    fireEvent.error(screen.getByRole("img"))
    expect(screen.queryByRole("img")).toBeNull()
    rerender(<SignatureThumb fileId={2} fallback="Not provided" />)
    expect(screen.getByRole("img").getAttribute("src")).toBe("/api/1h/v2/file/2/download")
    expect(thumb()?.getAttribute("data-state")).toBe("loading")
  })

  it("reads an image that completed before hydration", () => {
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete")
    const natural = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth")
    try {
      Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true })
      Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 112 })
      const { unmount } = render(<SignatureThumb fileId={3} fallback="Not provided" />)
      expect(thumb()?.getAttribute("data-state")).toBe("loaded")
      unmount()
      Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 0 })
      render(<SignatureThumb fileId={4} fallback="Not provided" />)
      expect(screen.getByText("Not provided")).toBeTruthy()
    } finally {
      if (complete) Object.defineProperty(HTMLImageElement.prototype, "complete", complete)
      if (natural) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", natural)
    }
  })

  it.each(["light", "dark"])("axe: loading, loaded and fallback (%s)", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    render(
      <main>
        <SignatureThumb fileId={5} fallback="Not provided" />
        <SignatureThumb fileId={null} fallback="No signature available" />
      </main>,
    )
    expect(await axeViolations()).toEqual([])
    fireEvent.load(screen.getByRole("img"))
    expect(await axeViolations()).toEqual([])
  })
})
