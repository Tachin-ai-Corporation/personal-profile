/**
 * The shared app-env helper (D6).
 *
 * The ONE place outside `lib/server/env.ts` allowed to read `process.env`, and
 * only `process.env.NODE_ENV` (ESLint enforces both). It holds no environment
 * choice: demo vs prod is per session, never per build (D1, D2).
 */

/** `true` only under local `next dev` (`NODE_ENV === "development"`). */
export function isLocalDev(): boolean {
  return process.env.NODE_ENV === "development"
}
