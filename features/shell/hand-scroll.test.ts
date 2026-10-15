import { fireEvent } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HAND_SCROLL_IGNORE_ATTR, onHandScroll } from "./hand-scroll"

/** The shared hand-scroll detector (F3-3): what counts, and what never does. */

afterEach(() => {
  document.body.innerHTML = ""
})

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

describe("onHandScroll", () => {
  it("counts a wheel, a touch move, a scroll key on the page and a scrollbar press, until cleaned up", () => {
    const listener = vi.fn()
    const stop = onHandScroll(listener)
    window.dispatchEvent(new Event("wheel"))
    window.dispatchEvent(new Event("touchmove"))
    for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]) fireEvent.keyDown(document.body, { key })
    fireEvent.pointerDown(document.documentElement)
    expect(listener).toHaveBeenCalledTimes(10)
    stop()
    window.dispatchEvent(new Event("wheel"))
    expect(listener).toHaveBeenCalledTimes(10)
  })

  it.each([
    '<input aria-label="x" />',
    '<textarea aria-label="x"></textarea>',
    '<select aria-label="x"><option>a</option></select>',
    '<div contenteditable="true">x</div>',
    `<div ${HAND_SCROLL_IGNORE_ATTR}><button type="button">x</button></div>`,
  ])("ignores scroll keys typed in %s", (html) => {
    const listener = vi.fn()
    const stop = onHandScroll(listener)
    const root = mount(html)
    const target = root.querySelector("button") ?? root
    fireEvent.keyDown(target, { key: " " })
    fireEvent.keyDown(target, { key: "PageDown" })
    stop()
    expect(listener).not.toHaveBeenCalled()
  })

  it("ignores other keys and presses inside the page", () => {
    const listener = vi.fn()
    const stop = onHandScroll(listener)
    const button = mount('<button type="button">x</button>')
    fireEvent.keyDown(button, { key: "a" })
    fireEvent.keyDown(button, { key: "Enter" })
    fireEvent.pointerDown(button)
    stop()
    expect(listener).not.toHaveBeenCalled()
  })
})
