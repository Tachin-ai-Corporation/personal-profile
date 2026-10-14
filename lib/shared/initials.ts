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
