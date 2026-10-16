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

  it.each(["bare", "direct"] as const)("an already-ready %s frame needs no later re-scroll", (mode) => {
    window.history.replaceState(null, "", "/#account")
    render(<NonWrappedFrame mode={mode} />)
    expect(scrolledIds()).toEqual(["account"])
    act(() => anchors?.frameReady("account"))
    expect(scrolledIds()).toEqual(["account"])
  })

  it("an existing sub-anchor without its owning frame is followed without arming a ready callback", () => {
    window.history.replaceState(null, "", "/#account-row")
    render(<NonWrappedFrame mode="missing" />)
    expect(scrolledIds()).toEqual(["account-row"])
    act(() => anchors?.frameReady("account"))
    expect(scrolledIds()).toEqual(["account-row"])
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

  it.each(["loading", "ready"] as const)("re-follows a %s target when an earlier loading frame settles, then spends each frame once", (targetState) => {
    window.history.replaceState(null, "", "/account#authenticator")
    const { getByText } = render(<IndependentlyLoadingFrames targetState={targetState} />)
    expect(scrolledIds()).toEqual(["authenticator"])
    fireEvent.click(getByText("Account ready"))
    expect(scrolledIds()).toEqual(["authenticator", "authenticator"])
    fireEvent.click(getByText("Authenticator ready"))
    expect(scrolledIds()).toHaveLength(targetState === "loading" ? 3 : 2)
    fireEvent.click(getByText("Account loading"))
    fireEvent.click(getByText("Account ready"))
    expect(scrolledIds()).toHaveLength(targetState === "loading" ? 3 : 2)
  })

  it("a later frame's ready does not move an earlier target", () => {
    window.history.replaceState(null, "", "/account#account")
    const { getByText } = render(<IndependentlyLoadingFrames />)
    fireEvent.click(getByText("Authenticator ready"))
    expect(scrolledIds()).toEqual(["account"])
    fireEvent.click(getByText("Account ready"))
    expect(scrolledIds()).toEqual(["account", "account"])
  })

  it.each(["error", "forbidden"] as const)("re-follows a ready target when an earlier loading frame settles into %s", (failure) => {
    window.history.replaceState(null, "", "/account#authenticator")
    const { getByText } = render(<IndependentlyLoadingFrames targetState="ready" />)
    fireEvent.click(getByText(`Account ${failure}`))
    expect(scrolledIds()).toEqual(["authenticator", "authenticator"])
    fireEvent.click(getByText("Account loading"))
    fireEvent.click(getByText("Account ready"))
    expect(scrolledIds()).toEqual(["authenticator", "authenticator"])
  })

  it("hand scrolling cancels pending earlier-frame layout corrections too", () => {
    window.history.replaceState(null, "", "/account#authenticator")
    const { getByText } = render(<IndependentlyLoadingFrames targetState="ready" />)
    fireEvent.wheel(window)
    fireEvent.click(getByText("Account ready"))
    expect(scrolledIds()).toEqual(["authenticator"])
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

function NonWrappedFrame({ mode }: { readonly mode: "bare" | "direct" | "missing" }) {
  const hashAnchors = useHashAnchors(ACCOUNT_ANCHORS, { subAnchors: { "account-row": "account" } })
  useEffect(() => { anchors = hashAnchors })
  if (mode === "missing") return <div id="account-row" />
  return <div id="account" data-slot={mode === "direct" ? "state-frame" : undefined} data-state="ready" />
}

function IndependentlyLoadingFrames({ targetState = "loading" }: { readonly targetState?: FrameState }) {
  const { frameReady } = useHashAnchors(ACCOUNT_ANCHORS, { focusHeading: true })
  const [account, setAccount] = useState<FrameState>("loading")
  const [authenticator, setAuthenticator] = useState<FrameState>(targetState)
  return <>
    <button onClick={() => setAccount("ready")}>Account ready</button>
    <button onClick={() => setAccount("loading")}>Account loading</button>
    <button onClick={() => setAccount({ error: { kind: "network" } })}>Account error</button>
    <button onClick={() => setAccount({ error: { kind: "forbidden" } })}>Account forbidden</button>
    <button onClick={() => setAuthenticator("ready")}>Authenticator ready</button>
    {([["account", account], ["authenticator", authenticator]] as const).map(([id, state]) => (
      <SectionLandmark key={id} id={id} title={id}>
        <StateFrame state={state} skeleton="kv" loadError={{ kind: "page" }} level="section" onRetry={vi.fn()} onSettled={() => frameReady(id)}>Content</StateFrame>
      </SectionLandmark>
    ))}
  </>
}
