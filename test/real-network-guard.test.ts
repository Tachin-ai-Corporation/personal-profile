import { channel } from "node:diagnostics_channel"
import { describe, expect, it } from "vitest"
import { guardRealNetwork, REAL_NETWORK_CHANNELS } from "./real-network-guard"

// Private channels: the suite-wide guard on undici's own channels stays quiet.
const CONNECT = "pp:test:connect-error"
const REQUEST = "pp:test:request-error"

describe("guardRealNetwork", () => {
  it("watches undici's connection and request failures by default", () => {
    expect(REAL_NETWORK_CHANNELS).toEqual(["undici:client:connectError", "undici:request:error"])
  })

  it("records connections and requests that failed on a real socket, once", () => {
    const guard = guardRealNetwork([CONNECT, REQUEST])
    channel(REQUEST).publish({ request: { origin: "http://localhost:3000", path: "/api/1h/v2/user/npi" }, error: { code: "ECONNREFUSED" } })
    channel(CONNECT).publish({ connectParams: { protocol: "https:", host: "x.test" }, error: { code: "ENOTFOUND" } })
    expect(guard.take()).toEqual(["http://localhost:3000/api/1h/v2/user/npi (ECONNREFUSED)", "https://x.test (ENOTFOUND)"])
    expect(guard.take()).toEqual([])
    guard.dispose()
  })

  it("ignores mocked network errors and aborts", () => {
    const guard = guardRealNetwork([REQUEST])
    channel(REQUEST).publish({ request: { origin: "http://localhost:3000", path: "/x" }, error: new TypeError("Network error") })
    channel(REQUEST).publish({ request: { origin: "http://localhost:3000", path: "/x" }, error: { code: 20 } })
    channel(REQUEST).publish(undefined)
    expect(guard.take()).toEqual([])
    guard.dispose()
  })

  it("stops recording once disposed", () => {
    const guard = guardRealNetwork([REQUEST])
    guard.dispose()
    channel(REQUEST).publish({ request: { origin: "o", path: "/p" }, error: { code: "ECONNREFUSED" } })
    expect(guard.take()).toEqual([])
  })
})
