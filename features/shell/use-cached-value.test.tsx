import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { StrictMode, useState } from "react"
import { renderToString } from "react-dom/server"
import useSWR, { SWRConfig, mutate, unstable_serialize, useSWRConfig, type Cache } from "swr"
import { describe, expect, it, vi } from "vitest"
import { fetchers, keys, type ContactPoint } from "@/lib/api"
import { server } from "@/test/msw-server"
import { contactPointWire } from "@/test/myself-fixture"
import { TestProviders } from "@/test/providers"
import { useCachedValue } from "./use-cached-value"

function Region({ type = "Mobile", label = "cached" }: { readonly type?: "Mobile" | "Landline"; readonly label?: string }) {
  const rows = useCachedValue<readonly ContactPoint[]>(keys.contactPoints(type))
  return <output aria-label={label}>{rows?.[0]?.phoneNumberRegion ?? "none"}</output>
}

describe("useCachedValue", () => {
  it("never fetches and leaves later consumers' mutation, focus and reconnect refreshes active", async () => {
    let reads = 0
    server.use(http.get("/api/1h/v2/user/contact-point/list", () => {
      reads += 1
      return HttpResponse.json([contactPointWire({ phoneNumberRegion: reads === 1 ? "us" : "gb" })])
    }))
    function Active() {
      useSWR(keys.contactPoints("Mobile"), () => fetchers.contactPoints("Mobile"), { focusThrottleInterval: 0 })
      return null
    }
    function Host() {
      const [active, setActive] = useState(false)
      const { mutate: refresh } = useSWRConfig()
      return <><Region /><button onClick={() => setActive(true)}>Activate</button><button onClick={() => void refresh(keys.contactPoints("Mobile"))}>Refresh</button>{active && <Active />}</>
    }
    render(<TestProviders><Host /></TestProviders>)
    act(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")) })
    expect(reads).toBe(0)
    fireEvent.click(screen.getByText("Activate"))
    await waitFor(() => expect(screen.getByLabelText("cached").textContent).toBe("us"))
    expect(reads).toBe(1)
    fireEvent.click(screen.getByText("Refresh"))
    await waitFor(() => expect(screen.getByLabelText("cached").textContent).toBe("gb"))
    expect(reads).toBe(2)
    act(() => { window.dispatchEvent(new Event("focus")) })
    await waitFor(() => expect(reads).toBe(3))
    act(() => { window.dispatchEvent(new Event("online")) })
    await waitFor(() => expect(reads).toBe(4))
  })

  it("shares subscriptions, follows key changes/deletion, and restores inherited cache methods", () => {
    const cache: Cache = new Map()
    const originalSet = cache.set
    const originalDelete = cache.delete
    const mobile = unstable_serialize(keys.contactPoints("Mobile"))
    const landline = unstable_serialize(keys.contactPoints("Landline"))
    const config = { provider: () => cache }
    const view = render(<StrictMode><SWRConfig value={config}><Region /><Region label="second" /></SWRConfig></StrictMode>)
    act(() => cache.set(mobile, { data: [{ phoneNumberRegion: "gb" }] }))
    expect(screen.getByLabelText("cached").textContent).toBe("gb")
    expect(screen.getByLabelText("second").textContent).toBe("gb")
    view.rerender(<StrictMode><SWRConfig value={config}><Region type="Landline" /></SWRConfig></StrictMode>)
    act(() => cache.set(landline, { data: [{ phoneNumberRegion: "ca" }] }))
    expect(screen.getByLabelText("cached").textContent).toBe("ca")
    act(() => cache.delete(landline))
    expect(screen.getByLabelText("cached").textContent).toBe("none")
    act(() => cache.set(mobile, { data: [] }))
    view.unmount()
    expect(cache.set).toBe(originalSet)
    expect(cache.delete).toBe(originalDelete)
    expect(Object.hasOwn(cache, "set")).toBe(false)
    expect(Object.hasOwn(cache, "delete")).toBe(false)
  })

  it("preserves own method descriptors and the global default mutate/cache identity", async () => {
    const cache: Cache = new Map()
    Object.defineProperty(cache, "set", { configurable: true, writable: true, value: cache.set })
    Object.defineProperty(cache, "delete", { configurable: true, writable: true, value: cache.delete })
    const beforeSet = Object.getOwnPropertyDescriptor(cache, "set")
    const beforeDelete = Object.getOwnPropertyDescriptor(cache, "delete")
    const view = render(<SWRConfig value={{ provider: () => cache }}><Region /></SWRConfig>)
    view.unmount()
    expect(Object.getOwnPropertyDescriptor(cache, "set")).toEqual(beforeSet)
    expect(Object.getOwnPropertyDescriptor(cache, "delete")).toEqual(beforeDelete)
    const global = render(<Region />)
    await act(async () => { await mutate(keys.contactPoints("Mobile"), [{ phoneNumberRegion: "nz" }], false) })
    expect(screen.getByLabelText("cached").textContent).toBe("nz")
    global.unmount()
    await mutate(keys.contactPoints("Mobile"), undefined, false)
  })

  it("reads fallback without fetching", () => {
    const fetcher = vi.fn()
    render(<SWRConfig value={{ provider: () => new Map(), fetcher, fallback: { [unstable_serialize(keys.contactPoints("Mobile"))]: [{ phoneNumberRegion: "gb" }] } }}><Region /></SWRConfig>)
    expect(screen.getByLabelText("cached").textContent).toBe("gb")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("preserves an explicit null instead of reviving fallback data", () => {
    const cache: Cache = new Map()
    const key = keys.contactPoints("Mobile")
    cache.set(unstable_serialize(key), { data: null })
    function Value() {
      const value = useCachedValue<null | string>(key)
      return <output aria-label="nullable">{value === null ? "null" : value}</output>
    }
    render(<SWRConfig value={{ provider: () => cache, fallback: { [unstable_serialize(key)]: "old" } }}><Value /></SWRConfig>)
    expect(screen.getByLabelText("nullable").textContent).toBe("null")
  })

  it("uses an empty server snapshot before hydration even with cached fallback", () => {
    const markup = renderToString(<SWRConfig value={{ fallback: { [unstable_serialize(keys.contactPoints("Mobile"))]: [{ phoneNumberRegion: "gb" }] } }}><Region /></SWRConfig>)
    expect(markup).toContain("none")
    expect(markup).not.toContain("gb")
  })
})
