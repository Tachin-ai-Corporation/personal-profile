import { afterAll, afterEach, beforeAll } from "vitest"
import { server } from "./msw-server"
import { guardRealNetwork } from "./real-network-guard"

const realNetwork = guardRealNetwork()

/** Any request without a handler fails the test: nothing reaches the network. */
beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
afterEach(() => {
  server.resetHandlers()
  // A request that reached a real socket fails the test with its cause.
  const escapes = realNetwork.take()
  if (escapes.length > 0) throw new Error(`A request left MSW for the real network: ${escapes.join(", ")}`)
})
afterAll(() => {
  server.close()
  realNetwork.dispose()
})
