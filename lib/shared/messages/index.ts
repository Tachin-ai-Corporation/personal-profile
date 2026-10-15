/**
 * User-facing copy (AD-11): the one message catalog, one file per area so
 * stories of different areas never edit the same file. Components never
 * inline user-facing strings. Import from `@/lib/shared/messages`.
 *
 * - `launch.ts`: the /auth launch strings (D9), outside `MESSAGE_CATALOG`.
 * - Every other area file: verbatim from the EXPERIENCE.md Voice and Tone
 *   table, unless the line carries a `// DRAFT COPY` marker
 *   (`messages.test.ts` reads every area file and enforces both, plus the
 *   voice rules and catalog-wide uniqueness).
 * - `{Name}` placeholders are filled with `formatMessage()`.
 *
 * Every planned area's file exists (empty until its stories add copy) and is
 * aggregated here once, so a story edits only its own area file.
 */

import type { SectionId } from "../section-ids"
import { ACCOUNT_MESSAGES } from "./account"
import { ADDRESS_MESSAGES } from "./addresses"
import { COMMON_MESSAGES } from "./common"
import { CONTACT_MESSAGES } from "./contacts"
import { DISABLED_MESSAGES } from "./disabled"
import { DRAFT_MESSAGES } from "./drafts"
import { HEADER_MESSAGES } from "./header"
import { IDLE_MESSAGES } from "./idle"
import { INSURANCE_MESSAGES } from "./insurance"
import { LEAVE_GUARD_MESSAGES } from "./leave-guard"
import { MFA_MESSAGES } from "./mfa"
import { NPI_MESSAGES } from "./npi"
import { ORG_MESSAGES } from "./orgs"
import { PERSON_MESSAGES } from "./person"
import { PLACES_MESSAGES } from "./places"
import { SECTION_MESSAGES } from "./section"
import { SESSION_EXPIRED_MESSAGES } from "./session"
import { SHELL_MESSAGES } from "./shell"
import { STATE_MESSAGES } from "./state"

export { LAUNCH_ERROR_MESSAGES, LAUNCH_MESSAGES } from "./launch"
export {
  ACCOUNT_MESSAGES,
  ADDRESS_MESSAGES,
  COMMON_MESSAGES,
  CONTACT_MESSAGES,
  DISABLED_MESSAGES,
  DRAFT_MESSAGES,
  HEADER_MESSAGES,
  IDLE_MESSAGES,
  INSURANCE_MESSAGES,
  LEAVE_GUARD_MESSAGES,
  MFA_MESSAGES,
  NPI_MESSAGES,
  ORG_MESSAGES,
  PERSON_MESSAGES,
  PLACES_MESSAGES,
  SECTION_MESSAGES,
  SESSION_EXPIRED_MESSAGES,
  SHELL_MESSAGES,
  STATE_MESSAGES,
}

/** Every app-catalog group (not the launch strings). */
export const MESSAGE_CATALOG = {
  common: COMMON_MESSAGES,
  shell: SHELL_MESSAGES,
  section: SECTION_MESSAGES,
  state: STATE_MESSAGES,
  header: HEADER_MESSAGES,
  leaveGuard: LEAVE_GUARD_MESSAGES,
  sessionExpired: SESSION_EXPIRED_MESSAGES,
  drafts: DRAFT_MESSAGES,
  idle: IDLE_MESSAGES,
  person: PERSON_MESSAGES,
  contacts: CONTACT_MESSAGES,
  addresses: ADDRESS_MESSAGES,
  insurance: INSURANCE_MESSAGES,
  account: ACCOUNT_MESSAGES,
  mfa: MFA_MESSAGES,
  npi: NPI_MESSAGES,
  orgs: ORG_MESSAGES,
  places: PLACES_MESSAGES,
  disabled: DISABLED_MESSAGES,
} as const

type Catalog = typeof MESSAGE_CATALOG

/** A typed catalog reference, `"<group>.<key>"` (e.g. `"person.ssnTaken"`), for code that names copy without rendering it. */
export type MessageKey = { [G in keyof Catalog]: `${G & string}.${keyof Catalog[G] & string}` }[keyof Catalog]

/** The catalog string a `MessageKey` names. */
export function messageFor(key: MessageKey): string {
  const [group, name] = key.split(".") as [keyof Catalog, string]
  return (MESSAGE_CATALOG[group] as Readonly<Record<string, string>>)[name]
}

/** A Profile Section with its own load error ("Couldn't load {noun}"); `/account` uses the page copy. */
export type LoadNounSection = Exclude<SectionId, "account">

/** The plural noun each Profile Section's load error names (`STATE_MESSAGES.sectionLoadError`, F3-3). */
export const SECTION_LOAD_NOUNS: Readonly<Record<LoadNounSection, string>> = {
  personal: STATE_MESSAGES.loadNounPersonal,
  phone: STATE_MESSAGES.loadNounPhone,
  email: STATE_MESSAGES.loadNounEmail,
  social: STATE_MESSAGES.loadNounSocial,
  addresses: STATE_MESSAGES.loadNounAddresses,
  insurance: STATE_MESSAGES.loadNounInsurance,
}

/** Fills each `{Name}` placeholder of a catalog template; unknown names stay as written. */
export function formatMessage(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  )
}
