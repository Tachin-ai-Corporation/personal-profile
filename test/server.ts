import { setupServer } from "msw/node"

/**
 * The shared MSW server. Tests add handlers with `server.use(...)`; the global
 * setup (`vitest.setup.ts`) starts it with `onUnhandledRequest: "error"`, so any
 * request a test didn't explicitly mock fails loudly. All mocking is at the
 * same-origin `/api` boundary.
 */
export const server = setupServer()
