import "@testing-library/jest-dom/vitest"
import { afterAll, afterEach, beforeAll } from "vitest"
import { server } from "./test/server"

// Start one MSW server for the whole run. `onUnhandledFrame: "error"` (msw 3's
// name for the former `onUnhandledRequest`) makes any request a test did not
// explicitly mock fail the test (AD-2: the client only ever talks to the
// same-origin `/api` boundary, which is what we mock here).
beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
