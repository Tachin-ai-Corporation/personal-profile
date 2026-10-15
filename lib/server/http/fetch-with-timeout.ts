import "server-only"

/** AD-2: upstream calls give up after 25 s. */
export const UPSTREAM_TIMEOUT_MS = 25_000

/** A streamed upstream body (proxy downloads) is cut off after this long without a chunk. */
export const UPSTREAM_BODY_IDLE_MS = 10_000

/** The error a guarded body raises when a timer cut it off (a timeout, not an upstream failure). */
export class UpstreamBodyTimeoutError extends Error {
  constructor() {
    super("Upstream body timed out")
    this.name = "UpstreamBodyTimeoutError"
  }
}

export type FetchOutcome =
  | { readonly kind: "response"; readonly response: Response }
  | { readonly kind: "timeout" }
  | { readonly kind: "network" }

export interface FetchTimeouts {
  /** Deadline for the response headers (and, without `bodyIdleMs`, for the whole body). Default 25 s. */
  readonly timeoutMs?: number
  /**
   * Streamed bodies: once the headers arrive the deadline is replaced by an
   * idle timer that runs only while an upstream read is pending (armed when a
   * read starts, cleared when its chunk is enqueued), so it measures upstream
   * silence, never a slow reader. Absent, the deadline keeps covering the
   * whole body (total cap: refresh, revoke, launch, named operations).
   */
  readonly bodyIdleMs?: number
}

/** The one abort timer of a fetch: armed for the headers, then re-armed or kept for the body. */
class AbortTimer {
  private handle: ReturnType<typeof setTimeout>

  constructor(
    private readonly controller: AbortController,
    ms: number,
  ) {
    this.handle = setTimeout(() => controller.abort(), ms)
  }

  rearm(ms: number): void {
    clearTimeout(this.handle)
    this.handle = setTimeout(() => this.controller.abort(), ms)
  }

  clear(): void {
    clearTimeout(this.handle)
  }
}

/**
 * Re-wraps the body so the abort timer stays armed until the body is fully
 * read, errors or is cancelled: a stalled body is cut off. With `idleMs` the
 * timer runs only while an upstream read is pending.
 */
function guardBody(response: Response, controller: AbortController, timer: AbortTimer, idleMs: number | undefined): Response {
  const source = response.body
  if (source === null) {
    timer.clear()
    return response
  }
  const reader = source.getReader()
  let settled = false
  const settle = (): void => {
    settled = true
    timer.clear()
  }
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      controller.signal.addEventListener(
        "abort",
        // Only the timer aborts, and it is cleared once the body settles.
        () => {
          settle()
          stream.error(new UpstreamBodyTimeoutError())
          discardReader(reader)
        },
        { once: true },
      )
    },
    async pull(stream) {
      try {
        if (idleMs !== undefined) timer.rearm(idleMs)
        const chunk = await reader.read()
        if (settled) return
        if (idleMs !== undefined) timer.clear()
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
 * `redirect: "manual"` (AD-2), and a deadline that covers the headers and then
 * either the whole body or, with `bodyIdleMs`, each gap between chunks. Never
 * throws; a body cut off by a timer errors when read.
 */
export async function fetchWithTimeout(url: string, init: RequestInit, timeouts: FetchTimeouts = {}): Promise<FetchOutcome> {
  const controller = new AbortController()
  const timer = new AbortTimer(controller, timeouts.timeoutMs ?? UPSTREAM_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    })
  } catch {
    timer.clear()
    return controller.signal.aborted ? { kind: "timeout" } : { kind: "network" }
  }
  // An opaque redirect (status 0) has nothing to read, and a status-0 Response
  // can't be re-wrapped: hand it back as is (callers treat it as a redirect).
  if (isOpaqueRedirect(response)) {
    timer.clear()
    return { kind: "response", response }
  }
  // Headers arrived: from now on only a pending upstream read is timed.
  if (timeouts.bodyIdleMs !== undefined) timer.clear()
  return { kind: "response", response: guardBody(response, controller, timer, timeouts.bodyIdleMs) }
}

/** A `redirect: "manual"` answer some runtimes expose as `type: "opaqueredirect"`, status 0 (AD-2). */
export function isOpaqueRedirect(response: Response): boolean {
  return response.type === "opaqueredirect" || response.status === 0
}

/** Releases an upstream body the caller will not read; a failed cancel changes nothing. */
export function discardBody(response: Response): void {
  /* v8 ignore next -- the rejection handler only runs if cancelling an unlocked stream fails */
  response.body?.cancel().catch(() => undefined)
}
