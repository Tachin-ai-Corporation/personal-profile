/**
 * Next.js instrumentation hook.
 *
 * `register()` runs once when the server boots. Importing `lib/server/env.ts`
 * here runs its load-time validation, so a missing or invalid required variable
 * fails the boot with a message that names the variable (never its value).
 */
export async function register() {
  await import("./lib/server/env")
}
