import { act, fireEvent, render } from "@testing-library/react"
import { useEffect, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installDomStubs, type DomStubs } from "@/test/dom-stubs"
import { ACCOUNT_ANCHORS, sectionHeadingId, type AccountAnchor } from "./anchors"
import { resetLeaveState } from "./leave"
import { navigate } from "./navigate"
import { SectionLandmark } from "./section-landmark"
import { StateFrame, type FrameState } from "./state-frame"
import { motionAwareScrollBehavior, useHashAnchors, type HashAnchors, type HashAnchorsOptions } from "./use-hash-anchors"

/**
 * `useHashAnchors` (F3-3): deep links on mount and hashchange, sub-anchors,
 * `/account` heading focus, unknown hashes ignored, and one re-scroll when the
 * target frame becomes ready (armed only while it isn't, spent by the first
 * ready, cancelled by a hand scroll or `cancelPending`), and same-page
 * `navigate()` hashes.
 */

let stubs: DomStubs

beforeEach(() => {
  resetLeaveState()
  stubs = installDomStubs()
})
afterEach(() => {
  stubs.uninstall()
  window.history.replaceState(null, "", "/")
})

let anchors: HashAnchors | null = null

function Page({
  ids,
  options,
  initial = "loading",
}: {
  readonly ids: readonly AccountAnchor[]
  readonly options?: HashAnchorsOptions
  readonly initial?: FrameState
}) {
  const hashAnchors = useHashAnchors(ids, options)
  useEffect(() => {
    anchors = hashAnchors
  })
  const { frameReady } = hashAnchors
  const [state, setState] = useState<FrameState>(initial)
  return (
    <>
      <button type="button" onClick={() => setState("ready")}>
        ready
      </button>
      <button type="button" data-testid="reload" onClick={() => setState("loading")}>
        loading
      </button>
      <input aria-label="field" />
      {ids.map((id) => (
        <SectionLandmark key={id} id={id} title={id}>
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
        </SectionLandmark>
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
const clickLoading = (container: HTMLElement): void => {
  act(() => {
    container.querySelector<HTMLButtonElement>('[data-testid="reload"]')?.click()
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

  it.each([
    ["a PageDown outside fields", () => fireEvent.keyDown(document.body, { key: "PageDown" })],
    ["a press on the page scrollbar", () => fireEvent.pointerDown(document.documentElement)],
    ["a wheel", () => window.dispatchEvent(new Event("wheel"))],
  ])("%s before the frame is ready cancels the re-scroll", (_label, scrollByHand) => {
    window.history.replaceState(null, "", "/#authenticator")
    const { container } = render(<Page ids={ACCOUNT_ANCHORS} />)
    act(() => {
      scrollByHand()
    })
    clickReady(container)
    expect(scrolledIds()).toEqual(["authenticator"])
  })

  it("scroll keys typed in a field, and a press inside the page, keep the re-scroll", () => {
    window.history.replaceState(null, "", "/#authenticator")
    const { container, getByLabelText } = render(<Page ids={ACCOUNT_ANCHORS} />)
    fireEvent.keyDown(getByLabelText("field"), { key: " " })
    fireEvent.keyDown(getByLabelText("field"), { key: "ArrowDown" })
    fireEvent.pointerDown(getByLabelText("field"))
    clickReady(container)
    expect(scrolledIds()).toEqual(["authenticator", "authenticator"])
  })

  it("cancelPending (a Section menu / Jump to activation) drops the re-scroll", () => {
    window.history.replaceState(null, "", "/#authenticator")
    const { container } = render(<Page ids={ACCOUNT_ANCHORS} />)
    act(() => anchors?.cancelPending())
    clickReady(container)
    expect(scrolledIds()).toEqual(["authenticator"])
  })

  it("is not armed when the target frame is already ready: a later reload and ready doesn't scroll", () => {
    window.history.replaceState(null, "", "/#authenticator")
    const { container } = render(<Page ids={ACCOUNT_ANCHORS} initial="ready" />)
    expect(scrolledIds()).toEqual(["authenticator"])
    clickLoading(container)
    clickReady(container)
    expect(scrolledIds()).toEqual(["authenticator"])
  })

  it("is spent by the first ready: a second load cycle doesn't scroll again", () => {
    window.history.replaceState(null, "", "/#authenticator")
    const { container } = render(<Page ids={ACCOUNT_ANCHORS} />)
    clickReady(container)
    clickLoading(container)
    clickReady(container)
    expect(scrolledIds()).toEqual(["authenticator", "authenticator"])
  })

  it("follows a same-page navigate({ page, hash }) (a history replace, no hashchange)", async () => {
    window.history.replaceState(null, "", "/account?tab=personal")
    render(<Page ids={ACCOUNT_ANCHORS} options={{ focusHeading: true }} initial="ready" />)
    expect(stubs.scrolls).toEqual([])
    const moved = await act(() =>
      navigate({ page: "account", hash: "authenticator" }, { router: { push: vi.fn() }, portalUrl: "https://portal.test", recordActivity: vi.fn() }),
    )
    expect(moved).toBe(true)
    expect(window.location.hash).toBe("#authenticator")
    expect(stubs.scrolls).toEqual([{ el: document.getElementById("authenticator"), options: { behavior: "smooth", block: "start" } }])
    expect(document.activeElement).toBe(document.getElementById(sectionHeadingId("authenticator")))
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

/** `ghost` is listed but no element has it. */
function GhostOnly() {
  useHashAnchors(["ghost"])
  return null
}
