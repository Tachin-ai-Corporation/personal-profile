import { ACCOUNT_LOCALE, updateAccount, setTimeZone, setLocale, mapApiError, type ApiResponse, type MappedError } from "@/lib/api"
import { runSaveSteps, type AccountSavePart, type SaveResult } from "@/features/shell"
import { ACCOUNT_MESSAGES } from "@/lib/shared/messages"
import { primarySelection, samePrimary, type PrimaryContactLists } from "./primary-contacts"
import { accountDetailsDiff, type AccountFormValues } from "./schema"

export interface AccountSaveOutcome {
  readonly part: AccountSavePart
  readonly mapped: MappedError
}
export interface AccountSaveOptions {
  readonly contacts?: PrimaryContactLists
  readonly rebase: (values: AccountFormValues) => void
  readonly refresh: () => Promise<unknown>
  readonly outcomes: (failures: readonly AccountSaveOutcome[]) => void
}

/** Capture every mapped outcome, while the shared runner owns order and expiry. */
export async function saveAccount(values: AccountFormValues, baseline: AccountFormValues, options: AccountSaveOptions): Promise<SaveResult> {
  const failures: AccountSaveOutcome[] = []
  options.outcomes([])
  const capture = (part: AccountSavePart, run: () => Promise<ApiResponse<unknown>>) => async () => {
    let response: ApiResponse<unknown>
    try { response = await run() } catch { response = { success: false } }
    if (!response.success) failures.push({ part, mapped: mapApiError("account", response) })
    return response
  }
  const details = { ...accountDetailsDiff(values, baseline) }
  for (const [field, kind, rows] of [["primaryEmail", "Email", options.contacts?.email], ["primaryPhone", "Mobile", options.contacts?.mobile]] as const) {
    if (samePrimary(kind, values[field], baseline[field])) continue
    const selected = primarySelection(kind, values[field], baseline[field], rows)
    if (!selected) {
      const mapped: MappedError = { kind: "generic", message: ACCOUNT_MESSAGES.primaryUnavailable }
      options.outcomes([{ part: "details", mapped }])
      return { ok: false, error: { mapped, failedParts: ["details"] } }
    }
    if (field === "primaryEmail") details.email = selected.value
    else { details.phoneNumber = selected.value; details.phoneNumberRegion = selected.region }
  }
  const result = await runSaveSteps<AccountSavePart>([
    { part: "details", skip: Object.keys(details).length === 0, run: capture("details", () => updateAccount(details)) },
    { part: "timeZone", skip: values.timeZone === baseline.timeZone, run: capture("timeZone", () => setTimeZone(values.timeZone)) },
    { part: "locale", skip: values.locale === baseline.locale, run: capture("locale", () => values.locale === ACCOUNT_LOCALE ? setLocale() : Promise.resolve({ success: false, statusCode: 400 })) },
  ], { scope: "account", mode: "attemptAll" })
  const next = { ...baseline }
  for (const part of result.succeeded) {
    if (part === "details") {
      for (const field of ["firstName", "lastName", "birthDate", "preferredLanguage"] as const) {
        if (details[field] !== undefined) next[field] = values[field].trim()
      }
      if (details.email !== undefined) next.primaryEmail = values.primaryEmail
      if (details.phoneNumber !== undefined) next.primaryPhone = values.primaryPhone
    } else next[part] = values[part]
  }
  // Acknowledgements, rather than an eventually consistent read, own the retry diff.
  if (result.succeeded.length) options.rebase(next)
  options.outcomes(failures)
  if (result.ok || result.error.code !== "SESSION_EXPIRED") {
    try { void options.refresh().catch(() => undefined) } catch { /* A refresh cannot undo an acknowledged write. */ }
  }
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}
