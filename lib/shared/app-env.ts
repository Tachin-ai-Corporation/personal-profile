/**
 * The only `process.env` reads outside `lib/server/env.ts` (D6, lint exception):
 * only `NODE_ENV`, inlined by Next at build time. True under `next dev` only;
 * never in a Vercel build or under test.
 */
export function isLocalDev(): boolean {
  return process.env.NODE_ENV === "development"
}

/**
 * True in a production build (`next build` / `next start`). Development-only
 * checks (such as a duplicate Section id) run whenever this is false, so they
 * also run under test.
 */
export function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production"
}
