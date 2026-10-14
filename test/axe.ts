/**
 * axe-core in jsdom for component tests. jsdom has no layout or canvas, so
 * `color-contrast` can't be measured here (it only logs "not implemented"); the
 * Playwright axe scans (`e2e/shell.spec.ts`) cover contrast in both themes.
 */
export async function axeViolations(context: Element = document.body): Promise<string[]> {
  const axe = (await import("axe-core")).default
  const results = await axe.run(context, { rules: { "color-contrast": { enabled: false } } })
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)
}
