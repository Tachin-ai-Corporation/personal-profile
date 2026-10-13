/**
 * Client-safe `APP_ENV`.
 *
 * This is the ONE place in client-reachable code allowed to read `process.env`,
 * and only the `NEXT_PUBLIC_APP_ENV` member (ESLint enforces this). Server code
 * must read the validated `APP_ENV` from `lib/server/env.ts` instead.
 */
export type AppEnv = "dev" | "demo" | "prod"

// eslint-disable-next-line no-restricted-properties -- the sole allowed client process.env read
const raw = process.env.NEXT_PUBLIC_APP_ENV

/** The environment this build targets, or `undefined` when not configured. */
export const APP_ENV: AppEnv | undefined =
  raw === "dev" || raw === "demo" || raw === "prod" ? raw : undefined
