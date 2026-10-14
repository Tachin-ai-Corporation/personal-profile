/**
 * =============================================================================
 * SWR keys — the only place SWR keys are built (AD-10)
 * =============================================================================
 *
 * Every key has the shape `["pp", resource, ...params]`. Inline array/string
 * keys passed to `useSWR`/`mutate`/`preload` are lint-banned, so a typo can't
 * silently split one resource into two caches.
 * =============================================================================
 */

export const keys = {
  /** `GET /api/1h/v2/user/myself` — the signed-in user (feeds the header). */
  myself: () => ["pp", "myself"] as const,
} as const

/** Any key built by `keys`. */
export type SwrKey = ReturnType<(typeof keys)[keyof typeof keys]>
