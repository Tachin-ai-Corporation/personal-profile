/**
 * Likely typos of a well-known email provider's domain (`test@gmail.cnn` →
 * `test@gmail.com`). Pure and isomorphic. A syntax check can't catch these:
 * `gmail.cnn` is a well-formed domain. The rules are deliberately narrow,
 * because rejecting a real address is worse than missing a typo:
 *
 * - only a two-label domain (`name.suffix`) is checked: a subdomain, a
 *   multi-label suffix (`co.uk`) and any unknown name are left alone;
 * - a provider's own name with a suffix one or two edits from `com`
 *   (`gmail.cnn`, `gmail.cdm`, `gmail.co`). A provider with regional domains
 *   (`yahoo.fr`, `hotmail.ca`) is flagged only for a suffix of three or more
 *   letters, so a two-letter country code is never flagged for it;
 * - a name one edit (a transposition counts as one) from a provider's name of
 *   five or more letters, with the same first letter, at exactly `com`
 *   (`gmial.com`, `yahooo.com`, `hotmal.com`). The first-letter rule keeps
 *   real neighbours such as `email.com` and `cloud.com` valid.
 */

interface Provider {
  /** The domain's first label, as the provider spells it. */
  readonly name: string
  /** `true` when the provider also runs country domains (`yahoo.fr`): a two-letter suffix is then never a typo. */
  readonly regional: boolean
}

/** The well-known providers, each at `<name>.com`. */
const PROVIDERS: readonly Provider[] = [
  { name: "gmail", regional: false },
  { name: "googlemail", regional: false },
  { name: "icloud", regional: false },
  { name: "yahoo", regional: true },
  { name: "outlook", regional: true },
  { name: "hotmail", regional: true },
  { name: "live", regional: true },
  { name: "msn", regional: true },
  { name: "aol", regional: true },
  { name: "protonmail", regional: true },
]

const PROVIDER_SUFFIX = "com"

/** The shortest provider name a name typo is matched against: shorter names have too many real neighbours. */
const NAME_TYPO_MIN_LENGTH = 5

/** The edit distance between `a` and `b`, a transposition of two neighbours counting as one edit (optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
    }
  }
  return rows[a.length][b.length]
}

/** The provider domain `domain` (lower-case, `name.suffix`) is a likely typo of, or `null`. */
function correctedDomain(domain: string): string | null {
  const labels = domain.split(".")
  if (labels.length !== 2) return null
  const [name, suffix] = labels
  const exact = PROVIDERS.find((provider) => provider.name === name)
  if (exact) {
    if (suffix === PROVIDER_SUFFIX) return null
    if (exact.regional && suffix.length < 3) return null
    return editDistance(suffix, PROVIDER_SUFFIX) <= 2 ? `${exact.name}.${PROVIDER_SUFFIX}` : null
  }
  if (suffix !== PROVIDER_SUFFIX) return null
  const near = PROVIDERS.find(
    (provider) => provider.name.length >= NAME_TYPO_MIN_LENGTH && provider.name[0] === name[0] && editDistance(name, provider.name) === 1,
  )
  return near ? `${near.name}.${PROVIDER_SUFFIX}` : null
}

/**
 * The corrected address when `address`'s domain is a likely typo of a
 * well-known provider (the local part kept as typed, the domain lower-case),
 * else `null`. `address` is trimmed; one without `@` or with an empty part
 * gives `null` (the syntax check reports those).
 */
export function suggestEmailCorrection(address: string): string | null {
  const trimmed = address.trim()
  const at = trimmed.lastIndexOf("@")
  if (at <= 0 || at === trimmed.length - 1) return null
  const corrected = correctedDomain(trimmed.slice(at + 1).toLowerCase())
  return corrected === null ? null : `${trimmed.slice(0, at)}@${corrected}`
}
