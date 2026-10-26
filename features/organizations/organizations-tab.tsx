"use client"

import { useEffect, useId, useRef } from "react"
import { ArrowUpRight, FlaskConical, HeartPulse, Plus, Search, Store, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { LiveStatus, useAnnounce } from "@/components/ui/live-status"
import { handoffHref, ORG_GRID_CLASSES, StateFrame, useMyself, useNavigate } from "@/features/shell"
import { ORG_MESSAGES, formatMessage } from "@/lib/shared/messages"
import { CHECKOUT_URL, isInternalEmail } from "@/lib/shared/profile-constants"
import { OrganizationCard } from "./organization-card"
import { EnterPortalButton } from "./enter-portal-button"
import { OrganizationsPagination } from "./organizations-pagination"
import { useOrganizations } from "./use-organizations"

function Registration({ internal, onRegister }: { readonly internal: boolean; readonly onRegister: () => void }) {
  const features = [
    { Icon: FlaskConical, label: ORG_MESSAGES.typeLab, description: ORG_MESSAGES.registrationLabDescription },
    { Icon: HeartPulse, label: ORG_MESSAGES.typeHealthcare, description: ORG_MESSAGES.registrationHealthcareDescription },
    { Icon: Truck, label: ORG_MESSAGES.typeSupplier, description: ORG_MESSAGES.registrationSupplierDescription },
    { Icon: Store, label: ORG_MESSAGES.typeGoToMarket, description: ORG_MESSAGES.registrationGoToMarketDescription },
  ]
  return <EmptyState variant="card" title={ORG_MESSAGES.emptyTitle} titleAs="h2" message={ORG_MESSAGES.emptyDescription}>
    <ul className="flex flex-col gap-4 py-2">
      {features.map(({ Icon, label, description }) => <li key={label} className="flex gap-3">
        <Icon aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
        <div><p className="font-semibold">{label}</p><p className="text-body-sm text-muted-foreground">{description}</p></div>
      </li>)}
    </ul>
    {internal ? <Button type="button" size="touch" onClick={onRegister}>{ORG_MESSAGES.register}</Button>
      : <Button asChild size="touch"><a href={CHECKOUT_URL} target="_blank" rel="noopener noreferrer" aria-label={ORG_MESSAGES.registerExternal}>{ORG_MESSAGES.register}<ArrowUpRight aria-hidden="true" /></a></Button>}
  </EmptyState>
}

export function OrganizationsTab() {
  const list = useOrganizations()
  const identity = useMyself()
  const internal = !identity.error && !identity.isLoading && isInternalEmail(identity.myself?.email)
  const navigate = useNavigate()
  const searchId = useId()
  const grid = useRef<HTMLDivElement>(null)
  const firstHeading = useRef<HTMLHeadingElement>(null)
  const noResults = useRef<HTMLParagraphElement>(null)
  const { message, announce, clear } = useAnnounce()
  const { state, data, query, pageFocus, clearPageFocus } = list
  useEffect(() => {
    if (state === "ready" && data) announce(data.totalElements === 1 ? ORG_MESSAGES.countOne : formatMessage(ORG_MESSAGES.countMany, { count: data.totalElements }))
    else clear()
  }, [state, data, query, announce, clear])
  useEffect(() => {
    if (!pageFocus) return
    grid.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
    const focusTarget = firstHeading.current ?? noResults.current
    focusTarget?.focus({ preventScroll: true })
    clearPageFocus()
  }, [pageFocus, clearPageFocus])
  const register = () => { void navigate({ external: "handoff", href: handoffHref({ to: "create-org" }) }) }
  const denied = typeof state === "object" && (state.error.kind === "forbidden" || state.error.kind === "session")
  const frame = <StateFrame state={state} skeleton="cards" loadError={{ kind: "page" }} level="tab" onRetry={list.retry} attempt={list.attempt}>
    {list.initialEmpty ? <Registration internal={internal} onRegister={register} />
      : <div className="space-y-4">
        <div ref={grid} className={ORG_GRID_CLASSES} data-slot="organizations-grid">
          {data?.items.length ? data.items.map((organization, index) => <OrganizationCard key={organization.tenantId} organization={organization} headingRef={index === 0 ? firstHeading : undefined} portalAction={<EnterPortalButton organization={organization} />} />)
            : <p ref={noResults} tabIndex={-1} className="col-span-full flex min-h-11 items-center text-body-sm text-muted-foreground outline-none focus-ring">{ORG_MESSAGES.noResults}</p>}
        </div>
        {/* Like 1health-fe, no pager under "no results"; a null-only page keeps it while another page exists. */}
        {data && data.totalElements > 0 && (data.items.length > 0 || data.totalPages > 1) ? <OrganizationsPagination page={query.page} totalPages={data.totalPages} pending={list.pendingSearch} onPage={list.setPage} /> : null}
      </div>}
  </StateFrame>
  if (denied) return frame
  return <div className="min-w-0 space-y-4">
    {list.showControls && !list.initialEmpty ? <div className="flex flex-col gap-3 md:flex-row">
      <div className="relative min-w-0 flex-1">
        <label className="sr-only" htmlFor={searchId}>{ORG_MESSAGES.searchLabel}</label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-3 left-3 size-5 text-muted-foreground" />
        <Input id={searchId} type="search" className="pl-10" maxLength={100} placeholder={ORG_MESSAGES.searchLabel} value={list.text} onChange={(event) => list.setText(event.target.value)} onCompositionStart={list.beginComposition} onCompositionEnd={(event) => list.endComposition(event.currentTarget.value)} />
      </div>
      {internal ? <Button type="button" variant="outline" size="touch" onClick={register}><Plus aria-hidden="true" />{ORG_MESSAGES.create}</Button> : null}
    </div> : null}
    <LiveStatus message={message} />
    {typeof state === "object" && state.error.kind === "generic" && state.error.message ? <p className="text-body-sm text-error-strong" role="status" key={list.attempt}>{state.error.message}</p> : null}
    {frame}
  </div>
}
