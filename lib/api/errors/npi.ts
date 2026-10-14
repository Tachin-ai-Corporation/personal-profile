import type { MessageRule } from "./core"

/** Provider registration names no field yet: the taken-NPI case is `coded`. */
export type Field = never

/** Provider registration (Epic 9): `Messages.PERSONAL_NPI_IS_ALREADY_REGISTERED` / `PRACTICE_NPI_IS_ALREADY_REGISTERED`. */
export const rules: readonly MessageRule<Field>[] = [
  {
    scopes: ["provider"],
    pattern: /^Operation failed\. The chosen (Personal|Practice) NPI Number: \d+ is already registered\.$/,
    result: { kind: "coded", code: "NPI_ALREADY_REGISTERED" },
  },
]
