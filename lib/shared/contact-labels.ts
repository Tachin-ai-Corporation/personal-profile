/**
 * The Contact Labels of a phone, email or social link (Team A, Story 3.1,
 * FR15): the one definition Phone, Email and Social media import. The list
 * and its order are the Story 3.1 AC's (the backend enum
 * `ContactPointConstants.ContactPointLabel` orders them differently and also
 * holds "Partnership Organization", which users never pick). Pure: imports
 * nothing from the app.
 */

/** Every Contact Label a user can see, in display order. */
export const CONTACT_LABELS = ["Primary", "Home", "Main", "Old", "Personal", "Mailing List", "Work"] as const

export type ContactLabel = (typeof CONTACT_LABELS)[number]

/** A Home number or address: never verified, so it shows no verification status (backend rule). */
export const CONTACT_LABEL_HOME: ContactLabel = "Home"

/** The label a replaced Primary gets in a Primary switch (AD-9). */
export const CONTACT_LABEL_OLD: ContactLabel = "Old"

/** The Contact Types of a phone, in the Phone Section's read order (backend `ContactPointType`). */
export const CONTACT_PHONE_TYPES = ["Mobile", "Landline"] as const

export type ContactPhoneType = (typeof CONTACT_PHONE_TYPES)[number]

const isContactLabel = (name: string): name is ContactLabel => (CONTACT_LABELS as readonly string[]).includes(name)

/**
 * The Contact Labels the platform offers: the `CONTACT_LABELS` that `names`
 * holds (the `label` value names of `GET v2/type/key/ContactPoint`, from
 * `valueListOptions(info, "label")`, which sorts them by locale), put back in
 * `CONTACT_LABELS` order. Any other name ("Partnership Organization",
 * "Main Work") is dropped. Without names (the type key is loading or failed),
 * or when none of them is a Contact Label, every `CONTACT_LABELS` entry.
 */
export function contactLabelsFrom(names?: readonly string[]): readonly ContactLabel[] {
  const offered = new Set((names ?? []).filter(isContactLabel))
  if (offered.size === 0) return CONTACT_LABELS
  return CONTACT_LABELS.filter((label) => offered.has(label))
}
