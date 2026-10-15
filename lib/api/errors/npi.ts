import type { MessageRule } from "./core"

/** The two Provider registration fields (Story 9.2): the personal and the practice NPI search. */
export type Field = "personalNpi" | "practiceNpi"

/**
 * Provider registration (Epic 9): `Messages.PERSONAL_NPI_IS_ALREADY_REGISTERED`
 * / `PRACTICE_NPI_IS_ALREADY_REGISTERED`, raised when another user registers
 * the NPI between the `is-registered` checks and `POST user/register/npi`
 * (Story 9.2 race). The captured "Personal"/"Practice" word picks the field,
 * so the error shows under its own search with the same copy as the
 * pre-check (spec F6-3).
 */
export const rules: readonly MessageRule<Field>[] = [
  {
    scopes: ["provider"],
    pattern: /^Operation failed\. The chosen Personal NPI Number: \d+ is already registered\.$/,
    result: { kind: "field", field: "personalNpi", messageKey: "npi.personalNpiTaken" },
  },
  {
    scopes: ["provider"],
    pattern: /^Operation failed\. The chosen Practice NPI Number: \d+ is already registered\.$/,
    result: { kind: "field", field: "practiceNpi", messageKey: "npi.practiceNpiTaken" },
  },
]
