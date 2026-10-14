import type { MessageRule } from "./core"

/** Fields of Insurance (Epic 5) the table can name (none yet). */
export type Field = never

/** Insurance (Epic 5): exact upstream messages, added by its stories. */
export const rules: readonly MessageRule<Field>[] = []
