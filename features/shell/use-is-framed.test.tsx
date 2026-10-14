import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { useIsFramed } from "./use-is-framed"

/**
 * `useIsFramed()` (AD-5): `window.self !== window.top`, a throwing `window.top`
 * counts as framed, and the server snapshot is `false`.
 */

let originalTop: PropertyDescriptor | undefined

function setTop(descriptor: PropertyDescriptor) {
  originalTop ??= Object.getOwnPropertyDescriptor(window, "top")
  Object.defineProperty(window, "top", { configurable: true, ...descriptor })
}

afterEach(() => {
  cleanup()
  if (originalTop) {
    Object.defineProperty(window, "top", originalTop)
    originalTop = undefined
  }
})

function Probe() {
  return <span data-testid="framed">{String(useIsFramed())}</span>
}

describe("useIsFramed", () => {
  it("is false when top-level", () => {
    setTop({ value: window })
    render(<Probe />)
    expect(screen.getByTestId("framed")).toHaveTextContent("false")
  })

  it("is true when window.top is another window", () => {
    setTop({ value: {} })
    render(<Probe />)
    expect(screen.getByTestId("framed")).toHaveTextContent("true")
  })

  it("is true when reading window.top throws (cross-origin frame)", () => {
    setTop({
      get() {
        throw new DOMException("Blocked a frame", "SecurityError")
      },
    })
    render(<Probe />)
    expect(screen.getByTestId("framed")).toHaveTextContent("true")
  })

  it("renders false on the server snapshot", () => {
    setTop({ value: {} })
    expect(renderToString(<Probe />)).toContain(">false<")
  })
})
