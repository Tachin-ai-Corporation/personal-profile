import type { MessageRule } from "./core"

/** Fields of Addresses (Epic 4) the table can name (none yet). */
export type Field = never

/** Addresses (Epic 4): exact upstream messages, added by its stories. */
export const rules: readonly MessageRule<Field>[] = []
