/**
 * Every SWR key in the app is built here (AD-10): `["pp", resource, ...params]`.
 * Inline array keys passed to `useSWR`/`mutate` are a lint error elsewhere.
 * Every planned key is declared now; a key gets data only once its module
 * registers a fetcher (`registerFetcher` in `fetcher.ts`).
 */

/** The Contact Point types the proxy allowlist accepts (`ContactPointConstants.ContactPointType` literals). */
export const CONTACT_POINT_TYPES = ["Email", "Mobile", "Landline", "Social Media"] as const

export type ContactPointType = (typeof CONTACT_POINT_TYPES)[number]

/** Every key family (`key[1]`). */
export const SWR_RESOURCES = [
  "myself",
  "profile-picture-id",
  "type-key",
  "contact-points",
  "addresses",
  "insurance",
  "npi",
  "practice-support",
  "orgs",
] as const

export type SwrResource = (typeof SWR_RESOURCES)[number]

export type SwrKey = readonly ["pp", string, ...(string | number)[]]

export const keys = {
  myself: (): readonly ["pp", "myself"] => ["pp", "myself"],
  /** The header picture's file id (Story 1.10). */
  profilePictureId: (): readonly ["pp", "profile-picture-id"] => ["pp", "profile-picture-id"],
  /** `GET v2/type/key/{type}` lookups, e.g. `ContactPoint` labels (Story 3.1). */
  typeKey: <T extends string>(type: T): readonly ["pp", "type-key", T] => ["pp", "type-key", type],
  /** One key per Contact Type, shared by the header, Contacts and `/account` (Story 1.9). */
  contactPoints: <T extends ContactPointType>(type: T): readonly ["pp", "contact-points", T] => ["pp", "contact-points", type],
  addresses: (): readonly ["pp", "addresses"] => ["pp", "addresses"],
  insurance: (): readonly ["pp", "insurance"] => ["pp", "insurance"],
  npi: (): readonly ["pp", "npi"] => ["pp", "npi"],
  practiceSupport: (): readonly ["pp", "practice-support"] => ["pp", "practice-support"],
  /** My Organizations, by search text and page (Story 10.1). */
  orgs: (name: string, page: number): readonly ["pp", "orgs", string, number] => ["pp", "orgs", name, page],
} as const satisfies Record<string, (...args: never[]) => SwrKey>

export function isSwrKey(value: unknown): value is SwrKey {
  return Array.isArray(value) && value[0] === "pp" && typeof value[1] === "string"
}

/**
 * SWR's global `mutate` (the root `SWRConfig` uses the default cache). Loaded
 * on call: `lib/api` is also imported from Server Components, where the
 * `react-server` build of `swr` has no `mutate` export.
 */
async function globalMutate(): Promise<(typeof import("swr"))["mutate"]> {
  return (await import("swr")).mutate
}

/** Revalidates `["pp","myself"]` (header, `/account`, Personal information). */
export async function mutateMyself(): Promise<void> {
  const mutate = await globalMutate()
  await mutate(keys.myself())
}

/** Revalidates the given Contact Types' keys, or every Contact Type with none given. */
export async function mutateContactPoints(...types: readonly ContactPointType[]): Promise<void> {
  const wanted: readonly unknown[] = types.length > 0 ? types : CONTACT_POINT_TYPES
  const mutate = await globalMutate()
  await mutate((key: unknown) => isSwrKey(key) && key[1] === "contact-points" && wanted.includes(key[2]))
}
