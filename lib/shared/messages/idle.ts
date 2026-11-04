/** The idle warning (Story 1.6, EXPERIENCE.md automatic logoff). */
export const IDLE_MESSAGES = {
  title: "Still there?", // DRAFT COPY (architecture-added idle warning, PM review; redesign 2026-11)
  description: "For your security, you'll be signed out in {time}.", // DRAFT COPY ({time}: the live countdown, m:ss)
  stay: "Stay signed in", // DRAFT COPY (architecture-added idle warning, PM review)
  signOut: "Sign out now", // DRAFT COPY (signs out and returns to 1health, as Return to 1health)
  staying: "Keeping you signed in…", // DRAFT COPY (screen-reader status while "Stay signed in" is pending)
  remaining: "{seconds} seconds left before you're signed out.", // DRAFT COPY (screen-reader status at 30 s and 10 s)
} as const
