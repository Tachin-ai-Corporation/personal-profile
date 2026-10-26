import { subscribe, unsubscribe } from "node:diagnostics_channel"

/**
 * Error codes that only a real socket produces. A mocked network error
 * (`HttpResponse.error()`) or an abort fails the fetch without one of these.
 */
const REAL_NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"])

/** undici's channels for a failed connection and for a request failed on one. */
export const REAL_NETWORK_CHANNELS = ["undici:client:connectError", "undici:request:error"] as const

type UndiciFailure = {
  request?: { origin?: unknown; path?: unknown }
  connectParams?: { protocol?: unknown; host?: unknown }
  error?: { code?: unknown }
}

function target({ request, connectParams }: UndiciFailure): string {
  if (request) return `${String(request.origin)}${String(request.path)}`
  return `${String(connectParams?.protocol)}//${String(connectParams?.host)}`
}

/**
 * Records every `fetch` connection or request that failed on a real socket.
 * MSW fails unhandled requests (`onUnhandledFrame: "error"`), but a
 * connection it passes through below the request layer
 * (mswjs/interceptors#881, patched in `patches/`) never reaches that check:
 * the request fails later as a plain NETWORK_ERROR. `take()` returns and
 * clears what was recorded, so `test/setup.ts` can fail the test with the
 * real cause.
 */
export function guardRealNetwork(channels: readonly string[] = REAL_NETWORK_CHANNELS): { take: () => string[]; dispose: () => void } {
  let escapes: string[] = []
  const onFailure = (message: unknown) => {
    const failure = (message ?? {}) as UndiciFailure
    const code = typeof failure.error?.code === "string" ? failure.error.code : ""
    if (REAL_NETWORK_CODES.has(code)) escapes.push(`${target(failure)} (${code})`)
  }
  for (const name of channels) subscribe(name, onFailure)
  return {
    take: () => {
      const taken = escapes
      escapes = []
      return taken
    },
    dispose: () => {
      for (const name of channels) unsubscribe(name, onFailure)
    },
  }
}
