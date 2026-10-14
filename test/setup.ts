import { afterAll, afterEach, beforeAll } from "vitest"
import { server } from "./msw-server"

/** Any request without a handler fails the test: nothing reaches the network. */
beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
