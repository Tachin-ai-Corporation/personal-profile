import { KeyValueTable, SectionContainer } from "@/features/shell"
import { NPI_MESSAGES } from "@/lib/shared/messages"

/** Story 9.1's minimal registered body; expanded by Story 9.3. */
export function RegisteredView({ npi }: { readonly npi: string }) {
  return <SectionContainer editing={false}><KeyValueTable labelledBy="provider-heading" rows={[{ key: "npi", label: NPI_MESSAGES.npi, value: <span className="mono-value">{npi}</span> }]} /></SectionContainer>
}
