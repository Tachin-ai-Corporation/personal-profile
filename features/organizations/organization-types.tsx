"use client"

import { Building2, CircleHelp, Factory, FlaskConical, HeartPulse, Landmark, Package, Store, Truck, Umbrella, Users, type LucideIcon } from "lucide-react"
import { OverflowChip } from "@/components/ui/chip"
import { Tooltip } from "@/components/ui/tooltip"
import { formatMessage, ORG_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"

const TYPE_ICONS: Record<string, LucideIcon> = {
  Lab: FlaskConical, "Health Provider": HeartPulse, Healthcare: HeartPulse,
  Supplier: Truck, "Go To Market": Store, "Population Health": Users,
  Insurance: Umbrella, Carrier: Package, Manufacturer: Factory,
  Enterprise: Building2, "Government Agency": Landmark, "n/a": CircleHelp,
}
const PRIORITY = ["Lab", "Health Provider", "Supplier", "Go To Market"]

export function OrganizationTypes({ types }: { readonly types: readonly string[] }) {
  const labels: Readonly<Record<string, string>> = {
    Lab: ORG_MESSAGES.typeLab, "Health Provider": ORG_MESSAGES.typeHealthcare, Healthcare: ORG_MESSAGES.typeHealthcare,
    Supplier: ORG_MESSAGES.typeSupplier, "Go To Market": ORG_MESSAGES.typeGoToMarket,
    "Population Health": ORG_MESSAGES.typePopulationHealth, Insurance: SHELL_MESSAGES.profileTabInsurance,
    Carrier: ORG_MESSAGES.typeCarrier, Manufacturer: ORG_MESSAGES.typeManufacturer,
    Enterprise: ORG_MESSAGES.typeEnterprise, "Government Agency": ORG_MESSAGES.typeGovernmentAgency,
    "n/a": ORG_MESSAGES.typeNone,
  }
  const unique = new Map<string, { label: string; Icon: LucideIcon; rank: number }>()
  for (const value of types.length ? types : ["n/a"]) {
    const type = value.trim() || "n/a"
    const label = Object.hasOwn(labels, type) ? labels[type] : type
    const index = PRIORITY.indexOf(type)
    const rank = index < 0 ? PRIORITY.length : index
    const existing = unique.get(label)
    if (!existing) unique.set(label, { label, Icon: Object.hasOwn(TYPE_ICONS, type) ? TYPE_ICONS[type] : CircleHelp, rank })
    else existing.rank = Math.min(existing.rank, rank)
  }
  const sorted = [...unique.values()].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
  const hidden = sorted.slice(4).map(({ label }) => label).sort((a, b) => a.localeCompare(b))
  const overflow = formatMessage(hidden.length === 1 ? ORG_MESSAGES.moreType : ORG_MESSAGES.moreTypes, { count: hidden.length, types: hidden.join(", ") })
  return (
    <div role="group" aria-label={ORG_MESSAGES.typesLabel} className="flex min-w-0 flex-wrap items-center">
      {sorted.slice(0, 4).map(({ label, Icon }) => (
        <Tooltip key={label} content={label} wide>
          <button type="button" aria-label={label} className="focus-ring text-muted-foreground hover:bg-muted inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none">
            <Icon aria-hidden="true" className="size-5" />
          </button>
        </Tooltip>
      ))}
      {hidden.length > 0 && <Tooltip content={overflow} wide><OverflowChip count={hidden.length} aria-label={overflow} /></Tooltip>}
    </div>
  )
}
