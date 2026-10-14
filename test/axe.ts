import axe from "axe-core"

/** The acceptance bar: WCAG 2.1 A + AA (as in the e2e specs). */
export const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

/**
 * axe over the whole document, once. jsdom has no layout or stylesheet, so
 * contrast (and with it every light/dark difference) is checked by the token
 * values (app/globals.test.ts) and in the browser, in light and dark (e2e).
 * `axe-core` is pinned to the minor `@axe-core/playwright` uses, so the rules match.
 */
export async function axeViolations(): Promise<axe.Result[]> {
  const results = await axe.run(document.body, {
    runOnly: { type: "tag", values: WCAG_21_AA },
    rules: { "color-contrast": { enabled: false } },
  })
  return results.violations
}
