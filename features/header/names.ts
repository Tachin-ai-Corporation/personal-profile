import type { Myself } from "@/lib/api"

/** `{firstName} {lastName}`, else the username when both names are blank. */
export function displayName(myself: Pick<Myself, "firstName" | "lastName" | "username">): string {
  const name = `${(myself.firstName ?? "").trim()} ${(myself.lastName ?? "").trim()}`.trim()
  return name || (myself.username ?? "").trim()
}
