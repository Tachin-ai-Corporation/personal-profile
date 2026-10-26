import type { Myself } from "@/lib/api"

/** `{firstName} {lastName}`, else the username when both names are blank. */
export function displayName(myself: Pick<Myself, "firstName" | "lastName" | "username">): string {
  const name = `${(myself.firstName ?? "").trim()} ${(myself.lastName ?? "").trim()}`.trim()
  return name || (myself.username ?? "").trim()
}

/**
 * Whether the header shows a person's name, not the username fallback. Only a
 * name is capitalized for display, as 1health-fe's header does
 * (ProfileInfoCard.tsx:127, CSS `capitalize`); a username keeps its case.
 */
export function hasPersonName(myself: Pick<Myself, "firstName" | "lastName">): boolean {
  return `${myself.firstName ?? ""}${myself.lastName ?? ""}`.trim() !== ""
}
