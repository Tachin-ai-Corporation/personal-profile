/**
 * The first character of each non-blank name, uppercase (e.g. first + last
 * name → "AL"; one name → one initial; none → ""). Code-point aware, so an
 * astral character (emoji, some scripts) is never split into a lone surrogate.
 */
export function initials(...names: readonly (string | null | undefined)[]): string {
  return names
    .map((name) => Array.from((name ?? "").trim())[0] ?? "")
    .join("")
    .toUpperCase()
}

/** Shown by `orgInitials` when the name has no letter. */
export const NO_ORG_INITIALS = "?"

/**
 * The organization initials tile rule (Story 10.1, spec F7-2): the first
 * letters of the first two words of the displayed name, uppercase; a
 * one-word name gives its first two letters; non-letters are skipped (a word
 * with none doesn't count); no letter at all gives `"?"`. Code-point aware,
 * like `initials`.
 */
export function orgInitials(name: string | null | undefined): string {
  const words = (name ?? "")
    .split(/\s+/)
    .map((word) => Array.from(word).filter((char) => /\p{L}/u.test(char)))
    .filter((letters) => letters.length > 0)
  if (words.length === 0) return NO_ORG_INITIALS
  const letters = words.length === 1 ? words[0].slice(0, 2) : [words[0][0], words[1][0]]
  return letters.join("").toUpperCase()
}
