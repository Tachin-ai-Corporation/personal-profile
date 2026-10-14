import { act, render } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installDomStubs, type DomStubs } from "@/test/dom-stubs"
import { ACCOUNT_ANCHORS, sectionHeadingId } from "./anchors"
import { StateFrame, type FrameState } from "./state-frame"
import { motionAwareScrollBehavior, useHashAnchors, type HashAnchorsOptions } from "./use-hash-anchors"

/**
 * `useHashAnchors` (F3-3): deep links on mount and hashchange, sub-anchors,
 * `/account` heading focus, unknown hashes ignored, and one re-scroll when the
 * target frame becomes ready (cancelled by a hand scroll).
 */

let stubs: DomStubs

beforeEach(() => {
  stubs = installDomStubs()
})
afterEach(() => {
  stubs.uninstall()
  window.history.replaceState(null, "", "/")
})

function Page({ ids, options, initial = "loading" }: { readonly ids: readonly string[]; readonly options?: HashAnchorsOptions; readonly initial?: FrameState }) {
  const { frameReady } = useHashAnchors(ids, options)
  const [state, setState] = useState<FrameState>(initial)
  return (
    <>
      <button type="button" onClick={() => setState("ready")}>
        ready
      </button>
      {ids.map((id) => (
        <section key={id} id={id} aria-labelledby={sectionHeadingId(id)}>
          <h2 id={sectionHeadingId(id)} tabIndex={-1}>
            {id}
          </h2>
          <StateFrame
            state={state}
            skeleton="kv"
            loadError={{ kind: "page" }}
            level="section"
            onRetry={vi.fn()}
            onReady={() => frameReady(id)}
            anchors={<div id={`${id}-row`} />}
          >
            <div id={`${id}-row`}>row</div>
          </StateFrame>
        </section>
      ))}
    </>
  )
}

const scrolledIds = (): string[] => stubs.scrolls.map((s) => (s.el as HTMLElement).id)
const clickReady = (container: HTMLElement): void => {
  act(() => {
    container.querySelector("button")?.click()
  })
}

describe("useHashAnchors", () => {
  it("/account: #authenticator on load scrolls instantly and focuses the h2", () => {
    window.history.replaceState(null, "", "/account?tab=personal#authenticator")
    render(<Page ids={ACCOUNT_ANCHORS} options={{ focusHeading: true }} />)
    expect(stubs.scrolls).toEqual([{ el: document.getElementById("authenticator"), options: { behavior: "auto", block: "start" } }])
    expect(document.activeElement).toBe(document.getElementById(sectionHeadingId("authenticator")))
  })

  it("does not move focus unless asked", () => {
    window.history.replaceState(null, "", "/account#account")
    render(<Page ids={ACCOUNT_ANCHORS} />)
    expect(scrolledIds()).toEqual(["account"])
    expect(document.activeElement).toBe(document.body)
  })

  it("follows a sub-anchor and reports its frame", () => {
    const onFollow = vi.fn()
    window.history.replaceState(null, "", "/#account-row")
    render(<Page ids={ACCOUNT_ANCHORS} options={{ subAnchors: { "account-row": "account" }, onFollow }} />)
    expect(scrolledIds()).toEqual(["account-row"])
    expect(onFollow).toHaveBeenCalledWith("account")
  })

  it.each(["#nope", "#provider", "#%E0%A4%A", "#hasOwnProperty", "#orphan"])("ignores %s", (hash) => {
    const onFollow = vi.fn()
    window.history.replaceState(null, "", `/account${hash}`)
    render(<Page ids={ACCOUNT_ANCHORS} options={{ onFollow, subAnchors: { orphan: "elsewhere" } }} />)
    expect(stubs.scrolls).toEqual([])
    expect(onFollow).not.toHaveBeenCalled()
  })

  it("ignores a listed id with no element on the page", () => {
    window.history.replaceState(null, "", "/#ghost")
    render(<GhostOnly />)
    expect(stubs.scrolls).toEqual([])
  })

  it("re-scrolls once, instantly, when the target frame becomes ready", () => {
    window.history.replaceState(null, "", "/#account-row")
    const { container } = render(<Page ids={ACCOUNT_ANCHORS} options={{ subAnchors: { "account-row": "account" } }} />)
    expect(scrolledIds()).toEqual(["account-row"])
    clickReady(container)
    expect(stubs.scrolls.map((s) => [(s.el as HTMLElement).id, s.options])).toEqual([
      ["account-row", { behavior: "auto", block: "start" }],
      ["account-row", { behavior: "auto", block: "start" }],
    ])
  })

  it("a hand scroll before the frame is ready cancels the re-scroll", () => {
    window.history.replaceState(null, "", "/#authenticator")
    const { container } = render(<Page ids={ACCOUNT_ANCHORS} />)
    act(() => {
      window.dispatchEvent(new Event("touchmove"))
    })
    clickReady(container)
    expect(scrolledIds()).toEqual(["authenticator"])
  })

  it("nothing pending: a frame becoming ready doesn't scroll", () => {
    const { container } = render(<Page ids={ACCOUNT_ANCHORS} />)
    clickReady(container)
    expect(stubs.scrolls).toEqual([])
  })

  it("hashchange follows with the motion-aware behavior", async () => {
    stubs.setReducedMotion(true)
    render(<Page ids={ACCOUNT_ANCHORS} initial="ready" />)
    act(() => {
      window.location.hash = "#account"
    })
    await vi.waitFor(() => expect(scrolledIds()).toEqual(["account"]))
    expect(stubs.scrolls[0].options).toEqual({ behavior: "auto", block: "start" })
  })

  it("motionAwareScrollBehavior: smooth, auto under reduced motion, smooth with no matchMedia", () => {
    expect(motionAwareScrollBehavior()).toBe("smooth")
    stubs.setReducedMotion(true)
    expect(motionAwareScrollBehavior()).toBe("auto")
    vi.stubGlobal("matchMedia", undefined)
    expect(motionAwareScrollBehavior()).toBe("smooth")
  })
})

function GhostOnly() {
  useHashAnchors(["ghost"])
  return null
}
