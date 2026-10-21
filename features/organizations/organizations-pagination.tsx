"use client"

import { Button } from "@/components/ui/button"
import { COMMON_MESSAGES, ORG_MESSAGES } from "@/lib/shared/messages"

/** First, current neighbors and last keep even very large server totals bounded. */
export function OrganizationsPagination({ page, totalPages, onPage }: {
  readonly page: number
  readonly totalPages: number
  readonly onPage: (page: number) => void
}) {
  const pages = [...new Set([0, page - 1, page, page + 1, totalPages - 1])]
    .filter((value) => value >= 0 && value < totalPages).sort((a, b) => a - b)
  return <nav aria-label={ORG_MESSAGES.paginationLabel} className="flex flex-wrap items-center justify-center gap-1">
    <Button type="button" variant="ghost" size="touch" aria-disabled={page === 0} onClick={() => onPage(page - 1)}>{COMMON_MESSAGES.previous}</Button>
    {pages.map((value, index) => <span key={value} className="contents">
      {index > 0 && value - pages[index - 1] > 1 ? <span aria-hidden="true" className="px-1 text-muted-foreground">…</span> : null}
      <Button type="button" variant={value === page ? "secondary" : "ghost"} size="touch" className="min-w-11 px-2" aria-current={value === page ? "page" : undefined} aria-disabled={value > 9999 || undefined} onClick={() => onPage(value)}>{value + 1}</Button>
    </span>)}
    <Button type="button" variant="ghost" size="touch" aria-disabled={page >= totalPages - 1 || page >= 9999} onClick={() => onPage(page + 1)}>{COMMON_MESSAGES.next}</Button>
  </nav>
}
