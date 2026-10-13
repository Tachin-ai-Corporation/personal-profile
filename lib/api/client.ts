/**
 * =============================================================================
 * callApi — the single browser transport
 * =============================================================================
 *
 * The browser talks ONLY to this app's own origin, and only through `callApi`
 * (AD-19). Every 1health call goes to a same-origin `/api/...` path that the
 * server proxies (the proxy, allowlist, CSRF header, refresh and session signals
 * arrive in Stories 1.3–1.5). This story keeps the signature and the plain
 * same-origin fetch; it adds no auth, headers or refresh.
 *
 * `callApi` returns `ApiResponse<T>` and never throws on HTTP errors.
 * `callApiRaw` returns the raw `Response` for blobs/downloads.
 * =============================================================================
 */

/** Standard result envelope returned by every API module function. */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  /** HTTP status of the underlying call, when there was one. */
  statusCode?: number
}

/** Build a success envelope. */
export function ok<T>(data: T, statusCode?: number): ApiResponse<T> {
  return { success: true, data, statusCode }
}

/**
 * Build an error envelope and log it with a `"<module>/<fn>"` context tag.
 * `context` shows up in the console so failures are greppable to their origin.
 */
export function err(error: unknown, context: string, statusCode?: number): ApiResponse<never> {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[pp API] ${context}:`, error)
  return { success: false, error: message, statusCode }
}

/**
 * The canonical JSON call. Issues a plain same-origin `fetch(path, init)` to the
 * given `/api/...` path, reads the body defensively (some endpoints return an
 * empty body on success), and wraps everything in an `ApiResponse<T>`.
 *
 * `path` must be a same-origin `/api/...` path, e.g. `/api/1h/v2/user/myself`.
 *
 * @example
 * const res = await callApi<UserInfo>("myself/fetch", "/api/1h/v2/user/myself")
 * if (res.success) use(res.data)
 */
export async function callApi<T = unknown>(
  context: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(path, init)
    const text = await response.text()

    if (!response.ok) {
      console.error(`[pp API] ${context}:`, response.status, text)
      return { success: false, error: `${context} failed (${response.status})`, statusCode: response.status }
    }

    // Success may carry JSON, a bare string, or nothing at all.
    let data: unknown = undefined
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }
    return { success: true, data: data as T, statusCode: response.status }
  } catch (error) {
    return err(error, context)
  }
}

/**
 * Escape hatch for non-JSON responses (file downloads / blobs) or when you need
 * the raw `Response`. Issues the same plain same-origin fetch.
 */
export async function callApiRaw(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, init)
}
