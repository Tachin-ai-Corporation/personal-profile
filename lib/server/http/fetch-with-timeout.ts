import "server-only"

/** AD-2: upstream calls give up after 25 s. */
export const UPSTREAM_TIMEOUT_MS = 25_000

export type FetchOutcome =
  | { readonly kind: "response"; readonly response: Response }
  | { readonly kind: "timeout" }
  | { readonly kind: "network" }

/**
 * Re-wraps the body so the abort timer stays armed until the body is fully
 * read, errors or is cancelled: a stalled body is cut off at the same deadline.
 */
function guardBody(response: Response, controller: AbortController, timer: ReturnType<typeof setTimeout>): Response {
  const source = response.body
  if (source === null) {
    clearTimeout(timer)
    return response
  }
  const reader = source.getReader()
  let settled = false
  const settle = (): void => {
    settled = true
    clearTimeout(timer)
  }
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      controller.signal.addEventListener(
        "abort",
        // Only the timer aborts, and it is cleared once the body settles.
        () => {
          settle()
          stream.error(new Error("Upstream body timed out"))
          discardReader(reader)
        },
        { once: true },
      )
    },
    async pull(stream) {
      try {
        const chunk = await reader.read()
        if (settled) return
        if (chunk.done) {
          settle()
          stream.close()
        } else {
          stream.enqueue(chunk.value)
        }
      } catch (error) {
        // Erroring an already-errored stream is a no-op.
        settle()
        stream.error(error)
      }
    },
    cancel(reason) {
      settle()
      return reader.cancel(reason)
    },
  })
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

function discardReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  /* v8 ignore next -- the rejection handler only runs if cancelling the source fails */
  reader.cancel().catch(() => undefined)
}

/**
 * The one upstream `fetch` wrapper: `cache: "no-store"` (AD-18),
 * `redirect: "manual"` (AD-2) and a hard timeout that covers the headers and
 * the whole body. Never throws; a body cut off by the timeout errors when read.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS,
): Promise<FetchOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    })
  } catch {
    clearTimeout(timer)
    return controller.signal.aborted ? { kind: "timeout" } : { kind: "network" }
  }
  return { kind: "response", response: guardBody(response, controller, timer) }
}

/** Releases an upstream body the caller will not read; a failed cancel changes nothing. */
export function discardBody(response: Response): void {
  /* v8 ignore next -- the rejection handler only runs if cancelling an unlocked stream fails */
  response.body?.cancel().catch(() => undefined)
}
