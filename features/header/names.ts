import type { Myself } from "@/lib/api"

/** `{firstName} {lastName}`, else the username when both names are blank. */
export function displayName(myself: Pick<Myself, "firstName" | "lastName" | "username">): string {
  const name = `${myself.firstName.trim()} ${myself.lastName.trim()}`.trim()
  return name || myself.username.trim()
}

/**
 * First character of the first and last names, uppercase; one name gives one
 * initial; none gives "". Code-point aware, so an astral character (emoji,
 * some scripts) is never split into a lone surrogate.
 */
export function initials(myself: Pick<Myself, "firstName" | "lastName">): string {
  return [myself.firstName, myself.lastName]
    .map((name) => Array.from(name.trim())[0] ?? "")
    .join("")
    .toUpperCase()
}
